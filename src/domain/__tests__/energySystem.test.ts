/**
 * energySystem 單元測試
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  addEnergy,
  turnStartEnergy,
  onAttackEnergy,
  onBeAttackedEnergy,
  onKillEnergy,
  consumeEnergy,
  canCastUltimate,
  getEnergyConfig,
} from '../energySystem'
import { applyStatus } from '../buffSystem'
import { makeHero, makeSkill, resetUidCounter } from './testHelper'

describe('energySystem', () => {
  beforeEach(() => {
    resetUidCounter()
  })

  describe('addEnergy', () => {
    it('正常增加能量', () => {
      const hero = makeHero({ energy: 0 })
      const added = addEnergy(hero, 200)
      expect(added).toBe(200)
      expect(hero.energy).toBe(200)
    })

    it('不超過上限 1000', () => {
      const hero = makeHero({ energy: 900 })
      const added = addEnergy(hero, 200)
      expect(added).toBe(100) // 只增加到上限
      expect(hero.energy).toBe(1000)
    })

    it('已滿時增加 0', () => {
      const hero = makeHero({ energy: 1000 })
      const added = addEnergy(hero, 100)
      expect(added).toBe(0)
      expect(hero.energy).toBe(1000)
    })
  })

  describe('turnStartEnergy', () => {
    it('回合開始 +50', () => {
      const hero = makeHero({ energy: 0 })
      const added = turnStartEnergy(hero)
      expect(added).toBe(50)
      expect(hero.energy).toBe(50)
    })
  })

  describe('onAttackEnergy', () => {
    it('攻擊後 +200', () => {
      const hero = makeHero({ energy: 0 })
      const added = onAttackEnergy(hero)
      expect(added).toBe(200)
      expect(hero.energy).toBe(200)
    })
  })

  describe('onBeAttackedEnergy', () => {
    it('被攻擊 +150（存活）', () => {
      const hero = makeHero({ energy: 0, currentHP: 500 })
      const added = onBeAttackedEnergy(hero)
      expect(added).toBe(150)
    })

    it('死亡角色不獲得能量', () => {
      const hero = makeHero({ energy: 0, currentHP: 0 })
      const added = onBeAttackedEnergy(hero)
      expect(added).toBe(0)
      expect(hero.energy).toBe(0)
    })
  })

  describe('onKillEnergy', () => {
    it('擊殺 +100', () => {
      const hero = makeHero({ energy: 0 })
      const added = onKillEnergy(hero)
      expect(added).toBe(100)
    })
  })

  describe('consumeEnergy', () => {
    it('消耗能量歸零', () => {
      const hero = makeHero({ energy: 1000 })
      consumeEnergy(hero)
      expect(hero.energy).toBe(0)
    })
  })

  describe('canCastUltimate', () => {
    it('滿能量 + 有技能 + 未沉默 → true', () => {
      const hero = makeHero({ energy: 1000, activeSkill: makeSkill() })
      expect(canCastUltimate(hero)).toBe(true)
    })

    it('能量不足 → false', () => {
      const hero = makeHero({ energy: 999, activeSkill: makeSkill() })
      expect(canCastUltimate(hero)).toBe(false)
    })

    it('無主動技能 → false', () => {
      const hero = makeHero({ energy: 1000, activeSkill: null })
      expect(canCastUltimate(hero)).toBe(false)
    })

    it('被沉默 → false', () => {
      const hero = makeHero({ energy: 1000, activeSkill: makeSkill() })
      applyStatus(hero, { type: 'silence', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      expect(canCastUltimate(hero)).toBe(false)
    })
  })

  describe('getEnergyConfig', () => {
    it('回傳配置副本', () => {
      const cfg = getEnergyConfig()
      expect(cfg.maxEnergy).toBe(1000)
      expect(cfg.onAttack).toBe(200)
      expect(cfg.onBeAttacked).toBe(150)
      expect(cfg.onKill).toBe(100)
      expect(cfg.perTurn).toBe(50)
    })
  })
})
