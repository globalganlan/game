/**
 * arenaService  競技場 API 前端服務
 *
 * 封裝與 Workers 的通信：排行榜讀取、挑戰、防守陣型設定、獎勵領取
 *
 * 對應 Spec: specs/arena-pvp.md v0.1
 */

import { callApi } from './apiClient'
import {
  generateNPCForRank,
  type ArenaEntry,
  type ArenaReward,
  ARENA_MAX_RANK,
} from '../domain/arenaSystem'

/* 
   快取
    */

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

/** 取得快取中的剩餘挑戰次數（若尚未載入則回傳 null） */
export function getCachedChallengesLeft(): number | null {
  return cachedChallengesLeft
}

/* 
   排行榜讀取
    */

export interface ArenaRankingsResult {
  rankings: ArenaEntry[]
  myRank: number
  challengesLeft: number
  highestRank: number
}

const ARENA_DAILY_CHALLENGES_CONST = 5

export async function getArenaRankings(): Promise<ArenaRankingsResult> {
  try {
    const result = await callApi<{
      rankings: ArenaEntry[]
      myRank: number
      challengesLeft: number
      highestRank: number
    }>('arena-get-rankings')
    if (result.success) {
      const rankings = result.rankings ?? []
      const myRank = result.myRank ?? ARENA_MAX_RANK
      const challengesLeft = result.challengesLeft ?? ARENA_DAILY_CHALLENGES_CONST
      const highestRank = result.highestRank ?? ARENA_MAX_RANK

      cachedRankings = rankings
      cachedMyRank = myRank
      cachedChallengesLeft = challengesLeft
      cachedHighestRank = highestRank

      return { rankings, myRank, challengesLeft, highestRank }
    }
  } catch {
    // 降級到離線 NPC 模式
  }

  return getOfflineRankings()
}

function getOfflineRankings(): ArenaRankingsResult {
  const rankings: ArenaEntry[] = []
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

/* 
   挑戰
    */

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

export async function startArenaChallenge(targetRank: number): Promise<ArenaChallengeResponse> {
  try {
    const result = await callApi<{
      defenderData: ArenaChallengeResponse['defenderData']
    }>('arena-challenge-start', { targetRank })
    if (result.success) {
      return { success: true, defenderData: result.defenderData }
    }
    return { success: false, error: result.error }
  } catch {
    return { success: false, error: 'network_error' }
  }
}

export async function completeArenaChallenge(
  targetRank: number,
  won: boolean,
): Promise<{
  success: boolean
  newRank?: number
  rewards?: ArenaReward
  milestoneReward?: ArenaReward | null
  currencies?: { gold?: number; diamond?: number; exp?: number }
  error?: string
}> {
  try {
    const result = await callApi<{
      newRank: number
      rewards: ArenaReward
      milestoneReward: ArenaReward | null
      challengesLeft: number
      currencies?: { gold?: number; diamond?: number; exp?: number }
    }>('arena-challenge-complete', { targetRank, won })
    if (result.success) {
      if (won && typeof result.newRank === 'number') {
        cachedMyRank = result.newRank
        if (cachedMyRank < cachedHighestRank) {
          cachedHighestRank = cachedMyRank
        }
      }
      if (typeof result.challengesLeft === 'number') {
        cachedChallengesLeft = result.challengesLeft
      }
      return {
        success: true,
        newRank: result.newRank,
        rewards: result.rewards,
        milestoneReward: result.milestoneReward ?? null,
        currencies: result.currencies,
      }
    }
    return { success: false, error: result.error }
  } catch {
    return { success: false, error: 'network_error' }
  }
}

/* 
   防守陣型
    */

export async function setDefenseFormation(formation: (string | null)[]): Promise<boolean> {
  try {
    const result = await callApi('arena-set-defense', {
      defenseFormation: JSON.stringify(formation),
    })
    return !!result.success
  } catch {
    return false
  }
}

export async function getDefenseFormation(): Promise<(string | null)[]> {
  try {
    const result = await callApi<{ defenseFormation: string }>('arena-get-defense')
    if (result.success && result.defenseFormation) {
      return JSON.parse(result.defenseFormation)
    }
  } catch { /* fallback */ }
  return [null, null, null, null, null, null]
}
