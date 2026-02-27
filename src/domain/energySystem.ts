/**
 * energySystem — 能量管理
 *
 * 純函式模組。
 * 對應 specs/core-combat.md v2.0 第四節、specs/skill-system.md v0.2
 */

import type { BattleHero, EnergyConfig, DEFAULT_ENERGY_CONFIG } from './types'
import { isSilenced } from './buffSystem'

const CONFIG: EnergyConfig = {
  maxEnergy: 1000,
  onAttack: 200,
  onBeAttacked: 150,
  onKill: 100,
  perTurn: 50,
}

/* ════════════════════════════════════
   能量操作
   ════════════════════════════════════ */

/**
 * 增加能量（不超過上限）
 * @returns 實際增加量
 */
export function addEnergy(hero: BattleHero, amount: number): number {
  const prev = hero.energy
  hero.energy = Math.min(CONFIG.maxEnergy, hero.energy + amount)
  return hero.energy - prev
}

/**
 * 回合開始自然回復
 */
export function turnStartEnergy(hero: BattleHero): number {
  return addEnergy(hero, CONFIG.perTurn)
}

/**
 * 普攻命中後獲得能量
 */
export function onAttackEnergy(attacker: BattleHero): number {
  return addEnergy(attacker, CONFIG.onAttack)
}

/**
 * 被攻擊時獲得能量（需存活）
 */
export function onBeAttackedEnergy(target: BattleHero): number {
  if (target.currentHP <= 0) return 0
  return addEnergy(target, CONFIG.onBeAttacked)
}

/**
 * 擊殺獎勵能量
 */
export function onKillEnergy(attacker: BattleHero): number {
  return addEnergy(attacker, CONFIG.onKill)
}

/**
 * 施放大招後歸零
 */
export function consumeEnergy(hero: BattleHero): void {
  hero.energy = 0
}

/* ════════════════════════════════════
   判斷條件
   ════════════════════════════════════ */

/**
 * 是否可以施放大招
 * - 能量 >= 1000
 * - 有主動技能
 * - 未被沉默
 */
export function canCastUltimate(hero: BattleHero): boolean {
  return (
    hero.energy >= CONFIG.maxEnergy &&
    hero.activeSkill != null &&
    !isSilenced(hero)
  )
}

/**
 * 取得能量配置（供 UI 使用）
 */
export function getEnergyConfig(): EnergyConfig {
  return { ...CONFIG }
}
