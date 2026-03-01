/**
 * arenaSystem — 競技場排名系統 Domain 邏輯
 *
 * NPC 生成、排名機制、獎勵計算
 *
 * 對應 Spec: specs/arena-pvp.md v0.1
 */

import { createSeededRng } from './seededRng'

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

export const ARENA_MAX_RANK = 500
export const ARENA_DAILY_CHALLENGES = 5
export const ARENA_CHALLENGE_RANGE = 3

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface ArenaEntry {
  rank: number
  playerId: string
  displayName: string
  isNPC: boolean
  power: number
  defenseFormation?: string // JSON array
  lastUpdated?: string
}

export interface ArenaReward {
  diamond: number
  gold: number
  pvpCoin: number
  exp: number
}

export interface ArenaChallengeResult {
  success: boolean
  won: boolean
  newRank: number
  oldRank: number
  rewards: ArenaReward
  rankMilestoneReward?: ArenaReward | null
}

/* ════════════════════════════════════
   NPC 名稱池
   ════════════════════════════════════ */

const NPC_PREFIXES = ['暗影', '末日', '鐵血', '荒野', '幽靈', '狂暴', '冰霜', '烈焰', '鏽蝕', '黎明', '血月', '迷霧']
const NPC_SUFFIXES = ['獵人', '倖存者', '戰士', '指揮官', '護衛', '遊蕩者', '潛伏者', '收割者', '守望者', '流浪者']

/* ════════════════════════════════════
   NPC 生成
   ════════════════════════════════════ */

export function generateNPCForRank(rank: number): ArenaEntry {
  const rng = createSeededRng(rank * 31337)

  // NPC 強度隨排名遞增（rank 500 → ~500 CP, rank 1 → ~10,500 CP）
  const power = Math.floor(500 + (ARENA_MAX_RANK - rank) * 20)

  const prefIdx = Math.floor(rng() * NPC_PREFIXES.length)
  const sufIdx = Math.floor(rng() * NPC_SUFFIXES.length)
  const displayName = NPC_PREFIXES[prefIdx] + NPC_SUFFIXES[sufIdx]

  return {
    rank,
    playerId: `npc_${rank}`,
    displayName,
    isNPC: true,
    power,
  }
}

/* ════════════════════════════════════
   挑戰對象選取
   ════════════════════════════════════ */

export function getChallengeable(myRank: number): number[] {
  const targets: number[] = []
  for (let i = 1; i <= ARENA_CHALLENGE_RANGE; i++) {
    const targetRank = myRank - i
    if (targetRank >= 1) targets.push(targetRank)
  }
  return targets
}

/* ════════════════════════════════════
   排名交換
   ════════════════════════════════════ */

export function processArenaResult(
  challengerRank: number,
  defenderRank: number,
  challengerWon: boolean,
): { newChallengerRank: number; newDefenderRank: number } {
  if (!challengerWon) {
    return { newChallengerRank: challengerRank, newDefenderRank: defenderRank }
  }
  return {
    newChallengerRank: defenderRank,
    newDefenderRank: challengerRank,
  }
}

/* ════════════════════════════════════
   挑戰獎勵
   ════════════════════════════════════ */

export function getChallengeReward(won: boolean): ArenaReward {
  return won
    ? { diamond: 0, gold: 2000, pvpCoin: 5, exp: 150 }
    : { diamond: 0, gold: 500, pvpCoin: 1, exp: 50 }
}

/* ════════════════════════════════════
   排名提升里程碑獎勵
   ════════════════════════════════════ */

interface RankMilestone {
  rankThreshold: number
  reward: ArenaReward
}

const RANK_MILESTONES: RankMilestone[] = [
  { rankThreshold: 400, reward: { diamond: 20, gold: 5000, pvpCoin: 10, exp: 200 } },
  { rankThreshold: 300, reward: { diamond: 30, gold: 10000, pvpCoin: 20, exp: 400 } },
  { rankThreshold: 200, reward: { diamond: 50, gold: 20000, pvpCoin: 30, exp: 600 } },
  { rankThreshold: 100, reward: { diamond: 100, gold: 50000, pvpCoin: 50, exp: 1000 } },
  { rankThreshold: 50, reward: { diamond: 150, gold: 80000, pvpCoin: 80, exp: 1500 } },
  { rankThreshold: 20, reward: { diamond: 200, gold: 100000, pvpCoin: 100, exp: 2000 } },
  { rankThreshold: 10, reward: { diamond: 300, gold: 150000, pvpCoin: 150, exp: 3000 } },
  { rankThreshold: 1, reward: { diamond: 500, gold: 300000, pvpCoin: 300, exp: 5000 } },
]

export { RANK_MILESTONES }

/**
 * 檢查是否有新的排名里程碑獎勵
 * @param newRank 新排名
 * @param previousBest 之前最高（最好）排名
 */
export function checkRankMilestone(
  newRank: number,
  previousBest: number,
): RankMilestone | null {
  for (const m of RANK_MILESTONES) {
    if (newRank <= m.rankThreshold && previousBest > m.rankThreshold) {
      return m
    }
  }
  return null
}

/* ════════════════════════════════════
   每日排名獎勵
   ════════════════════════════════════ */

interface DailyRewardTier {
  minRank: number
  maxRank: number
  reward: ArenaReward
}

const DAILY_REWARD_TIERS: DailyRewardTier[] = [
  { minRank: 1, maxRank: 1, reward: { diamond: 100, gold: 30000, pvpCoin: 50, exp: 500 } },
  { minRank: 2, maxRank: 5, reward: { diamond: 80, gold: 25000, pvpCoin: 40, exp: 400 } },
  { minRank: 6, maxRank: 10, reward: { diamond: 60, gold: 20000, pvpCoin: 35, exp: 350 } },
  { minRank: 11, maxRank: 30, reward: { diamond: 40, gold: 15000, pvpCoin: 25, exp: 250 } },
  { minRank: 31, maxRank: 50, reward: { diamond: 30, gold: 10000, pvpCoin: 20, exp: 200 } },
  { minRank: 51, maxRank: 100, reward: { diamond: 20, gold: 8000, pvpCoin: 15, exp: 150 } },
  { minRank: 101, maxRank: 200, reward: { diamond: 15, gold: 5000, pvpCoin: 10, exp: 100 } },
  { minRank: 201, maxRank: 500, reward: { diamond: 10, gold: 3000, pvpCoin: 5, exp: 50 } },
]

export { DAILY_REWARD_TIERS }

export function getDailyReward(rank: number): ArenaReward {
  for (const tier of DAILY_REWARD_TIERS) {
    if (rank >= tier.minRank && rank <= tier.maxRank) return tier.reward
  }
  return { diamond: 10, gold: 3000, pvpCoin: 5, exp: 50 }
}

/* ════════════════════════════════════
   賽季結算獎勵
   ════════════════════════════════════ */

const SEASON_REWARD_TIERS: DailyRewardTier[] = [
  { minRank: 1, maxRank: 1, reward: { diamond: 500, gold: 100000, pvpCoin: 200, exp: 2000 } },
  { minRank: 2, maxRank: 5, reward: { diamond: 300, gold: 60000, pvpCoin: 150, exp: 1500 } },
  { minRank: 6, maxRank: 10, reward: { diamond: 200, gold: 40000, pvpCoin: 100, exp: 1200 } },
  { minRank: 11, maxRank: 30, reward: { diamond: 100, gold: 20000, pvpCoin: 60, exp: 800 } },
  { minRank: 31, maxRank: 50, reward: { diamond: 60, gold: 10000, pvpCoin: 40, exp: 600 } },
  { minRank: 51, maxRank: 100, reward: { diamond: 40, gold: 5000, pvpCoin: 25, exp: 400 } },
  { minRank: 101, maxRank: 200, reward: { diamond: 25, gold: 3000, pvpCoin: 15, exp: 250 } },
  { minRank: 201, maxRank: 500, reward: { diamond: 15, gold: 2000, pvpCoin: 10, exp: 100 } },
]

export { SEASON_REWARD_TIERS }

export function getSeasonReward(rank: number): ArenaReward {
  for (const tier of SEASON_REWARD_TIERS) {
    if (rank >= tier.minRank && rank <= tier.maxRank) return tier.reward
  }
  return { diamond: 15, gold: 2000, pvpCoin: 10, exp: 100 }
}
