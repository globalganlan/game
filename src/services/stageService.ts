/**
 * stageService — 關卡配置服務
 *
 * 從 Workers API 取得主線關卡配置（敵方陣容、獎勵、章節主題等）。
 * 內建快取，只拉取一次。
 */

import { callApi } from './apiClient'
import type { StageEnemy } from '../domain/stageSystem'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface StageExtra {
  chapterName: string
  stageName: string
  description: string
  bgTheme: 'city' | 'forest' | 'wasteland' | 'factory' | 'hospital' | 'residential' | 'underground' | 'core'
  difficulty: number        // 1~5
  recommendedLevel: number
  isBoss: boolean
  chapterIcon: string       // emoji
}

export interface StageRewardConfig {
  exp: number
  gold: number
  diamond?: number
  items?: { itemId: string; quantity: number; dropRate: number }[]
}

export interface StageConfigFromAPI {
  stageId: string
  chapter: number
  stage: number
  enemies: StageEnemy[]
  rewards: StageRewardConfig
  extra: StageExtra
}

/* ════════════════════════════════════
   快取
   ════════════════════════════════════ */

let _cache: StageConfigFromAPI[] | null = null

export function clearStageCache(): void {
  _cache = null
}

/**
 * 同步從快取取得單一關卡配置（不發 API）。
 * 適用於已確定快取已載入的場景（如戰鬥結算）。
 */
export function getCachedStageConfig(stageId: string): StageConfigFromAPI | null {
  if (!_cache) return null
  return _cache.find(s => s.stageId === stageId) ?? null
}

/* ════════════════════════════════════
   API
   ════════════════════════════════════ */

/**
 * 取得所有主線關卡配置。
 * 快取在記憶體中，只拉取一次。
 */
export async function fetchStageConfigs(): Promise<StageConfigFromAPI[]> {
  if (_cache) return _cache

  const res = await callApi<{ stages: StageConfigFromAPI[] }>('list-stages', {})
  _cache = res.stages ?? []
  return _cache
}

/**
 * 根據 stageId 取得單一關卡配置。
 * 優先從快取查找，快取沒有才單獨拉。
 */
export async function getStageConfig(stageId: string): Promise<StageConfigFromAPI | null> {
  // 嘗試從快取查
  if (_cache) {
    const found = _cache.find(s => s.stageId === stageId)
    if (found) return found
  }

  const res = await callApi<{ config?: StageConfigFromAPI }>('stage-config', { stageId })
  return res.config ?? null
}

/**
 * 取得指定章節的關卡配置列表。
 */
export async function getChapterStages(chapter: number): Promise<StageConfigFromAPI[]> {
  const all = await fetchStageConfigs()
  return all.filter(s => s.chapter === chapter)
}
