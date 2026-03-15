import { describe, it, expect } from 'vitest'
import {
  expToNextLevel,
  totalExpForLevel,
  getStatAtLevel,
  getLevelCap,
  consumeExpMaterials,
  getAscensionMultiplier,
  getAscensionCost,
  canAscend,
  getStarMultiplier,
  getStarPassiveSlots,
  getStarUpCost,
  canStarUp,
  getInitialStars,
  enhancedMainStat,
  getMaxEnhanceLevel,
  getEnhanceCost,
  randomSubStats,
  getSetBonus,
  getActiveSetBonuses,
  getFinalStats,
  ASCENSION_LEVEL_CAP,
  EQUIPMENT_SETS,
  RARITY_LEVEL_GROWTH,
  RARITY_ASC_MULT,
  RARITY_STAR_MULT,
} from '../progressionSystem'
import type { EquipmentInstance, HeroInstanceData, BaseStats } from '../progressionSystem'

/* ════════════════════════════════════
   等級 & 經驗
   ════════════════════════════════════ */
describe('progressionSystem — 等級經驗', () => {
  it('expToNextLevel(1) = 100 (level * 100)', () => {
    expect(expToNextLevel(1)).toBe(100)
  })

  it('expToNextLevel(10) = 1000 (level * 100)', () => {
    expect(expToNextLevel(10)).toBe(1000)
  })

  it('expToNextLevel(11) = 1100 (level * 100)', () => {
    expect(expToNextLevel(11)).toBe(1100)
  })

  it('totalExpForLevel(1) = 0', () => {
    expect(totalExpForLevel(1)).toBe(0)
  })

  it('totalExpForLevel(2) = expToNextLevel(1)', () => {
    expect(totalExpForLevel(2)).toBe(expToNextLevel(1))
  })

  it('getStatAtLevel: lv1 = base', () => {
    expect(getStatAtLevel(100, 1)).toBe(100)
  })

  it('getStatAtLevel: lv11 = base * 1.4', () => {
    expect(getStatAtLevel(100, 11)).toBe(140)
  })

  it('getStatAtLevel: ★1 rarity lv11 = base * 1.3 (3%/lv)', () => {
    // 1 + 10 * 0.03 = 1.30
    expect(getStatAtLevel(100, 11, 1)).toBe(130)
  })

  it('getStatAtLevel: ★4 rarity lv11 = base * 1.5 (5%/lv)', () => {
    // 1 + 10 * 0.05 = 1.50
    expect(getStatAtLevel(100, 11, 4)).toBe(150)
  })

  it('getStatAtLevel: default rarity=3 same as old formula', () => {
    expect(getStatAtLevel(100, 11)).toBe(getStatAtLevel(100, 11, 3))
  })

  it('getLevelCap: ascension 0 → 20', () => {
    expect(getLevelCap(0)).toBe(20)
  })

  it('getLevelCap: ascension 5 → 100', () => {
    expect(getLevelCap(5)).toBe(100)
  })
})

/* ════════════════════════════════════
   經驗素材消耗
   ════════════════════════════════════ */
describe('progressionSystem — consumeExpMaterials', () => {
  it('不超過等級上限', () => {
    const result = consumeExpMaterials(19, 0, 20, 999999)
    expect(result.level).toBe(20)
    expect(result.exp).toBe(0)
  })

  it('剛好升1級', () => {
    const needed = expToNextLevel(1)
    const result = consumeExpMaterials(1, 0, 60, needed)
    expect(result.level).toBe(2)
    expect(result.exp).toBe(0)
  })

  it('不滿1級保留殘餘經驗', () => {
    const result = consumeExpMaterials(1, 0, 60, 50)
    expect(result.level).toBe(1)
    expect(result.exp).toBe(50)
  })

  it('已有經驗繼續累加', () => {
    const needed = expToNextLevel(1)
    const result = consumeExpMaterials(1, needed - 1, 60, 1)
    expect(result.level).toBe(2)
    expect(result.exp).toBe(0)
  })
})

/* ════════════════════════════════════
   突破系統
   ════════════════════════════════════ */
describe('progressionSystem — 突破', () => {
  it('getAscensionMultiplier(0) = 1.0', () => {
    expect(getAscensionMultiplier(0)).toBe(1.0)
  })

  it('getAscensionMultiplier(5) 需 > 1.0', () => {
    expect(getAscensionMultiplier(5)).toBeGreaterThan(1.0)
  })

  it('getAscensionMultiplier: ★4 > ★3 > ★2 > ★1', () => {
    expect(getAscensionMultiplier(5, 4)).toBeGreaterThan(getAscensionMultiplier(5, 3))
    expect(getAscensionMultiplier(5, 3)).toBeGreaterThan(getAscensionMultiplier(5, 2))
    expect(getAscensionMultiplier(5, 2)).toBeGreaterThan(getAscensionMultiplier(5, 1))
  })

  it('getAscensionMultiplier: default rarity=3 same as old', () => {
    expect(getAscensionMultiplier(5)).toBe(getAscensionMultiplier(5, 3))
    expect(getAscensionMultiplier(5)).toBe(1.30)
  })

  it('getAscensionCost(0) 有值', () => {
    const cost = getAscensionCost(0)
    expect(cost).not.toBeNull()
    expect(cost!.fragments).toBeGreaterThan(0)
    expect(cost!.gold).toBeGreaterThan(0)
  })

  it('getAscensionCost(5) = null (已滿)', () => {
    expect(getAscensionCost(5)).toBeNull()
  })

  it('canAscend: lv20, asc0 → true', () => {
    expect(canAscend(20, 0)).toBe(true)
  })

  it('canAscend: lv10, asc0 → false', () => {
    expect(canAscend(10, 0)).toBe(false)
  })

  it('canAscend: asc5 → false', () => {
    expect(canAscend(60, 5)).toBe(false)
  })
})

/* ════════════════════════════════════
   星級系統
   ════════════════════════════════════ */
describe('progressionSystem — 星級', () => {
  it('getStarMultiplier(1) = 1.0', () => {
    expect(getStarMultiplier(1)).toBe(1.0)
  })

  it('getStarMultiplier(6) 最高', () => {
    expect(getStarMultiplier(6)).toBeGreaterThan(getStarMultiplier(1))
  })

  it('getStarMultiplier: ★4 > ★3 > ★2 > ★1', () => {
    expect(getStarMultiplier(6, 4)).toBeGreaterThan(getStarMultiplier(6, 3))
    expect(getStarMultiplier(6, 3)).toBeGreaterThan(getStarMultiplier(6, 2))
    expect(getStarMultiplier(6, 2)).toBeGreaterThan(getStarMultiplier(6, 1))
  })

  it('getStarMultiplier: default rarity=3 same as old', () => {
    expect(getStarMultiplier(6)).toBe(getStarMultiplier(6, 3))
    expect(getStarMultiplier(6)).toBe(1.30)
  })

  it('getStarPassiveSlots 遞增', () => {
    for (let s = 1; s <= 5; s++) {
      expect(getStarPassiveSlots(s + 1)).toBeGreaterThanOrEqual(getStarPassiveSlots(s))
    }
  })

  it('canStarUp: 有足夠碎片 → true', () => {
    const cost = getStarUpCost(1)
    expect(canStarUp(1, cost)).toBe(true)
  })

  it('canStarUp: 碎片不足 → false', () => {
    expect(canStarUp(1, 0)).toBe(false)
  })

  it('canStarUp: 已 10 星 → false', () => {
    expect(canStarUp(10, 99999)).toBe(false)
  })

  it('canStarUp: 7 星仍可升 → true', () => {
    expect(canStarUp(7, 99999)).toBe(true)
  })

  it('getInitialStars: rarity 4 (SSR) → 0', () => {
    expect(getInitialStars(4)).toBe(0)
  })

  it('getInitialStars: rarity 2 (R) → 0', () => {
    const stars = getInitialStars(2)
    expect(stars).toBe(0)
  })
})

/* ════════════════════════════════════
   裝備系統
   ════════════════════════════════════ */
describe('progressionSystem — 裝備', () => {
  it('enhancedMainStat: 等級0不加', () => {
    expect(enhancedMainStat(100, 0)).toBe(100)
  })

  it('enhancedMainStat: 每級 +10%', () => {
    expect(enhancedMainStat(100, 5)).toBe(150)
  })

  it('getMaxEnhanceLevel(SSR) = 20', () => {
    expect(getMaxEnhanceLevel('SSR')).toBe(20)
  })

  it('getMaxEnhanceLevel(N) = 5', () => {
    expect(getMaxEnhanceLevel('N')).toBe(5)
  })

  it('getEnhanceCost 遞增', () => {
    const c0 = getEnhanceCost(0, 'R')
    const c10 = getEnhanceCost(10, 'R')
    expect(c10).toBeGreaterThan(c0)
  })
})

/* ════════════════════════════════════
   隨機副屬性
   ════════════════════════════════════ */
describe('progressionSystem — randomSubStats', () => {
  it('生成指定數量（不重複 stat）', () => {
    let seed = 42
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    const subs = randomSubStats(3, 'ATK', rng)
    expect(subs.length).toBe(3)
    const stats = subs.map(s => s.stat)
    expect(new Set(stats).size).toBe(3) // 不重複
    // mainStat 排除
    expect(stats).not.toContain('ATK')
  })

  it('count=0 → 空陣列', () => {
    expect(randomSubStats(0, 'HP')).toEqual([])
  })
})

/* ════════════════════════════════════
   套裝效果
   ════════════════════════════════════ */
describe('progressionSystem — 套裝', () => {
  it('EQUIPMENT_SETS ≥ 1 個定義', () => {
    expect(EQUIPMENT_SETS.length).toBeGreaterThanOrEqual(1)
  })

  it('getSetBonus: 存在的 set', () => {
    const first = EQUIPMENT_SETS[0]
    expect(getSetBonus(first.setId)).toBeDefined()
  })

  it('getSetBonus: 不存在的 set', () => {
    expect(getSetBonus('nonexistent')).toBeUndefined()
  })

  it('getActiveSetBonuses: 2件同套裝→激活2件效果', () => {
    const first = EQUIPMENT_SETS[0]
    const eq: EquipmentInstance[] = [
      makeEquip(first.setId, 'weapon'),
      makeEquip(first.setId, 'armor'),
    ]
    const active = getActiveSetBonuses(eq)
    if (first.requiredCount <= 2) {
      expect(active.length).toBe(1)
    } else {
      expect(active.length).toBe(0)
    }
  })
})

/* ════════════════════════════════════
   最終數值結算
   ════════════════════════════════════ */
describe('progressionSystem — getFinalStats', () => {
  const base: BaseStats = { HP: 1000, ATK: 200, DEF: 100, SPD: 100, CritRate: 10, CritDmg: 50 }

  it('lv1, asc0, star1, 無裝備 → 等於 base', () => {
    const hero: HeroInstanceData = { heroId: 1, level: 1, exp: 0, ascension: 0, stars: 1, equipment: [] }
    const s = getFinalStats(base, hero)
    expect(s.HP).toBe(1000)
    expect(s.ATK).toBe(200)
    expect(s.DEF).toBe(100)
    expect(s.SPD).toBe(100)
  })

  it('lv11 → ATK 增加 40%', () => {
    const hero: HeroInstanceData = { heroId: 1, level: 11, exp: 0, ascension: 0, stars: 1, equipment: [] }
    const s = getFinalStats(base, hero)
    expect(s.ATK).toBe(280)  // 200 * 1.4
  })

  it('裝備加持 flat stat', () => {
    const eq: EquipmentInstance = makeEquip('', 'weapon')
    eq.mainStat = 'ATK'
    eq.mainStatValue = 50
    eq.enhanceLevel = 0
    const hero: HeroInstanceData = { heroId: 1, level: 1, exp: 0, ascension: 0, stars: 1, equipment: [eq] }
    const s = getFinalStats(base, hero)
    expect(s.ATK).toBe(250) // 200 + 50
  })

  it('★4 rarity lv11 → ATK 增加 50% (5%/lv)', () => {
    const hero: HeroInstanceData = { heroId: 1, level: 11, exp: 0, ascension: 0, stars: 1, equipment: [] }
    const s = getFinalStats(base, hero, 4)
    expect(s.ATK).toBe(300)  // 200 * (1 + 10*0.05) = 200 * 1.5
  })

  it('★1 rarity lv11 → ATK 增加 30% (3%/lv)', () => {
    const hero: HeroInstanceData = { heroId: 1, level: 11, exp: 0, ascension: 0, stars: 1, equipment: [] }
    const s = getFinalStats(base, hero, 1)
    expect(s.ATK).toBe(260)  // 200 * (1 + 10*0.03) = 200 * 1.3
  })

  it('★4 asc5 star6 全部成長高於 ★1', () => {
    const hero: HeroInstanceData = { heroId: 1, level: 60, exp: 0, ascension: 5, stars: 6, equipment: [] }
    const s4 = getFinalStats(base, hero, 4)
    const s1 = getFinalStats(base, hero, 1)
    expect(s4.HP).toBeGreaterThan(s1.HP)
    expect(s4.ATK).toBeGreaterThan(s1.ATK)
    expect(s4.DEF).toBeGreaterThan(s1.DEF)
  })
})

/* ════════════════════════════════════
   Test Helpers
   ════════════════════════════════════ */
function makeEquip(setId: string, slot: 'weapon' | 'armor' | 'ring' | 'boots'): EquipmentInstance {
  return {
    equipId: `eq_test_${slot}`,
    templateId: `tpl_${slot}`,
    setId,
    slot,
    rarity: 'SR',
    mainStat: 'ATK',
    mainStatValue: 0,
    enhanceLevel: 0,
    subStats: [],
    equippedBy: '',
    locked: false,
    obtainedAt: '2025-01-01',
  }
}
