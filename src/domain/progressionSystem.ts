/**
 * progressionSystem — 養成系統 Domain 邏輯
 *
 * 包含：等級成長、突破、星級、裝備數值、套裝效果、最終數值結算
 *
 * 對應 Spec: specs/progression.md v0.2
 */

import type { FinalStats } from './types'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export type EquipmentSlot = 'weapon' | 'armor' | 'ring' | 'boots'
export type Rarity = 'N' | 'R' | 'SR' | 'SSR'

export interface SubStat {
  stat: string        // 'ATK' | 'HP' | 'DEF' | 'SPD' | 'CritRate' | 'CritDmg'
  value: number
  isPercent: boolean  // true = 百分比加成, false = 固定值
}

export interface EquipmentInstance {
  equipId: string
  templateId: string
  setId: string
  slot: EquipmentSlot
  rarity: Rarity
  mainStat: string
  mainStatValue: number
  enhanceLevel: number
  subStats: SubStat[]
  equippedBy: string       // heroInstanceId or ''
  locked: boolean
  obtainedAt: string
}

export interface HeroInstanceData {
  heroId: number
  level: number
  exp: number
  ascension: number
  stars: number
  equipment: EquipmentInstance[]   // 已裝備的 (最多4件)
}

export interface BaseStats {
  HP: number
  ATK: number
  DEF: number
  SPD: number
  CritRate: number
  CritDmg: number
}

export interface AscensionCost {
  fragments: number    // 碎片數
  classStones: number  // 職業石數
  gold: number
}

export interface StarUpCost {
  fragments: number
}

export interface EquipmentSetBonus {
  setId: string
  name: string
  requiredCount: number  // 2
  bonusType: string      // 'ATK_percent' | 'DEF_percent' | 'HP_percent' | 'SPD_flat' | 'CritRate_percent' | 'CritDmg_percent' | 'lifesteal' | 'counter'
  bonusValue: number
}

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

/** 突破階段等級上限 */
export const ASCENSION_LEVEL_CAP: Record<number, number> = {
  0: 20,
  1: 30,
  2: 40,
  3: 50,
  4: 60,
  5: 60,
}

/** 突破屬性加成（乘算） */
export const ASCENSION_MULTIPLIER: Record<number, number> = {
  0: 1.0,
  1: 1.05,
  2: 1.10,
  3: 1.15,
  4: 1.20,
  5: 1.30,
}

/** 星級屬性加成（乘算） */
export const STAR_MULTIPLIER: Record<number, number> = {
  1: 1.0,
  2: 1.05,
  3: 1.10,
  4: 1.15,
  5: 1.20,
  6: 1.30,
}

/** 星級解鎖被動數量 */
export const STAR_PASSIVE_SLOTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 3,
  6: 4,
}

/** 升星所需碎片 */
export const STAR_UP_COST: Record<number, number> = {
  // from → to: fragments needed
  1: 10,    // ★1→★2
  2: 20,    // ★2→★3
  3: 40,    // ★3→★4
  4: 80,    // ★4→★5
  5: 160,   // ★5→★6
}

/** 突破素材消耗 */
export const ASCENSION_COSTS: Record<number, AscensionCost> = {
  0: { fragments: 5,  classStones: 3,  gold: 5000 },
  1: { fragments: 10, classStones: 8,  gold: 15000 },
  2: { fragments: 20, classStones: 15, gold: 40000 },
  3: { fragments: 40, classStones: 25, gold: 80000 },
  4: { fragments: 60, classStones: 40, gold: 150000 },
}

/** 裝備強化等級上限（依稀有度） */
export const EQUIPMENT_MAX_ENHANCE: Record<Rarity, number> = {
  N: 5,
  R: 10,
  SR: 15,
  SSR: 20,
}

/** 裝備副屬性條數（依稀有度） */
export const EQUIPMENT_SUB_STAT_COUNT: Record<Rarity, number> = {
  N: 0,
  R: 1,
  SR: 2,
  SSR: 3,
}

/** 裝備容量 */
export const EQUIPMENT_SLOT_BASE = 200
export const EQUIPMENT_SLOT_EXPAND = 50
export const EQUIPMENT_SLOT_COST = 100   // 鑽石
export const EQUIPMENT_SLOT_MAX = 500

/** 初始星級（依稀有度） */
export const RARITY_INITIAL_STARS: Record<number, number> = {
  1: 1,  // ★1 rarity → 初始 ★1
  2: 1,  // ★2 rarity → 初始 ★1
  3: 2,  // ★3 rarity → 初始 ★2
  4: 3,  // ★4 rarity → 初始 ★3
}

/** 套裝效果定義 */
export const EQUIPMENT_SETS: EquipmentSetBonus[] = [
  { setId: 'berserker',  name: '狂戰士', requiredCount: 2, bonusType: 'ATK_percent',     bonusValue: 15 },
  { setId: 'ironwall',   name: '鐵壁',   requiredCount: 2, bonusType: 'DEF_percent',     bonusValue: 20 },
  { setId: 'gale',       name: '疾風',   requiredCount: 2, bonusType: 'SPD_flat',        bonusValue: 15 },
  { setId: 'vampire',    name: '吸血',   requiredCount: 2, bonusType: 'lifesteal',       bonusValue: 12 },
  { setId: 'critical',   name: '暴擊',   requiredCount: 2, bonusType: 'CritRate_percent', bonusValue: 12 },
  { setId: 'lethal',     name: '致命',   requiredCount: 2, bonusType: 'CritDmg_percent',  bonusValue: 25 },
  { setId: 'vitality',   name: '生命',   requiredCount: 2, bonusType: 'HP_percent',       bonusValue: 20 },
  { setId: 'counter',    name: '反擊',   requiredCount: 2, bonusType: 'counter',          bonusValue: 20 },
]

/** 副屬性隨機池 */
export const SUB_STAT_POOL: { stat: string; minFlat: number; maxFlat: number; minPct: number; maxPct: number; canBePercent: boolean }[] = [
  { stat: 'ATK',      minFlat: 5,  maxFlat: 30,  minPct: 3,  maxPct: 15, canBePercent: true },
  { stat: 'HP',       minFlat: 50, maxFlat: 300, minPct: 3,  maxPct: 15, canBePercent: true },
  { stat: 'DEF',      minFlat: 3,  maxFlat: 20,  minPct: 3,  maxPct: 15, canBePercent: true },
  { stat: 'SPD',      minFlat: 1,  maxFlat: 8,   minPct: 0,  maxPct: 0,  canBePercent: false },
  { stat: 'CritRate', minFlat: 0,  maxFlat: 0,   minPct: 2,  maxPct: 10, canBePercent: true },
  { stat: 'CritDmg',  minFlat: 0,  maxFlat: 0,   minPct: 4,  maxPct: 20, canBePercent: true },
]

/* ════════════════════════════════════
   等級系統
   ════════════════════════════════════ */

/** 升級所需經驗值 */
export function expToNextLevel(level: number): number {
  const base = 100
  const tier = Math.floor((level - 1) / 10) // 0-5
  return Math.floor(base * Math.pow(1.8, tier) * (1 + (level % 10) * 0.15))
}

/** 某等級到下一級的累計所需經驗 */
export function totalExpForLevel(targetLevel: number): number {
  let total = 0
  for (let lvl = 1; lvl < targetLevel; lvl++) {
    total += expToNextLevel(lvl)
  }
  return total
}

/** 等級數值成長（每級 +4% of base） */
export function getStatAtLevel(baseStat: number, level: number): number {
  return Math.floor(baseStat * (1 + (level - 1) * 0.04))
}

/** 取得等級上限 */
export function getLevelCap(ascension: number): number {
  return ASCENSION_LEVEL_CAP[ascension] ?? 20
}

/**
 * 計算消耗經驗素材後的結果
 * @returns 新等級、新經驗值、消耗了多少素材
 */
export function consumeExpMaterials(
  currentLevel: number,
  currentExp: number,
  levelCap: number,
  expToAdd: number,
): { level: number; exp: number; expConsumed: number } {
  let level = currentLevel
  let exp = currentExp
  let total = expToAdd

  while (total > 0 && level < levelCap) {
    const needed = expToNextLevel(level) - exp
    if (total >= needed) {
      total -= needed
      exp = 0
      level++
    } else {
      exp += total
      total = 0
    }
  }

  // If we hit level cap, remaining exp is wasted
  if (level >= levelCap) {
    exp = 0
  }

  return {
    level,
    exp,
    expConsumed: expToAdd - total,
  }
}

/* ════════════════════════════════════
   突破系統
   ════════════════════════════════════ */

/** 取得突破加成乘數 */
export function getAscensionMultiplier(ascension: number): number {
  return ASCENSION_MULTIPLIER[ascension] ?? 1.0
}

/** 取得突破消耗 */
export function getAscensionCost(currentAscension: number): AscensionCost | null {
  return ASCENSION_COSTS[currentAscension] ?? null
}

/** 檢查是否可以突破 */
export function canAscend(level: number, ascension: number): boolean {
  if (ascension >= 5) return false
  const requiredLevel = getLevelCap(ascension)
  return level >= requiredLevel
}

/* ════════════════════════════════════
   星級系統
   ════════════════════════════════════ */

/** 取得星級屬性乘數 */
export function getStarMultiplier(stars: number): number {
  return STAR_MULTIPLIER[stars] ?? 1.0
}

/** 取得星級可用被動數 */
export function getStarPassiveSlots(stars: number): number {
  return STAR_PASSIVE_SLOTS[stars] ?? 1
}

/** 取得升星所需碎片 */
export function getStarUpCost(currentStars: number): number {
  return STAR_UP_COST[currentStars] ?? Infinity
}

/** 檢查是否可以升星 */
export function canStarUp(currentStars: number, fragmentsOwned: number): boolean {
  if (currentStars >= 6) return false
  return fragmentsOwned >= getStarUpCost(currentStars)
}

/** 取得初始星級 */
export function getInitialStars(rarity: number): number {
  return RARITY_INITIAL_STARS[rarity] ?? 1
}

/* ════════════════════════════════════
   裝備系統
   ════════════════════════════════════ */

/** 強化後主屬性值（每等級 +10% of base） */
export function enhancedMainStat(baseValue: number, enhanceLevel: number): number {
  return Math.floor(baseValue * (1 + enhanceLevel * 0.1))
}

/** 裝備強化最大等級 */
export function getMaxEnhanceLevel(rarity: Rarity): number {
  return EQUIPMENT_MAX_ENHANCE[rarity]
}

/** 強化費用（金幣） */
export function getEnhanceCost(currentLevel: number, rarity: Rarity): number {
  const baseCost: Record<Rarity, number> = { N: 100, R: 200, SR: 500, SSR: 1000 }
  return Math.floor(baseCost[rarity] * (1 + currentLevel * 0.5))
}

/** 計算裝備容量上限 */
export function getEquipmentCapacity(expandCount: number): number {
  return Math.min(EQUIPMENT_SLOT_MAX, EQUIPMENT_SLOT_BASE + expandCount * EQUIPMENT_SLOT_EXPAND)
}

/** 擴容所需鑽石 */
export function getExpandCost(): number {
  return EQUIPMENT_SLOT_COST
}

/** 生成隨機副屬性（用於裝備掉落/鍛造） */
export function randomSubStats(count: number, mainStat: string, rng = Math.random): SubStat[] {
  const available = SUB_STAT_POOL.filter(s => s.stat !== mainStat)
  const result: SubStat[] = []
  const used = new Set<string>()

  for (let i = 0; i < count && available.length > 0; i++) {
    // Pick a stat not yet used
    const remaining = available.filter(s => !used.has(s.stat))
    if (remaining.length === 0) break
    const pick = remaining[Math.floor(rng() * remaining.length)]
    used.add(pick.stat)

    const isPercent = pick.canBePercent && (pick.minFlat === 0 || rng() > 0.5)
    const min = isPercent ? pick.minPct : pick.minFlat
    const max = isPercent ? pick.maxPct : pick.maxFlat
    const value = Math.floor(min + rng() * (max - min + 1))

    result.push({ stat: pick.stat, value: Math.max(min, value), isPercent })
  }

  return result
}

/* ════════════════════════════════════
   套裝效果
   ════════════════════════════════════ */

/** 取得套裝定義 */
export function getSetBonus(setId: string): EquipmentSetBonus | undefined {
  return EQUIPMENT_SETS.find(s => s.setId === setId)
}

/** 計算已激活的套裝效果 */
export function getActiveSetBonuses(equipment: EquipmentInstance[]): EquipmentSetBonus[] {
  const setCounts: Record<string, number> = {}
  for (const eq of equipment) {
    if (eq.setId) {
      setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1
    }
  }
  const active: EquipmentSetBonus[] = []
  for (const [setId, count] of Object.entries(setCounts)) {
    const bonus = getSetBonus(setId)
    if (bonus && count >= bonus.requiredCount) {
      active.push(bonus)
    }
  }
  return active
}

/* ════════════════════════════════════
   最終數值結算
   ════════════════════════════════════ */

/** 結算英雄最終數值（等級+突破+星級+裝備+套裝） */
export function getFinalStats(base: BaseStats, hero: HeroInstanceData): FinalStats {
  const levelMult = 1 + (hero.level - 1) * 0.04
  const ascMult = getAscensionMultiplier(hero.ascension)
  const starMult = getStarMultiplier(hero.stars)

  // Step 1: base × level × ascension × star（HP/ATK/DEF 受影響，SPD/Crit 不受等級影響）
  const stats: FinalStats = {
    HP:       Math.floor(base.HP * levelMult * ascMult * starMult),
    ATK:      Math.floor(base.ATK * levelMult * ascMult * starMult),
    DEF:      Math.floor(base.DEF * levelMult * ascMult * starMult),
    SPD:      base.SPD,
    CritRate: base.CritRate,
    CritDmg:  base.CritDmg,
  }

  // Step 2: Equipment flat stats
  for (const eq of hero.equipment) {
    const mainVal = enhancedMainStat(eq.mainStatValue, eq.enhanceLevel)
    addStatFlat(stats, eq.mainStat, mainVal)

    for (const sub of eq.subStats) {
      if (!sub.isPercent) {
        addStatFlat(stats, sub.stat, sub.value)
      }
    }
  }

  // Step 3: Equipment percent stats
  const pctBonuses: Record<string, number> = {}
  for (const eq of hero.equipment) {
    for (const sub of eq.subStats) {
      if (sub.isPercent) {
        pctBonuses[sub.stat] = (pctBonuses[sub.stat] || 0) + sub.value
      }
    }
  }

  // Step 4: Set bonuses (percent-based)
  const activeSets = getActiveSetBonuses(hero.equipment)
  for (const set of activeSets) {
    if (set.bonusType.endsWith('_percent')) {
      const statName = set.bonusType.replace('_percent', '')
      pctBonuses[statName] = (pctBonuses[statName] || 0) + set.bonusValue
    } else if (set.bonusType === 'SPD_flat') {
      stats.SPD += set.bonusValue
    }
    // lifesteal / counter are handled in battle engine, not stats
  }

  // Apply percent bonuses
  for (const [stat, pct] of Object.entries(pctBonuses)) {
    applyStatPercent(stats, stat, pct)
  }

  return stats
}

/* ════════════════════════════════════
   內部工具
   ════════════════════════════════════ */

function addStatFlat(stats: FinalStats, stat: string, value: number): void {
  switch (stat) {
    case 'ATK':      stats.ATK      += value; break
    case 'HP':       stats.HP       += value; break
    case 'DEF':      stats.DEF      += value; break
    case 'SPD':      stats.SPD      += value; break
    case 'CritRate': stats.CritRate += value; break
    case 'CritDmg':  stats.CritDmg  += value; break
  }
}

function applyStatPercent(stats: FinalStats, stat: string, pct: number): void {
  const mult = pct / 100
  switch (stat) {
    case 'ATK':      stats.ATK      = Math.floor(stats.ATK * (1 + mult)); break
    case 'HP':       stats.HP       = Math.floor(stats.HP * (1 + mult)); break
    case 'DEF':      stats.DEF      = Math.floor(stats.DEF * (1 + mult)); break
    case 'SPD':      stats.SPD      = Math.floor(stats.SPD * (1 + mult)); break
    case 'CritRate': stats.CritRate = Math.floor(stats.CritRate * (1 + mult)); break
    case 'CritDmg':  stats.CritDmg  = Math.floor(stats.CritDmg * (1 + mult)); break
  }
}
