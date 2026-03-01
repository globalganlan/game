/**
 * useAcquireToast — 獲得物品動畫佇列管理
 *
 * 對應 Spec: specs/item-acquire-toast.md v0.1
 */

import { useState, useCallback, useRef } from 'react'

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

/* ════════════════════════════════════
   Hook
   ════════════════════════════════════ */

export function useAcquireToast() {
  const [items, setItems] = useState<AcquireItem[]>([])
  const [isShowing, setIsShowing] = useState(false)
  const queueRef = useRef<AcquireItem[][]>([])
  const processingRef = useRef(false)

  const processNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      processingRef.current = false
      setIsShowing(false)
      setItems([])
      return
    }
    const next = queueRef.current.shift()!
    setItems(next)
    setIsShowing(true)
  }, [])

  const show = useCallback((newItems: AcquireItem[]) => {
    if (newItems.length === 0) return
    queueRef.current.push(newItems)
    if (!processingRef.current) {
      processingRef.current = true
      processNext()
    }
  }, [processNext])

  const dismiss = useCallback(() => {
    processNext()
  }, [processNext])

  return { items, isShowing, show, dismiss }
}
