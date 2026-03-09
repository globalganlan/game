/**
 * buffSystem 單元測試
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyStatus,
  removeStatus,
  cleanse,
  processDotEffects,
  processRegen,
  tickStatusDurations,
  tickShieldDurations,
  getStatusValue,
  hasStatus,
  isControlled,
  isSilenced,
  isFeared,
  hasTaunt,
  isDebuff,
  getBuffedStats,
  absorbDamageByShields,
} from '../buffSystem'
import { makeHero, makeShield, resetUidCounter } from './testHelper'
import type { BattleHero } from '../types'

describe('buffSystem', () => {
  beforeEach(() => {
    resetUidCounter()
  })

  /* ═══════ applyStatus ═══════ */

  describe('applyStatus', () => {
    it('新增一個 buff', () => {
      const hero = makeHero()
      const result = applyStatus(hero, {
        type: 'atk_up',
        value: 0.2,
        duration: 2,
        maxStacks: 3,
        sourceHeroId: 'src',
      })
      expect(result).toBe(true)
      expect(hero.statusEffects).toHaveLength(1)
      expect(hero.statusEffects[0].stacks).toBe(1)
    })

    it('疊加 buff stacks', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      expect(hero.statusEffects).toHaveLength(1)
      expect(hero.statusEffects[0].stacks).toBe(2)
      expect(hero.statusEffects[0].value).toBe(0.4) // 0.2 + 0.2
    })

    it('不超過 maxStacks', () => {
      const hero = makeHero()
      for (let i = 0; i < 5; i++) {
        applyStatus(hero, { type: 'atk_up', value: 0.1, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      }
      expect(hero.statusEffects[0].stacks).toBe(3)
    })

    it('控制效果不疊加，只刷新 duration', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'stun', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'src' })
      applyStatus(hero, { type: 'stun', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'src' })
      expect(hero.statusEffects).toHaveLength(1)
      expect(hero.statusEffects[0].stacks).toBe(1) // 不疊加
      expect(hero.statusEffects[0].duration).toBe(3) // 刷新為較長
    })

    it('免疫時不施加 debuff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'immunity', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      const result = applyStatus(hero, { type: 'stun', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      expect(result).toBe(false)
      expect(hero.statusEffects.filter(s => s.type === 'stun')).toHaveLength(0)
    })

    it('免疫不阻擋 buff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'immunity', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      const result = applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      expect(result).toBe(true)
    })
  })

  /* ═══════ removeStatus ═══════ */

  describe('removeStatus', () => {
    it('移除指定類型', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      applyStatus(hero, { type: 'def_up', value: 0.2, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      removeStatus(hero, 'atk_up')
      expect(hero.statusEffects).toHaveLength(1)
      expect(hero.statusEffects[0].type).toBe('def_up')
    })
  })

  /* ═══════ cleanse ═══════ */

  describe('cleanse', () => {
    it('淨化一個 debuff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'dot_burn', value: 0.3, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      applyStatus(hero, { type: 'stun', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'src' })
      applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 2, maxStacks: 3, sourceHeroId: 'src' })

      const removed = cleanse(hero, 1)
      expect(removed).toHaveLength(1)
      // 移除第一個 debuff（dot_burn 是第一個符合的）
      expect(removed[0]).toBe('dot_burn')
      // buff 不受影響
      expect(hasStatus(hero, 'atk_up')).toBe(true)
    })

    it('淨化數量超過 debuff 數 → 只移除現有的', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'stun', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'src' })
      const removed = cleanse(hero, 5)
      expect(removed).toHaveLength(1)
    })
  })

  /* ═══════ processDotEffects ═══════ */

  describe('processDotEffects', () => {
    it('燃燒造成 ATK×30% 傷害', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50 } })
      const target = makeHero()
      target.statusEffects.push({
        type: 'dot_burn',
        value: 0.3,
        duration: 2,
        stacks: 1,
        maxStacks: 3,
        sourceHeroId: source.uid,
      })

      const allHeroes = [source, target]
      const results = processDotEffects(target, allHeroes)

      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('dot_burn')
      expect(results[0].damage).toBe(Math.floor(200 * 0.3)) // 60
      expect(target.currentHP).toBe(1000 - 60)
    })

    it('毒造成 maxHP×3%', () => {
      const target = makeHero({ maxHP: 2000, currentHP: 2000 })
      target.statusEffects.push({
        type: 'dot_poison',
        value: 0.03,
        duration: 2,
        stacks: 1,
        maxStacks: 3,
        sourceHeroId: 'src',
      })

      const results = processDotEffects(target, [target])
      expect(results[0].damage).toBe(Math.floor(2000 * 0.03)) // 60
    })

    it('DOT 多層疊加造傷', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50 } })
      const target = makeHero()
      target.statusEffects.push({
        type: 'dot_burn',
        value: 0.3,
        duration: 2,
        stacks: 3,
        maxStacks: 3,
        sourceHeroId: source.uid,
      })

      const results = processDotEffects(target, [source, target])
      expect(results[0].damage).toBe(Math.floor(200 * 0.3 * 3)) // 180
    })

    it('HP 不低於 0', () => {
      const target = makeHero({ currentHP: 10 })
      target.statusEffects.push({
        type: 'dot_poison',
        value: 0.03,
        duration: 2,
        stacks: 10,
        maxStacks: 10,
        sourceHeroId: 'src',
      })

      processDotEffects(target, [target])
      expect(target.currentHP).toBeGreaterThanOrEqual(0)
    })
  })

  /* ═══════ processRegen ═══════ */

  describe('processRegen', () => {
    it('恢復 maxHP × value × stacks', () => {
      const hero = makeHero({ maxHP: 1000, currentHP: 500 })
      hero.statusEffects.push({
        type: 'regen',
        value: 0.05,
        duration: 3,
        stacks: 1,
        maxStacks: 3,
        sourceHeroId: 'src',
      })

      const healed = processRegen(hero)
      expect(healed).toBe(50) // 1000 * 0.05 * 1
      expect(hero.currentHP).toBe(550)
    })

    it('不超過 maxHP', () => {
      const hero = makeHero({ maxHP: 1000, currentHP: 990 })
      hero.statusEffects.push({
        type: 'regen',
        value: 0.05,
        duration: 3,
        stacks: 1,
        maxStacks: 3,
        sourceHeroId: 'src',
      })

      const healed = processRegen(hero)
      expect(healed).toBe(10) // cap at maxHP
      expect(hero.currentHP).toBe(1000)
    })
  })

  /* ═══════ tickStatusDurations ═══════ */

  describe('tickStatusDurations', () => {
    it('倒數 duration 並移除到期的', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 1, maxStacks: 3, sourceHeroId: 'src' })
      applyStatus(hero, { type: 'def_up', value: 0.2, duration: 3, maxStacks: 3, sourceHeroId: 'src' })

      const expired = tickStatusDurations(hero)
      expect(expired).toContain('atk_up')
      // BUG #003 已修復: duration 1→0 的效果現在會被正確移除
      expect(hero.statusEffects.some(s => s.type === 'atk_up')).toBe(false)
      expect(hero.statusEffects.some(s => s.type === 'def_up')).toBe(true)
      expect(hero.statusEffects.find(s => s.type === 'def_up')!.duration).toBe(2)
    })

    it('永久效果（duration=0）不倒數不移除', () => {
      const hero = makeHero()
      hero.statusEffects.push({
        type: 'atk_up',
        value: 0.1,
        duration: 0, // permanent
        stacks: 1,
        maxStacks: 1,
        sourceHeroId: 'src',
      })

      tickStatusDurations(hero)
      // isPermaBuff should keep it
      expect(hero.statusEffects).toHaveLength(1)
    })
  })

  /* ═══════ tickShieldDurations ═══════ */

  describe('tickShieldDurations', () => {
    it('護盾倒數並移除到期', () => {
      const hero = makeHero()
      hero.shields = [makeShield({ duration: 1 }), makeShield({ duration: 3 })]
      tickShieldDurations(hero)
      expect(hero.shields).toHaveLength(1) // duration=1 → 0 → removed
    })

    it('空護盾被移除', () => {
      const hero = makeHero()
      hero.shields = [makeShield({ value: 0, duration: 3 })]
      tickShieldDurations(hero)
      expect(hero.shields).toHaveLength(0)
    })
  })

  /* ═══════ 狀態查詢函式 ═══════ */

  describe('status queries', () => {
    it('getStatusValue 加總同類型', () => {
      const hero = makeHero()
      hero.statusEffects.push(
        { type: 'atk_up', value: 0.2, duration: 2, stacks: 2, maxStacks: 5, sourceHeroId: 'a' },
        { type: 'atk_up', value: 0.1, duration: 3, stacks: 1, maxStacks: 5, sourceHeroId: 'b' },
      )
      // value 已在 applyStatus 中按疊加累加，getStatusValue 直接加總 value
      // 0.2 + 0.1 = 0.3
      expect(getStatusValue(hero, 'atk_up')).toBeCloseTo(0.3)
    })

    it('hasStatus / isControlled / isSilenced / isFeared / hasTaunt', () => {
      const hero = makeHero()
      expect(isControlled(hero)).toBe(false)

      applyStatus(hero, { type: 'stun', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'src' })
      expect(isControlled(hero)).toBe(true)
      expect(hasStatus(hero, 'stun')).toBe(true)

      removeStatus(hero, 'stun')
      applyStatus(hero, { type: 'silence', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'src' })
      expect(isSilenced(hero)).toBe(true)

      removeStatus(hero, 'silence')
      applyStatus(hero, { type: 'fear', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'src' })
      expect(isFeared(hero)).toBe(true)

      removeStatus(hero, 'fear')
      applyStatus(hero, { type: 'taunt', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'src' })
      expect(hasTaunt(hero)).toBe(true)
    })
  })

  /* ═══════ isDebuff ═══════ */

  describe('isDebuff', () => {
    it('debuff 類型回傳 true', () => {
      expect(isDebuff('atk_down')).toBe(true)
      expect(isDebuff('stun')).toBe(true)
      expect(isDebuff('dot_burn')).toBe(true)
      expect(isDebuff('fear')).toBe(true)
    })

    it('buff 類型回傳 false', () => {
      expect(isDebuff('atk_up')).toBe(false)
      expect(isDebuff('shield')).toBe(false)
      expect(isDebuff('regen')).toBe(false)
    })

    it('特殊類型（immunity / cleanse）回傳 false', () => {
      expect(isDebuff('immunity')).toBe(false)
      expect(isDebuff('cleanse')).toBe(false)
    })
  })

  /* ═══════ getBuffedStats ═══════ */

  describe('getBuffedStats', () => {
    it('無 buff 時回傳原始數值', () => {
      const hero = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 100, SPD: 120, CritRate: 20, CritDmg: 50 } })
      const stats = getBuffedStats(hero)
      expect(stats.ATK).toBe(200)
      expect(stats.DEF).toBe(100)
    })

    it('ATK up 20% → ATK×1.2', () => {
      const hero = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 100, SPD: 120, CritRate: 20, CritDmg: 50 } })
      applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      const stats = getBuffedStats(hero)
      expect(stats.ATK).toBe(Math.floor(200 * 1.2)) // 240
    })

    it('ATK down → 乘數降低', () => {
      const hero = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 100, SPD: 120, CritRate: 20, CritDmg: 50 } })
      applyStatus(hero, { type: 'atk_down', value: 0.3, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      const stats = getBuffedStats(hero)
      expect(stats.ATK).toBe(Math.floor(200 * 0.7)) // 140
    })

    it('CritRate 增加（value×100）', () => {
      const hero = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 100, SPD: 120, CritRate: 20, CritDmg: 50 } })
      applyStatus(hero, { type: 'crit_rate_up', value: 0.15, duration: 2, maxStacks: 3, sourceHeroId: 'src' })
      const stats = getBuffedStats(hero)
      expect(stats.CritRate).toBe(20 + 15) // 35
    })

    it('下限保護', () => {
      const hero = makeHero({ finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 5, CritDmg: 50 } })
      applyStatus(hero, { type: 'atk_down', value: 2.0, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      const stats = getBuffedStats(hero)
      expect(stats.ATK).toBeGreaterThanOrEqual(1)
    })
  })

  /* ═══════ absorbDamageByShields ═══════ */

  describe('absorbDamageByShields', () => {
    it('護盾吸收全部傷害', () => {
      const hero = makeHero()
      hero.shields = [makeShield({ value: 300 })]
      const [remaining, absorbed] = absorbDamageByShields(hero, 200)
      expect(remaining).toBe(0)
      expect(absorbed).toBe(200)
      expect(hero.shields[0].value).toBe(100)
    })

    it('護盾不足 → 穿透', () => {
      const hero = makeHero()
      hero.shields = [makeShield({ value: 100 })]
      const [remaining, absorbed] = absorbDamageByShields(hero, 250)
      expect(remaining).toBe(150)
      expect(absorbed).toBe(100)
      expect(hero.shields).toHaveLength(0) // 空盾被清除
    })

    it('FIFO 消耗多層護盾', () => {
      const hero = makeHero()
      hero.shields = [makeShield({ value: 50 }), makeShield({ value: 100 })]
      const [remaining, absorbed] = absorbDamageByShields(hero, 120)
      expect(remaining).toBe(0)
      expect(absorbed).toBe(120)
      expect(hero.shields).toHaveLength(1) // 第一個護盾被消耗
      expect(hero.shields[0].value).toBe(30) // 100 - 70
    })

    it('無護盾 → 全穿透', () => {
      const hero = makeHero()
      const [remaining, absorbed] = absorbDamageByShields(hero, 100)
      expect(remaining).toBe(100)
      expect(absorbed).toBe(0)
    })
  })
})
