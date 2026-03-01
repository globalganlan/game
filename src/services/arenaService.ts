/**
 * arenaService — 競技場 API 前端服務
 *
 * 封裝與 GAS 的通信：排行榜讀取、挑戰、防守陣型設定、獎勵領取
 *
 * 對應 Spec: specs/arena-pvp.md v0.1
 */

import { getAuthState } from './authService'
import {
  generateNPCForRank,
  type ArenaEntry,
  type ArenaReward,
  ARENA_MAX_RANK,
} from '../domain/arenaSystem'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

/* ════════════════════════════════════
   通用 API 呼叫
   ════════════════════════════════════ */

async function callArenaApi(action: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const auth = getAuthState()
  const body = JSON.stringify({
    action,
    guestToken: auth.guestToken,
    ...params,
  })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  return res.json()
}

/* ════════════════════════════════════
   快取
   ════════════════════════════════════ */

let cachedRankings: ArenaEntry[] | null = null
let cachedMyRank: number | null = null
let cachedChallengesLeft: number | null = null
let cachedHighestRank: number = ARENA_MAX_RANK

export function clearArenaCache(): void {
  cachedRankings = null
  cachedMyRank = null
  cachedChallengesLeft = null
  cachedHighestRank = ARENA_MAX_RANK
}

/* ════════════════════════════════════
   排行榜讀取
   ════════════════════════════════════ */

export interface ArenaRankingsResult {
  rankings: ArenaEntry[]
  myRank: number
  challengesLeft: number
  highestRank: number
}

/**
 * 取得排行榜(含自己排名)
 * 如果 GAS 尚未建表，回退到純前端 NPC 模式
 */
export async function getArenaRankings(): Promise<ArenaRankingsResult> {
  try {
    const result = await callArenaApi('arena-get-rankings')
    if (result.success) {
      const rankings = (result.rankings as ArenaEntry[]) ?? []
      const myRank = (result.myRank as number) ?? ARENA_MAX_RANK
      const challengesLeft = (result.challengesLeft as number) ?? ARENA_DAILY_CHALLENGES_CONST
      const highestRank = (result.highestRank as number) ?? ARENA_MAX_RANK

      cachedRankings = rankings
      cachedMyRank = myRank
      cachedChallengesLeft = challengesLeft
      cachedHighestRank = highestRank

      return { rankings, myRank, challengesLeft, highestRank }
    }
  } catch {
    // 降級到離線 NPC 模式
  }

  // Fallback: 生成 NPC 排行榜
  return getOfflineRankings()
}

const ARENA_DAILY_CHALLENGES_CONST = 5

function getOfflineRankings(): ArenaRankingsResult {
  const rankings: ArenaEntry[] = []
  // 最高的 20 + 自己附近
  for (let r = 1; r <= 20; r++) {
    rankings.push(generateNPCForRank(r))
  }
  const myRank = cachedMyRank ?? ARENA_MAX_RANK
  for (let r = Math.max(21, myRank - 5); r <= Math.min(ARENA_MAX_RANK, myRank + 5); r++) {
    if (r <= 20) continue
    rankings.push(generateNPCForRank(r))
  }
  return {
    rankings,
    myRank,
    challengesLeft: cachedChallengesLeft ?? ARENA_DAILY_CHALLENGES_CONST,
    highestRank: cachedHighestRank,
  }
}

/* ════════════════════════════════════
   挑戰
   ════════════════════════════════════ */

export interface ArenaChallengeResponse {
  success: boolean
  defenderData?: {
    displayName: string
    heroes: unknown[]
    power: number
    isNPC: boolean
  }
  error?: string
}

/**
 * 發起挑戰 — 先取得防守方資料
 */
export async function startArenaChallenge(targetRank: number): Promise<ArenaChallengeResponse> {
  try {
    const result = await callArenaApi('arena-challenge-start', { targetRank })
    if (result.success) {
      return {
        success: true,
        defenderData: result.defenderData as ArenaChallengeResponse['defenderData'],
      }
    }
    return { success: false, error: result.error as string }
  } catch {
    return { success: false, error: 'network_error' }
  }
}

/**
 * 上報挑戰結果
 */
export async function completeArenaChallenge(
  targetRank: number,
  won: boolean,
): Promise<{
  success: boolean
  newRank?: number
  rewards?: ArenaReward
  milestoneReward?: ArenaReward | null
  error?: string
}> {
  try {
    const result = await callArenaApi('arena-challenge-complete', { targetRank, won })
    if (result.success) {
      // 更新快取
      if (won && typeof result.newRank === 'number') {
        cachedMyRank = result.newRank as number
        if (cachedMyRank < cachedHighestRank) {
          cachedHighestRank = cachedMyRank
        }
      }
      if (typeof result.challengesLeft === 'number') {
        cachedChallengesLeft = result.challengesLeft as number
      }

      return {
        success: true,
        newRank: result.newRank as number,
        rewards: result.rewards as ArenaReward,
        milestoneReward: (result.milestoneReward as ArenaReward) ?? null,
      }
    }
    return { success: false, error: result.error as string }
  } catch {
    return { success: false, error: 'network_error' }
  }
}

/* ════════════════════════════════════
   防守陣型
   ════════════════════════════════════ */

export async function setDefenseFormation(formation: (string | null)[]): Promise<boolean> {
  try {
    const result = await callArenaApi('arena-set-defense', {
      defenseFormation: JSON.stringify(formation),
    })
    return !!result.success
  } catch {
    return false
  }
}

export async function getDefenseFormation(): Promise<(string | null)[]> {
  try {
    const result = await callArenaApi('arena-get-defense')
    if (result.success && result.defenseFormation) {
      return JSON.parse(result.defenseFormation as string)
    }
  } catch { /* fallback */ }
  return [null, null, null, null, null, null]
}
