/**
 * 測試工具 — 建立 mock BattleHero 等工廠函式
 */
import type { BattleHero, FinalStats, SkillEffect, SkillTemplate, StatusEffect, Shield } from '../types'

let uidCounter = 0

export function resetUidCounter(): void {
  uidCounter = 0
}

/**
 * 建立測試用 BattleHero（所有欄位可 override）
 */
export function makeHero(overrides: Partial<BattleHero> = {}): BattleHero {
  uidCounter++
  const baseStats: FinalStats = {
    HP: 1000,
    ATK: 100,
    DEF: 50,
    SPD: 100,
    CritRate: 15,
    CritDmg: 50,
    ...overrides.baseStats,
  }
  const finalStats: FinalStats = {
    ...baseStats,
    ...overrides.finalStats,
  }

  return {
    uid: `test_hero_${uidCounter}`,
    heroId: uidCounter,
    modelId: `zombie_${uidCounter}`,
    name: `測試英雄 ${uidCounter}`,
    side: 'player',
    slot: 0,

    baseStats,
    finalStats,
    currentHP: finalStats.HP,
    maxHP: finalStats.HP,

    energy: 0,

    activeSkill: null,
    passives: [],
    activePassives: [],

    statusEffects: [],
    shields: [],
    targetModifiers: [],
    passiveUsage: {},

    totalDamageDealt: 0,
    totalHealingDone: 0,
    killCount: 0,

    ...overrides,
  }
}

/**
 * 建立一組對戰雙方（3v3）
 */
export function makeTeams(): { players: BattleHero[]; enemies: BattleHero[] } {
  const players = [
    makeHero({ side: 'player', slot: 0, name: 'P1' }),
    makeHero({ side: 'player', slot: 1, name: 'P2' }),
    makeHero({ side: 'player', slot: 2, name: 'P3' }),
  ]
  const enemies = [
    makeHero({ side: 'enemy', slot: 0, name: 'E1' }),
    makeHero({ side: 'enemy', slot: 1, name: 'E2' }),
    makeHero({ side: 'enemy', slot: 2, name: 'E3' }),
  ]
  return { players, enemies }
}

/**
 * 建立簡單的技能效果
 */
export function makeDamageEffect(overrides: Partial<SkillEffect> = {}): SkillEffect {
  return {
    type: 'damage',
    scalingStat: 'ATK',
    multiplier: 1.5,
    ...overrides,
  }
}

export function makeHealEffect(overrides: Partial<SkillEffect> = {}): SkillEffect {
  return {
    type: 'heal',
    scalingStat: 'ATK',
    multiplier: 1.0,
    ...overrides,
  }
}

/**
 * 建立 SkillTemplate
 */
export function makeSkill(overrides: Partial<SkillTemplate> = {}): SkillTemplate {
  return {
    skillId: 'TEST_SKILL_1',
    name: '測試技能',
    type: 'active',
    target: 'single_enemy',
    description: '測試用技能',
    effects: [makeDamageEffect()],
    passiveTrigger: '',
    icon: '',
    ...overrides,
  }
}

/**
 * 建立 StatusEffect
 */
export function makeStatus(overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    type: 'atk_up',
    value: 0.2,
    duration: 2,
    stacks: 1,
    maxStacks: 3,
    sourceHeroId: 'source_1',
    ...overrides,
  }
}

/**
 * 建立 Shield
 */
export function makeShield(overrides: Partial<Shield> = {}): Shield {
  return {
    value: 200,
    duration: 2,
    sourceHeroId: 'source_1',
    ...overrides,
  }
}
