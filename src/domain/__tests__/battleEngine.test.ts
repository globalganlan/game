/**
 * battleEngine 整合測試 + 數值模擬
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runBattle, createBattleHero, checkLethalPassive } from '../battleEngine'
import type { BattleEngineConfig, RawHeroInput } from '../battleEngine'
import type { BattleAction, SkillTemplate, SkillEffect, BattleHero } from '../types'
import { makeHero, makeSkill, resetUidCounter } from './testHelper'

/* ═══════ 工具函式 ═══════ */

function makeRawInput(overrides: Partial<RawHeroInput> = {}): RawHeroInput {
  return {
    heroId: 1,
    modelId: 'zombie_1',
    name: '測試角色',
    HP: 1000,
    ATK: 150,
    DEF: 50,
    SPD: 100,
    CritRate: 15,
    CritDmg: 50,
    ...overrides,
  }
}

function makeSilentConfig(): BattleEngineConfig {
  return {
    maxTurns: 50,
    onAction: async () => {},
  }
}

describe('battleEngine', () => {
  beforeEach(() => {
    resetUidCounter()
    vi.restoreAllMocks()
  })

  /* ═══════ createBattleHero ═══════ */

  describe('createBattleHero', () => {
    it('基礎建立', () => {
      const hero = createBattleHero(makeRawInput(), 'player', 0, null, [], 1)
      expect(hero.side).toBe('player')
      expect(hero.slot).toBe(0)
      expect(hero.currentHP).toBe(1000)
      expect(hero.maxHP).toBe(1000)
      expect(hero.energy).toBe(0)
      expect(hero.statusEffects).toEqual([])
      expect(hero.shields).toEqual([])
    })

    it('星級 1 → 1 被動', () => {
      const passives = [makeSkill({ type: 'passive' }), makeSkill({ type: 'passive' })]
      const hero = createBattleHero(makeRawInput(), 'player', 0, null, passives, 1)
      expect(hero.activePassives).toHaveLength(1)
    })

    it('星級 2 → 2 被動', () => {
      const passives = Array.from({ length: 4 }, () => makeSkill({ type: 'passive' }))
      const hero = createBattleHero(makeRawInput(), 'player', 0, null, passives, 2)
      expect(hero.activePassives).toHaveLength(2)
    })

    it('星級 4 → 3 被動', () => {
      const passives = Array.from({ length: 4 }, () => makeSkill({ type: 'passive' }))
      const hero = createBattleHero(makeRawInput(), 'player', 0, null, passives, 4)
      expect(hero.activePassives).toHaveLength(3)
    })

    it('星級 6 → 4 被動', () => {
      const passives = Array.from({ length: 4 }, () => makeSkill({ type: 'passive' }))
      const hero = createBattleHero(makeRawInput(), 'player', 0, null, passives, 6)
      expect(hero.activePassives).toHaveLength(4)
    })
  })

  /* ═══════ checkLethalPassive ═══════ */

  describe('checkLethalPassive', () => {
    it('無 on_lethal 被動 → false', () => {
      const hero = makeHero({ currentHP: 50 })
      expect(checkLethalPassive(hero, 100, [])).toBe(false)
    })

    it('有 on_lethal + revive 被動 → 保命並回復 HP', () => {
      const hero = makeHero({
        currentHP: 50,
        maxHP: 1000,
        activePassives: [
          makeSkill({
            skillId: 'PAS_test_lethal',
            type: 'passive',
            passiveTrigger: 'on_lethal',
            effects: [{ type: 'revive', multiplier: 0.1 }],
          }),
        ],
      })
      const result = checkLethalPassive(hero, 100, [hero])
      expect(result).toBeTruthy()
      expect(hero.currentHP).toBe(Math.max(1, Math.floor(1000 * 0.1))) // 100
    })

    it('使用次數超限 → false', () => {
      const hero = makeHero({
        currentHP: 50,
        maxHP: 1000,
        activePassives: [
          makeSkill({
            skillId: 'PAS_limited',
            type: 'passive',
            passiveTrigger: 'on_lethal',
            effects: [{ type: 'revive', multiplier: 0.1 }],
          }),
        ],
        passiveUsage: { 'PAS_limited': 1 }, // 已用 1 次，on_lethal 預設 max=1
      })
      const result = checkLethalPassive(hero, 100, [hero])
      expect(result).toBe(false)
    })

    it('不會致死 → false', () => {
      const hero = makeHero({
        currentHP: 500,
        maxHP: 1000,
        activePassives: [
          makeSkill({
            skillId: 'PAS_test',
            type: 'passive',
            passiveTrigger: 'on_lethal',
            effects: [{ type: 'revive', multiplier: 0.1 }],
          }),
        ],
      })
      const result = checkLethalPassive(hero, 100, [hero])
      expect(result).toBe(false) // 500 - 100 = 400 > 0
    })
  })

  /* ═══════ runBattle 整合測試 ═══════ */

  describe('runBattle', () => {
    it('一場完整戰鬥有勝負結果', async () => {
      const cfg = makeSilentConfig()
      const playerTeam = [
        createBattleHero(makeRawInput({ name: 'P1', SPD: 120 }), 'player', 0, null, [], 1),
        createBattleHero(makeRawInput({ name: 'P2', SPD: 110 }), 'player', 1, null, [], 1),
        createBattleHero(makeRawInput({ name: 'P3', SPD: 100 }), 'player', 2, null, [], 1),
      ]
      const enemyTeam = [
        createBattleHero(makeRawInput({ name: 'E1', SPD: 115, HP: 500 }), 'enemy', 0, null, [], 1),
        createBattleHero(makeRawInput({ name: 'E2', SPD: 105, HP: 500 }), 'enemy', 1, null, [], 1),
        createBattleHero(makeRawInput({ name: 'E3', SPD: 95, HP: 500 }), 'enemy', 2, null, [], 1),
      ]

      const result = await runBattle(playerTeam, enemyTeam, cfg)
      expect(['player', 'enemy', 'draw']).toContain(result)
    })

    it('maxTurns 超限 → draw', async () => {
      const cfg: BattleEngineConfig = {
        maxTurns: 1,
        onAction: async () => {},
      }
      // 高 HP 確保 1 回合打不完
      const playerTeam = [
        createBattleHero(makeRawInput({ name: 'P1', HP: 99999 }), 'player', 0, null, [], 1),
      ]
      const enemyTeam = [
        createBattleHero(makeRawInput({ name: 'E1', HP: 99999 }), 'enemy', 0, null, [], 1),
      ]

      const result = await runBattle(playerTeam, enemyTeam, cfg)
      expect(result).toBe('draw')
    })

    it('所有行動紀錄都有合法 type', async () => {
      const actions: BattleAction[] = []
      const cfg: BattleEngineConfig = {
        maxTurns: 5,
        onAction: async (action) => { actions.push(action) },
      }

      const playerTeam = [
        createBattleHero(makeRawInput({ name: 'P1', HP: 800 }), 'player', 0, null, [], 1),
      ]
      const enemyTeam = [
        createBattleHero(makeRawInput({ name: 'E1', HP: 800 }), 'enemy', 0, null, [], 1),
      ]

      await runBattle(playerTeam, enemyTeam, cfg)

      const validTypes = [
        'NORMAL_ATTACK', 'SKILL_CAST', 'DOT_TICK', 'BUFF_APPLY',
        'BUFF_EXPIRE', 'DEATH', 'PASSIVE_TRIGGER', 'ENERGY_CHANGE',
        'TURN_START', 'TURN_END', 'BATTLE_END',
      ]
      for (const action of actions) {
        expect(validTypes).toContain(action.type)
      }
    })
  })

  /* ═══════ 數值模擬：1000 場戰鬥 ═══════ */

  describe('數值模擬 (1000 場)', () => {
    it('公平對戰勝率應接近 50%（允許 ±15%）', async () => {
      const wins = { player: 0, enemy: 0, draw: 0 }
      const N = 1000

      for (let i = 0; i < N; i++) {
        const cfg = makeSilentConfig()
        cfg.maxTurns = 50

        const playerTeam = [
          createBattleHero(makeRawInput({ heroId: 1, name: 'P1', SPD: 100 + (i % 10) }), 'player', 0, null, [], 1),
        ]
        const enemyTeam = [
          createBattleHero(makeRawInput({ heroId: 2, name: 'E1', SPD: 100 + ((i + 5) % 10) }), 'enemy', 0, null, [], 1),
        ]

        const result = await runBattle(playerTeam, enemyTeam, cfg)
        wins[result]++
      }

      const playerWinRate = wins.player / N
      const enemyWinRate = wins.enemy / N
      const drawRate = wins.draw / N

      console.log(`\n📊 數值模擬結果 (${N} 場):`)
      console.log(`  玩家勝: ${wins.player} (${(playerWinRate * 100).toFixed(1)}%)`)
      console.log(`  敵方勝: ${wins.enemy} (${(enemyWinRate * 100).toFixed(1)}%)`)
      console.log(`  平手:   ${wins.draw} (${(drawRate * 100).toFixed(1)}%)`)

      // 公平對戰允許 ±15% 偏差
      expect(playerWinRate).toBeGreaterThan(0.35)
      expect(playerWinRate).toBeLessThan(0.65)
    }, 60_000) // 60s timeout for 1000 battles
  })
})
