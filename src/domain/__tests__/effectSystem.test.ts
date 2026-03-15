/**
 * effectSystem 單元測試 — 效果模組化系統 v2.0
 *
 * 測試新增的效果分類、觸發條件、疊加規則
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyStatus,
  applyStatusV2,
  removeStatus,
  cleanse,
  dispelBuff,
  stealBuff,
  transferDebuff,
  hasStatus,
  isDebuff,
  getBuffedStats,
} from '../buffSystem'
import { makeHero, resetUidCounter } from './testHelper'
import type { BattleHero, StatusEffect } from '../types'

describe('effectSystem v2.0', () => {
  beforeEach(() => {
    resetUidCounter()
  })

  /* ═══════ applyStatusV2 — 同源疊加 ═══════ */

  describe('applyStatusV2 — 同源同回合數合併', () => {
    it('同一 sourceEffectId + 同 duration → stacks 疊加', () => {
      const hero = makeHero()
      applyStatusV2(hero, {
        type: 'dot_burn', value: 0.3, duration: 2, maxStacks: 5, sourceHeroId: 'src',
      }, 'EFF_DOT_001')
      applyStatusV2(hero, {
        type: 'dot_burn', value: 0.3, duration: 2, maxStacks: 5, sourceHeroId: 'src',
      }, 'EFF_DOT_001')

      expect(hero.statusEffects).toHaveLength(1)
      expect(hero.statusEffects[0].stacks).toBe(2)
      expect(hero.statusEffects[0].value).toBeCloseTo(0.6)
    })

    it('同一 sourceEffectId + 不同 duration → 獨立效果', () => {
      const hero = makeHero()
      applyStatusV2(hero, {
        type: 'dot_burn', value: 0.3, duration: 2, maxStacks: 5, sourceHeroId: 'src',
      }, 'EFF_DOT_001')
      applyStatusV2(hero, {
        type: 'dot_burn', value: 0.2, duration: 3, maxStacks: 5, sourceHeroId: 'src',
      }, 'EFF_DOT_001')

      expect(hero.statusEffects).toHaveLength(2)
    })
  })

  /* ═══════ 異源共存 ═══════ */

  describe('異源共存', () => {
    it('不同 sourceEffectId → 各自獨立', () => {
      const hero = makeHero()
      applyStatusV2(hero, {
        type: 'dot_burn', value: 0.3, duration: 2, maxStacks: 3, sourceHeroId: 'a',
      }, 'EFF_DOT_A')
      applyStatusV2(hero, {
        type: 'dot_burn', value: 0.5, duration: 3, maxStacks: 3, sourceHeroId: 'b',
      }, 'EFF_DOT_B')

      expect(hero.statusEffects).toHaveLength(2)
      expect(hero.statusEffects[0].value).toBeCloseTo(0.3)
      expect(hero.statusEffects[1].value).toBeCloseTo(0.5)
    })
  })

  /* ═══════ 互斥覆蓋 ═══════ */

  describe('互斥覆蓋', () => {
    it('atk_up + atk_down 同回合數 → 合併', () => {
      const hero = makeHero()
      applyStatusV2(hero, {
        type: 'atk_up', value: 0.2, duration: 2, maxStacks: 1, sourceHeroId: 'a',
      })
      applyStatusV2(hero, {
        type: 'atk_down', value: 0.15, duration: 2, maxStacks: 1, sourceHeroId: 'b',
      })

      // atk_down 被施加時，應與 atk_up 互斥
      // 結果：atk_up 的 value 降低 0.15
      const atkUp = hero.statusEffects.find(s => s.type === 'atk_up')
      expect(atkUp).toBeTruthy()
      expect(atkUp!.value).toBeCloseTo(0.05)
    })

    it('atk_up + atk_down 不同回合數 → 共存', () => {
      const hero = makeHero()
      applyStatusV2(hero, {
        type: 'atk_up', value: 0.2, duration: 3, maxStacks: 1, sourceHeroId: 'a',
      })
      applyStatusV2(hero, {
        type: 'atk_down', value: 0.15, duration: 2, maxStacks: 1, sourceHeroId: 'b',
      })

      expect(hero.statusEffects).toHaveLength(2)
    })
  })

  /* ═══════ 免疫 ═══════ */

  describe('免疫', () => {
    it('immunity 阻擋 debuff', () => {
      const hero = makeHero()
      applyStatus(hero, {
        type: 'immunity', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'self',
      })
      const result = applyStatusV2(hero, {
        type: 'atk_down', value: 0.2, duration: 2, maxStacks: 1, sourceHeroId: 'enemy',
      })
      expect(result).toBe(false)
      expect(hero.statusEffects.filter(s => s.type === 'atk_down')).toHaveLength(0)
    })

    it('immunity 不阻擋 buff', () => {
      const hero = makeHero()
      applyStatus(hero, {
        type: 'immunity', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'self',
      })
      const result = applyStatusV2(hero, {
        type: 'atk_up', value: 0.2, duration: 2, maxStacks: 1, sourceHeroId: 'ally',
      })
      expect(result).toBe(true)
    })
  })

  /* ═══════ CC 不疊加 ═══════ */

  describe('CC stacking', () => {
    it('stun 不疊加，刷新 duration', () => {
      const hero = makeHero()
      applyStatusV2(hero, {
        type: 'stun', value: 0, duration: 1, maxStacks: 1, sourceHeroId: 'a',
      })
      applyStatusV2(hero, {
        type: 'stun', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'b',
      })
      expect(hero.statusEffects.filter(s => s.type === 'stun')).toHaveLength(1)
      expect(hero.statusEffects.find(s => s.type === 'stun')!.duration).toBe(3)
    })
  })

  /* ═══════ 驅散 (dispelBuff) ═══════ */

  describe('dispelBuff', () => {
    it('移除 1 個隨機 buff', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'atk_up', value: 0.2, duration: 2, maxStacks: 1, sourceHeroId: 'a' })
      applyStatus(hero, { type: 'def_up', value: 0.2, duration: 2, maxStacks: 1, sourceHeroId: 'a' })

      const removed = dispelBuff(hero, 1)
      expect(removed).toHaveLength(1)
      expect(hero.statusEffects.filter(s => s.type === 'atk_up' || s.type === 'def_up')).toHaveLength(1)
    })

    it('不移除 immunity', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'immunity', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'a' })
      const removed = dispelBuff(hero, 1)
      expect(removed).toHaveLength(0)
      expect(hasStatus(hero, 'immunity')).toBe(true)
    })

    it('指定類型移除所有同類 buff', () => {
      const hero = makeHero()
      applyStatusV2(hero, { type: 'atk_up', value: 0.1, duration: 2, maxStacks: 3, sourceHeroId: 'a' }, 'E1')
      applyStatusV2(hero, { type: 'atk_up', value: 0.2, duration: 3, maxStacks: 3, sourceHeroId: 'b' }, 'E2')
      applyStatus(hero, { type: 'def_up', value: 0.1, duration: 2, maxStacks: 1, sourceHeroId: 'a' })

      const removed = dispelBuff(hero, 1, 'atk_up')
      expect(removed).toHaveLength(2)
      expect(hero.statusEffects.filter(s => s.type === 'atk_up')).toHaveLength(0)
      expect(hero.statusEffects.filter(s => s.type === 'def_up')).toHaveLength(1)
    })
  })

  /* ═══════ 偷取 (stealBuff) ═══════ */

  describe('stealBuff', () => {
    it('偷取 1 個 buff 給自己', () => {
      const source = makeHero({ side: 'player' })
      const target = makeHero({ side: 'enemy' })
      applyStatus(target, { type: 'atk_up', value: 0.3, duration: 2, maxStacks: 1, sourceHeroId: 'x' })

      const stolen = stealBuff(source, target)
      expect(stolen).toBe('atk_up')
      expect(target.statusEffects.filter(s => s.type === 'atk_up')).toHaveLength(0)
      expect(source.statusEffects.filter(s => s.type === 'atk_up')).toHaveLength(1)
      expect(source.statusEffects[0].value).toBeCloseTo(0.3)
    })

    it('目標無 buff → 返回 null', () => {
      const source = makeHero()
      const target = makeHero()
      const stolen = stealBuff(source, target)
      expect(stolen).toBeNull()
    })
  })

  /* ═══════ 轉移 (transferDebuff) ═══════ */

  describe('transferDebuff', () => {
    it('轉移 1 個 debuff 給目標', () => {
      const source = makeHero()
      const target = makeHero()
      applyStatus(source, { type: 'atk_down', value: 0.2, duration: 2, maxStacks: 1, sourceHeroId: 'x' })

      const transferred = transferDebuff(source, target)
      expect(transferred).toBe('atk_down')
      expect(source.statusEffects.filter(s => s.type === 'atk_down')).toHaveLength(0)
      expect(target.statusEffects.filter(s => s.type === 'atk_down')).toHaveLength(1)
    })

    it('目標有 immunity → debuff 不施加（但自己仍被移除）', () => {
      const source = makeHero()
      const target = makeHero()
      applyStatus(source, { type: 'atk_down', value: 0.2, duration: 2, maxStacks: 1, sourceHeroId: 'x' })
      applyStatus(target, { type: 'immunity', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'y' })

      const transferred = transferDebuff(source, target)
      expect(transferred).toBeNull()
      expect(source.statusEffects.filter(s => s.type === 'atk_down')).toHaveLength(0)
    })
  })

  /* ═══════ cleanse v2 ═══════ */

  describe('cleanse v2', () => {
    it('指定類型淨化：移除所有同類 debuff', () => {
      const hero = makeHero()
      applyStatusV2(hero, { type: 'dot_burn', value: 0.3, duration: 2, maxStacks: 3, sourceHeroId: 'a' }, 'E1')
      applyStatusV2(hero, { type: 'dot_burn', value: 0.2, duration: 3, maxStacks: 3, sourceHeroId: 'b' }, 'E2')
      applyStatus(hero, { type: 'dot_poison', value: 0.1, duration: 2, maxStacks: 1, sourceHeroId: 'c' })

      const removed = cleanse(hero, 1, 'dot_burn')
      expect(removed).toHaveLength(2)
      expect(hero.statusEffects.filter(s => s.type === 'dot_burn')).toHaveLength(0)
      expect(hero.statusEffects.filter(s => s.type === 'dot_poison')).toHaveLength(1)
    })

    it('v1 相容：未指定類型，隨機移除 count 個', () => {
      const hero = makeHero()
      applyStatus(hero, { type: 'atk_down', value: 0.1, duration: 2, maxStacks: 1, sourceHeroId: 'a' })
      applyStatus(hero, { type: 'dot_burn', value: 0.1, duration: 2, maxStacks: 1, sourceHeroId: 'b' })

      const removed = cleanse(hero, 1)
      expect(removed).toHaveLength(1)
      expect(hero.statusEffects.filter(s => isDebuff(s.type))).toHaveLength(1)
    })
  })

  /* ═══════ 數量無上限 ═══════ */

  describe('數量無上限', () => {
    it('可以同時存在 20 個以上獨立效果', () => {
      const hero = makeHero()
      for (let i = 0; i < 20; i++) {
        applyStatusV2(hero, {
          type: 'dot_burn', value: 0.1, duration: i + 1, maxStacks: 1, sourceHeroId: `src_${i}`,
        }, `EFF_${i}`)
      }
      expect(hero.statusEffects.length).toBe(20)
    })
  })
})
