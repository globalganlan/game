/**
 * targetStrategy — 目標選擇策略
 *
 * 純函式模組。
 * 對應 .ai/specs/core-combat.md v2.0 第七節
 */

import type { BattleHero, TargetType } from './types'
import { hasTaunt } from './buffSystem'

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

const FRONT_INDICES = [0, 1, 2]
const BACK_INDICES = [3, 4, 5]

/* ════════════════════════════════════
   核心策略函式
   ════════════════════════════════════ */

/**
 * 根據技能目標類型選擇目標
 */
export function selectTargets(
  targetType: TargetType | string,
  attacker: BattleHero,
  allies: BattleHero[],
  enemies: BattleHero[],
): BattleHero[] {
  const aliveEnemies = enemies.filter(e => e.currentHP > 0)
  const aliveAllies = allies.filter(a => a.currentHP > 0)

  switch (targetType) {
    case 'single_enemy':
      return selectSingleEnemy(attacker, aliveEnemies)
    case 'all_enemies':
      return aliveEnemies
    case 'random_enemies_3':
      return selectRandomEnemies(aliveEnemies, 3)
    case 'front_row_enemies':
      return selectFrontRow(aliveEnemies)
    case 'back_row_enemies':
      return selectBackRow(aliveEnemies)
    case 'single_ally':
      return selectLowestHpAlly(aliveAllies)
    case 'all_allies':
      return aliveAllies
    case 'self':
      return [attacker]
    default: {
      // 處理 random_enemies_N 格式
      const match = targetType.match(/^random_enemies_(\d+)$/)
      if (match) {
        return selectRandomEnemies(aliveEnemies, parseInt(match[1]))
      }
      // Fallback: 按普攻策略
      return selectSingleEnemy(attacker, aliveEnemies)
    }
  }
}

/* ════════════════════════════════════
   普攻目標策略（TARGET_NORMAL）
   ════════════════════════════════════ */

/**
 * 普攻目標選擇
 * 優先順序：嘲諷 > 前排對位欄 > 前排其他 > 後排對位欄 > 後排其他
 */
export function selectNormalAttackTarget(
  attacker: BattleHero,
  enemies: BattleHero[],
): BattleHero | null {
  const alive = enemies.filter(e => e.currentHP > 0)
  if (alive.length === 0) return null

  // 最高優先：嘲諷目標
  const taunters = alive.filter(e => hasTaunt(e))
  if (taunters.length > 0) {
    return taunters[0]
  }

  const col = slotColumn(attacker.slot)

  // 前排對位 → 前排其他 → 後排對位 → 後排其他
  const frontAlive = alive.filter(e => FRONT_INDICES.includes(e.slot))
  if (frontAlive.length > 0) {
    return pickByColumnProximity(frontAlive, col) ?? frontAlive[0]
  }

  const backAlive = alive.filter(e => BACK_INDICES.includes(e.slot))
  if (backAlive.length > 0) {
    return pickByColumnProximity(backAlive, col) ?? backAlive[0]
  }

  return alive[0]
}

/* ════════════════════════════════════
   各類策略實作
   ════════════════════════════════════ */

function selectSingleEnemy(attacker: BattleHero, enemies: BattleHero[]): BattleHero[] {
  // 嘲諷 > 普攻目標策略
  const target = selectNormalAttackTarget(attacker, enemies)
  return target ? [target] : []
}

function selectRandomEnemies(enemies: BattleHero[], count: number): BattleHero[] {
  if (enemies.length === 0) return []
  const results: BattleHero[] = []
  for (let i = 0; i < count; i++) {
    // 可重複選擇（隨機 N 體可打同一個）
    results.push(enemies[Math.floor(Math.random() * enemies.length)])
  }
  return results
}

function selectFrontRow(enemies: BattleHero[]): BattleHero[] {
  const front = enemies.filter(e => FRONT_INDICES.includes(e.slot))
  // 前排無人時打後排
  return front.length > 0 ? front : enemies.filter(e => BACK_INDICES.includes(e.slot))
}

function selectBackRow(enemies: BattleHero[]): BattleHero[] {
  const back = enemies.filter(e => BACK_INDICES.includes(e.slot))
  // 後排無人時打前排
  return back.length > 0 ? back : enemies.filter(e => FRONT_INDICES.includes(e.slot))
}

function selectLowestHpAlly(allies: BattleHero[]): BattleHero[] {
  if (allies.length === 0) return []
  const sorted = [...allies].sort((a, b) => (a.currentHP / a.maxHP) - (b.currentHP / b.maxHP))
  return [sorted[0]]
}

/* ════════════════════════════════════
   工具函式
   ════════════════════════════════════ */

function slotColumn(slot: number): number {
  return slot % 3
}

function pickByColumnProximity(candidates: BattleHero[], preferCol: number): BattleHero | null {
  // 同欄優先
  const sameCol = candidates.find(c => slotColumn(c.slot) === preferCol)
  if (sameCol) return sameCol

  // 按欄距排序
  const sorted = [...candidates].sort(
    (a, b) => Math.abs(slotColumn(a.slot) - preferCol) - Math.abs(slotColumn(b.slot) - preferCol)
  )
  return sorted[0] ?? null
}
