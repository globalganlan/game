/**
 * acquireToastBus — 全域 Toast 觸發匯流排
 *
 * App.tsx 在 mount 時 register handlers，
 * 任何元件都可 import emitAcquire / emitToast 觸發。
 */

import type { AcquireItem } from '../hooks/useAcquireToast'

type ItemHandler = (items: AcquireItem[]) => void
type TextHandler = (text: string) => void

let itemHandler: ItemHandler | null = null
let textHandler: TextHandler | null = null

/** 註冊物品取得 handler（App.tsx mount 時呼叫） */
export function registerAcquireHandler(h: ItemHandler): void {
  itemHandler = h
}

/** 註冊純文字 toast handler（App.tsx mount 時呼叫） */
export function registerTextHandler(h: TextHandler): void {
  textHandler = h
}

/** 觸發獲得物品動畫 */
export function emitAcquire(items: AcquireItem[]): void {
  if (items.length === 0) return
  itemHandler?.(items)
}

/** 觸發純文字浮動提示 */
export function emitToast(text: string): void {
  textHandler?.(text)
}
