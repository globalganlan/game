/**
 * buffSystem 進階測試 — 免疫、永久效果、多重 DOT、護盾交互
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('buffSystem - 進階測試', () => {
  beforeEach(() => {
    resetUidCounter()
    vi.restoreAllMocks()
  })

  /* ═══════ 免疫系統 ═══════ */

  describe('免疫系統', () => {
    it('免疫狀態擋 debuff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'immunity', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'self' })

      const result = applyStatus(hero, { type: 'stun', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'enemy' })
      expect(result).toBe(false)
      expect(hasStatus(hero, 'stun')).toBe(false)
    })

    it('免疫狀態不擋 buff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'immunity', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'self' })

      const result = applyStatus(hero, { type: 'atk_up', value: 0.3, duration: 2, maxStacks: 1, sourceHeroId: 'self' })
      expect(result).toBe(true)
      expect(hasStatus(hero, 'atk_up')).toBe(true)
    })

    it('免疫擋 DOT', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'immunity', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'self' })

      const result = applyStatus(hero, { type: 'dot_burn', value: 0.1, duration: 3, maxStacks: 1, sourceHeroId: 'enemy' })
      expect(result).toBe(false)
    })

    it('免疫擋恐懼', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'immunity', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'self' })

      const result = applyStatus(hero, { type: 'fear', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'enemy' })
      expect(result).toBe(false)
    })
  })

  /* ═══════ 永久效果 (duration=0) ═══════ */

  describe('永久效果', () => {
    it('duration=0 的效果不會被 tickStatusDurations 移除', () => {
      const hero = makeHero()
      hero.statusEffects.push({
        type: 'atk_up', value: 0.5, duration: 0, stacks: 1, maxStacks: 1, sourceHeroId: 'passive',
      })

      tickStatusDurations(hero)
      tickStatusDurations(hero)
      tickStatusDurations(hero)

      expect(hasStatus(hero, 'atk_up')).toBe(true)
      expect(getStatusValue(hero, 'atk_up')).toBe(0.5)
    })

    it('duration=0 和 duration>0 同時存在', () => {
      const hero = makeHero()
      hero.statusEffects.push(
        { type: 'atk_up', value: 0.3, duration: 0, stacks: 1, maxStacks: 1, sourceHeroId: 'passive' },
        { type: 'def_up', value: 0.2, duration: 1, stacks: 1, maxStacks: 1, sourceHeroId: 'skill' },
      )

      const expired = tickStatusDurations(hero)

      expect(expired).toContain('def_up')
      expect(hasStatus(hero, 'atk_up')).toBe(true) // 永久效果保留
      expect(hasStatus(hero, 'def_up')).toBe(false) // 到期移除
    })
  })

  /* ═══════ 控制效果 ═══════ */

  describe('控制效果交互', () => {
    it('暈眩刷新持續時間而非疊加', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'stun', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'e1' })
      applyStatus(hero, { type: 'stun', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'e2' })

      const stunEffect = hero.statusEffects.find(s => s.type === 'stun')!
      expect(stunEffect.duration).toBe(3)
      expect(stunEffect.stacks).toBe(1) // 不疊加
    })

    it('凍結 + 暈眩同時存在', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'stun', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e1' })
      applyStatus(hero, { type: 'freeze', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e2' })

      expect(isControlled(hero)).toBe(true)
      expect(hero.statusEffects.filter(s => s.type === 'stun' || s.type === 'freeze')).toHaveLength(2)
    })

    it('沉默 + 恐懼同時存在', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'silence', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e1' })
      applyStatus(hero, { type: 'fear', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e2' })

      expect(isSilenced(hero)).toBe(true)
      expect(isFeared(hero)).toBe(true)
    })
  })

  /* ═══════ 多重 DOT ═══════ */

  describe('多重 DOT', () => {
    it('燃燒 + 中毒 + 流血同時生效', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const hero = makeHero({ currentHP: 5000, maxHP: 5000 })
      hero.statusEffects.push(
        { type: 'dot_burn', value: 0.3, duration: 3, stacks: 1, maxStacks: 3, sourceHeroId: source.uid },
        { type: 'dot_poison', value: 0.03, duration: 3, stacks: 1, maxStacks: 3, sourceHeroId: source.uid },
        { type: 'dot_bleed', value: 0.25, duration: 3, stacks: 1, maxStacks: 3, sourceHeroId: source.uid },
      )

      const results = processDotEffects(hero, [source, hero])

      expect(results).toHaveLength(3)
      expect(results.map(r => r.type)).toContain('dot_burn')
      expect(results.map(r => r.type)).toContain('dot_poison')
      expect(results.map(r => r.type)).toContain('dot_bleed')
      expect(hero.currentHP).toBeLessThan(5000)
    })

    it('多層 DOT stacks 正確計算', () => {
      const source = makeHero({ finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const hero = makeHero({ currentHP: 5000, maxHP: 5000 })
      hero.statusEffects.push(
        { type: 'dot_burn', value: 0.3, duration: 3, stacks: 3, maxStacks: 5, sourceHeroId: source.uid },
      )

      const results = processDotEffects(hero, [source, hero])

      // 燃燒: ATK * 0.3 * 3 stacks = 100 * 0.3 * 3 = 90
      expect(results).toHaveLength(1)
      expect(results[0].damage).toBe(90) // 100 * 0.3 * 3
    })

    it('DOT 來源已死亡 → 基於 0 ATK 計算', () => {
      const hero = makeHero({ currentHP: 5000, maxHP: 5000 })
      hero.statusEffects.push(
        { type: 'dot_burn', value: 0.3, duration: 3, stacks: 1, maxStacks: 1, sourceHeroId: 'dead_hero' },
      )

      // 來源不在 allHeroes → ATK = 0
      const results = processDotEffects(hero, [hero])

      expect(results).toHaveLength(0) // dmg = 0 * 0.3 = 0, 不 push
      expect(hero.currentHP).toBe(5000)
    })

    it('中毒基於目標 maxHP 而非攻擊者 ATK', () => {
      const hero = makeHero({ currentHP: 10000, maxHP: 10000 })
      hero.statusEffects.push(
        { type: 'dot_poison', value: 0.03, duration: 3, stacks: 1, maxStacks: 1, sourceHeroId: 'any' },
      )

      const results = processDotEffects(hero, [hero])

      // 中毒: maxHP * 0.03 = 10000 * 0.03 = 300
      expect(results).toHaveLength(1)
      expect(results[0].damage).toBe(300)
    })
  })

  /* ═══════ Regen 進階 ═══════ */

  describe('Regen 進階', () => {
    it('多層 regen stacks 累加', () => {
      const hero = makeHero({ currentHP: 500, maxHP: 1000 })
      hero.statusEffects.push(
        { type: 'regen', value: 0.05, duration: 3, stacks: 3, maxStacks: 5, sourceHeroId: 'src' },
      )

      const healed = processRegen(hero)

      // 0.05 * 3 stacks * 1000 maxHP = 150
      expect(healed).toBe(150)
      expect(hero.currentHP).toBe(650)
    })

    it('regen 不超過 maxHP', () => {
      const hero = makeHero({ currentHP: 990, maxHP: 1000 })
      hero.statusEffects.push(
        { type: 'regen', value: 0.1, duration: 3, stacks: 1, maxStacks: 1, sourceHeroId: 'src' },
      )

      const healed = processRegen(hero)

      expect(healed).toBe(10) // 只回復 10
      expect(hero.currentHP).toBe(1000)
    })
  })

  /* ═══════ 護盾吸收進階 ═══════ */

  describe('護盾吸收進階', () => {
    it('多層護盾按順序吸收', () => {
      const hero = makeHero()
      hero.shields = [
        { value: 100, duration: 3, sourceHeroId: 's1' },
        { value: 200, duration: 3, sourceHeroId: 's2' },
      ]

      const [remaining, absorbed] = absorbDamageByShields(hero, 150)

      expect(absorbed).toBe(150)
      expect(remaining).toBe(0)
      expect(hero.shields).toHaveLength(1) // 第一層消耗完
      expect(hero.shields[0].value).toBe(150) // 第二層剩 150
    })

    it('護盾不足時穿透', () => {
      const hero = makeHero()
      hero.shields = [{ value: 50, duration: 3, sourceHeroId: 's1' }]

      const [remaining, absorbed] = absorbDamageByShields(hero, 200)

      expect(absorbed).toBe(50)
      expect(remaining).toBe(150)
      expect(hero.shields).toHaveLength(0)
    })

    it('tickShieldDurations 清除到期護盾', () => {
      const hero = makeHero()
      hero.shields = [
        { value: 100, duration: 1, sourceHeroId: 's1' },
        { value: 200, duration: 3, sourceHeroId: 's2' },
      ]

      tickShieldDurations(hero)

      expect(hero.shields).toHaveLength(1)
      expect(hero.shields[0].sourceHeroId).toBe('s2')
      expect(hero.shields[0].duration).toBe(2)
    })

    it('tickShieldDurations 清除 0 值護盾', () => {
      const hero = makeHero()
      hero.shields = [
        { value: 0, duration: 5, sourceHeroId: 's1' },
        { value: 100, duration: 2, sourceHeroId: 's2' },
      ]

      tickShieldDurations(hero)

      expect(hero.shields).toHaveLength(1)
      expect(hero.shields[0].sourceHeroId).toBe('s2')
    })
  })

  /* ═══════ getBuffedStats 進階 ═══════ */

  describe('getBuffedStats 進階', () => {
    it('攻擊加減同時存在', () => {
      const hero = makeHero({
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50 },
      })
      applyStatus(hero, { type: 'atk_up', value: 0.3, duration: 2, maxStacks: 1, sourceHeroId: 'buff' })
      applyStatus(hero, { type: 'atk_down', value: 0.1, duration: 2, maxStacks: 1, sourceHeroId: 'debuff' })

      const stats = getBuffedStats(hero)

      // ATK = 100 * (1 + 0.3 - 0.1) = 100 * 1.2 = 120
      expect(stats.ATK).toBe(120)
    })

    it('SPD buff 正確疊加', () => {
      const hero = makeHero({
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50 },
      })
      applyStatus(hero, { type: 'spd_up', value: 0.5, duration: 2, maxStacks: 1, sourceHeroId: 'buff' })

      const stats = getBuffedStats(hero)

      expect(stats.SPD).toBe(150) // 100 * 1.5
    })

    it('CritRate 上限 100%', () => {
      const hero = makeHero({
        finalStats: { HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 90, CritDmg: 50 },
      })
      applyStatus(hero, { type: 'crit_rate_up', value: 0.5, duration: 2, maxStacks: 1, sourceHeroId: 'buff' })

      const stats = getBuffedStats(hero)

      expect(stats.CritRate).toBe(100) // cap
    })

    it('DEF 下限 0', () => {
      const hero = makeHero({
        finalStats: { HP: 1000, ATK: 100, DEF: 10, SPD: 100, CritRate: 15, CritDmg: 50 },
      })
      applyStatus(hero, { type: 'def_down', value: 2.0, duration: 2, maxStacks: 1, sourceHeroId: 'debuff' })

      const stats = getBuffedStats(hero)

      expect(stats.DEF).toBe(0) // floor at 0
    })

    it('ATK 下限 1', () => {
      const hero = makeHero({
        finalStats: { HP: 1000, ATK: 10, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50 },
      })
      applyStatus(hero, { type: 'atk_down', value: 5.0, duration: 2, maxStacks: 1, sourceHeroId: 'debuff' })

      const stats = getBuffedStats(hero)

      expect(stats.ATK).toBe(1) // floor at 1
    })
  })

  /* ═══════ cleanse 進階 ═══════ */

  describe('cleanse 進階', () => {
    it('淨化只移除 debuff 不移除 buff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'atk_up', value: 0.3, duration: 2, maxStacks: 1, sourceHeroId: 'buff' })
      applyStatus(hero, { type: 'stun', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'debuff' })
      applyStatus(hero, { type: 'dot_burn', value: 0.1, duration: 3, maxStacks: 1, sourceHeroId: 'enemy' })

      const removed = cleanse(hero, 1)

      expect(removed).toHaveLength(1)
      expect(hasStatus(hero, 'atk_up')).toBe(true) // buff 保留
    })

    it('淨化多個 debuff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'stun', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e1' })
      applyStatus(hero, { type: 'dot_burn', value: 0.1, duration: 3, maxStacks: 1, sourceHeroId: 'e2' })
      applyStatus(hero, { type: 'fear', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e3' })

      const removed = cleanse(hero, 2)

      expect(removed).toHaveLength(2)
    })

    it('淨化 count 超過 debuff 數量 → 只移除有的', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'stun', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'e1' })

      const removed = cleanse(hero, 5)

      expect(removed).toHaveLength(1)
    })
  })

  /* ═══════ isDebuff 分類 ═══════ */

  describe('isDebuff 分類', () => {
    it('DOT 是 debuff', () => {
      expect(isDebuff('dot_burn')).toBe(true)
      expect(isDebuff('dot_poison')).toBe(true)
      expect(isDebuff('dot_bleed')).toBe(true)
    })

    it('控制是 debuff', () => {
      expect(isDebuff('stun')).toBe(true)
      expect(isDebuff('freeze')).toBe(true)
      expect(isDebuff('silence')).toBe(true)
      expect(isDebuff('fear')).toBe(true)
    })

    it('atk_down 是 debuff', () => {
      expect(isDebuff('atk_down')).toBe(true)
      expect(isDebuff('def_down')).toBe(true)
      expect(isDebuff('spd_down')).toBe(true)
    })

    it('buff 不是 debuff', () => {
      expect(isDebuff('atk_up')).toBe(false)
      expect(isDebuff('def_up')).toBe(false)
      expect(isDebuff('shield')).toBe(false)
      expect(isDebuff('regen')).toBe(false)
      expect(isDebuff('taunt')).toBe(false)
    })
  })

  /* ═══════ removeStatus ═══════ */

  describe('removeStatus', () => {
    it('移除存在的效果', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'atk_up', value: 0.3, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      expect(hasStatus(hero, 'atk_up')).toBe(true)

      removeStatus(hero, 'atk_up')

      expect(hasStatus(hero, 'atk_up')).toBe(false)
    })

    it('移除不存在的效果不崩潰', () => {
      const hero = makeHero()
      removeStatus(hero, 'stun')
      expect(hero.statusEffects).toHaveLength(0)
    })
  })
})
