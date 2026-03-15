/**
 * testHeroes — 戰鬥測試用英雄工廠
 *
 * 建立可自訂數值、技能、效果的測試英雄，
 * 用於沙盒模式驗證各種效果是否正確觸發。
 */
import type { BattleHero, SkillTemplate, SkillEffect, FinalStats } from './types'
import type { PassiveTrigger } from './types'

/* ════════════════════════════════════
   測試英雄設定介面
   ════════════════════════════════════ */

export interface TestHeroConfig {
  name: string
  side: 'player' | 'enemy'
  slot: number
  /** 基礎數值 */
  stats: {
    HP: number
    ATK: number
    DEF: number
    SPD: number
    CritRate: number   // e.g. 15 = 15%
    CritDmg: number    // e.g. 50 = +50%
  }
  /** 主動技能（可選） */
  activeSkill?: TestSkillConfig | null
  /** 被動技能陣列 */
  passives?: TestSkillConfig[]
}

export interface TestSkillConfig {
  skillId?: string
  name: string
  type: 'active' | 'passive'
  target?: string
  description?: string
  passiveTrigger?: PassiveTrigger | ''
  effects: SkillEffect[]
  icon?: string
}

/* ════════════════════════════════════
   預設測試英雄模板
   ════════════════════════════════════ */

/** 白板測試英雄 — 無任何特殊效果，純數值 */
export const BLANK_HERO_STATS = {
  HP: 5000,
  ATK: 500,
  DEF: 200,
  SPD: 100,
  CritRate: 15,
  CritDmg: 50,
} as const

/* ════════════════════════════════════
   預設測試技能模板（覆蓋所有 v2.0 效果類型）
   ════════════════════════════════════ */

export const TEST_SKILLS: Record<string, TestSkillConfig> = {
  /* ── 主動技能 ── */
  basic_damage: {
    name: '基礎斬擊',
    type: 'active',
    target: 'single_enemy',
    effects: [{ type: 'damage', scalingStat: 'ATK', multiplier: 1.8 }],
  },
  aoe_damage: {
    name: '全體攻擊',
    type: 'active',
    target: 'all_enemies',
    effects: [{ type: 'damage', scalingStat: 'ATK', multiplier: 1.2 }],
  },
  heal_skill: {
    name: '治療術',
    type: 'active',
    target: 'single_ally',
    effects: [{ type: 'heal', scalingStat: 'ATK', multiplier: 2.0 }],
  },

  /* ── 被動：Buff/Debuff ── */
  passive_atk_up: {
    name: '攻擊強化',
    type: 'passive',
    passiveTrigger: 'always',
    effects: [{ type: 'buff', status: 'atk_up', statusValue: 0.30, statusDuration: 0, statusMaxStacks: 1 }],
  },
  passive_def_down: {
    name: '破甲光環',
    type: 'passive',
    passiveTrigger: 'on_attack',
    effects: [{ type: 'debuff', status: 'def_down', statusChance: 1.0, statusValue: 0.25, statusDuration: 2, statusMaxStacks: 3 }],
  },

  /* ── 被動：DOT ── */
  passive_burn: {
    name: '灼燒之觸',
    type: 'passive',
    passiveTrigger: 'on_attack',
    effects: [{ type: 'debuff', status: 'dot_burn', statusChance: 0.8, statusValue: 0.3, statusDuration: 2, statusMaxStacks: 3 }],
  },
  passive_poison: {
    name: '劇毒之爪',
    type: 'passive',
    passiveTrigger: 'on_attack',
    effects: [{ type: 'debuff', status: 'dot_poison', statusChance: 1.0, statusValue: 0.2, statusDuration: 3, statusMaxStacks: 5 }],
  },

  /* ── 被動：CC ── */
  passive_stun: {
    name: '雷霆一擊',
    type: 'passive',
    passiveTrigger: 'on_crit',
    effects: [{ type: 'debuff', status: 'stun', statusChance: 0.5, statusValue: 0, statusDuration: 1, statusMaxStacks: 1 }],
  },

  /* ── 被動：反擊 ── */
  passive_counter: {
    name: '反擊姿態',
    type: 'passive',
    passiveTrigger: 'on_be_attacked',
    effects: [{ type: 'damage', scalingStat: 'ATK', multiplier: 0.8 }],
    description: '被攻擊時以 80% ATK 反擊',
  },

  /* ── 被動：追擊 ── */
  passive_chase: {
    name: '協同打擊',
    type: 'passive',
    passiveTrigger: 'on_ally_skill',
    effects: [{ type: 'damage', scalingStat: 'ATK', multiplier: 0.6 }],
    description: '隊友施放大招時追擊',
  },

  /* ── 被動：保命（on_lethal） ── */
  passive_revive: {
    name: '不死之身',
    type: 'passive',
    passiveTrigger: 'on_lethal',
    effects: [{ type: 'revive', multiplier: 0.3 }],
    description: '致命傷時恢復 30% HP（每場一次）',
  },

  /* ── 被動：護盾 ── */
  passive_shield: {
    name: '鐵壁護盾',
    type: 'passive',
    passiveTrigger: 'battle_start',
    effects: [{ type: 'buff', status: 'shield', statusValue: 0.2, statusDuration: 3, statusMaxStacks: 1 }],
    description: '戰鬥開始獲得 HP×20% 護盾',
  },

  /* ── 被動：能量操控 ── */
  passive_energy_drain: {
    name: '能量虹吸',
    type: 'passive',
    passiveTrigger: 'on_attack',
    effects: [{ type: 'energy', flatValue: -200 }],
    description: '攻擊時吸取 200 能量',
  },

  /* ── 被動：斬殺 ── */
  passive_execute: {
    name: '斬殺本能',
    type: 'passive',
    passiveTrigger: 'on_attack',
    effects: [{ type: 'damage', targetHpThreshold: 0.15, multiplier: 999 }],
    description: 'HP 低於 15% 時斬殺',
  },

  /* ── 被動：反傷 ── */
  passive_reflect: {
    name: '荊棘之甲',
    type: 'passive',
    passiveTrigger: 'always',
    effects: [{ type: 'reflect', multiplier: 0.3 }],
    description: '反彈 30% 受到的傷害',
  },

  /* ── 被動：額外行動 ── */
  passive_extra_turn: {
    name: '安可',
    type: 'passive',
    passiveTrigger: 'on_kill',
    effects: [{ type: 'extra_turn' }],
    description: '擊殺後額外行動（每回合一次）',
  },

  /* ── 被動：HP 低於觸發 ── */
  passive_hp_below: {
    name: '背水一戰',
    type: 'passive',
    passiveTrigger: 'hp_below_pct',
    effects: [{ type: 'buff', status: 'atk_up', statusValue: 0.50, statusDuration: 0, statusMaxStacks: 1 }],
    description: 'HP 低於 30% 時攻擊力+50%',
  },
}

/* ════════════════════════════════════
   預設測試情境
   ════════════════════════════════════ */

export interface TestScenario {
  id: string
  name: string
  description: string
  /** 要觀察的效果類型 */
  expectedEffects: string[]
  players: TestHeroConfig[]
  enemies: TestHeroConfig[]
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'counter_attack',
    name: '反擊測試',
    description: '測試被攻擊時的反擊觸發',
    expectedEffects: ['COUNTER_ATTACK', 'PASSIVE_TRIGGER'],
    players: [{
      name: '反擊測試員A',
      side: 'player',
      slot: 0,
      stats: { ...BLANK_HERO_STATS },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [TEST_SKILLS.passive_counter],
    }],
    enemies: [{
      name: '打手B',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, SPD: 120 }, // 讓敵方先攻
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'dot_burn',
    name: 'DOT 灼燒測試',
    description: '測試攻擊附加灼燒 DOT',
    expectedEffects: ['DOT_TICK', 'BUFF_APPLY'],
    players: [{
      name: '火焰測試員A',
      side: 'player',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, SPD: 120 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [TEST_SKILLS.passive_burn],
    }],
    enemies: [{
      name: '沙包B',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, HP: 20000 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'lethal_save',
    name: '保命被動測試',
    description: '測試致命傷觸發保命被動',
    expectedEffects: ['PASSIVE_TRIGGER'],
    players: [{
      name: '不死測試員A',
      side: 'player',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, HP: 500, DEF: 10 }, // 低血量易死
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [TEST_SKILLS.passive_revive],
    }],
    enemies: [{
      name: '強攻B',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, ATK: 2000, SPD: 120 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'shield_test',
    name: '護盾測試',
    description: '測試戰鬥開始時護盾施加',
    expectedEffects: ['SHIELD_APPLY', 'BUFF_APPLY'],
    players: [{
      name: '護盾測試員A',
      side: 'player',
      slot: 0,
      stats: { ...BLANK_HERO_STATS },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [TEST_SKILLS.passive_shield],
    }],
    enemies: [{
      name: '沙包B',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'execute_test',
    name: '斬殺測試',
    description: '測試 HP 低於閾值時斬殺',
    expectedEffects: ['EXECUTE', 'DEATH'],
    players: [{
      name: '斬殺測試員A',
      side: 'player',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, ATK: 1500, SPD: 120 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [TEST_SKILLS.passive_execute],
    }],
    enemies: [{
      name: '低血沙包B',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, HP: 1000, DEF: 10 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'stun_cc',
    name: 'CC 控制測試',
    description: '測試暴擊時暈眩觸發',
    expectedEffects: ['BUFF_APPLY', 'PASSIVE_TRIGGER'],
    players: [{
      name: '暈眩測試員A',
      side: 'player',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, CritRate: 100, SPD: 120 }, // 100% 暴擊
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [TEST_SKILLS.passive_stun],
    }],
    enemies: [{
      name: '沙包B',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, HP: 20000 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'reflect_test',
    name: '反傷測試',
    description: '測試反彈傷害触發',
    expectedEffects: ['NORMAL_ATTACK'],
    players: [{
      name: '反傷測試員A',
      side: 'player',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, HP: 20000 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [TEST_SKILLS.passive_reflect],
    }],
    enemies: [{
      name: '攻擊者B',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, ATK: 800, SPD: 120 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  /* ── 多英雄測試情境 ── */
  {
    id: 'chase_ally_skill',
    name: '追擊測試（隊友大招）',
    description: '3v1：隊友施放大招時追擊敵人',
    expectedEffects: ['CHASE_ATTACK', 'PASSIVE_TRIGGER', 'SKILL_CAST'],
    players: [
      {
        name: '追擊手A',
        side: 'player',
        slot: 0,
        stats: { ...BLANK_HERO_STATS, SPD: 80 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [TEST_SKILLS.passive_chase],
      },
      {
        name: '追擊手B',
        side: 'player',
        slot: 1,
        stats: { ...BLANK_HERO_STATS, SPD: 90 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [TEST_SKILLS.passive_chase],
      },
      {
        name: '大招手C',
        side: 'player',
        slot: 2,
        stats: { ...BLANK_HERO_STATS, SPD: 200 },
        activeSkill: TEST_SKILLS.aoe_damage,
        passives: [],
      },
    ],
    enemies: [{
      name: '沙包X',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, HP: 30000 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'chase_ally_attacked',
    name: '追擊測試（隊友被攻擊）',
    description: '2v1：隊友被攻擊時追擊敵人（追擊者不是被攻擊者）',
    expectedEffects: ['CHASE_ATTACK', 'PASSIVE_TRIGGER'],
    players: [
      {
        name: '誘餌A',
        side: 'player',
        slot: 0,
        stats: { ...BLANK_HERO_STATS, SPD: 50, HP: 20000, DEF: 500 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [], // A 沒有被動，純肉盾
      },
      {
        name: '追擊手B',
        side: 'player',
        slot: 1,
        stats: { ...BLANK_HERO_STATS, SPD: 50, HP: 20000 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [{
          name: '護衛追擊',
          type: 'passive',
          passiveTrigger: 'on_ally_attacked',
          effects: [{ type: 'damage', scalingStat: 'ATK', multiplier: 0.6 }],
          description: '隊友被攻擊時追擊敵人',
        }],
      },
    ],
    enemies: [{
      name: '先攻者X',
      side: 'enemy',
      slot: 0,
      stats: { ...BLANK_HERO_STATS, SPD: 200, ATK: 300 },
      activeSkill: TEST_SKILLS.basic_damage,
      passives: [],
    }],
  },
  {
    id: 'counter_multi',
    name: '反擊多人測試',
    description: '2v2：雙方都有反擊',
    expectedEffects: ['COUNTER_ATTACK', 'PASSIVE_TRIGGER'],
    players: [
      {
        name: '反擊手A',
        side: 'player',
        slot: 0,
        stats: { ...BLANK_HERO_STATS, HP: 15000 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [TEST_SKILLS.passive_counter],
      },
      {
        name: '輸出手B',
        side: 'player',
        slot: 1,
        stats: { ...BLANK_HERO_STATS, SPD: 120 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [],
      },
    ],
    enemies: [
      {
        name: '反擊敵人X',
        side: 'enemy',
        slot: 0,
        stats: { ...BLANK_HERO_STATS, HP: 15000, SPD: 110 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [TEST_SKILLS.passive_counter],
      },
      {
        name: '敵方輸出Y',
        side: 'enemy',
        slot: 1,
        stats: { ...BLANK_HERO_STATS, SPD: 130 },
        activeSkill: TEST_SKILLS.basic_damage,
        passives: [],
      },
    ],
  },
]

/* ════════════════════════════════════
   建立 BattleHero
   ════════════════════════════════════ */

let testHeroCounter = 0

function buildSkillTemplate(cfg: TestSkillConfig, index: number): SkillTemplate {
  return {
    skillId: cfg.skillId ?? `TEST_SKILL_${index}_${Date.now()}`,
    name: cfg.name,
    type: cfg.type,
    target: cfg.target ?? (cfg.type === 'active' ? 'single_enemy' : 'self'),
    description: cfg.description ?? cfg.name,
    effects: cfg.effects,
    passiveTrigger: cfg.passiveTrigger ?? '',
    icon: cfg.icon ?? (cfg.type === 'active' ? '⚔️' : '🔮'),
  }
}

export function createTestBattleHero(config: TestHeroConfig): BattleHero {
  testHeroCounter++
  const modelId = `zombie_${(config.slot % 14) + 1}`
  const uid = `test_${config.side}_${config.slot}_${testHeroCounter}`

  const stats: FinalStats = { ...config.stats }
  const activeSkill = config.activeSkill ? buildSkillTemplate(config.activeSkill, 0) : null
  const passives = (config.passives ?? []).map((p, i) => buildSkillTemplate(p, i + 1))

  return {
    uid,
    heroId: 900 + testHeroCounter,
    modelId,
    name: config.name,
    side: config.side,
    slot: config.slot,
    baseStats: { ...stats },
    finalStats: { ...stats },
    currentHP: stats.HP,
    maxHP: stats.HP,
    energy: 0,
    activeSkill,
    passives,
    activePassives: passives, // 測試模式：全部被動都啟用
    statusEffects: [],
    shields: [],
    targetModifiers: [],
    passiveUsage: {},
    totalDamageDealt: 0,
    totalHealingDone: 0,
    killCount: 0,
  }
}

/**
 * 從測試情境建立雙方 BattleHero 陣列
 */
export function buildTestBattle(scenario: TestScenario): {
  players: BattleHero[]
  enemies: BattleHero[]
} {
  return {
    players: scenario.players.map(createTestBattleHero),
    enemies: scenario.enemies.map(createTestBattleHero),
  }
}
