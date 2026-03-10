/**
 * dataService 進階測試 — getHeroSkillSet
 */
import { describe, it, expect } from 'vitest'
import { getHeroSkillSet } from '../dataService'
import type { SkillTemplate, HeroSkillConfig } from '../../domain/types'

/* ═══════ getHeroSkillSet ═══════ */

describe('dataService — getHeroSkillSet', () => {
  const activeSkill: SkillTemplate = {
    skillId: 'active_1',
    name: '火球術',
    type: 'active',
    target: 'single_enemy',
    description: '',
    effects: [],
    passiveTrigger: '',
    icon: '',
  }

  const passive1: SkillTemplate = {
    skillId: 'passive_1',
    name: '被動1',
    type: 'passive',
    target: 'self',
    description: '',
    effects: [],
    passiveTrigger: 'battle_start',
    icon: '',
  }

  const passive2: SkillTemplate = {
    skillId: 'passive_2',
    name: '被動2',
    type: 'passive',
    target: 'self',
    description: '',
    effects: [],
    passiveTrigger: 'on_attack',
    icon: '',
  }

  const skills = new Map<string, SkillTemplate>([
    ['active_1', activeSkill],
    ['passive_1', passive1],
    ['passive_2', passive2],
  ])

  it('正常取得 active + passives', () => {
    const config: HeroSkillConfig = {
      heroId: 1,
      activeSkillId: 'active_1',
      passive1_skillId: 'passive_1',
      passive2_skillId: 'passive_2',
      passive3_skillId: '',
      passive4_skillId: '',
    }
    const heroSkills = new Map<number, HeroSkillConfig>([[1, config]])

    const result = getHeroSkillSet(1, skills, heroSkills)
    expect(result.activeSkill).toBe(activeSkill)
    expect(result.passives).toHaveLength(2)
    expect(result.passives[0].skillId).toBe('passive_1')
    expect(result.passives[1].skillId).toBe('passive_2')
  })

  it('heroId 找不到 → 空', () => {
    const heroSkills = new Map<number, HeroSkillConfig>()
    const result = getHeroSkillSet(999, skills, heroSkills)
    expect(result.activeSkill).toBeNull()
    expect(result.passives).toHaveLength(0)
  })

  it('activeSkillId 在 skills 裡不存在 → null', () => {
    const config: HeroSkillConfig = {
      heroId: 1,
      activeSkillId: 'nonexistent',
      passive1_skillId: '',
      passive2_skillId: '',
      passive3_skillId: '',
      passive4_skillId: '',
    }
    const heroSkills = new Map<number, HeroSkillConfig>([[1, config]])
    const result = getHeroSkillSet(1, skills, heroSkills)
    expect(result.activeSkill).toBeNull()
  })

  it('被動技能 ID 為空字串 → 跳過', () => {
    const config: HeroSkillConfig = {
      heroId: 1,
      activeSkillId: 'active_1',
      passive1_skillId: '',
      passive2_skillId: '',
      passive3_skillId: '',
      passive4_skillId: '',
    }
    const heroSkills = new Map<number, HeroSkillConfig>([[1, config]])
    const result = getHeroSkillSet(1, skills, heroSkills)
    expect(result.passives).toHaveLength(0)
  })

  it('被動 skillId 在 skills 找不到 → 跳過', () => {
    const config: HeroSkillConfig = {
      heroId: 1,
      activeSkillId: 'active_1',
      passive1_skillId: 'missing_1',
      passive2_skillId: 'passive_1',
      passive3_skillId: '',
      passive4_skillId: '',
    }
    const heroSkills = new Map<number, HeroSkillConfig>([[1, config]])
    const result = getHeroSkillSet(1, skills, heroSkills)
    // missing_1 被跳過，passive_1 留下
    expect(result.passives).toHaveLength(1)
    expect(result.passives[0].skillId).toBe('passive_1')
  })
})
