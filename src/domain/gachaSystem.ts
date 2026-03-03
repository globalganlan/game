/**
 * gachaSystem — 抽卡系統 Domain 邏輯
 *
 * 包含：機率計算、保底機制、重複轉換
 *
 * 對應 Spec: specs/gacha.md v0.1
 */

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export type GachaRarity = 'N' | 'R' | 'SR' | 'SSR'

export interface GachaBanner {
  id: string
  name: string
  type: 'standard' | 'limited' | 'element'
  featuredHeroes: number[]       // heroId[]（UP 角色）
  rateTable: RateTable
  pityConfig: PityConfig
}

export interface RateTable {
  SSR: number    // 0.015 = 1.5%
  SR: number     // 0.10  = 10%
  R: number      // 0.35  = 35%
  N: number      // 0.535 = 53.5%
}

export interface PityConfig {
  softPity: number       // 75（從第 75 抽起 SSR 機率遞增）
  hardPity: number       // 90（第 90 抽保底 SSR）
  softPityBoost: number  // 每抽增加的 SSR 機率（0.05 = +5%）
  featured5050: number   // UP 角色的機率（0.5 = 50/50）
  guaranteedFeatured: boolean // 歪一次後下次保底 UP
}

export interface PityState {
  pullsSinceLastSSR: number   // 距離上次 SSR 的抽數
  guaranteedFeatured: boolean // 下次 SSR 是否保底 UP
}

export interface GachaPullResult {
  heroId: number
  rarity: GachaRarity
  isNew: boolean
  isFeatured: boolean
}

export interface DuplicateReward {
  stardust: number
  fragments: number
  heroId: number
}

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

/** 預設機率表 */
export const DEFAULT_RATE_TABLE: RateTable = {
  SSR: 0.015,
  SR: 0.10,
  R: 0.35,
  N: 0.535,
}

/** 預設保底配置 */
export const DEFAULT_PITY_CONFIG: PityConfig = {
  softPity: 75,
  hardPity: 90,
  softPityBoost: 0.05,
  featured5050: 0.5,
  guaranteedFeatured: true,
}

/** 抽卡成本 */
export const SINGLE_PULL_COST = 160    // 鑽石
export const TEN_PULL_COST = 1600      // 鑽石（無折扣 = 10 × 160）

/** 重複轉換星塵 */
export const DUPLICATE_STARDUST: Record<GachaRarity, number> = {
  SSR: 25,
  SR: 5,
  R: 1,
  N: 1,
}

/** 重複轉換碎片（依稀有度等級） */
export const DUPLICATE_FRAGMENTS: Record<number, number> = {
  1: 5,     // ★1~★2 → 5 碎片
  2: 5,
  3: 15,    // ★3 → 15 碎片
  4: 40,    // ★4 → 40 碎片
}

/** 預設常駐池 banner */
export const STANDARD_BANNER: GachaBanner = {
  id: 'standard',
  name: '常駐招募',
  type: 'standard',
  featuredHeroes: [],
  rateTable: DEFAULT_RATE_TABLE,
  pityConfig: DEFAULT_PITY_CONFIG,
}

/* ════════════════════════════════════
   機率計算
   ════════════════════════════════════ */

/**
 * 計算考慮保底後的 SSR 實際機率
 */
export function getEffectiveSSRRate(
  pullsSinceLastSSR: number,
  config: PityConfig,
  baseRate: number,
): number {
  if (pullsSinceLastSSR + 1 >= config.hardPity) return 1.0  // 硬保底
  if (pullsSinceLastSSR + 1 >= config.softPity) {
    const extraPulls = pullsSinceLastSSR + 1 - config.softPity
    return Math.min(1.0, baseRate + extraPulls * config.softPityBoost)
  }
  return baseRate
}

/**
 * 執行單次抽卡（決定稀有度）
 */
export function rollRarity(
  pullsSinceLastSSR: number,
  rateTable: RateTable,
  pityConfig: PityConfig,
  rng = Math.random,
): GachaRarity {
  const ssrRate = getEffectiveSSRRate(pullsSinceLastSSR, pityConfig, rateTable.SSR)
  const roll = rng()

  if (roll < ssrRate) return 'SSR'
  if (roll < ssrRate + rateTable.SR) return 'SR'
  if (roll < ssrRate + rateTable.SR + rateTable.R) return 'R'
  return 'N'
}

/**
 * 決定抽到的英雄 ID
 */
export function rollHero(
  rarity: GachaRarity,
  banner: GachaBanner,
  pityState: PityState,
  heroPool: { heroId: number; rarity: number }[],
  rng = Math.random,
): { heroId: number; isFeatured: boolean; newPityState: PityState } {
  const rarityToNum: Record<GachaRarity, number> = { N: 1, R: 2, SR: 3, SSR: 4 }
  const rarityNum = rarityToNum[rarity]
  const candidates = heroPool.filter(h => h.rarity === rarityNum)

  if (candidates.length === 0) {
    // Fallback: any hero
    const fallback = heroPool[Math.floor(rng() * heroPool.length)]
    return {
      heroId: fallback.heroId,
      isFeatured: false,
      newPityState: {
        pullsSinceLastSSR: rarity === 'SSR' ? 0 : pityState.pullsSinceLastSSR + 1,
        guaranteedFeatured: pityState.guaranteedFeatured,
      },
    }
  }

  let isFeatured = false
  let selectedHeroId: number

  if (rarity === 'SSR' && banner.featuredHeroes.length > 0) {
    // 50/50 判定
    const shouldBeFeatured = pityState.guaranteedFeatured || rng() < banner.pityConfig.featured5050
    isFeatured = shouldBeFeatured
    if (shouldBeFeatured) {
      selectedHeroId = banner.featuredHeroes[Math.floor(rng() * banner.featuredHeroes.length)]
    } else {
      // 非 UP: 從 SSR 池排除 featured 隨機
      const nonFeatured = candidates.filter(h => !banner.featuredHeroes.includes(h.heroId))
      const pool = nonFeatured.length > 0 ? nonFeatured : candidates
      selectedHeroId = pool[Math.floor(rng() * pool.length)].heroId
    }
  } else {
    selectedHeroId = candidates[Math.floor(rng() * candidates.length)].heroId
  }

  // 更新保底狀態
  const newPityState: PityState = {
    pullsSinceLastSSR: rarity === 'SSR' ? 0 : pityState.pullsSinceLastSSR + 1,
    guaranteedFeatured: rarity === 'SSR'
      ? (isFeatured ? false : banner.pityConfig.guaranteedFeatured)
      : pityState.guaranteedFeatured,
  }

  return { heroId: selectedHeroId, isFeatured, newPityState }
}

/**
 * 執行一次完整抽卡流程
 */
export function performSinglePull(
  banner: GachaBanner,
  pityState: PityState,
  ownedHeroIds: Set<number>,
  heroPool: { heroId: number; rarity: number }[],
  rng = Math.random,
): { result: GachaPullResult; newPityState: PityState } {
  const rarity = rollRarity(
    pityState.pullsSinceLastSSR,
    banner.rateTable,
    banner.pityConfig,
    rng,
  )

  const { heroId, isFeatured, newPityState } = rollHero(
    rarity, banner, pityState, heroPool, rng,
  )

  return {
    result: {
      heroId,
      rarity,
      isNew: !ownedHeroIds.has(heroId),
      isFeatured,
    },
    newPityState,
  }
}

/**
 * 執行十連抽
 */
export function performTenPull(
  banner: GachaBanner,
  pityState: PityState,
  ownedHeroIds: Set<number>,
  heroPool: { heroId: number; rarity: number }[],
  rng = Math.random,
): { results: GachaPullResult[]; newPityState: PityState } {
  const results: GachaPullResult[] = []
  let state = pityState
  const knownOwned = new Set(ownedHeroIds)

  for (let i = 0; i < 10; i++) {
    const { result, newPityState } = performSinglePull(
      banner, state, knownOwned, heroPool, rng,
    )
    results.push(result)
    state = newPityState
    if (result.isNew) knownOwned.add(result.heroId)
  }

  return { results, newPityState: state }
}

/* ════════════════════════════════════
   重複轉換
   ════════════════════════════════════ */

/** 計算重複英雄的轉換獎勵 */
export function getDuplicateReward(rarity: GachaRarity, heroId: number, heroRarity: number): DuplicateReward {
  return {
    stardust: DUPLICATE_STARDUST[rarity],
    fragments: DUPLICATE_FRAGMENTS[heroRarity] ?? 5,
    heroId,
  }
}

/* ════════════════════════════════════
   成本計算
   ════════════════════════════════════ */

/** 檢查是否有足夠鑽石 */
export function canAffordPull(diamond: number, count: 1 | 10): boolean {
  const cost = count === 10 ? TEN_PULL_COST : SINGLE_PULL_COST
  return diamond >= cost
}

/** 取得抽卡成本 */
export function getPullCost(count: 1 | 10): number {
  return count === 10 ? TEN_PULL_COST : SINGLE_PULL_COST
}
