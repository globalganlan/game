/**
 * progressionSystem — 養成系統 Domain 邏輯
 *
 * 包含：等級成長、突破、星級、裝備數值、套裝效果、最終數值結算
 *
 * 對應 Spec: .ai/specs/progression.md v0.2
 */

import type { FinalStats } from './types'

/* ════════════════════════════════════
   星級系統核心常數（全域唯一真相來源）
   ════════════════════════════════════ */

/** 星級上限 */
export const MAX_STARS = 10
/** 被動 slot 全滿的星級閾值（超過此值改為提升技能等級） */
export const SKILL_LEVEL_STAR_THRESHOLD = 6
/** 計算技能等級：★1-6 → Lv.1, ★7 → Lv.2, ..., ★10 → Lv.5 */
export function getSkillLevel(stars: number): number {
  return stars > SKILL_LEVEL_STAR_THRESHOLD ? stars - SKILL_LEVEL_STAR_THRESHOLD + 1 : 1
}

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
  requiredCount: number  // 2 or 4
  bonusType: string      // 'ATK_percent' | 'DEF_percent' | 'HP_percent' | 'SPD_flat' | 'CritRate_percent' | 'CritDmg_percent' | 'lifesteal' | 'counter'
  bonusValue: number
}

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

/** 突破階段等級上限（與後端 progression.ts 一致） */
export const ASCENSION_LEVEL_CAP: Record<number, number> = {
  0: 20,
  1: 40,
  2: 60,
  3: 80,
  4: 90,
  5: 100,
}

/** 突破屬性加成（乘算）— ★3 預設，向下相容 */
export const ASCENSION_MULTIPLIER: Record<number, number> = {
  0: 1.0,
  1: 1.05,
  2: 1.10,
  3: 1.15,
  4: 1.20,
  5: 1.30,
}

/** 星級屬性加成（乘算）— ★3 預設，向下相容；★7-10 為技能等級區間 */
export const STAR_MULTIPLIER: Record<number, number> = {  0: 0.90,  1: 1.0,
  2: 1.05,
  3: 1.10,
  4: 1.15,
  5: 1.20,
  6: 1.30,
  7: 1.35,
  8: 1.40,
  9: 1.45,
  10: 1.50,
}

/* ════════════════════════════════════
   稀有度差異化成長（高稀有度 → 高成長）
   ════════════════════════════════════ */

/** 等級成長率：每級 +X% of base（稀有度越高越強） */
export const RARITY_LEVEL_GROWTH: Record<number, number> = {
  1: 0.030,   // ★1：Lv60 → ×2.77
  2: 0.035,   // ★2：Lv60 → ×3.07
  3: 0.040,   // ★3：Lv60 → ×3.36（與舊公式一致）
  4: 0.050,   // ★4：Lv60 → ×3.95
}

/** 突破加成（依稀有度）— ★3 等同 ASCENSION_MULTIPLIER */
export const RARITY_ASC_MULT: Record<number, Record<number, number>> = {
  1: { 0: 1.00, 1: 1.03, 2: 1.06, 3: 1.09, 4: 1.12, 5: 1.18 },
  2: { 0: 1.00, 1: 1.04, 2: 1.08, 3: 1.12, 4: 1.16, 5: 1.24 },
  3: { 0: 1.00, 1: 1.05, 2: 1.10, 3: 1.15, 4: 1.20, 5: 1.30 },
  4: { 0: 1.00, 1: 1.07, 2: 1.14, 3: 1.22, 4: 1.30, 5: 1.42 },
}

/** 星級加成（依稀有度）— ★0 為初始狀態 ×0.90；★7-10 提升技能等級 + 小幅屬性 */
export const RARITY_STAR_MULT: Record<number, Record<number, number>> = {
  1: { 0: 0.90, 1: 1.00, 2: 1.03, 3: 1.06, 4: 1.09, 5: 1.13, 6: 1.18, 7: 1.21, 8: 1.24, 9: 1.27, 10: 1.30 },
  2: { 0: 0.90, 1: 1.00, 2: 1.04, 3: 1.08, 4: 1.12, 5: 1.17, 6: 1.24, 7: 1.28, 8: 1.32, 9: 1.36, 10: 1.40 },
  3: { 0: 0.90, 1: 1.00, 2: 1.05, 3: 1.10, 4: 1.15, 5: 1.20, 6: 1.30, 7: 1.35, 8: 1.40, 9: 1.45, 10: 1.50 },
  4: { 0: 0.90, 1: 1.00, 2: 1.07, 3: 1.14, 4: 1.22, 5: 1.30, 6: 1.42, 7: 1.48, 8: 1.54, 9: 1.60, 10: 1.68 },
}

/** 星級解鎖被動數量（★0 仍給 1 個被動；★7-10 不再增加被動，改為提升技能等級） */
export const STAR_PASSIVE_SLOTS: Record<number, number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 3,
  6: 4,
  7: 4,
  8: 4,
  9: 4,
  10: 4,
}

/** 升星所需碎片 */
export const STAR_UP_COST: Record<number, number> = {
  // from → to: fragments needed
  0: 5,     // ★0→★1（初始狀態升級，移除 -10% 懲罰）
  1: 10,    // ★1→★2
  2: 20,    // ★2→★3
  3: 40,    // ★3→★4
  4: 80,    // ★4→★5
  5: 160,   // ★5→★6
  6: 320,   // ★6→★7（技能等級 Lv.2）
  7: 640,   // ★7→★8（技能等級 Lv.3）
  8: 1280,  // ★8→★9（技能等級 Lv.4）
  9: 2560,  // ★9→★10（技能等級 Lv.5）
}

/** 突破素材消耗（與後端 progression.ts 一致） */
export const ASCENSION_COSTS: Record<number, AscensionCost> = {
  0: { fragments: 10, classStones: 5,  gold: 5000 },
  1: { fragments: 20, classStones: 10, gold: 10000 },
  2: { fragments: 30, classStones: 15, gold: 20000 },
  3: { fragments: 50, classStones: 20, gold: 40000 },
  4: { fragments: 80, classStones: 30, gold: 80000 },
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

/** 初始星級（依稀有度）— 所有英雄從 ★0 開始培養 */
export const RARITY_INITIAL_STARS: Record<number, number> = {
  1: 0,  // N  → 初始 ★0
  2: 0,  // R  → 初始 ★0
  3: 0,  // SR → 初始 ★0
  4: 0,  // SSR→ 初始 ★0
}

/** 套裝效果定義（2pc + 4pc） */
export const EQUIPMENT_SETS: EquipmentSetBonus[] = [
  // 2pc 效果
  { setId: 'berserker',  name: '狂戰士', requiredCount: 2, bonusType: 'ATK_percent',      bonusValue: 15 },
  { setId: 'ironwall',   name: '鐵壁',   requiredCount: 2, bonusType: 'DEF_percent',      bonusValue: 20 },
  { setId: 'gale',       name: '疾風',   requiredCount: 2, bonusType: 'SPD_flat',         bonusValue: 15 },
  { setId: 'vampire',    name: '吸血',   requiredCount: 2, bonusType: 'lifesteal',        bonusValue: 12 },
  { setId: 'critical',   name: '暴擊',   requiredCount: 2, bonusType: 'CritRate_percent',  bonusValue: 12 },
  { setId: 'lethal',     name: '致命',   requiredCount: 2, bonusType: 'CritDmg_percent',   bonusValue: 25 },
  { setId: 'vitality',   name: '生命',   requiredCount: 2, bonusType: 'HP_percent',        bonusValue: 20 },
  { setId: 'counter',    name: '反擊',   requiredCount: 2, bonusType: 'counter',           bonusValue: 20 },
  // 4pc 效果
  { setId: 'berserker',  name: '狂戰士', requiredCount: 4, bonusType: 'CritDmg_percent',   bonusValue: 20 },
  { setId: 'ironwall',   name: '鐵壁',   requiredCount: 4, bonusType: 'HP_percent',        bonusValue: 15 },
  { setId: 'gale',       name: '疾風',   requiredCount: 4, bonusType: 'ATK_percent',       bonusValue: 10 },
  { setId: 'vampire',    name: '吸血',   requiredCount: 4, bonusType: 'lifesteal',         bonusValue: 8 },
  { setId: 'critical',   name: '暴擊',   requiredCount: 4, bonusType: 'CritDmg_percent',   bonusValue: 20 },
  { setId: 'lethal',     name: '致命',   requiredCount: 4, bonusType: 'ATK_percent',       bonusValue: 15 },
  { setId: 'vitality',   name: '生命',   requiredCount: 4, bonusType: 'DEF_percent',       bonusValue: 15 },
  { setId: 'counter',    name: '反擊',   requiredCount: 4, bonusType: 'counter',            bonusValue: 15 },
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

/** 升級所需經驗值（與後端 progression.ts expForLevel 一致） */
export function expToNextLevel(level: number): number {
  return level * 100
}

/** 某等級到下一級的累計所需經驗 */
export function totalExpForLevel(targetLevel: number): number {
  let total = 0
  for (let lvl = 1; lvl < targetLevel; lvl++) {
    total += expToNextLevel(lvl)
  }
  return total
}

/** 等級數值成長（依稀有度差異化：★1=3%/lv, ★2=3.5%, ★3=4%, ★4=5%） */
export function getStatAtLevel(baseStat: number, level: number, rarity: number = 3): number {
  const growth = RARITY_LEVEL_GROWTH[rarity] ?? 0.04
  return Math.floor(baseStat * (1 + (level - 1) * growth))
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

/** 取得突破加成乘數（依稀有度差異化） */
export function getAscensionMultiplier(ascension: number, rarity: number = 3): number {
  return RARITY_ASC_MULT[rarity]?.[ascension] ?? ASCENSION_MULTIPLIER[ascension] ?? 1.0
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

/** 取得星級屬性乘數（依稀有度差異化） */
export function getStarMultiplier(stars: number, rarity: number = 3): number {
  return RARITY_STAR_MULT[rarity]?.[stars] ?? STAR_MULTIPLIER[stars] ?? 1.0
}

/** 取得星級可用被動數 */
export function getStarPassiveSlots(stars: number): number {
  return STAR_PASSIVE_SLOTS[stars] ?? 0
}

/** 取得升星所需碎片 */
export function getStarUpCost(currentStars: number): number {
  return STAR_UP_COST[currentStars] ?? Infinity
}

/** 檢查是否可以升星 */
export function canStarUp(currentStars: number, fragmentsOwned: number): boolean {
  if (currentStars >= MAX_STARS) return false
  return fragmentsOwned >= getStarUpCost(currentStars)
}

/** 取得初始星級 */
export function getInitialStars(rarity: number): number {
  return RARITY_INITIAL_STARS[rarity] ?? 0
}

/* ════════════════════════════════════
   裝備系統
   ════════════════════════════════════ */

/** 強化後主屬性值（依稀有度差異化成長：N:6%/lv, R:8%, SR:10%, SSR:12%） */
export function enhancedMainStat(baseValue: number, enhanceLevel: number, rarity: Rarity = 'SR'): number {
  const growthRate: Record<Rarity, number> = { N: 0.06, R: 0.08, SR: 0.10, SSR: 0.12 }
  return Math.floor(baseValue * (1 + enhanceLevel * (growthRate[rarity] ?? 0.10)))
}

/** 裝備強化最大等級 */
export function getMaxEnhanceLevel(rarity: Rarity): number {
  return EQUIPMENT_MAX_ENHANCE[rarity]
}

/** 強化費用（僅金幣，v2 — 與後端 progression.ts 一致） */
export function getEnhanceCost(currentLevel: number, rarity: Rarity): number {
  const baseCost: Record<Rarity, number> = { N: 200, R: 500, SR: 1000, SSR: 2000 }
  return Math.floor(baseCost[rarity] * (1 + currentLevel * 0.3))
}

/** 從 Lv.0 強化到指定等級的累計金幣消耗（分解時 100% 返還用） */
export function getTotalEnhanceCost(enhanceLevel: number, rarity: Rarity): number {
  let total = 0
  for (let lv = 0; lv < enhanceLevel; lv++) {
    total += getEnhanceCost(lv, rarity)
  }
  return total
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

/** 計算已激活的套裝效果（同 setId 即可，不限稀有度） */
export function getActiveSetBonuses(equipment: EquipmentInstance[]): EquipmentSetBonus[] {
  // 依 setId 分組計數（向上兼容：不同稀有度混搭仍觸發套裝）
  const setCounts: Record<string, number> = {}
  for (const eq of equipment) {
    if (eq.setId) {
      setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1
    }
  }
  const active: EquipmentSetBonus[] = []
  for (const [setId, count] of Object.entries(setCounts)) {
    // 查找所有符合該 setId 的 bonus（2pc 和 4pc）
    const bonuses = EQUIPMENT_SETS.filter(s => s.setId === setId)
    for (const bonus of bonuses) {
      if (count >= bonus.requiredCount) {
        active.push(bonus)
      }
    }
  }
  return active
}

/* ════════════════════════════════════
   最終數值結算
   ════════════════════════════════════ */

/** 結算英雄最終數值（等級+突破+星級+裝備+套裝，依稀有度差異化成長） */
export function getFinalStats(base: BaseStats, hero: HeroInstanceData, rarity: number = 3): FinalStats {
  const growth = RARITY_LEVEL_GROWTH[rarity] ?? 0.04
  const levelMult = 1 + (hero.level - 1) * growth
  const ascMult = getAscensionMultiplier(hero.ascension, rarity)
  const starMult = getStarMultiplier(hero.stars, rarity)

  // Step 1: base × level × ascension × star（HP/ATK/DEF 受影響，SPD/Crit 不受等級影響）
  const stats: FinalStats = {
    HP:       Math.floor(base.HP * levelMult * ascMult * starMult),
    ATK:      Math.floor(base.ATK * levelMult * ascMult * starMult),
    DEF:      Math.floor(base.DEF * levelMult * ascMult * starMult),
    SPD:      base.SPD,
    CritRate: base.CritRate,
    CritDmg:  base.CritDmg,
  }

  // Step 2: Equipment flat stats (mainStat + 副屬性 flat)
  for (const eq of hero.equipment) {
    const mainVal = enhancedMainStat(eq.mainStatValue, eq.enhanceLevel, eq.rarity)
    addStatFlat(stats, eq.mainStat, mainVal)

    for (const sub of (eq.subStats ?? [])) {
      if (!sub.isPercent) {
        addStatFlat(stats, sub.stat, sub.value)
      }
    }
  }

  // Step 3: Equipment percent stats
  // 注意：CritRate / CritDmg 的「%」副屬性代表加算百分點（+5% = +5），
  //       而非乘算（×1.05），因為這兩個屬性本身就是百分比數值。
  const pctBonuses: Record<string, number> = {}
  for (const eq of hero.equipment) {
    for (const sub of (eq.subStats ?? [])) {
      if (sub.isPercent) {
        if (sub.stat === 'CritRate' || sub.stat === 'CritDmg') {
          addStatFlat(stats, sub.stat, sub.value)
        } else {
          pctBonuses[sub.stat] = (pctBonuses[sub.stat] || 0) + sub.value
        }
      }
    }
  }

  // Step 4: Set bonuses (percent-based)
  const activeSets = getActiveSetBonuses(hero.equipment)
  for (const set of activeSets) {
    if (set.bonusType.endsWith('_percent')) {
      const statName = set.bonusType.replace('_percent', '')
      if (statName === 'CritRate' || statName === 'CritDmg') {
        addStatFlat(stats, statName, set.bonusValue)
      } else {
        pctBonuses[statName] = (pctBonuses[statName] || 0) + set.bonusValue
      }
    } else if (set.bonusType === 'SPD_flat') {
      stats.SPD += set.bonusValue
    }
    // lifesteal / counter are handled in battle engine, not stats
  }

  // Apply percent bonuses（僅 HP/ATK/DEF/SPD 為乘算）
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
