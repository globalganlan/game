/**
 * useAnimationPromises — 動畫 Promise 與傷害彈窗系統
 *
 * 從 App.tsx 抽出，管理：
 *   - waitForAction / handleActorActionDone（攻擊/受傷/死亡動畫 Promise）
 *   - waitForMove / handleMoveDone（前進/後退動畫 Promise）
 *   - addDamage（傷害彈窗 + 受擊閃光）
 *   - clearAllPromises（清除殘留 Promise，避免 stale timeout）
 */
import { useState, useRef, useCallback } from 'react'
import type { DamagePopupData, ActionResolveEntry, AnimationState } from '../types'

export function useAnimationPromises(skipBattleRef: React.MutableRefObject<boolean>) {
  const [damagePopups, setDamagePopups] = useState<DamagePopupData[]>([])
  const [hitFlashSignals, setHitFlashSignals] = useState<Record<string, number>>({})
  const actionResolveRefs = useRef<Record<string, ActionResolveEntry>>({})
  const moveResolveRefs = useRef<Record<string, () => void>>({})

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
  }, [skipBattleRef])

  const handleActorActionDone = useCallback((uid: string, doneState: AnimationState) => {
    const entry = actionResolveRefs.current[uid]
    if (!entry) return
    if (entry.expectedState && entry.expectedState !== doneState) return
    entry.resolve()
    delete actionResolveRefs.current[uid]
  }, [])

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
  }, [skipBattleRef])

  const handleMoveDone = useCallback((uid: string) => {
    const r = moveResolveRefs.current[uid]
    if (r) { r(); delete moveResolveRefs.current[uid] }
  }, [])

  const handleModelReady = useCallback(() => { /* 保留介面 */ }, [])

  /** 新增傷害彈窗 + 觸發受擊閃光（支援複數目標） */
  const addDamage = useCallback((targetUids: string | string[], value: number) => {
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
  }, [])

  /** 清除所有殘留的動畫/移動 Promise — 避免 stale timeout 漏進新戰鬥 */
  const clearAllPromises = useCallback(() => {
    for (const key of Object.keys(actionResolveRefs.current)) {
      actionResolveRefs.current[key]?.resolve()
      delete actionResolveRefs.current[key]
    }
    for (const key of Object.keys(moveResolveRefs.current)) {
      moveResolveRefs.current[key]?.()
      delete moveResolveRefs.current[key]
    }
  }, [])

  return {
    damagePopups, setDamagePopups,
    hitFlashSignals, setHitFlashSignals,
    actionResolveRefs, moveResolveRefs,
    waitForAction, handleActorActionDone,
    waitForMove, handleMoveDone,
    handleModelReady, addDamage,
    clearAllPromises,
  }
}
