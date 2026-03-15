/**
 * battleService 測試 — 遠端戰鬥 API 呼叫、序列化、錯誤處理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock fetch before importing module
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage (Node env doesn't have it)
const _store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = v },
  removeItem: (k: string) => { delete _store[k] },
  clear: () => { for (const k in _store) delete _store[k] },
})

// Dynamic import so mock is in place
const { runBattleRemote } = await import('../../services/battleService')
import { makeHero, resetUidCounter, makeSkill, makeDamageEffect } from '../../domain/__tests__/testHelper'
import type { BattleHero } from '../../domain/types'

function makeTestPlayers(): BattleHero[] {
  return [
    makeHero({
      uid: 'p1', heroId: 1, modelId: 'zombie_1', name: 'P1',
      side: 'player', slot: 0,
    }),
  ]
}

function makeTestEnemies(): BattleHero[] {
  return [
    makeHero({
      uid: 'e1', heroId: 2, modelId: 'zombie_2', name: 'E1',
      side: 'enemy', slot: 0,
    }),
  ]
}

function mockSuccessResponse(winner = 'player', actionsCount = 5) {
  const actions = Array.from({ length: actionsCount }, (_, i) => ({
    type: i === 0 ? 'TURN_START' : i === actionsCount - 1 ? 'BATTLE_END' : 'NORMAL_ATTACK',
    turn: 1,
  }))

  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      success: true,
      winner,
      actions,
    }),
  })
}

describe('battleService', () => {
  beforeEach(() => {
    resetUidCounter()
    vi.clearAllMocks()
  })

  /* ═══════ runBattleRemote 成功 ═══════ */

  describe('runBattleRemote — 成功場景', () => {
    it('回傳 { winner, actions }', async () => {
      mockSuccessResponse('player', 10)

      const result = await runBattleRemote(makeTestPlayers(), makeTestEnemies(), 50)

      expect(result).toHaveProperty('winner', 'player')
      expect(result).toHaveProperty('actions')
      expect(result.actions).toHaveLength(10)
    })

    it('winner=enemy', async () => {
      mockSuccessResponse('enemy', 3)

      const result = await runBattleRemote(makeTestPlayers(), makeTestEnemies(), 50)

      expect(result.winner).toBe('enemy')
    })

    it('winner=draw', async () => {
      mockSuccessResponse('draw', 2)

      const result = await runBattleRemote(makeTestPlayers(), makeTestEnemies(), 50)

      expect(result.winner).toBe('draw')
    })

    it('送出正確的 POST 請求', async () => {
      mockSuccessResponse()

      await runBattleRemote(makeTestPlayers(), makeTestEnemies(), 30)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/run-battle')
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(options.body)
      expect(body.maxTurns).toBe(30)
      expect(Array.isArray(body.players)).toBe(true)
      expect(Array.isArray(body.enemies)).toBe(true)
    })

    it('序列化只保留必要欄位', async () => {
      mockSuccessResponse()

      await runBattleRemote(makeTestPlayers(), makeTestEnemies(), 50)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const serializedPlayer = body.players[0]

      // 必要欄位
      expect(serializedPlayer).toHaveProperty('uid')
      expect(serializedPlayer).toHaveProperty('heroId')
      expect(serializedPlayer).toHaveProperty('name')
      expect(serializedPlayer).toHaveProperty('side')
      expect(serializedPlayer).toHaveProperty('slot')
      expect(serializedPlayer).toHaveProperty('baseStats')
      expect(serializedPlayer).toHaveProperty('finalStats')
      expect(serializedPlayer).toHaveProperty('currentHP')
      expect(serializedPlayer).toHaveProperty('maxHP')
      expect(serializedPlayer).toHaveProperty('energy')
      expect(serializedPlayer).toHaveProperty('activeSkill')
      expect(serializedPlayer).toHaveProperty('passives')
      expect(serializedPlayer).toHaveProperty('activePassives')
      expect(serializedPlayer).toHaveProperty('statusEffects')
      expect(serializedPlayer).toHaveProperty('shields')
      expect(serializedPlayer).toHaveProperty('passiveUsage')
    })

    it('預設 maxTurns=50', async () => {
      mockSuccessResponse()

      await runBattleRemote(makeTestPlayers(), makeTestEnemies())

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.maxTurns).toBe(50)
    })

    it('多角色正確序列化', async () => {
      mockSuccessResponse()

      const players = [
        makeHero({ uid: 'p1', side: 'player', slot: 0 }),
        makeHero({ uid: 'p2', side: 'player', slot: 1 }),
        makeHero({ uid: 'p3', side: 'player', slot: 2 }),
      ]
      const enemies = [
        makeHero({ uid: 'e1', side: 'enemy', slot: 0 }),
        makeHero({ uid: 'e2', side: 'enemy', slot: 1 }),
      ]

      await runBattleRemote(players, enemies, 50)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.players).toHaveLength(3)
      expect(body.enemies).toHaveLength(2)
    })
  })

  /* ═══════ runBattleRemote 錯誤 ═══════ */

  describe('runBattleRemote — 錯誤場景', () => {
    it('HTTP 錯誤 → 拋出例外', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      })

      await expect(
        runBattleRemote(makeTestPlayers(), makeTestEnemies()),
      ).rejects.toThrow('API HTTP 500')
    })

    it('API 回傳 success=false → 拋出例外', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: '無效的隊伍資料',
        }),
      })

      await expect(
        runBattleRemote(makeTestPlayers(), makeTestEnemies()),
      ).rejects.toThrow('無效的隊伍資料')
    })

    it('API 回傳 success=false 無 error → 預設訊息', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
        }),
      })

      await expect(
        runBattleRemote(makeTestPlayers(), makeTestEnemies()),
      ).rejects.toThrow('run-battle API failed')
    })

    it('網路錯誤 → 拋出例外', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      await expect(
        runBattleRemote(makeTestPlayers(), makeTestEnemies()),
      ).rejects.toThrow('Failed to fetch')
    })

    it('JSON 解析錯誤 → 拋出例外', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token') },
      })

      await expect(
        runBattleRemote(makeTestPlayers(), makeTestEnemies()),
      ).rejects.toThrow('Unexpected token')
    })
  })

  /* ═══════ 序列化邊界 ═══════ */

  describe('序列化邊界', () => {
    it('帶技能的英雄正確序列化', async () => {
      mockSuccessResponse()

      const skill = makeSkill({
        skillId: 'ULT_1',
        effects: [makeDamageEffect({ multiplier: 3.0 })],
      })
      const players = [
        makeHero({
          uid: 'p1',
          side: 'player',
          slot: 0,
          activeSkill: skill,
          passives: [makeSkill({ type: 'passive', passiveTrigger: 'on_attack' })],
          activePassives: [makeSkill({ type: 'passive', passiveTrigger: 'on_attack' })],
        }),
      ]

      await runBattleRemote(players, makeTestEnemies(), 50)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.players[0].activeSkill).not.toBeNull()
      expect(body.players[0].activeSkill.skillId).toBe('ULT_1')
      expect(body.players[0].passives).toHaveLength(1)
      expect(body.players[0].activePassives).toHaveLength(1)
    })

    it('空陣列英雄序列化不崩潰', async () => {
      mockSuccessResponse()

      await runBattleRemote([], [], 50)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.players).toHaveLength(0)
      expect(body.enemies).toHaveLength(0)
    })

    it('帶狀態效果的英雄正確序列化', async () => {
      mockSuccessResponse()

      const players = [
        makeHero({
          uid: 'p1',
          side: 'player',
          slot: 0,
          statusEffects: [
            { type: 'atk_up', value: 0.3, duration: 2, stacks: 1, maxStacks: 1, sourceHeroId: 'src' },
            { type: 'dot_burn', value: 0.1, duration: 3, stacks: 1, maxStacks: 1, sourceHeroId: 'src' },
          ],
          shields: [{ value: 200, duration: 2, sourceHeroId: 'src' }],
        }),
      ]

      await runBattleRemote(players, makeTestEnemies(), 50)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.players[0].statusEffects).toHaveLength(2)
      expect(body.players[0].shields).toHaveLength(1)
    })
  })
})
