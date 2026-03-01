import { describe, it, expect } from 'vitest'
import {
  generateEquipment,
  equipSinglePull,
  equipTenPull,
  getEquipPullCost,
  getEquipDisplayName,
  getEquipPoolRates,
  openEquipmentChest,
  getChestRates,
  SET_NAMES,
  SLOT_NAMES,
  EQUIP_GOLD_SINGLE,
  EQUIP_GOLD_TEN,
  EQUIP_DIAMOND_SINGLE,
  EQUIP_DIAMOND_TEN,
} from '../equipmentGacha'
import type { EquipPoolType, EquipPullResult } from '../equipmentGacha'
import type { Rarity, EquipmentSlot } from '../progressionSystem'
import { EQUIPMENT_SUB_STAT_COUNT } from '../progressionSystem'

/* ═══ Seeded RNG helper ═══ */
function seededRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

describe('equipmentGacha', () => {
  /* ──────────── Constants ──────────── */
  describe('constants', () => {
    it('gold pool costs', () => {
      expect(EQUIP_GOLD_SINGLE).toBe(10_000)
      expect(EQUIP_GOLD_TEN).toBe(90_000)
    })
    it('diamond pool costs', () => {
      expect(EQUIP_DIAMOND_SINGLE).toBe(200)
      expect(EQUIP_DIAMOND_TEN).toBe(1_800)
    })
    it('SET_NAMES has 8 sets', () => {
      expect(Object.keys(SET_NAMES)).toHaveLength(8)
    })
    it('SLOT_NAMES has 4 slots', () => {
      expect(Object.keys(SLOT_NAMES)).toHaveLength(4)
    })
  })

  /* ──────────── Pool Rates ──────────── */
  describe('getEquipPoolRates', () => {
    it('gold rates sum to 1', () => {
      const r = getEquipPoolRates('gold')
      expect(r.SSR + r.SR + r.R + r.N).toBeCloseTo(1, 5)
    })
    it('diamond rates sum to 1', () => {
      const r = getEquipPoolRates('diamond')
      expect(r.SSR + r.SR + r.R + r.N).toBeCloseTo(1, 5)
    })
    it('diamond SSR is higher than gold SSR', () => {
      expect(getEquipPoolRates('diamond').SSR).toBeGreaterThan(getEquipPoolRates('gold').SSR)
    })
  })

  /* ──────────── generateEquipment ──────────── */
  describe('generateEquipment', () => {
    const rarities: Rarity[] = ['N', 'R', 'SR', 'SSR']

    for (const rar of rarities) {
      it(`generates valid ${rar} equipment`, () => {
        const eq = generateEquipment(rar, seededRng(42))
        expect(eq.rarity).toBe(rar)
        expect(eq.equipId).toMatch(/^EQ_/)
        expect(eq.templateId).toMatch(/^eq_/)
        expect(eq.setId).toBeTruthy()
        expect(['weapon', 'armor', 'ring', 'boots']).toContain(eq.slot)
        expect(eq.enhanceLevel).toBe(0)
        expect(eq.equippedBy).toBe('')
        expect(eq.locked).toBe(false)
        expect(eq.obtainedAt).toBeTruthy()
        expect(eq.mainStat).toBeTruthy()
        expect(eq.mainStatValue).toBeGreaterThan(0)
        expect(eq.subStats.length).toBe(EQUIPMENT_SUB_STAT_COUNT[rar])
      })
    }

    it('slot→mainStat mapping is correct', () => {
      // Force each slot by using different seeds
      const expected: Record<EquipmentSlot, string> = {
        weapon: 'ATK', armor: 'HP', ring: 'DEF', boots: 'SPD',
      }
      // Generate many and check mapping
      for (let i = 0; i < 200; i++) {
        const eq = generateEquipment('SR', seededRng(i))
        expect(expected[eq.slot as EquipmentSlot]).toBe(eq.mainStat)
      }
    })

    it('equipId is unique across multiple calls', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 50; i++) {
        // Use different seeds to get different hex suffixes
        const eq = generateEquipment('R', seededRng(i * 7 + 1))
        ids.add(eq.equipId)
      }
      // Most should be unique (timestamps might collide but hex part differs)
      expect(ids.size).toBeGreaterThan(30)
    })
  })

  /* ──────────── Single Pull ──────────── */
  describe('equipSinglePull', () => {
    it('returns one result with valid structure', () => {
      const result = equipSinglePull('gold', seededRng(1))
      expect(result.equipment).toBeDefined()
      expect(result.isGuaranteed).toBe(false) // single pull never guaranteed
      expect(result.equipment.rarity).toBeTruthy()
    })

    it('gold pool produces more N/R than diamond', () => {
      let goldLow = 0, diamondLow = 0
      const N = 2000
      const rngG = seededRng(123)
      const rngD = seededRng(123)
      for (let i = 0; i < N; i++) {
        const g = equipSinglePull('gold', rngG)
        const d = equipSinglePull('diamond', rngD)
        if (g.equipment.rarity === 'N' || g.equipment.rarity === 'R') goldLow++
        if (d.equipment.rarity === 'N' || d.equipment.rarity === 'R') diamondLow++
      }
      expect(goldLow).toBeGreaterThan(diamondLow)
    })
  })

  /* ──────────── Ten Pull ──────────── */
  describe('equipTenPull', () => {
    it('returns exactly 10 results', () => {
      const results = equipTenPull('gold', seededRng(99))
      expect(results).toHaveLength(10)
    })

    it('guarantees at least 1 SR+ in 10-pull', () => {
      // Run many 10-pulls; every single one must have at least 1 SR+
      for (let seed = 0; seed < 100; seed++) {
        const results = equipTenPull('gold', seededRng(seed))
        const hasSRPlus = results.some(
          r => r.equipment.rarity === 'SR' || r.equipment.rarity === 'SSR'
        )
        expect(hasSRPlus).toBe(true)
      }
    })

    it('marks guaranteed flag when upgrade happens', () => {
      // Force all-N scenario: rng that always returns high values (N range)
      // For gold pool: N range is roll > 0.50 (i.e. SSR:0.02 + SR:0.13 + R:0.35 = 0.50)
      const alwaysLow = () => 0.99 // always lands in N territory
      const results = equipTenPull('gold', alwaysLow)
      const guaranteed = results.filter(r => r.isGuaranteed)
      expect(guaranteed.length).toBe(1)
      expect(guaranteed[0].equipment.rarity).toBe('SR')
    })

    it('no guaranteed flag when natural SR+ exists', () => {
      // Force first pull to be SSR (rng returns 0.001 first, then 0.99)
      let callCount = 0
      const mixedRng = () => {
        callCount++
        // First call is the rarity roll — return SSR territory
        if (callCount === 1) return 0.001
        // Subsequent rarity rolls return N territory
        if (callCount % 5 === 0) return 0.99
        return 0.5
      }
      const results = equipTenPull('gold', mixedRng)
      // Should have natural SSR, so no guaranteed upgrades needed
      const guaranteed = results.filter(r => r.isGuaranteed)
      expect(guaranteed.length).toBe(0)
    })
  })

  /* ──────────── Cost ──────────── */
  describe('getEquipPullCost', () => {
    it('gold single', () => {
      const c = getEquipPullCost('gold', 1)
      expect(c).toEqual({ type: 'gold', amount: 10_000 })
    })
    it('gold ten', () => {
      const c = getEquipPullCost('gold', 10)
      expect(c).toEqual({ type: 'gold', amount: 90_000 })
    })
    it('diamond single', () => {
      const c = getEquipPullCost('diamond', 1)
      expect(c).toEqual({ type: 'diamond', amount: 200 })
    })
    it('diamond ten', () => {
      const c = getEquipPullCost('diamond', 10)
      expect(c).toEqual({ type: 'diamond', amount: 1_800 })
    })
  })

  /* ──────────── Display Name ──────────── */
  describe('getEquipDisplayName', () => {
    it('returns Chinese set+slot name', () => {
      const eq = generateEquipment('SR', seededRng(7))
      const name = getEquipDisplayName(eq)
      // Should contain chinese chars from SET_NAMES + SLOT_NAMES
      expect(name.length).toBeGreaterThan(0)
      const setName = SET_NAMES[eq.setId]
      const slotName = SLOT_NAMES[eq.slot as EquipmentSlot]
      expect(name).toBe(`${setName}${slotName}`)
    })
  })

  /* ──────────── Distribution Smoke Test ──────────── */
  describe('distribution smoke test', () => {
    it('gold pool SSR rate is approximately 2%', () => {
      const N = 10000
      let ssrCount = 0
      const rng = seededRng(777)
      for (let i = 0; i < N; i++) {
        const r = equipSinglePull('gold', rng)
        if (r.equipment.rarity === 'SSR') ssrCount++
      }
      const rate = ssrCount / N
      // Allow wide margin: 0.5% ~ 5%
      expect(rate).toBeGreaterThan(0.005)
      expect(rate).toBeLessThan(0.05)
    })

    it('diamond pool SSR rate is approximately 8%', () => {
      const N = 10000
      let ssrCount = 0
      const rng = seededRng(888)
      for (let i = 0; i < N; i++) {
        const r = equipSinglePull('diamond', rng)
        if (r.equipment.rarity === 'SSR') ssrCount++
      }
      const rate = ssrCount / N
      // Allow wide margin: 3% ~ 15%
      expect(rate).toBeGreaterThan(0.03)
      expect(rate).toBeLessThan(0.15)
    })
  })

  /* ──────────── Equipment Chest ──────────── */
  describe('openEquipmentChest', () => {
    it('returns a valid EquipmentInstance', () => {
      const eq = openEquipmentChest(seededRng(42))
      expect(eq.equipId).toMatch(/^EQ_/)
      expect(eq.rarity).toBeTruthy()
      expect(eq.mainStat).toBeTruthy()
      expect(eq.mainStatValue).toBeGreaterThan(0)
      expect(['weapon', 'armor', 'ring', 'boots']).toContain(eq.slot)
    })

    it('chest rates sum to 1', () => {
      const r = getChestRates()
      expect(r.SSR + r.SR + r.R + r.N).toBeCloseTo(1, 5)
    })

    it('chest SSR rate is approximately 5%', () => {
      const N = 10000
      let ssrCount = 0
      const rng = seededRng(999)
      for (let i = 0; i < N; i++) {
        const eq = openEquipmentChest(rng)
        if (eq.rarity === 'SSR') ssrCount++
      }
      const rate = ssrCount / N
      // 5% target, accept 1.5% ~ 10%
      expect(rate).toBeGreaterThan(0.015)
      expect(rate).toBeLessThan(0.10)
    })

    it('chest produces all rarities', () => {
      const rarities = new Set<string>()
      const rng = seededRng(123)
      for (let i = 0; i < 500; i++) {
        rarities.add(openEquipmentChest(rng).rarity)
      }
      expect(rarities.size).toBe(4) // N, R, SR, SSR
    })
  })
})
