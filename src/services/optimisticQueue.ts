/**
 * optimisticQueue — 樂觀更新佇列
 *
 * 核心設計：
 * 1. UI 操作 → 立即更新本地 state → 使用者零等待
 * 2. 背景非同步呼叫 API → 成功後移除備份
 * 3. API 失敗 → 保留在 localStorage 備份
 * 4. 下次登入 → 檢查備份 → 送 reconcile-pending 到伺服器補償
 *
 * 每筆操作帶唯一 opId（幂等鍵），伺服器保證：
 * - 同一 opId 只會處理一次
 * - 重複送同一 opId → 直接回傳快取結果
 */

import { getAuthState } from './authService'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface PendingOp {
  opId: string
  action: string
  params: Record<string, unknown>
  createdAt: string
  /** 操作的本地預測結果（用於 reconcile 失敗時 rollback） */
  optimisticResult?: Record<string, unknown>
}

/* ════════════════════════════════════
   常數 & 內部狀態
   ════════════════════════════════════ */

const STORAGE_KEY = 'globalganlan_pending_ops'
const MAX_OP_AGE_MS = 24 * 60 * 60 * 1000 // 24 小時過期

/** 正在執行中的 ops（防止同一 opId 重複發送） */
const _inflightOps = new Set<string>()

/** 狀態變更監聽器 */
type QueueListener = (pending: PendingOp[]) => void
const _listeners: QueueListener[] = []

function notify() {
  const ops = getPendingOps()
  for (const fn of _listeners) fn(ops)
}

/* ════════════════════════════════════
   localStorage 存取
   ════════════════════════════════════ */

/** 讀取所有 pending ops（過濾已過期的） */
export function getPendingOps(): PendingOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const ops: PendingOp[] = JSON.parse(raw)
    const now = Date.now()
    return ops.filter(op => now - new Date(op.createdAt).getTime() < MAX_OP_AGE_MS)
  } catch {
    return []
  }
}

/** 儲存 pending ops 到 localStorage */
function savePendingOps(ops: PendingOp[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops))
  } catch {
    // localStorage 滿了 → 忽略，API 仍會在背景重試
  }
}

/** 新增一筆 pending op */
function addPendingOp(op: PendingOp): void {
  const ops = getPendingOps()
  ops.push(op)
  savePendingOps(ops)
}

/** 移除指定 opId */
function removePendingOp(opId: string): void {
  const ops = getPendingOps().filter(op => op.opId !== opId)
  savePendingOps(ops)
}

/** 清除所有 */
export function clearPendingOps(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/* ════════════════════════════════════
   opId 生成
   ════════════════════════════════════ */

let _opCounter = 0

/** 產生全域唯一的操作 ID */
export function generateOpId(): string {
  _opCounter++
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${_opCounter}`
}

/* ════════════════════════════════════
   訂閱
   ════════════════════════════════════ */

export function onQueueChange(fn: QueueListener): () => void {
  _listeners.push(fn)
  return () => {
    const idx = _listeners.indexOf(fn)
    if (idx >= 0) _listeners.splice(idx, 1)
  }
}

/* ════════════════════════════════════
   核心：送出樂觀操作
   ════════════════════════════════════ */

/**
 * 通用 API 呼叫（帶 guestToken）
 */
async function callApi<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T & { success: boolean; error?: string }> {
  const token = getAuthState().guestToken
  if (!token) throw new Error('not_logged_in')
  const body = JSON.stringify({ action, guestToken: token, ...params })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  return res.json()
}

/**
 * 送出樂觀操作
 *
 * @param action   API action name
 * @param params   API 參數（不含 guestToken，會自動加）
 * @param onLocal  可選的本地立即更新函式（同步執行）
 * @returns opId  可用來追蹤操作狀態
 *
 * 流程：
 * 1. 產生 opId
 * 2. 立即呼叫 onLocal（本地樂觀更新）
 * 3. 將 op 寫入 localStorage 備份
 * 4. 背景呼叫 API
 * 5. 成功 → 移除備份；失敗 → 保留備份
 */
export function fireOptimistic<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown>,
  onLocal?: () => void,
  onServerResult?: (result: T & { success: boolean }) => void,
): string {
  const opId = generateOpId()
  const pendingOp: PendingOp = {
    opId,
    action,
    params,
    createdAt: new Date().toISOString(),
  }

  // 1. 本地樂觀更新
  if (onLocal) {
    try { onLocal() } catch (e) {
      console.warn('[optimisticQueue] onLocal error:', e)
    }
  }

  // 2. 備份到 localStorage
  addPendingOp(pendingOp)
  notify()

  // 3. 背景 API 呼叫
  _inflightOps.add(opId)
  callApi<T>(action, { ...params, opId })
    .then(result => {
      _inflightOps.delete(opId)
      if (result.success) {
        // 成功 → 移除備份
        removePendingOp(opId)
        notify()
      }
      // 不管成功失敗都回傳結果給呼叫者
      if (onServerResult) onServerResult(result)
    })
    .catch(err => {
      _inflightOps.delete(opId)
      console.warn(`[optimisticQueue] ${action} failed, will retry on reconnect:`, err)
      // 網路失敗 → 保留備份，下次登入 reconcile
    })

  return opId
}

/**
 * 送出樂觀操作（async 版本）
 *
 * 跟 fireOptimistic 一樣，但回傳 Promise 讓呼叫者可以 await 伺服器結果。
 * 本地更新仍然是同步立即發生的。
 */
export function fireOptimisticAsync<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown>,
  onLocal?: () => void,
): { opId: string; serverResult: Promise<T & { success: boolean }> } {
  const opId = generateOpId()
  const pendingOp: PendingOp = {
    opId,
    action,
    params,
    createdAt: new Date().toISOString(),
  }

  // 1. 本地樂觀更新
  if (onLocal) {
    try { onLocal() } catch (e) {
      console.warn('[optimisticQueue] onLocal error:', e)
    }
  }

  // 2. 備份到 localStorage
  addPendingOp(pendingOp)
  notify()

  // 3. 背景 API 呼叫
  _inflightOps.add(opId)
  const serverResult = callApi<T>(action, { ...params, opId })
    .then(result => {
      _inflightOps.delete(opId)
      if (result.success) {
        removePendingOp(opId)
        notify()
      }
      return result
    })
    .catch(err => {
      _inflightOps.delete(opId)
      console.warn(`[optimisticQueue] ${action} failed:`, err)
      // 如果是已 queued 的話回傳一個假的 success（本地已更新了）
      return { success: false, error: String(err) } as T & { success: boolean; error?: string }
    })

  return { opId, serverResult }
}

/* ════════════════════════════════════
   登入時：Reconcile 未完成操作
   ════════════════════════════════════ */

/**
 * 登入後呼叫一次，檢查 localStorage 有沒有上次未完成的操作。
 * 批次送到伺服器的 reconcile-pending API。
 * 已完成的 → 移除備份
 * 未完成的 → 伺服器重新執行 → 成功後移除備份
 */
export async function reconcilePendingOps(): Promise<{
  reconciled: number
  failed: number
}> {
  const ops = getPendingOps()
  if (ops.length === 0) return { reconciled: 0, failed: 0 }

  console.log(`[optimisticQueue] reconciling ${ops.length} pending ops...`)

  try {
    const res = await callApi<{
      results: { opId: string; status: string; result?: Record<string, unknown>; error?: string }[]
    }>('reconcile-pending', {
      ops: ops.map(op => ({
        opId: op.opId,
        action: op.action,
        params: op.params,
      })),
    })

    if (!res.success) {
      console.warn('[optimisticQueue] reconcile-pending failed:', res.error)
      return { reconciled: 0, failed: ops.length }
    }

    let reconciled = 0
    let failed = 0

    for (const r of res.results || []) {
      if (r.status === 'already_processed' || r.status === 'executed') {
        removePendingOp(r.opId)
        reconciled++
      } else {
        console.warn(`[optimisticQueue] op ${r.opId} reconcile failed:`, r.error)
        failed++
      }
    }

    notify()
    console.log(`[optimisticQueue] reconciled: ${reconciled}, failed: ${failed}`)
    return { reconciled, failed }
  } catch (err) {
    console.warn('[optimisticQueue] reconcile network error:', err)
    return { reconciled: 0, failed: ops.length }
  }
}

/**
 * 檢查是否有待處理的操作
 */
export function hasPendingOps(): boolean {
  return getPendingOps().length > 0
}

/**
 * 取得正在發送的 op 數量
 */
export function getInflightCount(): number {
  return _inflightOps.size
}
