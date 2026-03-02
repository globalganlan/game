/**
 * useSlots — 英雄槽位 (6 格 × 雙方) 狀態管理
 *
 * 從 App.tsx 抽出，管理 playerSlots / enemySlots + ref 同步 + 陣型恢復。
 */
import { useState, useRef, useCallback } from 'react'
import type { SlotHero, RawHeroData } from '../types'
import { EMPTY_SLOTS } from '../game/constants'
import { normalizeModelId } from '../game/helpers'
import { getSaveState } from '../services/saveService'

export function useSlots(heroesListRef: React.MutableRefObject<RawHeroData[]>) {
  const [playerSlots, setPlayerSlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const [enemySlots, setEnemySlots] = useState<(SlotHero | null)[]>(EMPTY_SLOTS)
  const pSlotsRef = useRef(EMPTY_SLOTS)
  const eSlotsRef = useRef(EMPTY_SLOTS)
  /** 戰鬥前玩家陣容快照（用於重試時恢復） */
  const preBattlePlayerSlotsRef = useRef<(SlotHero | null)[]>(EMPTY_SLOTS)
  /** 是否已從存檔恢復陣型（避免空陣型覆蓋） */
  const formationRestoredRef = useRef(false)

  /** 同步更新 state + ref（player） */
  const updatePlayerSlots = useCallback(
    (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => {
      setPlayerSlots((prev) => {
        const next = updater(prev)
        pSlotsRef.current = next
        return next
      })
    },
    [],
  )

  /** 同步更新 state + ref（enemy） */
  const updateEnemySlots = useCallback(
    (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => {
      setEnemySlots((prev) => {
        const next = updater(prev)
        eSlotsRef.current = next
        return next
      })
    },
    [],
  )

  /** 從存檔恢復上陣陣型到 playerSlots（若目前為空） */
  const restoreFormationFromSave = useCallback(() => {
    // 只在 playerSlots 全空時才恢復
    if (pSlotsRef.current.some(Boolean)) return
    try {
      const saveState = getSaveState()
      const savedFormation = saveState?.save.formation
      if (!savedFormation || !Array.isArray(savedFormation)) return
      const data = heroesListRef.current
      if (!data.length) return
      const heroMap = new Map<string, { hero: RawHeroData; idx: number }>()
      data.forEach((h, idx) => {
        const hid = String(h.HeroID ?? h.id ?? idx + 1)
        heroMap.set(hid, { hero: h, idx })
      })
      const ownedIds = new Set(
        (saveState?.heroes ?? []).map(h => String(h.heroId)),
      )
      const restored: (SlotHero | null)[] = savedFormation.map((heroId, slot) => {
        if (!heroId) return null
        const hid = String(heroId)
        if (!ownedIds.has(hid)) return null
        const found = heroMap.get(hid)
        if (!found) return null
        const { hero, idx } = found
        const mid = normalizeModelId(hero, idx)
        return {
          ...hero,
          currentHP: (hero.HP ?? 1) as number,
          _uid: `${mid}_player_${slot}`,
          _modelId: mid,
          ModelID: mid,
        }
      })
      if (restored.some(Boolean)) {
        updatePlayerSlots(() => restored)
      }
    } catch (e) {
      console.warn('[formation restore]', e)
    }
  }, [heroesListRef, updatePlayerSlots])

  /** 重置所有槽位到空白狀態（登出時使用） */
  const resetSlots = useCallback(() => {
    setPlayerSlots(EMPTY_SLOTS)
    setEnemySlots(EMPTY_SLOTS)
    pSlotsRef.current = EMPTY_SLOTS
    eSlotsRef.current = EMPTY_SLOTS
    preBattlePlayerSlotsRef.current = EMPTY_SLOTS
    formationRestoredRef.current = false
  }, [])

  return {
    playerSlots,
    enemySlots,
    pSlotsRef,
    eSlotsRef,
    preBattlePlayerSlotsRef,
    formationRestoredRef,
    updatePlayerSlots,
    updateEnemySlots,
    restoreFormationFromSave,
    resetSlots,
  }
}
