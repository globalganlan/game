/**
 * useBattleFlow — 戰鬥流程控制
 *
 * 從 App.tsx 抽出：resetBattleState / buildBattleCtx / retryBattle /
 * replayBattle / backToLobby / goNextStage / runBattleLoop / startAutoBattle
 */
import { useCallback } from 'react'
import type { GameState, MenuScreen, SlotHero, ActorState, AnimationState, RawHeroData } from '../types'
import type { BattleAction, BattleHero, SkillTemplate } from '../domain'
import type { HeroSkillConfig } from '../domain/types'
import type { RawHeroInput } from '../domain'
import type { Vector3Tuple } from 'three'
import type { SaveData, HeroInstance } from '../services/saveService'
import type { BattleLoopContext } from '../game/runBattleLoop'
import type { BattleStatEntry } from '../components/BattleStatsPanel'
import type { VictoryRewards } from '../components/VictoryPanel'
import type { AcquireItem } from '../hooks/useAcquireToast'
import type { ActionResolveEntry, DamagePopupData } from '../types'
import type {
  BattleBuffMap, BattleEnergyMap, SkillToast, ElementHint,
  PassiveHint, BuffApplyHint,
} from '../components/BattleHUD'
import { BattleFlowValidator } from '../domain/battleFlowValidator'
import { getNextStageId } from '../domain/stageSystem'
import { buildEnemySlotsFromStage } from '../game/helpers'
import { getStageConfig } from '../services/stageService'
import { waitFrames } from '../game/constants'
import { executeBattleLoop } from '../game/runBattleLoop'
import { preloadHeroModel } from '../loaders/glbLoader'

export interface BattleFlowDeps {
  /* ── Refs ── */
  isReplayingRef: React.MutableRefObject<boolean>
  preBattlePlayerSlotsRef: React.MutableRefObject<(SlotHero | null)[]>
  battleActionsRef: React.MutableRefObject<BattleAction[]>
  pSlotsRef: React.MutableRefObject<(SlotHero | null)[]>
  eSlotsRef: React.MutableRefObject<(SlotHero | null)[]>
  turnRef: React.MutableRefObject<number>
  skipBattleRef: React.MutableRefObject<boolean>
  speedRef: React.MutableRefObject<number>
  flowValidatorRef: React.MutableRefObject<BattleFlowValidator | null>
  skillsRef: React.MutableRefObject<Map<string, SkillTemplate>>
  heroSkillsRef: React.MutableRefObject<Map<number, HeroSkillConfig>>
  heroInputsRef: React.MutableRefObject<RawHeroInput[]>
  battleHeroesRef: React.MutableRefObject<Map<string, BattleHero>>
  actorStatesRef: React.MutableRefObject<Record<string, ActorState>>
  moveTargetsRef: React.MutableRefObject<Record<string, Vector3Tuple>>
  arenaTargetRankRef: React.MutableRefObject<number>
  preBattleMenuScreenRef: React.MutableRefObject<MenuScreen>
  skillToastIdRef: React.MutableRefObject<number>
  elementHintIdRef: React.MutableRefObject<number>
  passiveHintIdRef: React.MutableRefObject<number>
  buffApplyHintIdRef: React.MutableRefObject<number>
  actionResolveRefs: React.MutableRefObject<Record<string, ActionResolveEntry>>
  moveResolveRefs: React.MutableRefObject<Record<string, () => void>>

  /* ── State setters ── */
  setGameState: React.Dispatch<React.SetStateAction<GameState>>
  setStageId: React.Dispatch<React.SetStateAction<string>>
  setTurn: React.Dispatch<React.SetStateAction<number>>
  setShowBattleStats: React.Dispatch<React.SetStateAction<boolean>>
  setBattleCalculating: React.Dispatch<React.SetStateAction<boolean>>
  setBattleResult: React.Dispatch<React.SetStateAction<'victory' | 'defeat' | null>>
  setVictoryRewards: React.Dispatch<React.SetStateAction<VictoryRewards | null>>
  setBattleStats: React.Dispatch<React.SetStateAction<Record<string, BattleStatEntry>>>
  setMenuScreen: React.Dispatch<React.SetStateAction<MenuScreen>>
  updatePlayerSlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  updateEnemySlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  setActorState: (id: string, s: ActorState) => void
  setActorStates: React.Dispatch<React.SetStateAction<Record<string, ActorState>>>
  setDamagePopups: React.Dispatch<React.SetStateAction<DamagePopupData[]>>
  setHitFlashSignals: React.Dispatch<React.SetStateAction<Record<string, number>>>
  setBattleBuffs: React.Dispatch<React.SetStateAction<BattleBuffMap>>
  setBattleEnergy: React.Dispatch<React.SetStateAction<BattleEnergyMap>>
  setSkillToasts: React.Dispatch<React.SetStateAction<SkillToast[]>>
  setElementHints: React.Dispatch<React.SetStateAction<ElementHint[]>>
  setPassiveHints: React.Dispatch<React.SetStateAction<PassiveHint[]>>
  setBuffApplyHints: React.Dispatch<React.SetStateAction<BuffApplyHint[]>>
  setBossDamageProgress: React.Dispatch<React.SetStateAction<number>>

  /* ── Curtain ── */
  setCurtainVisible: (b: boolean) => void
  setCurtainFading: (b: boolean) => void
  setCurtainText: (t: string) => void
  curtainClosePromiseRef: React.MutableRefObject<Promise<boolean> | null>
  closeCurtain: () => Promise<boolean>

  /* ── Animation ── */
  addDamage: (targetUids: string | string[], value: number) => void
  waitForAction: (uid: string, expectedState?: AnimationState | null) => Promise<void>
  waitForMove: (uid: string) => Promise<void>
  clearAllPromises: () => void

  /* ── Battle HUD ── */
  resetBattleHUD: () => void

  /* ── Save callbacks ── */
  doSaveFormation: (heroIds: (string | null)[]) => void
  doUpdateProgress: (changes: Record<string, unknown>) => void
  doUpdateStory: (chapter: number, stage: number) => void

  /* ── UI callbacks ── */
  acquireShow: (items: AcquireItem[]) => void
  showToast: (msg: string) => void

  /* ── Scene control ── */
  setShowBattleScene: (b: boolean) => void

  /* ── Snapshot values ── */
  playerSlots: (SlotHero | null)[]
  enemySlots: (SlotHero | null)[]
  stageMode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss'
  stageId: string
  heroInstances: HeroInstance[]
  saveData: SaveData | null
  heroesList: RawHeroData[]
  gameState: GameState
}

export function useBattleFlow(deps: BattleFlowDeps) {
  const {
    preBattlePlayerSlotsRef, battleActionsRef, turnRef, skipBattleRef,
    actorStatesRef, moveTargetsRef, arenaTargetRankRef, preBattleMenuScreenRef,
    actionResolveRefs, moveResolveRefs,
    setGameState, setStageId, setTurn, setShowBattleStats, setBattleResult,
    setVictoryRewards, setMenuScreen,
    updatePlayerSlots, updateEnemySlots,
    setActorStates, setDamagePopups, setHitFlashSignals,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    clearAllPromises, resetBattleHUD, showToast,
    setShowBattleScene,
    playerSlots, enemySlots, stageMode, stageId, heroesList, gameState,
  } = deps

  /* ── 共用：清除戰鬥狀態 ── */
  const resetBattleState = useCallback(() => {
    setTurn(0); turnRef.current = 0
    setDamagePopups([])
    setHitFlashSignals({})
    setBattleResult(null)
    actorStatesRef.current = {}
    setActorStates({})
    moveTargetsRef.current = {}
    resetBattleHUD()
    clearAllPromises()
  }, [resetBattleHUD, clearAllPromises]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 建立 BattleLoop 上下文 ── */
  const buildBattleCtx = useCallback((): BattleLoopContext => ({
    isReplayingRef: deps.isReplayingRef,
    preBattlePlayerSlotsRef: deps.preBattlePlayerSlotsRef,
    battleActionsRef: deps.battleActionsRef,
    pSlotsRef: deps.pSlotsRef,
    eSlotsRef: deps.eSlotsRef,
    turnRef: deps.turnRef,
    skipBattleRef: deps.skipBattleRef,
    speedRef: deps.speedRef,
    flowValidatorRef: deps.flowValidatorRef,
    skillsRef: deps.skillsRef,
    heroSkillsRef: deps.heroSkillsRef,
    heroInputsRef: deps.heroInputsRef,
    battleHeroesRef: deps.battleHeroesRef,
    actorStatesRef: deps.actorStatesRef,
    moveTargetsRef: deps.moveTargetsRef,
    arenaTargetRankRef: deps.arenaTargetRankRef,
    skillToastIdRef: deps.skillToastIdRef,
    elementHintIdRef: deps.elementHintIdRef,
    passiveHintIdRef: deps.passiveHintIdRef,
    buffApplyHintIdRef: deps.buffApplyHintIdRef,
    setGameState: deps.setGameState,
    setTurn: deps.setTurn,
    setShowBattleStats: deps.setShowBattleStats,
    setBattleCalculating: deps.setBattleCalculating,
    setBattleResult: deps.setBattleResult,
    setVictoryRewards: deps.setVictoryRewards,
    setBattleStats: deps.setBattleStats,
    updatePlayerSlots: deps.updatePlayerSlots,
    updateEnemySlots: deps.updateEnemySlots,
    setActorState: deps.setActorState,
    setBattleBuffs: deps.setBattleBuffs,
    setBattleEnergy: deps.setBattleEnergy,
    setSkillToasts: deps.setSkillToasts,
    setElementHints: deps.setElementHints,
    setPassiveHints: deps.setPassiveHints,
    setBuffApplyHints: deps.setBuffApplyHints,
    setBossDamageProgress: deps.setBossDamageProgress,
    addDamage: deps.addDamage,
    waitForAction: deps.waitForAction,
    waitForMove: deps.waitForMove,
    clearAllPromises: deps.clearAllPromises,
    actionResolveRefs: deps.actionResolveRefs,
    moveResolveRefs: deps.moveResolveRefs,
    doSaveFormation: deps.doSaveFormation,
    doUpdateProgress: deps.doUpdateProgress,
    doUpdateStory: deps.doUpdateStory,
    acquireShow: deps.acquireShow,
    showToast: deps.showToast,
    playerSlots: deps.playerSlots,
    enemySlots: deps.enemySlots,
    stageMode: deps.stageMode,
    stageId: deps.stageId,
    heroInstances: deps.heroInstances,
    saveData: deps.saveData,
  }), [
    deps.playerSlots, deps.enemySlots, deps.stageMode, deps.stageId,
    deps.updatePlayerSlots, deps.updateEnemySlots, deps.setActorState,
    deps.addDamage, deps.waitForAction, deps.waitForMove, deps.clearAllPromises,
    deps.doSaveFormation, deps.doUpdateProgress, deps.doUpdateStory,
    deps.acquireShow, deps.showToast,
    deps.setBattleBuffs, deps.setBattleEnergy, deps.setSkillToasts,
    deps.setElementHints, deps.setPassiveHints, deps.setBuffApplyHints,
    deps.heroInstances, deps.saveData,
  ])

  /* ── 重試（在同一關卡重置到選擇上陣階段） ── */
  const retryBattle = useCallback(async () => {
    const restored = preBattlePlayerSlotsRef.current.map(slot => {
      if (!slot) return null
      return { ...slot, currentHP: (slot.HP ?? 1) as number }
    })
    updatePlayerSlots(() => restored)

    let injectedEnemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number }[] | undefined
    if (stageMode === 'story') {
      try { const cfg = await getStageConfig(stageId); if (cfg) injectedEnemies = cfg.enemies } catch {}
    }
    updateEnemySlots(() => buildEnemySlotsFromStage(stageMode, stageId, heroesList, injectedEnemies))

    resetBattleState()
    setVictoryRewards(null)
    setGameState('IDLE')
  }, [stageMode, stageId, heroesList, resetBattleState, updatePlayerSlots, updateEnemySlots, setVictoryRewards, setGameState])

  /* ── 戰鬥回放 ── */
  const replayBattle = useCallback(async () => {
    if (battleActionsRef.current.length === 0) { showToast('沒有可回放的戰鬥紀錄'); return }
    const savedActions = [...battleActionsRef.current]
    const restored = preBattlePlayerSlotsRef.current.map(slot => {
      if (!slot) return null
      return { ...slot, currentHP: (slot.HP ?? 1) as number }
    })
    updatePlayerSlots(() => restored)

    let injectedEnemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number }[] | undefined
    if (stageMode === 'story') {
      try { const cfg = await getStageConfig(stageId); if (cfg) injectedEnemies = cfg.enemies } catch {}
    }
    updateEnemySlots(() => buildEnemySlotsFromStage(stageMode, stageId, heroesList, injectedEnemies))

    resetBattleState()
    setShowBattleStats(false)
    skipBattleRef.current = false
    await waitFrames(3)
    executeBattleLoop(buildBattleCtx(), savedActions)
  }, [stageMode, stageId, heroesList, resetBattleState, buildBattleCtx, updatePlayerSlots, updateEnemySlots, setShowBattleStats, showToast]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 回大廳（返回進入戰鬥前的場景，不含過場動畫） ── */
  const backToLobby = useCallback(() => {
    updatePlayerSlots(() => Array(6).fill(null))
    updateEnemySlots(() => Array(6).fill(null))
    resetBattleState()
    setVictoryRewards(null)
    setShowBattleScene(false)
    // 返回戰前的 menuScreen
    const returnScreen = preBattleMenuScreenRef.current
    if (stageMode === 'pvp' && arenaTargetRankRef.current > 0) {
      arenaTargetRankRef.current = 0
    }
    setMenuScreen(returnScreen)
    preBattleMenuScreenRef.current = 'none'
    setGameState('MAIN_MENU')
  }, [stageMode, resetBattleState, updatePlayerSlots, updateEnemySlots, setVictoryRewards, setMenuScreen, setGameState]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 下一關（勝利後推進） ── */
  const goNextStage = useCallback(async () => {
    if (stageMode === 'tower') {
      const nextFloor = (Number(stageId) || 1) + 1
      setCurtainVisible(true); setCurtainFading(false)
      setCurtainText('前往下一層...')
      curtainClosePromiseRef.current = null
      await waitFrames(2)
      const restored = preBattlePlayerSlotsRef.current.map(slot =>
        slot ? { ...slot, currentHP: (slot.HP ?? 1) as number } : null,
      )
      updatePlayerSlots(() => restored)
      setStageId(String(nextFloor))
      const nextEnemySlots = buildEnemySlotsFromStage('tower', String(nextFloor), heroesList)
      // ── 預載入下一層敵人模型 ──
      const towerModelIds = nextEnemySlots.filter(Boolean).map(s => s!._modelId).filter(Boolean) as string[]
      await Promise.all(towerModelIds.map(mid => preloadHeroModel(mid).catch(() => {})))
      updateEnemySlots(() => nextEnemySlots)
      resetBattleState()
      setVictoryRewards(null)
      setGameState('IDLE')
      // 多等幾幀讓 React 重渲染 + Three.js 開始載入新模型，再收幕
      await waitFrames(5)
      closeCurtain()
      return
    }

    const nextId = getNextStageId(stageId)
    if (!nextId) { showToast('恭喜！已通關所有關卡'); backToLobby(); return }

    setCurtainVisible(true); setCurtainFading(false)
    setCurtainText('前往下一關...')
    curtainClosePromiseRef.current = null
    await waitFrames(2)
    const restored = preBattlePlayerSlotsRef.current.map(slot =>
      slot ? { ...slot, currentHP: (slot.HP ?? 1) as number } : null,
    )
    updatePlayerSlots(() => restored)
    setStageId(nextId)

    let injectedEnemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number }[] | undefined
    if (stageMode === 'story') {
      try { const cfg = await getStageConfig(nextId); if (cfg) injectedEnemies = cfg.enemies } catch {}
    }
    const nextEnemySlots = buildEnemySlotsFromStage(stageMode, nextId, heroesList, injectedEnemies)
    // ── 預載入下一關敵人模型 ──
    const nextModelIds = nextEnemySlots.filter(Boolean).map(s => s!._modelId).filter(Boolean) as string[]
    await Promise.all(nextModelIds.map(mid => preloadHeroModel(mid).catch(() => {})))
    updateEnemySlots(() => nextEnemySlots)

    resetBattleState()
    setVictoryRewards(null)
    setGameState('IDLE')
    // 多等幾幀讓 React 重渲染 + Three.js 開始載入新模型，再收幕
    await waitFrames(5)
    closeCurtain()
  }, [stageMode, stageId, heroesList, resetBattleState, backToLobby, updatePlayerSlots, updateEnemySlots, setVictoryRewards, setGameState, setStageId, setCurtainVisible, setCurtainFading, setCurtainText, closeCurtain, showToast]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 戰鬥迴圈（委託 executeBattleLoop） ── */
  const runBattleLoop = useCallback((replayActions?: BattleAction[]) => {
    executeBattleLoop(buildBattleCtx(), replayActions)
  }, [buildBattleCtx])

  const startAutoBattle = useCallback(() => {
    if (gameState !== 'IDLE') return
    if (!playerSlots.some(Boolean)) { showToast('請先選擇上陣英雄'); return }
    runBattleLoop()
  }, [gameState, playerSlots, showToast, runBattleLoop])

  return {
    resetBattleState,
    retryBattle,
    replayBattle,
    backToLobby,
    goNextStage,
    runBattleLoop,
    startAutoBattle,
  }
}
