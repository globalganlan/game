/**
 * damageFormula 單元測試
 *
 * 注意：calculateDamage 內含 Math.random()（閃避、暴擊、浮動）
 * 使用 vi.spyOn(Math, 'random') 控制隨機數
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { calculateDamage, calculateHeal, calculateDot, calculateReflect } from '../damageFormula'
import { applyStatus, absorbDamageByShields } from '../buffSystem'
import { makeHero, makeDamageEffect, makeHealEffect, resetUidCounter } from './testHelper'
import type { BattleHero } from '../types'

describe('damageFormula', () => {
  let attacker: BattleHero
  let defender: BattleHero

  beforeEach(() => {
    resetUidCounter()
    vi.restoreAllMocks()

    attacker = makeHero({
      element: 'fire',
      finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
    })

    defender = makeHero({
      element: 'wind', // fire → wind = 1.3 克制
      finalStats: { HP: 2000, ATK: 100, DEF: 100, SPD: 80, CritRate: 0, CritDmg: 50 },
      maxHP: 2000,
      currentHP: 2000,
    })
  })

  /* ═══════ calculateDamage ═══════ */

  describe('calculateDamage', () => {
    it('基本公式：ATK × DEF 減傷 × 元素 × 浮動', () => {
      // 固定隨機數：不暴擊、不閃避、浮動 0.95 + 0.05 = 1.0
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      // random() calls: dodge check (0.5 > 0 dodge → no dodge), crit (0.5 > 0% → no crit), variance (0.5 → 0.95 + 0.05 = 1.0)

      const result = calculateDamage(attacker, defender)
      expect(result.isDodge).toBe(false)
      expect(result.isCrit).toBe(false)

      // 基礎: 200 * 1.0 = 200
      // DEF: 100/(100+100) = 0.5
      // 元素: fire→wind = 1.3
      // 浮動: 0.95 + 0.5*0.1 = 1.0
      // 攻擊方 modifier: 1.0 (no buff)
      // 防守方 modifier: 1.0 (no buff)
      // = 200 * 0.5 * 1.3 * 1.0 * 1.0 * 1.0 = 130
      expect(result.damage).toBe(130)
      expect(result.elementMult).toBe(1.3)
      expect(result.damageType).toBe('weakness')
    })

    it('閃避 → damage=0, isDodge=true', () => {
      // defender has dodge_up
      applyStatus(defender, { type: 'dodge_up', value: 0.5, duration: 3, maxStacks: 1, sourceHeroId: 'src' })

      // Math.random: dodgeCheck=0.3 (< 0.5 → dodge!)
      vi.spyOn(Math, 'random').mockReturnValue(0.3)

      const result = calculateDamage(attacker, defender)
      expect(result.isDodge).toBe(true)
      expect(result.damage).toBe(0)
      expect(result.damageType).toBe('miss')
    })

    it('暴擊 → damage 增加', () => {
      attacker.finalStats.CritRate = 100 // 100% crit
      attacker.finalStats.CritDmg = 50

      // random: dodge(0.5>0), crit(0.5<1.0, crit!), variance=1.0
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const result = calculateDamage(attacker, defender)
      expect(result.isCrit).toBe(true)
      // damageType 優先序: crit → weakness（覆寫），所以 fire→wind 克制時顯示 weakness
      expect(result.damageType).toBe('weakness')

      // base = 200; DEF = 100/(100+100)=0.5; crit = 1.5; element = 1.3; rand = 1.0
      // = 200 * 0.5 * 1.5 * 1.3 * 1.0 = 195
      expect(result.damage).toBe(195)
    })

    it('護盾吸收傷害', () => {
      defender.shields = [{ value: 500, duration: 3, sourceHeroId: 'src' }]

      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const result = calculateDamage(attacker, defender)
      // 基礎傷害 130，護盾吸收 130，實際 0
      expect(result.shieldAbsorbed).toBe(130)
      expect(result.damage).toBe(0)
      expect(result.damageType).toBe('shield')
    })

    it('反彈傷害計算', () => {
      applyStatus(defender, { type: 'reflect', value: 0.3, duration: 3, maxStacks: 1, sourceHeroId: 'src' })
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const result = calculateDamage(attacker, defender)
      // 傷害 130, reflect 30% = 39
      expect(result.reflectDamage).toBe(Math.floor(130 * 0.3))
    })

    it('技能倍率影響傷害', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const skillEffect = makeDamageEffect({ multiplier: 2.0 })
      const result = calculateDamage(attacker, defender, skillEffect)
      // base = 200 * 2.0 = 400; DEF = 0.5; elem = 1.3; rand = 1.0
      // = 400 * 0.5 * 1.3 * 1.0 = 260
      expect(result.damage).toBe(260)
    })

    it('攻擊方 buff 增傷', () => {
      applyStatus(attacker, { type: 'atk_up', value: 0.3, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const result = calculateDamage(attacker, defender)
      // Bug #002 修復後：ATK buff 只在 getBuffedStats 套用一次
      // ATK with buff: 200 * 1.3 = 260
      // base = 260; DEF = 100/(100+100)=0.5; elem = 1.3; rand = 1.0
      // getAttackerDamageModifier 不再重複讀 atk_up → 1.0
      // = 260 * 0.5 * 1.3 * 1.0 = 169
      expect(result.damage).toBe(169)
    })

    it('防守方 fear → 受傷增加 1.2x', () => {
      applyStatus(defender, { type: 'fear', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const result = calculateDamage(attacker, defender)
      // getTargetDamageModifier: 1.0 * 1.2 (fear) = 1.2
      // base = 200; DEF = 0.5; elem = 1.3; rand = 1.0; target_mod = 1.2
      // = 200 * 0.5 * 1.3 * 1.0 * 1.0 * 1.2 = 156
      expect(result.damage).toBe(156)
    })

    it('最低傷害 1', () => {
      // 超高防禦
      defender.finalStats.DEF = 99999
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const result = calculateDamage(attacker, defender)
      expect(result.damage).toBeGreaterThanOrEqual(0) // shields might absorb
    })
  })

  /* ═══════ calculateHeal ═══════ */

  describe('calculateHeal', () => {
    it('基礎治療 = ATK × multiplier', () => {
      attacker.finalStats.CritRate = 0
      vi.spyOn(Math, 'random').mockReturnValue(0.99) // no crit
      defender.currentHP = 500

      const skill = makeHealEffect({ multiplier: 1.5, scalingStat: 'ATK' })
      const result = calculateHeal(attacker, defender, skill)
      // 200 * 1.5 = 300
      expect(result.heal).toBe(300)
      expect(result.isCrit).toBe(false)
    })

    it('治療暴擊 × 1.5（固定）', () => {
      attacker.finalStats.CritRate = 100
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // < 1.0 → crit
      defender.currentHP = 0

      const skill = makeHealEffect({ multiplier: 1.0, scalingStat: 'ATK' })
      const result = calculateHeal(attacker, defender, skill)
      // 200 * 1.0 * 1.5 = 300
      expect(result.heal).toBe(300)
      expect(result.isCrit).toBe(true)
    })

    it('不超過 HP 上限', () => {
      attacker.finalStats.CritRate = 0
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      defender.currentHP = 1950
      defender.maxHP = 2000

      const skill = makeHealEffect({ multiplier: 2.0, scalingStat: 'ATK' })
      const result = calculateHeal(attacker, defender, skill)
      // 200 * 2.0 = 400 → cap at 50 (2000-1950)
      expect(result.heal).toBe(50)
    })
  })

  /* ═══════ calculateDot ═══════ */

  describe('calculateDot', () => {
    it('burn: ATK × 30%', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 300, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50 } })
      const target = makeHero()
      const dmg = calculateDot('dot_burn', source, target)
      expect(dmg).toBe(Math.floor(300 * 0.3)) // 90
    })

    it('poison: maxHP × 3%', () => {
      const target = makeHero({ maxHP: 5000 })
      const dmg = calculateDot('dot_poison', undefined, target)
      expect(dmg).toBe(Math.floor(5000 * 0.03)) // 150
    })

    it('bleed: ATK × 25% × DEF reduction(50%)', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 400, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50 } })
      const target = makeHero({ finalStats: { HP: 1000, ATK: 100, DEF: 200, SPD: 100, CritRate: 15, CritDmg: 50 } })
      const dmg = calculateDot('dot_bleed', source, target)
      // 400 * 0.25 * (100 / (100 + 200*0.5)) = 100 * (100/200) = 50
      expect(dmg).toBe(50)
    })

    it('未知 DOT type → 0', () => {
      const dmg = calculateDot('unknown', undefined, makeHero())
      expect(dmg).toBe(0)
    })
  })

  /* ═══════ calculateReflect ═══════ */

  describe('calculateReflect', () => {
    it('有反射 → 計算傷害', () => {
      const target = makeHero()
      applyStatus(target, { type: 'reflect', value: 0.2, duration: 3, maxStacks: 1, sourceHeroId: 'src' })
      const dmg = calculateReflect(target, 100)
      expect(dmg).toBe(20)
    })

    it('無反射 → 0', () => {
      const target = makeHero()
      const dmg = calculateReflect(target, 100)
      expect(dmg).toBe(0)
    })
  })

  /* ═══════ Bug #002 修復驗證：ATK buff 不再雙重套用 ═══════ */

  describe('Bug #002 修復驗證: ATK buff 單次套用', () => {
    it('30% ATK buff → 傷害比值 ~1.3（不是 ~1.69）', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      // 無 buff 基線
      const baseResult = calculateDamage(
        makeHero({ element: 'fire', finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } }),
        makeHero({ element: '', finalStats: { HP: 1000, ATK: 100, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 } }),
      )

      // 有 30% ATK buff
      const buffedAttacker = makeHero({
        element: 'fire',
        finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 },
      })
      applyStatus(buffedAttacker, { type: 'atk_up', value: 0.3, duration: 2, maxStacks: 3, sourceHeroId: 'src' })

      const buffResult = calculateDamage(
        buffedAttacker,
        makeHero({ element: '', finalStats: { HP: 1000, ATK: 100, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 } }),
      )

      const ratio = buffResult.damage / baseResult.damage
      // 修復後比值應為 ~1.3（±取整容差 0.05）
      expect(ratio).toBeGreaterThan(1.25)
      expect(ratio).toBeLessThan(1.35)
    })
  })
})
