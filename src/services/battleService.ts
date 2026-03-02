/**
 * battleService  後端戰鬥 API 呼叫
 *
 * 前端建構好 BattleHero[] 後，POST 到 Workers 後端的 run-battle handler，
 * 由後端引擎跑完整場戰鬥，回傳 { winner, actions[] } 供前端播放動畫。
 */

import { callApi } from './apiClient'
import type { BattleHero, BattleAction } from '../domain/types'

export interface BattleResult {
  winner: 'player' | 'enemy' | 'draw'
  actions: BattleAction[]
}

/**
 * 呼叫後端戰鬥引擎 API
 */
export async function runBattleRemote(
  players: BattleHero[],
  enemies: BattleHero[],
  maxTurns: number = 50,
): Promise<BattleResult> {
  const res = await callApi<{ winner: string; actions: BattleAction[] }>(
    'run-battle',
    {
      players: serializeHeroes(players),
      enemies: serializeHeroes(enemies),
      maxTurns,
    },
  )

  if (!res.success) {
    throw new Error(res.error || 'run-battle API failed')
  }

  return {
    winner: res.winner as BattleResult['winner'],
    actions: res.actions || [],
  }
}

/**
 * 精簡序列化 BattleHero  只保留後端引擎需要的邏輯欄位
 */
function serializeHeroes(heroes: BattleHero[]): unknown[] {
  return heroes.map(h => ({
    uid: h.uid,
    heroId: h.heroId,
    modelId: h.modelId,
    name: h.name,
    side: h.side,
    slot: h.slot,
    element: h.element,
    baseStats: h.baseStats,
    finalStats: h.finalStats,
    currentHP: h.currentHP,
    maxHP: h.maxHP,
    energy: h.energy,
    activeSkill: h.activeSkill,
    passives: h.passives,
    activePassives: h.activePassives,
    statusEffects: h.statusEffects,
    shields: h.shields,
    passiveUsage: h.passiveUsage,
    totalDamageDealt: h.totalDamageDealt,
    totalHealingDone: h.totalHealingDone,
    killCount: h.killCount,
  }))
}
