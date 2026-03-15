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
 */

import { readSheet } from './sheetApi'
import type {
  SkillTemplate,
  SkillEffect,
  HeroSkillConfig,
  PassiveTrigger,
  TargetType,
  EffectTemplate,
  EffectTrigger,
  EffectCategory,
  EffectTarget,
  SkillEffectLink,
  ResolvedEffect,
  StatusType,
  FinalStats,
} from '../domain/types'
import type { RawHeroInput } from '../domain/battleEngine'

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
  Description?: string
  [key: string]: unknown
}

interface RawSkillRow {
  skillId: string
  name: string
  type: string
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

interface RawEffectTemplateRow {
  effectId: string
  name: string
  category: string
  trigger: string
  triggerParam?: string | number | null
  triggerChance?: number | null
  triggerLimit?: number | null
  target: string
  scalingStat?: string | null
  multiplier?: number | null
  flatValue?: number | null
  hitCount?: number | null
  min?: number | null
  max?: number | null
  status?: string | null
  statusChance?: number | null
  statusValue?: number | null
  statusDuration?: number | null
  statusMaxStacks?: number | null
  targetHpThreshold?: number | null
  perAlly?: number | null
  targetOverride?: string | null
  applyTo?: string | null
  [key: string]: unknown
}

interface RawSkillEffectRow {
  skillId: string
  effectId: string
  sortOrder: number | string
  overrideParams: string
  dependsOn?: string | null
  skillLevel: number | string
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

/** 將 RawEffectTemplateRow 轉為 EffectTemplate */
function toEffectTemplate(row: RawEffectTemplateRow): EffectTemplate {
  const result: EffectTemplate = {
    effectId: row.effectId,
    name: row.name || '',
    category: (row.category || 'damage') as EffectCategory,
    trigger: (row.trigger || 'immediate') as EffectTrigger,
    target: (row.target || 'single_enemy') as EffectTarget,
  }

  if (row.triggerParam != null && row.triggerParam !== '') {
    const num = Number(row.triggerParam)
    result.triggerParam = isNaN(num) ? String(row.triggerParam) : num
  }
  if (row.triggerChance != null) result.triggerChance = Number(row.triggerChance)
  if (row.triggerLimit != null) result.triggerLimit = Number(row.triggerLimit)
  if (row.scalingStat) result.scalingStat = row.scalingStat as keyof FinalStats
  if (row.multiplier != null) result.multiplier = Number(row.multiplier)
  if (row.flatValue != null) result.flatValue = Number(row.flatValue)
  if (row.hitCount != null) result.hitCount = Number(row.hitCount)
  if (row.min != null) result.min = Number(row.min)
  if (row.max != null) result.max = Number(row.max)
  if (row.status) result.status = row.status as StatusType
  if (row.statusChance != null) result.statusChance = Number(row.statusChance)
  if (row.statusValue != null) result.statusValue = Number(row.statusValue)
  if (row.statusDuration != null) result.statusDuration = Number(row.statusDuration)
  if (row.statusMaxStacks != null) result.statusMaxStacks = Number(row.statusMaxStacks)
  if (row.targetHpThreshold != null) result.targetHpThreshold = Number(row.targetHpThreshold)
  if (row.perAlly != null && Number(row.perAlly) === 1) result.perAlly = true
  if (row.targetOverride) result.targetOverride = row.targetOverride as EffectTarget
  if (row.applyTo) result.applyTo = row.applyTo as 'normal' | 'active' | 'both'

  return result
}

/** 將 RawSkillEffectRow 轉為 SkillEffectLink */
function toSkillEffectLink(row: RawSkillEffectRow): SkillEffectLink {
  return {
    skillId: row.skillId,
    effectId: row.effectId,
    sortOrder: Number(row.sortOrder) || 0,
    overrideParams: row.overrideParams || '{}',
    dependsOn: row.dependsOn || undefined,
    skillLevel: Number(row.skillLevel) || 1,
  }
}

/* ════════════════════════════════════
   快取
   ════════════════════════════════════ */

let heroesCache: RawHeroInput[] | null = null
let skillsCache: Map<string, SkillTemplate> | null = null
let heroSkillsCache: Map<number, HeroSkillConfig> | null = null
let effectTemplatesCache: Map<string, EffectTemplate> | null = null
let skillEffectsCache: Map<string, SkillEffectLink[]> | null = null
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

/** 載入效果模板（以 effectId 為 key） */
export async function loadEffectTemplates(): Promise<Map<string, EffectTemplate>> {
  if (effectTemplatesCache) return effectTemplatesCache
  const rows = await readSheet<RawEffectTemplateRow>('effect_templates')
  effectTemplatesCache = new Map<string, EffectTemplate>()
  for (const row of rows) {
    const eff = toEffectTemplate(row)
    effectTemplatesCache.set(eff.effectId, eff)
  }
  return effectTemplatesCache
}

/** 載入技能效果關聯（以 skillId 為 key，同一技能多筆按 sortOrder 排序） */
export async function loadSkillEffectsMap(): Promise<Map<string, SkillEffectLink[]>> {
  if (skillEffectsCache) return skillEffectsCache
  const rows = await readSheet<RawSkillEffectRow>('skill_effects')
  skillEffectsCache = new Map<string, SkillEffectLink[]>()
  for (const row of rows) {
    const link = toSkillEffectLink(row)
    const list = skillEffectsCache.get(link.skillId) ?? []
    list.push(link)
    skillEffectsCache.set(link.skillId, list)
  }
  // Sort each list by sortOrder
  for (const [, list] of skillEffectsCache) {
    list.sort((a, b) => a.sortOrder - b.sortOrder)
  }
  return skillEffectsCache
}

/**
 * 技能等級自動縮放倍率（Lv.1~5）
 * 當 DB 無該等級的 overrideParams 時，自動根據此倍率提升數值
 */
const LEVEL_SCALE = [1.0, 1.15, 1.30, 1.50, 1.75]

/** 對數值欄位套用等級縮放 */
function applyLevelScaling<T extends { multiplier?: number; statusValue?: number; flatValue?: number }>(
  effect: T,
  actualLevel: number,
  requestedLevel: number,
): T {
  if (requestedLevel <= 1 || actualLevel >= requestedLevel) return effect
  const scale = LEVEL_SCALE[requestedLevel - 1] ?? LEVEL_SCALE[LEVEL_SCALE.length - 1]
  const scaled = { ...effect }
  const r2 = (v: number) => Math.round(v * 100) / 100
  if (scaled.multiplier != null) scaled.multiplier = r2(scaled.multiplier * scale)
  if (scaled.statusValue != null) scaled.statusValue = r2(scaled.statusValue * scale)
  if (scaled.flatValue != null) scaled.flatValue = Math.round(scaled.flatValue * scale)
  return scaled
}

/**
 * 根據技能等級解析效果列表
 */
export function resolveSkillEffects(
  skillId: string,
  skillLevel: number,
  effectTemplates: Map<string, EffectTemplate>,
  skillEffectsMap: Map<string, SkillEffectLink[]>,
): ResolvedEffect[] {
  const links = skillEffectsMap.get(skillId)
  if (!links || links.length === 0) return []

  // Filter by skillLevel: take exact match, or fallback to the highest level <= requested
  const atLevel = links.filter(l => l.skillLevel === skillLevel)
  const usedLevel = atLevel.length > 0 ? skillLevel : undefined
  const candidates = atLevel.length > 0
    ? atLevel
    : links.filter(l => l.skillLevel <= skillLevel).sort((a, b) => b.skillLevel - a.skillLevel)
      .filter((l, _, arr) => l.skillLevel === arr[0]?.skillLevel)

  if (candidates.length === 0) return []
  const actualLevel = usedLevel ?? (candidates[0]?.skillLevel ?? 1)

  const effectNameMap = new Map<string, string>()
  const results: ResolvedEffect[] = []

  for (const link of candidates) {
    const template = effectTemplates.get(link.effectId)
    if (!template) continue

    // Merge overrideParams
    let override: Record<string, unknown> = {}
    try { override = JSON.parse(link.overrideParams || '{}') } catch { /* ignore */ }

    let resolved: ResolvedEffect = { ...template, ...override } as ResolvedEffect
    // Auto-scale when DB has no level-specific data
    resolved = applyLevelScaling(resolved, actualLevel, skillLevel)

    if (link.dependsOn) {
      const depSrc = effectTemplates.get(link.dependsOn)
      resolved.dependsOnName = depSrc?.name ?? link.dependsOn
    }

    effectNameMap.set(link.effectId, resolved.name)
    results.push(resolved)
  }

  return results
}

/**
 * 根據技能等級解析效果並轉為 SkillEffect[]（供戰鬥引擎使用）
 * 若 skill_effects 無該技能資料，回傳 null（使用原始 skill.effects fallback）
 */
export function resolveSkillEffectsForBattle(
  skillId: string,
  skillLevel: number,
  effectTemplates: Map<string, EffectTemplate>,
  skillEffectsMap: Map<string, SkillEffectLink[]>,
): SkillEffect[] | null {
  const links = skillEffectsMap.get(skillId)
  if (!links || links.length === 0) return null

  const atLevel = links.filter(l => l.skillLevel === skillLevel)
  const usedLevel = atLevel.length > 0 ? skillLevel : undefined
  const candidates = atLevel.length > 0
    ? atLevel
    : links.filter(l => l.skillLevel <= skillLevel).sort((a, b) => b.skillLevel - a.skillLevel)
      .filter((l, _, arr) => l.skillLevel === arr[0]?.skillLevel)
  if (candidates.length === 0) return null
  const actualLevel = usedLevel ?? (candidates[0]?.skillLevel ?? 1)

  // Build effectId → index map for dependsOn conversion
  const effectIdToIdx = new Map<string, number>()
  candidates.forEach((link, i) => effectIdToIdx.set(link.effectId, i))

  const effects: SkillEffect[] = []
  for (const link of candidates) {
    const template = effectTemplates.get(link.effectId)
    if (!template) continue
    let override: Record<string, unknown> = {}
    try { override = JSON.parse(link.overrideParams || '{}') } catch { /* ignore */ }
    const raw = { ...template, ...override } as EffectTemplate
    // Auto-scale when DB has no level-specific data
    const merged = applyLevelScaling(raw, actualLevel, skillLevel)

    // Convert effectId-based dependsOn to index-based
    let dependsOn: string | undefined
    if (link.dependsOn) {
      const depIdx = effectIdToIdx.get(link.dependsOn)
      if (depIdx != null) dependsOn = String(depIdx)
    }

    effects.push({
      type: merged.category as SkillEffect['type'],
      scalingStat: merged.scalingStat,
      multiplier: merged.multiplier,
      flatValue: merged.flatValue,
      hitCount: merged.hitCount,
      min: merged.min,
      max: merged.max,
      status: merged.status,
      statusChance: merged.statusChance,
      statusValue: merged.statusValue,
      statusDuration: merged.statusDuration,
      statusMaxStacks: merged.statusMaxStacks,
      targetHpThreshold: merged.targetHpThreshold,
      perAlly: merged.perAlly,
      dependsOn,
      targetOverride: merged.targetOverride,
      applyTo: merged.applyTo,
    })
  }

  return effects.length > 0 ? effects : null
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
  effectTemplates: Map<string, EffectTemplate>
  skillEffects: Map<string, SkillEffectLink[]>
}> {
  if (allDataLoaded && heroesCache && skillsCache && heroSkillsCache) {
    onProgress?.(1)
    return {
      heroes: heroesCache,
      skills: skillsCache,
      heroSkills: heroSkillsCache,
      effectTemplates: effectTemplatesCache ?? new Map(),
      skillEffects: skillEffectsCache ?? new Map(),
    }
  }

  onProgress?.(0)

  // 並行載入所有表（用計數器確保進度只遞增）
  let completed = 0
  const total = 5 // heroes + skills + heroSkills + effectTemplates + skillEffects
  const tick = () => { completed++; onProgress?.(completed / total * 0.9) }

  const [heroes, skills, heroSkills, effectTemplates, skillEffects] = await Promise.all([
    loadHeroes().then(r => { tick(); return r }),
    loadSkillTemplates().then(r => { tick(); return r }),
    loadHeroSkills().then(r => { tick(); return r }),
    loadEffectTemplates().then(r => { tick(); return r }),
    loadSkillEffectsMap().then(r => { tick(); return r }),
  ])

  onProgress?.(0.95)

  allDataLoaded = true
  onProgress?.(1)

  return { heroes, skills, heroSkills, effectTemplates, skillEffects }
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

/** 同步取得已載入的 effectTemplates 快取（loadAllGameData 後可用） */
export function getEffectTemplatesCache(): Map<string, EffectTemplate> {
  return effectTemplatesCache ?? new Map()
}

/** 同步取得已載入的 skillEffects 快取（loadAllGameData 後可用） */
export function getSkillEffectsCache(): Map<string, SkillEffectLink[]> {
  return skillEffectsCache ?? new Map()
}

/**
 * 清除所有快取（例如切換帳號或強制重載時）
 */
export function clearGameDataCache(): void {
  heroesCache = null
  skillsCache = null
  heroSkillsCache = null
  effectTemplatesCache = null
  skillEffectsCache = null
  allDataLoaded = false
}
