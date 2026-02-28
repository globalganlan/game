/**
 * battleService — 後端戰鬥 API 呼叫
 *
 * 前端建構好 BattleHero[] 後，POST 到 GAS 後端的 run-battle handler，
 * 由後端引擎跑完整場戰鬥，回傳 { winner, actions[] } 供前端播放動畫。
 */

import type { BattleHero, BattleAction } from '../domain/types'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

export interface BattleResult {
  winner: 'player' | 'enemy' | 'draw'
  actions: BattleAction[]
}

/**
 * 呼叫後端戰鬥引擎 API
 *
 * @param players - 玩家方 BattleHero 陣列（前端已建構完成含所有 stats/skills）
 * @param enemies - 敵方 BattleHero 陣列
 * @param maxTurns - 最大回合數（預設 50）
 * @returns { winner, actions }
 * @throws 若 API 回傳非成功或網路錯誤
 */
export async function runBattleRemote(
  players: BattleHero[],
  enemies: BattleHero[],
  maxTurns: number = 50,
): Promise<BattleResult> {
  const body = JSON.stringify({
    action: 'run-battle',
    players: serializeHeroes(players),
    enemies: serializeHeroes(enemies),
    maxTurns,
  })

  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })

  if (!res.ok) {
    throw new Error(`run-battle API HTTP ${res.status}`)
  }

  const data = await res.json()

  if (!data.success) {
    throw new Error(data.error || 'run-battle API failed')
  }

  return {
    winner: data.winner as BattleResult['winner'],
    actions: data.actions as BattleAction[],
  }
}

/**
 * 精簡序列化 BattleHero — 移除前端表現用的冗餘欄位，
 * 只保留後端引擎需要的邏輯欄位，減少 payload 大小。
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
