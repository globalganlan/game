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
import type { DamagePopupData, DamageDisplayType, ActionResolveEntry, AnimationState, VfxEvent, VfxType } from '../types'

export function useAnimationPromises(skipBattleRef: React.MutableRefObject<boolean>) {
  const [damagePopups, setDamagePopups] = useState<DamagePopupData[]>([])
  const [hitFlashSignals, setHitFlashSignals] = useState<Record<string, number>>({})
  const [vfxEvents, setVfxEvents] = useState<VfxEvent[]>([])
  const [skillFlashes, setSkillFlashes] = useState<{ id: number; uid: string; timestamp: number }[]>([])
  const [skillFlashOverlayKey, setSkillFlashOverlayKey] = useState(0)
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

  /** 新增傷害彈窗 + 觸發受擊閃光 + 粒子特效（支援複數目標） */
  const addDamage = useCallback((targetUids: string | string[], value: number, damageType?: DamageDisplayType) => {
    const uids = Array.isArray(targetUids) ? targetUids : [targetUids]
    for (const uid of uids) {
      const id = Math.random()
      setDamagePopups((prev) => [...prev, { id, uid, value, damageType }])
      setTimeout(() => setDamagePopups((prev) => prev.filter((p) => p.id !== id)), 1500)
    }
    // 閃避（value===0）不觸發閃光與粒子
    if (value !== 0) {
      // 觸發受擊閃光
      setHitFlashSignals((prev) => {
        const next = { ...prev }
        for (const uid of uids) {
          next[uid] = (next[uid] || 0) + 1
        }
        return next
      })
    }
    // 觸發粒子特效（跳過模式不播、閃避不播）
    if (value !== 0 && !skipBattleRef.current) {
      const vfxType: VfxType = value < 0 ? 'heal' : damageType === 'crit' ? 'crit' : damageType === 'dot' ? 'dot' : 'hit'
      const now = Date.now()
      const newEvents = uids.map(uid => ({ id: Math.random(), uid, type: vfxType, timestamp: now }))
      setVfxEvents((prev) => [...prev, ...newEvents])
      setTimeout(() => {
        const ids = new Set(newEvents.map(e => e.id))
        setVfxEvents((prev) => prev.filter((e) => !ids.has(e.id)))
      }, 1000)
    }
  }, [skipBattleRef])

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

  /** 技能施放閃光（目標位置短暫閃光 + 全螢幕 KOF98 連閃） */
  const addSkillFlash = useCallback((uid: string) => {
    if (skipBattleRef.current) return
    const id = Math.random()
    setSkillFlashes((prev) => [...prev, { id, uid, timestamp: Date.now() }])
    setTimeout(() => setSkillFlashes((prev) => prev.filter((f) => f.id !== id)), 600)
    // 全螢幕白閃 overlay（遞增 key 重新觸發 CSS 動畫）
    setSkillFlashOverlayKey((k) => k + 1)
  }, [skipBattleRef])

  /** Buff 施加粒子 */
  const addBuffVfx = useCallback((targetUids: string | string[]) => {
    if (skipBattleRef.current) return
    const uids = Array.isArray(targetUids) ? targetUids : [targetUids]
    const now = Date.now()
    const newEvents = uids.map(uid => ({ id: Math.random(), uid, type: 'buff' as VfxType, timestamp: now }))
    setVfxEvents((prev) => [...prev, ...newEvents])
    setTimeout(() => {
      const ids = new Set(newEvents.map(e => e.id))
      setVfxEvents((prev) => prev.filter((e) => !ids.has(e.id)))
    }, 900)
  }, [skipBattleRef])

  return {
    damagePopups, setDamagePopups,
    hitFlashSignals, setHitFlashSignals,
    vfxEvents, setVfxEvents,
    skillFlashes, setSkillFlashes,
    skillFlashOverlayKey,
    actionResolveRefs, moveResolveRefs,
    waitForAction, handleActorActionDone,
    waitForMove, handleMoveDone,
    handleModelReady, addDamage,
    addSkillFlash, addBuffVfx,
    clearAllPromises,
  }
}
