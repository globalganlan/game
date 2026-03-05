/**
 * useCombatPower — 戰力追蹤 Hook
 *
 * 監聽 formation/heroInstances/equipment 變化，自動重算並觸發飛行動畫。
 *
 * 對應 Spec: .ai/specs/combat-power.md v0.1
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { FinalStats } from '../domain/types'
import type { HeroInstanceData, EquipmentInstance, BaseStats } from '../domain/progressionSystem'
import { getFinalStats } from '../domain/progressionSystem'
import {
  getTeamCombatPower,
  getEnemyTeamPower,
  getComparisonLevel,
  type CombatPowerHeroInput,
  type EnemyStats,
  type ComparisonLevel,
} from '../domain/combatPower'
import type { RawHeroData, SlotHero } from '../types'
import type { HeroInstance } from '../services/saveService'
import { getHeroEquipment, onInventoryChange } from '../services/inventoryService'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface CombatPowerState {
  /** 目前陣型隊伍總 CP */
  currentPower: number
  /** CP 變動差值（有值時觸發飛行動畫，null 表示無動畫） */
  powerDelta: number | null
  /** 敵方隊伍 CP（僅 IDLE 時有值） */
  enemyPower: number
  /** 對比等級 */
  comparison: ComparisonLevel
}

/* ════════════════════════════════════
   Helper: 從 save 資料建構 CP 輸入
   ════════════════════════════════════ */

function buildHeroCPInputs(
  formation: (string | null)[],
  heroInstances: HeroInstance[],
  heroesList: RawHeroData[],
): CombatPowerHeroInput[] {
  const inputs: CombatPowerHeroInput[] = []
  for (const instanceId of formation) {
    if (!instanceId) continue
    // instanceId 在 formation 中可能是 heroId string 或 instanceId
    const hero = heroInstances.find(h => h.instanceId === instanceId || String(h.heroId) === instanceId)
    if (!hero) continue
    const base = heroesList.find(h => {
      const hid = Number(h.HeroID ?? h.id ?? 0)
      return hid === Number(hero.heroId)
    })
    if (!base) continue

    const baseStats: BaseStats = {
      HP: Number(base.HP ?? 100),
      ATK: Number(base.ATK ?? 10),
      DEF: Number((base as Record<string, unknown>).DEF ?? 5),
      SPD: Number(base.Speed ?? base.SPD ?? base.SPEED ?? base.AGI ?? 100),
      CritRate: Number((base as Record<string, unknown>).CritRate ?? 5),
      CritDmg: Number((base as Record<string, unknown>).CritDmg ?? 50),
    }

    const rarity = Number((base as Record<string, unknown>).Rarity ?? 3)

    // 建構 HeroInstanceData（裝備從 inventoryService 讀取）
    const heroData: HeroInstanceData = {
      heroId: Number(hero.heroId),
      level: hero.level ?? 1,
      exp: hero.exp ?? 0,
      ascension: hero.ascension ?? 0,
      stars: hero.stars ?? 1,
      equipment: getHeroEquipment(hero.instanceId),
    }

    const finalStats = getFinalStats(baseStats, heroData, rarity)
    inputs.push({
      finalStats,
      stars: heroData.stars,
      equipment: heroData.equipment,
    })
  }
  return inputs
}

/* ════════════════════════════════════
   Helper: 從 enemySlots 建構 EnemyStats
   ════════════════════════════════════ */

function buildEnemyStatsFromSlots(enemySlots: (SlotHero | null)[]): EnemyStats[] {
  const result: EnemyStats[] = []
  for (const slot of enemySlots) {
    if (!slot) continue
    result.push({
      hp: Number(slot.HP ?? slot.currentHP ?? 100),
      atk: Number(slot.ATK ?? 10),
      def: Number((slot as Record<string, unknown>).DEF ?? 10),
      speed: Number(slot.Speed ?? (slot as Record<string, unknown>).SPD ?? (slot as Record<string, unknown>).SPEED ?? 100),
      critRate: Number((slot as Record<string, unknown>).CritRate ?? 5),
      critDmg: Number((slot as Record<string, unknown>).CritDmg ?? 50),
    })
  }
  return result
}

/* ════════════════════════════════════
   Hook
   ════════════════════════════════════ */

export function useCombatPower(
  formation: (string | null)[],
  heroInstances: HeroInstance[],
  heroesList: RawHeroData[],
  enemySlots: (SlotHero | null)[],
): CombatPowerState {
  const prevPowerRef = useRef<number>(0)
  const [currentPower, setCurrentPower] = useState(0)
  const [powerDelta, setPowerDelta] = useState<number | null>(null)
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 訂閱背包變化（裝備穿脫/強化時即時觸發 CP 重算）
  const [invTick, setInvTick] = useState(0)
  useEffect(() => {
    const unsub = onInventoryChange(() => setInvTick(t => t + 1))
    return unsub
  }, [])

  // 我方 CP
  const formationKey = formation.join(',')
  const heroKey = heroInstances.map(h => {
    const eq = getHeroEquipment(h.instanceId)
    const eqKey = eq.map(e => `${e.equipId}:${e.enhanceLevel}`).join(',')
    return `${h.heroId}:${h.level}:${h.ascension}:${h.stars}:${eqKey}`
  }).join('|')

  useEffect(() => {
    if (heroesList.length === 0) return

    const inputs = buildHeroCPInputs(formation, heroInstances, heroesList)
    const newPower = getTeamCombatPower(inputs)

    const delta = newPower - prevPowerRef.current
    if (prevPowerRef.current > 0 && delta !== 0) {
      // 清除上一次 timer（合併快速連續變化）
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current)
      setPowerDelta(delta)
      deltaTimerRef.current = setTimeout(() => {
        setPowerDelta(null)
        deltaTimerRef.current = null
      }, 1500)
    }

    prevPowerRef.current = newPower
    setCurrentPower(newPower)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formationKey, heroKey, heroesList, invTick])

  // 敵方 CP
  const enemyPower = useMemo(() => {
    const stats = buildEnemyStatsFromSlots(enemySlots)
    return getEnemyTeamPower(stats)
  }, [enemySlots])

  // 對比
  const comparison = useMemo(
    () => getComparisonLevel(currentPower, enemyPower),
    [currentPower, enemyPower],
  )

  return { currentPower, powerDelta, enemyPower, comparison }
}
