/**
 * targetStrategy 進階測試 — random_enemies_N、前後排策略、proximity
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { selectTargets, selectNormalAttackTarget } from '../targetStrategy'
import { applyStatus } from '../buffSystem'
import { makeHero, resetUidCounter } from './testHelper'
import type { BattleHero } from '../types'

describe('targetStrategy - 進階測試', () => {
  beforeEach(() => {
    resetUidCounter()
    vi.restoreAllMocks()
  })

  /* ═══════ random_enemies_N regex ═══════ */

  describe('random_enemies_N', () => {
    it('random_enemies_2 回傳 2 個目標', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        makeHero({ side: 'enemy', slot: 1 }),
        makeHero({ side: 'enemy', slot: 2 }),
      ]

      const targets = selectTargets('random_enemies_2', attacker, [attacker], enemies)
      expect(targets).toHaveLength(2)
    })

    it('random_enemies_5 超過敵人數量 → 可重複', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        makeHero({ side: 'enemy', slot: 1 }),
      ]

      const targets = selectTargets('random_enemies_5', attacker, [attacker], enemies)
      expect(targets).toHaveLength(5) // 可重複選擇
    })

    it('random_enemies_1 等同 single 但隨機', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        makeHero({ side: 'enemy', slot: 1 }),
      ]

      const targets = selectTargets('random_enemies_1', attacker, [attacker], enemies)
      expect(targets).toHaveLength(1)
    })

    it('random_enemies_3 空陣列 → 空', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const targets = selectTargets('random_enemies_3', attacker, [attacker], [])
      expect(targets).toHaveLength(0)
    })
  })

  /* ═══════ 前後排策略 ═══════ */

  describe('前後排策略', () => {
    it('front_row_enemies 選前排 (slot 0-2)', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        makeHero({ side: 'enemy', slot: 1 }),
        makeHero({ side: 'enemy', slot: 3 }), // 後排
        makeHero({ side: 'enemy', slot: 4 }), // 後排
      ]

      const targets = selectTargets('front_row_enemies', attacker, [attacker], enemies)
      expect(targets).toHaveLength(2)
      expect(targets.every(t => t.slot < 3)).toBe(true)
    })

    it('front_row_enemies 前排全滅 → 打後排', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0, currentHP: 0 }), // 已死
        makeHero({ side: 'enemy', slot: 3 }),
        makeHero({ side: 'enemy', slot: 4 }),
      ]

      // selectTargets 過濾存活
      const targets = selectTargets('front_row_enemies', attacker, [attacker], enemies)
      expect(targets.length).toBeGreaterThan(0)
      expect(targets.every(t => t.slot >= 3)).toBe(true)
    })

    it('back_row_enemies 選後排 (slot 3-5)', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        makeHero({ side: 'enemy', slot: 3 }),
        makeHero({ side: 'enemy', slot: 5 }),
      ]

      const targets = selectTargets('back_row_enemies', attacker, [attacker], enemies)
      expect(targets).toHaveLength(2)
      expect(targets.every(t => t.slot >= 3)).toBe(true)
    })

    it('back_row_enemies 後排全滅 → 打前排', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        makeHero({ side: 'enemy', slot: 1 }),
        makeHero({ side: 'enemy', slot: 3, currentHP: 0 }), // 已死
      ]

      const targets = selectTargets('back_row_enemies', attacker, [attacker], enemies)
      expect(targets.length).toBeGreaterThan(0)
      expect(targets.every(t => t.slot < 3)).toBe(true)
    })
  })

  /* ═══════ 普攻目標策略（proximity） ═══════ */

  describe('普攻策略 — proximity', () => {
    it('slot 0 攻擊者優先選 slot 0 前排敵人', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0, name: 'E_s0' }),
        makeHero({ side: 'enemy', slot: 1, name: 'E_s1' }),
        makeHero({ side: 'enemy', slot: 2, name: 'E_s2' }),
      ]

      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).not.toBeNull()
      expect(target!.slot).toBe(0) // 對位欄
    })

    it('slot 1 攻擊者優先選 slot 1 前排敵人', () => {
      const attacker = makeHero({ side: 'player', slot: 1 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0, name: 'E_s0' }),
        makeHero({ side: 'enemy', slot: 1, name: 'E_s1' }),
        makeHero({ side: 'enemy', slot: 2, name: 'E_s2' }),
      ]

      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target!.slot).toBe(1)
    })

    it('對位欄已死 → 鄰近欄', () => {
      const attacker = makeHero({ side: 'player', slot: 1 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0, name: 'E_s0' }),
        makeHero({ side: 'enemy', slot: 1, name: 'E_s1', currentHP: 0 }), // 已死
        makeHero({ side: 'enemy', slot: 2, name: 'E_s2' }),
      ]

      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).not.toBeNull()
      expect(target!.slot).not.toBe(1) // 不選已死的
    })

    it('前排全滅 → 選後排', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0, currentHP: 0 }),
        makeHero({ side: 'enemy', slot: 1, currentHP: 0 }),
        makeHero({ side: 'enemy', slot: 2, currentHP: 0 }),
        makeHero({ side: 'enemy', slot: 3 }),
        makeHero({ side: 'enemy', slot: 4 }),
      ]

      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).not.toBeNull()
      expect(target!.slot).toBeGreaterThanOrEqual(3)
    })
  })

  /* ═══════ 嘲諷目標 ═══════ */

  describe('嘲諷目標', () => {
    it('嘲諷角色優先被攻擊', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const taunter = makeHero({ side: 'enemy', slot: 2, name: 'Taunter' })
      applyStatus(taunter, { type: 'taunt', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'self' })

      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        makeHero({ side: 'enemy', slot: 1 }),
        taunter,
      ]

      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).toBe(taunter)
    })

    it('嘲諷角色已死 → 正常選擇', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const taunter = makeHero({ side: 'enemy', slot: 2, name: 'Taunter', currentHP: 0 })
      applyStatus(taunter, { type: 'taunt', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'self' })

      const enemies = [
        makeHero({ side: 'enemy', slot: 0, name: 'E0' }),
        taunter,
      ]

      const target = selectNormalAttackTarget(attacker, enemies)
      expect(target).not.toBeNull()
      expect(target!.name).toBe('E0') // 不選已死的嘲諷
    })

    it('single_enemy 也受嘲諷影響', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const taunter = makeHero({ side: 'enemy', slot: 2, name: 'Taunter' })
      applyStatus(taunter, { type: 'taunt', value: 0, duration: 3, maxStacks: 1, sourceHeroId: 'self' })

      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
        taunter,
      ]

      const targets = selectTargets('single_enemy', attacker, [attacker], enemies)
      expect(targets).toHaveLength(1)
      expect(targets[0]).toBe(taunter)
    })
  })

  /* ═══════ 友方目標 ═══════ */

  describe('友方目標', () => {
    it('single_ally 選最低 HP%', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const allies = [
        makeHero({ side: 'player', slot: 0, currentHP: 900, maxHP: 1000 }), // 90%
        makeHero({ side: 'player', slot: 1, currentHP: 300, maxHP: 1000 }), // 30%
        makeHero({ side: 'player', slot: 2, currentHP: 700, maxHP: 1000 }), // 70%
      ]

      const targets = selectTargets('single_ally', attacker, allies, [])
      expect(targets).toHaveLength(1)
      expect(targets[0].currentHP).toBe(300) // 最低 HP%
    })

    it('all_allies 回傳所有存活友方', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const allies = [
        makeHero({ side: 'player', slot: 0 }),
        makeHero({ side: 'player', slot: 1, currentHP: 0 }), // 已死
        makeHero({ side: 'player', slot: 2 }),
      ]

      const targets = selectTargets('all_allies', attacker, allies, [])
      expect(targets).toHaveLength(2) // 只有存活的
    })

    it('self 回傳自己', () => {
      const attacker = makeHero({ side: 'player', slot: 0, name: 'Self' })

      const targets = selectTargets('self', attacker, [attacker], [])
      expect(targets).toHaveLength(1)
      expect(targets[0].name).toBe('Self')
    })
  })

  /* ═══════ 未知 target type fallback ═══════ */

  describe('未知 target type', () => {
    it('不認識的 type 用普攻策略 fallback', () => {
      const attacker = makeHero({ side: 'player', slot: 0 })
      const enemies = [
        makeHero({ side: 'enemy', slot: 0 }),
      ]

      const targets = selectTargets('unknown_type', attacker, [attacker], enemies)
      expect(targets).toHaveLength(1)
    })
  })
})
