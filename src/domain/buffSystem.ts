/**
 * buffSystem — Buff / Debuff 管理
 *
 * 純函式模組，管理角色身上的狀態效果。
 * 對應 .ai/specs/core-combat.md v2.0 第五節
 * 對應 .ai/specs/effect-system.md v2.4 第十三節（疊加規則）
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

/** 互斥對照表：增益 ↔ 減益 */
const MUTUAL_EXCLUSIVE_MAP: Partial<Record<StatusType, StatusType>> = {
  atk_up: 'atk_down',
  atk_down: 'atk_up',
  def_up: 'def_down',
  def_down: 'def_up',
  spd_up: 'spd_down',
  spd_down: 'spd_up',
  crit_rate_up: 'crit_rate_down',
  crit_rate_down: 'crit_rate_up',
}

/* ════════════════════════════════════
   施加效果
   ════════════════════════════════════ */

/**
 * 嘗試對目標施加一個狀態效果（不帶 sourceEffectId）
 * @returns 是否成功施加
 */
export function applyStatus(
  target: BattleHero,
  effect: Omit<StatusEffect, 'stacks'>,
): boolean {
  return applyStatusV2(target, effect)
}

/**
 * v2 效果施加（支援 sourceEffectId, 互斥, 同源/異源疊加）
 * @returns 是否成功施加
 */
export function applyStatusV2(
  target: BattleHero,
  effect: Omit<StatusEffect, 'stacks'>,
  sourceEffectId?: string,
): boolean {
  // 免疫判定
  if (isDebuff(effect.type) && hasStatus(target, 'immunity')) {
    return false
  }

  // 控制效果不疊加，刷新時間
  if (CONTROL_TYPES.includes(effect.type)) {
    const existing = target.statusEffects.find(s => s.type === effect.type)
    if (existing) {
      existing.duration = Math.max(existing.duration, effect.duration)
      return true
    }
    target.statusEffects.push({ ...effect, stacks: 1, sourceEffectId })
    return true
  }

  // 互斥覆蓋檢查 (同回合數合併、不同回合數共存)
  const opposite = MUTUAL_EXCLUSIVE_MAP[effect.type]
  if (opposite) {
    const existingOpp = target.statusEffects.find(
      s => s.type === opposite && s.duration === effect.duration
    )
    if (existingOpp) {
      // 同回合數 → 合併（舊值 - 新值 or 新值 - 舊值）
      const isBuff = BUFF_TYPES.includes(effect.type)
      if (isBuff) {
        // 新效果是 buff，舊效果是對應 debuff → 淨值 = buff.value - debuff.value
        existingOpp.value = Math.max(0, existingOpp.value - effect.value)
        if (existingOpp.value <= 0) {
          // debuff 被完全抵消，轉為 buff
          target.statusEffects = target.statusEffects.filter(s => s !== existingOpp)
          const net = effect.value - (existingOpp.value + effect.value) // 淨 buff
          if (effect.value > 0) {
            target.statusEffects.push({ ...effect, stacks: 1, sourceEffectId })
          }
        }
        return true
      } else {
        // 新效果是 debuff，舊效果是 buff
        existingOpp.value = Math.max(0, existingOpp.value - effect.value)
        if (existingOpp.value <= 0) {
          target.statusEffects = target.statusEffects.filter(s => s !== existingOpp)
          if (effect.value > existingOpp.value + effect.value) {
            target.statusEffects.push({ ...effect, stacks: 1, sourceEffectId })
          }
        }
        return true
      }
    }
    // 不同回合數 → 共存（各自獨立）
  }

  // 同源 + 同回合數 → 合併疊加
  const existing = target.statusEffects.find(
    s => s.type === effect.type
      && s.sourceEffectId === sourceEffectId
      && sourceEffectId != null
      && s.duration === effect.duration
  )

  if (existing) {
    if (existing.stacks < existing.maxStacks) {
      existing.stacks++
      existing.value += effect.value
    }
    return true
  }

  // 無 sourceEffectId：同 type 直接疊加
  if (!sourceEffectId) {
    const existing = target.statusEffects.find(s => s.type === effect.type && !s.sourceEffectId)
    if (existing) {
      if (existing.stacks < existing.maxStacks) {
        existing.stacks++
        existing.value += effect.value
      }
      existing.duration = Math.max(existing.duration, effect.duration)
      return true
    }
  }

  // 新增獨立效果
  target.statusEffects.push({ ...effect, stacks: 1, sourceEffectId })
  return true
}

/**
 * 移除指定類型的效果
 */
export function removeStatus(target: BattleHero, type: StatusType): void {
  target.statusEffects = target.statusEffects.filter(s => s.type !== type)
}

/**
 * 淨化 debuff
 * v2: 若指定 statusType，移除該類型的所有效果
 *     若未指定，隨機移除 count 個 debuff
 */
export function cleanse(target: BattleHero, count: number = 1, statusType?: StatusType): StatusType[] {
  const removed: StatusType[] = []

  if (statusType) {
    // 移除指定類型的所有效果
    const toRemove = target.statusEffects.filter(s => s.type === statusType && isDebuff(s.type))
    for (const s of toRemove) {
      removed.push(s.type)
    }
    target.statusEffects = target.statusEffects.filter(s => !(s.type === statusType && isDebuff(s.type)))
  } else {
    // 隨機移除 count 個 debuff
    for (let i = 0; i < count; i++) {
      const idx = target.statusEffects.findIndex(s => isDebuff(s.type))
      if (idx >= 0) {
        removed.push(target.statusEffects[idx].type)
        target.statusEffects.splice(idx, 1)
      }
    }
  }
  return removed
}

/**
 * 驅散 buff（v2 新增）
 * 若指定 statusType，移除該類型的所有 buff
 * 若未指定，隨機移除 count 個 buff
 * @returns 被移除的 StatusEffect 陣列（可能用於偷取等操作）
 */
export function dispelBuff(target: BattleHero, count: number = 1, statusType?: StatusType): StatusEffect[] {
  const removed: StatusEffect[] = []

  if (statusType) {
    const toRemove = target.statusEffects.filter(s => s.type === statusType && !isDebuff(s.type))
    removed.push(...toRemove)
    target.statusEffects = target.statusEffects.filter(s => !(s.type === statusType && !isDebuff(s.type)))
  } else {
    for (let i = 0; i < count; i++) {
      const idx = target.statusEffects.findIndex(s => !isDebuff(s.type) && s.type !== 'immunity')
      if (idx >= 0) {
        removed.push(target.statusEffects[idx])
        target.statusEffects.splice(idx, 1)
      }
    }
  }
  return removed
}

/**
 * 偷取 buff（v2 新增）：從目標移除 1 個 buff 並施加到自己
 */
export function stealBuff(source: BattleHero, target: BattleHero): StatusType | null {
  const stolen = dispelBuff(target, 1)
  if (stolen.length === 0) return null
  const buff = stolen[0]
  source.statusEffects.push({ ...buff, sourceHeroId: source.uid })
  return buff.type
}

/**
 * 轉移 debuff（v2 新增）：從自己移除 1 個 debuff 並施加到目標
 */
export function transferDebuff(source: BattleHero, target: BattleHero): StatusType | null {
  const idx = source.statusEffects.findIndex(s => isDebuff(s.type))
  if (idx < 0) return null
  const debuff = source.statusEffects[idx]
  source.statusEffects.splice(idx, 1)
  // 目標免疫判定
  if (hasStatus(target, 'immunity')) return null
  target.statusEffects.push({ ...debuff, sourceHeroId: source.uid })
  return debuff.type
}

/* ════════════════════════════════════
   回合結算
   ════════════════════════════════════ */

export interface DotTickResult {
  type: StatusType
  damage: number
  sourceUid?: string
}

/**
 * 回合開始時結算 DOT 傷害
 * @returns DOT 傷害列表
 */
/** 中毒 DOT 計算時使用的 HP 上限（防止 Boss 99,999,999 HP 導致破格傷害） */
const DOT_POISON_HP_CAP = 100_000

export function processDotEffects(hero: BattleHero, allHeroes: BattleHero[]): DotTickResult[] {
  const results: DotTickResult[] = []

  for (const status of hero.statusEffects) {
    if (!DOT_TYPES.includes(status.type)) continue

    const source = allHeroes.find(h => h.uid === status.sourceHeroId)
    let dmg = 0

    // status.value 已包含疊層合計（3 層各 0.3 → value=0.9），不需再乘 stacks
    switch (status.type) {
      case 'dot_burn':
        // 施加者 ATK × value（預設 30%/層）
        dmg = Math.floor((source?.finalStats.ATK ?? 0) * (status.value || 0.3))
        break
      case 'dot_poison': {
        // 目標 maxHP × value（預設 3%/層），HP 上限防 Boss 破格
        const cappedHP = Math.min(hero.maxHP, DOT_POISON_HP_CAP)
        dmg = Math.floor(cappedHP * (status.value || 0.03))
        break
      }
      case 'dot_bleed':
        // 施加者 ATK × value（預設 25%/層）
        dmg = Math.floor((source?.finalStats.ATK ?? 0) * (status.value || 0.25))
        break
    }

    if (dmg > 0) {
      hero.currentHP = Math.max(0, hero.currentHP - dmg)
      results.push({ type: status.type, damage: dmg, sourceUid: status.sourceHeroId })
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
    // status.value 已包含疊層合計，不需再乘 stacks
    const heal = Math.floor(hero.maxHP * status.value)
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
 * 注意：value 已在 applyStatus 中按疊加層數累加，不需再乘以 stacks
 */
export function getStatusValue(hero: BattleHero, type: StatusType): number {
  return hero.statusEffects
    .filter(s => s.type === type)
    .reduce((sum, s) => sum + s.value, 0)
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

function _isPermaBuff(status: StatusEffect): boolean {
  // duration === 0 的效果是永久效果（如 always 被動帶來的）
  return status.duration === 0
}
