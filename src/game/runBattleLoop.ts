/**
 * runBattleLoop — 戰鬥主迴圈
 *
 * 從 App.tsx 抽出的核心戰鬥引擎驅動函式。
 * 接收 BattleLoopContext 物件（所有 React state/ref/callback），
 * 靜態相依（domain/service）則直接 import。
 */
import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import type { Vector3Tuple } from 'three'

import type {
  GameState,
  ActorState,
  AnimationState,
  RawHeroData,
  SlotHero,
  ActionResolveEntry,
} from '../types'

/* ── Domain Engine ── */
import type { BattleHero, BattleAction, SkillTemplate, DamageResult } from '../domain'
import type { HeroSkillConfig } from '../domain/types'
import type { RawHeroInput, HeroInstanceData } from '../domain'
import { BattleFlowValidator } from '../domain/battleFlowValidator'
import { createBattleHero } from '../domain'
import { getHeroSkillSet } from '../services'
import { getEffectTemplatesCache, getSkillEffectsCache, resolveSkillEffectsForBattle } from '../services/dataService'
import { completeBattle, type CompleteBattleResult } from '../services/progressionService'
import {
  rollDrops, mergeDrops, getBossConfig,
} from '../domain/stageSystem'
import type { StageReward } from '../domain/stageSystem'
import { getTimerYield } from '../services/saveService'
import { addItemsLocally, getHeroEquipment } from '../services/inventoryService'
import { audioManager } from '../services/audioService'
import { getItemName, toRarityNum } from '../constants/rarity'
import { getSkillLevel } from '../domain/progressionSystem'
import { statusZh } from '../constants/statNames'
import { completeArenaChallenge } from '../services/arenaService'
import type { SaveData, HeroInstance } from '../services/saveService'

/* ── Extracted constants ── */
import {
  ATTACK_DELAY_MS, BUFF_TYPE_SET,
  ENEMY_SLOT_POSITIONS, PLAYER_SLOT_POSITIONS,
  waitFrames,
} from './constants'

/* ── Component types ── */
import type { BattleBuffMap, BattleEnergyMap, SkillToast, PassiveHint, BuffApplyHint } from '../components/BattleHUD'
import type { VictoryRewards } from '../components/VictoryPanel'
import type { BattleStatEntry } from '../components/BattleStatsPanel'
import type { AcquireItem } from '../hooks/useAcquireToast'

/* ══════════════════════════════
   Context — 所有 React 相依由呼叫端傳入
   ══════════════════════════════ */
export interface BattleLoopContext {
  /* ── Refs ── */
  isReplayingRef: MutableRefObject<boolean>
  preBattlePlayerSlotsRef: MutableRefObject<(SlotHero | null)[]>
  battleActionsRef: MutableRefObject<BattleAction[]>
  pSlotsRef: MutableRefObject<(SlotHero | null)[]>
  eSlotsRef: MutableRefObject<(SlotHero | null)[]>
  turnRef: MutableRefObject<number>
  skipBattleRef: MutableRefObject<boolean>
  speedRef: MutableRefObject<number>
  flowValidatorRef: MutableRefObject<BattleFlowValidator | null>
  skillsRef: MutableRefObject<Map<string, SkillTemplate>>
  heroSkillsRef: MutableRefObject<Map<number, HeroSkillConfig>>
  heroInputsRef: MutableRefObject<RawHeroInput[]>
  battleHeroesRef: MutableRefObject<Map<string, BattleHero>>
  actorStatesRef: MutableRefObject<Record<string, ActorState>>
  moveTargetsRef: MutableRefObject<Record<string, Vector3Tuple>>
  arenaTargetRankRef: MutableRefObject<number>

  /* ── BattleHUD id refs ── */
  skillToastIdRef: MutableRefObject<number>
  passiveHintIdRef: MutableRefObject<number>
  buffApplyHintIdRef: MutableRefObject<number>

  /* ── State setters ── */
  setGameState: Dispatch<SetStateAction<GameState>>
  setTurn: Dispatch<SetStateAction<number>>
  setShowBattleStats: Dispatch<SetStateAction<boolean>>
  setBattleCalculating: Dispatch<SetStateAction<boolean>>
  setBattleResult: Dispatch<SetStateAction<'victory' | 'defeat' | null>>
  setVictoryRewards: Dispatch<SetStateAction<VictoryRewards | null>>
  setBattleStats: Dispatch<SetStateAction<Record<string, BattleStatEntry>>>
  updatePlayerSlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  updateEnemySlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  setActorState: (id: string, s: ActorState) => void

  /* ── BattleHUD setters ── */
  setBattleBuffs: Dispatch<SetStateAction<BattleBuffMap>>
  setBattleEnergy: Dispatch<SetStateAction<BattleEnergyMap>>
  setSkillToasts: Dispatch<SetStateAction<SkillToast[]>>
  setPassiveHints: Dispatch<SetStateAction<PassiveHint[]>>
  setBuffApplyHints: Dispatch<SetStateAction<BuffApplyHint[]>>
  setBossDamageProgress: Dispatch<SetStateAction<number>>

  /* ── Animation promise callbacks ── */
  addDamage: (targetUids: string | string[], value: number, damageType?: import('../types').DamageDisplayType) => void
  addSkillFlash: (uid: string) => void
  addBuffVfx: (targetUids: string | string[]) => void
  waitForAction: (uid: string, expectedState?: AnimationState | null) => Promise<void>
  waitForMove: (uid: string) => Promise<void>
  clearAllPromises: () => void
  actionResolveRefs: MutableRefObject<Record<string, ActionResolveEntry>>
  moveResolveRefs: MutableRefObject<Record<string, () => void>>

  /* ── Save callbacks ── */
  doSaveFormation: (heroIds: (string | null)[]) => void
  doUpdateProgress: (changes: Record<string, unknown>) => void
  doUpdateStory: (chapter: number, stage: number) => void

  /* ── UI callbacks ── */
  acquireShow: (items: AcquireItem[]) => void
  showToast: (msg: string) => void

  /* ── Snapshot values（呼叫時捕獲，戰鬥期間不會變） ── */
  playerSlots: (SlotHero | null)[]
  enemySlots: (SlotHero | null)[]
  stageMode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss'
  stageId: string
  heroInstances: HeroInstance[]
  saveData: SaveData | null
}

/* ══════════════════════════════
   Battle Loop
   ══════════════════════════════ */
export async function executeBattleLoop(ctx: BattleLoopContext, replayActions?: BattleAction[]) {
  /* ── 解構 context ── */
  const {
    isReplayingRef, preBattlePlayerSlotsRef, battleActionsRef,
    pSlotsRef, eSlotsRef, turnRef, skipBattleRef, speedRef,
    flowValidatorRef, skillsRef, heroSkillsRef, heroInputsRef,
    battleHeroesRef, actorStatesRef, moveTargetsRef,
    arenaTargetRankRef,
    skillToastIdRef, passiveHintIdRef, buffApplyHintIdRef,
    setGameState, setTurn, setShowBattleStats, setBattleCalculating,
    setBattleResult, setVictoryRewards, setBattleStats,
    updatePlayerSlots, updateEnemySlots, setActorState,
    setBattleBuffs, setBattleEnergy, setSkillToasts,
    setPassiveHints, setBuffApplyHints,
    setBossDamageProgress,
    addDamage, addSkillFlash, addBuffVfx, waitForAction, waitForMove, clearAllPromises,
    actionResolveRefs, moveResolveRefs,
    doSaveFormation, doUpdateProgress, doUpdateStory,
    acquireShow, showToast,
    playerSlots, enemySlots, stageMode, stageId,
    heroInstances, saveData,
  } = ctx

  const isReplay = !!replayActions
  isReplayingRef.current = isReplay

  // 儲存戰前玩家陣容快照（用於重試時恢復）
  if (!isReplay) {
    preBattlePlayerSlotsRef.current = playerSlots.map(s => s ? { ...s } : null)
    battleActionsRef.current = []
    // ── 開戰時儲存陣型（而非拖曳時即存） ──
    const heroIds: (string | null)[] = playerSlots.map(s => {
      if (!s) return null
      return String(s.HeroID ?? s.id ?? '')
    })
    if (heroIds.some(h => h !== null && h !== '')) {
      doSaveFormation(heroIds)
    }
  }

  setShowBattleStats(false)
  setGameState('BATTLE')
  turnRef.current = 1; setTurn(1)
  skipBattleRef.current = false

  // ★ 清除上一場殘留的 Promise/Ref，避免 stale resolve 和 timeout 假警報
  clearAllPromises()
  flowValidatorRef.current = null

  const delay = (ms: number) => skipBattleRef.current ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, ms / speedRef.current))

  // ── 建立 BattleHero 陣列 ──
  const skills = skillsRef.current
  const heroSkillsMap = heroSkillsRef.current
  const heroInputs = heroInputsRef.current

  const playerBH: BattleHero[] = []
  const enemyBH: BattleHero[] = []
  const heroMap = new Map<string, BattleHero>()

  /** 從 SlotHero 建立 RawHeroInput fallback */
  const slotToInput = (s: SlotHero, heroId: number, useSlotStats = false): RawHeroInput => {
    // 敵方 slot 的 HP/ATK/DEF/Speed 已由 buildEnemySlotsFromStage 套用 multiplier，
    // 必須直接使用 slot 數值，不可從 heroInputs 覆蓋回基礎值。
    if (!useSlotStats) {
      const found = heroInputs.find(h => h.heroId === heroId)
      if (found) return found
    }
    return {
      heroId,
      modelId: s._modelId,
      name: String(s.Name ?? ''),
      HP: Number(s.HP ?? 100),
      ATK: Number(s.ATK ?? 20),
      DEF: Number((s as Record<string, unknown>).DEF ?? 10),
      SPD: Number(s.Speed ?? s.SPD ?? 5),
      CritRate: Number((s as Record<string, unknown>).CritRate ?? 5),
      CritDmg: Number((s as Record<string, unknown>).CritDmg ?? 50),
    }
  }

  // 回放模式讀取 ref（已由 replayBattle 更新），正常模式讀取 state 快照
  const currentPlayerSlots = isReplay ? pSlotsRef.current : playerSlots
  const currentEnemySlots = isReplay ? eSlotsRef.current : enemySlots

  // 使用渲染中的 state 快照（與 JSX 中 Hero 的 uid 一致），
  // 避免 ref 因 startTransition / batching 與已渲染 UI 產生 UID 不匹配。
  const effTemplates = getEffectTemplatesCache()
  const effLinks = getSkillEffectsCache()

  for (let i = 0; i < 6; i++) {
    const p = currentPlayerSlots[i]
    if (!p) continue
    const heroId = Number(p.HeroID ?? p.id ?? 0)
    const input = slotToInput(p, heroId)
    let { activeSkill, passives } = getHeroSkillSet(heroId, skills, heroSkillsMap)

    // Build HeroInstanceData from save data (progression → combat)
    const inst = heroInstances.find(h => h.heroId === heroId)
    const heroInstanceData: HeroInstanceData | undefined = inst ? {
      heroId: inst.heroId,
      level: inst.level,
      exp: inst.exp,
      ascension: inst.ascension,
      stars: inst.stars ?? 0,
      equipment: getHeroEquipment(inst.instanceId),
    } : undefined
    const starLevel = heroInstanceData?.stars ?? 0
    const heroRarity = toRarityNum((p as Record<string, unknown>).Rarity)

    // v2.0: 根據技能等級（★7→Lv.2 … ★10→Lv.5）解析效果覆寫
    const skillLevel = getSkillLevel(starLevel)
    if (activeSkill) {
      const resolved = resolveSkillEffectsForBattle(activeSkill.skillId, skillLevel, effTemplates, effLinks)
      if (resolved) activeSkill = { ...activeSkill, effects: resolved }
    }
    passives = passives.map(p => {
      const resolved = resolveSkillEffectsForBattle(p.skillId, skillLevel, effTemplates, effLinks)
      return resolved ? { ...p, effects: resolved } : p
    })

    const bh = createBattleHero(input, 'player', i, activeSkill, passives, starLevel, p._uid, heroInstanceData, heroRarity)
    playerBH.push(bh)
    heroMap.set(bh.uid, bh)
  }

  for (let i = 0; i < 6; i++) {
    const e = currentEnemySlots[i]
    if (!e) continue
    const heroId = Number(e.HeroID ?? e.id ?? 0)
    const input = slotToInput(e, heroId, true) // 敵方使用 slot 已套用 multiplier 的數值
    const { activeSkill, passives } = getHeroSkillSet(heroId, skills, heroSkillsMap)
    const enemyRarity = toRarityNum((e as Record<string, unknown>).Rarity)
    const bh = createBattleHero(input, 'enemy', i, activeSkill, passives, 1, e._uid, undefined, enemyRarity)
    enemyBH.push(bh)
    heroMap.set(bh.uid, bh)
  }

  battleHeroesRef.current = heroMap

  // ── dev 模式：初始化戰鬥流程驗證器 ──
  if (import.meta.env.DEV) {
    const fv = new BattleFlowValidator()
    fv.registerActors([...heroMap.keys()])
    flowValidatorRef.current = fv
  }

  // Initialize Phase 7 battle HUD state
  setBattleBuffs({})
  setBattleEnergy(
    Object.fromEntries(
      [...playerBH, ...enemyBH].map(h => [h.uid, { current: h.energy, max: 1000 }])
    )
  )
  setSkillToasts([])
  setPassiveHints([])
  setBuffApplyHints([])

  // ★ 戰鬥開始時立即同步所有英雄的 maxHP / currentHP，
  //   讓 HealthBar3D 的分母使用 progression 加成後的 maxHP
  for (const bh of [...playerBH, ...enemyBH]) {
    const updater = bh.side === 'player' ? updatePlayerSlots : updateEnemySlots
    updater((prev) => {
      const ns = [...prev]
      const entry = ns[bh.slot]
      if (entry && entry._uid === bh.uid) {
        ns[bh.slot] = { ...entry, HP: bh.maxHP, currentHP: bh.currentHP }
      }
      return ns
    })
  }

  /* ── Helpers ── */
  const syncHpToSlot = (hero: BattleHero) => {
    const updater = hero.side === 'player' ? updatePlayerSlots : updateEnemySlots
    updater((prev) => {
      const ns = [...prev]
      const entry = ns[hero.slot]
      if (entry && entry._uid === hero.uid) {
        // ★ 同時更新 HP（maxHP）作為 HealthBar3D 的分母
        ns[hero.slot] = { ...entry, currentHP: Math.max(0, hero.currentHP), HP: hero.maxHP }
      }
      return ns
    })
  }

  const removeSlot = (hero: BattleHero) => {
    const updater = hero.side === 'player' ? updatePlayerSlots : updateEnemySlots
    updater((prev) => {
      const ns = [...prev]
      if (ns[hero.slot]?._uid === hero.uid) ns[hero.slot] = null
      return ns
    })
  }

  const getAdvancePos = (attacker: BattleHero, targetSlot: number, isAoe: boolean): Vector3Tuple => {
    const STOP_DIST = 1.5
    const dir = attacker.side === 'player' ? 1 : -1
    if (isAoe) return [0, 0, 0]
    const tgtPos = attacker.side === 'player'
      ? ENEMY_SLOT_POSITIONS[targetSlot]
      : PLAYER_SLOT_POSITIONS[targetSlot]
    return [tgtPos[0], 0, tgtPos[2] + STOP_DIST * dir]
  }

  /** 播放單一目標受擊/死亡動畫 */
  const playHitOrDeath = async (targetUid: string, dmg: number, killed: boolean, isDodge: boolean, damageType?: import('../types').DamageDisplayType) => {
    if (isDodge) {
      addDamage(targetUid, 0) // MISS
      await delay(350)
      return
    }
    addDamage(targetUid, dmg, damageType)
    if (!skipBattleRef.current) audioManager.playSfx('hit_normal')
    const hero = heroMap.get(targetUid)
    if (!hero) return

    // ★ 角色已被移除（前一次背景死亡已完成 removeSlot）→ 只顯傷害數字，不播動畫
    if (actorStatesRef.current[targetUid] === 'DEAD') return

    if (killed) {
      // 致死攻擊：直接閃紅光 + 扣血 → 死亡動畫
      syncHpToSlot(hero)
      if (!skipBattleRef.current) audioManager.playSfx('death')
      const deadDone = waitForAction(targetUid, 'DEAD')
      setActorState(targetUid, 'DEAD')
      await deadDone
      removeSlot(hero)
    } else {
      const hurtDone = waitForAction(targetUid, 'HURT')
      setActorState(targetUid, 'HURT')
      syncHpToSlot(hero)
      await hurtDone
      setActorState(targetUid, 'IDLE')
    }
  }

  /* ── onAction: 引擎行動 → 3D 演出 ── */
  /** 待完成的後退動畫（uid → Promise）—— 不阻塞下一個 action */
  const pendingRetreats = new Map<string, Promise<void>>()
  /** 背景動畫（死亡等長動畫）—— 不阻塞下一個 action，Phase C 前統一等待 */
  const backgroundAnims: Promise<void>[] = []
  /** 被動 hint 批次 gen：同一英雄連續 PASSIVE_TRIGGER 共享同一 gen，遇到其他 action 時 gen 遞增 */
  const passiveGenMap = new Map<string, number>()
  let lastActionWasPassive = false

  const onAction = async (action: BattleAction) => {
    // ── 戰鬥過程 log ──
    if (import.meta.env.DEV) {
      const brief = (() => {
        const a = action
        const name = (uid: string) => { const h = heroMap.get(uid); return h ? `[${h.side === 'player' ? '我' : '敵'}]${h.name}` : uid }
        switch (a.type) {
          case 'TURN_START': return `── 回合 ${a.turn} ──`
          case 'TURN_END': return `── 回合 ${a.turn} 結束 ──`
          case 'NORMAL_ATTACK': {
            const r = a.result
            const dmgStr = r.isDodge ? 'MISS' : `${r.damage}${r.isCrit ? ' 暴擊' : ''}`
            return `${name(a.attackerUid)} → ${name(a.targetUid)}  普攻 ${dmgStr}${a.killed ? ' 💀擊殺' : ''}${r.reflectDamage > 0 ? ` (反彈${r.reflectDamage})` : ''}`
          }
          case 'SKILL_CAST': {
            const tgts = a.targets.map(t => {
              const n = name(t.uid)
              if ('damage' in t.result) { const d = t.result as DamageResult; return `${n}:${d.isDodge ? 'MISS' : d.damage}${t.killed ? '💀' : ''}` }
              return `${n}:+${(t.result as { heal: number }).heal}HP`
            }).join(', ')
            return `${name(a.attackerUid)} 技能【${a.skillName}】→ ${tgts}`
          }
          case 'DOT_TICK': return `${name(a.targetUid)} ${statusZh(a.dotType)} -${a.damage}`
          case 'BUFF_APPLY': return `${name(a.targetUid)} +${statusZh(a.effect.type)}${a.effect.stacks > 1 ? `×${a.effect.stacks}` : ''} (${a.effect.duration}t)`
          case 'BUFF_EXPIRE': return `${name(a.targetUid)} -${statusZh(a.effectType)} 到期`
          case 'DEATH': return `${name(a.targetUid)} 💀 死亡`
          case 'PASSIVE_TRIGGER': return ''
          case 'PASSIVE_DAMAGE': return `${name(a.attackerUid)} → ${name(a.targetUid)} 效果傷害 ${a.damage}${a.killed ? ' 💀' : ''}`
          case 'ENERGY_CHANGE': return `${name(a.heroUid)} 能量 +${a.delta} → ${a.newValue}`
          case 'EXTRA_TURN': return `${name(a.heroUid)} 額外行動（${a.reason}）`
          case 'COUNTER_ATTACK': return `${name(a.attackerUid)} ↩️反擊 → ${name(a.targetUid)} ${a.damage}${a.killed ? ' 💀' : ''}`
          case 'CHASE_ATTACK': return `${name(a.attackerUid)} ⚡追擊 → ${name(a.targetUid)} ${a.damage}${a.killed ? ' 💀' : ''}`
          case 'EXECUTE': return `${name(a.attackerUid)} 💀斬殺 → ${name(a.targetUid)}`
          case 'STEAL_BUFF': return `${name(a.heroUid)} 偷取 ${name(a.targetUid)} 的 ${statusZh(a.buffType)}`
          case 'TRANSFER_DEBUFF': return `${name(a.heroUid)} 轉移 ${statusZh(a.debuffType)} → ${name(a.targetUid)}`
          case 'SHIELD_APPLY': return `${name(a.targetUid)} +護盾 ${a.value}`
          case 'SHIELD_BREAK': return `${name(a.heroUid)} 護盾破碎`
          case 'BATTLE_END': return `══ 戰鬥結束：${a.winner === 'player' ? '勝利' : a.winner === 'enemy' ? '失敗' : '平手'} ══`
          default: return JSON.stringify(a)
        }
      })()
      if (brief) console.log(`%c[Battle] ${brief}`, action.type === 'TURN_START' || action.type === 'BATTLE_END' ? 'color:#facc15;font-weight:bold' : action.type === 'DEATH' ? 'color:#ef4444' : 'color:#94a3b8')
    }

    // ★ 等待所有待完成的後退動畫
    if (action.type !== 'TURN_START' && action.type !== 'TURN_END' && action.type !== 'BATTLE_END') {
      if (pendingRetreats.size > 0) {
        await Promise.all(pendingRetreats.values())
        pendingRetreats.clear()
      }
    }

    // ★ 被動 hint gen 管理：非 PASSIVE_TRIGGER action 表示新一輪開始
    if (action.type !== 'PASSIVE_TRIGGER') {
      lastActionWasPassive = false
    }

    switch (action.type) {

      case 'TURN_START':
        turnRef.current = action.turn
        setTurn(action.turn)
        break

      case 'TURN_END':
        await delay(100)
        break

      case 'NORMAL_ATTACK': {
        const atk = heroMap.get(action.attackerUid)!
        const tgt = heroMap.get(action.targetUid)!

        // ★ 攻擊者已死 → 跳過整個 action
        if (actorStatesRef.current[action.attackerUid] === 'DEAD') break
        // ★ 目標已死 → 只顯傷害數字
        if (actorStatesRef.current[action.targetUid] === 'DEAD') {
          if (!action.result.isDodge) {
            const deadDmgType: import('../types').DamageDisplayType = action.result.isCrit ? 'crit' : 'normal'
            addDamage(action.targetUid, action.result.damage, deadDmgType)
          }
          break
        }

        // 1) 前進
        moveTargetsRef.current = { ...moveTargetsRef.current, [action.attackerUid]: getAdvancePos(atk, tgt.slot, false) }
        setActorState(action.attackerUid, 'ADVANCING')
        await waitForMove(action.attackerUid)

        // 2) 攻擊動作
        const atkDone = waitForAction(action.attackerUid, 'ATTACKING')
        setActorState(action.attackerUid, 'ATTACKING')
        await delay(ATTACK_DELAY_MS)

        // 3) 命中時機 → 同時更新攻擊者 & 目標能量
        if (action._atkEnergyNew != null) {
          setBattleEnergy((prev) => {
            if (!prev[action.attackerUid]) return prev
            return { ...prev, [action.attackerUid]: { current: action._atkEnergyNew!, max: prev[action.attackerUid]?.max ?? 1000 } }
          })
        }
        if (action._tgtEnergyNew != null) {
          setBattleEnergy((prev) => {
            if (!prev[action.targetUid]) return prev
            return { ...prev, [action.targetUid]: { current: action._tgtEnergyNew!, max: prev[action.targetUid]?.max ?? 1000 } }
          })
        }
        if (action.result.isCrit && !skipBattleRef.current) audioManager.playSfx('hit_critical')

        // 3+4) 受傷/死亡 與 攻擊者後退 同時並行
        const hitDmgType: import('../types').DamageDisplayType = action.result.isCrit ? 'crit' : 'normal'
        const hitPromise = playHitOrDeath(action.targetUid, action.result.damage, action.killed, action.result.isDodge, hitDmgType)

        const retreatPromise = (async () => {
          await atkDone
          if ((heroMap.get(action.attackerUid)?.currentHP ?? 0) > 0) {
            // ★ 反彈傷害但存活
            if (action.result.reflectDamage > 0) {
              addDamage(action.attackerUid, action.result.reflectDamage, 'reflect')
              const atkHero = heroMap.get(action.attackerUid)
              if (atkHero) syncHpToSlot(atkHero)
            }
            setActorState(action.attackerUid, 'RETREATING')
            await waitForMove(action.attackerUid)
            setActorState(action.attackerUid, 'IDLE')
          } else {
            // ★ 攻擊者被反彈傷害致死
            const atkHero = heroMap.get(action.attackerUid)
            if (atkHero) {
              if (action.result.reflectDamage > 0) addDamage(action.attackerUid, action.result.reflectDamage, 'reflect')
              syncHpToSlot(atkHero)
              if (!skipBattleRef.current) audioManager.playSfx('death')
              const deadDone = waitForAction(action.attackerUid, 'DEAD')
              setActorState(action.attackerUid, 'DEAD')
              await deadDone
              removeSlot(atkHero)
            }
          }
        })()

        // ★ 致死攻擊：死亡動畫在背景執行（不阻塞下一個 action）
        if (action.killed) {
          backgroundAnims.push(hitPromise)
        } else {
          await hitPromise
        }
        pendingRetreats.set(action.attackerUid, retreatPromise)

        break
      }

      case 'SKILL_CAST': {
        const atk = heroMap.get(action.attackerUid)!

        // ★ 攻擊者已死 → 跳過整個技能 action
        if (actorStatesRef.current[action.attackerUid] === 'DEAD') break

        // ★ 大招施放前先確保能量條顯示為滿（能量滿才能施放，但前端可能還沒渲染到 1000）
        setBattleEnergy((prev) => {
          const entry = prev[action.attackerUid]
          if (!entry) return prev
          const maxE = entry.max ?? 1000
          if (entry.current >= maxE) return prev // 已滿則不更新
          return { ...prev, [action.attackerUid]: { current: maxE, max: maxE } }
        })
        // 短暫等待讓玩家看到能量條滿的狀態
        await delay(250)

        if (!skipBattleRef.current) audioManager.playSfx('skill_cast')

        // Phase 7: 技能名稱彈幕
        setSkillToasts((prev) => [...prev, {
          id: ++skillToastIdRef.current,
          heroName: atk.name,
          skillName: action.skillName,
          timestamp: Date.now(),
          attackerUid: action.attackerUid,
        }])

        // 判斷是否有傷害目標
        const hasDamageTargets = action.targets.some(t => 'damage' in t.result)

        if (hasDamageTargets) {
          const firstDmgTarget = action.targets.find(t => 'damage' in t.result)
          const isAoe = action.targets.filter(t => 'damage' in t.result).length > 1
          const targetSlot = firstDmgTarget ? (heroMap.get(firstDmgTarget.uid)?.slot ?? 0) : 0

          // 1) 前進
          moveTargetsRef.current = { ...moveTargetsRef.current, [action.attackerUid]: getAdvancePos(atk, targetSlot, isAoe) }
          setActorState(action.attackerUid, 'ADVANCING')
          await waitForMove(action.attackerUid)
        }

        // 2) 攻擊動作
        const atkDone = waitForAction(action.attackerUid, 'ATTACKING')
        setActorState(action.attackerUid, 'ATTACKING')
        addSkillFlash(action.attackerUid)
        await delay(ATTACK_DELAY_MS)

        // ★ 命中時機 → 更新攻擊者能量（大招消耗歸零）
        if (action._atkEnergyNew != null) {
          setBattleEnergy((prev) => {
            if (!prev[action.attackerUid]) return prev
            return { ...prev, [action.attackerUid]: { current: action._atkEnergyNew!, max: prev[action.attackerUid]?.max ?? 1000 } }
          })
        }

        // 3) 所有目標同時播放效果
        const mergedTargets = new Map<string, { uid: string; damage: number; killed: boolean; isDodge: boolean; heal: number }>()
        for (const t of action.targets) {
          if ('damage' in t.result) {
            const dr = t.result as DamageResult
            const existing = mergedTargets.get(t.uid)
            if (existing) {
              existing.damage += dr.damage
              existing.killed = existing.killed || (t.killed ?? false)
              existing.isDodge = existing.isDodge && dr.isDodge
            } else {
              mergedTargets.set(t.uid, { uid: t.uid, damage: dr.damage, killed: t.killed ?? false, isDodge: dr.isDodge, heal: 0 })
            }
          } else {
            const hr = t.result as { heal: number }
            const existing = mergedTargets.get(t.uid)
            if (existing) {
              existing.heal += hr.heal
            } else {
              mergedTargets.set(t.uid, { uid: t.uid, damage: 0, killed: false, isDodge: false, heal: hr.heal })
            }
          }
        }

        const hurtPromises: Promise<void>[] = []
        const deathPromises: Promise<void>[] = []
        for (const [uid, m] of mergedTargets) {
          // ★ 受擊動畫前 → 更新該目標能量
          if (action._tgtEnergyMap?.[uid] != null) {
            setBattleEnergy((prev) => {
              if (!prev[uid]) return prev
              return { ...prev, [uid]: { current: action._tgtEnergyMap![uid], max: prev[uid]?.max ?? 1000 } }
            })
          }
          if (m.damage > 0 || m.isDodge) {
            // 技能多目標：從 action.targets 取該 uid 的暴擊/屬性資訊
            const tgtResult = action.targets.find((t: { uid: string; result: DamageResult | { heal: number } }) => t.uid === uid && 'damage' in t.result)
            const dr = tgtResult?.result as DamageResult | undefined
            const skillDmgType: import('../types').DamageDisplayType = dr?.isCrit ? 'crit' : 'normal'
            const p = playHitOrDeath(uid, m.damage, m.killed, m.isDodge, skillDmgType)
            if (m.killed) deathPromises.push(p)
            else hurtPromises.push(p)
          }
          if (m.heal > 0) {
            addDamage(uid, -m.heal, 'heal') // 負值 = 治療
            const hero = heroMap.get(uid)
            if (hero) syncHpToSlot(hero)
          }
        }
        // ★ 只等非致死受傷動畫；死亡動畫在背景執行
        await Promise.all(hurtPromises)
        backgroundAnims.push(...deathPromises)

        // 4) 攻擊者後退
        const skillRetreatPromise = (async () => {
          await atkDone
          if ((heroMap.get(action.attackerUid)?.currentHP ?? 0) > 0) {
            // ★ 反彈傷害但存活
            const totalReflect = action.targets.reduce((sum: number, t: { uid: string; result: DamageResult | { heal: number }; killed?: boolean }) => {
              if ('damage' in t.result) return sum + (t.result as DamageResult).reflectDamage
              return sum
            }, 0)
            if (totalReflect > 0) {
              addDamage(action.attackerUid, totalReflect, 'reflect')
              const atkHeroAlive = heroMap.get(action.attackerUid)
              if (atkHeroAlive) syncHpToSlot(atkHeroAlive)
            }
            if (hasDamageTargets) {
              setActorState(action.attackerUid, 'RETREATING')
              await waitForMove(action.attackerUid)
            }
            setActorState(action.attackerUid, 'IDLE')
          } else {
            // ★ 攻擊者被反彈傷害致死
            const atkHero = heroMap.get(action.attackerUid)
            if (atkHero) {
              syncHpToSlot(atkHero)
              if (!skipBattleRef.current) audioManager.playSfx('death')
              const deadDone2 = waitForAction(action.attackerUid, 'DEAD')
              setActorState(action.attackerUid, 'DEAD')
              await deadDone2
              removeSlot(atkHero)
            }
          }
        })()

        pendingRetreats.set(action.attackerUid, skillRetreatPromise)

        break
      }

      case 'DOT_TICK': {
        if (action.damage > 0) {
          addDamage(action.targetUid, action.damage, 'dot')
          const hero = heroMap.get(action.targetUid)
          if (hero) {
            syncHpToSlot(hero)
            if (hero.currentHP <= 0 && actorStatesRef.current[action.targetUid] !== 'DEAD') {
              await delay(200)
              if (!skipBattleRef.current) audioManager.playSfx('death')
              const deadDone = waitForAction(action.targetUid, 'DEAD')
              setActorState(action.targetUid, 'DEAD')
              await deadDone
              removeSlot(hero)
              break
            }
          }
        }
        await delay(200)
        break
      }

      case 'PASSIVE_DAMAGE': {
        if (action.damage > 0) {
          addDamage(action.targetUid, action.damage, 'normal')
          const hero = heroMap.get(action.targetUid)
          if (hero) {
            syncHpToSlot(hero)
            if (hero.currentHP <= 0 && actorStatesRef.current[action.targetUid] !== 'DEAD') {
              await delay(200)
              if (!skipBattleRef.current) audioManager.playSfx('death')
              const deadDone = waitForAction(action.targetUid, 'DEAD')
              setActorState(action.targetUid, 'DEAD')
              await deadDone
              removeSlot(hero)
              break
            }
          }
        }
        await delay(200)
        break
      }

      case 'DEATH': {
        const hero = heroMap.get(action.targetUid)
        // ★ 已經在 DEAD 狀態 → 跳過
        if (!hero || actorStatesRef.current[action.targetUid] === 'DEAD') break
        syncHpToSlot(hero)
        if (!skipBattleRef.current) audioManager.playSfx('death')
        const deadDone = waitForAction(action.targetUid, 'DEAD')
        setActorState(action.targetUid, 'DEAD')
        await deadDone
        removeSlot(hero)
        break
      }

      case 'BUFF_APPLY': {
        const { targetUid, effect } = action
        setBattleBuffs((prev) => {
          const list = [...(prev[targetUid] || [])]
          const idx = list.findIndex((e) => e.type === effect.type)
          if (idx >= 0) list[idx] = effect
          else list.push(effect)
          return { ...prev, [targetUid]: list }
        })
        // ★ Buff/Debuff 施加漂浮文字提示
        const bhId = ++buffApplyHintIdRef.current
        const isBuff = BUFF_TYPE_SET.has(effect.type)
        setBuffApplyHints((prev) => [...prev, {
          id: bhId,
          effectType: effect.type,
          isBuff,
          timestamp: Date.now(),
          heroUid: targetUid,
        }])
        setTimeout(() => setBuffApplyHints((prev) => prev.filter((h) => h.id !== bhId)), 2000)
        addBuffVfx(targetUid)
        break
      }

      case 'BUFF_EXPIRE': {
        const { targetUid, effectType } = action
        setBattleBuffs((prev) => {
          const list = (prev[targetUid] || []).filter((e) => e.type !== effectType)
          return { ...prev, [targetUid]: list }
        })
        break
      }

      case 'ENERGY_CHANGE': {
        const { heroUid, newValue } = action
        setBattleEnergy((prev) => {
          if (!prev[heroUid]) return prev
          return { ...prev, [heroUid]: { current: newValue, max: prev[heroUid]?.max ?? 1000 } }
        })
        break
      }

      case 'PASSIVE_TRIGGER': {
        const phId = ++passiveHintIdRef.current
        // 同一英雄連續 PASSIVE_TRIGGER → 同一 gen 共存；中間穿插其他 action → 新 gen 清舊的
        if (!lastActionWasPassive) {
          // 開始新一批：遞增該英雄的 gen
          passiveGenMap.set(action.heroUid, (passiveGenMap.get(action.heroUid) ?? 0) + 1)
        }
        lastActionWasPassive = true
        const gen = passiveGenMap.get(action.heroUid)!
        setPassiveHints((prev) => [...prev.filter((h) => h.heroUid !== action.heroUid || h.gen === gen), {
          id: phId,
          skillName: action.skillName,
          timestamp: Date.now(),
          heroUid: action.heroUid,
          gen,
        }])
        setTimeout(() => setPassiveHints((prev) => prev.filter((h) => h.id !== phId)), 2000)
        break
      }

      case 'EXTRA_TURN':
        break

      // v2.0 新增 action 類型
      case 'COUNTER_ATTACK':
      case 'CHASE_ATTACK': {
        const cAtk = heroMap.get(action.attackerUid)
        const cTgt = heroMap.get(action.targetUid)
        if (!cAtk || actorStatesRef.current[action.attackerUid] === 'DEAD') break

        // 1) 前進到目標位置
        if (cTgt && actorStatesRef.current[action.targetUid] !== 'DEAD') {
          moveTargetsRef.current = { ...moveTargetsRef.current, [action.attackerUid]: getAdvancePos(cAtk, cTgt.slot, false) }
          setActorState(action.attackerUid, 'ADVANCING')
          await waitForMove(action.attackerUid)
        }

        // 2) 攻擊動作
        const caDone = waitForAction(action.attackerUid, 'ATTACKING')
        setActorState(action.attackerUid, 'ATTACKING')
        await delay(ATTACK_DELAY_MS * 0.6)

        // 3) 傷害 + 受擊
        const dmg = action.damage
        if (dmg > 0) {
          addDamage(action.targetUid, dmg, 'normal')
          if (!skipBattleRef.current) audioManager.playSfx('hit_normal')
          const tgtHero = heroMap.get(action.targetUid)
          if (tgtHero) syncHpToSlot(tgtHero)
          if (action.killed && actorStatesRef.current[action.targetUid] !== 'DEAD') {
            if (!skipBattleRef.current) audioManager.playSfx('death')
            const deadDone = waitForAction(action.targetUid, 'DEAD')
            setActorState(action.targetUid, 'DEAD')
            backgroundAnims.push(deadDone.then(() => { const dh = heroMap.get(action.targetUid); if (dh) removeSlot(dh) }))
          } else if (cTgt && actorStatesRef.current[action.targetUid] !== 'DEAD') {
            const hDone = waitForAction(action.targetUid, 'HURT')
            setActorState(action.targetUid, 'HURT')
            await hDone
            setActorState(action.targetUid, 'IDLE')
          }
        }

        // 4) 後退
        await caDone
        if ((cAtk.currentHP ?? 0) > 0 && actorStatesRef.current[action.attackerUid] !== 'DEAD') {
          setActorState(action.attackerUid, 'RETREATING')
          await waitForMove(action.attackerUid)
          setActorState(action.attackerUid, 'IDLE')
        }
        break
      }

      case 'EXECUTE': {
        addDamage(action.targetUid, 0, 'execute')
        if (!skipBattleRef.current) audioManager.playSfx('hit_critical')
        const exHero = heroMap.get(action.targetUid)
        if (exHero) syncHpToSlot(exHero)
        await delay(300)
        // DEATH action follows separately
        break
      }

      case 'STEAL_BUFF':
      case 'TRANSFER_DEBUFF':
        // 視覺效果由 BUFF_APPLY / BUFF_EXPIRE 處理
        break

      case 'SHIELD_APPLY': {
        const hero = heroMap.get(action.targetUid)
        if (hero) syncHpToSlot(hero)
        break
      }

      case 'SHIELD_BREAK':
        break

      case 'BATTLE_END':
        break
    }
  }

  // ── Phase A：後端權威戰鬥（伺服器計算，前端只播放） ──
  setBattleCalculating(true)
  let allActions: BattleAction[]
  let winner: 'player' | 'enemy' | 'draw'
  let needsHpSync = false
  let serverResult: CompleteBattleResult | null = null

  if (replayActions) {
    allActions = replayActions
    const endAct = replayActions.find(a => a.type === 'BATTLE_END') as { type: 'BATTLE_END'; winner: 'player' | 'enemy' | 'draw' } | undefined
    winner = endAct?.winner ?? 'draw'
    needsHpSync = true
  } else {
    // ── 快照當前英雄資料送後端 ──
    const snapshotPlayers = JSON.parse(JSON.stringify(playerBH)) as BattleHero[]
    const snapshotEnemies = JSON.parse(JSON.stringify(enemyBH)) as BattleHero[]
    const bossMaxTurns = stageMode === 'boss' ? (getBossConfig(stageId)?.turnLimit ?? 20) : 50
    const dungeonTier = stageMode === 'daily' ? (stageId.split('_').pop() || 'normal') : undefined

    // ── 等待後端戰鬥模擬 + 獎勵計算 ──
    try {
      serverResult = await completeBattle({
        stageMode, stageId,
        players: snapshotPlayers,
        enemies: snapshotEnemies,
        maxTurns: bossMaxTurns,
        dungeonTier,
      })
    } catch (err) {
      console.error('[Battle] 伺服器戰鬥請求失敗:', err)
      showToast('⚠️ 伺服器連線失敗，無法進行戰鬥')
      setBattleCalculating(false)
      return
    }

    if (!serverResult?.success) {
      console.error('[Battle] 伺服器戰鬥失敗:', serverResult?.error)
      showToast(`⚠️ 戰鬥結算失敗：${serverResult?.error ?? '未知錯誤'}`)
      setBattleCalculating(false)
      return
    }

    // ── 使用伺服器回傳的 actions 與 winner ──
    allActions = (serverResult.actions ?? []) as BattleAction[]
    winner = (serverResult.winner as 'player' | 'enemy' | 'draw') || 'draw'

    // ★ 重置 heroMap HP 為初始值（Phase B 播放期間漸進更新）
    for (const bh of [...playerBH, ...enemyBH]) {
      bh.currentHP = bh.maxHP
      bh.energy = 0
    }
    needsHpSync = true
  }

  // ── Phase B：播放動畫（可中途跳過） ──
  setBattleCalculating(false)

  // ── Boss 模式即時傷害追蹤 ──
  let bossDmgAccum = 0
  const playerUids = new Set(playerBH.map(bh => bh.uid))
  const extractPlayerDamage = (act: BattleAction): number => {
    let dmg = 0
    if (act.type === 'NORMAL_ATTACK') {
      if (playerUids.has(act.attackerUid) && !act.result.isDodge) dmg += act.result.damage
    } else if (act.type === 'SKILL_CAST') {
      if (playerUids.has(act.attackerUid)) {
        for (const t of act.targets) {
          if ('damage' in t.result) {
            const dr = t.result as DamageResult
            if (!dr.isDodge) dmg += dr.damage
          }
        }
      }
    } else if (act.type === 'DOT_TICK' && act.sourceUid && playerUids.has(act.sourceUid)) {
      dmg += act.damage
    } else if (act.type === 'PASSIVE_DAMAGE' && playerUids.has(act.attackerUid)) {
      dmg += act.damage
    }
    return dmg
  }
  if (stageMode === 'boss') setBossDamageProgress(0)

  const applyHpFromAction = (act: BattleAction) => {
    if (act.type === 'NORMAL_ATTACK') {
      const tgt = heroMap.get(act.targetUid)
      if (tgt && !act.result.isDodge) tgt.currentHP = Math.max(0, tgt.currentHP - act.result.damage)
      if (act.result.reflectDamage > 0) {
        const atkH = heroMap.get(act.attackerUid)
        if (atkH) atkH.currentHP = Math.max(0, atkH.currentHP - act.result.reflectDamage)
      }
    } else if (act.type === 'SKILL_CAST') {
      const atkHero = heroMap.get(act.attackerUid)
      for (const t of act.targets) {
        const h = heroMap.get(t.uid)
        if (!h) continue
        if ('damage' in t.result) {
          const dr = t.result as DamageResult
          h.currentHP = Math.max(0, h.currentHP - dr.damage)
          if (dr.reflectDamage > 0 && atkHero) atkHero.currentHP = Math.max(0, atkHero.currentHP - dr.reflectDamage)
        } else if ('heal' in t.result) {
          h.currentHP = Math.min(h.maxHP, h.currentHP + (t.result as { heal: number }).heal)
        }
      }
    } else if (act.type === 'DOT_TICK') {
      const h = heroMap.get(act.targetUid)
      if (h) h.currentHP = Math.max(0, h.currentHP - act.damage)
    } else if (act.type === 'PASSIVE_DAMAGE') {
      const h = heroMap.get(act.targetUid)
      if (h) h.currentHP = Math.max(0, h.currentHP - act.damage)
    }
  }

  for (const act of allActions) {
    if (skipBattleRef.current) {
      if (needsHpSync) applyHpFromAction(act)
      if (stageMode === 'boss') { bossDmgAccum += extractPlayerDamage(act) }
      continue
    }
    if (needsHpSync) applyHpFromAction(act)
    if (stageMode === 'boss') {
      bossDmgAccum += extractPlayerDamage(act)
      setBossDamageProgress(bossDmgAccum)
    }
    if (import.meta.env.DEV && flowValidatorRef.current) flowValidatorRef.current.beforeAction(act)
    await onAction(act)
    if (import.meta.env.DEV && flowValidatorRef.current) flowValidatorRef.current.afterAction(act)
  }
  // 跳過模式結束後同步最終傷害
  if (stageMode === 'boss') setBossDamageProgress(bossDmgAccum)

  // 等待背景動畫
  const allPending: Promise<void>[] = [...backgroundAnims]
  if (pendingRetreats.size > 0) {
    allPending.push(...pendingRetreats.values())
    pendingRetreats.clear()
  }
  if (allPending.length > 0) {
    await Promise.race([
      Promise.all(allPending),
      delay(1200),
    ])
  }

  // ★ 強制歸位
  for (const [uid, st] of Object.entries(actorStatesRef.current)) {
    if (st === 'ATTACKING' || st === 'RETREATING') {
      setActorState(uid, 'IDLE')
    }
  }
  // ★ 清除殘留 Promise
  clearAllPromises()

  // dev 模式：驗證 + 報告
  if (import.meta.env.DEV && flowValidatorRef.current) {
    flowValidatorRef.current.validateEnd()
    flowValidatorRef.current.report()
    flowValidatorRef.current = null
  }

  // 保存 actions（供回放 + 統計）
  if (!isReplay) battleActionsRef.current = allActions

  // ── Phase C：應用最終狀態到 slot ──
  for (const [, bh] of heroMap) {
    if (bh.currentHP <= 0) {
      const pending = actionResolveRefs.current[bh.uid]
      if (pending) {
        pending.resolve()
        delete actionResolveRefs.current[bh.uid]
      }
      const updater = bh.side === 'player' ? updatePlayerSlots : updateEnemySlots
      updater((prev) => {
        const ns = [...prev]
        if (ns[bh.slot]?._uid === bh.uid) ns[bh.slot] = null
        return ns
      })
    } else {
      const updater = bh.side === 'player' ? updatePlayerSlots : updateEnemySlots
      updater((prev) => {
        const ns = [...prev]
        const entry = ns[bh.slot]
        if (entry && entry._uid === bh.uid) ns[bh.slot] = { ...entry, currentHP: Math.max(0, bh.currentHP) }
        return ns
      })
    }
  }

  // ── 計算戰鬥統計 ──
  const stats: Record<string, BattleStatEntry> = {}
  const ensureStat = (uid: string) => {
    if (!stats[uid]) {
      const h = heroMap.get(uid)
      stats[uid] = { name: h?.name ?? uid, side: h?.side ?? 'enemy', damageDealt: 0, healingDone: 0, damageTaken: 0 }
    }
  }
  for (const act of (replayActions ?? battleActionsRef.current)) {
    if (act.type === 'NORMAL_ATTACK') {
      ensureStat(act.attackerUid); ensureStat(act.targetUid)
      if (!act.result.isDodge) {
        stats[act.attackerUid].damageDealt += act.result.damage
        stats[act.targetUid].damageTaken += act.result.damage
      }
      if (act.result.reflectDamage > 0) {
        stats[act.attackerUid].damageTaken += act.result.reflectDamage
        stats[act.targetUid].damageDealt += act.result.reflectDamage
      }
    } else if (act.type === 'SKILL_CAST') {
      ensureStat(act.attackerUid)
      for (const t of act.targets) {
        ensureStat(t.uid)
        if ('damage' in t.result) {
          const dr = t.result as DamageResult
          if (!dr.isDodge) {
            stats[act.attackerUid].damageDealt += dr.damage
            stats[t.uid].damageTaken += dr.damage
          }
          if (dr.reflectDamage > 0) {
            stats[act.attackerUid].damageTaken += dr.reflectDamage
            stats[t.uid].damageDealt += dr.reflectDamage
          }
        } else if ('heal' in t.result) {
          stats[act.attackerUid].healingDone += (t.result as { heal: number }).heal
        }
      }
    } else if (act.type === 'DOT_TICK') {
      ensureStat(act.targetUid)
      stats[act.targetUid].damageTaken += act.damage
      if (act.sourceUid) {
        ensureStat(act.sourceUid)
        stats[act.sourceUid].damageDealt += act.damage
      }
    } else if (act.type === 'PASSIVE_DAMAGE') {
      ensureStat(act.targetUid)
      ensureStat(act.attackerUid)
      stats[act.targetUid].damageTaken += act.damage
      stats[act.attackerUid].damageDealt += act.damage
    }
  }
  setBattleStats(stats)

  // ── 結算（serverResult 已在 Phase A 取得） ──
  // Boss 模式：無論勝敗都依傷害量發放獎勵
  const isBossMode = stageMode === 'boss'
  if (winner === 'player' || isBossMode) {
    setBattleResult(isBossMode ? 'victory' : 'victory')

    if (!isReplay) {
      // 僅使用伺服器回傳的獎勵資料
      let rewardGold = 0, rewardDiamond = 0
      let first = false
      let resourceSpeed: { goldPerHour: number; expPerHour: number } | null = null
      let rewards: StageReward = { exp: 0, gold: 0, diamond: 0 }

      // ★ 優先使用伺服器回傳的獎勵（後端已寫入 DB，前端必須與 DB 一致）
      if (serverResult) {
        rewards = {
          exp: serverResult.rewards.exp,
          gold: serverResult.rewards.gold,
          diamond: serverResult.rewards.diamond,
          items: (serverResult.rewards.items ?? []).map((it: { itemId: string; quantity: number; dropRate?: number }) => ({
            itemId: it.itemId,
            quantity: it.quantity,
            dropRate: 1.0,  // 後端已完成掉落判定，前端直接顯示
          })),
        }
        first = serverResult.isFirstClear
      }

      // 伺服器失敗 → 不發獎勵，顯示錯誤提示
      if (!serverResult && !isReplay) {
        showToast('⚠️ 伺服器結算失敗，獎勵未發放')
        setBattleResult('victory')
        setVictoryRewards(null)
        return
      }

      if (stageMode === 'story') {
        const timerStage = first ? stageId : (saveData?.resourceTimerStage || stageId)
        resourceSpeed = getTimerYield(timerStage)
      }

      // 判斷是否為競技場挑戰（後續用於分流獎勵邏輯）
      const isArenaChallenge = stageMode === 'pvp' && arenaTargetRankRef.current > 0

      if (stageMode === 'pvp') {
        // 競技場先顯示 loading 狀態，等 arena API 回來再更新
        if (isArenaChallenge) {
          setVictoryRewards({ gold: 0, diamond: 0, exp: 0, drops: [], resourceSpeed: null, loading: true })
        }
        // 競技場結算上報
        if (arenaTargetRankRef.current > 0) {
          completeArenaChallenge(arenaTargetRankRef.current, true).then(async arenaRes => {
            if (arenaRes.success) {
              // 以伺服器 currencies 覆蓋本地
              if (arenaRes.currencies) {
                const { applyCurrenciesFromServer } = await import('../services/saveService')
                applyCurrenciesFromServer(arenaRes.currencies)
              }
              const r = arenaRes.rewards
              if (r) {
                showToast(`🏆 排名提升至 #${arenaRes.newRank ?? '?'}！`)
                const arenaItems: AcquireItem[] = []
                if (r.diamond > 0) arenaItems.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: r.diamond, rarity: 'SR' })
                if (r.gold > 0) arenaItems.push({ type: 'currency', id: 'gold', name: '金幣', quantity: r.gold })
                if (r.pvpCoin > 0) arenaItems.push({ type: 'item', id: 'pvp_coin', name: '競技幣', quantity: r.pvpCoin })
                if (r.exp > 0) arenaItems.push({ type: 'currency', id: 'exp', name: '經驗', quantity: r.exp })
                if (arenaItems.length > 0) acquireShow(arenaItems)
                // 即時同步 pvp_coin 到本地背包快取
                if (r.pvpCoin > 0) {
                  addItemsLocally([{ itemId: 'pvp_coin', quantity: r.pvpCoin }])
                }
                // 更新勝利面板顯示正確的競技場獎勵（結束 loading 狀態）
                setVictoryRewards({
                  gold: r.gold,
                  diamond: r.diamond,
                  exp: r.exp,
                  drops: r.pvpCoin > 0 ? [{ itemId: 'pvp_coin', quantity: r.pvpCoin }] : [],
                  resourceSpeed: null,
                  loading: false,
                })
              }
              // 排名里程碑獎勵動畫
              const mr = arenaRes.milestoneReward
              if (mr) {
                const milestoneItems: AcquireItem[] = []
                if (mr.diamond > 0) milestoneItems.push({ type: 'currency', id: 'diamond', name: '鑽石（里程碑）', quantity: mr.diamond, rarity: 'SR' })
                if (mr.gold > 0) milestoneItems.push({ type: 'currency', id: 'gold', name: '金幣（里程碑）', quantity: mr.gold })
                if (mr.pvpCoin > 0) milestoneItems.push({ type: 'item', id: 'pvp_coin', name: '競技幣（里程碑）', quantity: mr.pvpCoin })
                if (mr.exp > 0) milestoneItems.push({ type: 'currency', id: 'exp', name: '經驗（里程碑）', quantity: mr.exp })
                if (milestoneItems.length > 0) {
                  showToast(`🎯 排名里程碑獎勵！`)
                  setTimeout(() => acquireShow(milestoneItems), 1500)
                }
                // 即時同步里程碑 pvp_coin 到本地背包快取
                if (mr.pvpCoin > 0) {
                  addItemsLocally([{ itemId: 'pvp_coin', quantity: mr.pvpCoin }])
                }
              }
            } else {
              // API 回應不成功 → 清除 loading
              setVictoryRewards({ gold: 0, diamond: 0, exp: 0, drops: [], resourceSpeed: null, loading: false })
            }
          }).catch((err) => {
            console.warn(err)
            // API 失敗時清除 loading 狀態，顯示結算失敗
            setVictoryRewards({ gold: 0, diamond: 0, exp: 0, drops: [], resourceSpeed: null, loading: false })
            showToast('⚠️ 競技場結算失敗')
          })
        }
      }

      rewardGold = rewards.gold
      rewardDiamond = rewards.diamond ?? 0

      // 抽取掉落物（仍由前端處理）
      const allDrops = mergeDrops(rollDrops(rewards))
      // 分離經驗資源掉落與一般道具掉落
      const expDropTotal = allDrops.filter(d => d.itemId === 'exp').reduce((s, d) => s + d.quantity, 0)
      const drops = allDrops.filter(d => d.itemId !== 'exp')
      const rewardExp = (rewards.exp ?? 0) + expDropTotal

      // ── 本地狀態同步（使用伺服器 currencies 絕對值） ──
      if (serverResult?.currencies) {
        const { applyCurrenciesFromServer } = await import('../services/saveService')
        applyCurrenciesFromServer(serverResult.currencies)
      }

      // 推進劇情進度（伺服器已寫入 DB，此處同步本地內存）
      if (stageMode === 'story' && first && serverResult?.newStoryProgress) {
        doUpdateStory(serverResult.newStoryProgress.chapter, serverResult.newStoryProgress.stage)
        // 伺服器已自動結算舊產速的離線資源並重置 lastCollect，同步本地
        doUpdateProgress({
          resourceTimerStage: stageId,
          // lastCollect 一律使用伺服器回傳的時間戳（不自行生成）
          ...(serverResult.resourceTimerLastCollect
            ? { resourceTimerLastCollect: serverResult.resourceTimerLastCollect }
            : {}),
        })
      }

      // 推進爬塔樓層
      if (stageMode === 'tower' && serverResult?.newFloor) {
        doUpdateProgress({ towerFloor: serverResult.newFloor })
      }

      // 掉落物即時寫入本地背包
      if (drops.length > 0) addItemsLocally(drops)

      // 非競技場：直接顯示獎勵；競技場：由 arena handler 的 .then() 更新
      if (!isArenaChallenge) {
        setVictoryRewards({
          gold: rewardGold,
          diamond: rewardDiamond,
          exp: rewardExp,
          drops,
          resourceSpeed,
        })
      }
      if (!isArenaChallenge) {
        const acquireItems: AcquireItem[] = []
        if (rewardGold > 0) acquireItems.push({ type: 'currency', id: 'gold', name: '金幣', quantity: rewardGold })
        if (rewardDiamond > 0) acquireItems.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: rewardDiamond, rarity: 'SR' })
        if (rewardExp > 0) acquireItems.push({ type: 'currency', id: 'exp', name: '經驗', quantity: rewardExp })
        for (const d of drops) {
          acquireItems.push({ type: 'item', id: d.itemId, name: getItemName(d.itemId), quantity: d.quantity })
        }
        if (acquireItems.length > 0) acquireShow(acquireItems)
      }
    }
  } else if (winner === 'enemy') {
    setBattleResult('defeat')
    if (!isReplay) setVictoryRewards(null)
    // 競技場敗北上報
    if (!isReplay && stageMode === 'pvp' && arenaTargetRankRef.current > 0) {
      completeArenaChallenge(arenaTargetRankRef.current, false).then(async arenaRes => {
        if (arenaRes.success) {
          if (arenaRes.currencies) {
            const { applyCurrenciesFromServer } = await import('../services/saveService')
            applyCurrenciesFromServer(arenaRes.currencies)
          }
          const r = arenaRes.rewards
          if (r) {
            showToast('💀 挑戰失敗，獲得安慰獎')
            const arenaItems: AcquireItem[] = []
            if (r.gold > 0) arenaItems.push({ type: 'currency', id: 'gold', name: '金幣', quantity: r.gold })
            if (r.pvpCoin > 0) arenaItems.push({ type: 'item', id: 'pvp_coin', name: '競技幣', quantity: r.pvpCoin })
            if (r.exp > 0) arenaItems.push({ type: 'currency', id: 'exp', name: '經驗', quantity: r.exp })
            if (arenaItems.length > 0) acquireShow(arenaItems)
            // 即時同步 pvp_coin 到本地背包快取
            if (r.pvpCoin > 0) {
              addItemsLocally([{ itemId: 'pvp_coin', quantity: r.pvpCoin }])
            }
          }
        }
      }).catch(console.warn)
    }
  } else {
    setBattleResult('defeat')
    if (!isReplay) setVictoryRewards(null)
  }
  isReplayingRef.current = false
  setGameState('GAMEOVER')
}
