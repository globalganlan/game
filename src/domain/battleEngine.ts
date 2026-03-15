/**
 * battleEngine ???�鬥引�??��?
 *
 * 純�?輯�??��?不�??�任�?React / Three.js 依賴??
 * ?�出 BattleAction ?�令序�?，由表現層�?App.tsx）�?費並?�放 3D 演出??
 *
 * 對�?�?
 * - .ai/specs/core-combat.md v2.0
 * - .ai/specs/damage-formula.md v0.1
 * - .ai/specs/skill-system.md v0.2
 */

import type {
  BattleHero,
  BattleAction,
  BattleContext,
  FinalStats,
  SkillTemplate,
  SkillEffect,
  DamageResult,
  HealResult,
  StatusType,
} from './types'
import { calculateDamage, calculateHeal } from './damageFormula'
import { getFinalStats, type HeroInstanceData, type BaseStats } from './progressionSystem'
import { createSeededRng } from './seededRng'
import {
  getBuffedStats,
  isControlled,
  isFeared,
  isSilenced as _isSilenced,
  processDotEffects,
  processRegen,
  tickStatusDurations,
  tickShieldDurations,
  applyStatus,
  applyStatusV2,
  hasStatus as _hasStatus,
  cleanse,
  dispelBuff,
  stealBuff,
  transferDebuff,
  isDebuff,
  absorbDamageByShields,
} from './buffSystem'
import {
  turnStartEnergy,
  onAttackEnergy,
  onBeAttackedEnergy,
  onKillEnergy,
  canCastUltimate,
  consumeEnergy,
  addEnergy,
} from './energySystem'
import { selectTargets, selectNormalAttackTarget } from './targetStrategy'

/* ════════════════════════════════════
   v2.0 modify_target: 目標變更解析
   ════════════════════════════════════ */

/**
 * 檢查英雄是否有 modify_target 目標變更修飾。
 * 若有，回傳覆寫後的目標類型；否則回傳 null。
 */
function resolveModifiedTarget(
  hero: BattleHero,
  isSkill: boolean,
): { targetOverride: string; multiplier?: number } | null {
  for (const mod of hero.targetModifiers) {
    if (mod.applyTo === 'both'
      || (mod.applyTo === 'normal' && !isSkill)
      || (mod.applyTo === 'active' && isSkill)) {
      return { targetOverride: mod.targetOverride, multiplier: mod.multiplier }
    }
  }
  return null
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   中斷大�?（能?�滿?�放�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

/**
 * 檢查?�?��?活英?��??��?滿就立即?�放大�?（中?��?）�?
 * ?�迴?�到?�人?�中?��??��??��??��??��?
 */
async function processInterruptUltimates(
  players: BattleHero[],
  enemies: BattleHero[],
  turn: number,
  allHeroes: BattleHero[],
  cfg: BattleEngineConfig,
  alreadyActedUids: Set<string>, // ?�輪已施?��?大�??��??��??��?一輪�?複施?��?
): Promise<boolean> {
  const MAX_INTERRUPTS = 20 // 安全上�?
  let count = 0
  let anyFired = false
  let found = true
  while (found && count < MAX_INTERRUPTS) {
    found = false
    const candidates = allHeroes
      .filter(h => h.currentHP > 0 && canCastUltimate(h) && !alreadyActedUids.has(h.uid))
      .sort((a, b) => {
        const spdA = getBuffedStats(a).SPD
        const spdB = getBuffedStats(b).SPD
        if (spdB !== spdA) return spdB - spdA
        return a.side === 'player' ? -1 : 1
      })
    for (const hero of candidates) {
      if (hero.currentHP <= 0 || !canCastUltimate(hero)) continue
      const allies = hero.side === 'player' ? players : enemies
      const foes = hero.side === 'player' ? enemies : players
      await executeSkill(hero, hero.activeSkill!, allies, foes, turn, allHeroes, cfg)
      alreadyActedUids.add(hero.uid) // 標�?已施?��?大�?，防止�?一輪�?複施??
      found = true
      anyFired = true
      count++
      // ?�鬥結�?�?
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return true
      break // ?�新?��?（�??�大?�可?�改變其他人?��?�?
    }
  }
  return anyFired
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   額�?行�?（extra_turn�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

/**
 * ?��?額�?行�?佇�???
 * 被�?觸發 extra_turn ?��???hero UID ?�入 cfg._extraTurnQueue�?
 * 此函式�?佇�?中�??�並讓�??�英?��?行�?一次�??�攻 or 大�?）�?
 *
 * ?�制�?
 * - 每�??��?位英?��?�?1 次�?外�??��?extraTurnUsed 追蹤�?
 * - 額�?行�?中�??�殺不�?觸發第�?次�?外�??��??�無?��??�?
 * - 額�?行�?跳�? DOT/Regen/turn_start 等�??��?始�?�?
 */
async function processExtraTurns(
  cfg: BattleEngineConfig,
  extraTurnUsed: Set<string>,
  players: BattleHero[],
  enemies: BattleHero[],
  turn: number,
  allHeroes: BattleHero[],
): Promise<void> {
  const MAX_EXTRA = 10 // 安全上�?，防?��??�無?�迴??
  let processed = 0

  while (cfg._extraTurnQueue && cfg._extraTurnQueue.length > 0 && processed < MAX_EXTRA) {
    const uid = cfg._extraTurnQueue.shift()!
    processed++

    // 每�??�只?�許一次�?外�???
    if (extraTurnUsed.has(uid)) continue

    const hero = allHeroes.find(h => h.uid === uid)
    if (!hero || hero.currentHP <= 0) continue

    // 標�??�已使用（防止�?外�??�中?�次觸發�?
    extraTurnUsed.add(uid)

    const allies = hero.side === 'player' ? players : enemies
    const foes = hero.side === 'player' ? enemies : players

    // ?�知表現層�?額�?行�??��?
    await cfg.onAction({ type: 'EXTRA_TURN', heroUid: uid, reason: 'extra_turn' })

    // ??額�?行�??��??��??��?滿�??��??�大??
    const preExtraInterrupt = new Set<string>()
    await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, preExtraInterrupt)
    if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return
    if (hero.currentHP <= 0) continue

    // ?�制?��?仍然?��?
    if (isControlled(hero) || isFeared(hero)) continue

    // ??額�?行�?：�?律普??
    await executeNormalAttack(hero, allies, foes, turn, allHeroes, cfg)

    // 中斷大�?（�?外�??�可?�觸?�能?�溢?��?
    const interruptActed = new Set<string>()
    await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, interruptActed)

    if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return
  }
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   引�??�置
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

export interface BattleEngineConfig {
  maxTurns: number          // ?�大�??�數（防?��?迴�?�?
  onAction: (action: BattleAction) => void | Promise<void>  // 行�??�調（表?�層消費�?
  /** @internal 額�?行�?佇�?（�??�內?�使?��?外部不�?設�?�?*/
  _extraTurnQueue?: string[]
}

const DEFAULT_CONFIG: BattleEngineConfig = {
  maxTurns: 50,
  onAction: () => {},
  _extraTurnQueue: [],
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   引�?主入??
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

/**
 * ?��?一?��??�戰�?
 *
 * @param players - ?�家?��??��?已�?始�? BattleHero�?
 * @param enemies - ?�方角色（已?��???BattleHero�?
 * @param config  - 引�??�置
 * @returns ?�利??
 */
export async function runBattle(
  players: BattleHero[],
  enemies: BattleHero[],
  config: Partial<BattleEngineConfig> = {},
): Promise<'player' | 'enemy' | 'draw'> {
  const cfg = { ...DEFAULT_CONFIG, ...config, _extraTurnQueue: [] as string[] }
  const allHeroes = [...players, ...enemies]

  // ?�?� ?�鬥?��?：觸??battle_start + always 被�? ?�?�
  for (const hero of allHeroes) {
    if (hero.currentHP <= 0) continue
    triggerPassives(hero, 'always', makeContext(0, hero, allHeroes), cfg)
    triggerPassives(hero, 'battle_start', makeContext(0, hero, allHeroes), cfg)
  }

  // ?�?� ?��?迴�? ?�?�
  for (let turn = 1; turn <= cfg.maxTurns; turn++) {
    await cfg.onAction({ type: 'TURN_START', turn })

    // ?��?存活角色
    const alivePlayers = players.filter(p => p.currentHP > 0)
    const aliveEnemies = enemies.filter(e => e.currentHP > 0)
    if (alivePlayers.length === 0 || aliveEnemies.length === 0) break

    // ?�度?��?：SPD DESC ??slot ASC ???�家?��?
    const actors = [...alivePlayers, ...aliveEnemies]
    actors.sort((a, b) => {
      const spdA = getBuffedStats(a).SPD
      const spdB = getBuffedStats(b).SPD
      if (spdB !== spdA) return spdB - spdA
      if (a.slot !== b.slot) return a.slot - b.slot
      return a.side === 'player' ? -1 : 1
    })

    // ?�?� 每個�??��????�?�
    const extraTurnUsed = new Set<string>() // 每�??��?人�?�?1 次�?外�???
    for (const actor of actors) {
      if (actor.currentHP <= 0) continue

      const allies = actor.side === 'player' ? players : enemies
      const foes = actor.side === 'player' ? enemies : players

      // ?��??��??��?
      const energyDelta = turnStartEnergy(actor)
      if (energyDelta > 0) {
        await cfg.onAction({ type: 'ENERGY_CHANGE', heroUid: actor.uid, delta: energyDelta, newValue: actor.energy })
      }

      // DOT 結�?
      const dotResults = processDotEffects(actor, allHeroes)
      for (const dot of dotResults) {
        await cfg.onAction({ type: 'DOT_TICK', targetUid: actor.uid, dotType: dot.type, damage: dot.damage, sourceUid: dot.sourceUid })
      }
      if (actor.currentHP <= 0) {
        await cfg.onAction({ type: 'DEATH', targetUid: actor.uid })
        continue
      }

      // Regen 結�?
      processRegen(actor)

      // 觸發?��??��??��??�被??
      triggerPassives(actor, 'turn_start', makeContext(turn, actor, allHeroes), cfg)

      // 觸發?��? N ?��??�被??
      for (const passive of actor.activePassives) {
        if (passive.passiveTrigger !== 'every_n_turns') continue
        const n = passive.description.includes('�?2') || passive.description.includes('�?') ? 2 : 3
        if (turn % n === 0) {
          let anyApplied = false
          for (const eff of passive.effects) {
            if (executePassiveEffect(actor, eff, makeContext(turn, actor, allHeroes), cfg)) anyApplied = true
          }
          if (anyApplied) {
            cfg.onAction({ type: 'PASSIVE_TRIGGER', heroUid: actor.uid, skillId: passive.skillId, skillName: passive.name })
          }
        }
      }

      // ??行�??��??��??�?�能?�滿?�英?�施?�大?��??�含?�己�?
      const preActInterrupt = new Set<string>()
      await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, preActInterrupt)
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break
      if (actor.currentHP <= 0) continue

      // ?�制?��??��?
      if (isControlled(actor)) {
        // 被�????��?，跳?��???
        continue
      }
      if (isFeared(actor)) {
        // 被�??��?跳�?行�?
        continue
      }

      // ??行�?：�?律普?��?大�??�中?��??�統一?��?�?
      await executeNormalAttack(actor, allies, foes, turn, allHeroes, cfg)

      // ??行�?後�??�檢?�是?��??��??��?滿�?（普?��??��??�能觸發�?
      const interruptActed = new Set<string>()
      await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, interruptActed)
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break

      // ?�?� 額�?行�??��? ?�?�
      await processExtraTurns(cfg, extraTurnUsed, players, enemies, turn, allHeroes)
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break

      // 清�?已死亡�??��?行�??��?（�?保�??�陣?�中給表?�層?�放死亡?�畫�?
    }

    // ?�?� ?��?結�?：buff duration ?�數 ?�?�
    for (const hero of allHeroes) {
      if (hero.currentHP <= 0) continue
      const expired = tickStatusDurations(hero)
      for (const t of expired) {
        await cfg.onAction({ type: 'BUFF_EXPIRE', targetUid: hero.uid, effectType: t })
      }
      tickShieldDurations(hero)

      // 觸發?��??��??�」被??
      triggerPassives(hero, 'turn_end', makeContext(turn, hero, allHeroes), cfg)
    }

    await cfg.onAction({ type: 'TURN_END', turn })

    // ?��??��?
    if (players.every(p => p.currentHP <= 0)) {
      await cfg.onAction({ type: 'BATTLE_END', winner: 'enemy' })
      return 'enemy'
    }
    if (enemies.every(e => e.currentHP <= 0)) {
      await cfg.onAction({ type: 'BATTLE_END', winner: 'player' })
      return 'player'
    }
  }

  // 迴�?結�?後�??��?次�?負判定�??��? break 跳出?��?況�?
  if (players.every(p => p.currentHP <= 0)) {
    await cfg.onAction({ type: 'BATTLE_END', winner: 'enemy' })
    return 'enemy'
  }
  if (enemies.every(e => e.currentHP <= 0)) {
    await cfg.onAction({ type: 'BATTLE_END', winner: 'player' })
    return 'player'
  }

  // 超�? ??平�?（�???HP 比�??��?，�?簡�???draw�?
  await cfg.onAction({ type: 'BATTLE_END', winner: 'draw' })
  return 'draw'
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   ?�步?��?模�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

export interface BattleResult {
  winner: 'player' | 'enemy' | 'draw'
  actions: BattleAction[]
}

/**
 * ?�步（�?步�? await）�?完整?�戰鬥�??��??�??BattleAction??
 * 不�?要表?�層?�調，幾 ms ?��??��?
 * ?�端?�拿??actions 後�?決�??�播?��??�」�??�跳?�直?��?算」�?
 *
 * @param config.seed - ?�選?�確定性種子。�?供�?將以 seeded PRNG ?�代 Math.random�?
 *                      �?GAS 端以?��?種�??�現一模�?�???�鬥結�?（�?作�??��??��???
 */
export async function runBattleCollect(
  players: BattleHero[],
  enemies: BattleHero[],
  config: Partial<Pick<BattleEngineConfig, 'maxTurns'>> & { seed?: number } = {},
): Promise<BattleResult> {
  const actions: BattleAction[] = []

  // ?�?� 種�?�?PRNG：暫?��???Math.random ?�?�
  const origRandom = Math.random
  if (config.seed != null) {
    Math.random = createSeededRng(config.seed)
  }

  try {
    const winner = await runBattle(players, enemies, {
      maxTurns: config.maxTurns ?? 50,
      onAction: (action) => { actions.push(action) },
    })
    return { winner, actions }
  } finally {
    // ???��??��??�失?��??��??��???Math.random
    Math.random = origRandom
  }
}

async function executeNormalAttack(
  attacker: BattleHero,
  allies: BattleHero[],
  enemies: BattleHero[],
  turn: number,
  allHeroes: BattleHero[],
  cfg: BattleEngineConfig,
): Promise<void> {
  // v2.0: modify_target 目標變更
  const modTarget = resolveModifiedTarget(attacker, false)
  if (modTarget) {
    // 目標被修改為多目標類型，改用 selectTargets
    const targets = selectTargets(modTarget.targetOverride, attacker, allies, enemies)
    if (targets.length === 0) return
    const damageMult = modTarget.multiplier ?? 1.0

    const ctx = makeContext(turn, attacker, allHeroes, targets[0])
    triggerPassives(attacker, 'on_attack', ctx, cfg)
    triggerPassives(attacker, 'on_normal_attack', ctx, cfg)

    for (const target of targets) {
      if (target.currentHP <= 0) continue
      const result = calculateDamage(attacker, target)
      if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
        result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult))
      }
      // 套用 modify_target 傷害修正
      if (damageMult !== 1.0 && !result.isDodge) {
        result.damage = Math.max(1, Math.floor(result.damage * damageMult))
      }
      let killed = false
      if (!result.isDodge) {
        const hpBefore = target.currentHP
        const saved = checkLethalPassive(target, result.damage, allHeroes)
        if (saved) {
          attacker.totalDamageDealt += Math.max(0, hpBefore - target.currentHP)
        } else {
          target.currentHP = Math.max(0, target.currentHP - result.damage)
          attacker.totalDamageDealt += result.damage
          killed = target.currentHP <= 0
        }
        if (result.reflectDamage > 0) {
          attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage)
        }
      }
      await cfg.onAction({
        type: 'NORMAL_ATTACK',
        attackerUid: attacker.uid,
        targetUid: target.uid,
        result,
        killed,
      })
      if (!result.isDodge) {
        if (!killed) {
          triggerPassives(target, 'on_be_attacked', makeContext(turn, attacker, allHeroes, target), cfg)
          triggerPassives(target, 'on_take_damage', makeContext(turn, attacker, allHeroes, target), cfg)
          const attackedSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
          for (const ally of attackedSideAllies) {
            const allyCtx = makeContext(turn, ally, allHeroes, target)
            allyCtx._originalAttacker = attacker
            triggerPassives(ally, 'on_ally_attacked', allyCtx, cfg)
          }
        }
        if (result.isCrit) {
          triggerPassives(attacker, 'on_crit', makeContext(turn, attacker, allHeroes, target), cfg)
        }
        if (killed) {
          attacker.killCount++
          triggerPassives(attacker, 'on_kill', makeContext(turn, attacker, allHeroes, target, true), cfg)
          const deadSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
          for (const ally of deadSideAllies) {
            triggerPassives(ally, 'on_ally_death', makeContext(turn, ally, allHeroes, target), cfg)
          }
        }
      } else {
        triggerPassives(target, 'on_dodge', makeContext(turn, target, allHeroes, attacker), cfg)
      }
      checkHpBelowPassives(attacker, turn, allHeroes, cfg)
      checkHpBelowPassives(target, turn, allHeroes, cfg)
    }
    return
  }

  const target = selectNormalAttackTarget(attacker, enemies)
  if (!target) return

  // 觸發?�攻?��??�被??
  const ctx = makeContext(turn, attacker, allHeroes, target)
  triggerPassives(attacker, 'on_attack', ctx, cfg)
  triggerPassives(attacker, 'on_normal_attack', ctx, cfg)  // v2.0: ?�普?�觸??

  // 計�??�害
  const result = calculateDamage(attacker, target)

  // 套用 on_attack 被�??�害?��?（damage_mult / damage_mult_random�?
  if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
    result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult))
  }

  // 套用?�害（�?套用?�通知表現層�?確�? killed flag �?���?
  let killed = false
  if (!result.isDodge) {
    // v2.0: ?�死?�檢?��??�被?��?revive/heal�?
    const hpBefore = target.currentHP
    const saved = checkLethalPassive(target, result.damage, allHeroes)
    if (saved) {
      // checkLethalPassive 已設�?target.currentHP ??統�?實�?????�而�??��??�害
      attacker.totalDamageDealt += Math.max(0, hpBefore - target.currentHP)
      killed = false
    } else {
      target.currentHP = Math.max(0, target.currentHP - result.damage)
      attacker.totalDamageDealt += result.damage
      killed = target.currentHP <= 0
    }

    // ?��??�害
    if (result.reflectDamage > 0) {
      attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage)
    }
  }

  // ?��?計�??��?變�?（�?表現層可?�正確�??�畫?��?套用�?
  let _atkEnergyNew: number | undefined
  let _tgtEnergyNew: number | undefined
  if (!result.isDodge) {
    const atkEDelta = onAttackEnergy(attacker)
    if (atkEDelta > 0) _atkEnergyNew = attacker.energy

    if (!killed) {
      const defEDelta = onBeAttackedEnergy(target)
      if (defEDelta > 0) _tgtEnergyNew = target.energy
    }

    if (killed) {
      attacker.killCount++
      const killEDelta = onKillEnergy(attacker)
      if (killEDelta > 0 || _atkEnergyNew != null) _atkEnergyNew = attacker.energy
    }
  }

  // ?�送�??��???killed flag + ?��?快照，表?�層一次�??��?
  await cfg.onAction({
    type: 'NORMAL_ATTACK',
    attackerUid: attacker.uid,
    targetUid: target.uid,
    result,
    killed,
    _atkEnergyNew,
    _tgtEnergyNew,
  })

  // 被�?觸發（能?�已?��??��?算�?不�??��?ENERGY_CHANGE�?
  if (!result.isDodge) {
    if (!killed) {
      triggerPassives(target, 'on_be_attacked', makeContext(turn, attacker, allHeroes, target), cfg)
      triggerPassives(target, 'on_take_damage', makeContext(turn, attacker, allHeroes, target), cfg)
      // v2.0: 觸發被攻?�者�??��? on_ally_attacked 被�?
      const attackedSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
      for (const ally of attackedSideAllies) {
        const allyCtx = makeContext(turn, ally, allHeroes, target)
        allyCtx._originalAttacker = attacker // 追�??��? = ?��??��??�敵�?
        triggerPassives(ally, 'on_ally_attacked', allyCtx, cfg)
      }
    }

    if (result.isCrit) {
      triggerPassives(attacker, 'on_crit', makeContext(turn, attacker, allHeroes, target), cfg)
    }

    if (killed) {
      triggerPassives(attacker, 'on_kill', makeContext(turn, attacker, allHeroes, target, true), cfg)
      // 觸發死者�??��? on_ally_death 被�?
      const deadSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
      for (const ally of deadSideAllies) {
        triggerPassives(ally, 'on_ally_death', makeContext(turn, ally, allHeroes, target), cfg)
      }
    }
  } else {
    // on_dodge: 觸發?�避?�被?��?context.target 設為?��??��??��??��?�?
    triggerPassives(target, 'on_dodge', makeContext(turn, target, allHeroes, attacker), cfg)
  }

  // HP 低於?�值被?�檢??
  checkHpBelowPassives(attacker, turn, allHeroes, cfg)
  checkHpBelowPassives(target, turn, allHeroes, cfg)
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   ?�?�執�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

async function executeSkill(
  attacker: BattleHero,
  skill: SkillTemplate,
  allies: BattleHero[],
  enemies: BattleHero[],
  turn: number,
  allHeroes: BattleHero[],
  cfg: BattleEngineConfig,
): Promise<void> {
  // v2.0: modify_target 目標變更（大招用）
  const modTarget = resolveModifiedTarget(attacker, true)
  const resolvedTargetType = modTarget ? modTarget.targetOverride : skill.target
  const modMultiplier = modTarget?.multiplier ?? 1.0

  const targets = selectTargets(resolvedTargetType, attacker, allies, enemies)
  if (targets.length === 0) return

  // 觸發?�攻?��??�被??
  const ctx = makeContext(turn, attacker, allHeroes, targets[0])
  triggerPassives(attacker, 'on_attack', ctx, cfg)
  triggerPassives(attacker, 'on_skill_cast', ctx, cfg)  // v2.0: ?�施?�大?�觸??

  const skillResults: Array<{ uid: string; result: DamageResult | HealResult; killed?: boolean }> = []
  const killedUids: string[] = []
  const _tgtEnergyMap: Record<string, number> = {}

  // v2.0: dependsOn — 追蹤每個效果是否成功（用於依賴鏈）
  const effectSuccess = new Map<number, boolean>()

  for (let effectIdx = 0; effectIdx < skill.effects.length; effectIdx++) {
    const effect = skill.effects[effectIdx]

    // v2.0: 檢查前置效果依賴
    if (effect.dependsOn != null) {
      const depIdx = parseInt(effect.dependsOn, 10)
      if (!isNaN(depIdx) && effectSuccess.get(depIdx) === false) {
        effectSuccess.set(effectIdx, false)
        continue  // 前置效果未命中，跳過此效果
      }
    }

    let anyHit = false
    for (const target of targets) {
      if (target.currentHP <= 0 && effect.type === 'damage') continue

      // v2.0: 非 damage 類效果預設視為命中（不存在閃避機制）
      if (effect.type !== 'damage') anyHit = true

      switch (effect.type) {
        case 'damage': {
          const result = calculateDamage(attacker, target, effect)
          // 套用 on_attack 被動傷害倍率
          if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
            result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult))
          }
          // v2.0: 套用 modify_target 傷害修正
          if (modMultiplier !== 1.0 && !result.isDodge) {
            result.damage = Math.max(1, Math.floor(result.damage * modMultiplier))
          }
          let killed = false

          if (!result.isDodge) {
            anyHit = true  // v2.0: 標記命中（供 dependsOn 判斷）
            // v2.0: ?�死?�檢?��??�被?��?revive/heal�?
            const skillHpBefore = target.currentHP
            const saved = checkLethalPassive(target, result.damage, allHeroes)
            if (saved) {
              attacker.totalDamageDealt += Math.max(0, skillHpBefore - target.currentHP)
              killed = false
            } else {
              target.currentHP = Math.max(0, target.currentHP - result.damage)
              attacker.totalDamageDealt += result.damage
              killed = target.currentHP <= 0
            }

            if (result.reflectDamage > 0) {
              attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage)
            }

            if (!killed) {
              const defEDelta = onBeAttackedEnergy(target)
              if (defEDelta > 0) _tgtEnergyMap[target.uid] = target.energy
              triggerPassives(target, 'on_be_attacked', makeContext(turn, attacker, allHeroes, target), cfg)
              triggerPassives(target, 'on_take_damage', makeContext(turn, attacker, allHeroes, target), cfg)
              // v2.0: 觸發被攻?�者�??��? on_ally_attacked 被�?
              const attackedSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
              for (const ally of attackedSideAllies) {
                const allyCtx = makeContext(turn, ally, allHeroes, target)
                allyCtx._originalAttacker = attacker // 追�??��? = ?��??��??�敵�?
                triggerPassives(ally, 'on_ally_attacked', allyCtx, cfg)
              }
            }

            if (killed) {
              killedUids.push(target.uid)
              attacker.killCount++
              onKillEnergy(attacker)
              triggerPassives(attacker, 'on_kill', makeContext(turn, attacker, allHeroes, target, true), cfg)
              // 觸發死者�??��? on_ally_death 被�?
              const deadSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
              for (const ally of deadSideAllies) {
                triggerPassives(ally, 'on_ally_death', makeContext(turn, ally, allHeroes, target), cfg)
              }
            }

            if (result.isCrit) {
              triggerPassives(attacker, 'on_crit', makeContext(turn, attacker, allHeroes, target), cfg)
            }
          } else {
            // on_dodge: 觸發?�避?�被?��?context.target 設為?��??��??��??��?�?
            triggerPassives(target, 'on_dodge', makeContext(turn, target, allHeroes, attacker), cfg)
          }

          skillResults.push({ uid: target.uid, result, killed })
          break
        }

        case 'heal': {
          const result = calculateHeal(attacker, target, effect)
          target.currentHP = Math.min(target.maxHP, target.currentHP + result.heal)
          attacker.totalHealingDone += result.heal
          skillResults.push({ uid: target.uid, result })
          break
        }

        case 'buff':
        case 'debuff': {
          const chance = effect.statusChance ?? 1.0
          if (Math.random() < chance && effect.status) {
            const success = applyStatus(target, {
              type: effect.status,
              value: effect.statusValue ?? 0,
              duration: effect.statusDuration ?? 2,
              maxStacks: effect.statusMaxStacks ?? 1,
              sourceHeroId: attacker.uid,
            })
            if (success) {
              await cfg.onAction({
                type: 'BUFF_APPLY',
                targetUid: target.uid,
                effect: {
                  type: effect.status,
                  value: effect.statusValue ?? 0,
                  duration: effect.statusDuration ?? 2,
                  stacks: 1,
                  maxStacks: effect.statusMaxStacks ?? 1,
                  sourceHeroId: attacker.uid,
                },
              })
            }
          }
          break
        }

        case 'energy': {
          const amount = effect.flatValue ?? 0
          if (amount < 0) {
            // v2.0: 負�?= ?��??��?（吸走目標能?�給?�己�?
            const drained = Math.min(target.energy, Math.abs(amount))
            addEnergy(target, -drained)
            addEnergy(attacker, drained)
          } else {
            addEnergy(target, amount)
          }
          break
        }

        case 'revive': {
          // 復活?�輯??on_lethal 被�??��?
          break
        }

        case 'dispel_debuff': {
          cleanse(target, effect.flatValue ?? 1, effect.status)
          break
        }

        // v2.0 ?��??��???
        case 'dispel_buff': {
          dispelBuff(target, Math.max(1, effect.flatValue ?? 1), effect.status)
          break
        }

        case 'steal_buff': {
          const stolenType = stealBuff(attacker, target)
          if (stolenType) {
            cfg.onAction({
              type: 'STEAL_BUFF',
              heroUid: attacker.uid,
              targetUid: target.uid,
              buffType: stolenType,
            })
          }
          break
        }

        case 'transfer_debuff': {
          const transferredType = transferDebuff(attacker, target)
          if (transferredType) {
            cfg.onAction({
              type: 'TRANSFER_DEBUFF',
              heroUid: attacker.uid,
              targetUid: target.uid,
              debuffType: transferredType,
            })
          }
          break
        }

        case 'execute': {
          const threshold = effect.targetHpThreshold ?? 0.15
          const tHpPct = target.currentHP / target.maxHP
          if (tHpPct < threshold && !_hasStatus(target, 'immunity')) {
            // §8.5: ?�殺?�檢??on_lethal 被�?（�?復活/保命�?
            const saved = checkLethalPassive(target, target.currentHP, allHeroes)
            if (saved) break
            target.currentHP = 0
            attacker.killCount++
            killedUids.push(target.uid)
            cfg.onAction({
              type: 'EXECUTE',
              attackerUid: attacker.uid,
              targetUid: target.uid,
            })
            cfg.onAction({ type: 'DEATH', targetUid: target.uid })
          }
          break
        }

        case 'shield': {
          const shieldValue = Math.floor(
            (target.maxHP * (effect.multiplier ?? 0.2)) + (effect.flatValue ?? 0)
          )
          target.shields.push({
            value: shieldValue,
            duration: effect.statusDuration ?? 2,
            sourceHeroId: attacker.uid,
          })
          cfg.onAction({
            type: 'SHIELD_APPLY',
            heroUid: attacker.uid,
            targetUid: target.uid,
            value: shieldValue,
          })
          break
        }

        case 'cc':
        case 'dot': {
          const chance = effect.statusChance ?? 1.0
          if (Math.random() < chance && effect.status) {
            const success = applyStatus(target, {
              type: effect.status,
              value: effect.statusValue ?? 0,
              duration: effect.statusDuration ?? 2,
              maxStacks: effect.statusMaxStacks ?? 1,
              sourceHeroId: attacker.uid,
            })
            if (success) {
              await cfg.onAction({
                type: 'BUFF_APPLY',
                targetUid: target.uid,
                effect: {
                  type: effect.status,
                  value: effect.statusValue ?? 0,
                  duration: effect.statusDuration ?? 2,
                  stacks: 1,
                  maxStacks: effect.statusMaxStacks ?? 1,
                  sourceHeroId: attacker.uid,
                },
              })
            }
          }
          break
        }

        default:
          break
      }
    }
    // v2.0: 記錄此效果是否命中（供 dependsOn 判斷）
    effectSuccess.set(effectIdx, anyHit)
  }

  // ?�?�能?��??��?大�??�放 ???��?歸零�?
  consumeEnergy(attacker)

  // ?�送�??��??��??��??�目標�? killed ?��? + ?��?快照�?
  await cfg.onAction({
    type: 'SKILL_CAST',
    attackerUid: attacker.uid,
    skillId: skill.skillId,
    skillName: skill.name,
    targets: skillResults,
    _atkEnergyNew: attacker.energy,
    _tgtEnergyMap: Object.keys(_tgtEnergyMap).length > 0 ? _tgtEnergyMap : undefined,
  })

  // 觸發?��???on_ally_skill 被�?（施?�者自己�?觸發�?
  // 追�??��? = ?�?�命中�?第�??��?活敵�?
  const firstEnemyTarget = targets.find(t => t.side !== attacker.side && t.currentHP > 0) ?? null
  const allySkillAllies = allHeroes.filter(h => h.side === attacker.side && h.uid !== attacker.uid && h.currentHP > 0)
  for (const ally of allySkillAllies) {
    triggerPassives(ally, 'on_ally_skill', makeContext(turn, ally, allHeroes, firstEnemyTarget), cfg)
  }

  // HP 低於?�值被?�檢??
  for (const target of targets) {
    checkHpBelowPassives(target, turn, allHeroes, cfg)
  }
  checkHpBelowPassives(attacker, turn, allHeroes, cfg)
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   被�??�?�觸??
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

function triggerPassives(
  hero: BattleHero,
  trigger: string,
  context: BattleContext,
  cfg: BattleEngineConfig,
): void {
  if (hero.currentHP <= 0) return

  // 記�??��?觸發?��?�?executePassiveEffect ??damage case ?�斷?��?/追�?
  context._currentTrigger = trigger

  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== trigger) continue

    // 使用次數?�制檢查
    const usageKey = passive.skillId
    const usageCount = hero.passiveUsage[usageKey] ?? 0

    // ?��??��?次」�?被�?（�?殘�??��?�?
    if (trigger === 'on_lethal' && usageCount >= getMaxUsage(passive)) continue

    // ?��?被�??��?
    let anyEffectApplied = false
    for (const effect of passive.effects) {
      if (executePassiveEffect(hero, effect, context, cfg)) anyEffectApplied = true
    }

    // 條件?�被?��?如�?�?HP ?�檻�?滿足）�??��??�未?��?就�??�知?�端
    if (!anyEffectApplied) continue

    hero.passiveUsage[usageKey] = usageCount + 1

    cfg.onAction({
      type: 'PASSIVE_TRIGGER',
      heroUid: hero.uid,
      skillId: passive.skillId,
      skillName: passive.name,
    })
  }
}

/**
 * ?�命?�觸?��??��??��?�?
 * ?�扣血?�呼?��??��? on_lethal 被�?且�??�即將死亡�?觸發保命
 */
export function checkLethalPassive(
  hero: BattleHero,
  incomingDamage: number,
  _allHeroes: BattleHero[],
): boolean {
  const wouldDie = hero.currentHP - incomingDamage <= 0

  if (!wouldDie) return false

  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== 'on_lethal') continue

    const usageKey = passive.skillId
    const usageCount = hero.passiveUsage[usageKey] ?? 0
    if (usageCount >= getMaxUsage(passive)) continue

    // ?��?保命
    for (const effect of passive.effects) {
      if (effect.type === 'revive') {
        hero.currentHP = Math.max(1, Math.floor(hero.maxHP * (effect.multiplier ?? 0.01)))
        hero.passiveUsage[usageKey] = usageCount + 1
        return true
      }
      if (effect.type === 'heal') {
        hero.currentHP = Math.max(1, Math.floor(hero.maxHP * (effect.multiplier ?? 0.1)))
        hero.passiveUsage[usageKey] = usageCount + 1
        return true
      }
    }
  }

  return false
}

function checkHpBelowPassives(
  hero: BattleHero,
  turn: number,
  allHeroes: BattleHero[],
  cfg: BattleEngineConfig,
  context?: BattleContext,
): void {
  if (hero.currentHP <= 0) return

  const hpPct = hero.currentHP / hero.maxHP

  for (const passive of hero.activePassives) {
    const trigger = passive.passiveTrigger
    if (trigger !== 'hp_below_pct' && trigger !== 'hp_above_pct'
      && trigger !== 'enemy_count_below' && trigger !== 'ally_count_below'
      && trigger !== 'has_status') continue

    // 從�??��? targetHpThreshold / triggerParam ?��?結�??�閾??
    let threshold = 0.30 // default
    const firstEffect = passive.effects[0]
    if (trigger === 'hp_below_pct' || trigger === 'hp_above_pct') {
      threshold = firstEffect?.targetHpThreshold ?? 0.30
    }

    let conditionMet = false

    if (trigger === 'hp_below_pct') {
      conditionMet = hpPct < threshold
    } else if (trigger === 'hp_above_pct') {
      conditionMet = hpPct > threshold
    } else if (trigger === 'enemy_count_below') {
      const n = firstEffect?.flatValue ?? 3
      const aliveEnemies = allHeroes.filter(h => h.side !== hero.side && h.currentHP > 0).length
      conditionMet = aliveEnemies <= n
    } else if (trigger === 'ally_count_below') {
      const n = firstEffect?.flatValue ?? 3
      const aliveAllies = allHeroes.filter(h => h.side === hero.side && h.currentHP > 0).length
      conditionMet = aliveAllies <= n
    } else if (trigger === 'has_status') {
      // ?��??��? status 欄�??��?要檢?��??�??
      const checkStatus = passive.effects.find(e => e.status)?.status
      if (checkStatus && context?.target && _hasStatus(context.target, checkStatus)) {
        conditionMet = true
      }
    }

    if (conditionMet) {
      const usageKey = `${passive.skillId}_${trigger}`
      if (hero.passiveUsage[usageKey]) continue // ?�觸?��?�?

      let anyApplied = false
      for (const effect of passive.effects) {
        if (executePassiveEffect(hero, effect, makeContext(turn, hero, allHeroes), cfg)) anyApplied = true
      }
      if (!anyApplied) continue

      hero.passiveUsage[usageKey] = 1

      cfg.onAction({
        type: 'PASSIVE_TRIGGER',
        heroUid: hero.uid,
        skillId: passive.skillId,
        skillName: passive.name,
      })
    }
  }
}

function executePassiveEffect(
  hero: BattleHero,
  effect: SkillEffect,
  context: BattleContext,
  cfg: BattleEngineConfig,
): boolean {
  const chance = effect.statusChance ?? 1.0
  if (Math.random() > chance) return false

  // �??被�??��???target 欄�?，找?��??��? SkillTemplate
  const ownerPassive = hero.activePassives.find(p => p.effects.includes(effect))
  const passiveTargetType = ownerPassive?.target ?? 'self'

  switch (effect.type) {
    case 'buff':
    case 'debuff': {
      if (!effect.status) return false
      // ?��?被�? target 欄�?決�??��?對象
      const targets = resolvePassiveTargets(hero, effect.type, passiveTargetType, context)
      // perAlly: ?��??�值�?存活?��?人數?��?
      let effectValue = effect.statusValue ?? 0
      if (effect.perAlly) {
        const aliveAllies = context.allAllies.filter(h => h.side === hero.side && h.currentHP > 0).length
        effectValue *= aliveAllies
      }
      for (const t of targets) {
        applyStatus(t, {
          type: effect.status,
          value: effectValue,
          duration: effect.statusDuration ?? 0, // 0 = permanent for passive
          maxStacks: effect.statusMaxStacks ?? 1,
          sourceHeroId: hero.uid,
        })
      }
      return true
    }
    case 'heal': {
      const healTargets = resolvePassiveTargets(hero, 'buff', passiveTargetType, context)
      for (const ht of healTargets) {
        if (ht.currentHP <= 0) continue
        const scalingStat = effect.scalingStat ?? 'HP'
        const base = ht.finalStats[scalingStat] ?? ht.maxHP
        const healAmt = Math.floor(base * (effect.multiplier ?? 0.1) + (effect.flatValue ?? 0))
        const actual = Math.min(healAmt, ht.maxHP - ht.currentHP)
        ht.currentHP += actual
        hero.totalHealingDone += actual
      }
      return true
    }
    case 'energy': {
      const amount = effect.flatValue ?? 0
      const energyTargets = resolvePassiveTargets(hero, 'buff', passiveTargetType, context)
      for (const et of energyTargets) {
        if (et.currentHP <= 0) continue
        if (amount < 0) {
          // 負�?= ?��??��?（吸走目標能?�給?�己�?
          const drained = Math.min(et.energy, Math.abs(amount))
          addEnergy(et, -drained)
          addEnergy(hero, drained)
        } else {
          addEnergy(et, amount)
        }
      }
      return true
    }
    case 'dispel_debuff': {
      // 被�?觸發淨�?（�? PAS_7_4�?
      cleanse(hero, 1)
      return true
    }
    case 'damage_mult': {
      // on_attack 被�?：�?算傷害倍�?（�??�被?�可?��?�?
      // ?�援 targetHpThreshold：只?�目�?HP% 低於?�值�??��???
      if (effect.targetHpThreshold != null && context.target) {
        const targetHpPct = context.target.currentHP / context.target.maxHP
        if (targetHpPct >= effect.targetHpThreshold) return false // 條件不滿足�?不�???
      }
      context.damageMult = (context.damageMult ?? 1.0) * (effect.multiplier ?? 1.0)
      return true
    }
    case 'reflect': {
      // 被�?觸發?��??��?（�? PAS_3_4?�PAS_12_4）�??��? reflect status
      applyStatus(hero, {
        type: 'reflect',
        value: effect.multiplier ?? 0.15,
        duration: 0, // permanent
        maxStacks: 1,
        sourceHeroId: hero.uid,
      })
      return true
    }
    case 'damage_mult_random': {
      // on_attack 被�?：隨機傷害倍�?
      const min = effect.min ?? 0.5
      const max = effect.max ?? 1.8
      context.damageMult = (context.damageMult ?? 1.0) * (min + Math.random() * (max - min))
      return true
    }
    case 'damage': {
      const trigger = context._currentTrigger

      // ?��?觸發?�決定目標�? action 類�?
      let actualTarget: BattleHero | null = context.target
      let actionType: 'PASSIVE_DAMAGE' | 'COUNTER_ATTACK' | 'CHASE_ATTACK' = 'PASSIVE_DAMAGE'

      if (trigger === 'on_be_attacked') {
        // ?��?：目�?= ?��??�們�??�人（context.attacker�?
        if (context._isCounterAttack) return false
        actualTarget = context.attacker
        actionType = 'COUNTER_ATTACK'
      } else if (trigger === 'on_ally_skill' || trigger === 'on_ally_attacked') {
        // 追�?：目�?= ?�人
        if (context._isChaseAttack) return false
        if (trigger === 'on_ally_attacked' && context._originalAttacker) {
          actualTarget = context._originalAttacker
        }
        // on_ally_skill: context.target 已是?�?�命中�?第�??�敵�?
        actionType = 'CHASE_ATTACK'
      }

      if (actualTarget && actualTarget.currentHP > 0 && actualTarget.uid !== hero.uid) {
        const dmg = calculateDamage(hero, actualTarget, effect)
        if (!dmg.isDodge) {
          actualTarget.currentHP = Math.max(0, actualTarget.currentHP - dmg.damage)
          hero.totalDamageDealt += dmg.damage
          const killed = actualTarget.currentHP <= 0
          cfg.onAction({
            type: actionType,
            attackerUid: hero.uid,
            targetUid: actualTarget.uid,
            damage: dmg.damage,
            killed,
          })
          if (killed) {
            cfg.onAction({ type: 'DEATH', targetUid: actualTarget.uid })
            hero.killCount++
          }
        }
      }
      return true
    }
    case 'revive':
      // Handled by checkLethalPassive
      return true
    case 'extra_turn':
      // 將英?��??��?外�??��???
      if (cfg._extraTurnQueue) cfg._extraTurnQueue.push(hero.uid)
      return true
    case 'random_debuff': {
      // ?��??��?一?��??��??��?�?PAS_11_2 中場休息�?
      const debuffPool: StatusType[] = ['atk_down', 'def_down', 'spd_down', 'silence']
      const randomDebuff = debuffPool[Math.floor(Math.random() * debuffPool.length)]
      const debuffTargets = resolvePassiveTargets(hero, 'debuff', passiveTargetType, context)
      for (const t of debuffTargets) {
        applyStatus(t, {
          type: randomDebuff,
          value: effect.statusValue ?? 0.15,
          duration: effect.statusDuration ?? 1,
          maxStacks: 1,
          sourceHeroId: hero.uid,
        })
      }
      return true
    }

    /* ?��? v2.0 ?��??��????��? */

    case 'dispel_buff': {
      // 驅散?�方 buff（支??effect.status ?��??��?濾�?
      const dispelTargets = resolvePassiveTargets(hero, 'debuff', passiveTargetType, context)
      for (const t of dispelTargets) {
        dispelBuff(t, Math.max(1, effect.flatValue ?? 1), effect.status)
      }
      return true
    }

    case 'steal_buff': {
      // ?��??�方 buff
      if (context.target && context.target.currentHP > 0) {
        const stolenType = stealBuff(hero, context.target)
        if (stolenType) {
          cfg.onAction({
            type: 'STEAL_BUFF',
            heroUid: hero.uid,
            targetUid: context.target.uid,
            buffType: stolenType,
          })
        }
      }
      return true
    }

    case 'transfer_debuff': {
      // 轉移?�己??debuff 給敵??
      if (context.target && context.target.currentHP > 0) {
        const transferredType = transferDebuff(hero, context.target)
        if (transferredType) {
          cfg.onAction({
            type: 'TRANSFER_DEBUFF',
            heroUid: hero.uid,
            targetUid: context.target.uid,
            debuffType: transferredType,
          })
        }
      }
      return true
    }

    case 'execute': {
      // ?�殺：目�?HP% 低於?��????�接?�殺
      const execTarget = context.target
      if (!execTarget || execTarget.currentHP <= 0) return false
      const threshold = effect.targetHpThreshold ?? 0.15
      const hpPct = execTarget.currentHP / execTarget.maxHP
      if (hpPct >= threshold) return false
      if (_hasStatus(execTarget, 'immunity')) return false
      // §8.5: 檢查 on_lethal 被�?
      const saved = checkLethalPassive(execTarget, execTarget.currentHP, context.allAllies.concat(context.allEnemies))
      if (saved) return true
      execTarget.currentHP = 0
      hero.killCount++
      cfg.onAction({
        type: 'EXECUTE',
        attackerUid: hero.uid,
        targetUid: execTarget.uid,
      })
      cfg.onAction({ type: 'DEATH', targetUid: execTarget.uid })
      return true
    }

    case 'cc': {
      if (!effect.status) return false
      const ccTargets = resolvePassiveTargets(hero, 'debuff', passiveTargetType, context)
      for (const t of ccTargets) {
        applyStatus(t, {
          type: effect.status,
          value: effect.statusValue ?? 0,
          duration: effect.statusDuration ?? 1,
          maxStacks: 1,
          sourceHeroId: hero.uid,
        })
      }
      return true
    }

    case 'dot': {
      if (!effect.status) return false
      const dotTargets = resolvePassiveTargets(hero, 'debuff', passiveTargetType, context)
      for (const t of dotTargets) {
        applyStatus(t, {
          type: effect.status,
          value: effect.statusValue ?? 0.3,
          duration: effect.statusDuration ?? 2,
          maxStacks: effect.statusMaxStacks ?? 3,
          sourceHeroId: hero.uid,
        })
      }
      return true
    }

    case 'shield': {
      const shieldTargets = resolvePassiveTargets(hero, 'buff', passiveTargetType, context)
      for (const t of shieldTargets) {
        const shieldValue = Math.floor(
          (t.maxHP * (effect.multiplier ?? 0.2)) + (effect.flatValue ?? 0)
        )
        t.shields.push({
          value: shieldValue,
          duration: effect.statusDuration ?? 2,
          sourceHeroId: hero.uid,
        })
        cfg.onAction({
          type: 'SHIELD_APPLY',
          heroUid: hero.uid,
          targetUid: t.uid,
          value: shieldValue,
        })
      }
      return true
    }

    case 'modify_target': {
      // v2.0 §8.8: 目標變更 — 改變普攻/大招的攻擊目標規則
      const override = effect.targetOverride
      const applyTo = effect.applyTo ?? 'both'
      if (!override) return false
      const sourceSkillId = ownerPassive?.skillId ?? ''
      // 避免重複添加同一來源的目標修飾
      if (!hero.targetModifiers.some(m => m.sourceSkillId === sourceSkillId)) {
        hero.targetModifiers.push({
          targetOverride: override,
          applyTo,
          multiplier: effect.multiplier,
          sourceSkillId,
        })
      }
      return true
    }

    default:
      return false
  }
}

/**
 * ?��?被�? target 欄�?�??實�??��????
 */
function resolvePassiveTargets(
  hero: BattleHero,
  effectType: string,
  passiveTarget: string,
  context: BattleContext,
): BattleHero[] {
  switch (passiveTarget) {
    case 'all_allies':
      return context.allAllies.filter(h => h.side === hero.side && h.currentHP > 0)
    case 'all_enemies':
      return context.allEnemies.filter(h => h.side !== hero.side && h.currentHP > 0)
    case 'trigger_source':
      // v2.0: 觸發來�?（�??��??��??�、追?��??��??�目標�?
      if (context.target && context.target.currentHP > 0) return [context.target]
      if (context.attacker && context.attacker.currentHP > 0) return [context.attacker]
      return []
    case 'single_enemy':
      if (context.target && context.target.currentHP > 0 && context.target.side !== hero.side) return [context.target]
      return context.allEnemies.filter(h => h.side !== hero.side && h.currentHP > 0).slice(0, 1)
    case 'single_ally': {
      const allies = context.allAllies.filter(h => h.side === hero.side && h.currentHP > 0)
      if (allies.length === 0) return []
      allies.sort((a, b) => (a.currentHP / a.maxHP) - (b.currentHP / b.maxHP))
      return [allies[0]]
    }
    case 'self':
    default:
      // debuff 類�??��??�具體目標�??��??�目標�??��??�己
      if (effectType === 'debuff' && context.target && context.target.currentHP > 0) {
        return [context.target]
      }
      return [hero]
  }
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   工具?��?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

function makeContext(
  turn: number,
  actor: BattleHero,
  allHeroes: BattleHero[],
  target?: BattleHero | null,
  isKill: boolean = false,
): BattleContext {
  const allies = allHeroes.filter(h => h.side === actor.side)
  const enemies = allHeroes.filter(h => h.side !== actor.side)
  return {
    turn,
    attacker: actor,
    target: target ?? null,
    targets: target ? [target] : [],
    allAllies: allies,
    allEnemies: enemies,
    damageDealt: 0,
    isKill,
    isCrit: false,
    isDodge: false,
  }
}

function getMaxUsage(passive: SkillTemplate): number {
  // 大�???on_lethal 被�?每場 1 次�?PAS_1_4 ?�觸??2 �?
  if (passive.skillId === 'PAS_1_4') return 2
  if (passive.passiveTrigger === 'on_lethal') return 1
  return Infinity
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��?
   BattleHero 工�??��?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��? */

export interface RawHeroInput {
  heroId: number
  modelId: string
  name: string
  HP: number
  ATK: number
  DEF: number
  SPD: number
  CritRate: number
  CritDmg: number
}

/**
 * 從�?始�??�建�?BattleHero
 */
export function createBattleHero(
  input: RawHeroInput,
  side: 'player' | 'enemy',
  slot: number,
  activeSkill: SkillTemplate | null,
  passives: SkillTemplate[],
  starLevel: number = 1,
  uid?: string,
  heroInstance?: HeroInstanceData,
  rarity: number = 3,
): BattleHero {
  // ?��??��?決�??�放幾個被??
  // 1??1被�?, 2??2被�?, 4??3被�?, 6??4被�?
  const passiveSlots = starLevel >= 6 ? 4 : starLevel >= 4 ? 3 : starLevel >= 2 ? 2 : 1

  const rawStats: BaseStats = {
    HP: input.HP,
    ATK: input.ATK,
    DEF: input.DEF,
    SPD: input.SPD,
    CritRate: input.CritRate,
    CritDmg: input.CritDmg,
  }

  // Apply progression bonuses (level / ascension / stars / equipment) if available
  const baseStats: FinalStats = heroInstance
    ? getFinalStats(rawStats, heroInstance, rarity)
    : { ...rawStats }

  return {
    uid: uid ?? `${input.modelId}_${Date.now()}_${slot}_${side}`,
    heroId: input.heroId,
    modelId: input.modelId,
    name: input.name,
    side,
    slot,

    baseStats,
    finalStats: { ...baseStats },  // progression already applied
    currentHP: baseStats.HP,
    maxHP: baseStats.HP,

    energy: 0,

    activeSkill,
    passives,
    activePassives: passives.slice(0, passiveSlots),

    statusEffects: [],
    shields: [],
    passiveUsage: {},
    targetModifiers: [],

    totalDamageDealt: 0,
    totalHealingDone: 0,
    killCount: 0,
  }
}
