/**
 * targetStrategy 單元測試
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { selectTargets, selectNormalAttackTarget } from '../targetStrategy'
import { applyStatus } from '../buffSystem'
import { makeHero, resetUidCounter } from './testHelper'
import type { BattleHero } from '../types'

describe('targetStrategy', () => {
  let attacker: BattleHero
  let enemies: BattleHero[]
  let allies: BattleHero[]

  beforeEach(() => {
    resetUidCounter()

    attacker = makeHero({ side: 'player', slot: 0, name: 'Attacker' })

    enemies = [
      makeHero({ side: 'enemy', slot: 0, name: 'E-Front-0', currentHP: 500, maxHP: 1000 }),
      makeHero({ side: 'enemy', slot: 1, name: 'E-Front-1', currentHP: 800, maxHP: 1000 }),
      makeHero({ side: 'enemy', slot: 2, name: 'E-Front-2', currentHP: 300, maxHP: 1000 }),
      makeHero({ side: 'enemy', slot: 3, name: 'E-Back-3', currentHP: 1000, maxHP: 1000 }),
      makeHero({ side: 'enemy', slot: 4, name: 'E-Back-4', currentHP: 600, maxHP: 1000 }),
      makeHero({ side: 'enemy', slot: 5, name: 'E-Back-5', currentHP: 200, maxHP: 1000 }),
    ]

    allies = [
      attacker,
      makeHero({ side: 'player', slot: 1, name: 'Ally-1', currentHP: 300, maxHP: 1000 }),
      makeHero({ side: 'player', slot: 2, name: 'Ally-2', currentHP: 700, maxHP: 1000 }),
    ]
  })

  /* ═══════ selectTargets ═══════ */

  describe('selectTargets', () => {
    it('all_enemies → 所有存活敵人', () => {
      const targets = selectTargets('all_enemies', attacker, allies, enemies)
      expect(targets).toHaveLength(6)
    })

    it('all_enemies → 排除死亡', () => {
      enemies[0].currentHP = 0
      const targets = selectTargets('all_enemies', attacker, allies, enemies)
      expect(targets).toHaveLength(5)
    })

    it('single_enemy → 回傳 1 個目標', () => {
      const targets = selectTargets('single_enemy', attacker, allies, enemies)
      expect(targets).toHaveLength(1)
    })

    it('all_allies → 所有存活友方', () => {
      const targets = selectTargets('all_allies', attacker, allies, enemies)
      expect(targets).toHaveLength(3)
    })

    it('self → 只回傳自身', () => {
      const targets = selectTargets('self', attacker, allies, enemies)
      expect(targets).toHaveLength(1)
      expect(targets[0].uid).toBe(attacker.uid)
    })

    it('single_ally → HP% 最低的友軍', () => {
      const targets = selectTargets('single_ally', attacker, allies, enemies)
      expect(targets).toHaveLength(1)
      expect(targets[0].name).toBe('Ally-1') // 300/1000 = 30% 最低
    })

    it('front_row_enemies → 前排 (slot 0-2)', () => {
      const targets = selectTargets('front_row_enemies', attacker, allies, enemies)
      expect(targets.every(t => t.slot <= 2)).toBe(true)
    })

    it('back_row_enemies → 後排 (slot 3-5)', () => {
      const targets = selectTargets('back_row_enemies', attacker, allies, enemies)
      expect(targets.every(t => t.slot >= 3)).toBe(true)
    })

    it('front_row_enemies 全滅 → fallback 後排', () => {
      enemies[0].currentHP = 0
      enemies[1].currentHP = 0
      enemies[2].currentHP = 0
      const targets = selectTargets('front_row_enemies', attacker, allies, enemies)
      expect(targets).toHaveLength(3)
      expect(targets.every(t => t.slot >= 3)).toBe(true)
    })

    it('back_row_enemies 全滅 → fallback 前排', () => {
      enemies[3].currentHP = 0
      enemies[4].currentHP = 0
      enemies[5].currentHP = 0
      const targets = selectTargets('back_row_enemies', attacker, allies, enemies)
      expect(targets).toHaveLength(3)
      expect(targets.every(t => t.slot <= 2)).toBe(true)
    })

    it('random_enemies_3 → 3 個目標（可重複）', () => {
      const targets = selectTargets('random_enemies_3', attacker, allies, enemies)
      expect(targets).toHaveLength(3)
    })

    it('random_enemies_N regex', () => {
      const targets = selectTargets('random_enemies_5', attacker, allies, enemies)
      expect(targets).toHaveLength(5)
    })

    it('未知 target type → fallback 到 single_enemy', () => {
      const targets = selectTargets('unknown_type', attacker, allies, enemies)
      expect(targets.length).toBeGreaterThanOrEqual(1)
    })
  })

  /* ═══════ selectNormalAttackTarget ═══════ */

  describe('selectNormalAttackTarget', () => {
    it('優先攻擊有嘲諷的目標', () => {
      applyStatus(enemies[4], { type: 'taunt', value: 0, duration: 2, maxStacks: 1, sourceHeroId: 'src' })
      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target?.uid).toBe(enemies[4].uid)
    })

    it('無嘲諷 → 前排對位 (slot%3 相同)', () => {
      // attacker slot=0 → column=0 → 前排 slot 0
      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target?.slot).toBe(0) // E-Front-0
    })

    it('前排對位死亡 → 前排其他', () => {
      enemies[0].currentHP = 0 // slot 0 死亡
      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).not.toBeNull()
      expect(target!.slot).toBeLessThan(3) // 仍打前排
    })

    it('前排全滅 → 打後排', () => {
      enemies[0].currentHP = 0
      enemies[1].currentHP = 0
      enemies[2].currentHP = 0
      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).not.toBeNull()
      expect(target!.slot).toBeGreaterThanOrEqual(3)
    })

    it('全滅 → null', () => {
      enemies.forEach(e => e.currentHP = 0)
      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).toBeNull()
    })
  })
})
