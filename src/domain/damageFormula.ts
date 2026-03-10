/**
 * damageFormula — 完整傷害/治療/DOT/閃避計算
 *
 * 純函式模組，無副作用。
 * 對應 .ai/specs/damage-formula.md v0.1
 */

import type { BattleHero, DamageResult, HealResult, SkillEffect, FinalStats } from './types'
import { getStatusValue, hasStatus, absorbDamageByShields, getBuffedStats } from './buffSystem'

/* ════════════════════════════════════
   主要傷害公式
   ════════════════════════════════════ */

/**
 * 計算單次傷害（普攻或技能）
 *
 * 公式：基礎傷害 × DEF減傷 × 暴擊 × 屬性倍率 × 浮動 × Buff修正
 */
export function calculateDamage(
  attacker: BattleHero,
  target: BattleHero,
  skill?: SkillEffect,
): DamageResult {
  const atkStats = getBuffedStats(attacker)
  const defStats = getBuffedStats(target)

  // 0. 閃避判定
  const dodgeRate = getStatusValue(target, 'dodge_up')
  const totalDodge = Math.min(dodgeRate, 0.75) // cap 75%
  if (Math.random() < totalDodge) {
    return {
      damage: 0,
      isCrit: false,
      isDodge: true,
      damageType: 'miss',
      shieldAbsorbed: 0,
      reflectDamage: 0,
    }
  }

  // 1. 基礎傷害
  const scalingStat = skill?.scalingStat ?? 'ATK'
  const statValue = atkStats[scalingStat] ?? atkStats.ATK
  const multiplier = skill?.multiplier ?? 1.0
  const flatValue = skill?.flatValue ?? 0
  const baseDmg = statValue * multiplier + flatValue

  // 2. DEF 減傷: 100 / (100 + DEF)
  const effectiveDef = Math.max(0, defStats.DEF)
  const defReduction = 100 / (100 + effectiveDef)
  let dmg = baseDmg * defReduction

  // 3. 暴擊判定
  const critRate = Math.min(atkStats.CritRate / 100, 1.0)
  const isCrit = Math.random() < critRate
  if (isCrit) {
    dmg *= (1 + atkStats.CritDmg / 100) // CritDmg=50 → ×1.5
  }

  // 4. (屬性系統已移除)

  // 5. 隨機浮動 ±5%
  dmg *= 0.95 + Math.random() * 0.10

  // 6. 攻擊方 Buff/Debuff 修正
  dmg *= getAttackerDamageModifier(attacker)

  // 7. 防守方 Buff/Debuff 修正
  dmg *= getTargetDamageModifier(target)

  // 8. 取整（最低 1）
  dmg = Math.max(1, Math.floor(dmg))

  // 9. 護盾吸收
  const [actualDmg, shieldAbsorbed] = absorbDamageByShields(target, dmg)

  // 10. 反彈傷害
  const reflectDamage = calculateReflect(target, actualDmg)

  // 決定飄字顯示類型
  let damageType: DamageResult['damageType'] = 'normal'
  if (isCrit) damageType = 'crit'
  if (shieldAbsorbed > 0 && actualDmg === 0) damageType = 'shield'

  return {
    damage: actualDmg,
    isCrit,
    isDodge: false,
    damageType,
    shieldAbsorbed,
    reflectDamage,
  }
}

/* ════════════════════════════════════
   治療公式
   ════════════════════════════════════ */

/**
 * 計算治療量
 * 治療可暴擊（×1.5，不套用 CritDmg）
 */
export function calculateHeal(
  healer: BattleHero,
  target: BattleHero,
  skill: SkillEffect,
): HealResult {
  const healerStats = getBuffedStats(healer)

  const scalingStat = skill.scalingStat ?? 'ATK'
  const statValue = healerStats[scalingStat] ?? healerStats.ATK
  let heal = statValue * (skill.multiplier ?? 1.0) + (skill.flatValue ?? 0)

  // 治療暴擊（固定 ×1.5）
  const critRate = Math.min(healerStats.CritRate / 100, 1.0)
  const isCrit = Math.random() < critRate
  if (isCrit) heal *= 1.5

  // 不超過 HP 上限
  heal = Math.min(Math.floor(heal), target.maxHP - target.currentHP)
  heal = Math.max(0, heal)

  return { heal, isCrit }
}

/* ════════════════════════════════════
   DOT 傷害
   ════════════════════════════════════ */

/**
 * 計算 DOT 單 tick 傷害
 */
export function calculateDot(
  dotType: string,
  source: BattleHero | undefined,
  target: BattleHero,
): number {
  switch (dotType) {
    case 'dot_burn':
      return Math.floor((source?.finalStats.ATK ?? 0) * 0.3)
    case 'dot_poison':
      return Math.floor(target.maxHP * 0.03)
    case 'dot_bleed': {
      const atkVal = source?.finalStats.ATK ?? 0
      const defVal = target.finalStats.DEF
      // 無視 50% DEF
      return Math.floor(atkVal * 0.25 * (100 / (100 + defVal * 0.5)))
    }
    default:
      return 0
  }
}

/* ════════════════════════════════════
   反彈傷害
   ════════════════════════════════════ */

/**
 * 計算反彈傷害（無視 DEF，不觸發被動）
 */
export function calculateReflect(target: BattleHero, damageReceived: number): number {
  const reflectRate = getStatusValue(target, 'reflect')
  if (reflectRate <= 0) return 0
  return Math.floor(damageReceived * reflectRate)
}

/* ════════════════════════════════════
   Buff/Debuff 傷害修正
   ════════════════════════════════════ */

function getAttackerDamageModifier(_attacker: BattleHero): number {
  // atk_up / atk_down 已在 getBuffedStats() 中套用至 ATK 數值，
  // 此處僅保留額外增傷機制（如未來新增角色特性），不重複計算。
  return 1.0
}

function getTargetDamageModifier(target: BattleHero): number {
  let mult = 1.0
  mult -= getStatusValue(target, 'dmg_reduce')
  // def_down 已在 getBuffedStats() 中套用至 DEF 數值（影響 DEF 減傷公式），不重複計算。
  if (hasStatus(target, 'fear')) mult *= 1.2
  return Math.max(0.1, mult)
}
