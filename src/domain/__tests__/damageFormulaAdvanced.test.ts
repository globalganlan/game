/**
 * damageFormula 進階測試 — 技能 scaling、反彈、DOT、護盾互動
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { calculateDamage, calculateHeal, calculateDot, calculateReflect } from '../damageFormula'
import { applyStatus } from '../buffSystem'
import { makeHero, makeDamageEffect, makeHealEffect, resetUidCounter } from './testHelper'

describe('damageFormula - 進階測試', () => {
  beforeEach(() => {
    resetUidCounter()
    vi.restoreAllMocks()
  })

  /* ═══════ 技能 Scaling ═══════ */

  describe('技能 Scaling', () => {
    it('ATK scaling + multiplier', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // no dodge, no crit, 中間浮動
      const attacker = makeHero({ element: 'fire', finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const target = makeHero({ element: 'fire', finalStats: { HP: 1000, ATK: 100, DEF: 100, SPD: 100, CritRate: 0, CritDmg: 50 } })

      const result = calculateDamage(attacker, target, makeDamageEffect({ scalingStat: 'ATK', multiplier: 2.0 }))

      // base = 200 * 2.0 = 400, DEF = 100 / (100 + 100) = 0.5 → 200, float ~ 0.5 → 200 * 1.0 = 200
      expect(result.damage).toBeGreaterThan(0)
      expect(result.isDodge).toBe(false)
    })

    it('HP scaling 使用 HP 基礎值', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const attacker = makeHero({
        element: 'fire',
        finalStats: { HP: 5000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const target = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 },
      })

      const result = calculateDamage(attacker, target, makeDamageEffect({ scalingStat: 'HP', multiplier: 0.1 }))

      // base = 5000 * 0.1 = 500, DEF = 100/(100+0) = 1.0 → ~500
      expect(result.damage).toBeGreaterThan(400)
    })

    it('flatValue 加算在基礎傷害上', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const attacker = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const target = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 },
      })

      const withFlat = calculateDamage(attacker, target, makeDamageEffect({ multiplier: 1.0, flatValue: 200 }))
      const without = calculateDamage(attacker, target, makeDamageEffect({ multiplier: 1.0 }))

      expect(withFlat.damage).toBeGreaterThan(without.damage)
    })
  })

  /* ═══════ 暴擊進階 ═══════ */

  describe('暴擊進階', () => {
    it('CritDmg 影響暴擊傷害倍率', () => {
      // 第一次 random: dodge check (>dodge rate → not dodge)
      // 第二次 random: crit check (< critRate → crit)
      // 第三次 random: float
      let callCount = 0
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++
        if (callCount === 2) return 0.01 // crit
        return 0.5
      })

      const attacker = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 50, CritDmg: 100 },
      })
      const target = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 },
      })

      const result = calculateDamage(attacker, target)

      expect(result.isCrit).toBe(true)
      // CritDmg=100 → 1 + 100/100 = 2x multiplier
      expect(result.damage).toBeGreaterThan(300) // 200 * 2.0 * float ~ 400
    })
  })

  /* ═══════ 閃避進階 ═══════ */

  describe('閃避進階', () => {
    it('dodge_up 75% 上限', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.74) // 剛好低於 75%

      const attacker = makeHero({ element: 'fire' })
      const target = makeHero({ element: 'fire' })
      applyStatus(target, { type: 'dodge_up', value: 0.9, duration: 3, maxStacks: 1, sourceHeroId: 'src' })

      const result = calculateDamage(attacker, target)

      expect(result.isDodge).toBe(true)
    })

    it('dodge_up 為 0 → 不閃避', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const attacker = makeHero({ element: 'fire' })
      const target = makeHero({ element: 'fire' })
      // 沒有 dodge_up

      const result = calculateDamage(attacker, target)

      expect(result.isDodge).toBe(false)
    })
  })

  /* ═══════ 反彈傷害 ═══════ */

  describe('反彈傷害', () => {
    it('有 reflect → 反彈比例傷害', () => {
      const target = makeHero()
      applyStatus(target, { type: 'reflect', value: 0.3, duration: 3, maxStacks: 1, sourceHeroId: 'src' })

      const reflected = calculateReflect(target, 100)

      expect(reflected).toBe(30) // 100 * 0.3
    })

    it('無 reflect → 0', () => {
      const target = makeHero()

      const reflected = calculateReflect(target, 100)

      expect(reflected).toBe(0)
    })

    it('反彈傷害取整', () => {
      const target = makeHero()
      applyStatus(target, { type: 'reflect', value: 0.33, duration: 3, maxStacks: 1, sourceHeroId: 'src' })

      const reflected = calculateReflect(target, 100)

      expect(reflected).toBe(33) // floor(100 * 0.33)
    })
  })

  /* ═══════ DOT 計算 ═══════ */

  describe('DOT 計算', () => {
    it('dot_burn: 來源 ATK × 30%', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const target = makeHero()

      expect(calculateDot('dot_burn', source, target)).toBe(60) // 200 * 0.3
    })

    it('dot_poison: 目標 maxHP × 3%', () => {
      const target = makeHero({ maxHP: 10000 })

      expect(calculateDot('dot_poison', undefined, target)).toBe(300) // 10000 * 0.03
    })

    it('dot_bleed: 來源 ATK × 25% × DEF 折減', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const target = makeHero({ finalStats: { HP: 1000, ATK: 100, DEF: 100, SPD: 100, CritRate: 0, CritDmg: 50 } })

      const dmg = calculateDot('dot_bleed', source, target)

      // 200 * 0.25 * (100 / (100 + 100 * 0.5)) = 50 * (100/150) ≈ 33
      expect(dmg).toBe(33)
    })

    it('未知 DOT type → 0', () => {
      expect(calculateDot('dot_unknown', undefined, makeHero())).toBe(0)
    })
  })

  /* ═══════ 恐懼增傷 ═══════ */

  describe('恐懼增傷', () => {
    it('恐懼狀態增加受到傷害', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // 控制隨機

      const attacker = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const normalTarget = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const fearedTarget = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      applyStatus(fearedTarget, { type: 'fear', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e' })

      const normalResult = calculateDamage(attacker, normalTarget)
      const fearedResult = calculateDamage(attacker, fearedTarget)

      // 恐懼增傷 ×1.2
      expect(fearedResult.damage).toBeGreaterThan(normalResult.damage)
    })
  })

  /* ═══════ 減傷 ═══════ */

  describe('減傷', () => {
    it('dmg_reduce 降低受到傷害', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const attacker = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const normalTarget = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const reducedTarget = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      applyStatus(reducedTarget, { type: 'dmg_reduce', value: 0.3, duration: 3, maxStacks: 1, sourceHeroId: 'src' })

      const normalResult = calculateDamage(attacker, normalTarget)
      const reducedResult = calculateDamage(attacker, reducedTarget)

      expect(reducedResult.damage).toBeLessThan(normalResult.damage)
    })
  })

  /* ═══════ 治療進階 ═══════ */

  describe('治療進階', () => {
    it('治療暴擊 ×1.5', () => {
      let callCount = 0
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++
        return 0.01 // 一定暴擊
      })

      const healer = makeHero({
        finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 50, CritDmg: 100 },
      })
      const target = makeHero({ currentHP: 100, maxHP: 10000 })

      const result = calculateHeal(healer, target, makeHealEffect({ multiplier: 1.0 }))

      expect(result.isCrit).toBe(true)
      // 200 * 1.0 * 1.5 = 300
      expect(result.heal).toBe(300)
    })

    it('治療 based on HP scaling', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // 不暴擊

      const healer = makeHero({
        finalStats: { HP: 5000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const target = makeHero({ currentHP: 100, maxHP: 10000 })

      const result = calculateHeal(healer, target, makeHealEffect({ scalingStat: 'HP', multiplier: 0.1 }))

      // HP 5000 * 0.1 = 500
      expect(result.heal).toBe(500)
    })
  })

  /* ═══════ 護盾吸收 in damage ═══════ */

  describe('護盾吸收 in damage', () => {
    it('護盾完全吸收 → damageType=shield', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const attacker = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 10, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      const target = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      target.shields = [{ value: 9999, duration: 5, sourceHeroId: 'src' }]

      const result = calculateDamage(attacker, target)

      expect(result.damage).toBe(0)
      expect(result.shieldAbsorbed).toBeGreaterThan(0)
      expect(result.damageType).toBe('shield')
    })
  })
})
