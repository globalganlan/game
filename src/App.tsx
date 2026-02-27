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
import { preloadMail, invalidateMailCache, loadMail } from './services/mailService'
import type { MailItem } from './services/mailService'
/* ── Phase 7: Battle HUD ── */
import { BattleHUD } from './components/BattleHUD'
import type { BattleBuffMap, BattleEnergyMap, SkillToast, ElementHint } from './components/BattleHUD'

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
import { runBattle, createBattleHero } from './domain'
import { loadAllGameData, getHeroSkillSet, toElement } from './services'
import type { RawHeroInput, HeroInstanceData } from './domain'
import {
  getStoryStageConfig,
  getTowerFloorConfig,
  getNextStageId,
  isFirstClear,
  calculateStarRating,
  rollDrops,
  mergeDrops,
} from './domain/stageSystem'
import type { StageReward } from './domain/stageSystem'
import { getTimerYield, addHeroesLocally } from './services/saveService'

/* ────────────────────────────
   常數
   ──────────────────────────── */

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
  mode: 'story' | 'tower' | 'daily',
  stageId: string,
  heroesList: RawHeroData[],
): (SlotHero | null)[] {
  let enemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number }[]

  if (mode === 'tower') {
    const floor = Number(stageId) || 1
    enemies = getTowerFloorConfig(floor).enemies
  } else {
    // story + daily 都用 getStoryStageConfig（daily 未來可擴充）
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
  /** 目前選定的關卡模式（影響場景外觀） */
  const [stageMode, setStageMode] = useState<'story' | 'tower' | 'daily'>('story')
  const [stageId, setStageId] = useState<string>('1-1')
  const ownedHeroesList = useMemo(() => {
    const ownedIds = new Set(
      (saveHook.playerData?.heroes ?? []).map(h => Number(h.heroId)),
    )
    return heroesList.filter(h => ownedIds.has(Number(h.HeroID ?? 0)))
  }, [heroesList, saveHook.playerData?.heroes])
  const { showToast, toastElements } = useToast()
  const [turn, setTurn] = useState(0)
  const turnRef = useRef(0)
  const [log, setLog] = useState('選擇你的英雄，準備戰鬥！')
  const [damagePopups, setDamagePopups] = useState<DamagePopupData[]>([])
  /** 受擊閃光訊號：uid → 遞增整數，每次受擊 +1 */
  const [hitFlashSignals, setHitFlashSignals] = useState<Record<string, number>>({})
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)

  /* ── Phase 7: Battle HUD 狀態 ── */
  const [battleBuffs, setBattleBuffs] = useState<BattleBuffMap>({})
  const [battleEnergy, setBattleEnergy] = useState<BattleEnergyMap>({})
  const [skillToasts, setSkillToasts] = useState<SkillToast[]>([])
  const [elementHints, setElementHints] = useState<ElementHint[]>([])
  const skillToastIdRef = useRef(0)
  const elementHintIdRef = useRef(0)
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

  /* ── 預載追蹤 ── */
  const preloadedGlbUrls = useRef(new Set<string>())
  const preloadedThumbUrls = useRef(new Set<string>())
  const [preloadProgress, setPreloadProgress] = useState<number | null>(null)
  const didInitFetch = useRef(false)

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

  /* ── 槽位 ── */
  const [playerSlots, setPlayerSlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const [enemySlots, setEnemySlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const pSlotsRef = useRef(EMPTY_SLOTS)
  const eSlotsRef = useRef(EMPTY_SLOTS)
  /** 戰鬥前玩家陣容快照（用於重試時恢復） */
  const preBattlePlayerSlotsRef = useRef<(SlotHero | null)[]>(EMPTY_SLOTS)

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

  /* ── 角色狀態 ── */
  const [actorStates, setActorStates] = useState<Record<string, ActorState>>({})
  const actorStatesRef = useRef<Record<string, ActorState>>({})
  /** 前進目標位置（世界座標），uid → [x, y, z] */
  const moveTargetsRef = useRef<Record<string, Vector3Tuple>>({})
  const setActorState = (id: string, s: ActorState) => {
    actorStatesRef.current = { ...actorStatesRef.current, [id]: s }
    setActorStates(actorStatesRef.current)
  }

  /* ── 過場幕 ── */
  const [curtainVisible, setCurtainVisible] = useState(true)
  const [curtainFading, setCurtainFading] = useState(false)
  const [curtainText, setCurtainText] = useState('載入資源中...')
  const initialReady = useRef(false)
  const curtainClosePromiseRef = useRef<Promise<boolean> | null>(null)

  const closeCurtain = useCallback((delayMs = 500) => {
    if (curtainClosePromiseRef.current) return curtainClosePromiseRef.current
    initialReady.current = true
    curtainClosePromiseRef.current = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        setCurtainFading(true)
        setTimeout(() => {
          setCurtainVisible(false)
          resolve(true)
        }, 1000)
      }, delayMs)
    })
    return curtainClosePromiseRef.current
  }, [])

  /* ── 動作完成 / 移動完成 Promise（含安全逾時） ── */
  const actionResolveRefs = useRef<Record<string, ActionResolveEntry>>({})
  const waitForAction = useCallback((uid: string, expectedState: AnimationState | null = null) => {
    return new Promise<void>((resolve) => {
      actionResolveRefs.current[uid] = { resolve, expectedState }
      // 安全逾時：防止動畫回呼遺失導致永久卡住
      setTimeout(() => {
        const entry = actionResolveRefs.current[uid]
        if (entry && entry.resolve === resolve) {
          console.warn(`[Battle] waitForAction timeout: uid=${uid}, expected=${expectedState}`)
          entry.resolve()
          delete actionResolveRefs.current[uid]
        }
      }, 5000)
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
    return new Promise<void>((resolve) => {
      moveResolveRefs.current[uid] = resolve
      // 安全逾時：防止移動回呼遺失導致永久卡住
      setTimeout(() => {
        const r = moveResolveRefs.current[uid]
        if (r && r === resolve) {
          console.warn(`[Battle] waitForMove timeout: uid=${uid}`)
          r()
          delete moveResolveRefs.current[uid]
        }
      }, 5000)
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
    const stageWeight = { fetch: 0.15, formation: 0.05, models: 0.55, thumbs: 0.15, finalize: 0.1 }
    const stageProgress = { fetch: 0, formation: 0, models: 0, thumbs: 0, finalize: 0 }
    let lastReported = 0
    const refresh = () => {
      const total =
        stageProgress.fetch * stageWeight.fetch +
        stageProgress.formation * stageWeight.formation +
        stageProgress.models * stageWeight.models +
        stageProgress.thumbs * stageWeight.thumbs +
        stageProgress.finalize * stageWeight.finalize
      const clamped = clamp01(total)
      // 進度只能遞增，防止並行回調導致回退
      if (clamped > lastReported) {
        lastReported = clamped
        setPreloadProgress(clamped)
      }
    }

    try {
      setGameState('FETCHING')
      setCurtainText('載入資源中...')
      setPreloadProgress(0)

      // 並行載入：英雄列表（顯示用）+ 全部遊戲資料（戰鬥用）
      const [heroRes, gameData] = await Promise.all([
        fetch(API_URL).then(r => r.json()),
        loadAllGameData((r) => { stageProgress.fetch = r * 0.5; refresh() }),
      ])
      stageProgress.fetch = 1; refresh()

      // GET 端點回傳 { value: [...], Count: N }，需取 .value
      const rawList = Array.isArray(heroRes) ? heroRes : (heroRes?.value ?? [])
      const data: RawHeroData[] = Array.isArray(rawList) ? rawList : []
      setHeroesList(data)
      // 儲存 domain 層資料
      skillsRef.current = gameData.skills
      heroSkillsRef.current = gameData.heroSkills
      heroInputsRef.current = gameData.heroes
      if (!data.length) return

      // 根據當前關卡設定生成固定敵方陣型
      updateEnemySlots(() => buildEnemySlotsFromStage('story', '1-1', data))
      stageProgress.formation = 1; refresh()

      // 預載所有模型動畫 & 縮圖
      const preloadIds = Array.from(new Set(data.map((h, i) => normalizeModelId(h, i))))
      setCurtainText('載入資源中...')
      await preloadModelAnimations(preloadIds, (r) => { stageProgress.models = clamp01(r); refresh() })
      await preloadThumbnails(preloadIds, (r) => { stageProgress.thumbs = clamp01(r); refresh() })

      stageProgress.finalize = 0.4; refresh()
      setCurtainText('初始化戰場...')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      stageProgress.finalize = 1; refresh()

      setGameState('MAIN_MENU')
      setLog('歡迎回到末日世界')
      await closeCurtain(350)
    } catch (err) {
      console.error('[fetchData]', err)
      setLog(`通訊設施已毀壞: ${err}`)
      setPreloadProgress(null)
      await closeCurtain(350)
    }
  }

  // 初始載入（僅一次）
  useEffect(() => {
    if (!showGame) return
    if (didInitFetch.current) return
    didInitFetch.current = true
    // 並行：載入存檔 + 遊戲資料 + 預載信箱
    saveHook.doLoadSave().catch((e) => console.warn('[save] init load failed:', e))
    preloadMail()
      .then(({ mails }) => { setMailItems(mails); setMailLoaded(true) })
      .catch((e) => console.warn('[mail] preload failed:', e))
    fetchData.current?.()
  }, [showGame]) // eslint-disable-line react-hooks/exhaustive-deps

  // 長載入提示
  useEffect(() => {
    const t = setTimeout(() => {
      if (!initialReady.current && gameState === 'FETCHING') setCurtainText('載入資源中...')
    }, 12000)
    return () => clearTimeout(t)
  }, [gameState])

  /* ── 重試（在同一關卡重置到選擇上陣階段） ── */
  const retryBattle = () => {
    // 拉起過場幕 → 等不透明 → 重置狀態 → 收幕
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('重新準備中...')
    curtainClosePromiseRef.current = null

    setTimeout(() => {
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
      setLog('重新編排你的隊伍吧')
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

      setGameState('IDLE')

      // 收幕
      closeCurtain(300)
    }, 500)
  }

  /* ── 回大廳（戰敗後返回主選單） ── */
  const backToLobby = () => {
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('返回大廳...')
    curtainClosePromiseRef.current = null

    setTimeout(() => {
      // 清空戰場
      updatePlayerSlots(() => Array(6).fill(null))
      updateEnemySlots(() => Array(6).fill(null))
      setTurn(0); turnRef.current = 0
      setLog('')
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
      setMenuScreen('none')
      setGameState('MAIN_MENU')

      closeCurtain(300)
    }, 500)
  }

  /* ── 下一關（勝利後推進） ── */
  const goNextStage = () => {
    if (stageMode === 'tower') {
      // 爬塔：樓層 +1
      const nextFloor = (Number(stageId) || 1) + 1
      setCurtainVisible(true)
      setCurtainFading(false)
      setCurtainText('前往下一層...')
      curtainClosePromiseRef.current = null

      setTimeout(() => {
        const restored = preBattlePlayerSlotsRef.current.map(slot => {
          if (!slot) return null
          return { ...slot, currentHP: (slot.HP ?? 1) as number }
        })
        updatePlayerSlots(() => restored)
        setStageId(String(nextFloor))
        updateEnemySlots(() => buildEnemySlotsFromStage('tower', String(nextFloor), heroesList))
        setTurn(0); turnRef.current = 0
        setLog('準備挑戰下一層')
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
        setGameState('IDLE')
        closeCurtain(300)
      }, 500)
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

    setTimeout(() => {
      const restored = preBattlePlayerSlotsRef.current.map(slot => {
        if (!slot) return null
        return { ...slot, currentHP: (slot.HP ?? 1) as number }
      })
      updatePlayerSlots(() => restored)
      setStageId(nextId)
      updateEnemySlots(() => buildEnemySlotsFromStage(stageMode, nextId, heroesList))
      setTurn(0); turnRef.current = 0
      setLog(`前進至關卡 ${nextId}`)
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
      setGameState('IDLE')
      closeCurtain(300)
    }, 500)
  }

  /* ══════════════════════════════
     戰鬥迴圈（Domain Engine 驅動）
     ══════════════════════════════ */

  const runBattleLoop = async () => {
    // 儲存戰前玩家陣容快照（用於重試時恢復）
    preBattlePlayerSlotsRef.current = playerSlots.map(s => s ? { ...s } : null)

    setGameState('BATTLE')
    turnRef.current = 1; setTurn(1)
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / speedRef.current))

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

    // 使用渲染中的 state 快照（與 JSX 中 Hero 的 uid 一致），
    // 避免 ref 因 startTransition / batching 與已渲染 UI 產生 UID 不匹配。
    for (let i = 0; i < 6; i++) {
      const p = playerSlots[i]
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
        stars: 1,          // TODO: track stars in save system
        equipment: [],     // TODO: load equipped EquipmentInstance[]
      } : undefined
      const starLevel = heroInstanceData?.stars ?? 1

      const bh = createBattleHero(input, 'player', i, activeSkill, passives, starLevel, p._uid, heroInstanceData)
      playerBH.push(bh)
      heroMap.set(bh.uid, bh)
    }

    for (let i = 0; i < 6; i++) {
      const e = enemySlots[i]
      if (!e) continue
      const heroId = Number(e.HeroID ?? e.id ?? 0)
      const input = slotToInput(e, heroId)
      const { activeSkill, passives } = getHeroSkillSet(heroId, skills, heroSkillsMap)
      const bh = createBattleHero(input, 'enemy', i, activeSkill, passives, 1, e._uid)
      enemyBH.push(bh)
      heroMap.set(bh.uid, bh)
    }

    battleHeroesRef.current = heroMap

    // Initialize Phase 7 battle HUD state
    setBattleBuffs({})
    setBattleEnergy(
      Object.fromEntries(
        [...playerBH, ...enemyBH].map(h => [h.uid, { current: h.energy, max: 1000 }])
      )
    )
    setSkillToasts([])
    setElementHints([])

    /* ── Helpers ── */
    const syncHpToSlot = (hero: BattleHero) => {
      const updater = hero.side === 'player' ? updatePlayerSlots : updateEnemySlots
      updater((prev) => {
        const ns = [...prev]
        const entry = ns[hero.slot]
        if (entry && entry._uid === hero.uid) ns[hero.slot] = { ...entry, currentHP: Math.max(0, hero.currentHP) }
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
        return
      }
      addDamage(targetUid, dmg)
      const hero = heroMap.get(targetUid)
      if (!hero) return

      if (killed) {
        const deadDone = waitForAction(targetUid, 'DEAD')
        setActorState(targetUid, 'DEAD')
        syncHpToSlot(hero)
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
    const onAction = async (action: BattleAction) => {
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
          setLog(`ROUND ${turnRef.current}：${atk.side === 'player' ? '玩家' : '敵人'} ${atk.name} 發動攻擊`)

          // Phase 7: 屬性相剋指示
          if (action.result.elementMult && action.result.elementMult !== 1.0) {
            const txt = action.result.elementMult > 1.0 ? '屬性剋制！' : '屬性抵抗'
            const clr = action.result.elementMult > 1.0 ? '#e63946' : '#4dabf7'
            setElementHints((prev) => [...prev, { id: ++elementHintIdRef.current, text: txt, color: clr, timestamp: Date.now() }])
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
          await delay(180)

          // 3) 傷害/受傷 or 閃避/死亡
          // ★ 受擊動畫開始前 → 立即更新受擊者能量
          if (action._tgtEnergyNew != null) {
            setBattleEnergy((prev) => {
              if (!prev[action.targetUid]) return prev
              return { ...prev, [action.targetUid]: { current: action._tgtEnergyNew!, max: prev[action.targetUid]?.max ?? 1000 } }
            })
          }
          await playHitOrDeath(action.targetUid, action.result.damage, action.killed, action.result.isDodge)

          // 4) 後退
          await atkDone
          setActorState(action.attackerUid, 'RETREATING')
          await waitForMove(action.attackerUid)
          setActorState(action.attackerUid, 'IDLE')

          await delay(120)
          break
        }

        case 'SKILL_CAST': {
          const atk = heroMap.get(action.attackerUid)!
          setLog(`ROUND ${turnRef.current}：${atk.name} 使用 ${action.skillName}！`)

          // Phase 7: 技能名稱彈幕
          setSkillToasts((prev) => [...prev, {
            id: ++skillToastIdRef.current,
            heroName: atk.name,
            skillName: action.skillName,
            timestamp: Date.now(),
          }])

          // 計算前進目標
          const firstDmgTarget = action.targets.find(t => 'damage' in t.result)
          const isAoe = action.targets.length > 1
          const targetSlot = firstDmgTarget ? (heroMap.get(firstDmgTarget.uid)?.slot ?? 0) : 0

          // 1) 前進
          moveTargetsRef.current = { ...moveTargetsRef.current, [action.attackerUid]: getAdvancePos(atk, targetSlot, isAoe) }
          setActorState(action.attackerUid, 'ADVANCING')
          await waitForMove(action.attackerUid)

          // 2) 攻擊動作
          const atkDone = waitForAction(action.attackerUid, 'ATTACKING')
          setActorState(action.attackerUid, 'ATTACKING')

          // ★ 攻擊動畫開始 → 立即更新攻擊者能量（技能消耗 → 0）
          if (action._atkEnergyNew != null) {
            setBattleEnergy((prev) => {
              if (!prev[action.attackerUid]) return prev
              return { ...prev, [action.attackerUid]: { current: action._atkEnergyNew!, max: prev[action.attackerUid]?.max ?? 1000 } }
            })
          }
          await delay(180)

          // 3) 逐目標播放效果
          for (const t of action.targets) {
            if ('damage' in t.result) {
              const dr = t.result as DamageResult
              // ★ 受擊動畫前 → 更新該目標能量
              if (action._tgtEnergyMap?.[t.uid] != null) {
                setBattleEnergy((prev) => {
                  if (!prev[t.uid]) return prev
                  return { ...prev, [t.uid]: { current: action._tgtEnergyMap![t.uid], max: prev[t.uid]?.max ?? 1000 } }
                })
              }
              await playHitOrDeath(t.uid, dr.damage, t.killed ?? false, dr.isDodge)
            } else {
              // 治療
              const hr = t.result as { heal: number }
              if (hr.heal > 0) {
                addDamage(t.uid, -hr.heal) // 負值 = 治療
                const hero = heroMap.get(t.uid)
                if (hero) syncHpToSlot(hero)
              }
            }
          }

          // 4) 後退
          await atkDone
          setActorState(action.attackerUid, 'RETREATING')
          await waitForMove(action.attackerUid)
          setActorState(action.attackerUid, 'IDLE')

          await delay(120)
          break
        }

        case 'DOT_TICK': {
          if (action.damage > 0) {
            addDamage(action.targetUid, action.damage)
            const hero = heroMap.get(action.targetUid)
            if (hero) syncHpToSlot(hero)
          }
          await delay(200)
          break
        }

        case 'DEATH': {
          // DOT / 反彈等非攻擊致死
          const hero = heroMap.get(action.targetUid)
          if (hero) {
            const deadDone = waitForAction(action.targetUid, 'DEAD')
            setActorState(action.targetUid, 'DEAD')
            syncHpToSlot(hero)
            await deadDone
            removeSlot(hero)
          }
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

        case 'PASSIVE_TRIGGER':
          // 被動觸發目前無特殊 3D 演出
          break

        case 'BATTLE_END':
          break
      }
    }

    // ── 執行戰鬥 ──
    const winner = await runBattle(playerBH, enemyBH, { maxTurns: 50, onAction })

    // ── 結算 ──
    if (winner === 'player') {
      setLog('戰鬥結果：你生存了下來，但代價是什麼？')
      setBattleResult('victory')

      // ── 計算獎勵 ──
      let rewards: StageReward = { exp: 0, gold: 0, diamond: 0 }
      let first = false
      let resourceSpeed: { goldPerHour: number; expItemsPerHour: number } | null = null

      if (stageMode === 'story') {
        const cfg = getStoryStageConfig(stageId)
        const progress = saveHook.playerData?.save.storyProgress ?? { chapter: 1, stage: 1 }
        first = isFirstClear(stageId, progress)
        rewards = first ? cfg.firstClearRewards : cfg.rewards

        // 推進劇情進度到下一關
        if (first) {
          const nextId = getNextStageId(stageId)
          if (nextId) {
            const np = nextId.split('-').map(Number)
            saveHook.doUpdateStory(np[0] || 1, np[1] || 1)
          } else {
            // 最後一關通關，進度設到超越最後關
            saveHook.doUpdateStory(4, 1)
          }
          // 更新資源計時器綁定到最新通關
          saveHook.doUpdateProgress({ resourceTimerStage: stageId })
        }
        // 計算當前關卡的資源產出速度
        const timerStage = first ? stageId : (saveHook.playerData?.save.resourceTimerStage || stageId)
        resourceSpeed = getTimerYield(timerStage)
      } else if (stageMode === 'tower') {
        const floor = Number(stageId) || 1
        const cfg = getTowerFloorConfig(floor)
        rewards = cfg.rewards
        saveHook.doUpdateProgress({ towerFloor: floor + 1 })
      } else {
        // daily — 使用 story stage config 作為 fallback
        const cfg = getStoryStageConfig(stageId)
        rewards = cfg.rewards
      }

      // 抽取掉落物
      const drops = mergeDrops(rollDrops(rewards))

      // 計算星級
      const totalHeroes = playerSlots.filter(Boolean).length
      const survivingHeroes = playerSlots.filter(s => s && (s.currentHP ?? 0) > 0).length
      const stars = calculateStarRating(totalHeroes, survivingHeroes)

      // 發放獎勵到存檔
      const currentGold = saveHook.playerData?.save.gold ?? 0
      const currentDiamond = saveHook.playerData?.save.diamond ?? 0
      const currentExp = saveHook.playerData?.save.exp ?? 0
      saveHook.doUpdateProgress({
        gold: currentGold + rewards.gold,
        diamond: currentDiamond + (rewards.diamond ?? 0),
        exp: currentExp + rewards.exp,
      })

      setVictoryRewards({
        exp: rewards.exp,
        gold: rewards.gold,
        diamond: rewards.diamond ?? 0,
        drops,
        stars,
        isFirst: first,
        resourceSpeed,
      })
    } else if (winner === 'enemy') {
      setLog('戰鬥結果：你淪為了它們的一員...')
      setBattleResult('defeat')
      setVictoryRewards(null)
    } else {
      setLog('戰鬥結束')
      setBattleResult('defeat')
      setVictoryRewards(null)
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const handleStageSelect = (mode: 'story' | 'tower' | 'daily', sid: string) => {
    setStageMode(mode)
    setStageId(sid)
    // 根據關卡設定重新生成固定敵方陣型
    updateEnemySlots(() => buildEnemySlotsFromStage(mode, sid, heroesList))
    setMenuScreen('none')
    setGameState('IDLE')
    showToast(`已選擇關卡: ${sid}`)
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
      <LoginScreen auth={authHook} onEnterGame={() => setShowGame(true)} />
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
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFShadowMap
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
          resourcePreview={saveHook.getResourcePreview()}
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
          onBack={handleBackToMenu}
          onSelectStage={handleStageSelect}
        />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'settings' && (
        <SettingsPanel
          onBack={handleBackToMenu}
          onLogout={() => { authHook.doLogout(); setShowGame(false) }}
          displayName={authHook.auth.displayName || '倖存者'}
          isBound={authHook.auth.isBound}
        />
      )}
      {gameState === 'MAIN_MENU' && menuScreen === 'mailbox' && (
        <MailboxPanel
          onBack={handleBackToMenu}
          onRewardsClaimed={() => { /* 樂觀更新：獎勵由下次登入同步，避免慢速 doLoadSave */ }}
          mailItems={mailItems}
          mailLoaded={mailLoaded}
          onMailItemsChange={setMailItems}
          onRefreshMail={refreshMailData}
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
              maxHP: Number(s.HP ?? s.currentHP ?? 1),
              element: ((s.element as string) || '') as DomainElement | '',
            }))}
          enemyHeroes={enemySlots
            .filter((s): s is SlotHero => s !== null)
            .map(s => ({
              uid: s._uid,
              name: String(s.Name ?? ''),
              currentHP: s.currentHP,
              maxHP: Number(s.HP ?? s.currentHP ?? 1),
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
        {/* 玩家資源顯示 */}
        {saveHook.playerData && gameState !== 'FETCHING' && (
          <div className="hud-resources">
            <span className="hud-gold" title="金幣 — 升級、購買、強化"><i className="icon-coin">G</i>{saveHook.playerData.save.gold.toLocaleString()}</span>
            <span className="hud-diamond" title="鑽石 — 召喚、加速、購買稀有道具"><i className="icon-dia">D</i>{saveHook.playerData.save.diamond.toLocaleString()}</span>
            <span className="hud-level">Lv.{saveHook.playerData.save.level}</span>
          </div>
        )}
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
              {/* 星級 */}
              <div className="reward-stars">
                {[1, 2, 3].map(i => (
                  <span key={i} className={`reward-star ${i <= victoryRewards.stars ? 'active' : ''}`}>★</span>
                ))}
              </div>
              {victoryRewards.isFirst && <div className="reward-first-clear">🏆 首次通關獎勵</div>}

              {/* 獎勵明細 */}
              <div className="reward-items-list">
                <div className="reward-item">
                  <span className="reward-icon gold"><i className="icon-coin">G</i></span>
                  <span className="reward-label">金幣</span>
                  <span className="reward-value">+{victoryRewards.gold.toLocaleString()}</span>
                </div>
                {victoryRewards.diamond > 0 && (
                  <div className="reward-item">
                    <span className="reward-icon diamond"><i className="icon-dia">D</i></span>
                    <span className="reward-label">鑽石</span>
                    <span className="reward-value">+{victoryRewards.diamond}</span>
                  </div>
                )}
                <div className="reward-item">
                  <span className="reward-icon exp">⚡</span>
                  <span className="reward-label">經驗</span>
                  <span className="reward-value">+{victoryRewards.exp}</span>
                </div>
                {victoryRewards.drops.map((d, i) => {
                  const itemNames: Record<string, string> = {
                    exp_core_s: '小型經驗核心', exp_core_m: '中型經驗核心', exp_core_l: '大型經驗核心',
                    chest_equipment: '裝備寶箱', eqm_enhance_s: '小型強化石', eqm_enhance_m: '中型強化石', eqm_enhance_l: '大型強化石',
                    asc_class_power: '力量突破材料', asc_class_agility: '敏捷突破材料', asc_class_defense: '防禦突破材料',
                  }
                  return (
                    <div className="reward-item" key={i}>
                      <span className="reward-icon drop">🎁</span>
                      <span className="reward-label">{itemNames[d.itemId] ?? d.itemId.replace(/_/g, ' ')}</span>
                      <span className="reward-value">×{d.quantity}</span>
                    </div>
                  )
                })}
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
          {battleResult === 'victory' && stageMode !== 'daily' && (
            <button onClick={goNextStage} className="btn-next-stage">
              {stageMode === 'tower' ? '下一層 ▶' : '下一關 ▶'}
            </button>
          )}
          <button onClick={retryBattle} className="btn-reset">
            {battleResult === 'victory' ? '再打一次' : '重試'}
          </button>
          <button onClick={backToLobby} className="btn-back-lobby">回大廳</button>
        </div>
      )}
      {gameState === 'BATTLE' && (
        <div className="btn-speed-wrap">
          <button
            onClick={() => setSpeed((s) => { const o = [1, 2, 4]; return o[(o.indexOf(s) + 1) % 3] })}
            className="btn-speed"
          >
            x{speed}
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
