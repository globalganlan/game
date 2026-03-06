/**
 * dataService — 遊戲資料服務層
 *
 * 負責從 Google Sheets 載入、解析、快取所有遊戲配置，
 * 並轉換為 domain 層所需的型別。
 * 不包含任何 React 依賴。
 *
 * 對應表：
 * - heroes         → 英雄基礎數值
 * - skill_templates → 技能模板（effects 欄為 JSON 字串）
 * - hero_skills     → 英雄←→技能對照
 * - element_matrix  → 屬性剋制矩陣
 */

import { readSheet } from './sheetApi'
import { loadElementMatrix } from '../domain/elementSystem'
import type {
  Element,
  SkillTemplate,
  SkillEffect,
  HeroSkillConfig,
  ElementEntry,
  PassiveTrigger,
  TargetType,
} from '../domain/types'
import type { RawHeroInput } from '../domain/battleEngine'

/* ════════════════════════════════════
   中文 ↔ 英文 屬性對照
   ════════════════════════════════════ */

const ELEMENT_ZH_TO_EN: Record<string, Element> = {
  '火': 'fire',
  '冰': 'water',   // 冰元素 → water
  '水': 'water',
  '雷': 'thunder',
  '闇': 'dark',
  '暗': 'dark',
  '光': 'light',
  '毒': 'wind',    // 毒元素 → wind（遊戲設定）
  '風': 'wind',
  '地': 'earth',
  '土': 'earth',
}

export function toElement(raw: string | undefined | null): Element | '' {
  if (!raw) return ''
  const trimmed = raw.trim().toLowerCase()
  // 已經是英文
  const validEn: Element[] = ['fire', 'water', 'wind', 'thunder', 'earth', 'light', 'dark']
  if (validEn.includes(trimmed as Element)) return trimmed as Element
  // 中文轉換
  return ELEMENT_ZH_TO_EN[raw.trim()] ?? ''
}

/* ════════════════════════════════════
   原始 Sheet Row 型別
   ════════════════════════════════════ */

interface RawHeroRow {
  HeroID: number | string
  ModelID: string
  Name: string
  Type: string
  Rarity: number | string
  HP: number | string
  ATK: number | string
  DEF: number | string
  Speed: number | string
  CritRate: number | string
  CritDmg: number | string
  Element: string
  Description?: string
  [key: string]: unknown
}

interface RawSkillRow {
  skillId: string
  name: string
  type: string
  element: string
  target: string
  description: string
  effects: string     // JSON string
  passive_trigger: string
  icon: string
  [key: string]: unknown
}

interface RawHeroSkillRow {
  heroId: number | string
  activeSkillId: string
  passive1_skillId: string
  passive2_skillId: string
  passive3_skillId: string
  passive4_skillId: string
  [key: string]: unknown
}

interface RawElementRow {
  attacker: string
  defender: string
  multiplier: number | string
  [key: string]: unknown
}

/* ════════════════════════════════════
   解析函式
   ════════════════════════════════════ */

/** 解析 skill_templates 的 effects JSON 字串 */
function parseEffects(raw: string): SkillEffect[] {
  if (!raw || raw === '[]' || raw === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as SkillEffect[]
    return []
  } catch {
    console.warn('[dataService] 無法解析 effects JSON:', raw)
    return []
  }
}

/** 將 RawSkillRow 轉為 SkillTemplate */
function toSkillTemplate(row: RawSkillRow): SkillTemplate {
  return {
    skillId: row.skillId,
    name: row.name,
    type: row.type as 'active' | 'passive',
    element: toElement(row.element),
    target: (row.target || 'single_enemy') as TargetType,
    description: row.description || '',
    effects: parseEffects(row.effects),
    passiveTrigger: (row.passive_trigger || '') as PassiveTrigger | '',
    icon: row.icon || '',
  }
}

/** 將 RawHeroRow 轉為 RawHeroInput（domain 層格式） */
function toRawHeroInput(row: RawHeroRow): RawHeroInput {
  return {
    heroId: Number(row.HeroID),
    modelId: String(row.ModelID || `zombie_${row.HeroID}`),
    name: String(row.Name || ''),
    element: toElement(row.Element) || '',
    HP: Number(row.HP) || 100,
    ATK: Number(row.ATK) || 20,
    DEF: Number(row.DEF) || 10,
    SPD: Number(row.Speed) || 5,
    CritRate: Number(row.CritRate) || 5,
    CritDmg: Number(row.CritDmg) || 50,
  }
}

/** 將 RawHeroSkillRow 轉為 HeroSkillConfig */
function toHeroSkillConfig(row: RawHeroSkillRow): HeroSkillConfig {
  return {
    heroId: Number(row.heroId),
    activeSkillId: row.activeSkillId || '',
    passive1_skillId: row.passive1_skillId || '',
    passive2_skillId: row.passive2_skillId || '',
    passive3_skillId: row.passive3_skillId || '',
    passive4_skillId: row.passive4_skillId || '',
  }
}

/* ════════════════════════════════════
   快取
   ════════════════════════════════════ */

let heroesCache: RawHeroInput[] | null = null
let skillsCache: Map<string, SkillTemplate> | null = null
let heroSkillsCache: Map<number, HeroSkillConfig> | null = null
let elementLoaded = false
let allDataLoaded = false

/* ════════════════════════════════════
   公開 API
   ════════════════════════════════════ */

/** 載入英雄原始資料（UI 層格式，欄名 HeroID / ModelID / Name…） */
export async function loadRawHeroes(): Promise<Record<string, unknown>[]> {
  return readSheet<Record<string, unknown>>('heroes')
}

/** 載入英雄列表（domain 層格式） */
export async function loadHeroes(): Promise<RawHeroInput[]> {
  if (heroesCache) return heroesCache
  const rows = await readSheet<RawHeroRow>('heroes')
  heroesCache = rows.map(toRawHeroInput)
  return heroesCache
}

/** 載入技能模板（以 skillId 為 key） */
export async function loadSkillTemplates(): Promise<Map<string, SkillTemplate>> {
  if (skillsCache) return skillsCache
  const rows = await readSheet<RawSkillRow>('skill_templates')
  skillsCache = new Map<string, SkillTemplate>()
  for (const row of rows) {
    const skill = toSkillTemplate(row)
    skillsCache.set(skill.skillId, skill)
  }
  return skillsCache
}

/** 載入英雄技能配置（以 heroId 為 key） */
export async function loadHeroSkills(): Promise<Map<number, HeroSkillConfig>> {
  if (heroSkillsCache) return heroSkillsCache
  const rows = await readSheet<RawHeroSkillRow>('hero_skills')
  heroSkillsCache = new Map<number, HeroSkillConfig>()
  for (const row of rows) {
    const config = toHeroSkillConfig(row)
    heroSkillsCache.set(config.heroId, config)
  }
  return heroSkillsCache
}

/** 載入屬性剋制矩陣到 domain 層 */
export async function loadElements(): Promise<void> {
  if (elementLoaded) return
  const rows = await readSheet<RawElementRow>('element_matrix')
  const entries: ElementEntry[] = rows.map(r => ({
    attacker: r.attacker as Element,
    defender: r.defender as Element,
    multiplier: Number(r.multiplier),
  }))
  loadElementMatrix(entries)
  elementLoaded = true
}

/**
 * 一次載入所有遊戲資料
 * 在遊戲初始化時呼叫此函式（配合進度條）。
 */
export async function loadAllGameData(
  onProgress?: (ratio: number) => void,
): Promise<{
  heroes: RawHeroInput[]
  skills: Map<string, SkillTemplate>
  heroSkills: Map<number, HeroSkillConfig>
}> {
  if (allDataLoaded && heroesCache && skillsCache && heroSkillsCache) {
    onProgress?.(1)
    return { heroes: heroesCache, skills: skillsCache, heroSkills: heroSkillsCache }
  }

  onProgress?.(0)

  // 並行載入所有表（用計數器確保進度只遞增）
  let completed = 0
  const total = 4 // heroes + skills + heroSkills + elements
  const tick = () => { completed++; onProgress?.(completed / total * 0.9) }

  const [heroes, skills, heroSkills] = await Promise.all([
    loadHeroes().then(r => { tick(); return r }),
    loadSkillTemplates().then(r => { tick(); return r }),
    loadHeroSkills().then(r => { tick(); return r }),
  ])

  // 載入屬性矩陣
  await loadElements()
  tick()
  onProgress?.(0.95)

  allDataLoaded = true
  onProgress?.(1)

  return { heroes, skills, heroSkills }
}

/**
 * 根據 heroId 取得完整技能配置
 * 回傳 { activeSkill, passives } 供 createBattleHero() 使用
 */
export function getHeroSkillSet(
  heroId: number,
  skills: Map<string, SkillTemplate>,
  heroSkills: Map<number, HeroSkillConfig>,
): { activeSkill: SkillTemplate | null; passives: SkillTemplate[] } {
  const config = heroSkills.get(heroId)
  if (!config) {
    return { activeSkill: null, passives: [] }
  }

  const activeSkill = skills.get(config.activeSkillId) ?? null
  const passives: SkillTemplate[] = []

  for (const key of [
    config.passive1_skillId,
    config.passive2_skillId,
    config.passive3_skillId,
    config.passive4_skillId,
  ]) {
    if (key) {
      const skill = skills.get(key)
      if (skill) passives.push(skill)
    }
  }

  return { activeSkill, passives }
}

/**
 * 清除所有快取（例如切換帳號或強制重載時）
 */
export function clearGameDataCache(): void {
  heroesCache = null
  skillsCache = null
  heroSkillsCache = null
  elementLoaded = false
  allDataLoaded = false
}
