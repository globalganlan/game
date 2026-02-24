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

import { useState, useEffect, useRef, useCallback, Suspense, startTransition } from 'react'
import { useThree } from '@react-three/fiber'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'

import './App.css'

import { useResponsive } from './hooks/useResponsive'
import { loadGlbShared } from './loaders/glbLoader'

import { Arena } from './components/Arena'
import { Hero } from './components/Hero'
import { ResponsiveCamera, SlotMarker } from './components/SceneWidgets'
import { TransitionOverlay, ThumbnailList } from './components/UIOverlay'

import type {
  GameState,
  ActorState,
  AnimationState,
  RawHeroData,
  SlotHero,
  DamagePopupData,
  ActionResolveEntry,
  BattleActor,
} from './types'
import type { Vector3Tuple } from 'three'

/* ────────────────────────────
   常數
   ──────────────────────────── */

const API_URL =
  'https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec'

/** 6 格空陣列 */
const EMPTY_SLOTS: (SlotHero | null)[] = Array(6).fill(null)

/** 格子欄 X 座標（3 欄） */
const COL_X: [number, number, number] = [-2.5, 0.0, 2.5]

/** 敵方兩排 Z 座標（前排靠近中場，後排遠離） */
const ENEMY_ROWS_Z: [number, number] = [-3.0, -6.0]
/** 玩家兩排 Z 座標（前排靠近中場，後排遠離） */
const PLAYER_ROWS_Z: [number, number] = [3.0, 6.0]

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
const FRONT_INDICES = [0, 1, 2]
const BACK_INDICES  = [3, 4, 5]

/** 攻擊者所在欄位 (0=左, 1=中, 2=右) */
function slotColumn(slot: number): number { return slot % 3 }

/** 從候選列表中找出活著的目標，優先對位欄，其次最近欄 */
function pickFromIndices(
  indices: number[],
  targetSlots: (SlotHero | null)[],
  preferCol: number,
): (SlotHero & { slot: number }) | null {
  // 優先同欄
  const sameCol = indices.find(i => slotColumn(i) === preferCol)
  if (sameCol !== undefined) {
    const c = targetSlots[sameCol]
    if (c && c.currentHP > 0) return { ...c, slot: sameCol }
  }
  // 按欄距排序，選最靠近對位的存活目標
  const sorted = [...indices]
    .filter(i => i !== sameCol)
    .sort((a, b) => Math.abs(slotColumn(a) - preferCol) - Math.abs(slotColumn(b) - preferCol))
  for (const idx of sorted) {
    const c = targetSlots[idx]
    if (c && c.currentHP > 0) return { ...c, slot: idx }
  }
  return null
}

/** 前排是否仍有存活單位 */
function frontAlive(targetSlots: (SlotHero | null)[]): boolean {
  return FRONT_INDICES.some(i => { const c = targetSlots[i]; return c != null && c.currentHP > 0 })
}

/**
 * 目標選擇策略
 *
 * 每個策略接收 (攻擊者欄位, 敵方 slots) → 回傳目標陣列。
 * 回傳陣列長度 > 1 代表 AOE，= 1 為單體。
 * 回傳 [] 代表無可攻擊目標。
 */
export type TargetStrategy = (
  attackerCol: number,
  targetSlots: (SlotHero | null)[],
) => (SlotHero & { slot: number })[]

/** 預設普攻：前排對位 → 前排其它 → 後排對位 → 後排其它 */
const TARGET_NORMAL: TargetStrategy = (col, slots) => {
  let t = pickFromIndices(FRONT_INDICES, slots, col)
  if (!t && !frontAlive(slots)) {
    t = pickFromIndices(BACK_INDICES, slots, col)
  }
  // 最終 fallback：任意存活
  if (!t) {
    for (let i = 0; i < slots.length; i++) {
      const c = slots[i]
      if (c && c.currentHP > 0) { t = { ...c, slot: i }; break }
    }
  }
  return t ? [t] : []
}

// ── 預留擴充策略（目前未使用，之後可直接啟用） ──

// /** 直擊後排：優先後排對位，後排全滅才打前排 */
// const TARGET_BACK_ROW: TargetStrategy = (col, slots) => {
//   let t = pickFromIndices(BACK_INDICES, slots, col)
//   if (!t) t = pickFromIndices(FRONT_INDICES, slots, col)
//   if (!t) { for (let i = 0; i < slots.length; i++) { const c = slots[i]; if (c && c.currentHP > 0) { t = { ...c, slot: i }; break } } }
//   return t ? [t] : []
// }

// /** 直擊前排：無視對位，掃前排有人就打 */
// const TARGET_FRONT_ROW: TargetStrategy = (col, slots) => {
//   let t = pickFromIndices(FRONT_INDICES, slots, col)
//   if (!t) t = pickFromIndices(BACK_INDICES, slots, col)
//   if (!t) { for (let i = 0; i < slots.length; i++) { const c = slots[i]; if (c && c.currentHP > 0) { t = { ...c, slot: i }; break } } }
//   return t ? [t] : []
// }

// /** 隨機 N 體攻擊 */
// function makeRandomTargets(count: number): TargetStrategy {
//   return (_col, slots) => {
//     const alive = slots
//       .map((c, i) => (c && c.currentHP > 0 ? { ...c, slot: i } : null))
//       .filter(Boolean) as (SlotHero & { slot: number })[]
//     const shuffled = alive.sort(() => Math.random() - 0.5)
//     return shuffled.slice(0, Math.min(count, shuffled.length))
//   }
// }

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
  return (h.Speed || h.SPD || h.SPEED || h.AGI || h.ATK || 1) as number
}

/** clamp 0–1 */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))


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
  /* ── 遊戲狀態 ── */
  const [gameState, setGameState] = useState<GameState>('PRE_BATTLE')
  const [heroesList, setHeroesList] = useState<RawHeroData[]>([])
  const [turn, setTurn] = useState(0)
  const turnRef = useRef(0)
  const [log, setLog] = useState('選擇你的英雄，準備戰鬥！')
  const [damagePopups, setDamagePopups] = useState<DamagePopupData[]>([])
  /** 受擊閃光訊號：uid → 遞增整數，每次受擊 +1 */
  const [hitFlashSignals, setHitFlashSignals] = useState<Record<string, number>>({})
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  useEffect(() => { speedRef.current = speed }, [speed])
  const [battleResult, setBattleResult] = useState<'victory' | 'defeat' | null>(null)

  /* ── 預載追蹤 ── */
  const preloadedGlbUrls = useRef(new Set<string>())
  const preloadedThumbUrls = useRef(new Set<string>())
  const [preloadProgress, setPreloadProgress] = useState<number | null>(null)
  const didInitFetch = useRef(false)

  /* ── 槽位 ── */
  const [playerSlots, setPlayerSlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const [enemySlots, setEnemySlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const pSlotsRef = useRef(EMPTY_SLOTS)
  const eSlotsRef = useRef(EMPTY_SLOTS)

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

  /* ── 動作完成 / 移動完成 Promise ── */
  const actionResolveRefs = useRef<Record<string, ActionResolveEntry>>({})
  const waitForAction = useCallback((uid: string, expectedState: AnimationState | null = null) => {
    return new Promise<void>((resolve) => {
      actionResolveRefs.current[uid] = { resolve, expectedState }
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
    return new Promise<void>((resolve) => { moveResolveRefs.current[uid] = resolve })
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
    // 1 mesh GLB + 4 anim GLBs per model
    const animNames = ['idle', 'attack', 'hurt', 'dying']
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
    const stageWeight = { fetch: 0.1, formation: 0.1, models: 0.6, thumbs: 0.2, finalize: 0.1 }
    const stageProgress = { fetch: 0, formation: 0, models: 0, thumbs: 0, finalize: 0 }
    const refresh = () => {
      const total =
        stageProgress.fetch * stageWeight.fetch +
        stageProgress.formation * stageWeight.formation +
        stageProgress.models * stageWeight.models +
        stageProgress.thumbs * stageWeight.thumbs +
        stageProgress.finalize * stageWeight.finalize
      setPreloadProgress(clamp01(total))
    }

    try {
      setGameState('FETCHING')
      setCurtainText('載入資源中...')
      setPreloadProgress(0)

      const res = await fetch(API_URL)
      const data: RawHeroData[] = await res.json()
      stageProgress.fetch = 1; refresh()

      setHeroesList(data || [])
      if (!data?.length) return

      // 隨機填充敵方陣型
      const avail = data.map((hero, i) => ({ hero, i }))
      const maxPick = Math.min(6, avail.length)
      const pickCount = Math.floor(Math.random() * maxPick) + 1
      const chosen: { hero: RawHeroData; i: number }[] = []
      for (let i = 0; i < pickCount; i++) {
        const idx = Math.floor(Math.random() * avail.length)
        chosen.push(avail.splice(idx, 1)[0])
      }
      const newEnemySlots: (SlotHero | null)[] = Array(6).fill(null)
      chosen.forEach((c, slot) => {
        const mid = normalizeModelId(c.hero, c.i)
        newEnemySlots[slot] = {
          ...c.hero,
          slot,
          currentHP: (c.hero.HP ?? 1) as number,
          _uid: `${mid}_${Date.now()}_${slot}`,
          _modelId: mid,
          ModelID: mid,
        }
      })
      updateEnemySlots(() => newEnemySlots)
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

      setGameState('IDLE')
      setLog('戰鬥準備就緒')
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
    if (didInitFetch.current) return
    didInitFetch.current = true
    fetchData.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 長載入提示
  useEffect(() => {
    const t = setTimeout(() => {
      if (!initialReady.current && gameState === 'FETCHING') setCurtainText('載入資源中...')
    }, 12000)
    return () => clearTimeout(t)
  }, [gameState])

  /* ── 重置 ── */
  const resetGame = () => {
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('載入資源中...')
    setPreloadProgress(null)
    initialReady.current = false
    curtainClosePromiseRef.current = null

    setTimeout(() => {
      setGameState('FETCHING')
      setTurn(0); turnRef.current = 0
      setLog('正在尋找倖存的人類樣本...')
      setDamagePopups([])
      setBattleResult(null)
      updatePlayerSlots(() => EMPTY_SLOTS)
      updateEnemySlots(() => EMPTY_SLOTS)
      actorStatesRef.current = {}
      setActorStates({})
      setHitFlashSignals({})
      fetchData.current?.()
    }, 600)
  }

  /* ══════════════════════════════
     戰鬥迴圈
     ══════════════════════════════ */

  const runBattleLoop = async () => {
    setGameState('BATTLE')
    turnRef.current = 1; setTurn(1)
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / speedRef.current))

    while (true) {
      const players = pSlotsRef.current.map((p, i) => p ? { side: 'player' as const, slot: i, hero: p } : null).filter(Boolean) as BattleActor[]
      const enemies = eSlotsRef.current.map((e, i) => e ? { side: 'enemy' as const, slot: i, hero: e } : null).filter(Boolean) as BattleActor[]
      if (!players.length || !enemies.length) break

      // 排序：速度 DESC → 槽位 ASC → 玩家優先
      const actors: BattleActor[] = [...players, ...enemies].map((a) => ({ ...a, speed: getHeroSpeed(a.hero) }))
      actors.sort((a, b) => {
        if (b.speed !== a.speed) return b.speed - a.speed
        if (a.slot !== b.slot) return a.slot - b.slot
        return a.side === 'player' ? -1 : 1
      })

      for (const actor of actors) {
        const curSlots = actor.side === 'player' ? pSlotsRef.current : eSlotsRef.current
        const actorEntry = curSlots[actor.slot]
        if (!actorEntry || actorEntry.currentHP <= 0) continue

        const uid = actorEntry._uid
        setLog(`ROUND ${turnRef.current}：${actor.side === 'player' ? '玩家' : '敵人'} ${actorEntry.Name} 發動攻擊`)

        // ── 選擇目標（使用策略模式，預設普攻） ──
        const targetSlots = actor.side === 'player' ? eSlotsRef.current : pSlotsRef.current
        const col = slotColumn(actor.slot)
        const strategy: TargetStrategy = TARGET_NORMAL // 之後可依技能切換策略
        const targets = strategy(col, targetSlots)
        const target = targets[0] ?? null
        if (!target) continue

        // ── 1) 前進：移向目標前方 ──
        const targetPos = actor.side === 'player'
          ? ENEMY_SLOT_POSITIONS[target.slot]
          : PLAYER_SLOT_POSITIONS[target.slot]
        // 單體攻擊：跑到目標前方；複數攻擊：跑到中間
        const STOP_DIST = 2.0 // 停在目標前方的距離
        const dir = actor.side === 'player' ? 1 : -1 // 玩家往 -Z，敵人往 +Z
        let advX: number, advZ: number
        if (targets.length > 1) {
          // AOE：跑到敵方陣型中心
          advX = 0
          advZ = 0
        } else {
          advX = targetPos[0]
          advZ = targetPos[2] + STOP_DIST * dir
        }
        moveTargetsRef.current = { ...moveTargetsRef.current, [uid]: [advX, 0, advZ] }
        setActorState(uid, 'ADVANCING')
        await waitForMove(uid)

        // ── 2) 攻擊 + 觸發受傷 ──
        const HIT_DELAY = 180
        const attackDone = waitForAction(uid, 'ATTACKING')
        setActorState(uid, 'ATTACKING')
        await delay(HIT_DELAY)

        // 先算傷害，判斷是否致死
        const dmg = (actorEntry.ATK ?? 1) as number
        const prevHP = (target.currentHP || 0) as number
        const nextHP = Math.max(0, prevHP - dmg)
        const died = nextHP <= 0

        // 致死 → 跳過 HURT 直接 DEAD（更連貫）；非致死 → 正常 HURT
        if (died) {
          // 直接進入死亡動畫（含閃光 + 傷害數字）
          const deadDone = waitForAction(target._uid, 'DEAD')
          setActorState(target._uid, 'DEAD')
          await delay(30)
          addDamage(target._uid, dmg)

          const updateTargetSlots = actor.side === 'player' ? updateEnemySlots : updatePlayerSlots
          await new Promise<void>((resolve) => {
            updateTargetSlots((prev) => {
              const ns = [...prev]
              if (!ns[target!.slot]) { resolve(); return ns }
              ns[target!.slot] = { ...ns[target!.slot]!, currentHP: nextHP }
              resolve()
              return ns
            })
          })

          // 等攻擊結束 → 後退
          await attackDone
          const retreatPromise = (async () => {
            setActorState(uid, 'RETREATING')
            await waitForMove(uid)
            setActorState(uid, 'IDLE')
          })()

          // 等死亡動畫結束 → 移除
          await deadDone
          updateTargetSlots((prev) => {
            const ns = [...prev]
            if (ns[target!.slot]?._uid === target!._uid) ns[target!.slot] = null
            return ns
          })

          await retreatPromise
        } else {
          // 非致死：正常受傷流程
          const hurtDone = waitForAction(target._uid, 'HURT')
          setActorState(target._uid, 'HURT')
          await delay(30)
          addDamage(target._uid, dmg)

          const updateTargetSlots = actor.side === 'player' ? updateEnemySlots : updatePlayerSlots
          await new Promise<void>((resolve) => {
            updateTargetSlots((prev) => {
              const ns = [...prev]
              if (!ns[target!.slot]) { resolve(); return ns }
              ns[target!.slot] = { ...ns[target!.slot]!, currentHP: nextHP }
              resolve()
              return ns
            })
          })

          // 等攻擊結束 → 後退（與受傷恢復同時進行）
          await attackDone
          const retreatPromise = (async () => {
            setActorState(uid, 'RETREATING')
            await waitForMove(uid)
            setActorState(uid, 'IDLE')
          })()

          await hurtDone
          setActorState(target._uid, 'IDLE')
          await retreatPromise
        }

        await delay(120)
      }

      turnRef.current++
      setTurn(turnRef.current)
    }

    // 判定勝負
    const leftAlive = pSlotsRef.current.some((s) => s && s.currentHP > 0)
    const rightAlive = eSlotsRef.current.some((s) => s && s.currentHP > 0)
    if (leftAlive && !rightAlive) {
      setLog('戰鬥結果：你生存了下來，但代價是什麼？')
      setBattleResult('victory')
    } else if (!leftAlive && rightAlive) {
      setLog('戰鬥結果：你淪為了它們的一員...')
      setBattleResult('defeat')
    } else {
      setLog('戰鬥結束')
      setBattleResult('defeat')
    }
    setGameState('GAMEOVER')
  }

  const startAutoBattle = () => {
    if (gameState !== 'IDLE') return
    if (!playerSlots.some(Boolean)) { setLog('戰場上沒有你的士兵，無法開始戰鬥！'); return }
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
      return
    }
    const priorityOrder = [0, 1, 2, 3, 4, 5]
    let targetIndex = selectedSlot ?? -1
    if (targetIndex < 0) {
      for (const pi of priorityOrder) {
        if (!playerSlots[pi]) { targetIndex = pi; break }
      }
    }
    if (targetIndex < 0) { setLog('已無可用上陣位置'); return }
    const idx = heroesList.indexOf(h)
    const mid = normalizeModelId(h, idx >= 0 ? idx : 0)
    // 用 startTransition 降低 Suspense fallback 造成的延遲感
    startTransition(() => {
      updatePlayerSlots((prev) => {
        const ns = [...prev]
        ns[targetIndex] = {
          ...h,
          currentHP: (h.HP ?? 1) as number,
          _uid: `${mid}_${Date.now()}`,
          _modelId: mid,
          ModelID: mid,
        }
        return ns
      })
    })
    setSelectedSlot(null)
  }

  const selectedKeys = playerSlots
    .filter(Boolean)
    .map((h) => String((h as SlotHero).HeroID ?? (h as SlotHero).id ?? (h as SlotHero).ModelID ?? (h as SlotHero).Name ?? (h as SlotHero)._modelId ?? '').trim())
    .filter(Boolean)

  /* ══════════════════════════════
     Render
     ══════════════════════════════ */

  return (
    <div
      style={{
        width: '100vw',
        height: '100dvh',
        background: '#000',
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
    {/* 直屏容器 — 桌機時限制為 9:16 比例，手機直接全螢幕 */}
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
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
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
          <Arena />

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
                gameState={gameState}
                damagePopups={damagePopups.filter((d) => d.uid === p._uid)}
                hitFlashSignal={hitFlashSignals[p._uid] || 0}
                onModelReady={handleModelReady}
                onActionDone={(s) => handleActorActionDone(p._uid, s)}
                onMoveDone={handleMoveDone}
                textScale={responsive.textScale}
                speed={speed}
                moveTargetsRef={moveTargetsRef}
                onDragStart={(e) => { (e as unknown as { stopPropagation: () => void }).stopPropagation(); startDrag(i, e) }}
                slotIndex={i}
                dragSourceRef={dragSourceRef}
                dragPosRef={dragPosRef}
                dragOffsetRef={dragOffsetRef}
                isDragActive={dragging}
                canAdjustFormation={canAdjustFormation}
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
                gameState={gameState}
                damagePopups={damagePopups.filter((d) => d.uid === e._uid)}
                hitFlashSignal={hitFlashSignals[e._uid] || 0}
                onModelReady={handleModelReady}
                onActionDone={(s) => handleActorActionDone(e._uid, s)}
                onMoveDone={handleMoveDone}
                textScale={responsive.textScale}
                speed={speed}
                moveTargetsRef={moveTargetsRef}
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

      {/* ── HUD ── */}
      <div className="game-hud">
        {turn > 0 && gameState !== 'GAMEOVER' && <div className="hud-round">ROUND {turn}</div>}
      </div>

      {/* ── 勝負標語 ── */}
      {gameState === 'GAMEOVER' && battleResult && (
        <div className={`battle-result-banner ${battleResult}`}>
          <span className="banner-text">{battleResult === 'victory' ? 'VICTORY' : 'DEFEAT'}</span>
          <span className="banner-sub">{battleResult === 'victory' ? '你生存了下來' : '你淪為了它們的一員'}</span>
        </div>
      )}

      {/* ── GAMEOVER 按鈕 ── */}
      {gameState === 'GAMEOVER' && (
        <div className="btn-bottom-center">
          <button onClick={resetGame} className="btn-reset">重啟循環</button>
        </div>
      )}
      {gameState !== 'IDLE' && gameState !== 'FETCHING' && gameState !== 'GAMEOVER' && (
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
              <button onClick={startAutoBattle} className="btn-start">進入屠殺</button>
            </div>
          )}
          <ThumbnailList
            heroes={heroesList}
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
    </div>
  )
}
