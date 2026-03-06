/**
 * arenaService  競技場 API 前端服務
 *
 * 封裝與 Workers 的通信：排行榜讀取、挑戰、防守陣型設定、獎勵領取
 *
 * 對應 Spec: .ai/specs/arena-pvp.md v0.1
 */

import { callApi } from './apiClient'
import {
  generateNPCForRank,
  type ArenaEntry,
  type ArenaReward,
  ARENA_MAX_RANK,
  ARENA_DAILY_REFRESHES,
} from '../domain/arenaSystem'

/* ── 對手清單型別 ── */
export interface ArenaOpponent {
  playerId: string
  rank: number
  displayName: string
  isNPC: boolean
  power: number
}

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
  opponents: ArenaOpponent[]
  myRank: number
  myPower: number
  challengesLeft: number
  highestRank: number
  refreshesLeft: number
}

const ARENA_DAILY_CHALLENGES_CONST = 5

export async function getArenaRankings(): Promise<ArenaRankingsResult> {
  try {
    const result = await callApi<{
      rankings: ArenaEntry[]
      opponents: ArenaOpponent[]
      myRank: number
      myPower: number
      challengesLeft: number
      highestRank: number
      refreshesLeft: number
    }>('arena-get-rankings')
    if (result.success) {
      const rankings = result.rankings ?? []
      const opponents = result.opponents ?? []
      const myRank = result.myRank ?? ARENA_MAX_RANK
      const myPower = result.myPower ?? 0
      const challengesLeft = result.challengesLeft ?? ARENA_DAILY_CHALLENGES_CONST
      const highestRank = result.highestRank ?? ARENA_MAX_RANK
      const refreshesLeft = result.refreshesLeft ?? ARENA_DAILY_REFRESHES

      cachedRankings = rankings
      cachedMyRank = myRank
      cachedChallengesLeft = challengesLeft
      cachedHighestRank = highestRank

      return { rankings, opponents, myRank, myPower, challengesLeft, highestRank, refreshesLeft }
    }
  } catch {
    // 降級到離線 NPC 模式
  }

  return getOfflineRankings()
}

function getOfflineRankings(): ArenaRankingsResult {
  const rankings: ArenaEntry[] = []
  for (let r = 1; r <= 10; r++) {
    rankings.push(generateNPCForRank(r))
  }
  const myRank = cachedMyRank ?? ARENA_MAX_RANK
  // 離線時用前幾名 NPC 作為對手
  const opponents: ArenaOpponent[] = []
  for (let r = Math.max(1, myRank - 3); r < myRank && r >= 1; r++) {
    const npc = generateNPCForRank(r)
    opponents.push({ playerId: npc.playerId, rank: npc.rank, displayName: npc.displayName, isNPC: true, power: npc.power })
  }
  return {
    rankings,
    opponents,
    myRank,
    myPower: 0,
    challengesLeft: cachedChallengesLeft ?? ARENA_DAILY_CHALLENGES_CONST,
    highestRank: cachedHighestRank,
    refreshesLeft: ARENA_DAILY_REFRESHES,
  }
}

/* 
   挑戰
    */

export interface ArenaChallengeResponse {
  success: boolean
  targetRank?: number
  defenderData?: {
    displayName: string
    heroes: unknown[]
    power: number
    isNPC: boolean
  }
  error?: string
  rankChanged?: boolean
  opponents?: ArenaOpponent[]
}

export async function startArenaChallenge(targetUserId: string): Promise<ArenaChallengeResponse> {
  try {
    const result = await callApi<{
      targetRank: number
      defenderData: ArenaChallengeResponse['defenderData']
      opponents?: ArenaOpponent[]
    }>('arena-challenge-start', { targetUserId })
    if (result.success) {
      return { success: true, targetRank: result.targetRank, defenderData: result.defenderData }
    }
    // 排名變動 → 回傳新對手清單
    if (result.error === 'rank_changed') {
      return {
        success: false,
        error: 'rank_changed',
        rankChanged: true,
        opponents: result.opponents ?? [],
      }
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
  opponents?: ArenaOpponent[]
  error?: string
}> {
  try {
    const result = await callApi<{
      newRank: number
      rewards: ArenaReward
      milestoneReward: ArenaReward | null
      challengesLeft: number
      currencies?: { gold?: number; diamond?: number; exp?: number }
      opponents?: ArenaOpponent[]
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
        opponents: result.opponents,
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

/* ── 刷新對手清單 ── */

export async function refreshArenaOpponents(): Promise<{
  success: boolean
  opponents?: ArenaOpponent[]
  refreshesLeft?: number
  error?: string
}> {
  try {
    const result = await callApi<{
      opponents: ArenaOpponent[]
      refreshesLeft: number
    }>('arena-refresh-opponents')
    if (result.success) {
      return { success: true, opponents: result.opponents ?? [], refreshesLeft: result.refreshesLeft ?? 0 }
    }
    return { success: false, error: result.error }
  } catch {
    return { success: false, error: 'network_error' }
  }
}
