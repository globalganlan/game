/**
 * 邊界條件 & 安全性測試
 *
 * 檢查極端值、空陣列、overflow、underflow 等
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { calculateDamage, calculateHeal } from '../damageFormula'
import { applyStatus, cleanse, processDotEffects, getBuffedStats } from '../buffSystem'
import { addEnergy, canCastUltimate, consumeEnergy } from '../energySystem'
import { selectTargets, selectNormalAttackTarget } from '../targetStrategy'
import { getElementMultiplier } from '../elementSystem'
import { createBattleHero, runBattle } from '../battleEngine'
import type { BattleEngineConfig, RawHeroInput } from '../battleEngine'
import { makeHero, makeSkill, makeHealEffect, resetUidCounter } from './testHelper'

function makeRawInput(overrides: Partial<RawHeroInput> = {}): RawHeroInput {
  return {
    heroId: 1, modelId: 'z1', name: 'Test', element: 'fire',
    HP: 1000, ATK: 100, DEF: 50, SPD: 100, CritRate: 15, CritDmg: 50,
    ...overrides,
  }
}

describe('邊界條件 & 安全性', () => {
  beforeEach(() => {
    resetUidCounter()
    vi.restoreAllMocks()
  })

  /* ═══════ HP 邊界 ═══════ */

  describe('HP 邊界', () => {
    it('HP 不低於 0（DOT 極端值）', () => {
      const hero = makeHero({ currentHP: 1, maxHP: 1 })
      hero.statusEffects.push({
        type: 'dot_burn', value: 0.3, duration: 5, stacks: 99,
        maxStacks: 99, sourceHeroId: 'src',
      })
      processDotEffects(hero, [makeHero({ finalStats: { HP: 1000, ATK: 9999, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })])
      expect(hero.currentHP).toBeGreaterThanOrEqual(0)
    })

    it('治療不超過 maxHP', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      const healer = makeHero({ finalStats: { HP: 1000, ATK: 9999, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const target = makeHero({ currentHP: 999, maxHP: 1000 })
      const result = calculateHeal(healer, target, makeHealEffect({ multiplier: 10 }))
      expect(result.heal).toBeLessThanOrEqual(1)
    })

    it('已滿 HP 治療 → 0', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      const healer = makeHero({ finalStats: { HP: 1000, ATK: 200, DEF: 50, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const target = makeHero({ currentHP: 1000, maxHP: 1000 })
      const result = calculateHeal(healer, target, makeHealEffect())
      expect(result.heal).toBe(0)
    })
  })

  /* ═══════ 能量邊界 ═══════ */

  describe('能量邊界', () => {
    it('能量不超過 1000', () => {
      const hero = makeHero({ energy: 999 })
      addEnergy(hero, 9999)
      expect(hero.energy).toBe(1000)
    })

    it('多次 addEnergy 不 overflow', () => {
      const hero = makeHero({ energy: 0 })
      for (let i = 0; i < 100; i++) {
        addEnergy(hero, 200)
      }
      expect(hero.energy).toBe(1000)
    })

    it('consumeEnergy 後能量歸零', () => {
      const hero = makeHero({ energy: 1000, activeSkill: makeSkill() })
      consumeEnergy(hero)
      expect(hero.energy).toBe(0)
      expect(canCastUltimate(hero)).toBe(false)
    })
  })

  /* ═══════ 空陣列安全 ═══════ */

  describe('空陣列安全', () => {
    it('selectTargets all_enemies 空陣列 → 空結果', () => {
      const attacker = makeHero()
      const targets = selectTargets('all_enemies', attacker, [], [])
      expect(targets).toHaveLength(0)
    })

    it('selectTargets all_allies 空陣列 → 空結果', () => {
      const attacker = makeHero()
      const targets = selectTargets('all_allies', attacker, [], [])
      expect(targets).toHaveLength(0)
    })

    it('selectNormalAttackTarget 空敵人 → null', () => {
      const attacker = makeHero()
      const target = selectNormalAttackTarget(attacker, [])
      expect(target).toBeNull()
    })

    it('selectTargets single_ally 空 → 空', () => {
      const attacker = makeHero()
      const targets = selectTargets('single_ally', attacker, [], [])
      expect(targets).toHaveLength(0)
    })

    it('random_enemies_3 空 → 空', () => {
      const attacker = makeHero()
      const targets = selectTargets('random_enemies_3', attacker, [], [])
      expect(targets).toHaveLength(0)
    })

    it('cleanse 無 debuff → 空陣列', () => {
      const hero = makeHero()
      const removed = cleanse(hero, 3)
      expect(removed).toHaveLength(0)
    })

    it('processDotEffects 無 DOT → 空結果', () => {
      const hero = makeHero()
      const results = processDotEffects(hero, [hero])
      expect(results).toHaveLength(0)
    })
  })

  /* ═══════ 極端數值 ═══════ */

  describe('極端數值', () => {
    it('ATK=0 不導致 NaN', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const attacker = makeHero({ finalStats: { HP: 100, ATK: 0, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const defender = makeHero()
      const result = calculateDamage(attacker, defender)
      expect(Number.isNaN(result.damage)).toBe(false)
      expect(result.damage).toBeGreaterThanOrEqual(0)
    })

    it('DEF=0 不導致除零', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const attacker = makeHero({ finalStats: { HP: 100, ATK: 100, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const defender = makeHero({ finalStats: { HP: 100, ATK: 100, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const result = calculateDamage(attacker, defender)
      expect(Number.isFinite(result.damage)).toBe(true)
    })

    it('超高 DEF 不產生負傷害', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const attacker = makeHero({ finalStats: { HP: 100, ATK: 10, DEF: 0, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const defender = makeHero({ finalStats: { HP: 100, ATK: 100, DEF: 999999, SPD: 100, CritRate: 0, CritDmg: 50 } })
      const result = calculateDamage(attacker, defender)
      expect(result.damage).toBeGreaterThanOrEqual(0)
    })

    it('CritRate > 100 被 cap 在 100%', () => {
      const hero = makeHero({ finalStats: { HP: 100, ATK: 100, DEF: 50, SPD: 100, CritRate: 200, CritDmg: 50 } })
      const stats = getBuffedStats(hero)
      expect(stats.CritRate).toBeLessThanOrEqual(100)
    })

    it('大量 debuff 不崩潰', () => {
      const hero = makeHero()
      for (let i = 0; i < 100; i++) {
        applyStatus(hero, {
          type: 'atk_down',
          value: 0.01,
          duration: 10,
          maxStacks: 999,
          sourceHeroId: `src_${i}`,
        })
      }
      const stats = getBuffedStats(hero)
      expect(stats.ATK).toBeGreaterThanOrEqual(1) // 下限保護
    })
  })

  /* ═══════ 屬性系統邊界 ═══════ */

  describe('屬性系統邊界', () => {
    it('不存在的屬性 → 1.0', () => {
      expect(getElementMultiplier('fire', '' as any)).toBe(1.0)
      expect(getElementMultiplier(undefined, undefined)).toBe(1.0)
    })
  })

  /* ═══════ createBattleHero 邊界 ═══════ */

  describe('createBattleHero 邊界', () => {
    it('空被動列表不崩潰', () => {
      const hero = createBattleHero(makeRawInput(), 'player', 0, null, [], 1)
      expect(hero.activePassives).toHaveLength(0)
    })

    it('被動數小於星級限制', () => {
      const hero = createBattleHero(makeRawInput(), 'player', 0, null, [makeSkill({ type: 'passive' })], 6)
      // 6 星限制 4 被動，但只有 1 個被動
      expect(hero.activePassives).toHaveLength(1)
    })
  })

  /* ═══════ 戰鬥引擎邊界 ═══════ */

  describe('戰鬥引擎邊界', () => {
    it('1v1 不崩潰', async () => {
      const cfg: BattleEngineConfig = { maxTurns: 10, onAction: async () => {} }
      const players = [createBattleHero(makeRawInput({ name: 'P1' }), 'player', 0, null, [], 1)]
      const enemies = [createBattleHero(makeRawInput({ name: 'E1' }), 'enemy', 0, null, [], 1)]
      const result = await runBattle(players, enemies, cfg)
      expect(['player', 'enemy', 'draw']).toContain(result)
    })

    it('6v6 不崩潰', async () => {
      const cfg: BattleEngineConfig = { maxTurns: 20, onAction: async () => {} }
      const players = Array.from({ length: 6 }, (_, i) =>
        createBattleHero(makeRawInput({ name: `P${i}`, heroId: i }), 'player', i, null, [], 1)
      )
      const enemies = Array.from({ length: 6 }, (_, i) =>
        createBattleHero(makeRawInput({ name: `E${i}`, heroId: i + 10 }), 'enemy', i, null, [], 1)
      )
      const result = await runBattle(players, enemies, cfg)
      expect(['player', 'enemy', 'draw']).toContain(result)
    })

    it('HP 不等 → 不同結果', async () => {
      const results: string[] = []
      for (let i = 0; i < 10; i++) {
        const cfg: BattleEngineConfig = { maxTurns: 50, onAction: async () => {} }
        const players = [createBattleHero(makeRawInput({ name: 'P1', HP: 5000 }), 'player', 0, null, [], 1)]
        const enemies = [createBattleHero(makeRawInput({ name: 'E1', HP: 100 }), 'enemy', 0, null, [], 1)]
        const result = await runBattle(players, enemies, cfg)
        results.push(result)
      }
      // HP 50x 的玩家應該大多贏
      const playerWins = results.filter(r => r === 'player').length
      expect(playerWins).toBeGreaterThan(5)
    })
  })
})
