/**
 * 剩餘技能整合測試 — 補齊 battleEffectsIntegration.test.ts 未涵蓋的技能
 *
 * 涵蓋技能：
 *   被動：PAS_1_2, PAS_1_4, PAS_2_3, PAS_2_4, PAS_3_4, PAS_5_2, PAS_5_4,
 *         PAS_6_2, PAS_7_1, PAS_7_2, PAS_8_1, PAS_8_3, PAS_8_4, PAS_9_1,
 *         PAS_10_2, PAS_10_4, PAS_11_4, PAS_12_1, PAS_12_2, PAS_12_4,
 *         PAS_13_1, PAS_13_2, PAS_13_4, PAS_14_2
 *   主動：SKL_SHADOW_STRIKE, SKL_BACK_SNIPE, SKL_FOCUS_HEAL
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { runBattleCollect, createBattleHero, checkLethalPassive, type RawHeroInput } from '../battleEngine'
import type { SkillTemplate, BattleHero, BattleAction } from '../types'
import { getStatusValue, hasStatus, getBuffedStats } from '../buffSystem'

/* ═══════════════ 工廠 Helper ═══════════════ */

const BASE: RawHeroInput = {
  heroId: 1, modelId: 'z1', name: 'T',
  HP: 5000, ATK: 500, DEF: 200, SPD: 100,
  CritRate: 10, CritDmg: 50,
}

const mk = (o: Partial<RawHeroInput> = {}): RawHeroInput => ({ ...BASE, ...o })

function mkP(id: string, trigger: string, target: string, effects: any[]): SkillTemplate {
  return { skillId: id, name: id, type: 'passive', target: target as any, description: '', effects, passiveTrigger: trigger as any, icon: '' }
}

function mkA(id: string, target: string, effects: any[]): SkillTemplate {
  return { skillId: id, name: id, type: 'active', target: target as any, description: '', effects, passiveTrigger: '', icon: '' }
}

function h(input: RawHeroInput, side: 'player' | 'enemy', slot: number, active: SkillTemplate | null, passives: SkillTemplate[], uid: string): BattleHero {
  return createBattleHero(input, side, slot, active, passives, 6, uid)
}

function fa<T extends BattleAction['type']>(actions: BattleAction[], type: T): Extract<BattleAction, { type: T }>[] {
  return actions.filter(a => a.type === type) as any[]
}

afterEach(() => { vi.restoreAllMocks() })

/* ═══════════════════════════════════════════
   A. always 被動（全隊光環）
   ═══════════════════════════════════════════ */

describe('always 全隊光環被動', () => {
  it('PAS_1_2 靈巧身軀（always all_allies spd_up +5%）', async () => {
    const pas = mkP('PAS_1_2', 'always', 'all_allies', [
      { type: 'buff', status: 'spd_up', statusValue: 0.05 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const p2 = h(mk({ SPD: 190 }), 'player', 1, null, [], 'p2')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1, p2], [e1], { maxTurns: 1 })

    expect(hasStatus(p1, 'spd_up')).toBe(true)
    expect(hasStatus(p2, 'spd_up')).toBe(true)
  })

  it('PAS_14_2 疾風（always all_allies spd_up +6%）', async () => {
    const pas = mkP('PAS_14_2', 'always', 'all_allies', [
      { type: 'buff', status: 'spd_up', statusValue: 0.06 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const p2 = h(mk({ SPD: 190 }), 'player', 1, null, [], 'p2')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1, p2], [e1], { maxTurns: 1 })

    expect(hasStatus(p1, 'spd_up')).toBe(true)
    expect(hasStatus(p2, 'spd_up')).toBe(true)
    expect(getStatusValue(p2, 'spd_up')).toBeCloseTo(0.06, 2)
  })
})

/* ═══════════════════════════════════════════
   B. battle_start 被動
   ═══════════════════════════════════════════ */

describe('battle_start 被動', () => {
  it('PAS_6_2 腐臭領域（battle_start all_enemies def_down -8%）', async () => {
    const pas = mkP('PAS_6_2', 'battle_start', 'all_enemies', [
      { type: 'debuff', status: 'def_down', statusValue: 0.08, statusDuration: 2 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')
    const e2 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 1, null, [], 'e2')

    await runBattleCollect([p1], [e1, e2], { maxTurns: 1 })

    expect(hasStatus(e1, 'def_down')).toBe(true)
    expect(hasStatus(e2, 'def_down')).toBe(true)
    expect(getStatusValue(e1, 'def_down')).toBeCloseTo(0.08, 2)
  })

  it('PAS_8_1 壓迫感（battle_start all_enemies atk_down -10%）', async () => {
    const pas = mkP('PAS_8_1', 'battle_start', 'all_enemies', [
      { type: 'debuff', status: 'atk_down', statusValue: 0.1, statusDuration: 2 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1], [e1], { maxTurns: 1 })

    expect(hasStatus(e1, 'atk_down')).toBe(true)
    expect(getStatusValue(e1, 'atk_down')).toBeCloseTo(0.1, 2)
  })

  it('PAS_8_4 夜之王（battle_start all_enemies atk_down-15% + def_down-10%）', async () => {
    const pas = mkP('PAS_8_4', 'battle_start', 'all_enemies', [
      { type: 'debuff', status: 'atk_down', statusValue: 0.15, statusDuration: 3 },
      { type: 'debuff', status: 'def_down', statusValue: 0.1, statusDuration: 3 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1], [e1], { maxTurns: 1 })

    expect(hasStatus(e1, 'atk_down')).toBe(true)
    expect(hasStatus(e1, 'def_down')).toBe(true)
    expect(getStatusValue(e1, 'atk_down')).toBeCloseTo(0.15, 2)
    expect(getStatusValue(e1, 'def_down')).toBeCloseTo(0.1, 2)
  })

  it('PAS_9_1 求生知識（battle_start all_allies def_up +8%）', async () => {
    const pas = mkP('PAS_9_1', 'battle_start', 'all_allies', [
      { type: 'buff', status: 'def_up', statusValue: 0.08, statusDuration: 3 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const p2 = h(mk({ SPD: 190 }), 'player', 1, null, [], 'p2')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1, p2], [e1], { maxTurns: 1 })

    expect(hasStatus(p1, 'def_up')).toBe(true)
    expect(hasStatus(p2, 'def_up')).toBe(true)
  })

  it('PAS_12_2 嘲諷壁壘（battle_start taunt 3 回合）', async () => {
    const pas = mkP('PAS_12_2', 'battle_start', 'self', [
      { type: 'buff', status: 'taunt', statusDuration: 3 },
    ])
    const p1 = h(mk({ HP: 99999, SPD: 1 }), 'player', 0, null, [pas], 'p1')
    const p2 = h(mk({ HP: 99999, SPD: 1 }), 'player', 1, null, [], 'p2')
    const e1 = h(mk({ SPD: 200, ATK: 100 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1, p2], [e1], { maxTurns: 2 })

    expect(hasStatus(p1, 'taunt')).toBe(true)
    // e1 的攻擊全部打向 p1（嘲諷者）
    const eAtks = fa(actions, 'NORMAL_ATTACK').filter(a => a.attackerUid === 'e1')
    expect(eAtks.length).toBeGreaterThan(0)
    expect(eAtks.every(a => a.targetUid === 'p1')).toBe(true)
  })
})

/* ═══════════════════════════════════════════
   C. hp_below_pct 被動
   ═══════════════════════════════════════════ */

describe('hp_below_pct 被動', () => {
  it('PAS_2_4 狂化覺醒（hp<15% ATK+50% SPD+30% DEF-30%）', async () => {
    const pas = mkP('PAS_2_4', 'hp_below_pct', 'self', [
      { type: 'buff', status: 'atk_up', statusValue: 0.5 },
      { type: 'buff', status: 'spd_up', statusValue: 0.3 },
      { type: 'debuff', status: 'def_down', statusValue: 0.3 },
    ])
    pas.description = 'HP 低於 15%'
    const p1 = h(mk({ HP: 10000, SPD: 1 }), 'player', 0, null, [pas], 'p1')
    // 預設低血
    p1.currentHP = 1000 // 10% < 15%
    const e1 = h(mk({ SPD: 200, ATK: 10 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1], [e1], { maxTurns: 2 })

    expect(hasStatus(p1, 'atk_up')).toBe(true)
    expect(getStatusValue(p1, 'atk_up')).toBeCloseTo(0.5, 1)
  })

  it('PAS_3_4 鐵壁（hp<50% dmg_reduce 40% + reflect 15%）', async () => {
    const pas = mkP('PAS_3_4', 'hp_below_pct', 'self', [
      { type: 'buff', status: 'dmg_reduce', statusValue: 0.4, targetHpThreshold: 0.50 },
      { type: 'reflect', multiplier: 0.15 },
    ])
    pas.description = 'HP 低於 50%'
    const p1 = h(mk({ HP: 10000, SPD: 1 }), 'player', 0, null, [pas], 'p1')
    p1.currentHP = 4000 // 40% < 50%
    const e1 = h(mk({ SPD: 200, ATK: 100 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 2 })

    expect(hasStatus(p1, 'dmg_reduce')).toBe(true)
    // reflect 應使 e1 受到反彈傷害
    const passiveTriggers = fa(actions, 'PASSIVE_TRIGGER')
    expect(passiveTriggers.some(a => a.skillId === 'PAS_3_4')).toBe(true)
  })
})

/* ═══════════════════════════════════════════
   D. on_attack 被動
   ═══════════════════════════════════════════ */

describe('on_attack 被動（補齊）', () => {
  it('PAS_2_3 力量爆發（on_attack 15% 機率 damage_mult ×1.5）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05) // < 0.15 → triggers
    const pas = mkP('PAS_2_3', 'on_attack', 'self', [
      { type: 'damage_mult', multiplier: 1.5, statusChance: 0.15 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_2_3')).toBe(true)
  })

  it('PAS_5_2 腐蝕液（on_attack 20% debuff def_down -15%）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.20 → triggers
    const pas = mkP('PAS_5_2', 'on_attack', 'single_enemy', [
      { type: 'debuff', status: 'def_down', statusChance: 0.2, statusValue: 0.15, statusDuration: 2 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1], [e1], { maxTurns: 1 })

    expect(hasStatus(e1, 'def_down')).toBe(true)
    expect(getStatusValue(e1, 'def_down')).toBeCloseTo(0.15, 2)
  })

  it('PAS_5_4 完全寄生（on_attack heal 20% + debuff atk_down 10%）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const pas = mkP('PAS_5_4', 'on_attack', 'self', [
      { type: 'heal', multiplier: 0.2 },
      { type: 'debuff', status: 'atk_down', statusValue: 0.1, statusDuration: 2 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, null, [pas], 'p1')
    p1.currentHP = 2000
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    await runBattleCollect([p1], [e1], { maxTurns: 1 })

    // p1 應回血
    expect(p1.currentHP).toBeGreaterThan(2000)
    // e1 應有 atk_down
    expect(hasStatus(e1, 'atk_down')).toBe(true)
  })

  it('PAS_10_4 深淵凝視（on_attack spd_down -6 + 25% stun）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.25 → stun triggers
    const pas = mkP('PAS_10_4', 'on_attack', 'single_enemy', [
      { type: 'debuff', status: 'spd_down', statusValue: 6 },
      { type: 'debuff', status: 'stun', statusChance: 0.25, statusDuration: 1 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 100 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    // 被動應觸發（stun duration:1 在 TURN_END 過期，改查 PASSIVE_TRIGGER）
    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_10_4')).toBe(true)
    expect(hasStatus(e1, 'spd_down')).toBe(true)
  })

  it('PAS_11_4 謝幕演出（on_attack damage_mult_random 0.8~2.5）', async () => {
    const pas = mkP('PAS_11_4', 'on_attack', 'self', [
      { type: 'damage_mult_random', min: 0.8, max: 2.5 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 2 })

    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_11_4')).toBe(true)
  })

  it('PAS_13_1 巨人踐踏（on_attack 35% 機率 damage_mult ×1.6）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.35 → triggers
    const pas = mkP('PAS_13_1', 'on_attack', 'self', [
      { type: 'damage_mult', multiplier: 1.6, statusChance: 0.35 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_13_1')).toBe(true)
  })

  it('PAS_13_2 震暈（on_attack 50% stun 1 回合）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.50 → triggers
    const pas = mkP('PAS_13_2', 'on_attack', 'single_enemy', [
      { type: 'debuff', status: 'stun', statusChance: 0.5, statusDuration: 1 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 100 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    // stun duration:1 在 TURN_END 過期，改查 PASSIVE_TRIGGER
    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_13_2')).toBe(true)
    // e1 應被跳過行動（無攻擊記錄）
    const e1Atks = fa(actions, 'NORMAL_ATTACK').filter(a => a.attackerUid === 'e1')
    expect(e1Atks.length).toBe(0)
  })

  it('PAS_13_4 災厄領主（on_attack 55% 機率 damage_mult ×2.0）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.55 → triggers
    const pas = mkP('PAS_13_4', 'on_attack', 'self', [
      { type: 'damage_mult', multiplier: 2.0, statusChance: 0.55 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_13_4')).toBe(true)
  })
})

/* ═══════════════════════════════════════════
   E. on_be_attacked 被動
   ═══════════════════════════════════════════ */

describe('on_be_attacked 被動（補齊）', () => {
  it('PAS_10_2 詭笑（on_be_attacked 30% atk_down）— 被動觸發', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.30 → triggers
    const pas = mkP('PAS_10_2', 'on_be_attacked', 'self', [
      { type: 'debuff', status: 'atk_down', statusChance: 0.3, statusValue: 0.15, statusDuration: 2 },
    ])
    const p1 = h(mk({ HP: 99999, SPD: 1 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ SPD: 200, ATK: 100 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    // on_be_attacked context.target 指向被攻擊者(p1)，debuff 施加到 context.target
    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_10_2')).toBe(true)
  })
})

/* ═══════════════════════════════════════════
   F. on_kill 被動
   ═══════════════════════════════════════════ */

describe('on_kill 被動（補齊）', () => {
  it('PAS_8_3 恐懼蔓延（on_kill all_enemies spd_down -15%）', async () => {
    const pas = mkP('PAS_8_3', 'on_kill', 'all_enemies', [
      { type: 'debuff', status: 'spd_down', statusValue: 0.15, statusDuration: 1 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 99999 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ HP: 100, SPD: 1 }), 'enemy', 0, null, [], 'e1')
    const e2 = h(mk({ HP: 99999, SPD: 100 }), 'enemy', 1, null, [], 'e2')

    const { actions } = await runBattleCollect([p1], [e1, e2], { maxTurns: 1 })

    // spd_down duration:1 在 TURN_END 過期，改查 PASSIVE_TRIGGER
    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_8_3')).toBe(true)
  })
})

/* ═══════════════════════════════════════════
   G. on_take_damage 被動
   ═══════════════════════════════════════════ */

describe('on_take_damage 被動', () => {
  it('PAS_12_1 壕溝戰術（on_take_damage dmg_reduce 30% 1回合）', async () => {
    const pas = mkP('PAS_12_1', 'on_take_damage', 'self', [
      { type: 'buff', status: 'dmg_reduce', statusValue: 0.3, statusDuration: 1 },
    ])
    const p1 = h(mk({ HP: 99999, SPD: 1 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ SPD: 200, ATK: 100 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    // 被攻擊後觸發 dmg_reduce（duration:1 在 TURN_END 過期）
    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_12_1')).toBe(true)
  })

  it('PAS_12_4 要塞化（on_take_damage dmg_reduce 45% + reflect 20%）', async () => {
    const pas = mkP('PAS_12_4', 'on_take_damage', 'self', [
      { type: 'buff', status: 'dmg_reduce', statusValue: 0.45 },
      { type: 'reflect', multiplier: 0.2 },
    ])
    const p1 = h(mk({ HP: 99999, SPD: 1, DEF: 0 }), 'player', 0, null, [pas], 'p1')
    const e1 = h(mk({ SPD: 200, ATK: 500 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1], [e1], { maxTurns: 1 })

    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_12_4')).toBe(true)
    expect(hasStatus(p1, 'dmg_reduce')).toBe(true)
  })
})

/* ═══════════════════════════════════════════
   H. on_lethal 被動
   ═══════════════════════════════════════════ */

describe('on_lethal 被動（補齊）', () => {
  it('PAS_1_4 不死執念（on_lethal revive + heal 20%）— checkLethalPassive', () => {
    const pas = mkP('PAS_1_4', 'on_lethal', 'self', [
      { type: 'revive', flatValue: 1 },
      { type: 'heal', scalingStat: 'HP', multiplier: 0.2 },
    ])
    const p1 = h(mk({ HP: 5000 }), 'player', 0, null, [pas], 'p1')

    // 受到致命傷害 → checkLethalPassive 保命
    const saved = checkLethalPassive(p1, 99999, [p1])
    expect(saved).toBe(true)
    expect(p1.currentHP).toBeGreaterThan(0)

    // PAS_1_4 可觸發 2 次
    p1.currentHP = 100
    const saved2 = checkLethalPassive(p1, 99999, [p1])
    expect(saved2).toBe(true)
    expect(p1.currentHP).toBeGreaterThan(0)

    // 第 3 次不再保命
    p1.currentHP = 100
    const saved3 = checkLethalPassive(p1, 99999, [p1])
    expect(saved3).toBe(false)
  })
})

/* ═══════════════════════════════════════════
   I. every_n_turns 被動
   ═══════════════════════════════════════════ */

describe('every_n_turns 被動（補齊）', () => {
  it('PAS_7_1 殘存知識（every_n_turns all_allies heal 10 flat）', async () => {
    const pas = mkP('PAS_7_1', 'every_n_turns', 'all_allies', [
      { type: 'heal', flatValue: 10 },
    ])
    pas.description = '每 3 回合治療全隊 10 HP'
    const p1 = h(mk({ SPD: 200, HP: 5000 }), 'player', 0, null, [pas], 'p1')
    const p2 = h(mk({ SPD: 190, HP: 5000 }), 'player', 1, null, [], 'p2')
    p1.currentHP = 3000
    p2.currentHP = 3000
    const e1 = h(mk({ HP: 99999, SPD: 1, ATK: 1 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1, p2], [e1], { maxTurns: 6 })

    const pts = fa(actions, 'PASSIVE_TRIGGER')
    const healTriggers = pts.filter(a => a.skillId === 'PAS_7_1')
    expect(healTriggers.length).toBeGreaterThanOrEqual(1)
  })
})

/* ═══════════════════════════════════════════
   J. turn_start 被動
   ═══════════════════════════════════════════ */

describe('turn_start 被動（補齊）', () => {
  it('PAS_7_2 知識結晶（turn_start all_allies energy +20）', async () => {
    const pas = mkP('PAS_7_2', 'turn_start', 'all_allies', [
      { type: 'energy', flatValue: 20 },
    ])
    const p1 = h(mk({ SPD: 200 }), 'player', 0, null, [pas], 'p1')
    const p2 = h(mk({ SPD: 190 }), 'player', 1, null, [], 'p2')
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1, p2], [e1], { maxTurns: 2 })

    // turn_start 能量加成觸發
    const pts = fa(actions, 'PASSIVE_TRIGGER')
    expect(pts.some(a => a.skillId === 'PAS_7_2')).toBe(true)
  })
})

/* ═══════════════════════════════════════════
   K. 主動技能（補齊）
   ═══════════════════════════════════════════ */

describe('主動技能（補齊）', () => {
  it('SKL_SHADOW_STRIKE（random_enemies_3 ATK×140%）', async () => {
    const skill = mkA('SKL_SHADOW_STRIKE', 'random_enemies_3', [
      { type: 'damage', scalingStat: 'ATK', multiplier: 1.4, hitCount: 3 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, skill, [], 'p1')
    p1.energy = 1000
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')
    const e2 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 1, null, [], 'e2')
    const e3 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 2, null, [], 'e3')

    const { actions } = await runBattleCollect([p1], [e1, e2, e3], { maxTurns: 1 })

    const casts = fa(actions, 'SKILL_CAST').filter(a => a.skillId === 'SKL_SHADOW_STRIKE')
    expect(casts.length).toBe(1)
    // 應對 3 個目標造成傷害
    expect(casts[0].targets.length).toBe(3)
  })

  it('SKL_BACK_SNIPE（back_row_enemies ATK×220%）', async () => {
    const skill = mkA('SKL_BACK_SNIPE', 'back_row_enemies', [
      { type: 'damage', scalingStat: 'ATK', multiplier: 2.2 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, skill, [], 'p1')
    p1.energy = 1000
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1') // front (slot 0)
    const e2 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 1, null, [], 'e2') // front (slot 1)
    const e3 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 3, null, [], 'e3') // back  (slot 3)
    const e4 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 4, null, [], 'e4') // back  (slot 4)

    const { actions } = await runBattleCollect([p1], [e1, e2, e3, e4], { maxTurns: 1 })

    const casts = fa(actions, 'SKILL_CAST').filter(a => a.skillId === 'SKL_BACK_SNIPE')
    expect(casts.length).toBe(1)
    // 只打後排
    const hitUids = casts[0].targets.map((t: any) => t.uid ?? t.targetUid)
    expect(hitUids).not.toContain('e1')
    expect(hitUids).not.toContain('e2')
  })

  it('SKL_FOCUS_HEAL（single_ally ATK×350% 治療）', async () => {
    const skill = mkA('SKL_FOCUS_HEAL', 'single_ally', [
      { type: 'heal', scalingStat: 'ATK', multiplier: 3.5 },
    ])
    const p1 = h(mk({ SPD: 200, ATK: 500 }), 'player', 0, skill, [], 'p1')
    const p2 = h(mk({ SPD: 190, HP: 10000 }), 'player', 1, null, [], 'p2')
    p1.energy = 1000
    p2.currentHP = 3000
    const e1 = h(mk({ HP: 99999, SPD: 1 }), 'enemy', 0, null, [], 'e1')

    const { actions } = await runBattleCollect([p1, p2], [e1], { maxTurns: 1 })

    const casts = fa(actions, 'SKILL_CAST').filter(a => a.skillId === 'SKL_FOCUS_HEAL')
    expect(casts.length).toBe(1)
    // 治療量 = 500 × 3.5 = 1750
    // p2 HP 應從 3000 上升
    expect(p2.currentHP).toBeGreaterThan(3000)
  })
})
