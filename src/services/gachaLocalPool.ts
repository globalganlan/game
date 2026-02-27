/**
 * gachaLocalPool — 前端本地抽卡池
 *
 * 核心概念：
 * 1. 登入時從 load-save 取得伺服器預生成的 200 組抽卡結果
 * 2. 抽卡時本地直接消耗 pool → 零等待顯示結果
 * 3. 背景 API 通知伺服器扣鑽石/入帳英雄/碎片
 * 4. 背景呼叫 refill-pool 取得補充的池資料
 * 5. localStorage 備份確保資料不遺失
 */

import { getAuthState } from './authService'
import { fireOptimistic, generateOpId } from './optimisticQueue'
import {
  SINGLE_PULL_COST,
  TEN_PULL_COST,
  type GachaRarity,
  type PityState,
} from '../domain/gachaSystem'

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

const STORAGE_KEY_POOL = 'globalganlan_gacha_pool'
const STORAGE_KEY_PITY = 'globalganlan_gacha_pity'
const STORAGE_KEY_OWNED = 'globalganlan_owned_heroes'
const STORAGE_KEY_PENDING_PULLS = 'globalganlan_pending_pulls'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

/** 池低於此數量時才觸發背景補池 */
const REFILL_THRESHOLD = 400

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

/** 伺服器池 entry（節省空間的格式） */
export interface PoolEntry {
  h: number    // heroId
  r: string    // rarity: 'N' | 'R' | 'SR' | 'SSR'
  f: boolean   // isFeatured
}

export interface LocalPullResult {
  heroId: number
  rarity: GachaRarity
  isNew: boolean
  isFeatured: boolean
}

export interface LocalPullResponse {
  success: boolean
  results: LocalPullResult[]
  diamondCost: number
  newPityState: PityState
  poolRemaining: number
  error?: string
}

/** 待同步的抽卡操作 */
interface PendingPull {
  opId: string
  count: 1 | 10
  bannerId: string
  consumedEntries: PoolEntry[]
  timestamp: string
}

/* ════════════════════════════════════
   內部 state
   ════════════════════════════════════ */

let _pool: PoolEntry[] = []
let _pityState: PityState = { pullsSinceLastSSR: 0, guaranteedFeatured: false }
let _ownedHeroIds: Set<number> = new Set()
let _isRefilling = false

/** 狀態變更監聽 */
type PoolListener = (remaining: number) => void
const _listeners: PoolListener[] = []

function notifyListeners() {
  for (const fn of _listeners) fn(_pool.length)
}

/* ════════════════════════════════════
   localStorage 持久化
   ════════════════════════════════════ */

function savePoolToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY_POOL, JSON.stringify(_pool))
    localStorage.setItem(STORAGE_KEY_PITY, JSON.stringify(_pityState))
    localStorage.setItem(STORAGE_KEY_OWNED, JSON.stringify([..._ownedHeroIds]))
  } catch { /* 容量不足忽略 */ }
}

function loadPoolFromStorage(): boolean {
  try {
    const poolRaw = localStorage.getItem(STORAGE_KEY_POOL)
    const pityRaw = localStorage.getItem(STORAGE_KEY_PITY)
    const ownedRaw = localStorage.getItem(STORAGE_KEY_OWNED)
    if (!poolRaw) return false
    _pool = JSON.parse(poolRaw)
    if (pityRaw) _pityState = JSON.parse(pityRaw)
    if (ownedRaw) _ownedHeroIds = new Set(JSON.parse(ownedRaw))
    return true
  } catch {
    return false
  }
}

function savePendingPull(pull: PendingPull): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_PULLS)
    const pulls: PendingPull[] = raw ? JSON.parse(raw) : []
    pulls.push(pull)
    localStorage.setItem(STORAGE_KEY_PENDING_PULLS, JSON.stringify(pulls))
  } catch { /* 忽略 */ }
}

function removePendingPull(opId: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_PULLS)
    if (!raw) return
    const pulls: PendingPull[] = JSON.parse(raw)
    localStorage.setItem(
      STORAGE_KEY_PENDING_PULLS,
      JSON.stringify(pulls.filter(p => p.opId !== opId)),
    )
  } catch { /* 忽略 */ }
}

export function getPendingPulls(): PendingPull[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_PULLS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/* ════════════════════════════════════
   公開 API：初始化 / 查詢
   ════════════════════════════════════ */

/**
 * 初始化本地池（登入時呼叫）
 * @param pool 伺服器回傳的完整池陣列
 * @param pityState 當前保底狀態
 * @param ownedHeroIds 已擁有的英雄 ID
 */
export function initLocalPool(
  pool: PoolEntry[],
  pityState: PityState | string,
  ownedHeroIds: number[],
): void {
  _pool = pool || []
  // GAS 回傳的 gachaPity 可能是未解析的 JSON 字串
  let parsed: PityState = { pullsSinceLastSSR: 0, guaranteedFeatured: false }
  if (typeof pityState === 'string') {
    try { parsed = JSON.parse(pityState) } catch { /* fallback */ }
  } else if (pityState && typeof pityState === 'object') {
    parsed = pityState
  }
  _pityState = {
    pullsSinceLastSSR: Number(parsed.pullsSinceLastSSR) || 0,
    guaranteedFeatured: !!parsed.guaranteedFeatured,
  }
  _ownedHeroIds = new Set(ownedHeroIds || [])
  savePoolToStorage()
  notifyListeners()
  console.log(`[gachaLocalPool] initialized: ${_pool.length} entries, ${_ownedHeroIds.size} owned heroes, pity=${_pityState.pullsSinceLastSSR}`)
}

/** 取得目前池剩餘數量 */
export function getPoolRemaining(): number {
  return _pool.length
}

/** 取得目前保底狀態 */
export function getPityState(): PityState {
  return { ..._pityState }
}

/** 取得已擁有英雄 ID */
export function getOwnedHeroIds(): number[] {
  return [..._ownedHeroIds]
}

/** 訂閱池數量變化 */
export function onPoolChange(fn: PoolListener): () => void {
  _listeners.push(fn)
  return () => {
    const idx = _listeners.indexOf(fn)
    if (idx >= 0) _listeners.splice(idx, 1)
  }
}

/** 嘗試從 localStorage 恢復（離線 fallback） */
export function tryRestoreFromStorage(): boolean {
  return loadPoolFromStorage()
}

/* ════════════════════════════════════
   核心：本地抽卡（零等待）
   ════════════════════════════════════ */

/**
 * 本地抽卡 — 同步回傳結果，零等待
 *
 * 1. 檢查鑽石 & 池數量
 * 2. 從池前端取出 entries
 * 3. 本地判斷 isNew + 更新 pityState
 * 4. 寫入 localStorage 備份
 * 5. 背景 fire API（樂觀佇列）
 * 6. 背景觸發 refill
 *
 * @returns 同步結果（0ms）
 */
export function localPull(
  bannerId: string,
  count: 1 | 10,
  currentDiamond: number,
): LocalPullResponse {
  const cost = count === 10 ? TEN_PULL_COST : SINGLE_PULL_COST

  // 鑽石檢查
  if (currentDiamond < cost) {
    return {
      success: false, results: [], diamondCost: 0,
      newPityState: _pityState, poolRemaining: _pool.length,
      error: 'insufficient_diamond',
    }
  }

  // 池數量檢查
  if (_pool.length < count) {
    // ⚠️ 池不夠 → 主動觸發補池（debounce 500ms 後執行）
    scheduleRefill()
    return {
      success: false, results: [], diamondCost: 0,
      newPityState: _pityState, poolRemaining: _pool.length,
      error: 'pool_empty',
    }
  }

  // ── 從池取出 ──
  const consumed = _pool.splice(0, count)

  // ── 本地處理每筆結果 ──
  const results: LocalPullResult[] = []
  for (const entry of consumed) {
    const heroId = entry.h
    const rarity = entry.r as GachaRarity
    const isFeatured = entry.f || false
    const isNew = !_ownedHeroIds.has(heroId)

    if (isNew) {
      _ownedHeroIds.add(heroId)
    }

    // 更新保底計數
    if (rarity === 'SSR') {
      _pityState.pullsSinceLastSSR = 0
      _pityState.guaranteedFeatured = !isFeatured
    } else {
      _pityState.pullsSinceLastSSR++
    }

    results.push({ heroId, rarity, isNew, isFeatured })
  }

  // ── localStorage 持久化 ──
  savePoolToStorage()

  const opId = generateOpId()
  const pendingPull: PendingPull = {
    opId,
    count,
    bannerId,
    consumedEntries: consumed,
    timestamp: new Date().toISOString(),
  }
  savePendingPull(pendingPull)

  // ── 背景 API：通知伺服器消耗 ──
  fireOptimistic('gacha-pull', { bannerId, count }, undefined, (serverResult) => {
    // 伺服器成功 → 移除 pending pull 備份
    if (serverResult.success) {
      removePendingPull(opId)
    }
  })

  // ── 背景觸發 refill（僅在池低於門檻時）──
  if (_pool.length < REFILL_THRESHOLD) {
    scheduleRefill()
  }

  notifyListeners()

  return {
    success: true,
    results,
    diamondCost: cost,
    newPityState: { ..._pityState },
    poolRemaining: _pool.length,
  }
}

/* ════════════════════════════════════
   背景補池
   ════════════════════════════════════ */

let _refillTimer: ReturnType<typeof setTimeout> | null = null

/** 排程背景補池（debounce 500ms，避免連抽時重複呼叫） */
function scheduleRefill(): void {
  if (_refillTimer) clearTimeout(_refillTimer)
  _refillTimer = setTimeout(() => {
    _refillTimer = null
    doRefill()
  }, 500)
}

/** 呼叫 refill-pool API 取得新生成的 entries（只追加，不覆蓋） */
async function doRefill(): Promise<void> {
  if (_isRefilling) return
  // 安全門檻：池已充足就不補（防止 race condition 導致重複補池）
  if (_pool.length >= REFILL_THRESHOLD) return
  _isRefilling = true

  try {
    const token = getAuthState().guestToken
    if (!token) return

    const body = JSON.stringify({
      action: 'refill-pool',
      guestToken: token,
      clientPoolRemaining: _pool.length,   // 讓 server 同步已消耗的 entries
      clientPity: {                        // 讓 server 校正 poolEndPity
        pullsSinceLastSSR: _pityState.pullsSinceLastSSR,
        guaranteedFeatured: _pityState.guaranteedFeatured,
      },
    })
    const res = await fetch(POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    })
    const data = await res.json()

    if (data.success) {
      // ⚠️ 只追加新生成的 entries，不覆蓋現有 pool
      // 避免 race condition：client 已本地消耗部分 entries，
      // 但 server 的 gacha-pull 尚未處理完畢時，
      // 如果用 server 的 full pool 覆蓋 → 會重複消耗已消費的 entries
      if (Array.isArray(data.newEntries) && data.newEntries.length > 0) {
        _pool = _pool.concat(data.newEntries)
        console.log(`[gachaLocalPool] refill: +${data.newEntries.length} entries, total=${_pool.length}`)
      } else {
        console.log(`[gachaLocalPool] refill: no new entries (server pool=${data.serverPoolTotal})`)
      }

      // 同步 ownedHeroIds（安全，不會 race condition）
      if (Array.isArray(data.ownedHeroIds)) {
        _ownedHeroIds = new Set(data.ownedHeroIds)
      }

      // ⚠️ 不同步 pityState — client 的 pity 根據實際消耗 entries 遞增（UI 用）
      // server 的 pity 用於池生成，兩者可能暫時不同步

      savePoolToStorage()
      notifyListeners()
    }
  } catch (err) {
    console.warn('[gachaLocalPool] refill failed:', err)
  } finally {
    _isRefilling = false
  }
}

/** 手動觸發 refill（外部呼叫用） */
export function triggerRefill(): void {
  doRefill()
}

/** 清除所有本地池資料（登出時呼叫） */
export function clearLocalPool(): void {
  _pool = []
  _pityState = { pullsSinceLastSSR: 0, guaranteedFeatured: false }
  _ownedHeroIds = new Set()
  localStorage.removeItem(STORAGE_KEY_POOL)
  localStorage.removeItem(STORAGE_KEY_PITY)
  localStorage.removeItem(STORAGE_KEY_OWNED)
  localStorage.removeItem(STORAGE_KEY_PENDING_PULLS)
  notifyListeners()
}
