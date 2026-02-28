/**
 * progressionService — 養成系統前端服務
 *
 * 負責：英雄升級、突破、升星、裝備強化/鍛造等操作
 *
 * 對應 Spec: specs/progression.md v0.2
 */

import { getAuthState } from './authService'
import { fireOptimisticAsync } from './optimisticQueue'
import type { EquipmentInstance } from '../domain/progressionSystem'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

/* ════════════════════════════════════
   通用 API
   ════════════════════════════════════ */

async function callApi<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T & { success: boolean; error?: string }> {
  const token = getAuthState().guestToken
  if (!token) throw new Error('not_logged_in')
  const body = JSON.stringify({ action, guestToken: token, ...params })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  return res.json()
}

/* ════════════════════════════════════
   英雄養成
   ════════════════════════════════════ */

export interface UpgradeHeroResult {
  success: boolean
  newLevel: number
  newExp: number
  expConsumed: number
  materialsConsumed: { itemId: string; quantity: number }[]
}

/** 英雄升級（消耗經驗素材，帶樂觀佇列保護） */
export async function upgradeHero(
  instanceId: string,
  materials: { itemId: string; quantity: number }[],
): Promise<UpgradeHeroResult> {
  const { serverResult } = fireOptimisticAsync<UpgradeHeroResult>(
    'upgrade-hero', { instanceId, materials },
  )
  const res = await serverResult
  return {
    success: res.success,
    newLevel: res.newLevel || 0,
    newExp: res.newExp || 0,
    expConsumed: res.expConsumed || 0,
    materialsConsumed: res.materialsConsumed || [],
  }
}

export interface AscendHeroResult {
  success: boolean
  newAscension: number
  newLevelCap: number
}

/** 英雄突破（帶樂觀佇列保護） */
export async function ascendHero(instanceId: string): Promise<AscendHeroResult> {
  const { serverResult } = fireOptimisticAsync<AscendHeroResult>(
    'ascend-hero', { instanceId },
  )
  const res = await serverResult
  return {
    success: res.success,
    newAscension: res.newAscension || 0,
    newLevelCap: res.newLevelCap || 20,
  }
}

export interface StarUpResult {
  success: boolean
  newStars: number
  fragmentsConsumed: number
}

/** 英雄升星（帶樂觀佇列保護） */
export async function starUpHero(instanceId: string): Promise<StarUpResult> {
  const { serverResult } = fireOptimisticAsync<StarUpResult>(
    'star-up-hero', { instanceId },
  )
  const res = await serverResult
  return {
    success: res.success,
    newStars: res.newStars || 0,
    fragmentsConsumed: res.fragmentsConsumed || 0,
  }
}

/* ════════════════════════════════════
   裝備操作
   ════════════════════════════════════ */

export interface EnhanceEquipmentResult {
  success: boolean
  newLevel: number
  newMainStatValue: number
  materialsConsumed: { itemId: string; quantity: number }[]
  goldConsumed: number
}

/** 裝備強化（帶樂觀佇列保護） */
export async function enhanceEquipment(
  equipId: string,
  materials: { itemId: string; quantity: number }[],
): Promise<EnhanceEquipmentResult> {
  const { serverResult } = fireOptimisticAsync<EnhanceEquipmentResult>(
    'enhance-equipment', { equipId, materials },
  )
  const res = await serverResult
  return {
    success: res.success,
    newLevel: res.newLevel || 0,
    newMainStatValue: res.newMainStatValue || 0,
    materialsConsumed: res.materialsConsumed || [],
    goldConsumed: res.goldConsumed || 0,
  }
}

export interface ForgeResult {
  success: boolean
  equipment: EquipmentInstance | null
}

/** 鍛造裝備（帶樂觀佇列保護） */
export async function forgeEquipment(
  blueprintItemId: string,
): Promise<ForgeResult> {
  const { serverResult } = fireOptimisticAsync<{ equipment: EquipmentInstance }>(
    'forge-equipment', { blueprintItemId },
  )
  const res = await serverResult
  return {
    success: res.success,
    equipment: res.equipment || null,
  }
}

/** 拆解裝備（帶樂觀佇列保護） */
export async function dismantleEquipment(
  equipId: string,
): Promise<{ success: boolean; goldGained: number; materialsGained: { itemId: string; quantity: number }[] }> {
  const { serverResult } = fireOptimisticAsync<{
    goldGained: number
    materialsGained: { itemId: string; quantity: number }[]
  }>('dismantle-equipment', { equipId })
  const res = await serverResult
  return {
    success: res.success,
    goldGained: res.goldGained || 0,
    materialsGained: res.materialsGained || [],
  }
}

/* ════════════════════════════════════
   關卡 & 抽卡
   ════════════════════════════════════ */

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

/** 通關結算（主線，樂觀佇列 + 幂等保護） */
export async function completeStage(stageId: string, starsEarned: number): Promise<StageCompleteResult> {
  const { serverResult } = fireOptimisticAsync<StageCompleteResult>(
    'complete-stage', { stageId, starsEarned },
  )
  const res = await serverResult
  return {
    success: res.success,
    rewards: res.rewards || { gold: 0, exp: 0, diamond: 0, items: [] },
    isFirstClear: res.isFirstClear || false,
    starsEarned: res.starsEarned || 1,
    newStoryProgress: res.newStoryProgress,
  }
}

/** 爬塔通關結算（樂觀佇列 + 幂等保護） */
export async function completeTower(floor: number): Promise<{
  success: boolean
  rewards: { gold: number; exp: number; diamond: number; items: { itemId: string; quantity: number }[] }
  newFloor: number
}> {
  const { serverResult } = fireOptimisticAsync<{
    rewards: { gold: number; exp: number; diamond: number; items: { itemId: string; quantity: number }[] }
    newFloor: number
  }>('complete-tower', { floor })
  const res = await serverResult
  return {
    success: res.success,
    rewards: res.rewards || { gold: 0, exp: 0, diamond: 0, items: [] },
    newFloor: res.newFloor || floor,
  }
}

/** 副本結算（樂觀佇列 + 幂等保護） */
export async function completeDaily(dungeonId: string, tier: string): Promise<{
  success: boolean
  rewards: { gold: number; exp: number; items: { itemId: string; quantity: number }[] }
  remainingAttempts: number
}> {
  const { serverResult } = fireOptimisticAsync<{
    rewards: { gold: number; exp: number; items: { itemId: string; quantity: number }[] }
    remainingAttempts: number
  }>('complete-daily', { dungeonId, tier })
  const res = await serverResult
  return {
    success: res.success,
    rewards: res.rewards || { gold: 0, exp: 0, items: [] },
    remainingAttempts: res.remainingAttempts ?? 3,
  }
}

/** 抽卡（舊版 server-side 路徑，樂觀佇列保護） */
export async function gachaPull(bannerId: string, count: 1 | 10): Promise<{
  success: boolean
  results: { heroId: number; rarity: string; isNew: boolean; isFeatured: boolean }[]
  diamondCost: number
  newPityState: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
  gachaPoolRemaining: number
}> {
  const { serverResult } = fireOptimisticAsync<{
    results: { heroId: number; rarity: string; isNew: boolean; isFeatured: boolean }[]
    diamondCost: number
    newPityState: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
    gachaPoolRemaining: number
  }>('gacha-pull', { bannerId, count })
  const res = await serverResult
  return {
    success: res.success,
    results: res.results || [],
    diamondCost: res.diamondCost || 0,
    newPityState: res.newPityState || { pullsSinceLastSSR: 0, guaranteedFeatured: false },
    gachaPoolRemaining: res.gachaPoolRemaining ?? 200,
  }
}

/** 取得抽卡池剩餘狀態 */
export async function getGachaPoolStatus(): Promise<{
  success: boolean
  remaining: number
  total: number
}> {
  const res = await callApi<{
    remaining: number
    total: number
  }>('gacha-pool-status')
  return {
    success: res.success,
    remaining: res.remaining ?? 0,
    total: res.total ?? 200,
  }
}
