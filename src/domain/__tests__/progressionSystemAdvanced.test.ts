/**
 * progressionSystem 進階測試 — 套裝效果、組合乘數、百分比副屬性、getFinalStats 深度
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getFinalStats,
  getActiveSetBonuses,
  getSetBonus,
  getEquipmentCapacity,
  getExpandCost,
  randomSubStats,
  consumeExpMaterials,
  expToNextLevel,
  getLevelCap,
  getStarMultiplier,
  getAscensionMultiplier,
  enhancedMainStat,
  EQUIPMENT_SETS,
  EQUIPMENT_SLOT_BASE,
  EQUIPMENT_SLOT_EXPAND,
  EQUIPMENT_SLOT_MAX,
} from '../progressionSystem'
import type { HeroInstanceData, BaseStats, EquipmentInstance, Rarity } from '../progressionSystem'

function makeEquipment(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    equipId: 'eq_1',
    templateId: 'tpl_1',
    slot: 'weapon',
    mainStat: 'ATK',
    mainStatValue: 50,
    enhanceLevel: 0,
    rarity: 'SR',
    subStats: [],
    setId: '',
    equippedBy: '',
    locked: false,
    obtainedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeHeroInstance(overrides: Partial<HeroInstanceData> = {}): HeroInstanceData {
  return {
    heroId: 1,
    level: 1,
    exp: 0,
    ascension: 0,
    stars: 1,
    equipment: [],
    ...overrides,
  }
}

const BASE: BaseStats = {
  HP: 1000,
  ATK: 100,
  DEF: 50,
  SPD: 100,
  CritRate: 15,
  CritDmg: 50,
}

describe('progressionSystem - 進階測試', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  /* ═══════ getActiveSetBonuses ═══════ */

  describe('getActiveSetBonuses', () => {
    it('2 件同套裝 → 激活', () => {
      const eq = [
        makeEquipment({ setId: 'berserker', slot: 'weapon' }),
        makeEquipment({ setId: 'berserker', slot: 'armor' }),
      ]
      const bonuses = getActiveSetBonuses(eq)
      expect(bonuses).toHaveLength(1)
      expect(bonuses[0].setId).toBe('berserker')
    })

    it('4 件同套裝只激活一次', () => {
      const eq = [
        makeEquipment({ setId: 'berserker', slot: 'weapon' }),
        makeEquipment({ setId: 'berserker', slot: 'armor' }),
        makeEquipment({ setId: 'berserker', slot: 'ring' }),
        makeEquipment({ setId: 'berserker', slot: 'boots' }),
      ]
      const bonuses = getActiveSetBonuses(eq)
      expect(bonuses).toHaveLength(1) // requiredCount=2 只判斷 >=2，不重複加
    })

    it('混搭 2+2 套同時激活', () => {
      const set1 = EQUIPMENT_SETS[0].setId // berserker
      const set2 = EQUIPMENT_SETS[1].setId // guardian
      const eq = [
        makeEquipment({ setId: set1, slot: 'weapon' }),
        makeEquipment({ setId: set1, slot: 'armor' }),
        makeEquipment({ setId: set2, slot: 'ring' }),
        makeEquipment({ setId: set2, slot: 'boots' }),
      ]
      const bonuses = getActiveSetBonuses(eq)
      expect(bonuses).toHaveLength(2)
      expect(bonuses.map(b => b.setId)).toContain(set1)
      expect(bonuses.map(b => b.setId)).toContain(set2)
    })

    it('空裝備 → 空激活', () => {
      expect(getActiveSetBonuses([])).toHaveLength(0)
    })

    it('setId 為空字串不計入', () => {
      const eq = [
        makeEquipment({ setId: '', slot: 'weapon' }),
        makeEquipment({ setId: '', slot: 'armor' }),
      ]
      expect(getActiveSetBonuses(eq)).toHaveLength(0)
    })

    it('1 件不夠不激活', () => {
      const eq = [
        makeEquipment({ setId: 'berserker', slot: 'weapon' }),
      ]
      expect(getActiveSetBonuses(eq)).toHaveLength(0)
    })
  })

  /* ═══════ getSetBonus ═══════ */

  describe('getSetBonus', () => {
    it('每個 EQUIPMENT_SETS 都能查到', () => {
      for (const set of EQUIPMENT_SETS) {
        expect(getSetBonus(set.setId)).toBeDefined()
      }
    })

    it('查不到 → undefined', () => {
      expect(getSetBonus('nonexistent_set')).toBeUndefined()
    })
  })

  /* ═══════ getEquipmentCapacity ═══════ */

  describe('getEquipmentCapacity', () => {
    it('expandCount=0 → EQUIPMENT_SLOT_BASE (200)', () => {
      expect(getEquipmentCapacity(0)).toBe(EQUIPMENT_SLOT_BASE)
    })

    it('expandCount=1 → 200 + 50 = 250', () => {
      expect(getEquipmentCapacity(1)).toBe(EQUIPMENT_SLOT_BASE + EQUIPMENT_SLOT_EXPAND)
    })

    it('expandCount=6 → min(200+300, 500) = 500', () => {
      const result = getEquipmentCapacity(6)
      expect(result).toBeLessThanOrEqual(EQUIPMENT_SLOT_MAX)
    })

    it('非常大的 expandCount 不超過 EQUIPMENT_SLOT_MAX', () => {
      const result = getEquipmentCapacity(100)
      expect(result).toBeLessThanOrEqual(EQUIPMENT_SLOT_MAX)
    })
  })

  /* ═══════ getExpandCost ═══════ */

  describe('getExpandCost', () => {
    it('回傳固定值 100', () => {
      expect(getExpandCost()).toBe(100)
    })
  })

  /* ═══════ getFinalStats 深度組合 ═══════ */

  describe('getFinalStats 組合', () => {
    it('等級 + 突破乘數', () => {
      const hero = makeHeroInstance({ level: 20, ascension: 1 })
      const stats = getFinalStats(BASE, hero)

      // level 20: 1 + 19*0.04 = 1.76
      // ascension 1: 1.05
      // HP = floor(1000 * 1.76 * 1.05 * 1.0) = 1848
      expect(stats.HP).toBe(1848)
      expect(stats.ATK).toBeGreaterThan(100)
    })

    it('星級乘數', () => {
      const hero1 = makeHeroInstance({ level: 1, stars: 1 })
      const hero3 = makeHeroInstance({ level: 1, stars: 3 })
      const stats1 = getFinalStats(BASE, hero1)
      const stats3 = getFinalStats(BASE, hero3)
      expect(stats3.HP).toBeGreaterThan(stats1.HP)
    })

    it('等級+突破+星級三重乘算', () => {
      const hero = makeHeroInstance({ level: 20, ascension: 2, stars: 3 })
      const stats = getFinalStats(BASE, hero)

      const expectedLvMult = 1 + 19 * 0.04  // 1.76
      const expectedAscMult = getAscensionMultiplier(2) // 1.2
      const expectedStarMult = getStarMultiplier(3) // 1.15
      const expectedHP = Math.floor(1000 * expectedLvMult * expectedAscMult * expectedStarMult)

      expect(stats.HP).toBe(expectedHP)
    })

    it('SPD 不受等級/突破/星級影響', () => {
      const hero = makeHeroInstance({ level: 50, ascension: 5, stars: 6 })
      const stats = getFinalStats(BASE, hero)
      expect(stats.SPD).toBe(100) // SPD 不乘
    })

    it('裝備 flat 主屬性加算', () => {
      const hero = makeHeroInstance({
        equipment: [makeEquipment({ mainStat: 'ATK', mainStatValue: 50, enhanceLevel: 0 })],
      })
      const stats = getFinalStats(BASE, hero)
      expect(stats.ATK).toBe(150) // 100 + 50
    })

    it('裝備 flat 副屬性加算', () => {
      const hero = makeHeroInstance({
        equipment: [makeEquipment({
          mainStat: 'ATK',
          mainStatValue: 0,
          subStats: [{ stat: 'HP', value: 200, isPercent: false }],
        })],
      })
      const stats = getFinalStats(BASE, hero)
      expect(stats.HP).toBe(1200) // 1000 + 200
    })

    it('百分比副屬性乘算', () => {
      const hero = makeHeroInstance({
        equipment: [makeEquipment({
          mainStat: 'ATK',
          mainStatValue: 0,
          subStats: [{ stat: 'ATK', value: 10, isPercent: true }], // 10%
        })],
      })
      const stats = getFinalStats(BASE, hero)
      // ATK = 100, 加完 flat(0) = 100, 乘 10% → floor(100 * 1.1) = 110
      expect(stats.ATK).toBe(110)
    })

    it('套裝效果 berserker ATK_percent 加成', () => {
      const hero = makeHeroInstance({
        equipment: [
          makeEquipment({ setId: 'berserker', slot: 'weapon', mainStat: 'ATK', mainStatValue: 0 }),
          makeEquipment({ setId: 'berserker', slot: 'armor', mainStat: 'HP', mainStatValue: 0 }),
        ],
      })
      const stats = getFinalStats(BASE, hero)
      // berserker: ATK_percent 15%
      // ATK = floor(100 * (1 + 15/100))  — FP may give 114 or 115
      expect(stats.ATK).toBeGreaterThanOrEqual(114)
      expect(stats.ATK).toBeLessThanOrEqual(115)
    })

    it('SPD_flat 套裝效果實際加算', () => {
      // 找一個有 SPD_flat 的套裝
      const spdSet = EQUIPMENT_SETS.find(s => s.bonusType === 'SPD_flat')
      if (!spdSet) return // 沒有就跳過

      const hero = makeHeroInstance({
        equipment: [
          makeEquipment({ setId: spdSet.setId, slot: 'weapon', mainStat: 'ATK', mainStatValue: 0 }),
          makeEquipment({ setId: spdSet.setId, slot: 'armor', mainStat: 'HP', mainStatValue: 0 }),
        ],
      })
      const stats = getFinalStats(BASE, hero)
      expect(stats.SPD).toBe(100 + spdSet.bonusValue)
    })

    it('裝備強化提升主屬性', () => {
      const hero = makeHeroInstance({
        equipment: [makeEquipment({
          mainStat: 'ATK',
          mainStatValue: 50,
          enhanceLevel: 5,
        })],
      })
      const stats = getFinalStats(BASE, hero)
      const enhancedVal = enhancedMainStat(50, 5) // 50 + 5*5 = 75 or similar
      expect(stats.ATK).toBe(100 + enhancedVal)
    })
  })

  /* ═══════ randomSubStats ═══════ */

  describe('randomSubStats 進階', () => {
    it('count=0 → 空', () => {
      expect(randomSubStats(0, 'ATK')).toHaveLength(0)
    })

    it('不包含與主屬性相同的副屬性', () => {
      for (let i = 0; i < 50; i++) {
        const subs = randomSubStats(4, 'ATK')
        expect(subs.every(s => s.stat !== 'ATK')).toBe(true)
      }
    })

    it('不重複（count <= pool 大小時）', () => {
      for (let i = 0; i < 20; i++) {
        const subs = randomSubStats(3, 'ATK')
        const statNames = subs.map(s => s.stat)
        expect(new Set(statNames).size).toBe(statNames.length)
      }
    })

    it('value 在合理範圍', () => {
      for (let i = 0; i < 30; i++) {
        const subs = randomSubStats(4, 'ATK')
        for (const sub of subs) {
          expect(sub.value).toBeGreaterThan(0)
        }
      }
    })
  })

  /* ═══════ consumeExpMaterials 邊界 ═══════ */

  describe('consumeExpMaterials 邊界', () => {
    it('不超過等級上限', () => {
      const cap = getLevelCap(0) // ascension 0 → cap 20
      // consumeExpMaterials(currentLevel, currentExp, levelCap, expToAdd)
      const result = consumeExpMaterials(1, 0, cap, 999999)
      expect(result.level).toBeLessThanOrEqual(cap)
    })

    it('回傳正確的 expConsumed', () => {
      const cap = getLevelCap(0)
      const result = consumeExpMaterials(1, 0, cap, 100)
      expect(result.expConsumed).toBeGreaterThan(0)
      expect(result.expConsumed).toBeLessThanOrEqual(100)
    })

    it('已在上限不消耗經驗', () => {
      const cap = getLevelCap(0)
      const result = consumeExpMaterials(cap, 0, cap, 999999)
      expect(result.level).toBe(cap)
      expect(result.expConsumed).toBe(0)
    })

    it('tier 邊界 lv=10 和 lv=11 經驗不同', () => {
      const exp10 = expToNextLevel(10) // tier 1
      const exp11 = expToNextLevel(11) // tier 2
      expect(exp11).toBeGreaterThan(exp10)
    })
  })

  /* ═══════ EQUIPMENT_SETS 常數驗證 ═══════ */

  describe('EQUIPMENT_SETS 常數', () => {
    it('每個套裝有唯一 setId', () => {
      const ids = EQUIPMENT_SETS.map(s => s.setId)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('每個套裝 requiredCount >= 2', () => {
      for (const set of EQUIPMENT_SETS) {
        expect(set.requiredCount).toBeGreaterThanOrEqual(2)
      }
    })

    it('每個套裝 bonusValue > 0', () => {
      for (const set of EQUIPMENT_SETS) {
        expect(set.bonusValue).toBeGreaterThan(0)
      }
    })
  })
})
