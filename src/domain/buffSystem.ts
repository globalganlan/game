/**
 * buffSystem — Buff / Debuff 管理
 *
 * 純函式模組，管理角色身上的狀態效果。
 * 對應 specs/core-combat.md v2.0 第五節
 */

import type { BattleHero, StatusEffect, StatusType, Shield, FinalStats } from './types'

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

const DOT_TYPES: StatusType[] = ['dot_burn', 'dot_poison', 'dot_bleed']
const CONTROL_TYPES: StatusType[] = ['stun', 'freeze', 'silence', 'fear']
const BUFF_TYPES: StatusType[] = [
  'atk_up', 'def_up', 'spd_up', 'crit_rate_up', 'crit_dmg_up',
  'dmg_reduce', 'shield', 'regen', 'energy_boost',
  'dodge_up', 'reflect', 'taunt',
]

/* ════════════════════════════════════
   施加效果
   ════════════════════════════════════ */

/**
 * 嘗試對目標施加一個狀態效果
 * @returns 是否成功施加
 */
export function applyStatus(
  target: BattleHero,
  effect: Omit<StatusEffect, 'stacks'>,
): boolean {
  // 免疫判定
  if (isDebuff(effect.type) && hasStatus(target, 'immunity')) {
    return false
  }

  // 機率判定已在外層處理，此處直接施加

  const existing = target.statusEffects.find(s => s.type === effect.type)

  if (existing) {
    // 控制效果不疊加，刷新時間
    if (CONTROL_TYPES.includes(effect.type)) {
      existing.duration = Math.max(existing.duration, effect.duration)
      return true
    }
    // 可疊加效果
    if (existing.stacks < existing.maxStacks) {
      existing.stacks++
      existing.value += effect.value
    }
    existing.duration = Math.max(existing.duration, effect.duration)
    return true
  }

  // 新增效果
  target.statusEffects.push({
    ...effect,
    stacks: 1,
  })
  return true
}

/**
 * 移除指定類型的效果
 */
export function removeStatus(target: BattleHero, type: StatusType): void {
  target.statusEffects = target.statusEffects.filter(s => s.type !== type)
}

/**
 * 淨化（移除一個 debuff）
 */
export function cleanse(target: BattleHero, count: number = 1): StatusType[] {
  const removed: StatusType[] = []
  for (let i = 0; i < count; i++) {
    const idx = target.statusEffects.findIndex(s => isDebuff(s.type))
    if (idx >= 0) {
      removed.push(target.statusEffects[idx].type)
      target.statusEffects.splice(idx, 1)
    }
  }
  return removed
}

/* ════════════════════════════════════
   回合結算
   ════════════════════════════════════ */

export interface DotTickResult {
  type: StatusType
  damage: number
}

/**
 * 回合開始時結算 DOT 傷害
 * @returns DOT 傷害列表
 */
export function processDotEffects(hero: BattleHero, allHeroes: BattleHero[]): DotTickResult[] {
  const results: DotTickResult[] = []

  for (const status of hero.statusEffects) {
    if (!DOT_TYPES.includes(status.type)) continue

    const source = allHeroes.find(h => h.uid === status.sourceHeroId)
    let dmg = 0

    switch (status.type) {
      case 'dot_burn':
        // 施加者 ATK × 30%
        dmg = Math.floor((source?.finalStats.ATK ?? 0) * 0.3 * status.stacks)
        break
      case 'dot_poison':
        // 目標 max HP × 3%（無視 DEF）
        dmg = Math.floor(hero.maxHP * 0.03 * status.stacks)
        break
      case 'dot_bleed':
        // 施加者 ATK × 25%，無視 50% DEF
        dmg = Math.floor((source?.finalStats.ATK ?? 0) * 0.25 * status.stacks)
        break
    }

    if (dmg > 0) {
      hero.currentHP = Math.max(0, hero.currentHP - dmg)
      results.push({ type: status.type, damage: dmg })
    }
  }

  return results
}

/**
 * 回合開始時結算 regen 回復
 */
export function processRegen(hero: BattleHero): number {
  let totalHeal = 0
  for (const status of hero.statusEffects) {
    if (status.type !== 'regen') continue
    const heal = Math.floor(hero.maxHP * status.value * status.stacks)
    if (heal > 0) {
      const actual = Math.min(heal, hero.maxHP - hero.currentHP)
      hero.currentHP += actual
      totalHeal += actual
    }
  }
  return totalHeal
}

/**
 * 回合結束時倒數所有效果的 duration
 * 移除到期的效果
 * @returns 被移除的效果列表
 */
export function tickStatusDurations(hero: BattleHero): StatusType[] {
  const expired: StatusType[] = []

  // 先標記哪些是原本就永久的（duration 在扣減前已為 0）
  const permaBefore = new Set(
    hero.statusEffects.filter(s => s.duration === 0).map(s => s)
  )

  for (const status of hero.statusEffects) {
    if (status.duration > 0) {
      status.duration--
      if (status.duration <= 0) {
        expired.push(status.type)
      }
    }
    // duration === 0 表示永久效果（如 always 被動），不倒數
  }

  // 移除到期效果，但保留「原本就是永久」的效果
  hero.statusEffects = hero.statusEffects.filter(s => s.duration > 0 || permaBefore.has(s))

  return expired
}

/**
 * 結算護盾 duration
 */
export function tickShieldDurations(hero: BattleHero): void {
  hero.shields = hero.shields
    .map(s => ({ ...s, duration: s.duration - 1 }))
    .filter(s => s.duration > 0 && s.value > 0)
}

/* ════════════════════════════════════
   查詢工具函式
   ════════════════════════════════════ */

/**
 * 查詢角色身上指定效果的總數值（加算所有同類型）
 */
export function getStatusValue(hero: BattleHero, type: StatusType): number {
  return hero.statusEffects
    .filter(s => s.type === type)
    .reduce((sum, s) => sum + s.value * s.stacks, 0)
}

/**
 * 檢查角色是否擁有指定效果
 */
export function hasStatus(hero: BattleHero, type: StatusType): boolean {
  return hero.statusEffects.some(s => s.type === type)
}

/**
 * 是否被控制（不能行動）
 */
export function isControlled(hero: BattleHero): boolean {
  return hero.statusEffects.some(s => s.type === 'stun' || s.type === 'freeze')
}

/**
 * 是否被沉默（不能施放大招）
 */
export function isSilenced(hero: BattleHero): boolean {
  return hasStatus(hero, 'silence')
}

/**
 * 是否被恐懼（跳過回合）
 */
export function isFeared(hero: BattleHero): boolean {
  return hasStatus(hero, 'fear')
}

/**
 * 是否擁有嘲諷
 */
export function hasTaunt(hero: BattleHero): boolean {
  return hasStatus(hero, 'taunt')
}

/**
 * 判斷是否為 Debuff 類型
 */
export function isDebuff(type: StatusType): boolean {
  return !BUFF_TYPES.includes(type) && type !== 'immunity' && type !== 'cleanse'
}

/**
 * 取得帶修正的最終數值
 * 在 finalStats（基礎+裝備）之上疊加戰鬥中的 Buff/Debuff
 */
export function getBuffedStats(hero: BattleHero): FinalStats {
  const base = { ...hero.finalStats }

  base.ATK = Math.floor(base.ATK * (1 + getStatusValue(hero, 'atk_up') - getStatusValue(hero, 'atk_down')))
  base.DEF = Math.floor(base.DEF * (1 + getStatusValue(hero, 'def_up') - getStatusValue(hero, 'def_down')))
  base.SPD = Math.floor(base.SPD * (1 + getStatusValue(hero, 'spd_up') - getStatusValue(hero, 'spd_down')))
  base.CritRate = base.CritRate + getStatusValue(hero, 'crit_rate_up') * 100 - getStatusValue(hero, 'crit_rate_down') * 100

  // 下限保護
  base.ATK = Math.max(1, base.ATK)
  base.DEF = Math.max(0, base.DEF)
  base.SPD = Math.max(1, base.SPD)
  base.CritRate = Math.max(0, Math.min(100, base.CritRate))

  return base
}

/* ════════════════════════════════════
   護盾吸收
   ════════════════════════════════════ */

/**
 * 護盾吸收傷害（先進先消耗）
 * @returns [實際受到的傷害, 護盾吸收量]
 */
export function absorbDamageByShields(hero: BattleHero, damage: number): [number, number] {
  let remaining = damage
  let absorbed = 0

  for (const shield of hero.shields) {
    if (remaining <= 0) break
    const absorb = Math.min(shield.value, remaining)
    shield.value -= absorb
    remaining -= absorb
    absorbed += absorb
  }

  // 清除空護盾
  hero.shields = hero.shields.filter(s => s.value > 0)

  return [remaining, absorbed]
}

/* ════════════════════════════════════
   內部工具
   ════════════════════════════════════ */

function isPermaBuff(status: StatusEffect): boolean {
  // duration === 0 的效果是永久效果（如 always 被動帶來的）
  return status.duration === 0
}
