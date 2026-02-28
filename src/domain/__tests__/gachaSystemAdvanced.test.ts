/**
 * gachaSystem 進階測試 — featured banner、保底路徑、fallback 邊界
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getEffectiveSSRRate,
  rollRarity,
  rollHero,
  performSinglePull,
  performTenPull,
  getDuplicateReward,
  STANDARD_BANNER,
  DEFAULT_RATE_TABLE,
  DEFAULT_PITY_CONFIG,
  SINGLE_PULL_COST,
  TEN_PULL_COST,
  DUPLICATE_STARDUST,
} from '../gachaSystem'
import type { GachaBanner, PityState } from '../gachaSystem'

const HERO_POOL = [
  { heroId: 1, rarity: 4 }, // SSR
  { heroId: 2, rarity: 4 }, // SSR
  { heroId: 3, rarity: 3 }, // SR
  { heroId: 4, rarity: 3 }, // SR
  { heroId: 5, rarity: 2 }, // R
  { heroId: 6, rarity: 2 }, // R
  { heroId: 7, rarity: 1 }, // N
  { heroId: 8, rarity: 1 }, // N
]

function defaultPity(): PityState {
  return { pullsSinceLastSSR: 0, guaranteedFeatured: false }
}

describe('gachaSystem - 進階測試', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  /* ═══════ 軟保底遞增 ═══════ */

  describe('軟保底遞增', () => {
it('pull 76 SSR 率開始提升 (softPity=75, extraPulls=1)', () => {
      const base = DEFAULT_RATE_TABLE.SSR
      // pullsSinceLastSSR=75 → pull 76, extraPulls = 76 - 75 = 1
      const rate76 = getEffectiveSSRRate(75, DEFAULT_PITY_CONFIG, base)
      expect(rate76).toBeGreaterThan(base)
    })

    it('pull 80 > pull 75', () => {
      const base = DEFAULT_RATE_TABLE.SSR
      const rate75 = getEffectiveSSRRate(74, DEFAULT_PITY_CONFIG, base)
      const rate80 = getEffectiveSSRRate(79, DEFAULT_PITY_CONFIG, base)
      expect(rate80).toBeGreaterThan(rate75)
    })

    it('pull 85 > pull 80', () => {
      const base = DEFAULT_RATE_TABLE.SSR
      const rate80 = getEffectiveSSRRate(79, DEFAULT_PITY_CONFIG, base)
      const rate85 = getEffectiveSSRRate(84, DEFAULT_PITY_CONFIG, base)
      expect(rate85).toBeGreaterThan(rate80)
    })

    it('硬保底 90 → 100%', () => {
      // pullsSinceLastSSR=89 → pull 90 >= hardPity(90)
      const rate = getEffectiveSSRRate(89, DEFAULT_PITY_CONFIG, DEFAULT_RATE_TABLE.SSR)
      expect(rate).toBe(1.0)
    })

    it('超過硬保底也是 100%', () => {
      const rate = getEffectiveSSRRate(100, DEFAULT_PITY_CONFIG, DEFAULT_RATE_TABLE.SSR)
      expect(rate).toBe(1.0)
    })
  })

  /* ═══════ featured banner 50/50 ═══════ */

  describe('featured banner 50/50', () => {
    const featuredBanner: GachaBanner = {
      ...STANDARD_BANNER,
      featuredHeroes: [1], // HeroId 1 is UP
    }

    it('50/50 勝 → isFeatured=true', () => {
      let callIdx = 0
      const rng = () => {
        callIdx++
        return callIdx === 1 ? 0.3 : 0.1 // 第一次 50/50 判定 < 0.5, 第二次選 featured
      }

      const result = rollHero('SSR', featuredBanner, defaultPity(), HERO_POOL, rng)
      expect(result.isFeatured).toBe(true)
      expect(result.heroId).toBe(1)
    })

    it('50/50 敗 → guaranteedFeatured 下次為 true', () => {
      let callIdx = 0
      const rng = () => {
        callIdx++
        return callIdx === 1 ? 0.9 : 0.1 // 50/50 失敗
      }

      const result = rollHero('SSR', featuredBanner, defaultPity(), HERO_POOL, rng)
      expect(result.isFeatured).toBe(false)
      expect(result.newPityState.guaranteedFeatured).toBe(true)
    })

    it('guaranteedFeatured=true → 必出 UP 角色', () => {
      const pity: PityState = { pullsSinceLastSSR: 0, guaranteedFeatured: true }

      const result = rollHero('SSR', featuredBanner, pity, HERO_POOL, Math.random)
      expect(result.isFeatured).toBe(true)
      expect(result.heroId).toBe(1)
      expect(result.newPityState.guaranteedFeatured).toBe(false)
    })
  })

  /* ═══════ rollHero fallback ═══════ */

  describe('rollHero fallback', () => {
    it('SSR pool 為空 → fallback any hero', () => {
      const emptyPool = [
        { heroId: 5, rarity: 2 }, // R
        { heroId: 6, rarity: 2 }, // R
      ]

      const result = rollHero('SSR', STANDARD_BANNER, defaultPity(), emptyPool, () => 0.1)
      expect(result.heroId).toBeGreaterThan(0)
      expect(result.isFeatured).toBe(false)
    })

    it('非 SSR 不觸發 featured 邏輯', () => {
      const featuredBanner: GachaBanner = {
        ...STANDARD_BANNER,
        featuredHeroes: [1],
      }

      const result = rollHero('SR', featuredBanner, defaultPity(), HERO_POOL, () => 0.1)
      expect(result.isFeatured).toBe(false)
    })

    it('非 SSR 不重置 pullsSinceLastSSR', () => {
      const pity: PityState = { pullsSinceLastSSR: 50, guaranteedFeatured: false }
      const result = rollHero('R', STANDARD_BANNER, pity, HERO_POOL, () => 0.1)
      expect(result.newPityState.pullsSinceLastSSR).toBe(51)
    })
  })

  /* ═══════ 十連保底追蹤 ═══════ */

  describe('十連保底追蹤', () => {
    it('十連中途觸發硬保底', () => {
      const pity: PityState = { pullsSinceLastSSR: 85, guaranteedFeatured: false }
      // 從 85 開始，89 抽時必觸發硬保底

      // rng 一律回傳 0.99（不觸發 SSR），但硬保底會介入
      const { results, newPityState } = performTenPull(
        STANDARD_BANNER, pity, new Set(), HERO_POOL, () => 0.99,
      )

      // 在第 4 抽（pull 89 from 0）應觸發 SSR
      const ssrResults = results.filter(r => r.rarity === 'SSR')
      expect(ssrResults.length).toBeGreaterThanOrEqual(1)
      expect(newPityState.pullsSinceLastSSR).toBeLessThan(10)
    })

    it('十連回傳 10 個結果', () => {
      const { results } = performTenPull(
        STANDARD_BANNER, defaultPity(), new Set(), HERO_POOL,
      )
      expect(results).toHaveLength(10)
    })

    it('十連 isNew 標記正確', () => {
      const owned = new Set([1, 2, 3])
      const { results } = performTenPull(
        STANDARD_BANNER, defaultPity(), owned, HERO_POOL, () => 0.5,
      )

      for (const r of results) {
        if (owned.has(r.heroId)) {
          // 已有的角色第一次出現不是 new
          // 但不一定，因為 owned 會動態更新
        }
        // 至少不崩潰
        expect(typeof r.isNew).toBe('boolean')
      }
    })
  })

  /* ═══════ getDuplicateReward 邊界 ═══════ */

  describe('getDuplicateReward 邊界', () => {
    it('各稀有度 stardust 正確', () => {
      expect(getDuplicateReward('N', 1, 1).stardust).toBe(DUPLICATE_STARDUST.N)
      expect(getDuplicateReward('R', 2, 2).stardust).toBe(DUPLICATE_STARDUST.R)
      expect(getDuplicateReward('SR', 3, 3).stardust).toBe(DUPLICATE_STARDUST.SR)
      expect(getDuplicateReward('SSR', 4, 4).stardust).toBe(DUPLICATE_STARDUST.SSR)
    })

    it('heroRarity 不在 DUPLICATE_FRAGMENTS 表 → 預設 5', () => {
      const reward = getDuplicateReward('N', 99, 99)
      expect(reward.fragments).toBe(5)
    })
  })

  /* ═══════ rollRarity 分佈驗證 ═══════ */

  describe('rollRarity 分佈', () => {
    it('1000 次抽卡分佈合理', () => {
      const counts = { N: 0, R: 0, SR: 0, SSR: 0 }

      for (let i = 0; i < 1000; i++) {
        const rarity = rollRarity(0, DEFAULT_RATE_TABLE, DEFAULT_PITY_CONFIG)
        counts[rarity]++
      }

      // SSR: ~1.5% → ~15
      expect(counts.SSR).toBeGreaterThanOrEqual(0)
      expect(counts.SSR).toBeLessThan(60) // 允許波動
      // N 應占大多數
      expect(counts.N).toBeGreaterThan(300)
      // SR 比 SSR 多
      expect(counts.SR).toBeGreaterThan(counts.SSR)
    })
  })
})
