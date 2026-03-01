/**
 * combatPower — 戰力系統 Domain 邏輯
 *
 * 六維加權計算英雄 CP、隊伍 CP、敵方 CP
 *
 * 對應 Spec: specs/combat-power.md v0.1
 */

import type { FinalStats } from './types'
import type { HeroInstanceData, EquipmentInstance } from './progressionSystem'
import { STAR_PASSIVE_SLOTS, getActiveSetBonuses } from './progressionSystem'

/* ════════════════════════════════════
   權重常數
   ════════════════════════════════════ */

export const CP_WEIGHTS = {
  HP: 0.5,
  ATK: 3.0,
  DEF: 2.5,
  SPD: 8.0,
  CritRate: 5.0,
  CritDmg: 2.0,
} as const

/** 大招固定 CP 加成 */
export const ULTIMATE_POWER_BASE = 100
/** 每個已解鎖被動技能 CP 加成 */
export const PASSIVE_POWER_EACH = 50
/** 2 件套 CP 加成 */
export const SET_2PC_POWER = 80
/** 4 件套 CP 加成（含 2 件套） */
export const SET_4PC_POWER = 200

/* ════════════════════════════════════
   基礎六維 CP
   ════════════════════════════════════ */

function getBaseStatPower(stats: FinalStats): number {
  return (
    stats.HP * CP_WEIGHTS.HP +
    stats.ATK * CP_WEIGHTS.ATK +
    stats.DEF * CP_WEIGHTS.DEF +
    stats.SPD * CP_WEIGHTS.SPD +
    stats.CritRate * CP_WEIGHTS.CritRate +
    stats.CritDmg * CP_WEIGHTS.CritDmg
  )
}

/* ════════════════════════════════════
   技能加成
   ════════════════════════════════════ */

export function getSkillPowerBonus(stars: number): number {
  let bonus = ULTIMATE_POWER_BASE
  const passiveSlots = STAR_PASSIVE_SLOTS[stars] ?? 0
  bonus += passiveSlots * PASSIVE_POWER_EACH
  return bonus
}

/* ════════════════════════════════════
   套裝加成
   ════════════════════════════════════ */

export function getSetBonusPower(equipment: EquipmentInstance[]): number {
  const activeSets = getActiveSetBonuses(equipment)
  let bonus = 0
  for (const _set of activeSets) {
    // 每個啟用的套裝效果加分（requiredCount ≥ 4 用高值，≥ 2 用低值）
    if (_set.requiredCount >= 4) {
      bonus += SET_4PC_POWER
    } else {
      bonus += SET_2PC_POWER
    }
  }
  return bonus
}

/* ════════════════════════════════════
   單英雄 CP
   ════════════════════════════════════ */

/** 計算單一英雄戰力 */
export function getHeroCombatPower(
  finalStats: FinalStats,
  stars: number,
  equipment: EquipmentInstance[] = [],
): number {
  const basePower = getBaseStatPower(finalStats)
  const skillBonus = getSkillPowerBonus(stars)
  const setBonus = getSetBonusPower(equipment)
  return Math.floor(basePower + skillBonus + setBonus)
}

/* ════════════════════════════════════
   隊伍 CP（通用）
   ════════════════════════════════════ */

export interface CombatPowerHeroInput {
  finalStats: FinalStats
  stars: number
  equipment: EquipmentInstance[]
}

/** 計算隊伍總戰力 */
export function getTeamCombatPower(heroes: CombatPowerHeroInput[]): number {
  let total = 0
  for (const h of heroes) {
    total += getHeroCombatPower(h.finalStats, h.stars, h.equipment)
  }
  return total
}

/* ════════════════════════════════════
   敵方戰力估算
   ════════════════════════════════════ */

export interface EnemyStats {
  hp: number
  atk: number
  def: number
  speed: number
  critRate: number
  critDmg: number
}

/** 從 SlotHero 數值估算敵方陣容 CP */
export function getEnemyTeamPower(enemies: EnemyStats[]): number {
  let total = 0
  for (const e of enemies) {
    total += Math.floor(
      e.hp * CP_WEIGHTS.HP +
      e.atk * CP_WEIGHTS.ATK +
      e.def * CP_WEIGHTS.DEF +
      e.speed * CP_WEIGHTS.SPD +
      e.critRate * CP_WEIGHTS.CritRate +
      e.critDmg * CP_WEIGHTS.CritDmg
    )
  }
  return total
}

/* ════════════════════════════════════
   對比文字提示
   ════════════════════════════════════ */

export type ComparisonLevel = 'crush' | 'advantage' | 'even' | 'disadvantage' | 'danger'

export function getComparisonLevel(myPower: number, enemyPower: number): ComparisonLevel {
  if (enemyPower <= 0) return 'crush'
  const ratio = myPower / enemyPower
  if (ratio >= 1.5) return 'crush'
  if (ratio >= 1.2) return 'advantage'
  if (ratio >= 0.83) return 'even'        // 1/1.2 ≈ 0.83
  if (ratio >= 0.67) return 'disadvantage' // 1/1.5 ≈ 0.67
  return 'danger'
}

export const COMPARISON_TEXT: Record<ComparisonLevel, string> = {
  crush: '碾壓！',
  advantage: '優勢',
  even: '勢均力敵',
  disadvantage: '劣勢',
  danger: '危險！',
}

export const COMPARISON_COLOR: Record<ComparisonLevel, string> = {
  crush: '#4ade80',
  advantage: '#86efac',
  even: '#e2e8f0',
  disadvantage: '#fb923c',
  danger: '#f87171',
}
