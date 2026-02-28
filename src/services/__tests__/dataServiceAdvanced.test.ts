/**
 * dataService 進階測試 — toElement / getHeroSkillSet
 */
import { describe, it, expect } from 'vitest'
import { toElement, getHeroSkillSet } from '../dataService'
import type { SkillTemplate, HeroSkillConfig } from '../../domain/types'

/* ═══════ toElement ═══════ */

describe('dataService — toElement', () => {
  it('英文 fire → fire', () => {
    expect(toElement('fire')).toBe('fire')
  })

  it('英文大小寫不敏感 WATER → water', () => {
    expect(toElement('WATER')).toBe('water')
  })

  it('英文 Thunder → thunder', () => {
    expect(toElement('Thunder')).toBe('thunder')
  })

  it('中文 火 → fire', () => {
    expect(toElement('火')).toBe('fire')
  })

  it('中文 冰 → water', () => {
    expect(toElement('冰')).toBe('water')
  })

  it('中文 雷 → thunder', () => {
    expect(toElement('雷')).toBe('thunder')
  })

  it('中文 闇 → dark', () => {
    expect(toElement('闇')).toBe('dark')
  })

  it('中文 光 → light', () => {
    expect(toElement('光')).toBe('light')
  })

  it('中文 毒 → wind', () => {
    expect(toElement('毒')).toBe('wind')
  })

  it('中文 地 → earth', () => {
    expect(toElement('地')).toBe('earth')
  })

  it('中文 土 → earth', () => {
    expect(toElement('土')).toBe('earth')
  })

  it('空字串 → ""', () => {
    expect(toElement('')).toBe('')
  })

  it('null → ""', () => {
    expect(toElement(null)).toBe('')
  })

  it('undefined → ""', () => {
    expect(toElement(undefined)).toBe('')
  })

  it('不認識的字串 → ""', () => {
    expect(toElement('banana')).toBe('')
  })

  it('帶空白的中文 " 火 " → fire', () => {
    expect(toElement(' 火 ')).toBe('fire')
  })

  it('所有 7 種英文元素皆可辨識', () => {
    const elements = ['fire', 'water', 'wind', 'thunder', 'earth', 'light', 'dark'] as const
    for (const el of elements) {
      expect(toElement(el)).toBe(el)
    }
  })
})

/* ═══════ getHeroSkillSet ═══════ */

describe('dataService — getHeroSkillSet', () => {
  const activeSkill: SkillTemplate = {
    skillId: 'active_1',
    name: '火球術',
    type: 'active',
    element: 'fire',
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
    element: '',
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
    element: '',
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
