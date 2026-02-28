/**
 * 戰鬥流程驗證測試 — Battle Flow Integration Tests
 *
 * 目的：自動化偵測常見的戰鬥動畫流程 bug
 * - 無效的狀態轉換（DEAD 角色又被攻擊）
 * - 死亡動畫時機錯誤
 * - 攻擊結束後角色忘記 IDLE
 * - 被動/DOT 致死流程遺漏 DEATH action
 * - 多目標技能重複 uid 導致衝突
 *
 * v1.0.0 - 2026-03-01
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { BattleFlowValidator, validateBattleActions } from '../battleFlowValidator'
import { runBattleCollect } from '../battleEngine'
import { resetUidCounter, makeHero, makeTeams, makeSkill, makeDamageEffect, makeHealEffect } from './testHelper'
import type { BattleAction, DamageResult, StatusType } from '../types'

/** 快捷建立 DamageResult（補齊必填欄位） */
const dmgResult = (overrides: Partial<DamageResult> = {}): DamageResult => ({
  damage: 100, isCrit: false, isDodge: false, elementMult: 1, reflectDamage: 0,
  damageType: 'normal', shieldAbsorbed: 0,
  ...overrides,
})

/** 合法的 statusType */
const DOT_BURN: StatusType = 'dot_burn'

beforeEach(() => {
  resetUidCounter()
})

/* ══════════════════════════════════════
   第一部分：BattleFlowValidator 單元測試
   ══════════════════════════════════════ */

describe('BattleFlowValidator', () => {
  let v: BattleFlowValidator

  beforeEach(() => {
    v = new BattleFlowValidator()
    v.registerActors(['p1', 'e1'])
  })

  describe('合法狀態轉換', () => {
    it('IDLE → ADVANCING → ATTACKING → RETREATING → IDLE（普攻完整流程）', () => {
      expect(v.transition('p1', 'ADVANCING')).toBe(true)
      expect(v.transition('p1', 'ATTACKING')).toBe(true)
      expect(v.transition('p1', 'RETREATING')).toBe(true)
      expect(v.transition('p1', 'IDLE')).toBe(true)
      expect(v.getErrors()).toHaveLength(0)
    })

    it('IDLE → HURT → IDLE（受傷後恢復）', () => {
      expect(v.transition('e1', 'HURT')).toBe(true)
      expect(v.transition('e1', 'IDLE')).toBe(true)
      expect(v.getErrors()).toHaveLength(0)
    })

    it('IDLE → HURT → DEAD（受傷致死）', () => {
      expect(v.transition('e1', 'HURT')).toBe(true)
      expect(v.transition('e1', 'DEAD')).toBe(true)
      expect(v.getErrors()).toHaveLength(0)
    })

    it('IDLE → DEAD（直擊致死，跳過受傷）', () => {
      expect(v.transition('e1', 'DEAD')).toBe(true)
      expect(v.getErrors()).toHaveLength(0)
    })

    it('ATTACKING → HURT（反彈傷害）', () => {
      v.transition('p1', 'ADVANCING')
      v.transition('p1', 'ATTACKING')
      expect(v.transition('p1', 'HURT')).toBe(true)
      expect(v.getErrors()).toHaveLength(0)
    })

    it('ATTACKING → DEAD（反彈致死）', () => {
      v.transition('p1', 'ADVANCING')
      v.transition('p1', 'ATTACKING')
      expect(v.transition('p1', 'DEAD')).toBe(true)
      expect(v.getErrors()).toHaveLength(0)
    })
  })

  describe('非法狀態轉換', () => {
    it('DEAD → ATTACKING 應報 error', () => {
      v.transition('e1', 'DEAD')
      expect(v.transition('e1', 'ATTACKING')).toBe(false)
      expect(v.getErrors()).toHaveLength(1)
      expect(v.getErrors()[0].message).toContain('Dead actor')
    })

    it('DEAD → IDLE 應報 error', () => {
      v.transition('e1', 'DEAD')
      expect(v.transition('e1', 'IDLE')).toBe(false)
      expect(v.getErrors()).toHaveLength(1)
    })

    it('IDLE → RETREATING 應報 error', () => {
      expect(v.transition('p1', 'RETREATING')).toBe(false)
      expect(v.getErrors()).toHaveLength(1)
      expect(v.getErrors()[0].message).toContain('Invalid transition')
    })

    it('ADVANCING → DEAD 應報 error', () => {
      v.transition('p1', 'ADVANCING')
      expect(v.transition('p1', 'DEAD')).toBe(false)
      expect(v.getErrors()).toHaveLength(1)
    })

    it('HURT → ADVANCING 應報 error', () => {
      v.transition('p1', 'HURT')
      expect(v.transition('p1', 'ADVANCING')).toBe(false)
      expect(v.getErrors()).toHaveLength(1)
    })
  })

  describe('beforeAction 已死亡角色偵測', () => {
    it('NORMAL_ATTACK 的攻擊者已死 → error', () => {
      v.transition('p1', 'DEAD')
      v.beforeAction({
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult(),
        killed: false,
      })
      expect(v.getErrors().length).toBeGreaterThanOrEqual(1)
      expect(v.getErrors().some(e => e.message.includes('already dead'))).toBe(true)
    })

    it('NORMAL_ATTACK 的目標已死 → error', () => {
      v.transition('e1', 'DEAD')
      v.beforeAction({
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult(),
        killed: false,
      })
      expect(v.getErrors().some(e => e.message.includes('already dead'))).toBe(true)
    })

    it('DOT_TICK 目標已死 → error', () => {
      v.transition('e1', 'DEAD')
      v.beforeAction({
        type: 'DOT_TICK',
        targetUid: 'e1',
        dotType: DOT_BURN,
        damage: 50,
      })
      expect(v.getErrors().some(e => e.message.includes('already dead'))).toBe(true)
    })

    it('重複 DEATH 對同一角色 → error', () => {
      v.transition('e1', 'DEAD')
      v.beforeAction({ type: 'DEATH', targetUid: 'e1' })
      expect(v.getErrors().some(e => e.message.includes('already dead'))).toBe(true)
    })
  })

  describe('afterAction 結束狀態驗證', () => {
    it('攻擊結束後攻擊者不在 IDLE → warn', () => {
      // 模擬：忘記把攻擊者設回 IDLE（bug）
      v.transition('p1', 'ADVANCING')
      v.transition('p1', 'ATTACKING')
      // 忘了 RETREATING → IDLE ...

      v.afterAction({
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult(),
        killed: false,
      })
      expect(v.getWarnings().some(w => w.message.includes('still in ATTACKING'))).toBe(true)
    })
  })

  describe('validateEnd 戰鬥結束驗證', () => {
    it('存活角色不在 IDLE → warn', () => {
      v.transition('p1', 'ADVANCING')
      v.validateEnd()
      expect(v.getWarnings().some(w => w.message.includes('ADVANCING instead of IDLE'))).toBe(true)
    })

    it('正常結束（所有存活者 IDLE）→ 無 issue', () => {
      v.transition('e1', 'HURT')
      v.transition('e1', 'DEAD')
      // p1 remains IDLE
      v.validateEnd()
      expect(v.getIssues()).toHaveLength(0)
    })
  })
})

/* ══════════════════════════════════════
   第二部分：validateBattleActions 靜態分析
   ══════════════════════════════════════ */

describe('validateBattleActions (靜態流程分析)', () => {
  it('標準普攻序列無 issue', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      {
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult(),
        killed: false,
      },
      { type: 'TURN_END', turn: 1 },
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'e1'])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('致死普攻 → 無 error', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      {
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult({ damage: 9999, isCrit: true, elementMult: 1.25 }),
        killed: true,
      },
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'e1'])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('技能施放多目標 → 無 error', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      {
        type: 'SKILL_CAST',
        attackerUid: 'p1',
        skillId: 'S1',
        skillName: '火焰風暴',
        targets: [
          { uid: 'e1', result: dmgResult({ damage: 200 }), killed: false },
          { uid: 'e2', result: dmgResult({ damage: 200 }), killed: true },
        ],
      },
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'e1', 'e2'])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('DEATH (DOT致死) → 無 error', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      { type: 'DOT_TICK', targetUid: 'e1', dotType: DOT_BURN, damage: 500 },
      { type: 'DEATH', targetUid: 'e1' },
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'e1'])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('偵測 bug：對已死亡角色再攻擊', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      {
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult({ damage: 9999, isCrit: true }),
        killed: true,
      },
      // bug: e1 已死，引擎又對 e1 攻擊
      {
        type: 'NORMAL_ATTACK',
        attackerUid: 'p2', targetUid: 'e1',
        result: dmgResult(),
        killed: false,
      },
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'p2', 'e1'])
    const errors = issues.filter(i => i.severity === 'error')
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors.some(e => e.message.includes('already dead'))).toBe(true)
  })

  it('偵測 bug：DOT 對已死亡角色造成傷害', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      {
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult({ damage: 9999, isCrit: true }),
        killed: true,
      },
      { type: 'DOT_TICK', targetUid: 'e1', dotType: DOT_BURN, damage: 50 },
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'e1'])
    const errors = issues.filter(i => i.severity === 'error')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  it('偵測 bug：重複 DEATH action', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      { type: 'DOT_TICK', targetUid: 'e1', dotType: DOT_BURN, damage: 500 },
      { type: 'DEATH', targetUid: 'e1' },
      { type: 'DEATH', targetUid: 'e1' },  // 重複！
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'e1'])
    const errors = issues.filter(i => i.severity === 'error')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  it('治療技能不造成狀態轉換 → 無 error', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      {
        type: 'SKILL_CAST',
        attackerUid: 'p1',
        skillId: 'HEAL_1',
        skillName: '治療術',
        targets: [
          { uid: 'p2', result: { heal: 300, isCrit: false } },
        ],
      },
      { type: 'BATTLE_END', winner: 'player' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'p2', 'e1'])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('閃避不造成受傷/死亡 → 無 error', () => {
    const actions: BattleAction[] = [
      { type: 'TURN_START', turn: 1 },
      {
        type: 'NORMAL_ATTACK',
        attackerUid: 'p1', targetUid: 'e1',
        result: dmgResult({ damage: 0, isDodge: true }),
        killed: false,
      },
      { type: 'BATTLE_END', winner: 'draw' },
    ]
    const issues = validateBattleActions(actions, ['p1', 'e1'])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })
})

/* ══════════════════════════════════════
   第三部分：引擎整合測試 — 真實戰鬥 actions 流程驗證
   ══════════════════════════════════════ */

describe('引擎整合：runBattleCollect → validateBattleActions', () => {
  it('3v3 標準戰鬥 — 所有 actions 應通過流程驗證', async () => {
    const { players, enemies } = makeTeams()
    const result = await runBattleCollect(players, enemies, { maxTurns: 50 })

    const allUids = [...players, ...enemies].map(h => h.uid)
    const issues = validateBattleActions(result.actions, allUids)
    const errors = issues.filter(i => i.severity === 'error')

    if (errors.length > 0) {
      console.error('=== 戰鬥流程驗證失敗 ===')
      for (const e of errors) {
        console.error(`  [#${e.actionIndex}] ${e.message}`)
      }
    }
    expect(errors).toHaveLength(0)
  })

  it('1v1 速殺 — 高攻 vs 低血', async () => {
    const attacker = makeHero({
      side: 'player', slot: 0,
      baseStats: { HP: 5000, ATK: 999, DEF: 100, SPD: 200, CritRate: 80, CritDmg: 150 },
      finalStats: { HP: 5000, ATK: 999, DEF: 100, SPD: 200, CritRate: 80, CritDmg: 150 },
      currentHP: 5000, maxHP: 5000,
    })
    const target = makeHero({
      side: 'enemy', slot: 0,
      baseStats: { HP: 100, ATK: 10, DEF: 0, SPD: 50, CritRate: 0, CritDmg: 50 },
      finalStats: { HP: 100, ATK: 10, DEF: 0, SPD: 50, CritRate: 0, CritDmg: 50 },
      currentHP: 100, maxHP: 100,
    })

    const result = await runBattleCollect([attacker], [target], { maxTurns: 50 })
    expect(result.winner).toBe('player')

    const issues = validateBattleActions(result.actions, [attacker.uid, target.uid])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('帶技能的 3v3 — 流程驗證無 error', async () => {
    const { players, enemies } = makeTeams()
    // 給第一個玩家一個主動技能
    const skill = makeSkill({
      skillId: 'AOE_FIRE',
      name: '烈焰風暴',
      type: 'active',
      element: 'fire',
      target: 'all_enemies',
      effects: [makeDamageEffect({ multiplier: 2.0 })],
    })
    players[0].activeSkill = skill
    players[0].energy = 1000  // 立即可放技能

    const result = await runBattleCollect(players, enemies, { maxTurns: 50 })
    const allUids = [...players, ...enemies].map(h => h.uid)
    const issues = validateBattleActions(result.actions, allUids)

    if (issues.filter(i => i.severity === 'error').length > 0) {
      console.error('=== 帶技能戰鬥流程驗證失敗 ===')
      for (const e of issues.filter(i => i.severity === 'error')) {
        console.error(`  [#${e.actionIndex}] ${e.message}`)
      }
    }
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('帶治療技能 — 流程驗證無 error', async () => {
    const { players, enemies } = makeTeams()
    // 給 P2 一個治療技能
    const healSkill = makeSkill({
      skillId: 'HEAL_ALL',
      name: '群體治療',
      type: 'active',
      element: 'water',
      target: 'all_allies',
      effects: [makeHealEffect({ multiplier: 1.5 })],
    })
    players[1].activeSkill = healSkill
    players[1].energy = 1000

    const result = await runBattleCollect(players, enemies, { maxTurns: 50 })
    const allUids = [...players, ...enemies].map(h => h.uid)
    const issues = validateBattleActions(result.actions, allUids)
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('50 回合超時 → 結束時仍無 error', async () => {
    // 高防雙方 → 打不死 → 50 回合平手
    const p = makeHero({
      side: 'player', slot: 0,
      baseStats: { HP: 99999, ATK: 1, DEF: 999, SPD: 100, CritRate: 0, CritDmg: 50 },
      finalStats: { HP: 99999, ATK: 1, DEF: 999, SPD: 100, CritRate: 0, CritDmg: 50 },
      currentHP: 99999, maxHP: 99999,
    })
    const e = makeHero({
      side: 'enemy', slot: 0,
      baseStats: { HP: 99999, ATK: 1, DEF: 999, SPD: 100, CritRate: 0, CritDmg: 50 },
      finalStats: { HP: 99999, ATK: 1, DEF: 999, SPD: 100, CritRate: 0, CritDmg: 50 },
      currentHP: 99999, maxHP: 99999,
    })

    const result = await runBattleCollect([p], [e], { maxTurns: 10 })
    expect(result.winner).toBe('draw')

    const issues = validateBattleActions(result.actions, [p.uid, e.uid])
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })
})
