import { describe, it, expect } from 'vitest'
import {
  getEffectiveSSRRate,
  rollRarity,
  rollHero,
  performSinglePull,
  performTenPull,
  getDuplicateReward,
  canAffordPull,
  getPullCost,
  DEFAULT_RATE_TABLE,
  DEFAULT_PITY_CONFIG,
  SINGLE_PULL_COST,
  TEN_PULL_COST,
  STANDARD_BANNER,
  DUPLICATE_STARDUST,
  DUPLICATE_FRAGMENTS,
} from '../gachaSystem'
import type { PityState, GachaBanner } from '../gachaSystem'

const HERO_POOL = [
  { heroId: 1, rarity: 1 },
  { heroId: 2, rarity: 1 },
  { heroId: 3, rarity: 2 },
  { heroId: 4, rarity: 2 },
  { heroId: 5, rarity: 3 },
  { heroId: 6, rarity: 3 },
  { heroId: 7, rarity: 4 },
  { heroId: 8, rarity: 4 },
]

function makePity(pulls = 0, guaranteed = false): PityState {
  return { pullsSinceLastSSR: pulls, guaranteedFeatured: guaranteed }
}

/* ════════════════════════════════════
   SSR 有效機率
   ════════════════════════════════════ */
describe('gachaSystem — getEffectiveSSRRate', () => {
  it('未進軟保底 → 基礎機率', () => {
    const rate = getEffectiveSSRRate(0, DEFAULT_PITY_CONFIG, DEFAULT_RATE_TABLE.SSR)
    expect(rate).toBe(DEFAULT_RATE_TABLE.SSR)
  })

  it('軟保底開始提升機率', () => {
    // softPity = 75, at 75 pulls (next=76th), extraPulls=1 → boost
    const rate = getEffectiveSSRRate(75, DEFAULT_PITY_CONFIG, DEFAULT_RATE_TABLE.SSR)
    expect(rate).toBeGreaterThan(DEFAULT_RATE_TABLE.SSR)
  })

  it('硬保底 = 100%', () => {
    // hardPity = 90, at 89 pulls since SSR, next = 90th
    const rate = getEffectiveSSRRate(89, DEFAULT_PITY_CONFIG, DEFAULT_RATE_TABLE.SSR)
    expect(rate).toBe(1.0)
  })

  it('超過硬保底仍 100%', () => {
    const rate = getEffectiveSSRRate(100, DEFAULT_PITY_CONFIG, DEFAULT_RATE_TABLE.SSR)
    expect(rate).toBe(1.0)
  })
})

/* ════════════════════════════════════
   rollRarity
   ════════════════════════════════════ */
describe('gachaSystem — rollRarity', () => {
  it('rng=0 → SSR（因為 0 < 0.015）', () => {
    const r = rollRarity(0, DEFAULT_RATE_TABLE, DEFAULT_PITY_CONFIG, () => 0)
    expect(r).toBe('SSR')
  })

  it('rng=0.99 → N', () => {
    const r = rollRarity(0, DEFAULT_RATE_TABLE, DEFAULT_PITY_CONFIG, () => 0.99)
    expect(r).toBe('N')
  })

  it('硬保底 89 抽 → 必定 SSR', () => {
    const r = rollRarity(89, DEFAULT_RATE_TABLE, DEFAULT_PITY_CONFIG, () => 0.99)
    expect(r).toBe('SSR')
  })
})

/* ════════════════════════════════════
   rollHero
   ════════════════════════════════════ */
describe('gachaSystem — rollHero', () => {
  it('SSR → 從 rarity=4 pool 抽', () => {
    const { heroId } = rollHero('SSR', STANDARD_BANNER, makePity(), HERO_POOL, () => 0)
    expect([7, 8]).toContain(heroId)
  })

  it('R → 從 rarity=2 pool 抽', () => {
    const { heroId } = rollHero('R', STANDARD_BANNER, makePity(), HERO_POOL, () => 0)
    expect([3, 4]).toContain(heroId)
  })

  it('抽到 SSR → pity 歸零', () => {
    const { newPityState } = rollHero('SSR', STANDARD_BANNER, makePity(50), HERO_POOL, () => 0)
    expect(newPityState.pullsSinceLastSSR).toBe(0)
  })

  it('非 SSR → pity +1', () => {
    const { newPityState } = rollHero('R', STANDARD_BANNER, makePity(10), HERO_POOL, () => 0)
    expect(newPityState.pullsSinceLastSSR).toBe(11)
  })
})

/* ════════════════════════════════════
   performSinglePull / performTenPull
   ════════════════════════════════════ */
describe('gachaSystem — performSinglePull', () => {
  it('回傳結果含 heroId', () => {
    const { result } = performSinglePull(STANDARD_BANNER, makePity(), new Set(), HERO_POOL, () => 0)
    expect(result.heroId).toBeGreaterThan(0)
    expect(result.rarity).toBeDefined()
  })

  it('新英雄 isNew=true', () => {
    const { result } = performSinglePull(STANDARD_BANNER, makePity(), new Set(), HERO_POOL, () => 0)
    expect(result.isNew).toBe(true)
  })

  it('已擁有 → isNew=false', () => {
    // 固定 rng=0 → SSR → heroId=7
    const { result } = performSinglePull(STANDARD_BANNER, makePity(), new Set([7, 8]), HERO_POOL, () => 0)
    expect(result.isNew).toBe(false)
  })
})

describe('gachaSystem — performTenPull', () => {
  it('十連抽回傳 10 個結果', () => {
    let i = 0
    const rng = () => { i++; return (i * 0.07) % 1 }
    const { results } = performTenPull(STANDARD_BANNER, makePity(), new Set(), HERO_POOL, rng)
    expect(results.length).toBe(10)
  })

  it('十連中抽到 SSR → pity 歸零', () => {
    // Force all SSR
    const { newPityState } = performTenPull(STANDARD_BANNER, makePity(80), new Set(), HERO_POOL, () => 0)
    expect(newPityState.pullsSinceLastSSR).toBe(0)
  })
})

/* ════════════════════════════════════
   重複獎勵
   ════════════════════════════════════ */
describe('gachaSystem — getDuplicateReward', () => {
  it('SSR 重複 → stardust=25, fragments>0', () => {
    const r = getDuplicateReward('SSR', 7, 4)
    expect(r.stardust).toBe(DUPLICATE_STARDUST['SSR'])
    expect(r.fragments).toBe(DUPLICATE_FRAGMENTS[4])
    expect(r.heroId).toBe(7)
  })

  it('N 重複', () => {
    const r = getDuplicateReward('N', 1, 1)
    expect(r.stardust).toBe(DUPLICATE_STARDUST['N'])
  })
})

/* ════════════════════════════════════
   成本計算
   ════════════════════════════════════ */
describe('gachaSystem — costs', () => {
  it('canAffordPull: 夠 → true', () => {
    expect(canAffordPull(160, 1)).toBe(true)
    expect(canAffordPull(1440, 10)).toBe(true)
  })

  it('canAffordPull: 不夠 → false', () => {
    expect(canAffordPull(159, 1)).toBe(false)
    expect(canAffordPull(1439, 10)).toBe(false)
  })

  it('getPullCost: 單抽=160, 十連=1440', () => {
    expect(getPullCost(1)).toBe(SINGLE_PULL_COST)
    expect(getPullCost(10)).toBe(TEN_PULL_COST)
  })
})
