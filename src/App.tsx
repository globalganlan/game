/**
 * App — 全球感染 (GlobalGanLan) 主入口
 *
 * 職責：
 *   1. 遊戲狀態管理（PRE_BATTLE → FETCHING → IDLE → BATTLE → GAMEOVER）
 *   2. 英雄槽位（6 格 × 雙方）
 *   3. 戰鬥迴圈（依速度排序、前進 → 攻擊 → 傷害 → 後退）
 *   4. 拖曳陣型調整
 *   5. 過場幕 & HUD
 *
 * CSS：import './App.css' 絕對不可省略，否則全部 HUD / 按鈕樣式消失。
 */

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import './App.css'

import { useResponsive } from './hooks/useResponsive'

import { Arena } from './components/Arena'
import { Hero } from './components/Hero'
import { ResponsiveCamera, SlotMarker, preloadTroikaFont } from './components/SceneWidgets'
import { TransitionOverlay, ThumbnailList } from './components/UIOverlay'
import { LoginScreen } from './components/LoginScreen'
import { useAuth } from './hooks/useAuth'
import { useSave } from './hooks/useSave'

/* ── Phase 3: Menu Components ── */
import { MainMenu } from './components/MainMenu'
import { MenuScreenRouter } from './components/MenuScreenRouter'

/* ── Phase 7: Battle HUD ── */
import { BattleHUD } from './components/BattleHUD'

import type {
  GameState,
  MenuScreen,
  RawHeroData,
  SlotHero,
} from './types'

/* ── Domain Engine & Data Service ── */
import { CurrencyIcon } from './components/CurrencyIcon'
/* ── Phase 10: Combat Power + Acquire Toast + Arena ── */
import { CombatPowerComparison } from './components/CombatPowerHUD'
import { AcquireToast } from './components/AcquireToast'
import { TutorialOverlay, useTutorial } from './components/TutorialOverlay'
import { getCachedStageConfig } from './services/stageService'
import { getItemName, toRarityNum } from './constants/rarity'
import { ClickableItemIcon } from './components/ClickableItemIcon'
import { getTowerReward, getDailyDungeonConfig, getPvPReward, getBossConfig, getBossRewardByBossAndRank, isModeUnlocked } from './domain/stageSystem'
import { getChallengeReward } from './domain/arenaSystem'
import type { StageReward } from './domain/stageSystem'
import { useCombatPower, buildHeroCPInputs } from './hooks/useCombatPower'
import { getTeamCombatPower, getComparisonLevel } from './domain/combatPower'
import { useAcquireToast } from './hooks/useAcquireToast'
import type { AcquireItem } from './hooks/useAcquireToast'
import { registerAcquireHandler, registerTextHandler } from './services/acquireToastBus'
import { callApi } from './services/apiClient'
import { isStandalone, claimPwaReward } from './services/pwaService'
import { getAuthState } from './services/authService'

import { getArenaRankings, getCachedChallengesLeft } from './services/arenaService'
import { canStarUp, getInitialStars } from './domain/progressionSystem'
import { getItemQuantity } from './services/inventoryService'
import { PLAYER_SLOT_POSITIONS, ENEMY_SLOT_POSITIONS } from './game/constants'
export type { TargetStrategy } from './game/helpers'
import { DragPlane } from './components/DragPlane'
import { VictoryPanel } from './components/VictoryPanel'
import { GameOverButtons } from './components/GameOverButtons'
import { BattleStatsPanel } from './components/BattleStatsPanel'
import { BattleSpeedControls } from './components/BattleSpeedControls'

/* ── Hooks ── */
import { useCurtain } from './hooks/useCurtain'
import { useBattleHUD } from './hooks/useBattleHUD'
import { useAnimationPromises } from './hooks/useAnimationPromises'
import { useDragFormation } from './hooks/useDragFormation'
import { useSlots } from './hooks/useSlots'
import { useGameInit } from './hooks/useGameInit'
import { useBattleFlow } from './hooks/useBattleFlow'
import { useStageHandlers } from './hooks/useStageHandlers'
import { useMail } from './hooks/useMail'
import { useBattleState } from './hooks/useBattleState'
import { useBgm } from './hooks/useBgm'

/* ══════════════════════════════
   App 主元件
   ══════════════════════════════ */

/** Suspense 內的哨兵元件 — 所有兄弟的 GLB 載入完成後才會掛載，掛載即觸發收幕 */
function SceneReady({ onReady }: { onReady: (delay?: number) => void }) {
  const called = useRef(false)
  useEffect(() => {
    if (called.current) return
    called.current = true
    // ★ 用 setTimeout 而非 rAF — iOS WKWebView 對被 overlay 遮蓋的 canvas 會節流 rAF
    setTimeout(() => onReady(0), 50)
  }, [onReady])
  return null
}

/**
 * FontPreloader — 掛載時立即預載 troika 中文字型到 suspend-react 快取。
 * 避免首次渲染 <Text>（PassiveHint3D / DamagePopup）時觸發 Suspense → 旋轉方塊閃現。
 */
function FontPreloader() {
  preloadTroikaFont()
  return null
}

/** 英雄模型載入中佔位符 — 半透明旋轉方塊 */
function HeroLoadingPlaceholder({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 2
  })
  return (
    <group position={position}>
      <mesh ref={ref} position={[0, 1, 0]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshBasicMaterial color="#4488ff" transparent opacity={0.5} wireframe />
      </mesh>
    </group>
  )
}

export default function App() {
  /* ── 認證 ── */
  const authHook = useAuth()
  const [showGame, setShowGame] = useState(false)
  /** 控制 3D 戰鬥場景（Canvas）是否掛載 — 大廳時不掛載，進入戰鬥準備時才掛載 */
  const [showBattleScene, setShowBattleScene] = useState(false)

  /* ── 存檔 ── */
  const saveHook = useSave()

  /* ── 遊戲狀態 ── */
  const [gameState, setGameState] = useState<GameState>('PRE_BATTLE')
  const [menuScreen, setMenuScreen] = useState<MenuScreen>('none')
  const [heroesList, setHeroesList] = useState<RawHeroData[]>([])
  const heroesListRef = useRef<RawHeroData[]>([])
  /** 目前選定的關卡模式（story/tower/daily/pvp/boss） */
  const [stageMode, setStageMode] = useState<'story' | 'tower' | 'daily' | 'pvp' | 'boss'>('story')
  const [stageId, setStageId] = useState<string>('1-1')
  /** 場景視覺主題 — 由 bgTheme 驅動 */
  const [sceneTheme, setSceneTheme] = useState<import('./components/Arena').SceneMode>('story')
  /** 競技場挑戰目標排名（用於結算上報） */
  const arenaTargetRankRef = useRef<number>(0)
  /** 競技場對手的伺服器權威戰力（避免前端重算不一致） */
  const arenaEnemyPowerRef = useRef<number>(0)
  /** 進入戰鬥前的 menuScreen（用於戰後返回） */
  const preBattleMenuScreenRef = useRef<MenuScreen>('none')
  /** 防守陣型配置模式 */
  const [isDefenseSetup, setIsDefenseSetup] = useState(false)
  const isDefenseSetupRef = useRef(false)
  const ownedHeroesList = useMemo(() => {
    const ownedIds = new Set(
      (saveHook.playerData?.heroes ?? []).map(h => Number(h.heroId)),
    )
    return heroesList
      .filter(h => ownedIds.has(Number(h.HeroID ?? 0)))
      .sort((a, b) => {
        const ra = toRarityNum((a as Record<string, unknown>).Rarity)
        const rb = toRarityNum((b as Record<string, unknown>).Rarity)
        return rb - ra // SSR(4) > SR(3) > R(2)
      })
  }, [heroesList, saveHook.playerData?.heroes])
  /* ── Phase 10: 戰力 + 獲得物品提示（統一 Toast） ── */
  const acquireToast = useAcquireToast()
  const showToast = acquireToast.showText
  // 註冊全域 bus，讓子元件也能觸發 toast
  useEffect(() => {
    registerAcquireHandler(acquireToast.show)
    registerTextHandler(acquireToast.showText)
  }, [acquireToast.show, acquireToast.showText])

  /* ── Phase 11: 新手引導 ── */
  const tutorial = useTutorial()

  /* ── 戰鬥中介狀態（hook） ── */
  const bs = useBattleState()
  const {
    turn, setTurn, turnRef,
    battleCalculating, setBattleCalculating,
    speed, setSpeed, speedRef, skipBattleRef,
    battleResult, setBattleResult,
    victoryRewards, setVictoryRewards,
    skillsRef, heroSkillsRef, heroInputsRef, battleHeroesRef,
    battleActionsRef, battleStats, setBattleStats,
    showBattleStats, setShowBattleStats, isReplayingRef,
    actorStates, setActorStates, actorStatesRef,
    moveTargetsRef, flowValidatorRef,
    setActorState, resetBattleRefs,
  } = bs

  /* ── Phase 7: Battle HUD 狀態（hook） ── */
  const battleHUD = useBattleHUD()
  const {
    battleBuffs, setBattleBuffs, battleEnergy, setBattleEnergy,
    skillToasts, setSkillToasts,
    passiveHints, setPassiveHints, buffApplyHints, setBuffApplyHints,
    bossDamageProgress, setBossDamageProgress,
    skillToastIdRef, passiveHintIdRef, buffApplyHintIdRef,
  } = battleHUD

  /* ── 動畫 Promise 系統（hook） ── */
  const animPromises = useAnimationPromises(skipBattleRef)
  const {
    damagePopups, setDamagePopups, hitFlashSignals, setHitFlashSignals,
    vfxEvents, setVfxEvents, skillFlashes, setSkillFlashes,
    actionResolveRefs, moveResolveRefs,
    waitForAction, handleActorActionDone, waitForMove, handleMoveDone,
    handleModelReady, addDamage, addSkillFlash, addBuffVfx, clearAllPromises,
  } = animPromises



  // ── 新手引導觸發邏輯（需在 battleResult 之後） ──
  // 第一場勝利 → 推進到 step 2
  useEffect(() => {
    if (tutorial.step === 1 && gameState === 'GAMEOVER' && battleResult === 'victory') {
      tutorial.advanceTo(2)
    }
  }, [gameState, battleResult]) // eslint-disable-line react-hooks/exhaustive-deps

  // 首次通關回到 MAIN_MENU → 推進到 step 3
  useEffect(() => {
    if (tutorial.step === 2 && gameState === 'MAIN_MENU') {
      const t = setTimeout(() => tutorial.advanceTo(3), 800)
      return () => clearTimeout(t)
    }
  }, [gameState]) // eslint-disable-line react-hooks/exhaustive-deps




  /* ── 信箱（hook） ── */
  const mail = useMail(authHook.auth.playerId)
  const { mailItems, setMailItems, mailLoaded, setMailLoaded, mailUnclaimedCount, refreshMailData } = mail

  /* ── PWA standalone 自動領獎（登入後執行一次，全平台統一） ── */
  useEffect(() => {
    if (!showGame || !saveHook.playerData) return
    const alreadyClaimed = saveHook.playerData.save.pwaRewardClaimed === true
      || saveHook.playerData.save.pwaRewardClaimed === ('true' as unknown as boolean)
    if (!isStandalone() || alreadyClaimed) return
    const token = getAuthState().guestToken
    if (!token) return
    claimPwaReward(token).then(res => {
      if (res.success) refreshMailData()
    }).catch(() => {})
  }, [showGame, saveHook.playerData]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 每日探索次數紅點（存完整次數物件，供 StageSelect 初始化用） ── */
  const [cachedDailyCounts, setCachedDailyCounts] = useState<{ daily: number; pvp: number; boss: number; date: string } | null>(null)
  const stagesHasDaily = useMemo(() => {
    if (!cachedDailyCounts) return false
    const c = cachedDailyCounts
    const sp = saveHook.playerData?.save?.storyProgress ?? { chapter: 1, stage: 1 }
    return (isModeUnlocked('daily', sp) && c.daily < 3)
      || (isModeUnlocked('pvp', sp) && c.pvp < 5)
      || (isModeUnlocked('boss', sp) && c.boss < 3)
  }, [cachedDailyCounts, saveHook.playerData?.save?.storyProgress])
  useEffect(() => {
    if (gameState !== 'MAIN_MENU' || !authHook.auth.playerId) return
    let cancelled = false
    callApi<{ success: boolean; dailyCounts: { daily: number; pvp: number; boss: number; date: string } }>('daily-counts', {})
      .then(res => {
        if (cancelled || !res.success || !res.dailyCounts) return
        setCachedDailyCounts(res.dailyCounts)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [gameState, menuScreen, authHook.auth.playerId])

  /* ── 召喚免費抽紅點 ── */
  const gachaHasFreePull = useMemo(() => {
    const sd = saveHook.playerData?.save as any
    if (!sd) return false
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const taipei = new Date(utc + 8 * 3600000)
    const today = `${taipei.getFullYear()}-${String(taipei.getMonth() + 1).padStart(2, '0')}-${String(taipei.getDate()).padStart(2, '0')}`
    const heroFree = (sd.lastHeroFreePull ?? '') !== today
    const equipFree = (sd.lastEquipFreePull ?? '') !== today
    return heroFree || equipFree
  }, [saveHook.playerData])

  /* ── 英雄升星紅點 ── */
  const heroesHasStarUp = useMemo(() => {
    const heroes = saveHook.playerData?.heroes ?? []
    if (heroes.length === 0) return false
    return heroes.some(inst => {
      const hero = heroesList.find(h => Number(h.HeroID ?? h.id ?? 0) === inst.heroId)
      const minStars = hero ? getInitialStars(toRarityNum((hero as Record<string, unknown>).Rarity)) : 0
      const stars = Math.max(inst.stars ?? minStars, minStars)
      const fragments = getItemQuantity(`asc_fragment_${inst.heroId}`)
      return canStarUp(stars, fragments)
    })
  }, [saveHook.playerData?.heroes, heroesList])

  /* ── 競技場剩餘次數紅點 ── */
  const [arenaChallengesLeft, setArenaChallengesLeft] = useState(0)
  useEffect(() => {
    if (gameState !== 'MAIN_MENU' || !authHook.auth.playerId) return
    // 快取可能已被 completeArenaChallenge 更新，優先使用
    const cached = getCachedChallengesLeft()
    if (cached !== null) { setArenaChallengesLeft(cached); return }
    // 否則背景取一次
    let cancelled = false
    getArenaRankings()
      .then(r => { if (!cancelled) setArenaChallengesLeft(r.challengesLeft) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [gameState, menuScreen, authHook.auth.playerId])

  /** 登出後 React state / hook 全重設（服務快取清除由 useLogout 負責） */
  const handleLogoutResetState = useCallback(() => {
    // 1. React state 重設
    setGameState('PRE_BATTLE')
    setMenuScreen('none')
    setHeroesList([]); heroesListRef.current = []
    resetSlots()
    mail.resetMail()
    battleHUD.fullResetBattleHUD()
    resetBattleRefs()
    setStageId('1-1'); setStageMode('story'); setSceneTheme('story')
    setDamagePopups([]); setHitFlashSignals({}); setVfxEvents([]); setSkillFlashes([])
    clearAllPromises()
    setShowBattleScene(false)

    // 2. hooks 守門旗標重設
    gameInit.resetInitRefs()

    // 3. 過場幕重設
    curtain.resetCurtain()

    // 4. 切回登入畫面
    setShowGame(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 槽位（hook） ── */
  const slots = useSlots(heroesListRef)
  const {
    playerSlots, enemySlots, pSlotsRef, eSlotsRef,
    preBattlePlayerSlotsRef, formationRestoredRef,
    updatePlayerSlots, updateEnemySlots, restoreFormationFromSave, resetSlots,
  } = slots

  /* ── 戰力追蹤（裝備/陣型/養成變動即時反映） ── */
  const cpState = useCombatPower(
    saveHook.playerData?.save?.formation ?? [null, null, null, null, null, null],
    saveHook.playerData?.heroes ?? [],
    heroesList,
    enemySlots,
  )

  /* ── 防守陣型即時戰力（根據 playerSlots 中的英雄計算） ── */
  const defensePower = useMemo(() => {
    if (!isDefenseSetup) return 0
    const heroInstances = saveHook.playerData?.heroes ?? []
    if (heroInstances.length === 0 || heroesList.length === 0) return 0
    const formation = playerSlots.map(s => s ? String(s.HeroID ?? s.id ?? '') : null)
    const inputs = buildHeroCPInputs(formation, heroInstances, heroesList)
    return getTeamCombatPower(inputs)
  }, [isDefenseSetup, playerSlots, saveHook.playerData?.heroes, heroesList])

  /* ── 戰鬥準備即時戰力（根據 playerSlots 即時變動，而非存檔 formation） ── */
  const battlePrepPower = useMemo(() => {
    if (gameState !== 'IDLE' || isDefenseSetup) return cpState.currentPower
    const heroInstances = saveHook.playerData?.heroes ?? []
    if (heroInstances.length === 0 || heroesList.length === 0) return 0
    const formation = playerSlots.map(s => s ? String(s.HeroID ?? s.id ?? '') : null)
    const inputs = buildHeroCPInputs(formation, heroInstances, heroesList)
    return getTeamCombatPower(inputs)
  }, [gameState, isDefenseSetup, playerSlots, saveHook.playerData?.heroes, heroesList, cpState.currentPower])

  /** 競技場模式使用伺服器權威戰力，其餘模式使用前端計算值 */
  const effectiveEnemyPower = stageMode === 'pvp' && stageId.startsWith('arena-') && arenaEnemyPowerRef.current > 0
    ? arenaEnemyPowerRef.current
    : cpState.enemyPower

  /** 戰鬥準備中的即時對比等級 */
  const battlePrepComparison = useMemo(
    () => getComparisonLevel(battlePrepPower, effectiveEnemyPower),
    [battlePrepPower, effectiveEnemyPower],
  )

  // ── 戰力變動 → 統一 toast 提示 ──
  useEffect(() => {
    if (cpState.powerDelta === null || cpState.powerDelta === 0) return
    const d = cpState.powerDelta
    const isUp = d > 0
    const deltaColor = isUp ? '#4cff4c' : '#ff4c4c'
    const text = <>
      <CurrencyIcon type="cp" /> 戰力 {cpState.currentPower.toLocaleString()}{' '}
      <span style={{ color: deltaColor, fontWeight: 'bold' }}>
        {isUp ? `+${d.toLocaleString()} ↑` : `${d.toLocaleString()} ↓`}
      </span>
    </>
    showToast(text)
  }, [cpState.powerDelta]) // eslint-disable-line react-hooks/exhaustive-deps



  /* ── 過場幕（hook） ── */
  const curtain = useCurtain()
  const {
    curtainVisible, setCurtainVisible,
    curtainFading, setCurtainFading,
    curtainText, setCurtainText,
    initialReady, curtainClosePromiseRef,
    closeCurtain,
  } = curtain

  /* ── 動作完成 / 移動完成 / addDamage 已移至 useAnimationPromises ── */

  /* ── 遊戲初始化（hook） ── */
  const gameInit = useGameInit({
    authIsLoggedIn: authHook.auth.isLoggedIn,
    authGuestToken: authHook.auth.guestToken,
    saveDoLoadSave: saveHook.doLoadSave,
    savePlayerData: saveHook.playerData,
    setGameState, setCurtainText, closeCurtain, initialReady,
    setHeroesList, heroesListRef, skillsRef, heroSkillsRef, heroInputsRef,
    updatePlayerSlots, formationRestoredRef,
    setSpeed, setMailItems, setMailLoaded, refreshMailData,
    showGame, gameState,
  })
  const { preloadProgress } = gameInit

  /* ── BGM 自動切換（hook） ── */
  useBgm(showGame, gameState, menuScreen, battleResult)

  /* ── 戰鬥流程（hook） ── */
  const battleFlow = useBattleFlow({
    isReplayingRef, preBattlePlayerSlotsRef, battleActionsRef,
    pSlotsRef, eSlotsRef, turnRef, skipBattleRef, speedRef,
    flowValidatorRef, skillsRef, heroSkillsRef, heroInputsRef,
    battleHeroesRef, actorStatesRef, moveTargetsRef,
    arenaTargetRankRef, preBattleMenuScreenRef,
    skillToastIdRef, passiveHintIdRef, buffApplyHintIdRef,
    actionResolveRefs, moveResolveRefs,
    setGameState, setStageId, setTurn, setShowBattleStats, setBattleCalculating,
    setBattleResult, setVictoryRewards, setBattleStats, setMenuScreen,
    updatePlayerSlots, updateEnemySlots, setActorState, setActorStates,
    setDamagePopups, setHitFlashSignals,
    setBattleBuffs, setBattleEnergy, setSkillToasts,
    setPassiveHints, setBuffApplyHints,
    setBossDamageProgress,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    addDamage, addSkillFlash, addBuffVfx, waitForAction, waitForMove, clearAllPromises,
    resetBattleHUD: battleHUD.resetBattleHUD,
    doSaveFormation: saveHook.doSaveFormation,
    doUpdateProgress: saveHook.doUpdateProgress as (changes: Record<string, unknown>) => void,
    doUpdateStory: saveHook.doUpdateStory,
    acquireShow: acquireToast.show,
    showToast,
    playerSlots, enemySlots, stageMode, stageId,
    heroInstances: saveHook.playerData?.heroes ?? [],
    saveData: saveHook.playerData?.save ?? null,
    heroesList, gameState,
    setShowBattleScene,
  })
  const {
    resetBattleState, retryBattle, replayBattle,
    backToLobby, goNextStage, runBattleLoop, startAutoBattle,
  } = battleFlow

  /* ══════════════════════════════
     拖曳邏輯
     ══════════════════════════════ */

  const responsive = useResponsive()
  const canAdjustFormation = gameState === 'IDLE' && turn === 0
  const {
    selectedSlot, setSelectedSlot, dragging,
    dragSourceRef, dragPosRef, dragOffsetRef, dragPointerIdRef,
    startDrag, endDragAt, handleThumbnailClick, selectedKeys,
  } = useDragFormation({ canAdjustFormation, playerSlots, updatePlayerSlots, heroesList, showToast })

  /* ── 關卡/選單 handlers（hook） ── */
  const stageHandlers = useStageHandlers({
    setStageMode, setSceneTheme, setStageId, setMenuScreen, setGameState,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    updateEnemySlots, updatePlayerSlots, restoreFormationFromSave,
    showToast, acquireShow: acquireToast.show,
    heroesList, stageMode, arenaTargetRankRef, arenaEnemyPowerRef,
    setIsDefenseSetup, isDefenseSetupRef,
    heroesListRef,
    preBattleMenuScreenRef,
    setShowBattleScene,
  })
  const {
    handleMenuNavigate, handleBackToMenu, handleStageSelect,
    handleArenaStartBattle, handleArenaDefenseSetup,
    handleSaveDefenseFormation, handleCancelDefenseSetup,
    handleCheckin,
  } = stageHandlers

  /* ══════════════════════════════
     Render
     ══════════════════════════════ */

  return (
    <div
      style={{
        width: '100vw',
        height: '100dvh',
        background: '#1a1a2e',
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      {/* ── 登入畫面 ── */}
      {!showGame && (
        <LoginScreen auth={authHook} onEnterGame={() => { setShowGame(true) }} />
      )}

      {/* 遊戲主體（登入後才渲染） */}
      {showGame && (
        <div
          style={{
            position: 'relative',
            width: responsive.device !== 'mobile' ? 'min(100vw, calc(100dvh * 9 / 16))' : '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {/* ── 3D Canvas（常駐掛載 — 避免 iOS WebGL context 反覆建銷導致 reload/黑紋理） ── */}
          <Canvas
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              visibility: showBattleScene ? 'visible' : 'hidden',
              pointerEvents: showBattleScene ? 'auto' : 'none',
            }}
            camera={{ position: responsive.camPos, fov: responsive.fov }}
            shadows
            frameloop={showBattleScene ? 'always' : 'never'}
            dpr={responsive.dpr}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl, scene }) => {
              // ★ 不設定 outputColorSpace / toneMapping — 使用 R3F 預設值
              // R3F 預設: outputColorSpace=SRGBColorSpace, toneMapping=ACESFilmicToneMapping
              gl.shadowMap.enabled = true
              gl.shadowMap.type = THREE.PCFShadowMap

              // ── WebGL Context Lost / Restored 處理 ──
              const canvas = gl.domElement
              canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault()
                console.warn('[WebGL] Context Lost — waiting for restore…')
              })
              canvas.addEventListener('webglcontextrestored', () => {
                console.info('[WebGL] Context Restored — reinitializing renderer')
                gl.shadowMap.enabled = true
                gl.shadowMap.type = THREE.PCFShadowMap
                // ★ 重設 GL 狀態機
                gl.resetState()
                // ★ Context Restored: 重新上傳所有材質+紋理+幾何（GPU 資料遺失）
                scene.traverse((obj) => {
                  if ((obj as THREE.Mesh).isMesh) {
                    const mesh = obj as THREE.Mesh
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                    mats.forEach((mat) => {
                      if (!mat) return
                      mat.needsUpdate = true
                      const anyMat = mat as any
                      if (anyMat.map) anyMat.map.needsUpdate = true
                      if (anyMat.alphaMap) anyMat.alphaMap.needsUpdate = true
                    })
                    // geometry buffer 也需要重新上傳
                    if (mesh.geometry) {
                      for (const attr of Object.values(mesh.geometry.attributes)) {
                        (attr as THREE.BufferAttribute).needsUpdate = true
                      }
                      if (mesh.geometry.index) mesh.geometry.index.needsUpdate = true
                    }
                  }
                })
              })
            }}
          >
            {showBattleScene && (
            <Suspense fallback={null}>
              <FontPreloader />
              <Arena sceneMode={sceneTheme} stageId={stageId} />

              {/* 格子標記 */}
              {PLAYER_SLOT_POSITIONS.map((pos, i) => (
                <SlotMarker key={`ps${i}`} position={pos} color="#00aaff" />
              ))}
              {!isDefenseSetup && ENEMY_SLOT_POSITIONS.map((pos, i) => (
                <SlotMarker key={`es${i}`} position={pos} color="#ff2222" />
              ))}

              {/* 玩家英雄 — 各自獨立 Suspense，避免新英雄載入時整場黑屏 */}
              {playerSlots.map((p, i) =>
                p ? (
                  <Suspense key={`p${i}`} fallback={<HeroLoadingPlaceholder position={PLAYER_SLOT_POSITIONS[i]} />}>
                  <Hero
                    position={PLAYER_SLOT_POSITIONS[i]}
                    heroData={p}
                    isPlayer
                    uid={p._uid}
                    actorState={actorStates[p._uid]}
                    damagePopups={damagePopups.filter((d) => d.uid === p._uid)}
                    hitFlashSignal={hitFlashSignals[p._uid] || 0}
                    onModelReady={handleModelReady}
                    onActionDone={(s) => handleActorActionDone(p._uid, s)}
                    onMoveDone={handleMoveDone}
                    textScale={responsive.textScale}
                    speed={speed}
                    moveTargetsRef={moveTargetsRef}
                    onDragStart={(e) => { (e as unknown as { stopPropagation: () => void }).stopPropagation(); startDrag(i, e) }}
                    onClickRemove={() => {
                      updatePlayerSlots((prev) => { const ns = [...prev]; ns[i] = null; return ns })
                      showToast(`${p.Name || '英雄'} 已下陣`)
                    }}
                    slotIndex={i}
                    dragSourceRef={dragSourceRef}
                    dragPosRef={dragPosRef}
                    dragOffsetRef={dragOffsetRef}
                    isDragActive={dragging}
                    canAdjustFormation={canAdjustFormation}
                    energyRatio={gameState === 'BATTLE' && battleEnergy[p._uid] ? battleEnergy[p._uid].current / battleEnergy[p._uid].max : undefined}
                    skillToasts={skillToasts.filter((t) => t.attackerUid === p._uid)}
                    passiveHints={passiveHints.filter((ph) => ph.heroUid === p._uid)}
                    battleBuffs={battleBuffs[p._uid] || []}
                    buffApplyHints={buffApplyHints.filter((bh) => bh.heroUid === p._uid)}
                    vfxEvents={vfxEvents.filter((v) => v.uid === p._uid)}
                    skillFlashes={skillFlashes.filter((f) => f.uid === p._uid)}
                  />
                  </Suspense>
                ) : null,
              )}

              {/* 拖曳平面 */}
              <DragPlane
                enabled={dragging && canAdjustFormation}
                dragPosRef={dragPosRef}
                dragPointerIdRef={dragPointerIdRef}
                onDragEnd={endDragAt}
              />

              {/* 敵方英雄（防守配置模式時隱藏）— 各自獨立 Suspense */}
              {!isDefenseSetup && enemySlots.map((e, i) =>
                e ? (
                  <Suspense key={`e${i}`} fallback={<HeroLoadingPlaceholder position={ENEMY_SLOT_POSITIONS[i]} />}>
                  <Hero
                    position={ENEMY_SLOT_POSITIONS[i]}
                    heroData={e}
                    isPlayer={false}
                    uid={e._uid}
                    actorState={actorStates[e._uid]}
                    damagePopups={damagePopups.filter((d) => d.uid === e._uid)}
                    hitFlashSignal={hitFlashSignals[e._uid] || 0}
                    onModelReady={handleModelReady}
                    onActionDone={(s) => handleActorActionDone(e._uid, s)}
                    onMoveDone={handleMoveDone}
                    textScale={responsive.textScale}
                    speed={speed}
                    moveTargetsRef={moveTargetsRef}
                    energyRatio={gameState === 'BATTLE' && battleEnergy[e._uid] ? battleEnergy[e._uid].current / battleEnergy[e._uid].max : undefined}
                    skillToasts={skillToasts.filter((t) => t.attackerUid === e._uid)}
                    passiveHints={passiveHints.filter((ph) => ph.heroUid === e._uid)}
                    battleBuffs={battleBuffs[e._uid] || []}
                    buffApplyHints={buffApplyHints.filter((bh) => bh.heroUid === e._uid)}
                    vfxEvents={vfxEvents.filter((v) => v.uid === e._uid)}
                    skillFlashes={skillFlashes.filter((f) => f.uid === e._uid)}
                  />
                  </Suspense>
                ) : null,
              )}

              <ResponsiveCamera fov={responsive.fov} position={responsive.camPos} target={responsive.camTarget} />
              <SceneReady onReady={closeCurtain} />
            </Suspense>
            )}
          </Canvas>

          {/* ── 橫屏遮罩（CSS 控制顯示） ── */}
          <div className="landscape-block">
            <div className="landscape-block-icon">📱</div>
            <div className="landscape-block-text">請旋轉裝置至直屏模式</div>
          </div>

          {/* ── 主選單（Phase 3） ── */}
          {gameState === 'MAIN_MENU' && menuScreen === 'none' && (
            <MainMenu
              saveData={saveHook.playerData?.save ?? null}
              onNavigate={handleMenuNavigate}
              getResourcePreview={saveHook.getResourcePreview}
              mailUnclaimedCount={mailUnclaimedCount}
              combatPower={cpState.currentPower}
              stagesHasDaily={stagesHasDaily}
              gachaHasFreePull={gachaHasFreePull}
              arenaChallengesLeft={arenaChallengesLeft}
              heroesHasStarUp={heroesHasStarUp}
              onCollectResources={async () => {
                const result = await saveHook.doCollectResources()
                if (result && (result.gold > 0 || result.exp > 0)) {
                  const items: AcquireItem[] = []
                  if (result.gold > 0) items.push({ type: 'currency', id: 'gold', name: '金幣', quantity: result.gold })
                  if (result.exp > 0) items.push({ type: 'currency', id: 'exp', name: '經驗', quantity: result.exp })
                  acquireToast.show(items)
                } else {
                  showToast('目前沒有可領取的資源')
                }
              }}
            />
          )}

          {/* ── 主選單子畫面 ── */}
          {gameState === 'MAIN_MENU' && menuScreen !== 'none' && (
            <MenuScreenRouter
              menuScreen={menuScreen}
              onBack={handleBackToMenu}
              heroesList={heroesList}
              saveData={saveHook.playerData?.save ?? null}
              heroInstances={saveHook.playerData?.heroes ?? []}
              skills={skillsRef.current}
              heroSkills={heroSkillsRef.current}
              diamond={saveHook.playerData?.save.diamond ?? 0}
              gold={saveHook.playerData?.save.gold ?? 0}
              gachaPity={saveHook.playerData?.save.gachaPity?.pullsSinceLastSSR ?? 0}
              onDiamondChange={(delta) => saveHook.doUpdateProgress({ diamond: (saveHook.playerData?.save.diamond ?? 0) + delta })}
              onGoldChange={(delta) => saveHook.doUpdateProgress({ gold: (saveHook.playerData?.save.gold ?? 0) + delta })}
              storyProgress={saveHook.playerData?.save.storyProgress ?? { chapter: 1, stage: 1 }}
              towerFloor={saveHook.playerData?.save.towerFloor ?? 1}
              onSelectStage={handleStageSelect}
              displayName={authHook.auth.displayName || '倖存者'}
              isBound={authHook.auth.isBound}
              pwaRewardClaimed={
                saveHook.playerData?.save.pwaRewardClaimed === true ||
                saveHook.playerData?.save.pwaRewardClaimed === ('true' as unknown as boolean)
              }
              onLogout={handleLogoutResetState}
              mailItems={mailItems}
              mailLoaded={mailLoaded}
              onMailItemsChange={setMailItems}
              onRefreshMail={refreshMailData}
              showAcquire={acquireToast.show}
              onCheckin={handleCheckin}
              formation={saveHook.playerData?.save?.formation ?? [null, null, null, null, null, null]}
              onArenaStartBattle={handleArenaStartBattle}
              onArenaDefenseSetup={handleArenaDefenseSetup}
              initialDailyCounts={cachedDailyCounts}
              stageMode={stageMode}
            />
          )}

          {/* ── 戰鬥 HUD（Phase 7） ── */}
          {gameState === 'BATTLE' && (
            <BattleHUD
              visible
              stageMode={stageMode}
              stageId={stageId}
              bossDamageProgress={bossDamageProgress}
              currentTurn={turn}
              playerHeroes={playerSlots
                .filter((s): s is SlotHero => s !== null)
                .map(s => ({
                  uid: s._uid,
                  name: String(s.Name ?? ''),
                  currentHP: s.currentHP,
                  maxHP: battleHeroesRef.current?.get(s._uid)?.maxHP ?? Number(s.HP ?? s.currentHP ?? 1),
                }))}
              enemyHeroes={enemySlots
                .filter((s): s is SlotHero => s !== null)
                .map(s => ({
                  uid: s._uid,
                  name: String(s.Name ?? ''),
                  currentHP: s.currentHP,
                  maxHP: battleHeroesRef.current?.get(s._uid)?.maxHP ?? Number(s.HP ?? s.currentHP ?? 1),
                }))}
              buffMap={battleBuffs}
              energyMap={battleEnergy}
              skillToasts={skillToasts}
            />
          )}

          {/* ── HUD ── */}
          <div className="game-hud">
            {turn > 0 && gameState !== 'GAMEOVER' && <div className="hud-round">第 {turn} 回合</div>}
          </div>

          {/* ── 防守陣型配置 頂部提示 + 操作按鈕 ── */}
          {gameState === 'IDLE' && turn === 0 && isDefenseSetup && (
            <div className="battle-prep-top-banner">
              <div className="bp-stage-section">
                <div className="bp-stage-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="bp-stage-id">🛡️ 防守陣型配置</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.95em', color: '#ffd700', fontWeight: 700, textShadow: '0 0 6px rgba(255,215,0,0.5)' }}>
                    <CurrencyIcon type="cp" /> 戰力 {defensePower.toLocaleString()}
                  </span>
                </div>
                <div className="bp-mode-desc" style={{ fontSize: '0.75em', opacity: 0.8, marginBottom: 4 }}>
                  拖曳或點選英雄配置你的防守陣型，其他玩家挑戰你時將使用此陣型
                </div>
                <div className="defense-setup-actions">
                  <button className="defense-btn defense-btn-back" onClick={handleCancelDefenseSetup}>← 返回</button>
                  <button
                    className="defense-btn defense-btn-copy"
                    onClick={() => {
                      updatePlayerSlots(() => [null, null, null, null, null, null])
                      setTimeout(() => {
                        restoreFormationFromSave()
                        showToast('已複製出征陣型')
                      }, 50)
                    }}
                  >📋 複製出征</button>
                  <button
                    className="defense-btn defense-btn-save"
                    onClick={() => handleSaveDefenseFormation(playerSlots)}
                  >💾 儲存陣型</button>
                </div>
              </div>
            </div>
          )}

          {/* ── 戰力對比 + 關卡資訊（IDLE 且有敵人時顯示） ── */}
          {gameState === 'IDLE' && turn === 0 && !isDefenseSetup && (effectiveEnemyPower > 0 || cpState.enemyPower > 0) && (() => {
            const cfg = getCachedStageConfig(stageId)

            // 非主線模式：根據 stageMode 計算獎勵與顯示名
            let modeLabel = ''
            let modeRewards: StageReward | null = null
            let modeDescription = ''
            let arenaWinLoss: { win: ReturnType<typeof getChallengeReward>; loss: ReturnType<typeof getChallengeReward> } | null = null
            if (!cfg && stageMode === 'tower') {
              const floor = Number(stageId) || 1
              modeLabel = `🗼 爬塔 第 ${floor} 層`
              modeRewards = getTowerReward(floor)
              modeDescription = floor % 10 === 0 ? '首領層 — 額外掉落裝備寶箱！' : '逐層挑戰，獎勵遞增'
            } else if (!cfg && stageMode === 'daily') {
              const dc = getDailyDungeonConfig(stageId)
              if (dc) {
                const tierName = { easy: '簡單', normal: '普通', hard: '困難' }[dc.difficulty.tier] ?? dc.difficulty.tier
                modeLabel = `📅 ${dc.dungeon.name} — ${tierName}`
                modeRewards = dc.difficulty.rewards
                modeDescription = '每日副本，限時產出職業石'
              }
            } else if (!cfg && stageMode === 'pvp') {
              const sp = saveHook.playerData?.save.storyProgress ?? { chapter: 1, stage: 1 }
              const progress = (sp.chapter - 1) * 8 + sp.stage
              // 競技場挑戰（stageId 為 'arena-N'）vs 試煉場（stageId 為 'pvp_N'）
              if (stageId.startsWith('arena-')) {
                modeLabel = `🏆 競技場挑戰`
                modeDescription = '勝利可提升排名並獲得獎勵，敗北也有安慰獎'
                arenaWinLoss = { win: getChallengeReward(true), loss: getChallengeReward(false) }
                modeRewards = null
              } else {
                const diffIdx = parseInt(stageId.split('_').pop() ?? '0') || 0
                const diffNames = ['一般', '菁英', '強敵']
                modeLabel = `⚔️ 試煉場 — ${diffNames[diffIdx] ?? '一般'}`
                modeRewards = getPvPReward(progress, diffIdx)
                modeDescription = '挑戰 AI 對手，獲得競技幣'
              }
            } else if (!cfg && stageMode === 'boss') {
              const boss = getBossConfig(stageId)
              if (boss) {
                modeLabel = `👹 ${boss.name}`
                modeDescription = `限 ${boss.turnLimit} 回合（Boss 不可擊殺），以傷害量評分 S/A/B/C`
                // 顯示 S 級獎勵作為預覽
                modeRewards = getBossRewardByBossAndRank(stageId, 'S')
              }
            }

            return (
              <div className="battle-prep-top-banner">
                <CombatPowerComparison
                  myPower={battlePrepPower}
                  enemyPower={effectiveEnemyPower}
                  comparison={battlePrepComparison}
                />
                {/* 主線關卡 */}
                {cfg && (
                  <div className="bp-stage-section">
                    <div className="bp-stage-header">
                      <span className="bp-stage-id">{cfg.stageId}</span>
                      <span className="bp-stage-name">{cfg.extra?.stageName || ''}</span>
                    </div>
                    {cfg.rewards && (
                      <div className="bp-reward-row">
                        <span className="bp-reward-label">通關獎勵：</span>
                        {(cfg.rewards.exp ?? 0) > 0 && <span className="bp-reward-item"><CurrencyIcon type="exp" /> {cfg.rewards.exp}</span>}
                        {(cfg.rewards.gold ?? 0) > 0 && <span className="bp-reward-item"><CurrencyIcon type="gold" /> {cfg.rewards.gold}</span>}
                        {(cfg.rewards.diamond ?? 0) > 0 && <span className="bp-reward-item"><CurrencyIcon type="diamond" /> {cfg.rewards.diamond}</span>}
                        {cfg.rewards.items?.map((it, i) => (
                          <span key={i} className="bp-reward-item"><ClickableItemIcon itemId={it.itemId}> {getItemName(it.itemId)} ×{it.quantity}</ClickableItemIcon></span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* 非主線模式（爬塔/每日/試煉場/Boss） */}
                {!cfg && modeLabel && (
                  <div className="bp-stage-section">
                    <div className="bp-stage-header">
                      <span className="bp-stage-id">{modeLabel}</span>
                    </div>
                    {modeDescription && (
                      <div className="bp-mode-desc" style={{ fontSize: '0.65em', opacity: 0.75, marginBottom: 1, lineHeight: 1.2 }}>{modeDescription}</div>
                    )}
                    {/* 競技場：顯示勝/敗兩組獎勵 */}
                    {arenaWinLoss && (
                      <>
                        <div className="bp-reward-row">
                          <span className="bp-reward-label" style={{ color: '#68d391' }}>🏆 勝利：</span>
                          <span className="bp-reward-item"><CurrencyIcon type="gold" /> {arenaWinLoss.win.gold}</span>
                          {arenaWinLoss.win.diamond > 0 && <span className="bp-reward-item"><CurrencyIcon type="diamond" /> {arenaWinLoss.win.diamond}</span>}
                          <span className="bp-reward-item"><CurrencyIcon type="pvp_coin" /> {arenaWinLoss.win.pvpCoin}</span>
                          <span className="bp-reward-item"><CurrencyIcon type="exp" /> {arenaWinLoss.win.exp}</span>
                        </div>
                        <div className="bp-reward-row">
                          <span className="bp-reward-label" style={{ color: '#e63946' }}>💀 敗北：</span>
                          <span className="bp-reward-item"><CurrencyIcon type="gold" /> {arenaWinLoss.loss.gold}</span>
                          {arenaWinLoss.loss.diamond > 0 && <span className="bp-reward-item"><CurrencyIcon type="diamond" /> {arenaWinLoss.loss.diamond}</span>}
                          <span className="bp-reward-item"><CurrencyIcon type="pvp_coin" /> {arenaWinLoss.loss.pvpCoin}</span>
                          <span className="bp-reward-item"><CurrencyIcon type="exp" /> {arenaWinLoss.loss.exp}</span>
                        </div>
                      </>
                    )}
                    {modeRewards && (
                      <div className="bp-reward-row">
                        <span className="bp-reward-label">通關獎勵：</span>
                        {(modeRewards.exp ?? 0) > 0 && <span className="bp-reward-item"><CurrencyIcon type="exp" /> {modeRewards.exp}</span>}
                        {(modeRewards.gold ?? 0) > 0 && <span className="bp-reward-item"><CurrencyIcon type="gold" /> {modeRewards.gold}</span>}
                        {(modeRewards.diamond ?? 0) > 0 && <span className="bp-reward-item"><CurrencyIcon type="diamond" /> {modeRewards.diamond}</span>}
                        {modeRewards.items?.map((it, i) => (
                          <span key={i} className="bp-reward-item"><ClickableItemIcon itemId={it.itemId}> {getItemName(it.itemId)} ×{it.quantity}</ClickableItemIcon></span>
                        ))}
                      </div>
                    )}
                    {/* Boss 特有：評分閾值 */}
                    {stageMode === 'boss' && (() => {
                      const boss = getBossConfig(stageId)
                      if (!boss) return null
                      return (
                        <div className="bp-reward-row" style={{ marginTop: 4 }}>
                          <span className="bp-reward-label">評分閾值：</span>
                          <span className="bp-reward-item" style={{ color: '#ffd700' }}>S ≥{boss.damageThresholds.S.toLocaleString()}</span>
                          <span className="bp-reward-item" style={{ color: '#c0c0c0' }}>A ≥{boss.damageThresholds.A.toLocaleString()}</span>
                          <span className="bp-reward-item" style={{ color: '#cd7f32' }}>B ≥{boss.damageThresholds.B.toLocaleString()}</span>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── 統一浮動 Toast（文字 + 物品） ── */}
          <AcquireToast entries={acquireToast.entries} onRemove={acquireToast.remove} />

          {/* ── 新手引導 ── */}
          {!tutorial.completed && gameState === 'MAIN_MENU' && menuScreen === 'none' && (tutorial.step === 0 || tutorial.step === 1) && (
            <TutorialOverlay step={tutorial.step} onNext={tutorial.advance} />
          )}
          {!tutorial.completed && gameState === 'GAMEOVER' && tutorial.step === 2 && (
            <TutorialOverlay step={tutorial.step} onNext={tutorial.advance} />
          )}
          {!tutorial.completed && gameState === 'MAIN_MENU' && menuScreen === 'none' && (tutorial.step === 3 || tutorial.step === 4) && (
            <TutorialOverlay step={tutorial.step} onNext={tutorial.advance} />
          )}

          {/* ── 勝負標語 + 獎勵面板 ── */}
          {gameState === 'GAMEOVER' && battleResult && (
            <VictoryPanel battleResult={battleResult} victoryRewards={victoryRewards} stageMode={stageMode} stageId={stageId} />
          )}

          {/* ── GAMEOVER 按鈕 ── */}
          {gameState === 'GAMEOVER' && (
            <GameOverButtons
              battleResult={battleResult}
              stageMode={stageMode}
              onNextStage={goNextStage}
              onRetry={retryBattle}
              onReplay={replayBattle}
              onShowStats={() => setShowBattleStats(true)}
              onBackToLobby={backToLobby}
            />
          )}

          {/* ── 戰鬥統計面板 ── */}
          {showBattleStats && (
            <BattleStatsPanel stats={battleStats} onClose={() => setShowBattleStats(false)} />
          )}
          {gameState === 'BATTLE' && battleCalculating && (
            <div className="battle-calculating-overlay">
              <div className="battle-calculating-spinner" />
              <span>戰鬥計算中…</span>
            </div>
          )}
          {gameState === 'BATTLE' && (
            <BattleSpeedControls
              speed={speed}
              setSpeed={setSpeed}
              skipBattleRef={skipBattleRef}
              actionResolveRefs={actionResolveRefs}
              moveResolveRefs={moveResolveRefs}
            />
          )}

          {/* ── 底部面板：按鈕 + 英雄選擇欄 ── */}
          {(gameState === 'IDLE' || gameState === 'FETCHING' || gameState === 'PRE_BATTLE') && (
            <div className="bottom-panel">
              {gameState === 'IDLE' && turn === 0 && !isDefenseSetup && (
                <div className="bottom-panel-btn">
                  <button onClick={() => { restoreFormationFromSave(true); backToLobby() }} className="btn-back-menu">← 返回</button>
                  <button onClick={startAutoBattle} className="btn-start">開始戰鬥</button>
                </div>
              )}
              {/* 防守配置按鈕已移至頂部 banner */}
              <ThumbnailList
                heroes={ownedHeroesList}
                heroInstances={saveHook.playerData?.heroes}
                onThumbClick={handleThumbnailClick}
                selectedKeys={selectedKeys}
                canAdjust={canAdjustFormation}
              />
            </div>
          )}

          {/* ── 過場幕 ── */}
          <TransitionOverlay
            visible={curtainVisible}
            fading={curtainFading}
            text={curtainText}
            progress={preloadProgress}
          />
        </div>
      )}
    </div>
  )
}
