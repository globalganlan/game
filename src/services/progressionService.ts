/**
 * progressionService  養成系統前端服務
 *
 * 負責：英雄升級、突破、升星、裝備強化、戰鬥結算等操作
 * 所有操作直接 await Workers API 回應（不再使用 optimisticQueue）。
 *
 * 對應 Spec: specs/progression.md v2.0
 */

import { callApi } from './apiClient'
import type { BattleHero } from '../domain/types'

/* 
   英雄養成
    */

/** 後端回傳的貨幣絕對值 */
export type ServerCurrencies = { gold?: number; diamond?: number; exp?: number }

export interface UpgradeHeroResult {
  success: boolean
  newLevel: number
  newExp: number
  expConsumed: number
  currencies?: ServerCurrencies
}

/** 英雄升級（使用 EXP 資源） */
export async function upgradeHero(
  instanceId: string,
  expAmount: number,
): Promise<UpgradeHeroResult> {
  const res = await callApi<UpgradeHeroResult>(
    'upgrade-hero', { instanceId, expAmount },
  )
  return {
    success: res.success,
    newLevel: res.newLevel || 0,
    newExp: res.newExp || 0,
    expConsumed: res.expConsumed || 0,
    currencies: res.currencies,
  }
}

export interface AscendHeroResult {
  success: boolean
  newAscension: number
  newLevelCap: number
  currencies?: ServerCurrencies
}

/** 英雄突破 */
export async function ascendHero(instanceId: string): Promise<AscendHeroResult> {
  const res = await callApi<AscendHeroResult>(
    'ascend-hero', { instanceId },
  )
  return {
    success: res.success,
    newAscension: res.newAscension || 0,
    newLevelCap: res.newLevelCap || 20,
    currencies: res.currencies,
  }
}

export interface StarUpResult {
  success: boolean
  newStars: number
  fragmentsConsumed: number
}

/** 英雄升星 */
export async function starUpHero(instanceId: string): Promise<StarUpResult> {
  const res = await callApi<StarUpResult>(
    'star-up-hero', { instanceId },
  )
  return {
    success: res.success,
    newStars: res.newStars || 0,
    fragmentsConsumed: res.fragmentsConsumed || 0,
  }
}

/* 
   裝備操作
    */

export interface EnhanceEquipmentResult {
  success: boolean
  newLevel: number
  newMainStatValue: number
  materialsConsumed: { itemId: string; quantity: number }[]
  goldConsumed: number
  currencies?: ServerCurrencies
}

/** 裝備強化 */
export async function enhanceEquipment(
  equipId: string,
  materials: { itemId: string; quantity: number }[],
): Promise<EnhanceEquipmentResult> {
  const res = await callApi<EnhanceEquipmentResult>(
    'enhance-equipment', { equipId, materials },
  )
  return {
    success: res.success,
    newLevel: res.newLevel || 0,
    newMainStatValue: res.newMainStatValue || 0,
    materialsConsumed: res.materialsConsumed || [],
    goldConsumed: res.goldConsumed || 0,
    currencies: res.currencies,
  }
}



/* 
   戰鬥結算（統一入口）
    */

export interface CompleteBattleParams {
  stageMode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss'
  stageId: string
  starsEarned: number
  seed?: number
  players: BattleHero[]
  enemies: BattleHero[]
  maxTurns?: number
  dungeonTier?: string
}

export interface CompleteBattleResult {
  success: boolean
  error?: string
  winner: string
  actions: unknown[]
  rewards: {
    gold: number
    exp: number
    diamond: number
    items: { itemId: string; quantity: number }[]
  }
  isFirstClear: boolean
  starsEarned: number
  newLevel?: number
  leveledUp?: boolean
  newStoryProgress?: { chapter: number; stage: number }
  newFloor?: number
  currencies?: ServerCurrencies
}

/**
 * 統一戰鬥結算  由前端在戰鬥結束後呼叫
 * Workers 後端會：
 *  1. 用 seed 跑完整戰鬥模擬
 *  2. 驗證玩家進度（防止跳關）
 *  3. 計算獎勵並寫入資料庫
 *  4. 回傳 winner + actions + 獎勵資料
 */
export async function completeBattle(params: CompleteBattleParams): Promise<CompleteBattleResult> {
  const res = await callApi<CompleteBattleResult>(
    'complete-battle',
    {
      stageMode: params.stageMode,
      stageId: params.stageId,
      starsEarned: params.starsEarned,
      seed: params.seed,
      players: params.players,
      enemies: params.enemies,
      maxTurns: params.maxTurns ?? 50,
      dungeonTier: params.dungeonTier,
    },
  )
  return {
    success: res.success,
    error: res.error,
    winner: res.winner ?? '',
    actions: res.actions ?? [],
    rewards: res.rewards || { gold: 0, exp: 0, diamond: 0, items: [] },
    isFirstClear: res.isFirstClear || false,
    starsEarned: res.starsEarned || 1,
    newLevel: res.newLevel,
    leveledUp: res.leveledUp,
    newStoryProgress: res.newStoryProgress,
    newFloor: res.newFloor,
    currencies: res.currencies,
  }
}

/* 
   關卡 & 抽卡
    */

export interface StageCompleteResult {
  success: boolean
  rewards: {
    gold: number
    exp: number
    diamond: number
    items: { itemId: string; quantity: number }[]
  }
  isFirstClear: boolean
  starsEarned: number
  newStoryProgress?: { chapter: number; stage: number }
}

/** 通關結算（主線） */
export async function completeStage(stageId: string, starsEarned: number): Promise<StageCompleteResult> {
  const res = await callApi<StageCompleteResult>(
    'complete-stage', { stageId, starsEarned },
  )
  return {
    success: res.success,
    rewards: res.rewards || { gold: 0, exp: 0, diamond: 0, items: [] },
    isFirstClear: res.isFirstClear || false,
    starsEarned: res.starsEarned || 1,
    newStoryProgress: res.newStoryProgress,
  }
}

/** 爬塔通關結算 */
export async function completeTower(floor: number): Promise<{
  success: boolean
  rewards: { gold: number; exp: number; diamond: number; items: { itemId: string; quantity: number }[] }
  newFloor: number
}> {
  const res = await callApi<{
    rewards: { gold: number; exp: number; diamond: number; items: { itemId: string; quantity: number }[] }
    newFloor: number
  }>('complete-tower', { floor })
  return {
    success: res.success,
    rewards: res.rewards || { gold: 0, exp: 0, diamond: 0, items: [] },
    newFloor: res.newFloor || floor,
  }
}

/** 副本結算 */
export async function completeDaily(dungeonId: string, tier: string): Promise<{
  success: boolean
  rewards: { gold: number; exp: number; items: { itemId: string; quantity: number }[] }
  remainingAttempts: number
}> {
  const res = await callApi<{
    rewards: { gold: number; exp: number; items: { itemId: string; quantity: number }[] }
    remainingAttempts: number
  }>('complete-daily', { dungeonId, tier })
  return {
    success: res.success,
    rewards: res.rewards || { gold: 0, exp: 0, items: [] },
    remainingAttempts: res.remainingAttempts ?? 3,
  }
}

/** 抽卡（server-side） */
export async function gachaPull(bannerId: string, count: 1 | 10): Promise<{
  success: boolean
  results: { heroId: number; rarity: string; isNew: boolean; isFeatured: boolean; stardust: number; fragments: number }[]
  diamondCost: number
  newPityState: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
}> {
  const res = await callApi<{
    results: { heroId: number; rarity: string; isNew: boolean; isFeatured: boolean; stardust: number; fragments: number }[]
    diamondCost: number
    newPityState: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
  }>('gacha-pull', { bannerId, count })
  return {
    success: res.success,
    results: res.results || [],
    diamondCost: res.diamondCost || 0,
    newPityState: res.newPityState || { pullsSinceLastSSR: 0, guaranteedFeatured: false },
  }
}
