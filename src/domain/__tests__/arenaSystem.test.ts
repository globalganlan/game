/**
 * arenaSystem.test.ts — 競技場排名系統單元測試
 *
 * 對照 specs/arena-pvp.md v0.3 驗證所有公式、常數、資料表、邊界值
 */

import { describe, it, expect } from 'vitest'
import {
  ARENA_MAX_RANK,
  ARENA_DAILY_CHALLENGES,
  ARENA_CHALLENGE_RANGE,
  RANK_MILESTONES,
  DAILY_REWARD_TIERS,
  SEASON_REWARD_TIERS,
  generateNPCForRank,
  getChallengeable,
  processArenaResult,
  getChallengeReward,
  checkRankMilestone,
  getDailyReward,
  getSeasonReward,
} from '../arenaSystem'

/* ════════════════════════════════════
   一、常數驗證（AR-16）
   ════════════════════════════════════ */

describe('Spec AR-16: 競技場常數', () => {
  it('排名上限 = 500', () => expect(ARENA_MAX_RANK).toBe(500))
  it('每日挑戰次數 = 5', () => expect(ARENA_DAILY_CHALLENGES).toBe(5))
  it('挑戰範圍 = 3', () => expect(ARENA_CHALLENGE_RANGE).toBe(3))
})

/* ════════════════════════════════════
   二、NPC 生成（AR-1, AR-2）
   ════════════════════════════════════ */

describe('Spec AR-1: NPC 戰力公式', () => {
  it('rank 500 → power = 500', () => {
    const npc = generateNPCForRank(500)
    expect(npc.power).toBe(500)
  })

  it('rank 1 → power = floor(500 + (500-1)*20) = 10480', () => {
    const npc = generateNPCForRank(1)
    // Spec 公式: 500 + (ARENA_MAX_RANK - rank) * 20
    // = 500 + 499 * 20 = 10480
    // ⚠️ Spec 原文寫 10500 是筆誤（用了 500*20 而非 499*20）
    expect(npc.power).toBe(10480)
  })

  it('rank 250 → power = floor(500 + 250*20) = 5500', () => {
    const npc = generateNPCForRank(250)
    expect(npc.power).toBe(5500)
  })

  it('NPC 結構完整', () => {
    const npc = generateNPCForRank(100)
    expect(npc.rank).toBe(100)
    expect(npc.playerId).toBe('npc_100')
    expect(npc.isNPC).toBe(true)
    expect(npc.displayName).toBeDefined()
    expect(npc.displayName.length).toBeGreaterThan(0)
  })
})

describe('Spec AR-2: NPC 確定性（seeded RNG）', () => {
  it('相同 rank 多次呼叫產生相同結果', () => {
    const a = generateNPCForRank(42)
    const b = generateNPCForRank(42)
    expect(a.displayName).toBe(b.displayName)
    expect(a.power).toBe(b.power)
    expect(a.playerId).toBe(b.playerId)
  })

  it('不同 rank 產生不同名稱（大多數情況）', () => {
    const names = new Set<string>()
    for (let r = 1; r <= 50; r++) {
      names.add(generateNPCForRank(r).displayName)
    }
    // 50 個 rank 至少應有 5 種不同名稱（prefix*suffix 組合數 = 120）
    expect(names.size).toBeGreaterThan(5)
  })
})

/* ════════════════════════════════════
   三、挑戰對象選取（AR-3 ~ AR-5）
   ════════════════════════════════════ */

describe('Spec AR-3: getChallengeable 正常範圍', () => {
  it('rank 50 → [49, 48, 47]', () => {
    expect(getChallengeable(50)).toEqual([49, 48, 47])
  })

  it('rank 100 → [99, 98, 97]', () => {
    expect(getChallengeable(100)).toEqual([99, 98, 97])
  })
})

describe('Spec AR-4: rank 1 邊界', () => {
  it('rank 1 → []（無法向上挑戰）', () => {
    expect(getChallengeable(1)).toEqual([])
  })
})

describe('Spec AR-5: rank 2 邊界', () => {
  it('rank 2 → [1]', () => {
    expect(getChallengeable(2)).toEqual([1])
  })
})

describe('getChallengeable 其他邊界', () => {
  it('rank 3 → [2, 1]', () => {
    expect(getChallengeable(3)).toEqual([2, 1])
  })

  it('rank 500（最低）→ [499, 498, 497]', () => {
    expect(getChallengeable(500)).toEqual([499, 498, 497])
  })
})

/* ════════════════════════════════════
   四、排名交換（AR-6, AR-7）
   ════════════════════════════════════ */

describe('Spec AR-6: 勝利排名交換', () => {
  it('challenger rank 50, defender rank 47, 勝 → challenger 取得 47, defender 移至 50', () => {
    const result = processArenaResult(50, 47, true)
    expect(result.newChallengerRank).toBe(47)
    expect(result.newDefenderRank).toBe(50)
  })
})

describe('Spec AR-7: 敗北排名不變', () => {
  it('challenger rank 50, defender rank 47, 敗 → 排名不變', () => {
    const result = processArenaResult(50, 47, false)
    expect(result.newChallengerRank).toBe(50)
    expect(result.newDefenderRank).toBe(47)
  })
})

/* ════════════════════════════════════
   五、挑戰獎勵（AR-8）
   ════════════════════════════════════ */

describe('Spec AR-8: getChallengeReward', () => {
  it('勝利 → gold:2000, pvpCoin:5, exp:150', () => {
    const r = getChallengeReward(true)
    expect(r.gold).toBe(2000)
    expect(r.pvpCoin).toBe(5)
    expect(r.exp).toBe(150)
  })

  it('敗北 → gold:500, pvpCoin:1, exp:50', () => {
    const r = getChallengeReward(false)
    expect(r.gold).toBe(500)
    expect(r.pvpCoin).toBe(1)
    expect(r.exp).toBe(50)
  })
})

/* ════════════════════════════════════
   六、排名里程碑獎勵（AR-9 ~ AR-11）
   ════════════════════════════════════ */

describe('Spec AR-9: RANK_MILESTONES 資料表完整', () => {
  it('共 8 個里程碑', () => {
    expect(RANK_MILESTONES.length).toBe(8)
  })

  it('里程碑門檻對照 Spec', () => {
    const expectedThresholds = [400, 300, 200, 100, 50, 20, 10, 1]
    const actual = RANK_MILESTONES.map(m => m.rankThreshold)
    expect(actual).toEqual(expectedThresholds)
  })

  it('前 400 名獎勵 = diamond:20, gold:5000, pvpCoin:10, exp:200', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 400)!
    expect(m.reward).toEqual({ diamond: 20, gold: 5000, pvpCoin: 10, exp: 200 })
  })

  it('第 1 名獎勵 = diamond:500, gold:300000, pvpCoin:300, exp:5000', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 1)!
    expect(m.reward).toEqual({ diamond: 500, gold: 300000, pvpCoin: 300, exp: 5000 })
  })

  it('前 100 名獎勵 = diamond:100, gold:50000, pvpCoin:50, exp:1000', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 100)!
    expect(m.reward).toEqual({ diamond: 100, gold: 50000, pvpCoin: 50, exp: 1000 })
  })

  it('前 50 名獎勵 = diamond:150, gold:80000, pvpCoin:80, exp:1500', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 50)!
    expect(m.reward).toEqual({ diamond: 150, gold: 80000, pvpCoin: 80, exp: 1500 })
  })

  it('前 20 名獎勵 = diamond:200, gold:100000, pvpCoin:100, exp:2000', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 20)!
    expect(m.reward).toEqual({ diamond: 200, gold: 100000, pvpCoin: 100, exp: 2000 })
  })

  it('前 10 名獎勵 = diamond:300, gold:150000, pvpCoin:150, exp:3000', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 10)!
    expect(m.reward).toEqual({ diamond: 300, gold: 150000, pvpCoin: 150, exp: 3000 })
  })

  it('前 300 名獎勵 = diamond:30, gold:10000, pvpCoin:20, exp:400', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 300)!
    expect(m.reward).toEqual({ diamond: 30, gold: 10000, pvpCoin: 20, exp: 400 })
  })

  it('前 200 名獎勵 = diamond:50, gold:20000, pvpCoin:30, exp:600', () => {
    const m = RANK_MILESTONES.find(m => m.rankThreshold === 200)!
    expect(m.reward).toEqual({ diamond: 50, gold: 20000, pvpCoin: 30, exp: 600 })
  })
})

describe('Spec AR-10: checkRankMilestone 跨越門檻', () => {
  it('從 500 提升到 100 → 獲得前 400 名獎勵（第一個符合的）', () => {
    const result = checkRankMilestone(100, 500)
    expect(result).not.toBeNull()
    expect(result!.rankThreshold).toBe(400)
    expect(result!.reward).toEqual({ diamond: 20, gold: 5000, pvpCoin: 10, exp: 200 })
  })
})

describe('Spec AR-11: checkRankMilestone 未跨越門檻', () => {
  it('newRank=100, previousBest=100 → null（沒有新門檻）', () => {
    expect(checkRankMilestone(100, 100)).toBeNull()
  })

  it('newRank=450, previousBest=480 → null（還沒到前 400）', () => {
    expect(checkRankMilestone(450, 480)).toBeNull()
  })
})

describe('checkRankMilestone 精準門檻', () => {
  it('正好到達門檻 400 → 觸發', () => {
    expect(checkRankMilestone(400, 401)).not.toBeNull()
  })

  it('從 401 到 400 → 觸發前 400 名', () => {
    const r = checkRankMilestone(400, 401)!
    expect(r.rankThreshold).toBe(400)
  })

  it('從 2 到 1 → 觸發第 1 名', () => {
    const r = checkRankMilestone(1, 2)!
    expect(r.rankThreshold).toBe(1)
  })
})

/* ════════════════════════════════════
   七、每日排名獎勵（AR-12 ~ AR-14）
   ════════════════════════════════════ */

describe('Spec AR-12: DAILY_REWARD_TIERS 資料表', () => {
  it('共 8 個 tier', () => {
    expect(DAILY_REWARD_TIERS.length).toBe(8)
  })

  it('覆蓋 rank 1~500 無缺口', () => {
    for (let rank = 1; rank <= 500; rank++) {
      const found = DAILY_REWARD_TIERS.some(t => rank >= t.minRank && rank <= t.maxRank)
      expect(found).toBe(true)
    }
  })
})

describe('Spec AR-13: getDailyReward 精確數值', () => {
  it('rank 1 → diamond:100, gold:30000, pvpCoin:50, exp:500', () => {
    expect(getDailyReward(1)).toEqual({ diamond: 100, gold: 30000, pvpCoin: 50, exp: 500 })
  })

  it('rank 3 → diamond:80, gold:25000, pvpCoin:40, exp:400（2~5 tier）', () => {
    expect(getDailyReward(3)).toEqual({ diamond: 80, gold: 25000, pvpCoin: 40, exp: 400 })
  })

  it('rank 10 → diamond:60, gold:20000, pvpCoin:35, exp:350（6~10 tier）', () => {
    expect(getDailyReward(10)).toEqual({ diamond: 60, gold: 20000, pvpCoin: 35, exp: 350 })
  })

  it('rank 25 → diamond:40, gold:15000, pvpCoin:25, exp:250（11~30 tier）', () => {
    expect(getDailyReward(25)).toEqual({ diamond: 40, gold: 15000, pvpCoin: 25, exp: 250 })
  })

  it('rank 50 → diamond:30, gold:10000, pvpCoin:20, exp:200（31~50 tier）', () => {
    expect(getDailyReward(50)).toEqual({ diamond: 30, gold: 10000, pvpCoin: 20, exp: 200 })
  })

  it('rank 75 → diamond:20, gold:8000, pvpCoin:15, exp:150（51~100 tier）', () => {
    expect(getDailyReward(75)).toEqual({ diamond: 20, gold: 8000, pvpCoin: 15, exp: 150 })
  })

  it('rank 150 → diamond:15, gold:5000, pvpCoin:10, exp:100（101~200 tier）', () => {
    expect(getDailyReward(150)).toEqual({ diamond: 15, gold: 5000, pvpCoin: 10, exp: 100 })
  })

  it('rank 400 → diamond:10, gold:3000, pvpCoin:5, exp:50（201~500 tier）', () => {
    expect(getDailyReward(400)).toEqual({ diamond: 10, gold: 3000, pvpCoin: 5, exp: 50 })
  })
})

describe('Spec AR-14: getDailyReward 超出範圍', () => {
  it('rank 999 → fallback 最低 tier', () => {
    const r = getDailyReward(999)
    expect(r).toEqual({ diamond: 10, gold: 3000, pvpCoin: 5, exp: 50 })
  })
})

/* ════════════════════════════════════
   八、賽季結算獎勵（AR-15）
   ════════════════════════════════════ */

describe('Spec AR-15: SEASON_REWARD_TIERS 資料表', () => {
  it('共 8 個 tier', () => {
    expect(SEASON_REWARD_TIERS.length).toBe(8)
  })

  it('覆蓋 rank 1~500 無缺口', () => {
    for (let rank = 1; rank <= 500; rank++) {
      const found = SEASON_REWARD_TIERS.some(t => rank >= t.minRank && rank <= t.maxRank)
      expect(found).toBe(true)
    }
  })
})

describe('getSeasonReward 精確數值', () => {
  it('rank 1 → diamond:500, gold:100000, pvpCoin:200, exp:2000', () => {
    expect(getSeasonReward(1)).toEqual({ diamond: 500, gold: 100000, pvpCoin: 200, exp: 2000 })
  })

  it('rank 3 → diamond:300, gold:60000, pvpCoin:150, exp:1500', () => {
    expect(getSeasonReward(3)).toEqual({ diamond: 300, gold: 60000, pvpCoin: 150, exp: 1500 })
  })

  it('rank 7 → diamond:200, gold:40000, pvpCoin:100, exp:1200', () => {
    expect(getSeasonReward(7)).toEqual({ diamond: 200, gold: 40000, pvpCoin: 100, exp: 1200 })
  })

  it('rank 20 → diamond:100, gold:20000, pvpCoin:60, exp:800', () => {
    expect(getSeasonReward(20)).toEqual({ diamond: 100, gold: 20000, pvpCoin: 60, exp: 800 })
  })

  it('rank 45 → diamond:60, gold:10000, pvpCoin:40, exp:600', () => {
    expect(getSeasonReward(45)).toEqual({ diamond: 60, gold: 10000, pvpCoin: 40, exp: 600 })
  })

  it('rank 80 → diamond:40, gold:5000, pvpCoin:25, exp:400', () => {
    expect(getSeasonReward(80)).toEqual({ diamond: 40, gold: 5000, pvpCoin: 25, exp: 400 })
  })

  it('rank 150 → diamond:25, gold:3000, pvpCoin:15, exp:250', () => {
    expect(getSeasonReward(150)).toEqual({ diamond: 25, gold: 3000, pvpCoin: 15, exp: 250 })
  })

  it('rank 300 → diamond:15, gold:2000, pvpCoin:10, exp:100', () => {
    expect(getSeasonReward(300)).toEqual({ diamond: 15, gold: 2000, pvpCoin: 10, exp: 100 })
  })

  it('rank 999 → fallback 最低 tier', () => {
    expect(getSeasonReward(999)).toEqual({ diamond: 15, gold: 2000, pvpCoin: 10, exp: 100 })
  })
})

/* ════════════════════════════════════
   九、Spec vs 實作差異偵測
   ════════════════════════════════════ */

describe('Spec 差異修復驗證：挑戰獎勵已含 exp', () => {
  it('勝利獎勵含 exp:150（已修正）', () => {
    const win = getChallengeReward(true)
    expect(win).toHaveProperty('diamond')
    expect(win).toHaveProperty('exp')
    expect(win.exp).toBe(150)
  })

  it('敗北獎勵含 exp:50（已修正）', () => {
    const lose = getChallengeReward(false)
    expect(lose).toHaveProperty('diamond')
    expect(lose).toHaveProperty('exp')
    expect(lose.exp).toBe(50)
  })
})
