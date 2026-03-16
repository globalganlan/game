/**
 * 常數完整性守護測試
 *
 * 目的：防止星級/突破相關常數表不完整導致的 runtime 異常。
 * 當修改 MAX_STARS / MAX_ASCENSION 或新增稀有度時，
 * 若忘了同步更新對應常數表，這裡會立刻報錯。
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_STARS,
  SKILL_LEVEL_STAR_THRESHOLD,
  LEVEL_SCALE,
  getSkillLevel,
  getStarPassiveSlots,
  getStarMultiplier,
  getAscensionMultiplier,
  RARITY_STAR_MULT,
  STAR_PASSIVE_SLOTS,
  STAR_UP_COST,
  STAR_MULTIPLIER,
  ASCENSION_LEVEL_CAP,
  ASCENSION_COSTS,
  RARITY_ASC_MULT,
  RARITY_LEVEL_GROWTH,
} from '../progressionSystem'

// 支援的稀有度 (N=1, R=2, SR=3, SSR=4)
const RARITIES = [1, 2, 3, 4]
const MAX_ASCENSION = 5

describe('常數完整性守護', () => {
  // ─── 星級常數表 ───
  describe('星級常數覆蓋 ★0 ~ ★MAX_STARS', () => {
    it('STAR_PASSIVE_SLOTS 涵蓋 ★0 到 ★MAX_STARS', () => {
      for (let s = 0; s <= MAX_STARS; s++) {
        expect(STAR_PASSIVE_SLOTS[s], `STAR_PASSIVE_SLOTS 缺少 ★${s}`).toBeDefined()
        expect(STAR_PASSIVE_SLOTS[s]).toBeGreaterThan(0)
      }
    })

    it('STAR_MULTIPLIER 涵蓋 ★0 到 ★MAX_STARS', () => {
      for (let s = 0; s <= MAX_STARS; s++) {
        expect(STAR_MULTIPLIER[s], `STAR_MULTIPLIER 缺少 ★${s}`).toBeDefined()
        expect(STAR_MULTIPLIER[s]).toBeGreaterThan(0)
      }
    })

    it('STAR_UP_COST 涵蓋 ★0 到 ★(MAX_STARS-1)', () => {
      for (let s = 0; s < MAX_STARS; s++) {
        expect(STAR_UP_COST[s], `STAR_UP_COST 缺少 ★${s}→★${s + 1}`).toBeDefined()
        expect(STAR_UP_COST[s]).toBeGreaterThan(0)
      }
    })

    it.each(RARITIES)('RARITY_STAR_MULT[%i] 涵蓋 ★0 到 ★MAX_STARS', (rarity) => {
      expect(RARITY_STAR_MULT[rarity], `RARITY_STAR_MULT 缺少稀有度 ${rarity}`).toBeDefined()
      for (let s = 0; s <= MAX_STARS; s++) {
        expect(RARITY_STAR_MULT[rarity][s], `RARITY_STAR_MULT[${rarity}] 缺少 ★${s}`).toBeDefined()
        expect(RARITY_STAR_MULT[rarity][s]).toBeGreaterThan(0)
      }
    })
  })

  // ─── 突破常數表 ───
  describe('突破常數覆蓋 0 ~ MAX_ASCENSION', () => {
    it('ASCENSION_LEVEL_CAP 涵蓋 0 到 MAX_ASCENSION', () => {
      for (let a = 0; a <= MAX_ASCENSION; a++) {
        expect(ASCENSION_LEVEL_CAP[a], `ASCENSION_LEVEL_CAP 缺少突破 ${a}`).toBeDefined()
        expect(ASCENSION_LEVEL_CAP[a]).toBeGreaterThan(0)
      }
    })

    it('ASCENSION_COSTS 涵蓋 0 到 MAX_ASCENSION-1', () => {
      for (let a = 0; a < MAX_ASCENSION; a++) {
        expect(ASCENSION_COSTS[a], `ASCENSION_COSTS 缺少突破 ${a}`).toBeDefined()
        expect(ASCENSION_COSTS[a].fragments).toBeGreaterThan(0)
        expect(ASCENSION_COSTS[a].classStones).toBeGreaterThan(0)
        expect(ASCENSION_COSTS[a].gold).toBeGreaterThan(0)
      }
    })

    it.each(RARITIES)('RARITY_ASC_MULT[%i] 涵蓋 0 到 MAX_ASCENSION', (rarity) => {
      expect(RARITY_ASC_MULT[rarity], `RARITY_ASC_MULT 缺少稀有度 ${rarity}`).toBeDefined()
      for (let a = 0; a <= MAX_ASCENSION; a++) {
        expect(RARITY_ASC_MULT[rarity][a], `RARITY_ASC_MULT[${rarity}] 缺少突破 ${a}`).toBeDefined()
        expect(RARITY_ASC_MULT[rarity][a]).toBeGreaterThan(0)
      }
    })
  })

  // ─── getSkillLevel 函式 ───
  describe('getSkillLevel', () => {
    it('★0~THRESHOLD 返回 Lv.1', () => {
      for (let s = 0; s <= SKILL_LEVEL_STAR_THRESHOLD; s++) {
        expect(getSkillLevel(s)).toBe(1)
      }
    })

    it('★(THRESHOLD+1)~MAX_STARS 返回遞增等級', () => {
      for (let s = SKILL_LEVEL_STAR_THRESHOLD + 1; s <= MAX_STARS; s++) {
        const expected = s - SKILL_LEVEL_STAR_THRESHOLD + 1
        expect(getSkillLevel(s)).toBe(expected)
      }
    })

    it('最高技能等級不超過 LEVEL_SCALE 長度', () => {
      const maxSkillLevel = getSkillLevel(MAX_STARS)
      expect(maxSkillLevel).toBeLessThanOrEqual(LEVEL_SCALE.length)
    })
  })

  // ─── LEVEL_SCALE ───
  describe('LEVEL_SCALE', () => {
    it('長度足以覆蓋最高技能等級', () => {
      const maxSkillLevel = getSkillLevel(MAX_STARS)
      expect(LEVEL_SCALE.length).toBeGreaterThanOrEqual(maxSkillLevel)
    })

    it('Lv.1 倍率為 1.0', () => {
      expect(LEVEL_SCALE[0]).toBe(1.0)
    })

    it('倍率遞增', () => {
      for (let i = 1; i < LEVEL_SCALE.length; i++) {
        expect(LEVEL_SCALE[i]).toBeGreaterThan(LEVEL_SCALE[i - 1])
      }
    })
  })

  // ─── Helper 函式不爆炸 ───
  describe('所有星等存取 helper 不 crash', () => {
    it.each(Array.from({ length: MAX_STARS + 1 }, (_, i) => i))(
      'getStarPassiveSlots(%i) 返回正整數',
      (s) => {
        expect(getStarPassiveSlots(s)).toBeGreaterThan(0)
      },
    )

    it.each(
      RARITIES.flatMap(r => Array.from({ length: MAX_STARS + 1 }, (_, s) => [r, s])),
    )('getStarMultiplier(%i, %i) 返回正數', (stars, rarity) => {
      expect(getStarMultiplier(stars, rarity)).toBeGreaterThan(0)
    })

    it.each(
      RARITIES.flatMap(r => Array.from({ length: MAX_ASCENSION + 1 }, (_, a) => [r, a])),
    )('getAscensionMultiplier(%i, %i) 返回正數', (asc, rarity) => {
      expect(getAscensionMultiplier(asc, rarity)).toBeGreaterThan(0)
    })
  })

  // ── 等級成長率 ──
  describe('RARITY_LEVEL_GROWTH', () => {
    it.each(RARITIES)('稀有度 %i 有成長率定義', (rarity) => {
      expect(RARITY_LEVEL_GROWTH[rarity]).toBeDefined()
      expect(RARITY_LEVEL_GROWTH[rarity]).toBeGreaterThan(0)
    })
  })
})
