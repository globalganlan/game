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
import { useThree } from '@react-three/fiber'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'

import './App.css'

import { useResponsive } from './hooks/useResponsive'
import { loadGlbShared } from './loaders/glbLoader'

import { Arena } from './components/Arena'
import { Hero } from './components/Hero'
import { ResponsiveCamera, SlotMarker } from './components/SceneWidgets'
import { TransitionOverlay, ThumbnailList, useToast } from './components/UIOverlay'
import { LoginScreen } from './components/LoginScreen'
import { useAuth } from './hooks/useAuth'
import { useSave } from './hooks/useSave'

/* ── Phase 3: Menu Components ── */
import { MainMenu } from './components/MainMenu'
import { HeroListPanel } from './components/HeroListPanel'
import { InventoryPanel } from './components/InventoryPanel'
import { GachaScreen } from './components/GachaScreen'
import { StageSelect } from './components/StageSelect'
import { SettingsPanel } from './components/SettingsPanel'
import { MailboxPanel } from './components/MailboxPanel'
import { ShopPanel } from './components/ShopPanel'
import { preloadMail, invalidateMailCache, loadMail } from './services/mailService'
import { clearCache as clearSheetCache } from './services/sheetApi'
import { clearGachaPreload } from './services/gachaPreloadService'
import { clearLocalPool } from './services/gachaLocalPool'
import { clearPendingOps } from './services/optimisticQueue'
import type { MailItem } from './services/mailService'
import { isStandalone, claimPwaReward } from './services/pwaService'
/* ── Phase 7: Battle HUD ── */
import { BattleHUD } from './components/BattleHUD'
import type { BattleBuffMap, BattleEnergyMap, SkillToast, ElementHint, PassiveHint, BuffApplyHint } from './components/BattleHUD'

import type {
  GameState,
  MenuScreen,
  ActorState,
  AnimationState,
  RawHeroData,
  SlotHero,
  DamagePopupData,
  ActionResolveEntry,
} from './types'
import type { Vector3Tuple } from 'three'

/* ── Domain Engine & Data Service ── */
import type { BattleHero, BattleAction, SkillTemplate, DamageResult } from './domain'
import type { Element as DomainElement } from './domain/types'
import { BattleFlowValidator } from './domain/battleFlowValidator'
import { runBattleCollect, createBattleHero, generateBattleSeed } from './domain'
// runBattleRemote 保留但不再主動呼叫（本地引擎更快，GAS 冷啟動太慢）
// import { runBattleRemote } from './services/battleService'
import { startBattleVerification, type VerifyResult } from './services/antiCheatService'
import { completeBattle, type CompleteBattleResult } from './services/progressionService'
import { loadAllGameData, getHeroSkillSet, toElement, clearGameDataCache } from './services'
import type { RawHeroInput, HeroInstanceData } from './domain'
import {
  getStoryStageConfig,
  getTowerFloorConfig,
  getNextStageId,
  isFirstClear,
  calculateStarRating,
  rollDrops,
  mergeDrops,
  getDailyDungeonConfig,
  getDailyDungeonDisplayName,
  getPvPOpponents,
  getPvPReward,
  getBossEnemies,
  getBossReward,
} from './domain/stageSystem'
import type { StageReward } from './domain/stageSystem'
import { getTimerYield, addHeroesLocally, getSaveState, clearLocalSaveCache } from './services/saveService'
import { addItemsLocally, loadInventory, clearInventoryCache } from './services/inventoryService'
import { expToNextLevel } from './domain/progressionSystem'
import { audioManager } from './services/audioService'
import { getItemName } from './constants/rarity'
import { CurrencyIcon, ItemIcon } from './components/CurrencyIcon'

/* ────────────────────────────
   常數
   ──────────────────────────── */

/**
 * 過場幕時序常數（單位：ms）
 *
 * 過場流程：
 *   1. setCurtainVisible(true) → React commit DOM
 *   2. 等 CURTAIN_SETTLE_MS（2 rAF ≈ 33ms）確保幕已不透明
 *   3. 在幕後切換 state（敵方/陣型/gameState）
 *   4. closeCurtain(SCENE_RENDER_GRACE_MS) → 給場景渲染 1~2 幀的餘裕
 *   5. delay 後觸發 CSS fade-out（CURTAIN_FADE_MS = 1000，對應 curtainFadeOut 動畫）
 *   6. fade 結束 → setCurtainVisible(false)
 */
const CURTAIN_FADE_MS   = 1000  // CSS curtainFadeOut 動畫持續時間
const SCENE_RENDER_GRACE_MS = 300   // closeCurtain delay：場景渲染餘裕
const INITIAL_CURTAIN_GRACE_MS = 350 // 初始載入收幕前的額外等待
const REPLAY_SCENE_SETTLE_MS = 400   // 回放：收幕後等場景更新再啟動 loop
const ATTACK_DELAY_MS = 840   // 等待攻擊動畫的傷害觸發點（對應 Hero.tsx 中攻擊動畫的 timing）

/** Buff 類型集合（用於 BuffApplyToast3D 判斷 isBuff） */
const BUFF_TYPE_SET = new Set([
  'atk_up', 'def_up', 'spd_up', 'crit_rate_up', 'crit_dmg_up',
  'dmg_reduce', 'shield', 'regen', 'energy_boost',
  'dodge_up', 'reflect', 'taunt', 'immunity',
])

/** 等待 N 個 requestAnimationFrame（確保 DOM/WebGL 已 commit） */
const waitFrames = (n = 2): Promise<void> =>
  new Promise(resolve => {
    let count = 0
    const tick = () => { if (++count >= n) resolve(); else requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })

const API_URL =
  'https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec'

/** 6 格空陣列 */
const EMPTY_SLOTS: (SlotHero | null)[] = Array(6).fill(null)

/** 格子欄 X 座標（3 欄） */
const COL_X: [number, number, number] = [-2.2, 0.0, 2.2]

/** 敵方兩排 Z 座標（前排靠近中場，後排遠離） */
const ENEMY_ROWS_Z: [number, number] = [-2.0, -4.5]
/** 玩家兩排 Z 座標（前排靠近中場，後排遠離） */
const PLAYER_ROWS_Z: [number, number] = [2.0, 4.5]

/**
 * 6 格座標（上下分割敵我陣型）
 *
 * 前排 idx 0,1,2（L→R），後排 idx 3,4,5（L→R）
 *
 * 敵方(上方):               我方(下方):
 *   ●  ●  ●  ← 後排(3,4,5)     ●  ●  ●  ← 前排(0,1,2)
 *   ●  ●  ●  ← 前排(0,1,2)     ●  ●  ●  ← 後排(3,4,5)
 */
function buildSlotPositions(rowsZ: [number, number]): Vector3Tuple[] {
  return rowsZ.flatMap(z => COL_X.map((x): Vector3Tuple => [x, 0, z]))
}

const PLAYER_SLOT_POSITIONS = buildSlotPositions(PLAYER_ROWS_Z)
const ENEMY_SLOT_POSITIONS = buildSlotPositions(ENEMY_ROWS_Z)

/* ────────────────────────────
   攻擊目標選擇策略
   ──────────────────────────── */

/** 前排 idx 0,1,2；後排 idx 3,4,5 */
// 過去的目標策略已由 Domain Engine 取代，保留 TargetStrategy 型別以便未來擴展
export type TargetStrategy = (
  attackerCol: number,
  targetSlots: (SlotHero | null)[],
) => (SlotHero & { slot: number })[]

/* ────────────────────────────
   工具函式
   ──────────────────────────── */

/** 將原始英雄資料的 ID 正規化為 `zombie_N` 格式 */
function normalizeModelId(h: RawHeroData | null, idx = 0): string {
  const rawId = h && (h._modelId || h.ModelID || h.HeroID || h.ModelId || h.Model || h.id || h.Name)
  if (!rawId) return `zombie_${idx + 1}`
  const idText = rawId.toString().trim()
  const zm = idText.match(/zombie[_-]?(\d+)/i)
  if (zm) return `zombie_${zm[1]}`
  const nm = idText.match(/\d+/)
  if (nm) return `zombie_${nm[0]}`
  return `zombie_${idx + 1}`
}

/** 從英雄資料取得速度值 */
function getHeroSpeed(h: RawHeroData): number {
  return (h.Speed || h.SPD || h.SPEED || h.AGI || 1) as number
}

/** clamp 0–1 */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * 根據關卡設定產生固定的敵方 SlotHero 陣列。
 * mode: story / tower / daily — 由對應的 stageSystem 函式取得 enemies 定義
 * heroesList: 所有英雄原始資料（用於取得 HP/ATK 等基礎值）
 */
function buildEnemySlotsFromStage(
  mode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss',
  stageId: string,
  heroesList: RawHeroData[],
): (SlotHero | null)[] {
  let enemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number }[]

  if (mode === 'tower') {
    const floor = Number(stageId) || 1
    enemies = getTowerFloorConfig(floor).enemies
  } else if (mode === 'daily') {
    const cfg = getDailyDungeonConfig(stageId)
    enemies = cfg ? cfg.difficulty.enemies : []
  } else if (mode === 'pvp') {
    // stageId = "pvp_0" ~ "pvp_2"
    const idx = Number(stageId.replace('pvp_', '')) || 0
    const opponents = getPvPOpponents({ chapter: 1, stage: 1 }) // progress doesn't matter; opponents seeded by date
    enemies = opponents[idx]?.enemies ?? []
  } else if (mode === 'boss') {
    // stageId = bossId e.g. "boss_1"
    enemies = getBossEnemies(stageId)
  } else {
    // story
    enemies = getStoryStageConfig(stageId).enemies
  }

  // 建立 heroId → RawHeroData 的對照表
  const heroMap = new Map<number, { hero: RawHeroData; idx: number }>()
  heroesList.forEach((h, idx) => {
    const hid = Number(h.HeroID ?? h.id ?? idx + 1)
    heroMap.set(hid, { hero: h, idx })
  })

  const slots: (SlotHero | null)[] = Array(6).fill(null)
  enemies.forEach((e) => {
    if (e.slot >= 6) return
    // 查找基礎資料；找不到就用 zombie_{heroId} 的 fallback
    const found = heroMap.get(e.heroId)
    const baseHero: RawHeroData = found?.hero ?? { HeroID: e.heroId, Name: `殭屍 ${e.heroId}`, HP: 100, ATK: 20 }
    const mid = `zombie_${e.heroId}`
    const hp = Math.floor(((baseHero.HP as number) ?? 100) * e.hpMultiplier)
    const atk = Math.floor(((baseHero.ATK as number) ?? 20) * e.atkMultiplier)
    const spd = Math.floor(getHeroSpeed(baseHero) * e.speedMultiplier)

    slots[e.slot] = {
      ...baseHero,
      HP: hp,
      ATK: atk,
      Speed: spd,
      slot: e.slot,
      currentHP: hp,
      _uid: `${mid}_stage_${e.slot}`,
      _modelId: mid,
      ModelID: mid,
    }
  })

  return slots
}


/* ────────────────────────────
   DragPlane（R3F 子元件）
   ──────────────────────────── */

interface DragPlaneProps {
  enabled: boolean
  dragPosRef: React.RefObject<THREE.Vector3>
  dragPointerIdRef: React.RefObject<number | null>
  onDragEnd: (point: THREE.Vector3 | null) => void
}

/** 在拖曳時攔截指標事件並投射到 y=1.25 平面 */
function DragPlane({ enabled, dragPosRef, dragPointerIdRef, onDragEnd }: DragPlaneProps) {
  const { gl, camera } = useThree()

  useEffect(() => {
    if (!enabled) return

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.25)
    const tmpV = new THREE.Vector3()
    const ray = new THREE.Raycaster()

    const project = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = -((clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(new THREE.Vector2(x, y), camera)
      return ray.ray.intersectPlane(plane, tmpV)
    }

    const onMove = (e: PointerEvent) => {
      const ip = project(e.clientX, e.clientY)
      if (ip) dragPosRef.current.copy(ip)
    }

    const onUp = (e: PointerEvent) => {
      const ip = project(e.clientX, e.clientY)
      onDragEnd(ip ?? null)
      try {
        if (dragPointerIdRef.current != null) {
          gl.domElement.releasePointerCapture(dragPointerIdRef.current)
          dragPointerIdRef.current = null
        }
      } catch { /* ignore */ }
    }

    gl.domElement.addEventListener('pointermove', onMove)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    try {
      if (dragPointerIdRef.current != null) {
        gl.domElement.setPointerCapture(dragPointerIdRef.current)
      }
    } catch { /* ignore */ }

    return () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try {
        if (dragPointerIdRef.current != null) {
          gl.domElement.releasePointerCapture(dragPointerIdRef.current)
          dragPointerIdRef.current = null
        }
      } catch { /* ignore */ }
    }
  }, [enabled, gl, camera, dragPosRef, dragPointerIdRef, onDragEnd])

  return null
}

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
  const { showToast, toastElements } = useToast()
  const [turn, setTurn] = useState(0)
  const turnRef = useRef(0)
  const [battleCalculating, setBattleCalculating] = useState(false)
  const [damagePopups, setDamagePopups] = useState<DamagePopupData[]>([])
  /** 受擊閃光訊號：uid → 遞增整數，每次受擊 +1 */
  const [hitFlashSignals, setHitFlashSignals] = useState<Record<string, number>>({})
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  /** 跳過戰鬥旗標 */
  const skipBattleRef = useRef(false)

  /* ── Phase 7: Battle HUD 狀態 ── */
  const [battleBuffs, setBattleBuffs] = useState<BattleBuffMap>({})
  const [battleEnergy, setBattleEnergy] = useState<BattleEnergyMap>({})
  const [skillToasts, setSkillToasts] = useState<SkillToast[]>([])
  const [elementHints, setElementHints] = useState<ElementHint[]>([])
  const [passiveHints, setPassiveHints] = useState<PassiveHint[]>([])
  const [buffApplyHints, setBuffApplyHints] = useState<BuffApplyHint[]>([])
  const skillToastIdRef = useRef(0)
  const elementHintIdRef = useRef(0)
  const passiveHintIdRef = useRef(0)
  const buffApplyHintIdRef = useRef(0)
  useEffect(() => { speedRef.current = speed }, [speed])
  const [battleResult, setBattleResult] = useState<'victory' | 'defeat' | null>(null)

  /** 勝利獎勵結算資料（勝利時才有值） */
  const [victoryRewards, setVictoryRewards] = useState<{
    exp: number
    gold: number
    diamond: number
    drops: { itemId: string; quantity: number }[]
    stars: 1 | 2 | 3
    isFirst: boolean
    resourceSpeed: { goldPerHour: number; expItemsPerHour: number } | null
  } | null>(null)

  /* ── Domain Engine Data ── */
  const skillsRef = useRef<Map<string, SkillTemplate>>(new Map())
  const heroSkillsRef = useRef<Map<number, import('./domain').HeroSkillConfig>>(new Map())
  const heroInputsRef = useRef<RawHeroInput[]>([])
  /** BattleHero map during battle — uid → BattleHero */
  const battleHeroesRef = useRef<Map<string, BattleHero>>(new Map())

  /* ── 戰鬥紀錄 & 統計 ── */
  /** 紀錄本場戰鬥所有 BattleAction（用於回放） */
  const battleActionsRef = useRef<BattleAction[]>([])
  /** 戰鬥統計：每位英雄的輸出/治療/承傷 */
  interface BattleStatEntry { name: string; side: 'player' | 'enemy'; damageDealt: number; healingDone: number; damageTaken: number }
  const [battleStats, setBattleStats] = useState<Record<string, BattleStatEntry>>({})
  /** 是否顯示戰鬥統計面板 */
  const [showBattleStats, setShowBattleStats] = useState(false)
  /** 是否正在回放 */
  const isReplayingRef = useRef(false)

  /* ── 預載追蹤 ── */
  const preloadedGlbUrls = useRef(new Set<string>())
  const preloadedThumbUrls = useRef(new Set<string>())
  const [preloadProgress, setPreloadProgress] = useState<number | null>(null)
  const didInitFetch = useRef(false)

  /* ── 提前背景載入（登入期間就開始，不阻塞 loading 畫面） ── */
  const earlyHeroesRef = useRef<Promise<RawHeroData[]> | null>(null)
  const earlySaveRef = useRef<Promise<unknown> | null>(null)
  const earlySaveStarted = useRef(false)

  /* ── 信箱預加載狀態 ── */
  const [mailItems, setMailItems] = useState<MailItem[]>([])
  const [mailLoaded, setMailLoaded] = useState(false)
  const mailUnclaimedCount = useMemo(
    () => mailItems.filter(m => m.rewards.length > 0 && !m.claimed).length,
    [mailItems],
  )
  /** 刷新信箱資料（從 API 重新載入） */
  const refreshMailData = useCallback(async () => {
    try {
      invalidateMailCache()
      const { mails } = await loadMail()
      setMailItems(mails)
      setMailLoaded(true)
    } catch { /* silent */ }
  }, [])

  /** 完整登出：清除所有服務層快取 + React state + ref 守門旗標 */
  const handleFullLogout = useCallback(() => {
    // 1. Auth
    authHook.doLogout()

    // 2. 服務層快取全清
    clearLocalSaveCache()          // save cache + pending + debounce
    clearLocalPool()               // gacha pool/pity/owned/pending localStorage + memory
    clearGachaPreload()            // preloaded gacha results
    clearGameDataCache()           // heroes/skills/heroSkills memory cache
    clearSheetCache()              // sheet API memory cache
    invalidateMailCache()          // mail preload memory cache
    clearInventoryCache()          // inventory state + localStorage
    clearPendingOps()              // optimistic queue localStorage

    // 3. React state 重設
    setGameState('PRE_BATTLE')
    setMenuScreen('none')
    setHeroesList([])
    heroesListRef.current = []
    setPlayerSlots(EMPTY_SLOTS)
    setEnemySlots(EMPTY_SLOTS)
    pSlotsRef.current = EMPTY_SLOTS
    eSlotsRef.current = EMPTY_SLOTS
    preBattlePlayerSlotsRef.current = EMPTY_SLOTS
    setMailItems([])
    setMailLoaded(false)
    setBattleResult(null)
    setVictoryRewards(null)
    setBattleBuffs({})
    setBattleEnergy({})
    setSkillToasts([])
    setElementHints([])
    setPassiveHints([])
    setBuffApplyHints([])
    setBattleStats({})
    setShowBattleStats(false)
    setStageId('1-1')
    setStageMode('story')
    setTurn(0)
    turnRef.current = 0
    setDamagePopups([])
    setHitFlashSignals({})
    setActorStates({})
    actorStatesRef.current = {}
    moveTargetsRef.current = {}
    // ★ 戰鬥倍速從 localStorage 恢復（使用者偏好應跨局保留）
    const savedSpd = Number(localStorage.getItem('battleSpeed'))
    const restoredSpd = savedSpd && [1, 2, 4, 8].includes(savedSpd) ? savedSpd : 1
    setSpeed(restoredSpd)
    speedRef.current = restoredSpd
    skipBattleRef.current = false
    skillToastIdRef.current = 0
    elementHintIdRef.current = 0
    passiveHintIdRef.current = 0
    buffApplyHintIdRef.current = 0
    battleHeroesRef.current = new Map()
    battleActionsRef.current = []
    isReplayingRef.current = false
    setPreloadProgress(null)

    // 4. ref 守門旗標重設（最關鍵 — 允許重新登入時重跑 Phase 0/1/2）
    didInitFetch.current = false
    earlySaveStarted.current = false
    earlyHeroesRef.current = null
    earlySaveRef.current = null
    formationRestoredRef.current = false

    // 5. 過場幕重設
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('載入資源中...')
    initialReady.current = false
    curtainClosePromiseRef.current = null

    // 6. 切回登入畫面
    setShowGame(false)
  }, [authHook]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 槽位 ── */
  const [playerSlots, setPlayerSlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const [enemySlots, setEnemySlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const pSlotsRef = useRef(EMPTY_SLOTS)
  const eSlotsRef = useRef(EMPTY_SLOTS)
  /** 戰鬥前玩家陣容快照（用於重試時恢復） */
  const preBattlePlayerSlotsRef = useRef<(SlotHero | null)[]>(EMPTY_SLOTS)

  /** 是否已從存檔恢復陣型（避免空陣型覆蓋） */
  const formationRestoredRef = useRef(false)

  /** 同步更新 state + ref */
  const updatePlayerSlots = useCallback((updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => {
    setPlayerSlots((prev) => {
      const next = updater(prev)
      pSlotsRef.current = next
      return next
    })
  }, [])
  const updateEnemySlots = useCallback((updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => {
    setEnemySlots((prev) => {
      const next = updater(prev)
      eSlotsRef.current = next
      return next
    })
  }, [])

  /** 從存檔恢復上陣陣型到 playerSlots（若目前為空） */
  const restoreFormationFromSave = useCallback(() => {
    // 只在 playerSlots 全空時才恢復
    if (pSlotsRef.current.some(Boolean)) return
    try {
      const saveState = getSaveState()
      const savedFormation = saveState?.save.formation
      if (!savedFormation || !Array.isArray(savedFormation)) return
      const data = heroesListRef.current
      if (!data.length) return
      const heroMap = new Map<string, { hero: RawHeroData; idx: number }>()
      data.forEach((h, idx) => {
        const hid = String(h.HeroID ?? h.id ?? idx + 1)
        heroMap.set(hid, { hero: h, idx })
      })
      const ownedIds = new Set(
        (saveState?.heroes ?? []).map(h => String(h.heroId)),
      )
      const restored: (SlotHero | null)[] = savedFormation.map((heroId, slot) => {
        if (!heroId) return null
        const hid = String(heroId)
        if (!ownedIds.has(hid)) return null
        const found = heroMap.get(hid)
        if (!found) return null
        const { hero, idx } = found
        const mid = normalizeModelId(hero, idx)
        return {
          ...hero,
          currentHP: (hero.HP ?? 1) as number,
          _uid: `${mid}_player_${slot}`,
          _modelId: mid,
          ModelID: mid,
        }
      })
      if (restored.some(Boolean)) {
        updatePlayerSlots(() => restored)
      }
    } catch (e) { console.warn('[formation restore]', e) }
  }, [updatePlayerSlots])

  /* ── 角色狀態 ── */
  const [actorStates, setActorStates] = useState<Record<string, ActorState>>({})
  const actorStatesRef = useRef<Record<string, ActorState>>({})
  /** 前進目標位置（世界座標），uid → [x, y, z] */
  const moveTargetsRef = useRef<Record<string, Vector3Tuple>>({})
  /** 戰鬥流程驗證器（僅 dev 模式啟用） */
  const flowValidatorRef = useRef<BattleFlowValidator | null>(null)
  /** 反作弊校驗結果（背景非同步取得） */
  const antiCheatRef = useRef<{ promise: Promise<VerifyResult>; abort: () => void } | null>(null)
  /** 戰鬥結算 Promise（complete-battle：反作弊 + 伺服器端獎勵計算） */
  const completeBattleRef = useRef<Promise<CompleteBattleResult> | null>(null)
  const setActorState = (id: string, s: ActorState) => {
    // dev 模式：驗證狀態轉換合法性
    if (import.meta.env.DEV && flowValidatorRef.current) {
      flowValidatorRef.current.transition(id, s)
    }
    actorStatesRef.current = { ...actorStatesRef.current, [id]: s }
    setActorStates(actorStatesRef.current)
  }

  /* ── 過場幕 ── */
  const [curtainVisible, setCurtainVisible] = useState(true)
  const [curtainFading, setCurtainFading] = useState(false)
  const [curtainText, setCurtainText] = useState('載入資源中...')
  const initialReady = useRef(false)
  const curtainClosePromiseRef = useRef<Promise<boolean> | null>(null)

  const closeCurtain = useCallback((delayMs = SCENE_RENDER_GRACE_MS) => {
    if (curtainClosePromiseRef.current) return curtainClosePromiseRef.current
    initialReady.current = true
    curtainClosePromiseRef.current = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        setCurtainFading(true)
        setTimeout(() => {
          setCurtainVisible(false)
          resolve(true)
        }, CURTAIN_FADE_MS)
      }, delayMs)
    })
    return curtainClosePromiseRef.current
  }, [])

  /* ── 動作完成 / 移動完成 Promise（含安全逾時） ── */
  const actionResolveRefs = useRef<Record<string, ActionResolveEntry>>({})
  const waitForAction = useCallback((uid: string, expectedState: AnimationState | null = null) => {
    // 跳過模式：立即 resolve
    if (skipBattleRef.current) return Promise.resolve()
    // ★ 防碰撞：若同一 uid 已有待處理的 promise，先 resolve 舊的
    const existing = actionResolveRefs.current[uid]
    if (existing) {
      console.warn(`[Battle] waitForAction collision: uid=${uid}, resolving old (expected=${existing.expectedState}) before new (expected=${expectedState})`)
      existing.resolve()
      delete actionResolveRefs.current[uid]
    }
    return new Promise<void>((resolve) => {
      actionResolveRefs.current[uid] = { resolve, expectedState }
      // 安全逾時：防止動畫回呼遺失導致永久卡住
      // ★ 分頁隱藏時 rAF 停止 → 動畫不前進 → 不應算逾時，延後重排
      const check = () => {
        const entry = actionResolveRefs.current[uid]
        if (!entry || entry.resolve !== resolve) return // 已被正常 resolve
        if (document.hidden) { setTimeout(check, 5000); return } // 分頁隱藏，延後
        console.warn(`[Battle] waitForAction timeout: uid=${uid}, expected=${expectedState}`)
        entry.resolve()
        delete actionResolveRefs.current[uid]
      }
      setTimeout(check, 5000)
    })
  }, [])
  const handleActorActionDone = useCallback((uid: string, doneState: AnimationState) => {
    const entry = actionResolveRefs.current[uid]
    if (!entry) return
    if (entry.expectedState && entry.expectedState !== doneState) return
    entry.resolve()
    delete actionResolveRefs.current[uid]
  }, [])

  const moveResolveRefs = useRef<Record<string, () => void>>({})
  const waitForMove = useCallback((uid: string) => {
    // 跳過模式：立即 resolve
    if (skipBattleRef.current) return Promise.resolve()
    // ★ 防碰撞：若同一 uid 已有待處理的 promise，先 resolve 舊的
    const existing = moveResolveRefs.current[uid]
    if (existing) {
      console.warn(`[Battle] waitForMove collision: uid=${uid}, resolving old before new`)
      existing()
      delete moveResolveRefs.current[uid]
    }
    return new Promise<void>((resolve) => {
      moveResolveRefs.current[uid] = resolve
      // 安全逾時：防止移動回呼遺失導致永久卡住
      // ★ 分頁隱藏時 rAF 停止 → 移動 lerp 不前進 → 不應算逾時，延後重排
      const check = () => {
        const r = moveResolveRefs.current[uid]
        if (!r || r !== resolve) return
        if (document.hidden) { setTimeout(check, 5000); return }
        console.warn(`[Battle] waitForMove timeout: uid=${uid}`)
        r()
        delete moveResolveRefs.current[uid]
      }
      setTimeout(check, 5000)
    })
  }, [])
  const handleMoveDone = useCallback((uid: string) => {
    const r = moveResolveRefs.current[uid]
    if (r) { r(); delete moveResolveRefs.current[uid] }
  }, [])

  const handleModelReady = useCallback(() => { /* 保留介面 */ }, [])

  /** 新增傷害彈窗 + 觸發受擊閃光（支援複數目標） */
  const addDamage = (targetUids: string | string[], value: number) => {
    const uids = Array.isArray(targetUids) ? targetUids : [targetUids]
    for (const uid of uids) {
      const id = Math.random()
      setDamagePopups((prev) => [...prev, { id, uid, value }])
      setTimeout(() => setDamagePopups((prev) => prev.filter((p) => p.id !== id)), 1500)
    }
    // 觸發受擊閃光
    setHitFlashSignals((prev) => {
      const next = { ...prev }
      for (const uid of uids) {
        next[uid] = (next[uid] || 0) + 1
      }
      return next
    })
  }

  /* ── 預載 ── */
  const preloadModelAnimations = useCallback(async (
    modelIds: string[],
    onProgress?: (ratio: number) => void,
  ) => {
    if (!modelIds.length) { onProgress?.(1); return }
    // 1 mesh GLB + 5 anim GLBs per model
    const animNames = ['idle', 'attack', 'hurt', 'dying', 'run']
    const totalSteps = modelIds.length * (1 + animNames.length)
    let completed = 0
    for (const mid of modelIds) {
      const base = `${import.meta.env.BASE_URL}models/${mid}`
      // Mesh GLB
      const meshUrl = `${base}/${mid}.glb`
      if (!preloadedGlbUrls.current.has(meshUrl)) {
        try { await loadGlbShared(meshUrl); preloadedGlbUrls.current.add(meshUrl) } catch (e) { console.error('[preload mesh]', meshUrl, e) }
      }
      completed++
      onProgress?.(completed / totalSteps)
      await new Promise((r) => setTimeout(r, 0))
      // Animation GLBs
      for (const anim of animNames) {
        const url = `${base}/${mid}_${anim}.glb`
        if (!preloadedGlbUrls.current.has(url)) {
          try { await loadGlbShared(url); preloadedGlbUrls.current.add(url) } catch (e) { console.error('[preload anim]', url, e) }
        }
        completed++
        onProgress?.(completed / totalSteps)
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  }, [])

  const preloadThumbnails = useCallback(async (
    modelIds: string[],
    onProgress?: (ratio: number) => void,
  ) => {
    if (!modelIds.length) { onProgress?.(1); return }
    let completed = 0
    for (const mid of modelIds) {
      const url = `${import.meta.env.BASE_URL}models/${mid}/thumbnail.png`
      if (!preloadedThumbUrls.current.has(url)) {
        await new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = img.onerror = () => resolve()
          img.src = url
        })
        preloadedThumbUrls.current.add(url)
      }
      completed++
      onProgress?.(completed / modelIds.length)
      await new Promise((r) => setTimeout(r, 0))
    }
  }, [])

  /* ── 資料載入 ── */
  const fetchData = useRef<(() => Promise<void>) | null>(null)
  fetchData.current = async () => {
    const stageWeight = { fetch: 0.7, finalize: 0.3 }
    const stageProgress = { fetch: 0, finalize: 0 }
    let lastReported = 0
    const refresh = () => {
      const total =
        stageProgress.fetch * stageWeight.fetch +
        stageProgress.finalize * stageWeight.finalize
      const clamped = clamp01(total)
      if (clamped > lastReported) {
        lastReported = clamped
        setPreloadProgress(clamped)
      }
    }

    try {
      setGameState('FETCHING')
      setCurtainText('載入資源中...')
      setPreloadProgress(0)

      // 並行載入：英雄列表 + 全部遊戲資料 + 玩家存檔（含關卡進度）
      // ★ Phase 0/1 已提前啟動，此處 await 通常瞬間回傳
      const [earlyHeroes, gameData] = await Promise.all([
        earlyHeroesRef.current ?? fetch(API_URL).then(r => r.json()).then(heroRes => {
          const rawList = Array.isArray(heroRes) ? heroRes : (heroRes?.value ?? [])
          return (Array.isArray(rawList) ? rawList : []) as RawHeroData[]
        }),
        loadAllGameData((r) => { stageProgress.fetch = r; refresh() }),
        // 等待存檔載入完成（含 storyProgress），確保大廳顯示正確關卡進度
        earlySaveRef.current ?? Promise.resolve(),
      ])
      stageProgress.fetch = 1; refresh()

      const data: RawHeroData[] = earlyHeroes
      setHeroesList(data)
      heroesListRef.current = data
      // 儲存 domain 層資料
      skillsRef.current = gameData.skills
      heroSkillsRef.current = gameData.heroSkills
      heroInputsRef.current = gameData.heroes
      if (!data.length) return

      // ★ 從存檔恢復上次上陣陣型（非阻塞，不影響 loading 動畫）
      try {
        // 直接從 service 層讀取（避免 React state 閉包延遲）
        const saveState = getSaveState()
        const savedFormation = saveState?.save.formation
        if (savedFormation && Array.isArray(savedFormation)) {
          const heroMap = new Map<string, { hero: RawHeroData; idx: number }>()
          data.forEach((h, idx) => {
            const hid = String(h.HeroID ?? h.id ?? idx + 1)
            heroMap.set(hid, { hero: h, idx })
          })
          // 確認玩家已擁有的英雄
          const ownedIds = new Set(
            (saveState?.heroes ?? []).map(h => String(h.heroId)),
          )
          const restored: (SlotHero | null)[] = savedFormation.map((heroId, slot) => {
            if (!heroId) return null
            const hid = String(heroId)
            // 只恢復擁有的英雄
            if (!ownedIds.has(hid)) return null
            const found = heroMap.get(hid)
            if (!found) return null
            const { hero, idx } = found
            const mid = normalizeModelId(hero, idx)
            return {
              ...hero,
              currentHP: (hero.HP ?? 1) as number,
              _uid: `${mid}_player_${slot}`,
              _modelId: mid,
              ModelID: mid,
            }
          })
          if (restored.some(Boolean)) {
            updatePlayerSlots(() => restored)
          }
        }
      } catch (e) { console.warn('[formation restore]', e) }
      formationRestoredRef.current = true

      // ★ 從 localStorage 恢復戰鬥倍速（非阻塞）
      try {
        const savedSpeed = Number(localStorage.getItem('battleSpeed'))
        if (savedSpeed && [1, 2, 4, 8].includes(savedSpeed)) {
          setSpeed(savedSpeed)
        }
      } catch (e) { console.warn('[speed restore]', e) }

      // ★ 敵方陣型移至 handleStageSelect 選關時才生成

      // ★ 模型 & 縮圖：背景非同步下載，不阻塞進大廳
      //   Phase 0 已觸發 loadGlbShared 下載；此處確保全部 URL 都進快取
      const preloadIds = Array.from(new Set(data.map((h, i) => normalizeModelId(h, i))))
      preloadModelAnimations(preloadIds).catch(() => {})
      preloadThumbnails(preloadIds).catch(() => {})

      stageProgress.finalize = 0.5; refresh()
      setCurtainText('初始化戰場...')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      stageProgress.finalize = 1; refresh()

      setGameState('MAIN_MENU')
      await closeCurtain(INITIAL_CURTAIN_GRACE_MS)
    } catch (err) {
      console.error('[fetchData]', err)
      setPreloadProgress(null)
      await closeCurtain(INITIAL_CURTAIN_GRACE_MS)
    }
  }

  // ── Phase 0: 公開資料 — 元件掛載後立刻開始（不需認證）──
  useEffect(() => {
    if (earlyHeroesRef.current) return

    // (A) 英雄列表 GET（公開端點，不需 guestToken）
    earlyHeroesRef.current = fetch(API_URL)
      .then(r => r.json())
      .then(heroRes => {
        const rawList = Array.isArray(heroRes) ? heroRes : (heroRes?.value ?? [])
        return (Array.isArray(rawList) ? rawList : []) as RawHeroData[]
      })
      .catch(e => { console.warn('[early] heroes fetch failed:', e); return [] as RawHeroData[] })

    // (B) 4 張 Game Data Sheet（heroes/skills/hero_skills/element_matrix）
    //     loadAllGameData 內有快取，fetchData 再呼叫會直接回傳
    loadAllGameData().catch(() => {})

    // (C) 英雄列表解析完後 → 立刻背景啟動 GLB 模型 & 縮圖下載
    //     loadGlbShared 有全域 pending Map，重複 URL 只請求一次
    earlyHeroesRef.current.then(data => {
      if (!data.length) return
      const ids = Array.from(new Set(data.map((h, i) => normalizeModelId(h, i))))
      const animNames = ['idle', 'attack', 'hurt', 'dying', 'run']
      for (const mid of ids) {
        const base = `${import.meta.env.BASE_URL}models/${mid}`
        loadGlbShared(`${base}/${mid}.glb`).catch(() => {})
        for (const anim of animNames) {
          loadGlbShared(`${base}/${mid}_${anim}.glb`).catch(() => {})
        }
        // 縮圖
        const img = new Image()
        img.src = `${base}/thumbnail.png`
      }
    })
  }, [])  

  // ── Phase 1: 認證成功 → 立刻背景載入存檔 & 信箱 & 背包（不等 showGame）──
  useEffect(() => {
    if (!authHook.auth.isLoggedIn || earlySaveStarted.current) return
    earlySaveStarted.current = true
    earlySaveRef.current = saveHook.doLoadSave().catch(e => console.warn('[early] save load failed:', e))
    // 背包提前載入，避免升級/升星面板看到素材數量 0
    loadInventory().catch(e => console.warn('[early] inventory load failed:', e))
    preloadMail()
      .then(({ mails }) => { setMailItems(mails); setMailLoaded(true) })
      .catch(e => console.warn('[early] mail preload failed:', e))
  }, [authHook.auth.isLoggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── PWA: 自動領取安裝獎勵（standalone 模式首次載入時） ──
  useEffect(() => {
    if (!isStandalone()) return
    if (!authHook.auth.isLoggedIn || !authHook.auth.guestToken) return
    const save = saveHook.playerData?.save
    if (!save) return
    // 已領取過就跳過
    if (save.pwaRewardClaimed === true || save.pwaRewardClaimed === ('true' as unknown as boolean)) return
    claimPwaReward(authHook.auth.guestToken)
      .then((res) => {
        if (res.success) refreshMailData()
      })
      .catch(() => { /* silent */ })
  }, [authHook.auth.isLoggedIn, authHook.auth.guestToken, saveHook.playerData?.save]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 2: showGame → 走 fetchData 匯總（大部分資料已在背景載完）──
  useEffect(() => {
    if (!showGame) return
    if (didInitFetch.current) return
    didInitFetch.current = true
    // save + mail 已在 Phase 1 啟動，不再重複
    fetchData.current?.()
  }, [showGame])  

  // （陣型儲存移至 runBattleLoop 開戰時執行，避免尚未開戰就存檔）

  // 長載入提示
  useEffect(() => {
    const t = setTimeout(() => {
      if (!initialReady.current && gameState === 'FETCHING') setCurtainText('載入資源中...')
    }, 12000)
    return () => clearTimeout(t)
  }, [gameState])

  /* ── BGM 自動切換 ── */
  useEffect(() => {
    if (!showGame) {
      audioManager.playBgm('login')
      return
    }
    if (gameState === 'GAMEOVER') {
      audioManager.playBgm(battleResult === 'victory' ? 'victory' : 'defeat')
    } else if (gameState === 'BATTLE') {
      audioManager.playBgm('battle')
    } else if (gameState === 'MAIN_MENU') {
      if (menuScreen === 'gacha') {
        audioManager.playBgm('gacha')
      } else {
        audioManager.playBgm('lobby')
      }
    } else if (gameState === 'IDLE') {
      audioManager.playBgm('lobby')
    }
  }, [showGame, gameState, menuScreen, battleResult])

  /* ── 重試（在同一關卡重置到選擇上陣階段） ── */
  const retryBattle = () => {
    // 恢復戰前玩家陣容（HP 完全回復、死亡英雄復活）
    const restored = preBattlePlayerSlotsRef.current.map(slot => {
      if (!slot) return null
      return { ...slot, currentHP: (slot.HP ?? 1) as number }
    })
    updatePlayerSlots(() => restored)

    // 重建敵方（同一關卡、同一模式）
    updateEnemySlots(() => buildEnemySlotsFromStage(stageMode, stageId, heroesList))

    // 清除戰鬥狀態
    setTurn(0); turnRef.current = 0
    setDamagePopups([])
    setBattleResult(null)
    setVictoryRewards(null)
    actorStatesRef.current = {}
    setActorStates({})
    setHitFlashSignals({})
    moveTargetsRef.current = {}
    // Phase 7: 重置戰鬥 HUD 狀態
    setBattleBuffs({})
    setBattleEnergy({})
    setSkillToasts([])
    setElementHints([])
    setPassiveHints([])
    setBuffApplyHints([])
    // ★ 清除殘留的動畫/移動 Promise — 避免上一場的 stale timeout 漏進新戰鬥
    for (const key of Object.keys(actionResolveRefs.current)) {
      actionResolveRefs.current[key]?.resolve()
      delete actionResolveRefs.current[key]
    }
    for (const key of Object.keys(moveResolveRefs.current)) {
      moveResolveRefs.current[key]?.()
      delete moveResolveRefs.current[key]
    }

    setGameState('IDLE')
  }

  /* ── 戰鬥回放 ── */
  const replayBattle = async () => {
    if (battleActionsRef.current.length === 0) { showToast('沒有可回放的戰鬥紀錄'); return }

    const savedActions = [...battleActionsRef.current]

    // 回放使用本地資料，不需遮罩 — 直接重置場景
    // 恢復戰前陣容
    const restored = preBattlePlayerSlotsRef.current.map(slot => {
      if (!slot) return null
      return { ...slot, currentHP: (slot.HP ?? 1) as number }
    })
    updatePlayerSlots(() => restored)
    updateEnemySlots(() => buildEnemySlotsFromStage(stageMode, stageId, heroesList))

    // 清除戰鬥狀態
    setTurn(0); turnRef.current = 0
    setDamagePopups([])
    setBattleResult(null)
    setShowBattleStats(false)
    actorStatesRef.current = {}
    setActorStates({})
    setHitFlashSignals({})
    moveTargetsRef.current = {}
    setBattleBuffs({})
    setBattleEnergy({})
    setSkillToasts([])
    setElementHints([])
    setPassiveHints([])
    setBuffApplyHints([])
    // ★ 清除殘留的動畫/移動 Promise — 避免上一場的 stale timeout 漏進回放
    for (const key of Object.keys(actionResolveRefs.current)) {
      actionResolveRefs.current[key]?.resolve()
      delete actionResolveRefs.current[key]
    }
    for (const key of Object.keys(moveResolveRefs.current)) {
      moveResolveRefs.current[key]?.()
      delete moveResolveRefs.current[key]
    }
    skipBattleRef.current = false

    // 等 React commit + 模型掛載就緒（2~3 幀即可，無需遮罩）
    await waitFrames(3)

    runBattleLoop(savedActions)
  }

  /* ── 回大廳（戰敗後返回主選單） ── */
  const backToLobby = () => {
    // 清空戰場
    updatePlayerSlots(() => Array(6).fill(null))
    updateEnemySlots(() => Array(6).fill(null))
    setTurn(0); turnRef.current = 0
    setDamagePopups([])
    setBattleResult(null)
    setVictoryRewards(null)
    actorStatesRef.current = {}
    setActorStates({})
    setHitFlashSignals({})
    moveTargetsRef.current = {}
    setBattleBuffs({})
    setBattleEnergy({})
    setSkillToasts([])
    setElementHints([])
    setPassiveHints([])
    setBuffApplyHints([])
    setMenuScreen('none')
    // ★ 清除殘留的動畫/移動 Promise
    for (const key of Object.keys(actionResolveRefs.current)) {
      actionResolveRefs.current[key]?.resolve()
      delete actionResolveRefs.current[key]
    }
    for (const key of Object.keys(moveResolveRefs.current)) {
      moveResolveRefs.current[key]?.()
      delete moveResolveRefs.current[key]
    }
    setGameState('MAIN_MENU')
  }

  /* ── 下一關（勝利後推進） ── */
  const goNextStage = async () => {
    if (stageMode === 'tower') {
      // 爬塔：樓層 +1
      const nextFloor = (Number(stageId) || 1) + 1
      setCurtainVisible(true)
      setCurtainFading(false)
      setCurtainText('前往下一層...')
      curtainClosePromiseRef.current = null

      await waitFrames(2)

      const restored = preBattlePlayerSlotsRef.current.map(slot => {
        if (!slot) return null
        return { ...slot, currentHP: (slot.HP ?? 1) as number }
      })
      updatePlayerSlots(() => restored)
      setStageId(String(nextFloor))
      updateEnemySlots(() => buildEnemySlotsFromStage('tower', String(nextFloor), heroesList))
      setTurn(0); turnRef.current = 0
      setDamagePopups([])
      setBattleResult(null)
      setVictoryRewards(null)
      actorStatesRef.current = {}
      setActorStates({})
      setHitFlashSignals({})
      moveTargetsRef.current = {}
      setBattleBuffs({})
      setBattleEnergy({})
      setSkillToasts([])
      setElementHints([])
      setPassiveHints([])
      setBuffApplyHints([])
      // ★ 清除殘留的動畫/移動 Promise
      for (const key of Object.keys(actionResolveRefs.current)) {
        actionResolveRefs.current[key]?.resolve()
        delete actionResolveRefs.current[key]
      }
      for (const key of Object.keys(moveResolveRefs.current)) {
        moveResolveRefs.current[key]?.()
        delete moveResolveRefs.current[key]
      }
      setGameState('IDLE')
      closeCurtain()
      return
    }

    // Story mode: 下一關
    const nextId = getNextStageId(stageId)
    if (!nextId) {
      showToast('恭喜！已通關所有關卡')
      backToLobby()
      return
    }

    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('前往下一關...')
    curtainClosePromiseRef.current = null

    await waitFrames(2)

    const restored = preBattlePlayerSlotsRef.current.map(slot => {
      if (!slot) return null
      return { ...slot, currentHP: (slot.HP ?? 1) as number }
    })
    updatePlayerSlots(() => restored)
    setStageId(nextId)
    updateEnemySlots(() => buildEnemySlotsFromStage(stageMode, nextId, heroesList))
    setTurn(0); turnRef.current = 0
    setDamagePopups([])
    setBattleResult(null)
    setVictoryRewards(null)
    actorStatesRef.current = {}
    setActorStates({})
    setHitFlashSignals({})
    moveTargetsRef.current = {}
    setBattleBuffs({})
    setBattleEnergy({})
    setSkillToasts([])
    setElementHints([])
    setPassiveHints([])
    setBuffApplyHints([])
    // ★ 清除殘留的動畫/移動 Promise
    for (const key of Object.keys(actionResolveRefs.current)) {
      actionResolveRefs.current[key]?.resolve()
      delete actionResolveRefs.current[key]
    }
    for (const key of Object.keys(moveResolveRefs.current)) {
      moveResolveRefs.current[key]?.()
      delete moveResolveRefs.current[key]
    }
    setGameState('IDLE')
    closeCurtain()
  }

  /* ══════════════════════════════
     戰鬥迴圈（Domain Engine 驅動）
     ══════════════════════════════ */

  const runBattleLoop = async (replayActions?: BattleAction[]) => {
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
        saveHook.doSaveFormation(heroIds)
      }
    }

    setShowBattleStats(false)
    setGameState('BATTLE')
    turnRef.current = 1; setTurn(1)
    skipBattleRef.current = false

    // ★ 清除上一場殘留的 Promise/Ref，避免 stale resolve 和 timeout 假警報
    for (const key of Object.keys(actionResolveRefs.current)) {
      actionResolveRefs.current[key]?.resolve()
      delete actionResolveRefs.current[key]
    }
    for (const key of Object.keys(moveResolveRefs.current)) {
      moveResolveRefs.current[key]?.()
      delete moveResolveRefs.current[key]
    }
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
    const slotToInput = (s: SlotHero, heroId: number): RawHeroInput => {
      return heroInputs.find(h => h.heroId === heroId) ?? {
        heroId,
        modelId: s._modelId,
        name: String(s.Name ?? ''),
        element: toElement(String((s as Record<string, unknown>).Element ?? '')),
        HP: Number(s.HP ?? 100),
        ATK: Number(s.ATK ?? 20),
        DEF: Number((s as Record<string, unknown>).DEF ?? 10),
        SPD: Number(s.Speed ?? s.SPD ?? 5),
        CritRate: Number((s as Record<string, unknown>).CritRate ?? 5),
        CritDmg: Number((s as Record<string, unknown>).CritDmg ?? 50),
      }
    }

    const heroInstances = saveHook.playerData?.heroes ?? []

    // 回放模式讀取 ref（已由 replayBattle 更新），正常模式讀取 state 快照
    const currentPlayerSlots = isReplay ? pSlotsRef.current : playerSlots
    const currentEnemySlots = isReplay ? eSlotsRef.current : enemySlots

    // 使用渲染中的 state 快照（與 JSX 中 Hero 的 uid 一致），
    // 避免 ref 因 startTransition / batching 與已渲染 UI 產生 UID 不匹配。
    for (let i = 0; i < 6; i++) {
      const p = currentPlayerSlots[i]
      if (!p) continue
      const heroId = Number(p.HeroID ?? p.id ?? 0)
      const input = slotToInput(p, heroId)
      const { activeSkill, passives } = getHeroSkillSet(heroId, skills, heroSkillsMap)

      // Build HeroInstanceData from save data (progression → combat)
      const inst = heroInstances.find(h => h.heroId === heroId)
      const heroInstanceData: HeroInstanceData | undefined = inst ? {
        heroId: inst.heroId,
        level: inst.level,
        exp: inst.exp,
        ascension: inst.ascension,
        stars: inst.stars ?? 0,
        equipment: [],     // TODO: load equipped EquipmentInstance[]
      } : undefined
      const starLevel = heroInstanceData?.stars ?? 0
      const heroRarity = Number((p as Record<string, unknown>).Rarity ?? 3)

      const bh = createBattleHero(input, 'player', i, activeSkill, passives, starLevel, p._uid, heroInstanceData, heroRarity)
      playerBH.push(bh)
      heroMap.set(bh.uid, bh)
    }

    for (let i = 0; i < 6; i++) {
      const e = currentEnemySlots[i]
      if (!e) continue
      const heroId = Number(e.HeroID ?? e.id ?? 0)
      const input = slotToInput(e, heroId)
      const { activeSkill, passives } = getHeroSkillSet(heroId, skills, heroSkillsMap)
      const enemyRarity = Number((e as Record<string, unknown>).Rarity ?? 3)
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
    setElementHints([])
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
          // ★ 同時更新 HP（maxHP）作為 HealthBar3D 的分母，
          //   避免 progression 加成後 maxHP > rawHP 導致 ratio > 1 clamp 為滿血
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
    const playHitOrDeath = async (targetUid: string, dmg: number, killed: boolean, isDodge: boolean) => {
      if (isDodge) {
        addDamage(targetUid, 0) // MISS
        await delay(350) // 讓 MISS 文字可視 + 給攻擊者後退動畫緩衝
        return
      }
      addDamage(targetUid, dmg)
      if (!skipBattleRef.current) audioManager.playSfx('hit_normal')
      const hero = heroMap.get(targetUid)
      if (!hero) return

      // ★ 角色已被移除（前一次背景死亡已完成 removeSlot）→ 只顯傷害數字，不播動畫
      if (actorStatesRef.current[targetUid] === 'DEAD') return

      if (killed) {
        // 致死攻擊：直接閃紅光 + 扣血 → 死亡動畫（跳過受傷動畫避免往後仰再回正再倒）
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
    /** 待完成的後退動畫（uid → Promise）—— 不阻塞下一個 action，讓中斷大招可立即開始 */
    const pendingRetreats = new Map<string, Promise<void>>()
    /** 背景動畫（死亡等長動畫）—— 不阻塞下一個 action，Phase C 前統一等待 */
    const backgroundAnims: Promise<void>[] = []
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
              const dmgStr = r.isDodge ? 'MISS' : `${r.damage}${r.isCrit ? ' 暴擊' : ''}${r.elementMult && r.elementMult !== 1 ? ` ×${r.elementMult}屬性` : ''}`
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
            case 'DOT_TICK': return `${name(a.targetUid)} ${a.dotType} -${a.damage}`
            case 'BUFF_APPLY': return `${name(a.targetUid)} +${a.effect.type}${a.effect.stacks > 1 ? `×${a.effect.stacks}` : ''} (${a.effect.duration}t)`
            case 'BUFF_EXPIRE': return `${name(a.targetUid)} -${a.effectType} 到期`
            case 'DEATH': return `${name(a.targetUid)} 💀 死亡`
            case 'PASSIVE_TRIGGER': return `${name(a.heroUid)} 被動【${a.skillName}】觸發`
            case 'PASSIVE_DAMAGE': return `${name(a.attackerUid)} → ${name(a.targetUid)} 被動傷害 ${a.damage}${a.killed ? ' 💀' : ''}`
            case 'ENERGY_CHANGE': return `${name(a.heroUid)} 能量 +${a.delta} → ${a.newValue}`
            case 'EXTRA_TURN': return `${name(a.heroUid)} 額外行動（${a.reason}）`
            case 'BATTLE_END': return `══ 戰鬥結束：${a.winner === 'player' ? '勝利' : a.winner === 'enemy' ? '失敗' : '平手'} ══`
            default: return JSON.stringify(a)
          }
        })()
        console.log(`%c[Battle] ${brief}`, action.type === 'TURN_START' || action.type === 'BATTLE_END' ? 'color:#facc15;font-weight:bold' : action.type === 'DEATH' ? 'color:#ef4444' : 'color:#94a3b8')
      }
      // ★ 等待所有待完成的後退動畫（閃避時無受傷動畫緩衝，前一位攻擊者可能仍在回位）
      if (action.type === 'NORMAL_ATTACK' || action.type === 'SKILL_CAST') {
        if (pendingRetreats.size > 0) {
          await Promise.all(pendingRetreats.values())
          pendingRetreats.clear()
        }
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

          // ★ 攻擊者已死（背景死亡動畫已設定 actorState='DEAD'）→ 跳過整個 action
          //   注意：不可用 atk.currentHP<=0 判斷，因 applyHpFromAction 已預扣本 action 傷害
          if (actorStatesRef.current[action.attackerUid] === 'DEAD') {
            break
          }

          // ★ 目標已死（前一筆背景死亡動畫已同步設定 actorState='DEAD'）→ 只顯傷害數字
          //   注意：不可用 tgt.currentHP<=0，同上理由（applyHpFromAction 已預扣）
          if (actorStatesRef.current[action.targetUid] === 'DEAD') {
            if (!action.result.isDodge) addDamage(action.targetUid, action.result.damage)
            break
          }

          // Phase 7: 屬性相剋指示
          if (action.result.elementMult && action.result.elementMult !== 1.0) {
            const ehId = ++elementHintIdRef.current
            const txt = action.result.elementMult > 1.0 ? '屬性剋制！' : '屬性抵抗'
            const clr = action.result.elementMult > 1.0 ? '#e63946' : '#4dabf7'
            setElementHints((prev) => [...prev, { id: ehId, text: txt, color: clr, timestamp: Date.now(), attackerUid: action.attackerUid }])
            setTimeout(() => setElementHints((prev) => prev.filter((h) => h.id !== ehId)), 2000)
          }

          // 1) 前進
          moveTargetsRef.current = { ...moveTargetsRef.current, [action.attackerUid]: getAdvancePos(atk, tgt.slot, false) }
          setActorState(action.attackerUid, 'ADVANCING')
          await waitForMove(action.attackerUid)

          // 2) 攻擊動作
          const atkDone = waitForAction(action.attackerUid, 'ATTACKING')
          setActorState(action.attackerUid, 'ATTACKING')

          // ★ 攻擊動畫開始 → 立即更新攻擊者能量
          if (action._atkEnergyNew != null) {
            setBattleEnergy((prev) => {
              if (!prev[action.attackerUid]) return prev
              return { ...prev, [action.attackerUid]: { current: action._atkEnergyNew!, max: prev[action.attackerUid]?.max ?? 1000 } }
            })
          }
          await delay(ATTACK_DELAY_MS) // 等待攻擊動畫揮擊命中點

          // 3) 傷害/受傷 or 閃避/死亡
          // ★ 受擊動畫開始前 → 立即更新受擊者能量
          if (action._tgtEnergyNew != null) {
            setBattleEnergy((prev) => {
              if (!prev[action.targetUid]) return prev
              return { ...prev, [action.targetUid]: { current: action._tgtEnergyNew!, max: prev[action.targetUid]?.max ?? 1000 } }
            })
          }
          if (action.result.isCrit && !skipBattleRef.current) audioManager.playSfx('hit_critical')

          // 3+4) 受傷/死亡 與 攻擊者後退 同時並行
          const hitPromise = playHitOrDeath(action.targetUid, action.result.damage, action.killed, action.result.isDodge)

          // 攻擊者後退（與受傷動畫並行）
          const retreatPromise = (async () => {
            await atkDone
            if ((heroMap.get(action.attackerUid)?.currentHP ?? 0) > 0) {
              // ★ 反彈傷害但存活 — 顯示反彈數字並同步 HP 條
              if (action.result.reflectDamage > 0) {
                addDamage(action.attackerUid, action.result.reflectDamage)
                const atkHero = heroMap.get(action.attackerUid)
                if (atkHero) syncHpToSlot(atkHero)
              }
              setActorState(action.attackerUid, 'RETREATING')
              await waitForMove(action.attackerUid)
              setActorState(action.attackerUid, 'IDLE')
            } else {
              // ★ 攻擊者被反彈傷害致死 — 直接播死亡動畫（跳過受傷）
              const atkHero = heroMap.get(action.attackerUid)
              if (atkHero) {
                if (action.result.reflectDamage > 0) addDamage(action.attackerUid, action.result.reflectDamage)
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
          //   非致死：等受擊動畫完成（短，且需保證狀態正確）
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
          //   注意：不可用 atk.currentHP<=0，因 applyHpFromAction 已預扣本 action 傷害
          if (actorStatesRef.current[action.attackerUid] === 'DEAD') {
            break
          }

          if (!skipBattleRef.current) audioManager.playSfx('skill_cast')

          // Phase 7: 技能名稱彈幕
          setSkillToasts((prev) => [...prev, {
            id: ++skillToastIdRef.current,
            heroName: atk.name,
            skillName: action.skillName,
            timestamp: Date.now(),
            attackerUid: action.attackerUid,
          }])

          // Phase 7: 屬性相剋指示（技能版 — 取第一個非閃避傷害目標的 elementMult）
          {
            const firstDmg = action.targets.find(t => 'damage' in t.result && !(t.result as DamageResult).isDodge)
            const em = firstDmg ? (firstDmg.result as DamageResult).elementMult : undefined
            if (em && em !== 1.0) {
              const ehId = ++elementHintIdRef.current
              const txt = em > 1.0 ? '屬性剋制！' : '屬性抵抗'
              const clr = em > 1.0 ? '#e63946' : '#4dabf7'
              setElementHints((prev) => [...prev, { id: ehId, text: txt, color: clr, timestamp: Date.now(), attackerUid: action.attackerUid }])
              setTimeout(() => setElementHints((prev) => prev.filter((h) => h.id !== ehId)), 2000)
            }
          }

          // 判斷是否有傷害目標（非攻擊技能如治療/buff不前進）
          const hasDamageTargets = action.targets.some(t => 'damage' in t.result)

          if (hasDamageTargets) {
            // 計算前進目標
            const firstDmgTarget = action.targets.find(t => 'damage' in t.result)
            const isAoe = action.targets.filter(t => 'damage' in t.result).length > 1
            const targetSlot = firstDmgTarget ? (heroMap.get(firstDmgTarget.uid)?.slot ?? 0) : 0

            // 1) 前進
            moveTargetsRef.current = { ...moveTargetsRef.current, [action.attackerUid]: getAdvancePos(atk, targetSlot, isAoe) }
            setActorState(action.attackerUid, 'ADVANCING')
            await waitForMove(action.attackerUid)
          }

          // 2) 攻擊動作（原地施法）
          const atkDone = waitForAction(action.attackerUid, 'ATTACKING')
          setActorState(action.attackerUid, 'ATTACKING')

          // ★ 攻擊動畫開始 → 立即更新攻擊者能量（技能消耗 → 0）
          if (action._atkEnergyNew != null) {
            setBattleEnergy((prev) => {
              if (!prev[action.attackerUid]) return prev
              return { ...prev, [action.attackerUid]: { current: action._atkEnergyNew!, max: prev[action.attackerUid]?.max ?? 1000 } }
            })
          }
          await delay(ATTACK_DELAY_MS) // 等待攻擊動畫揮擊命中點

          // 3) 所有目標同時播放效果（Promise.all 取代 for...of await）
          //    ★ 合併重複 uid（random_enemies 可重複選擇同一個目標）
          //    若不合併，同一 uid 同時呼叫 waitForAction 會互相覆蓋 resolve，導致卡住
          const mergedTargets = new Map<string, { uid: string; damage: number; killed: boolean; isDodge: boolean; heal: number }>()
          for (const t of action.targets) {
            if ('damage' in t.result) {
              const dr = t.result as DamageResult
              const existing = mergedTargets.get(t.uid)
              if (existing) {
                existing.damage += dr.damage
                existing.killed = existing.killed || (t.killed ?? false)
                existing.isDodge = existing.isDodge && dr.isDodge // 只要有一次命中就不算 dodge
              } else {
                mergedTargets.set(t.uid, { uid: t.uid, damage: dr.damage, killed: t.killed ?? false, isDodge: dr.isDodge, heal: 0 })
              }
            } else {
              // 治療
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
              const p = playHitOrDeath(uid, m.damage, m.killed, m.isDodge)
              if (m.killed) deathPromises.push(p)
              else hurtPromises.push(p)
            }
            if (m.heal > 0) {
              addDamage(uid, -m.heal) // 負值 = 治療
              const hero = heroMap.get(uid)
              if (hero) syncHpToSlot(hero)
            }
          }
          // ★ 只等非致死受傷動畫（短）；死亡動畫在背景執行不阻塞
          await Promise.all(hurtPromises)
          backgroundAnims.push(...deathPromises)

          // 4) 攻擊者後退（與受傷動畫並行）
          const skillRetreatPromise = (async () => {
            await atkDone
            if ((heroMap.get(action.attackerUid)?.currentHP ?? 0) > 0) {
              // ★ 反彈傷害但存活
              const totalReflect = action.targets.reduce((sum: number, t: { uid: string; result: DamageResult | { heal: number }; killed?: boolean }) => {
                if ('damage' in t.result) return sum + (t.result as DamageResult).reflectDamage
                return sum
              }, 0)
              if (totalReflect > 0) {
                addDamage(action.attackerUid, totalReflect)
                const atkHeroAlive = heroMap.get(action.attackerUid)
                if (atkHeroAlive) syncHpToSlot(atkHeroAlive)
              }
              if (hasDamageTargets) {
                setActorState(action.attackerUid, 'RETREATING')
                await waitForMove(action.attackerUid)
              }
              setActorState(action.attackerUid, 'IDLE')
            } else {
              // ★ 攻擊者被反彈傷害致死 — 直接播死亡動畫（跳過受傷）
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
            addDamage(action.targetUid, action.damage)
            const hero = heroMap.get(action.targetUid)
            if (hero) {
              syncHpToSlot(hero)
              // ★ DOT 致死：直接播放死亡動畫（後續 DEATH action 會因 actorState===DEAD 跳過）
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
            addDamage(action.targetUid, action.damage)
            const hero = heroMap.get(action.targetUid)
            if (hero) {
              syncHpToSlot(hero)
              // ★ 被動傷害致死：直接播放死亡動畫（後續 DEATH action 會因 actorState===DEAD 跳過）
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
          // DOT / 被動傷害 / 反彈等非攻擊致死 — 直接播死亡動畫（跳過受傷）
          const hero = heroMap.get(action.targetUid)
          // ★ 已經在 DEAD 狀態（背景動畫已處理）→ 跳過
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
            // 如果同類型已存在，更新；否則添加
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
          setPassiveHints((prev) => [...prev, {
            id: phId,
            skillName: action.skillName,
            timestamp: Date.now(),
            heroUid: action.heroUid,
          }])
          setTimeout(() => setPassiveHints((prev) => prev.filter((h) => h.id !== phId)), 2000)
          break
        }

        case 'EXTRA_TURN':
          // 額外行動：表現層目前不需要特殊處理，後續可加特效提示
          break

        case 'BATTLE_END':
          break
      }
    }

    // ── Phase A：計算戰鬥結果（本地優先，毫秒級完成） ──
    setBattleCalculating(true)
    let allActions: BattleAction[]
    let winner: 'player' | 'enemy' | 'draw'
    // needsHpSync: heroMap 的 HP 未被引擎直接修改，需在播放動畫前手動同步
    //  - 回放模式：heroMap 是重新建立的物件 → true
    //  - 本地計算：runBattleCollect 直接修改 heroMap → false
    let needsHpSync = false

    // ── 清除上一場的反作弊校驗 ──
    if (antiCheatRef.current) {
      antiCheatRef.current.abort()
      antiCheatRef.current = null
    }
    completeBattleRef.current = null

    if (replayActions) {
      allActions = replayActions
      const endAct = replayActions.find(a => a.type === 'BATTLE_END') as { type: 'BATTLE_END'; winner: 'player' | 'enemy' | 'draw' } | undefined
      winner = endAct?.winner ?? 'draw'
      needsHpSync = true
    } else {
      // ── 產生確定性種子 & 快照（反作弊校驗 + 伺服器端獎勵計算用） ──
      const battleSeed = generateBattleSeed()
      // 深拷貝戰前的 BattleHero 快照（runBattleCollect 會修改原物件）
      const snapshotPlayers = JSON.parse(JSON.stringify(playerBH)) as BattleHero[]
      const snapshotEnemies = JSON.parse(JSON.stringify(enemyBH)) as BattleHero[]

      // 本地引擎計算（毫秒級完成，無需等待伺服器）
      const result = await runBattleCollect(playerBH, enemyBH, { maxTurns: 50, seed: battleSeed })
      allActions = result.actions
      winner = result.winner

      // ── 計算星級（需在 heroMap 被重置前，用最終狀態計算） ──
      const totalHeroCount = playerSlots.filter(Boolean).length
      // 從戰鬥結果中取得存活英雄數量（此時 heroMap 是最終狀態）
      const survivingCount = playerBH.filter(h => h.currentHP > 0).length
      const localStars = calculateStarRating(totalHeroCount, survivingCount)

      // ★ 引擎已將 heroMap 修改為戰鬥結束狀態（currentHP 可能為 0），
      //   必須重置為初始值，否則 Phase B 播放期間讀到最終 HP
      //   → 攻擊者後退檢查 currentHP===0 以為被反彈致死 → 第一回合即播死亡動畫
      //   改用 applyHpFromAction 在每筆 action 時漸進更新（與回放模式相同）
      for (const bh of [...playerBH, ...enemyBH]) {
        bh.currentHP = bh.maxHP
        bh.energy = 0
      }
      needsHpSync = true

      // ── 提取 daily 副本難度 ──
      const dungeonTier = stageMode === 'daily' ? (stageId.split('_').pop() || 'normal') : undefined

      // ── 背景呼叫 complete-battle：反作弊校驗 + 伺服器端獎勵計算 ──
      // 動畫播放期間在背景執行，不阻塞 UI
      completeBattleRef.current = completeBattle({
        stageMode, stageId,
        starsEarned: localStars,
        battleSeed,
        localWinner: winner,
        players: snapshotPlayers,
        enemies: snapshotEnemies,
        maxTurns: 50,
        dungeonTier,
      })

      // ── 保留舊版反作弊校驗（向下相容，非必要時可移除） ──
      antiCheatRef.current = startBattleVerification(
        snapshotPlayers, snapshotEnemies, battleSeed, winner, 50,
      )

      // ★ 注意：不可在此設 battleActionsRef.current = allActions
      // 因為 onAction 的 for-of 迭代 allActions，如果兩者共用同一參考，
      // 任何 push 都會讓陣列在迭代中增長 → 無限迴圈
    }

    // ── Phase B：播放動畫（可中途跳過） ──
    setBattleCalculating(false)
    /** 從 actions 更新 heroMap 的 HP（回放模式用，正常模式引擎已內部更新） */
    const applyHpFromAction = (act: BattleAction) => {
      if (act.type === 'NORMAL_ATTACK') {
        const tgt = heroMap.get(act.targetUid)
        if (tgt && !act.result.isDodge) tgt.currentHP = Math.max(0, tgt.currentHP - act.result.damage)
        if (act.result.reflectDamage > 0) {
          const atk = heroMap.get(act.attackerUid)
          if (atk) atk.currentHP = Math.max(0, atk.currentHP - act.result.reflectDamage)
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
      // 跳過偵測：一旦 skipBattleRef 為 true，停止播放任何後續動畫/音效
      if (skipBattleRef.current) {
        // 即使跳過，仍需更新 heroMap HP（遠端/回放模式下 heroMap 未被引擎修改）
        if (needsHpSync) applyHpFromAction(act)
        continue
      }
      // 遠端戰鬥 & 回放：在播放動畫前先同步 HP，確保死亡/存活判斷正確
      if (needsHpSync) applyHpFromAction(act)
      // dev 模式：驗證 action 前後狀態
      if (import.meta.env.DEV && flowValidatorRef.current) flowValidatorRef.current.beforeAction(act)
      await onAction(act)
      if (import.meta.env.DEV && flowValidatorRef.current) flowValidatorRef.current.afterAction(act)
    }

    // 等待背景動畫（後退 + 死亡），但設速度感知上限，避免最後一擊全滅後長等
    const allPending: Promise<void>[] = [...backgroundAnims]
    if (pendingRetreats.size > 0) {
      allPending.push(...pendingRetreats.values())
      pendingRetreats.clear()
    }
    if (allPending.length > 0) {
      await Promise.race([
        Promise.all(allPending),
        delay(1200),            // 最多等 1.2s（1×）/ 0.6s（2×）/ 0.3s（4×）/ 0.15s（8×）
      ])
    }

    // ★ Promise.race 可能在後退動畫完成前就結束（timeout 勝出），
    //   強制將仍在 ATTACKING/RETREATING 的存活角色歸位為 IDLE
    for (const [uid, st] of Object.entries(actorStatesRef.current)) {
      if (st === 'ATTACKING' || st === 'RETREATING') {
        setActorState(uid, 'IDLE')
      }
    }
    // ★ 清除所有殘留的動畫/移動 Promise — 避免 5s timeout 假警報
    for (const key of Object.keys(actionResolveRefs.current)) {
      actionResolveRefs.current[key]?.resolve()
      delete actionResolveRefs.current[key]
    }
    for (const key of Object.keys(moveResolveRefs.current)) {
      moveResolveRefs.current[key]?.()
      delete moveResolveRefs.current[key]
    }

    // dev 模式：戰鬥結束驗證 + 問題報告
    if (import.meta.env.DEV && flowValidatorRef.current) {
      flowValidatorRef.current.validateEnd()
      flowValidatorRef.current.report()
      flowValidatorRef.current = null
    }

    // 播放結束後保存完整 actions（供回放 + 統計使用）
    if (!isReplay) battleActionsRef.current = allActions

    // ── Phase C：應用最終狀態到 slot（確保 UI 正確顯示勝/敗） ──
    for (const [, bh] of heroMap) {
      if (bh.currentHP <= 0) {
        // ★ 清除待處理的動作回呼 — Phase C 可能在 allPending race 後提前移除 slot，
        //   元件卸載導致動畫回呼遺失，waitForAction 會超時。主動 resolve 避免 5s 假警報。
        const pending = actionResolveRefs.current[bh.uid]
        if (pending) {
          pending.resolve()
          delete actionResolveRefs.current[bh.uid]
        }
        // 確保死亡角色從 slot 中移除
        const updater = bh.side === 'player' ? updatePlayerSlots : updateEnemySlots
        updater((prev) => {
          const ns = [...prev]
          if (ns[bh.slot]?._uid === bh.uid) ns[bh.slot] = null
          return ns
        })
      } else {
        // 同步存活角色的 HP
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
        // DOT 傷害歸屬施放者
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

    // ── 伺服器端結算：complete-battle 完全背景執行，不阻塞 UI ──
    // 獎勵已由 GAS 寫入 Sheet，不需要等回傳
    // 反作弊：若伺服器判定不一致，背景靜默記錄（下次 load-save 會讀到正確值）
    if (!isReplay && completeBattleRef.current) {
      const bgPromise = completeBattleRef.current
      completeBattleRef.current = null
      // fire-and-forget：背景處理伺服器結果
      bgPromise.then(cbResult => {
        if (cbResult?.success && !cbResult.verified) {
          console.error(
            `[AntiCheat] 伺服器判定不一致：本地=${winner} → 伺服器=${cbResult.serverWinner}`
          )
          // 伺服器已寫入正確獎勵到 Sheet，下次 load-save 自然修正
        }
      }).catch(() => { /* 網路錯誤，靜默處理 */ })
    }
    // 清除舊版反作弊（已整合至 complete-battle）
    if (antiCheatRef.current) {
      antiCheatRef.current.abort()
      antiCheatRef.current = null
    }

    // ── 結算 ──
    if (winner === 'player') {
      setBattleResult('victory')

      if (!isReplay) {
        // ── 獎勵計算：伺服器已經透過 complete-battle 計算並寫入，
        //    這裡做本地計算同步 localStorage 快取 + UI 即時顯示 ──
        let rewardGold = 0, rewardExp = 0, rewardDiamond = 0
        let first = false
        let stars: 1 | 2 | 3 = 1
        let resourceSpeed: { goldPerHour: number; expItemsPerHour: number } | null = null
        let leveledUp = false
        let newLevel = saveHook.playerData?.save.level ?? 1

        // ── 本地計算獎勵（與伺服器公式一致，用於即時 UI） ──
        let rewards: StageReward = { exp: 0, gold: 0, diamond: 0 }

        if (stageMode === 'story') {
          const cfg = getStoryStageConfig(stageId)
          const progress = saveHook.playerData?.save.storyProgress ?? { chapter: 1, stage: 1 }
          first = isFirstClear(stageId, progress)
          rewards = first ? cfg.firstClearRewards : cfg.rewards
          const timerStage = first ? stageId : (saveHook.playerData?.save.resourceTimerStage || stageId)
          resourceSpeed = getTimerYield(timerStage)
        } else if (stageMode === 'tower') {
          const floor = Number(stageId) || 1
          const cfg = getTowerFloorConfig(floor)
          rewards = cfg.rewards
        } else if (stageMode === 'pvp') {
          const progress = saveHook.playerData?.save.storyProgress ?? { chapter: 1, stage: 1 }
          const linearProgress = (progress.chapter - 1) * 8 + progress.stage
          rewards = getPvPReward(linearProgress)
        } else if (stageMode === 'boss') {
          const totalDamage = Object.values(stats)
            .filter((_, i) => i < playerSlots.filter(Boolean).length)
            .reduce((sum, s) => sum + s.damageDealt, 0)
          rewards = getBossReward(stageId, totalDamage)
        } else {
          const cfg = getDailyDungeonConfig(stageId)
          rewards = cfg ? cfg.difficulty.rewards : { exp: 0, gold: 0 }
        }

        rewardGold = rewards.gold
        rewardExp = rewards.exp
        rewardDiamond = rewards.diamond ?? 0

        // 計算星級（本地值，用於 UI 顯示）
        const totalHeroes = playerSlots.filter(Boolean).length
        const survivingHeroes = playerSlots.filter(s => s && (s.currentHP ?? 0) > 0).length
        stars = calculateStarRating(totalHeroes, survivingHeroes) as 1 | 2 | 3

        // 抽取掉落物（隨機掉落目前仍由前端計算）
        const drops = mergeDrops(rollDrops(rewards))

        // ── 本地帶出經驗升等（用於 UI 即時顯示） ──
        const currentExp = saveHook.playerData?.save.exp ?? 0
        let newExp = currentExp + rewardExp
        newLevel = saveHook.playerData?.save.level ?? 1
        while (newExp >= expToNextLevel(newLevel)) {
          newExp -= expToNextLevel(newLevel)
          newLevel++
          leveledUp = true
        }

        // ── 本地狀態同步（localStorage 快取，伺服器已透過 complete-battle 寫入正確值） ──
        // save-progress 已封鎖 gold/diamond/exp/level，這裡只做 localStorage 快取更新
        const progressChanges: Record<string, number> = {
          gold: (saveHook.playerData?.save.gold ?? 0) + rewardGold,
          diamond: (saveHook.playerData?.save.diamond ?? 0) + rewardDiamond,
          exp: newExp,
        }
        if (leveledUp) progressChanges.level = newLevel
        saveHook.doUpdateProgress(progressChanges)

        // 推進劇情進度（本地快取，伺服器已在 complete-battle 中寫入）
        if (stageMode === 'story' && first) {
          const nextId = getNextStageId(stageId)
          if (nextId) {
            const np = nextId.split('-').map(Number)
            saveHook.doUpdateStory(np[0] || 1, np[1] || 1)
          } else {
            saveHook.doUpdateStory(4, 1)
          }
          saveHook.doUpdateProgress({ resourceTimerStage: stageId })
        }

        // 儲存關卡星級（本地快取）
        if (stageMode === 'story') {
          saveHook.doUpdateStageStars(stageId, stars)
        }

        // 掉落物即時寫入本地背包
        if (drops.length > 0) addItemsLocally(drops)

        setVictoryRewards({
          exp: rewardExp,
          gold: rewardGold,
          diamond: rewardDiamond,
          drops,
          stars,
          isFirst: first,
          resourceSpeed,
        })
        if (leveledUp) showToast(`🎉 帳號升級！Lv.${newLevel}`)
      }
    } else if (winner === 'enemy') {
      setBattleResult('defeat')
      if (!isReplay) setVictoryRewards(null)
    } else {
      setBattleResult('defeat')
      if (!isReplay) setVictoryRewards(null)
    }
    isReplayingRef.current = false
    setGameState('GAMEOVER')
  }

  const startAutoBattle = () => {
    if (gameState !== 'IDLE') return
    if (!playerSlots.some(Boolean)) { showToast('請先選擇上陣英雄'); return }
    runBattleLoop()
  }

  /* ══════════════════════════════
     拖曳邏輯
     ══════════════════════════════ */

  const responsive = useResponsive()
  const canAdjustFormation = gameState === 'IDLE' && turn === 0
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const dragSourceRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragPosRef = useRef(new THREE.Vector3())
  const dragOffsetRef = useRef(new THREE.Vector3())
  const dragPointerIdRef = useRef<number | null>(null)

  const clearDrag = () => {
    dragSourceRef.current = null
    setSelectedSlot(null)
    setDragging(false)
  }

  const findNearestPlayerSlot = (point: THREE.Vector3) => {
    let best = -1, bestD = Infinity
    PLAYER_SLOT_POSITIONS.forEach((p, i) => {
      const d = Math.hypot(p[0] - point.x, p[2] - point.z)
      if (d < bestD) { bestD = d; best = i }
    })
    return { idx: best, dist: bestD }
  }

  const endDragAt = useCallback((point: THREE.Vector3 | null) => {
    if (!canAdjustFormation) { clearDrag(); return }
    const s = dragSourceRef.current
    if (s == null) { clearDrag(); return }
    const dropPoint = point || dragPosRef.current
    const { idx, dist } = findNearestPlayerSlot(dropPoint)
    if (idx !== -1 && dist <= 1.5) {
      updatePlayerSlots((prev) => {
        const ns = [...prev]
        const tmp = ns[s]
        ns[s] = ns[idx]
        ns[idx] = tmp
        return ns
      })
    }
    clearDrag()
   
  }, [canAdjustFormation, updatePlayerSlots])

  const startDrag = (i: number, pointerOrPoint: unknown) => {
    if (!canAdjustFormation) return
    dragSourceRef.current = i
    setDragging(true)
    const basePos = new THREE.Vector3(...PLAYER_SLOT_POSITIONS[i])
    let ip = basePos
    if (pointerOrPoint && typeof pointerOrPoint === 'object') {
      const evt = pointerOrPoint as { point?: THREE.Vector3; pointerId?: number }
      if (evt.point) ip = evt.point
      if (evt.pointerId != null) dragPointerIdRef.current = evt.pointerId
    }
    const projected = ip.clone()
    projected.y = 0
    dragPosRef.current.copy(projected)
    dragOffsetRef.current.copy(new THREE.Vector3().subVectors(basePos, dragPosRef.current))
  }

  /* ── 英雄縮圖點擊 ── */
  const handleThumbnailClick = (h: RawHeroData) => {
    if (!canAdjustFormation) return
    const heroKey = String(h.HeroID ?? h.id ?? h.ModelID ?? h.Name ?? h._modelId ?? '').trim()
    const existsIdx = playerSlots.findIndex((s) => {
      if (!s) return false
      const k = String(s.HeroID ?? s.id ?? s.ModelID ?? s.Name ?? s._modelId ?? '').trim()
      return k && heroKey && k === heroKey
    })
    if (existsIdx !== -1) {
      updatePlayerSlots((prev) => { const ns = [...prev]; ns[existsIdx] = null; return ns })
      showToast(`${h.Name || '英雄'} 已下陣`)
      return
    }
    const priorityOrder = [0, 1, 2, 3, 4, 5]
    let targetIndex = selectedSlot ?? -1
    if (targetIndex < 0) {
      for (const pi of priorityOrder) {
        if (!playerSlots[pi]) { targetIndex = pi; break }
      }
    }
    if (targetIndex < 0) { showToast('上陣欄位已滿，請先下陣一位英雄'); return }
    const idx = heroesList.indexOf(h)
    const mid = normalizeModelId(h, idx >= 0 ? idx : 0)
    updatePlayerSlots((prev) => {
      const ns = [...prev]
      ns[targetIndex] = {
        ...h,
        currentHP: (h.HP ?? 1) as number,
        _uid: `${mid}_player_${targetIndex}`,
        _modelId: mid,
        ModelID: mid,
      }
      return ns
    })
    showToast(`${h.Name || '英雄'} 已上陣`)
    setSelectedSlot(null)
  }

  const selectedKeys = playerSlots
    .filter(Boolean)
    .map((h) => String((h as SlotHero).HeroID ?? (h as SlotHero).id ?? (h as SlotHero).ModelID ?? (h as SlotHero).Name ?? (h as SlotHero)._modelId ?? '').trim())
    .filter(Boolean)

  /* ── 主選單導航 ── */
  const handleMenuNavigate = (screen: MenuScreen) => { setMenuScreen(screen) }
  const handleBackToMenu = () => { setMenuScreen('none') }
  const handleStageSelect = async (mode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss', sid: string) => {
    const displayName = mode === 'tower' ? `第 ${sid} 層`
      : mode === 'daily' ? getDailyDungeonDisplayName(sid)
      : mode === 'pvp' ? '競技場對戰'
      : mode === 'boss' ? `Boss 挑戰`
      : `關卡 ${sid}`

    // 場景主題不同時才拉過場幕（避免模式切換時看到閃爍）
    const needsCurtain = mode !== stageMode
    if (needsCurtain) {
      setCurtainVisible(true)
      setCurtainFading(false)
      setCurtainText(`準備${mode === 'tower' ? '挑戰' : ''}${displayName}...`)
      curtainClosePromiseRef.current = null
      await waitFrames(2)
    }

    setStageMode(mode)
    setStageId(sid)
    updateEnemySlots(() => buildEnemySlotsFromStage(mode, sid, heroesList))
    restoreFormationFromSave()
    setMenuScreen('none')
    setGameState('IDLE')

    if (needsCurtain) closeCurtain()
    showToast(`已選擇: ${displayName}`)
  }

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
        gl={{ powerPreference: 'default', antialias: true }}
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
          onCollectResources={async () => {
            const result = await saveHook.doCollectResources()
            if (result && (result.gold > 0 || result.expItems > 0)) {
              showToast(`領取成功：金幣 +${result.gold.toLocaleString()} / 經驗道具 +${result.expItems}`)
            } else {
              showToast('目前沒有可領取的資源')
            }
          }}
        />
      )}

      {/* ── 主選單子畫面 ── */}
      {gameState === 'MAIN_MENU' && menuScreen === 'heroes' && (
        <HeroListPanel
          heroesList={heroesList}
          heroInstances={saveHook.playerData?.heroes ?? []}
          onBack={handleBackToMenu}
          skills={skillsRef.current}
          heroSkills={heroSkillsRef.current}
        />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'inventory' && (
        <InventoryPanel onBack={handleBackToMenu} heroesList={heroesList} />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'gacha' && (
        <GachaScreen
          diamond={saveHook.playerData?.save.diamond ?? 0}
          heroesList={heroesList}
          onBack={handleBackToMenu}
          onDiamondChange={(delta) => {
            saveHook.doUpdateProgress({ diamond: (saveHook.playerData?.save.diamond ?? 0) + delta })
          }}
          onPullSuccess={(newHeroIds) => {
            // 樂觀插入新英雄到本地存檔，英雄列表即時更新
            addHeroesLocally(newHeroIds)
          }}
          initialPity={saveHook.playerData?.save.gachaPity?.pullsSinceLastSSR ?? 0}
        />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'stages' && (
        <StageSelect
          storyProgress={saveHook.playerData?.save.storyProgress ?? { chapter: 1, stage: 1 }}
          towerFloor={saveHook.playerData?.save.towerFloor ?? 1}
          stageStars={saveHook.playerData?.save.stageStars ?? {}}
          onBack={handleBackToMenu}
          onSelectStage={handleStageSelect}
        />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'settings' && (
        <SettingsPanel
          onBack={handleBackToMenu}
          onLogout={handleFullLogout}
          displayName={authHook.auth.displayName || '倖存者'}
          isBound={authHook.auth.isBound}
          onRefreshMail={refreshMailData}
          pwaRewardClaimed={
            saveHook.playerData?.save.pwaRewardClaimed === true ||
            saveHook.playerData?.save.pwaRewardClaimed === 'true' as unknown as boolean
          }
        />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'mailbox' && (
        <MailboxPanel
          onBack={handleBackToMenu}
          onRewardsClaimed={(rewards) => {
            // 樂觀更新前端資源（鑽石/金幣）
            let diamondDelta = 0
            let goldDelta = 0
            const inventoryItems: { itemId: string; quantity: number }[] = []
            for (const r of rewards) {
              if (r.itemId === 'diamond') diamondDelta += r.quantity
              else if (r.itemId === 'gold') goldDelta += r.quantity
              else inventoryItems.push({ itemId: r.itemId, quantity: r.quantity })
            }
            const changes: Record<string, number> = {}
            if (diamondDelta > 0) changes.diamond = (saveHook.playerData?.save.diamond ?? 0) + diamondDelta
            if (goldDelta > 0) changes.gold = (saveHook.playerData?.save.gold ?? 0) + goldDelta
            if (Object.keys(changes).length > 0) saveHook.doUpdateProgress(changes)
            // 非貨幣獎勵即時寫入本地背包
            if (inventoryItems.length > 0) addItemsLocally(inventoryItems)
          }}
          mailItems={mailItems}
          mailLoaded={mailLoaded}
          onMailItemsChange={setMailItems}
          onRefreshMail={refreshMailData}
        />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'shop' && (
        <ShopPanel onBack={handleBackToMenu} />
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
        {turn > 0 && gameState !== 'GAMEOVER' && <div className="hud-round">ROUND {turn}</div>}

      </div>

      {/* ── 浮動提示 ── */}
      {toastElements}

      {/* ── 勝負標語 + 獎勵面板 ── */}
      {gameState === 'GAMEOVER' && battleResult && (
        <div className={`battle-result-banner ${battleResult}`}>
          <span className="banner-text">{battleResult === 'victory' ? 'VICTORY' : 'DEFEAT'}</span>
          <span className="banner-sub">{battleResult === 'victory' ? '你生存了下來' : '你淪為了它們的一員'}</span>

          {/* 勝利獎勵面板 */}
          {battleResult === 'victory' && victoryRewards && (
            <div className="victory-rewards-panel">
              {/* 星級（僅主線關卡） */}
              {stageMode === 'story' && (
                <div className="reward-stars">
                  {[1, 2, 3].map(i => (
                    <span key={i} className={`reward-star ${i <= victoryRewards.stars ? 'active' : ''}`}>★</span>
                  ))}
                </div>
              )}
              {stageMode === 'tower' && (
                <div className="reward-floor-clear">🗼 第 {stageId} 層通關！</div>
              )}
              {stageMode === 'pvp' && (
                <div className="reward-floor-clear">⚔️ 競技場勝利！</div>
              )}
              {stageMode === 'boss' && (
                <div className="reward-floor-clear">👹 Boss 討伐完成！</div>
              )}
              {victoryRewards.isFirst && <div className="reward-first-clear">🏆 首次通關獎勵</div>}

              {/* 獎勵明細 */}
              <div className="reward-items-list">
                <div className="reward-item">
                  <span className="reward-icon gold"><CurrencyIcon type="gold" /></span>
                  <span className="reward-label">金幣</span>
                  <span className="reward-value">+{victoryRewards.gold.toLocaleString()}</span>
                </div>
                {victoryRewards.diamond > 0 && (
                  <div className="reward-item">
                    <span className="reward-icon diamond"><CurrencyIcon type="diamond" /></span>
                    <span className="reward-label">鑽石</span>
                    <span className="reward-value">+{victoryRewards.diamond}</span>
                  </div>
                )}
                <div className="reward-item">
                  <span className="reward-icon exp"><CurrencyIcon type="exp" /></span>
                  <span className="reward-label">經驗</span>
                  <span className="reward-value">+{victoryRewards.exp}</span>
                </div>
                {victoryRewards.drops.map((d, i) => (
                  <div className="reward-item" key={i}>
                    <span className="reward-icon drop"><ItemIcon itemId={d.itemId} /></span>
                    <span className="reward-label">{getItemName(d.itemId)}</span>
                    <span className="reward-value">×{d.quantity}</span>
                  </div>
                ))}
              </div>

              {/* 資源產出速度（僅主線關卡） */}
              {victoryRewards.resourceSpeed && (
                <div className="reward-resource-speed">
                  <span className="resource-speed-title">📈 離線資源產出</span>
                  <span className="resource-speed-detail">
                    金幣 {victoryRewards.resourceSpeed.goldPerHour}/時
                    &nbsp;·&nbsp;
                    經驗道具 {victoryRewards.resourceSpeed.expItemsPerHour}/時
                  </span>
                  <span className="resource-speed-hint">通關越多關卡，產出速度越快！</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── GAMEOVER 按鈕 ── */}
      {gameState === 'GAMEOVER' && (
        <div className="btn-bottom-center">
          {battleResult === 'victory' && stageMode !== 'daily' && stageMode !== 'pvp' && stageMode !== 'boss' && (
            <button onClick={goNextStage} className="btn-next-stage">
              {stageMode === 'tower' ? '下一層 ▶' : '下一關 ▶'}
            </button>
          )}
          {battleResult !== 'victory' && (
            <button onClick={retryBattle} className="btn-reset">重試</button>
          )}
          <button onClick={replayBattle} className="btn-replay">回放 ⏪</button>
          <button onClick={() => setShowBattleStats(true)} className="btn-stats">戰鬥資訊 📊</button>
          <button onClick={backToLobby} className="btn-back-lobby">回大廳</button>
        </div>
      )}

      {/* ── 戰鬥統計面板 ── */}
      {showBattleStats && (() => {
        const allEntries = Object.entries(battleStats)
        const maxDmg = Math.max(1, ...allEntries.map(([, s]) => s.damageDealt))
        const maxHeal = Math.max(1, ...allEntries.map(([, s]) => s.healingDone))
        const maxTaken = Math.max(1, ...allEntries.map(([, s]) => s.damageTaken))
        const renderRow = (uid: string, s: typeof battleStats[string], isEnemy: boolean) => (
          <div key={uid} className={`battle-stats-row ${isEnemy ? 'enemy' : ''}`}>
            <div className="bs-hero-name">{s.name}</div>
            <div className="bs-bar-group">
              <div className="bs-bar-row">
                <span className="bs-bar-label damage">輸出</span>
                <div className="bs-bar-track">
                  <div className="bs-bar-fill damage" style={{ width: `${(s.damageDealt / maxDmg) * 100}%` }} />
                </div>
                <span className="bs-bar-value damage">{s.damageDealt.toLocaleString()}</span>
              </div>
              {(maxHeal > 1) && (
                <div className="bs-bar-row">
                  <span className="bs-bar-label heal">治療</span>
                  <div className="bs-bar-track">
                    <div className="bs-bar-fill heal" style={{ width: `${(s.healingDone / maxHeal) * 100}%` }} />
                  </div>
                  <span className="bs-bar-value heal">{s.healingDone.toLocaleString()}</span>
                </div>
              )}
              <div className="bs-bar-row">
                <span className="bs-bar-label taken">承傷</span>
                <div className="bs-bar-track">
                  <div className="bs-bar-fill taken" style={{ width: `${(s.damageTaken / maxTaken) * 100}%` }} />
                </div>
                <span className="bs-bar-value taken">{s.damageTaken.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )
        return (
          <div className="battle-stats-overlay" onClick={() => setShowBattleStats(false)}>
            <div className="battle-stats-panel" onClick={e => e.stopPropagation()}>
              <div className="battle-stats-header">
                <span>⚔️ 戰鬥統計</span>
                <button className="battle-stats-close" onClick={() => setShowBattleStats(false)}>✕</button>
              </div>
              <div className="battle-stats-section">
                <div className="battle-stats-section-title">🟢 我方</div>
                {allEntries.filter(([, s]) => s.side === 'player').sort(([, a], [, b]) => b.damageDealt - a.damageDealt)
                  .map(([uid, s]) => renderRow(uid, s, false))}
              </div>
              <div className="battle-stats-section">
                <div className="battle-stats-section-title">🔴 敵方</div>
                {allEntries.filter(([, s]) => s.side === 'enemy').sort(([, a], [, b]) => b.damageDealt - a.damageDealt)
                  .map(([uid, s]) => renderRow(uid, s, true))}
              </div>
            </div>
          </div>
        )
      })()}
      {gameState === 'BATTLE' && battleCalculating && (
        <div className="battle-calculating-overlay">
          <div className="battle-calculating-spinner" />
          <span>戰鬥計算中…</span>
        </div>
      )}
      {gameState === 'BATTLE' && (
        <div className="btn-speed-wrap">
          <button
            onClick={() => setSpeed((s) => { const o = [1, 2, 4, 8]; const nv = o[(o.indexOf(s) + 1) % o.length]; localStorage.setItem('battleSpeed', String(nv)); return nv })}
            className="btn-speed"
          >
            x{speed}
          </button>
          <button
            className="btn-skip-battle"
            onClick={() => {
              skipBattleRef.current = true
              // 立即 resolve 所有等待中的動畫/移動 Promise（讓當前 onAction 結束）
              for (const key of Object.keys(actionResolveRefs.current)) {
                actionResolveRefs.current[key]?.resolve()
                delete actionResolveRefs.current[key]
              }
              for (const key of Object.keys(moveResolveRefs.current)) {
                moveResolveRefs.current[key]?.()
                delete moveResolveRefs.current[key]
              }
              // 停止所有音效
              audioManager.stopAllSfx()
            }}
          >
            跳過 ⏭
          </button>
        </div>
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
