/**
 * acquireToastBus — 全域獲得物品動畫觸發匯流排
 *
 * App.tsx 在 mount 時 register(acquireToast.show)，
 * 任何元件都可 import { emitAcquire } 觸發動畫。
 */

import type { AcquireItem } from '../hooks/useAcquireToast'

type Handler = (items: AcquireItem[]) => void

let handler: Handler | null = null

/** App.tsx 在 mount 時呼叫，註冊全域 handler */
export function registerAcquireHandler(h: Handler): void {
  handler = h
}

/** 任何元件呼叫此函式即可觸發獲得物品動畫 */
export function emitAcquire(items: AcquireItem[]): void {
  if (items.length === 0) return
  handler?.(items)
}
