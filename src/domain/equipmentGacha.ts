/**
 * equipmentGacha — 裝備抽卡 Domain 邏輯
 *
 * 純函式，零 React 依賴。
 * 金幣池（SSR 2%）/ 鑽石池（SSR 8%），十連保底 SR+，無保底計數。
 *
 * 對應 Spec: .ai/specs/gacha.md §6
 */

import type { EquipmentInstance, Rarity, EquipmentSlot, SubStat } from './progressionSystem'
import { EQUIPMENT_SUB_STAT_COUNT, randomSubStats } from './progressionSystem'

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

/** 金幣池費用 */
export const EQUIP_GOLD_SINGLE = 10_000
export const EQUIP_GOLD_TEN = 90_000

/** 鑽石池費用 */
export const EQUIP_DIAMOND_SINGLE = 200
export const EQUIP_DIAMOND_TEN = 2_000

/** 8 套裝 */
export const SET_IDS = [
  'berserker', 'ironwall', 'gale', 'vampire',
  'critical', 'lethal', 'vitality', 'counter',
] as const

/** 4 部位 */
export const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'ring', 'boots']

/** 部位 → 主屬性 */
export const SLOT_MAIN_STAT: Record<EquipmentSlot, string> = {
  weapon: 'ATK',
  armor: 'HP',
  ring: 'DEF',
  boots: 'SPD',
}

/** 部位 × 稀有度 → 主屬性基礎值 */
export const MAIN_STAT_BASE: Record<EquipmentSlot, Record<Rarity, number>> = {
  weapon: { N: 30, R: 50, SR: 80, SSR: 120 },
  armor:  { N: 200, R: 350, SR: 550, SSR: 800 },
  ring:   { N: 15, R: 25, SR: 40, SSR: 60 },
  boots:  { N: 5, R: 8, SR: 12, SSR: 18 },
}

/** 套裝中文名稱 */
export const SET_NAMES: Record<string, string> = {
  berserker: '狂戰士',
  ironwall: '鐵壁',
  gale: '疾風',
  vampire: '吸血',
  critical: '暴擊',
  lethal: '致命',
  vitality: '生命',
  counter: '反擊',
}

/** 部位中文名稱 */
export const SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: '武器',
  armor: '護甲',
  ring: '戒指',
  boots: '鞋子',
}

/* ════════════════════════════════════
   機率表
   ════════════════════════════════════ */

export type EquipPoolType = 'gold' | 'diamond'

interface PoolRates {
  SSR: number
  SR: number
  R: number
  N: number
}

const POOL_RATES: Record<EquipPoolType, PoolRates> = {
  gold:    { SSR: 0.02, SR: 0.13, R: 0.35, N: 0.50 },
  diamond: { SSR: 0.08, SR: 0.20, R: 0.40, N: 0.32 },
}

export function getEquipPoolRates(pool: EquipPoolType): PoolRates {
  return POOL_RATES[pool]
}

/* ════════════════════════════════════
   稀有度抽選
   ════════════════════════════════════ */

function rollRarity(pool: EquipPoolType, rng = Math.random): Rarity {
  const rates = POOL_RATES[pool]
  const roll = rng()
  if (roll < rates.SSR) return 'SSR'
  if (roll < rates.SSR + rates.SR) return 'SR'
  if (roll < rates.SSR + rates.SR + rates.R) return 'R'
  return 'N'
}

/* ════════════════════════════════════
   裝備生成
   ════════════════════════════════════ */

/** 生成一件隨機裝備 */
export function generateEquipment(rarity: Rarity, rng = Math.random): EquipmentInstance {
  const setId = SET_IDS[Math.floor(rng() * SET_IDS.length)]
  const slot = SLOTS[Math.floor(rng() * SLOTS.length)]
  const mainStat = SLOT_MAIN_STAT[slot]
  const mainStatValue = MAIN_STAT_BASE[slot][rarity]
  const subStatCount = EQUIPMENT_SUB_STAT_COUNT[rarity]
  const subStats: SubStat[] = randomSubStats(subStatCount, mainStat, rng)

  const now = Date.now()
  const rand = Math.floor(rng() * 0xFFFF).toString(16).padStart(4, '0')

  return {
    equipId: `EQ_${now}_${rand}`,
    templateId: `eq_${setId}_${slot}_${rarity}`,
    setId,
    slot,
    rarity,
    mainStat,
    mainStatValue,
    enhanceLevel: 0,
    subStats,
    equippedBy: '',
    locked: false,
    obtainedAt: new Date().toISOString(),
  }
}

/* ════════════════════════════════════
   單抽 / 十連
   ════════════════════════════════════ */

export interface EquipPullResult {
  equipment: EquipmentInstance
  isGuaranteed: boolean   // 十連保底升級
}

/** 單抽一件裝備 */
export function equipSinglePull(pool: EquipPoolType, rng = Math.random): EquipPullResult {
  const rarity = rollRarity(pool, rng)
  return { equipment: generateEquipment(rarity, rng), isGuaranteed: false }
}

/** 十連抽（保底至少 1 件 SR+） */
export function equipTenPull(pool: EquipPoolType, rng = Math.random): EquipPullResult[] {
  const results: EquipPullResult[] = []
  let hasSROrAbove = false

  for (let i = 0; i < 10; i++) {
    const rarity = rollRarity(pool, rng)
    if (rarity === 'SR' || rarity === 'SSR') hasSROrAbove = true
    results.push({ equipment: generateEquipment(rarity, rng), isGuaranteed: false })
  }

  // 十連保底 SR+：若 10 件全是 R 或 N，將最後一件 N/R 升級為 SR
  if (!hasSROrAbove) {
    // 找最後一件 N/R 升為 SR
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].equipment.rarity === 'N' || results[i].equipment.rarity === 'R') {
        const upgraded = generateEquipment('SR', rng)
        // 保留原套裝和部位的風味
        results[i] = { equipment: upgraded, isGuaranteed: true }
        break
      }
    }
  }

  return results
}

/* ════════════════════════════════════
   費用計算
   ════════════════════════════════════ */

export function getEquipPullCost(pool: EquipPoolType, count: 1 | 10): { type: 'gold' | 'diamond'; amount: number } {
  if (pool === 'gold') {
    return { type: 'gold', amount: count === 10 ? EQUIP_GOLD_TEN : EQUIP_GOLD_SINGLE }
  }
  return { type: 'diamond', amount: count === 10 ? EQUIP_DIAMOND_TEN : EQUIP_DIAMOND_SINGLE }
}

/** 裝備顯示名稱 */
export function getEquipDisplayName(eq: EquipmentInstance): string {
  const setName = SET_NAMES[eq.setId] || eq.setId
  const slotName = SLOT_NAMES[eq.slot as EquipmentSlot] || eq.slot
  return `${setName}${slotName}`
}

/* ════════════════════════════════════
   裝備寶箱
   ════════════════════════════════════ */

/** 寶箱機率表（比金幣池稍好，因為取得成本高） */
const CHEST_RATES: PoolRates = { SSR: 0.05, SR: 0.20, R: 0.40, N: 0.35 }

export function getChestRates(): PoolRates { return CHEST_RATES }

/** 打開一個裝備寶箱，回傳 1 件裝備 */
export function openEquipmentChest(rng = Math.random): EquipmentInstance {
  const roll = rng()
  let rarity: Rarity
  if (roll < CHEST_RATES.SSR) rarity = 'SSR'
  else if (roll < CHEST_RATES.SSR + CHEST_RATES.SR) rarity = 'SR'
  else if (roll < CHEST_RATES.SSR + CHEST_RATES.SR + CHEST_RATES.R) rarity = 'R'
  else rarity = 'N'
  return generateEquipment(rarity, rng)
}
