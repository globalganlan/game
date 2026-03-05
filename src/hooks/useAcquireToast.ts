/**
 * useAcquireToast — 統一浮動 Toast 系統
 *
 * 同時處理「純文字提示」與「獲得物品動畫」，每條 toast 獨立動畫、自動移除。
 * 對應 Spec: .ai/specs/item-acquire-toast.md v0.2
 */

import { useState, useCallback, useRef, ReactNode } from 'react'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface AcquireItem {
  type: 'hero' | 'equipment' | 'item' | 'currency' | 'fragment'
  id: string
  name: string
  quantity: number
  rarity?: 'N' | 'R' | 'SR' | 'SSR'
  isNew?: boolean
  thumbnail?: string
}

/** 統一 Toast 條目 */
export interface ToastEntry {
  id: number
  kind: 'text' | 'item'
  text?: ReactNode | string
  item?: AcquireItem
  /** 出場延遲 ms（物品批次用 stagger） */
  delay: number
}

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

const STAGGER_MS = 350

/* ════════════════════════════════════
   Hook
   ════════════════════════════════════ */

export function useAcquireToast() {
  const [entries, setEntries] = useState<ToastEntry[]>([])
  const idRef = useRef(0)

  /** 顯示物品取得提示（帶 icon、stagger） */
  const show = useCallback((items: AcquireItem[]) => {
    if (items.length === 0) return
    setEntries(prev => [
      ...prev,
      ...items.map((item, i) => ({
        id: ++idRef.current,
        kind: 'item' as const,
        item,
        delay: i * STAGGER_MS,
      })),
    ])
  }, [])

  /** 顯示純文字提示 */
  const showText = useCallback((text: string | ReactNode) => {
    const id = ++idRef.current
    setEntries(prev => [...prev, { id, kind: 'text', text, delay: 0 }])
  }, [])

  /** 移除單條（由 onAnimationEnd 呼叫） */
  const remove = useCallback((id: number) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  return { entries, show, showText, remove }
}
