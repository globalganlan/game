/**
 * battleEngine — 戰鬥引擎核心
 *
 * 純邏輯引擎，不包含任何 React / Three.js 依賴。
 * 產出 BattleAction 指令序列，由表現層（App.tsx）消費並播放 3D 演出。
 *
 * 對應：
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
  hasStatus as _hasStatus,
  cleanse,
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
   中斷大招（能量滿即放）
   ════════════════════════════════════ */

/**
 * 檢查所有存活英雄，能量滿就立即施放大招（中斷式）。
 * 遞迴直到無人可中斷，或達到安全上限。
 */
async function processInterruptUltimates(
  players: BattleHero[],
  enemies: BattleHero[],
  turn: number,
  allHeroes: BattleHero[],
  cfg: BattleEngineConfig,
  alreadyActedUids: Set<string>, // 本輪已施放過大招的角色（防同一輪重複施放）
): Promise<boolean> {
  const MAX_INTERRUPTS = 20 // 安全上限
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
      alreadyActedUids.add(hero.uid) // 標記已施放過大招，防止同一輪重複施放
      found = true
      anyFired = true
      count++
      // 戰鬥結束？
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return true
      break // 重新掃描（因為大招可能改變其他人能量）
    }
  }
  return anyFired
}

/* ════════════════════════════════════
   額外行動（extra_turn）
   ════════════════════════════════════ */

/**
 * 處理額外行動佇列。
 * 被動觸發 extra_turn 時會把 hero UID 推入 cfg._extraTurnQueue，
 * 此函式從佇列中取出並讓對應英雄再行動一次（普攻 or 大招）。
 *
 * 限制：
 * - 每回合每位英雄最多 1 次額外行動（extraTurnUsed 追蹤）
 * - 額外行動中的擊殺不再觸發第二次額外行動（防無限連鎖）
 * - 額外行動跳過 DOT/Regen/turn_start 等回合開始結算
 */
async function processExtraTurns(
  cfg: BattleEngineConfig,
  extraTurnUsed: Set<string>,
  players: BattleHero[],
  enemies: BattleHero[],
  turn: number,
  allHeroes: BattleHero[],
): Promise<void> {
  const MAX_EXTRA = 10 // 安全上限，防萬一的無限迴圈
  let processed = 0

  while (cfg._extraTurnQueue && cfg._extraTurnQueue.length > 0 && processed < MAX_EXTRA) {
    const uid = cfg._extraTurnQueue.shift()!
    processed++

    // 每回合只允許一次額外行動
    if (extraTurnUsed.has(uid)) continue

    const hero = allHeroes.find(h => h.uid === uid)
    if (!hero || hero.currentHP <= 0) continue

    // 標記為已使用（防止額外行動中再次觸發）
    extraTurnUsed.add(uid)

    const allies = hero.side === 'player' ? players : enemies
    const foes = hero.side === 'player' ? enemies : players

    // 通知表現層：額外行動開始
    await cfg.onAction({ type: 'EXTRA_TURN', heroUid: uid, reason: 'extra_turn' })

    // ★ 額外行動前：先讓能量滿的英雄放大招
    const preExtraInterrupt = new Set<string>()
    await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, preExtraInterrupt)
    if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return
    if (hero.currentHP <= 0) continue

    // 控制效果仍然生效
    if (isControlled(hero) || isFeared(hero)) continue

    // ★ 額外行動：一律普攻
    await executeNormalAttack(hero, allies, foes, turn, allHeroes, cfg)

    // 中斷大招（額外行動可能觸發能量溢出）
    const interruptActed = new Set<string>()
    await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, interruptActed)

    if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return
  }
}

/* ════════════════════════════════════
   引擎配置
   ════════════════════════════════════ */

export interface BattleEngineConfig {
  maxTurns: number          // 最大回合數（防無限迴圈）
  onAction: (action: BattleAction) => void | Promise<void>  // 行動回調（表現層消費）
  /** @internal 額外行動佇列（引擎內部使用，外部不需設定） */
  _extraTurnQueue?: string[]
}

const DEFAULT_CONFIG: BattleEngineConfig = {
  maxTurns: 50,
  onAction: () => {},
  _extraTurnQueue: [],
}

/* ════════════════════════════════════
   引擎主入口
   ════════════════════════════════════ */

/**
 * 執行一場完整戰鬥
 *
 * @param players - 玩家方角色（已初始化 BattleHero）
 * @param enemies - 敵方角色（已初始化 BattleHero）
 * @param config  - 引擎配置
 * @returns 勝利方
 */
export async function runBattle(
  players: BattleHero[],
  enemies: BattleHero[],
  config: Partial<BattleEngineConfig> = {},
): Promise<'player' | 'enemy' | 'draw'> {
  const cfg = { ...DEFAULT_CONFIG, ...config, _extraTurnQueue: [] as string[] }
  const allHeroes = [...players, ...enemies]

  // ── 戰鬥開始：觸發 battle_start + always 被動 ──
  for (const hero of allHeroes) {
    if (hero.currentHP <= 0) continue
    triggerPassives(hero, 'always', makeContext(0, hero, allHeroes), cfg)
    triggerPassives(hero, 'battle_start', makeContext(0, hero, allHeroes), cfg)
  }

  // ── 回合迴圈 ──
  for (let turn = 1; turn <= cfg.maxTurns; turn++) {
    await cfg.onAction({ type: 'TURN_START', turn })

    // 收集存活角色
    const alivePlayers = players.filter(p => p.currentHP > 0)
    const aliveEnemies = enemies.filter(e => e.currentHP > 0)
    if (alivePlayers.length === 0 || aliveEnemies.length === 0) break

    // 速度排序：SPD DESC → slot ASC → 玩家優先
    const actors = [...alivePlayers, ...aliveEnemies]
    actors.sort((a, b) => {
      const spdA = getBuffedStats(a).SPD
      const spdB = getBuffedStats(b).SPD
      if (spdB !== spdA) return spdB - spdA
      if (a.slot !== b.slot) return a.slot - b.slot
      return a.side === 'player' ? -1 : 1
    })

    // ── 每個角色行動 ──
    const extraTurnUsed = new Set<string>() // 每回合每人最多 1 次額外行動
    for (const actor of actors) {
      if (actor.currentHP <= 0) continue

      const allies = actor.side === 'player' ? players : enemies
      const foes = actor.side === 'player' ? enemies : players

      // 回合開始能量
      const energyDelta = turnStartEnergy(actor)
      if (energyDelta > 0) {
        await cfg.onAction({ type: 'ENERGY_CHANGE', heroUid: actor.uid, delta: energyDelta, newValue: actor.energy })
      }

      // DOT 結算
      const dotResults = processDotEffects(actor, allHeroes)
      for (const dot of dotResults) {
        await cfg.onAction({ type: 'DOT_TICK', targetUid: actor.uid, dotType: dot.type, damage: dot.damage, sourceUid: dot.sourceUid })
      }
      if (actor.currentHP <= 0) {
        await cfg.onAction({ type: 'DEATH', targetUid: actor.uid })
        continue
      }

      // Regen 結算
      processRegen(actor)

      // 觸發「每回合開始」被動
      triggerPassives(actor, 'turn_start', makeContext(turn, actor, allHeroes), cfg)

      // 觸發「每 N 回合」被動
      for (const passive of actor.activePassives) {
        if (passive.passiveTrigger !== 'every_n_turns') continue
        const n = passive.description.includes('每 2') || passive.description.includes('每2') ? 2 : 3
        if (turn % n === 0) {
          for (const eff of passive.effects) {
            executePassiveEffect(actor, eff, makeContext(turn, actor, allHeroes), cfg)
          }
          cfg.onAction({ type: 'PASSIVE_TRIGGER', heroUid: actor.uid, skillId: passive.skillId, skillName: passive.name })
        }
      }

      // ★ 行動前：先讓所有能量滿的英雄施放大招（包含自己）
      const preActInterrupt = new Set<string>()
      await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, preActInterrupt)
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break
      if (actor.currentHP <= 0) continue

      // 控制效果判定
      if (isControlled(actor)) {
        // 被暈眩/凍結，跳過行動
        continue
      }
      if (isFeared(actor)) {
        // 被恐懼，跳過行動
        continue
      }

      // ★ 行動：一律普攻（大招由中斷機制統一處理）
      await executeNormalAttack(actor, allies, foes, turn, allHeroes, cfg)

      // ★ 行動後：再檢查是否有英雄能量滿了（普攻加能量可能觸發）
      const interruptActed = new Set<string>()
      await processInterruptUltimates(players, enemies, turn, allHeroes, cfg, interruptActed)
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break

      // ── 額外行動處理 ──
      await processExtraTurns(cfg, extraTurnUsed, players, enemies, turn, allHeroes)
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break

      // 清理已死亡角色的行動能力（但保留在陣列中給表現層播放死亡動畫）
    }

    // ── 回合結束：buff duration 倒數 ──
    for (const hero of allHeroes) {
      if (hero.currentHP <= 0) continue
      const expired = tickStatusDurations(hero)
      for (const t of expired) {
        await cfg.onAction({ type: 'BUFF_EXPIRE', targetUid: hero.uid, effectType: t })
      }
      tickShieldDurations(hero)

      // 觸發「回合結束」被動
      triggerPassives(hero, 'turn_end', makeContext(turn, hero, allHeroes), cfg)
    }

    await cfg.onAction({ type: 'TURN_END', turn })

    // 勝負判定
    if (players.every(p => p.currentHP <= 0)) {
      await cfg.onAction({ type: 'BATTLE_END', winner: 'enemy' })
      return 'enemy'
    }
    if (enemies.every(e => e.currentHP <= 0)) {
      await cfg.onAction({ type: 'BATTLE_END', winner: 'player' })
      return 'player'
    }
  }

  // 迴圈結束後再做一次勝負判定（處理 break 跳出的情況）
  if (players.every(p => p.currentHP <= 0)) {
    await cfg.onAction({ type: 'BATTLE_END', winner: 'enemy' })
    return 'enemy'
  }
  if (enemies.every(e => e.currentHP <= 0)) {
    await cfg.onAction({ type: 'BATTLE_END', winner: 'player' })
    return 'player'
  }

  // 超時 → 平手（或按 HP 比例判定，先簡化為 draw）
  await cfg.onAction({ type: 'BATTLE_END', winner: 'draw' })
  return 'draw'
}

/* ════════════════════════════════════
   同步收集模式
   ════════════════════════════════════ */

export interface BattleResult {
  winner: 'player' | 'enemy' | 'draw'
  actions: BattleAction[]
}

/**
 * 同步（同步式 await）跑完整場戰鬥，收集所有 BattleAction。
 * 不需要表現層回調，幾 ms 內完成。
 * 前端可拿到 actions 後再決定「播放動畫」或「跳過直接結算」。
 *
 * @param config.seed - 可選的確定性種子。提供時將以 seeded PRNG 取代 Math.random，
 *                      讓 GAS 端以相同種子重現一模一樣的戰鬥結果（反作弊校驗用）。
 */
export async function runBattleCollect(
  players: BattleHero[],
  enemies: BattleHero[],
  config: Partial<Pick<BattleEngineConfig, 'maxTurns'>> & { seed?: number } = {},
): Promise<BattleResult> {
  const actions: BattleAction[] = []

  // ── 種子式 PRNG：暫時覆蓋 Math.random ──
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
    // ★ 無論成功或失敗，都必須還原 Math.random
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
  const target = selectNormalAttackTarget(attacker, enemies)
  if (!target) return

  // 觸發「攻擊前」被動
  const ctx = makeContext(turn, attacker, allHeroes, target)
  triggerPassives(attacker, 'on_attack', ctx, cfg)

  // 計算傷害
  const result = calculateDamage(attacker, target)

  // 套用 on_attack 被動傷害倍率（damage_mult / damage_mult_random）
  if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
    result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult))
  }

  // 套用傷害（先套用再通知表現層，確保 killed flag 正確）
  let killed = false
  if (!result.isDodge) {
    target.currentHP = Math.max(0, target.currentHP - result.damage)
    attacker.totalDamageDealt += result.damage
    killed = target.currentHP <= 0

    // 反彈傷害
    if (result.reflectDamage > 0) {
      attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage)
    }
  }

  // 預先計算能量變化（讓表現層可在正確的動畫時機套用）
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

  // 發送行動（含 killed flag + 能量快照，表現層一次處理）
  await cfg.onAction({
    type: 'NORMAL_ATTACK',
    attackerUid: attacker.uid,
    targetUid: target.uid,
    result,
    killed,
    _atkEnergyNew,
    _tgtEnergyNew,
  })

  // 被動觸發（能量已在上方預算，不再發送 ENERGY_CHANGE）
  if (!result.isDodge) {
    if (!killed) {
      triggerPassives(target, 'on_be_attacked', makeContext(turn, attacker, allHeroes, target), cfg)
      triggerPassives(target, 'on_take_damage', makeContext(turn, attacker, allHeroes, target), cfg)
    }

    if (result.isCrit) {
      triggerPassives(attacker, 'on_crit', makeContext(turn, attacker, allHeroes, target), cfg)
    }

    if (killed) {
      triggerPassives(attacker, 'on_kill', makeContext(turn, attacker, allHeroes, target, true), cfg)
      // 觸發死者隊友的 on_ally_death 被動
      const deadSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
      for (const ally of deadSideAllies) {
        triggerPassives(ally, 'on_ally_death', makeContext(turn, ally, allHeroes, target), cfg)
      }
    }
  } else {
    // on_dodge: 觸發閃避者被動，context.target 設為攻擊者（反擊目標）
    triggerPassives(target, 'on_dodge', makeContext(turn, target, allHeroes, attacker), cfg)
  }

  // HP 低於閾值被動檢查
  checkHpBelowPassives(attacker, turn, allHeroes, cfg)
  checkHpBelowPassives(target, turn, allHeroes, cfg)
}

/* ════════════════════════════════════
   技能執行
   ════════════════════════════════════ */

async function executeSkill(
  attacker: BattleHero,
  skill: SkillTemplate,
  allies: BattleHero[],
  enemies: BattleHero[],
  turn: number,
  allHeroes: BattleHero[],
  cfg: BattleEngineConfig,
): Promise<void> {
  const targets = selectTargets(skill.target, attacker, allies, enemies)
  if (targets.length === 0) return

  // 觸發「攻擊前」被動
  const ctx = makeContext(turn, attacker, allHeroes, targets[0])
  triggerPassives(attacker, 'on_attack', ctx, cfg)

  const skillResults: Array<{ uid: string; result: DamageResult | HealResult; killed?: boolean }> = []
  const killedUids: string[] = []
  const _tgtEnergyMap: Record<string, number> = {}

  for (const effect of skill.effects) {
    for (const target of targets) {
      if (target.currentHP <= 0 && effect.type === 'damage') continue

      switch (effect.type) {
        case 'damage': {
          const result = calculateDamage(attacker, target, effect)
          // 套用 on_attack 被動傷害倍率
          if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
            result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult))
          }
          let killed = false

          if (!result.isDodge) {
            target.currentHP = Math.max(0, target.currentHP - result.damage)
            attacker.totalDamageDealt += result.damage
            killed = target.currentHP <= 0

            if (result.reflectDamage > 0) {
              attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage)
            }

            if (!killed) {
              const defEDelta = onBeAttackedEnergy(target)
              if (defEDelta > 0) _tgtEnergyMap[target.uid] = target.energy
              triggerPassives(target, 'on_be_attacked', makeContext(turn, attacker, allHeroes, target), cfg)
              triggerPassives(target, 'on_take_damage', makeContext(turn, attacker, allHeroes, target), cfg)
            }

            if (killed) {
              killedUids.push(target.uid)
              attacker.killCount++
              onKillEnergy(attacker)
              triggerPassives(attacker, 'on_kill', makeContext(turn, attacker, allHeroes, target, true), cfg)
              // 觸發死者隊友的 on_ally_death 被動
              const deadSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0)
              for (const ally of deadSideAllies) {
                triggerPassives(ally, 'on_ally_death', makeContext(turn, ally, allHeroes, target), cfg)
              }
            }

            if (result.isCrit) {
              triggerPassives(attacker, 'on_crit', makeContext(turn, attacker, allHeroes, target), cfg)
            }
          } else {
            // on_dodge: 觸發閃避者被動，context.target 設為攻擊者（反擊目標）
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
          addEnergy(target, amount)
          break
        }

        case 'revive': {
          // 復活邏輯由 on_lethal 被動處理
          break
        }

        case 'dispel_debuff': {
          cleanse(target, 1)
          break
        }

        default:
          break
      }
    }
  }

  // 技能能量消耗（大招施放 → 能量歸零）
  consumeEnergy(attacker)

  // 發送技能行動（含每個目標的 killed 旗標 + 能量快照）
  await cfg.onAction({
    type: 'SKILL_CAST',
    attackerUid: attacker.uid,
    skillId: skill.skillId,
    skillName: skill.name,
    targets: skillResults,
    _atkEnergyNew: attacker.energy,
    _tgtEnergyMap: Object.keys(_tgtEnergyMap).length > 0 ? _tgtEnergyMap : undefined,
  })

  // 觸發隊友的 on_ally_skill 被動（施放者自己不觸發）
  const allySkillAllies = allHeroes.filter(h => h.side === attacker.side && h.uid !== attacker.uid && h.currentHP > 0)
  for (const ally of allySkillAllies) {
    triggerPassives(ally, 'on_ally_skill', makeContext(turn, ally, allHeroes, attacker), cfg)
  }

  // HP 低於閾值被動檢查
  for (const target of targets) {
    checkHpBelowPassives(target, turn, allHeroes, cfg)
  }
  checkHpBelowPassives(attacker, turn, allHeroes, cfg)
}

/* ════════════════════════════════════
   被動技能觸發
   ════════════════════════════════════ */

function triggerPassives(
  hero: BattleHero,
  trigger: string,
  context: BattleContext,
  cfg: BattleEngineConfig,
): void {
  if (hero.currentHP <= 0) return

  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== trigger) continue

    // 使用次數限制檢查
    const usageKey = passive.skillId
    const usageCount = hero.passiveUsage[usageKey] ?? 0

    // 「每場一次」類被動（如殘存意志）
    if (trigger === 'on_lethal' && usageCount >= getMaxUsage(passive)) continue

    // 執行被動效果
    for (const effect of passive.effects) {
      executePassiveEffect(hero, effect, context, cfg)
    }

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
 * 致命傷觸發（特殊處理）
 * 在扣血前呼叫，若有 on_lethal 被動且角色即將死亡，觸發保命
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

    // 執行保命
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
): void {
  if (hero.currentHP <= 0) return

  const hpPct = hero.currentHP / hero.maxHP

  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== 'hp_below_pct') continue

    // 根據被動描述判斷閾值（簡化：統一為 50% 和 30%）
    // 實際應從效果或描述中解析，此處用通用邏輯
    const threshold = passive.description.includes('15%') ? 0.15
      : passive.description.includes('30%') ? 0.30
      : passive.description.includes('50%') ? 0.50
      : 0.30 // default

    if (hpPct < threshold) {
      const usageKey = `${passive.skillId}_hp_below`
      if (hero.passiveUsage[usageKey]) continue // 只觸發一次

      for (const effect of passive.effects) {
        executePassiveEffect(hero, effect, makeContext(turn, hero, allHeroes), cfg)
      }
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
): void {
  const chance = effect.statusChance ?? 1.0
  if (Math.random() > chance) return

  // 解析被動目標的 target 欄位，找出對應的 SkillTemplate
  const ownerPassive = hero.activePassives.find(p => p.effects.includes(effect))
  const passiveTargetType = ownerPassive?.target ?? 'self'

  switch (effect.type) {
    case 'buff':
    case 'debuff': {
      if (!effect.status) return
      // 根據被動 target 欄位決定施加對象
      const targets = resolvePassiveTargets(hero, effect.type, passiveTargetType, context)
      // perAlly: 效果數值按存活隊友人數倍增
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
      break
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
      break
    }
    case 'energy': {
      const energyTargets = resolvePassiveTargets(hero, 'buff', passiveTargetType, context)
      for (const et of energyTargets) {
        if (et.currentHP <= 0) continue
        addEnergy(et, effect.flatValue ?? 0)
      }
      break
    }
    case 'dispel_debuff': {
      // 被動觸發淨化（如 PAS_7_4）
      cleanse(hero, 1)
      break
    }
    case 'damage_mult': {
      // on_attack 被動：乘算傷害倍率（多個被動可疊加）
      // 支援 targetHpThreshold：只在目標 HP% 低於閾值時才生效
      if (effect.targetHpThreshold != null && context.target) {
        const targetHpPct = context.target.currentHP / context.target.maxHP
        if (targetHpPct >= effect.targetHpThreshold) break // 條件不滿足，跳過
      }
      context.damageMult = (context.damageMult ?? 1.0) * (effect.multiplier ?? 1.0)
      break
    }
    case 'reflect': {
      // 被動觸發反彈效果（如 PAS_3_4、PAS_12_4）— 施加 reflect status
      applyStatus(hero, {
        type: 'reflect',
        value: effect.multiplier ?? 0.15,
        duration: 0, // permanent
        maxStacks: 1,
        sourceHeroId: hero.uid,
      })
      break
    }
    case 'damage_mult_random': {
      // on_attack 被動：隨機傷害倍率
      const min = effect.min ?? 0.5
      const max = effect.max ?? 1.8
      context.damageMult = (context.damageMult ?? 1.0) * (min + Math.random() * (max - min))
      break
    }
    case 'damage': {
      // 非 on_attack 觸發的額外傷害（如 on_dodge 反擊）
      if (context.target && context.target.currentHP > 0) {
        const dmg = calculateDamage(hero, context.target, effect)
        if (!dmg.isDodge) {
          context.target.currentHP = Math.max(0, context.target.currentHP - dmg.damage)
          hero.totalDamageDealt += dmg.damage
          const killed = context.target.currentHP <= 0
          cfg.onAction({
            type: 'PASSIVE_DAMAGE',
            attackerUid: hero.uid,
            targetUid: context.target.uid,
            damage: dmg.damage,
            killed,
          })
          if (killed) {
            cfg.onAction({ type: 'DEATH', targetUid: context.target.uid })
          }
        }
      }
      break
    }
    case 'revive':
      // Handled by checkLethalPassive
      break
    case 'extra_turn':
      // 將英雄加入額外行動佇列
      if (cfg._extraTurnQueue) cfg._extraTurnQueue.push(hero.uid)
      break
    case 'random_debuff': {
      // 隨機施加一個減益效果（如 PAS_11_2 中場休息）
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
      break
    }
    default:
      break
  }
}

/**
 * 根據被動 target 欄位解析實際目標陣列
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
    case 'self':
    default:
      // debuff 類效果：有具體目標則施加到目標，否則自己
      if (effectType === 'debuff' && context.target && context.target.currentHP > 0) {
        return [context.target]
      }
      return [hero]
  }
}

/* ════════════════════════════════════
   工具函式
   ════════════════════════════════════ */

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
  // 大多數 on_lethal 被動每場 1 次，PAS_1_4 可觸發 2 次
  if (passive.skillId === 'PAS_1_4') return 2
  if (passive.passiveTrigger === 'on_lethal') return 1
  return Infinity
}

/* ════════════════════════════════════
   BattleHero 工廠函式
   ════════════════════════════════════ */

export interface RawHeroInput {
  heroId: number
  modelId: string
  name: string
  element: string
  HP: number
  ATK: number
  DEF: number
  SPD: number
  CritRate: number
  CritDmg: number
}

/**
 * 從原始資料建立 BattleHero
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
  // 根據星級決定開放幾個被動
  // 1星=1被動, 2星=2被動, 4星=3被動, 6星=4被動
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
    element: (input.element as BattleHero['element']) || '',

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

    totalDamageDealt: 0,
    totalHealingDone: 0,
    killCount: 0,
  }
}
