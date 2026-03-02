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
import * as THREE from 'three'

import './App.css'

import { useResponsive } from './hooks/useResponsive'

import { Arena } from './components/Arena'
import { Hero } from './components/Hero'
import { ResponsiveCamera, SlotMarker } from './components/SceneWidgets'
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
import type { Element as DomainElement } from './domain/types'
import { CurrencyIcon } from './components/CurrencyIcon'
/* ── Phase 10: Combat Power + Acquire Toast + Arena ── */
import { CombatPowerComparison } from './components/CombatPowerHUD'
import { AcquireToast } from './components/AcquireToast'
import { TutorialOverlay, useTutorial } from './components/TutorialOverlay'
import { useCombatPower } from './hooks/useCombatPower'
import { useAcquireToast } from './hooks/useAcquireToast'
import type { AcquireItem } from './hooks/useAcquireToast'
import { registerAcquireHandler, registerTextHandler } from './services/acquireToastBus'

/* ── Extracted modules ── */
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

export default function App() {
  /* ── 認證 ── */
  const authHook = useAuth()
  const [showGame, setShowGame] = useState(false)

  /* ── 存檔 ── */
  const saveHook = useSave()

  /* ── 遊戲狀態 ── */
  const [gameState, setGameState] = useState<GameState>('PRE_BATTLE')
  const [menuScreen, setMenuScreen] = useState<MenuScreen>('none')
  const [heroesList, setHeroesList] = useState<RawHeroData[]>([])
  const heroesListRef = useRef<RawHeroData[]>([])
  /** 目前選定的關卡模式（影響場景外觀） */
  const [stageMode, setStageMode] = useState<'story' | 'tower' | 'daily' | 'pvp' | 'boss'>('story')
  const [stageId, setStageId] = useState<string>('1-1')
  /** 競技場挑戰目標排名（用於結算上報） */
  const arenaTargetRankRef = useRef<number>(0)
  const ownedHeroesList = useMemo(() => {
    const ownedIds = new Set(
      (saveHook.playerData?.heroes ?? []).map(h => Number(h.heroId)),
    )
    return heroesList
      .filter(h => ownedIds.has(Number(h.HeroID ?? 0)))
      .sort((a, b) => {
        const ra = Number((a as Record<string, unknown>).Rarity ?? 0)
        const rb = Number((b as Record<string, unknown>).Rarity ?? 0)
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
    completeBattleRef,
    setActorState, resetBattleRefs,
  } = bs

  /* ── Phase 7: Battle HUD 狀態（hook） ── */
  const battleHUD = useBattleHUD()
  const {
    battleBuffs, setBattleBuffs, battleEnergy, setBattleEnergy,
    skillToasts, setSkillToasts, elementHints, setElementHints,
    passiveHints, setPassiveHints, buffApplyHints, setBuffApplyHints,
    skillToastIdRef, elementHintIdRef, passiveHintIdRef, buffApplyHintIdRef,
  } = battleHUD

  /* ── 動畫 Promise 系統（hook） ── */
  const animPromises = useAnimationPromises(skipBattleRef)
  const {
    damagePopups, setDamagePopups, hitFlashSignals, setHitFlashSignals,
    actionResolveRefs, moveResolveRefs,
    waitForAction, handleActorActionDone, waitForMove, handleMoveDone,
    handleModelReady, addDamage, clearAllPromises,
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
    setStageId('1-1'); setStageMode('story')
    setDamagePopups([]); setHitFlashSignals({})
    clearAllPromises()

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
    completeBattleRef, arenaTargetRankRef,
    skillToastIdRef, elementHintIdRef, passiveHintIdRef, buffApplyHintIdRef,
    actionResolveRefs, moveResolveRefs,
    setGameState, setStageId, setTurn, setShowBattleStats, setBattleCalculating,
    setBattleResult, setVictoryRewards, setBattleStats, setMenuScreen,
    updatePlayerSlots, updateEnemySlots, setActorState, setActorStates,
    setDamagePopups, setHitFlashSignals,
    setBattleBuffs, setBattleEnergy, setSkillToasts,
    setElementHints, setPassiveHints, setBuffApplyHints,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    addDamage, waitForAction, waitForMove, clearAllPromises,
    resetBattleHUD: battleHUD.resetBattleHUD,
    doSaveFormation: saveHook.doSaveFormation,
    doUpdateProgress: saveHook.doUpdateProgress as (changes: Record<string, unknown>) => void,
    doUpdateStory: saveHook.doUpdateStory,
    doUpdateStageStars: saveHook.doUpdateStageStars,
    acquireShow: acquireToast.show,
    showToast,
    playerSlots, enemySlots, stageMode, stageId,
    heroInstances: saveHook.playerData?.heroes ?? [],
    saveData: saveHook.playerData?.save ?? null,
    heroesList, gameState,
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
    setStageMode, setStageId, setMenuScreen, setGameState,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    updateEnemySlots, restoreFormationFromSave,
    showToast, acquireShow: acquireToast.show,
    heroesList, stageMode, arenaTargetRankRef,
  })
  const {
    handleMenuNavigate, handleBackToMenu, handleStageSelect,
    handleArenaStartBattle, handleCheckin,
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
          {/* ── 3D Canvas ── */}
          <Canvas
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              visibility: (gameState === 'MAIN_MENU' && menuScreen !== 'none') ? 'hidden' : 'visible',
            }}
            camera={{ position: responsive.camPos, fov: responsive.fov }}
            shadows
            frameloop="always"
            dpr={responsive.dpr}
            gl={{ powerPreference: 'default', antialias: !/iPhone|iPad|iPod/.test(navigator.userAgent) }}
            onCreated={({ gl }) => {
              gl.shadowMap.enabled = true
              gl.shadowMap.type = THREE.PCFShadowMap

              // ── WebGL Context Lost / Restored 處理 ──
              const canvas = gl.domElement
              canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault()  // 允許瀏覽器嘗試恢復 context
                console.warn('[WebGL] Context Lost — waiting for restore…')
              })
              canvas.addEventListener('webglcontextrestored', () => {
                console.info('[WebGL] Context Restored — reinitializing renderer')
                gl.shadowMap.enabled = true
                gl.shadowMap.type = THREE.PCFShadowMap
              })
            }}
          >
            <Suspense fallback={null}>
              <Arena sceneMode={stageMode} />

              {/* 格子標記 */}
              {PLAYER_SLOT_POSITIONS.map((pos, i) => (
                <SlotMarker key={`ps${i}`} position={pos} color="#00aaff" />
              ))}
              {ENEMY_SLOT_POSITIONS.map((pos, i) => (
                <SlotMarker key={`es${i}`} position={pos} color="#ff2222" />
              ))}

              {/* 玩家英雄 */}
              {playerSlots.map((p, i) =>
                p ? (
                  <Hero
                    key={`p${i}`}
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
                    elementHints={elementHints.filter((h) => h.attackerUid === p._uid)}
                    passiveHints={passiveHints.filter((ph) => ph.heroUid === p._uid)}
                    battleBuffs={battleBuffs[p._uid] || []}
                    buffApplyHints={buffApplyHints.filter((bh) => bh.heroUid === p._uid)}
                  />
                ) : null,
              )}

              {/* 拖曳平面 */}
              <DragPlane
                enabled={dragging && canAdjustFormation}
                dragPosRef={dragPosRef}
                dragPointerIdRef={dragPointerIdRef}
                onDragEnd={endDragAt}
              />

              {/* 敵方英雄 */}
              {enemySlots.map((e, i) =>
                e ? (
                  <Hero
                    key={`e${i}`}
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
                    elementHints={elementHints.filter((h) => h.attackerUid === e._uid)}
                    passiveHints={passiveHints.filter((ph) => ph.heroUid === e._uid)}
                    battleBuffs={battleBuffs[e._uid] || []}
                    buffApplyHints={buffApplyHints.filter((bh) => bh.heroUid === e._uid)}
                  />
                ) : null,
              )}

              <ResponsiveCamera fov={responsive.fov} position={responsive.camPos} target={responsive.camTarget} />
            </Suspense>
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
              stageStars={saveHook.playerData?.save.stageStars ?? {}}
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
            />
          )}

          {/* ── 戰鬥 HUD（Phase 7） ── */}
          {gameState === 'BATTLE' && (
            <BattleHUD
              visible
              playerHeroes={playerSlots
                .filter((s): s is SlotHero => s !== null)
                .map(s => ({
                  uid: s._uid,
                  name: String(s.Name ?? ''),
                  currentHP: s.currentHP,
                  maxHP: battleHeroesRef.current?.get(s._uid)?.maxHP ?? Number(s.HP ?? s.currentHP ?? 1),
                  element: ((s.element as string) || '') as DomainElement | '',
                }))}
              enemyHeroes={enemySlots
                .filter((s): s is SlotHero => s !== null)
                .map(s => ({
                  uid: s._uid,
                  name: String(s.Name ?? ''),
                  currentHP: s.currentHP,
                  maxHP: battleHeroesRef.current?.get(s._uid)?.maxHP ?? Number(s.HP ?? s.currentHP ?? 1),
                  element: ((s.element as string) || '') as DomainElement | '',
                }))}
              buffMap={battleBuffs}
              energyMap={battleEnergy}
              skillToasts={skillToasts}
              elementHints={elementHints}
            />
          )}

          {/* ── HUD ── */}
          <div className="game-hud">
            {turn > 0 && gameState !== 'GAMEOVER' && <div className="hud-round">第 {turn} 回合</div>}
          </div>

          {/* ── 戰力對比（IDLE 且有敵人時顯示） ── */}
          {gameState === 'IDLE' && turn === 0 && cpState.enemyPower > 0 && (
            <CombatPowerComparison
              myPower={cpState.currentPower}
              enemyPower={cpState.enemyPower}
              comparison={cpState.comparison}
            />
          )}

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
              {gameState === 'IDLE' && turn === 0 && (
                <div className="bottom-panel-btn">
                  <button onClick={() => setGameState('MAIN_MENU')} className="btn-back-menu">← 返回</button>
                  <button onClick={startAutoBattle} className="btn-start">開始戰鬥</button>
                </div>
              )}
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
