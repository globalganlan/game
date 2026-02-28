/**
 * stageSystem 進階測試 — 關卡配置、Boss、PvP、每日副本、推進
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getStoryStageConfig,
  getNextStageId,
  getDailyDungeonConfig,
  getDailyDungeonDisplayName,
  getTodayDungeons,
  calculateStarRating,
  getBossConfig,
  getBossEnemies,
  getBossReward,
  getPvPOpponents,
  getPvPReward,
  isFirstClear,
  MAX_CHAPTER,
  STAGES_PER_CHAPTER,
  BOSS_CONFIGS,
  DAILY_DUNGEONS,
} from '../stageSystem'

describe('stageSystem - 進階測試', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  /* ═══════ getStoryStageConfig ═══════ */

  describe('getStoryStageConfig', () => {
    it('1-1 產生有效配置', () => {
      const config = getStoryStageConfig('1-1')
      expect(config.stageId).toBe('1-1')
      expect(config.chapter).toBe(1)
      expect(config.stage).toBe(1)
      expect(config.enemies.length).toBeGreaterThanOrEqual(2)
      expect(config.enemies.length).toBeLessThanOrEqual(6)
      expect(config.recommendedLevel).toBeGreaterThan(0)
      expect(config.rewards.exp).toBeGreaterThan(0)
      expect(config.rewards.gold).toBeGreaterThan(0)
    })

    it('同一關卡每次回傳相同結果（seeded PRNG）', () => {
      const result1 = getStoryStageConfig('2-5')
      const result2 = getStoryStageConfig('2-5')
      expect(result1.enemies.length).toBe(result2.enemies.length)
      expect(result1.enemies.map(e => e.heroId)).toEqual(result2.enemies.map(e => e.heroId))
      expect(result1.recommendedLevel).toBe(result2.recommendedLevel)
    })

    it('不同關卡產生不同配置', () => {
      const config1 = getStoryStageConfig('1-1')
      const config2 = getStoryStageConfig('3-8')
      // 後面的關卡更強
      expect(config2.recommendedLevel).toBeGreaterThan(config1.recommendedLevel)
    })

    it('每章最後一關（X-8）給鑽石', () => {
      for (let ch = 1; ch <= MAX_CHAPTER; ch++) {
        const config = getStoryStageConfig(`${ch}-8`)
        expect(config.rewards.diamond).toBeGreaterThan(0)
      }
    })

    it('非最後一關不給鑽石', () => {
      const config = getStoryStageConfig('1-3')
      expect(config.rewards.diamond).toBe(0)
    })

    it('首通獎勵包含額外鑽石', () => {
      const config = getStoryStageConfig('1-1')
      expect(config.firstClearRewards).toBeDefined()
      expect(config.firstClearRewards!.diamond).toBeGreaterThan(0)
    })

    it('敵人數量不超過 6', () => {
      for (let ch = 1; ch <= MAX_CHAPTER; ch++) {
        for (let st = 1; st <= STAGES_PER_CHAPTER; st++) {
          const config = getStoryStageConfig(`${ch}-${st}`)
          expect(config.enemies.length).toBeLessThanOrEqual(6)
        }
      }
    })

    it('難度倍率隨關卡遞增', () => {
      const early = getStoryStageConfig('1-1')
      const late = getStoryStageConfig('3-8')
      const earlyHpMult = early.enemies[0].hpMultiplier
      const lateHpMult = late.enemies[0].hpMultiplier
      expect(lateHpMult).toBeGreaterThan(earlyHpMult)
    })
  })

  /* ═══════ getNextStageId ═══════ */

  describe('getNextStageId', () => {
    it('1-1 → 1-2', () => {
      expect(getNextStageId('1-1')).toBe('1-2')
    })

    it('1-8 → 2-1（跨章）', () => {
      expect(getNextStageId('1-8')).toBe('2-1')
    })

    it('2-8 → 3-1', () => {
      expect(getNextStageId('2-8')).toBe('3-1')
    })

    it('3-8 → null（全部通關）', () => {
      expect(getNextStageId('3-8')).toBeNull()
    })

    it('連續推進覆蓋所有關卡', () => {
      let current: string | null = '1-1'
      let count = 0
      while (current) {
        count++
        current = getNextStageId(current)
        if (count > 100) break // 安全上限
      }
      expect(count).toBe(MAX_CHAPTER * STAGES_PER_CHAPTER) // 24 關
    })
  })

  /* ═══════ getDailyDungeonConfig ═══════ */

  describe('getDailyDungeonConfig', () => {
    it('有效 ID 回傳配置', () => {
      const config = getDailyDungeonConfig('power_trial_easy')
      expect(config).not.toBeNull()
      expect(config!.dungeon.dungeonId).toBe('power_trial')
      expect(config!.difficulty.tier).toBe('easy')
    })

    it('無效 ID 回傳 null', () => {
      expect(getDailyDungeonConfig('nonexistent_hard')).toBeNull()
    })

    it('各難度都能查到', () => {
      for (const dungeon of DAILY_DUNGEONS) {
        for (const diff of dungeon.difficulties) {
          const id = `${dungeon.dungeonId}_${diff.tier}`
          const config = getDailyDungeonConfig(id)
          expect(config).not.toBeNull()
          expect(config!.difficulty.tier).toBe(diff.tier)
        }
      }
    })
  })

  /* ═══════ getDailyDungeonDisplayName ═══════ */

  describe('getDailyDungeonDisplayName', () => {
    it('有效 ID 回傳中文名', () => {
      const name = getDailyDungeonDisplayName('power_trial_easy')
      expect(name).toContain(' - ')
      expect(name).toContain('簡單')
    })

    it('無效 ID 回傳原始 stageId', () => {
      expect(getDailyDungeonDisplayName('invalid_id')).toBe('invalid_id')
    })

    it('hard 難度顯示困難', () => {
      const name = getDailyDungeonDisplayName('power_trial_hard')
      expect(name).toContain('困難')
    })
  })

  /* ═══════ getTodayDungeons ═══════ */

  describe('getTodayDungeons', () => {
    it('週日全開', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-05T12:00:00')) // Sunday
      const dungeons = getTodayDungeons()
      expect(dungeons.length).toBe(DAILY_DUNGEONS.length)
      vi.useRealTimers()
    })

    it('平日回傳子集', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-06T12:00:00')) // Monday
      const dungeons = getTodayDungeons()
      expect(dungeons.length).toBeLessThanOrEqual(DAILY_DUNGEONS.length)
      expect(dungeons.length).toBeGreaterThan(0) // 每天至少有一個
      vi.useRealTimers()
    })
  })

  /* ═══════ Boss 系統 ═══════ */

  describe('Boss 系統', () => {
    it('getBossConfig 有效 bossId', () => {
      const config = getBossConfig('boss_1')
      expect(config).not.toBeNull()
      expect(config!.name).toBe('腐化巨獸')
      expect(config!.hp).toBeGreaterThan(0)
    })

    it('getBossConfig 無效 bossId → null', () => {
      expect(getBossConfig('boss_999')).toBeNull()
    })

    it('所有 BOSS_CONFIGS 都能查到', () => {
      for (const boss of BOSS_CONFIGS) {
        expect(getBossConfig(boss.bossId)).not.toBeNull()
      }
    })

    it('getBossEnemies 有效 bossId → 單一敵人', () => {
      const enemies = getBossEnemies('boss_1')
      expect(enemies).toHaveLength(1)
      expect(enemies[0].slot).toBe(1)
      expect(enemies[0].hpMultiplier).toBeGreaterThan(1)
    })

    it('getBossEnemies 無效 bossId → 空陣列', () => {
      expect(getBossEnemies('boss_999')).toHaveLength(0)
    })

    it('getBossReward S 級最高獎勵', () => {
      const boss = BOSS_CONFIGS[0]
      const reward = getBossReward(boss.bossId, boss.damageThresholds.S)
      expect(reward.diamond).toBe(100)
      expect(reward.exp).toBe(600)
    })

    it('getBossReward A 級獎勵', () => {
      const boss = BOSS_CONFIGS[0]
      const reward = getBossReward(boss.bossId, boss.damageThresholds.A)
      expect(reward.diamond).toBe(50)
    })

    it('getBossReward B 級獎勵', () => {
      const boss = BOSS_CONFIGS[0]
      const reward = getBossReward(boss.bossId, boss.damageThresholds.B)
      expect(reward.diamond).toBe(20)
    })

    it('getBossReward C 級（低於 B 門檻）', () => {
      const reward = getBossReward('boss_1', 100)
      expect(reward.diamond).toBe(0)
    })

    it('getBossReward 無效 bossId → 空獎勵', () => {
      const reward = getBossReward('boss_999', 9999)
      expect(reward.exp).toBe(0)
      expect(reward.gold).toBe(0)
    })
  })

  /* ═══════ PvP ═══════ */

  describe('PvP', () => {
    it('回傳 3 位對手', () => {
      const opponents = getPvPOpponents({ chapter: 2, stage: 1 })
      expect(opponents).toHaveLength(3)
    })

    it('每位對手有名稱和敵人陣容', () => {
      const opponents = getPvPOpponents({ chapter: 1, stage: 4 })
      for (const opp of opponents) {
        expect(opp.name.length).toBeGreaterThan(0)
        expect(opp.enemies.length).toBeGreaterThanOrEqual(3)
        expect(opp.power).toBeGreaterThan(0)
      }
    })

    it('同日同進度 → 相同對手（seeded）', () => {
      const opp1 = getPvPOpponents({ chapter: 1, stage: 1 })
      const opp2 = getPvPOpponents({ chapter: 1, stage: 1 })
      expect(opp1.map(o => o.name)).toEqual(opp2.map(o => o.name))
    })

    it('不同進度 → 不同對手', () => {
      const opp1 = getPvPOpponents({ chapter: 1, stage: 1 })
      const opp2 = getPvPOpponents({ chapter: 3, stage: 8 })
      // 不一定名字不同，但戰力不同
      expect(opp2[0].power).not.toBe(opp1[0].power)
    })

    it('getPvPReward 結構正確', () => {
      const reward = getPvPReward(10)
      expect(reward.exp).toBeGreaterThan(0)
      expect(reward.gold).toBeGreaterThan(0)
      expect(reward.diamond).toBe(10)
      expect(reward.items!.length).toBeGreaterThan(0)
      expect(reward.items![0].itemId).toBe('pvp_coin')
    })

    it('getPvPReward 進度越高獎勵越多', () => {
      const low = getPvPReward(1)
      const high = getPvPReward(20)
      expect(high.exp).toBeGreaterThan(low.exp)
      expect(high.gold).toBeGreaterThan(low.gold)
    })
  })

  /* ═══════ isFirstClear ═══════ */

  describe('isFirstClear', () => {
    it('關卡 >= 進度 → true', () => {
      expect(isFirstClear('1-5', { chapter: 1, stage: 5 })).toBe(true)
      expect(isFirstClear('2-1', { chapter: 1, stage: 8 })).toBe(true)
    })

    it('關卡 < 進度 → false', () => {
      expect(isFirstClear('1-1', { chapter: 2, stage: 1 })).toBe(false)
      expect(isFirstClear('1-8', { chapter: 2, stage: 1 })).toBe(false)
    })

    it('1-1 進度 1-1 → true（首次就是首通）', () => {
      expect(isFirstClear('1-1', { chapter: 1, stage: 1 })).toBe(true)
    })
  })

  /* ═══════ calculateStarRating 邊界 ═══════ */

  describe('calculateStarRating 邊界', () => {
    it('全滅 → 1 星', () => {
      expect(calculateStarRating(3, 0)).toBe(1)
    })

    it('全存活 → 3 星', () => {
      expect(calculateStarRating(3, 3)).toBe(3)
    })

    it('1 人全存活 → 3 星', () => {
      expect(calculateStarRating(1, 1)).toBe(3)
    })

    it('6 人存活 4 → 2 星', () => {
      // 4/6 = 66.7% → 2 星
      expect(calculateStarRating(6, 4)).toBe(2)
    })
  })

  /* ═══════ 常數一致性 ═══════ */

  describe('常數一致性', () => {
    it('MAX_CHAPTER × STAGES_PER_CHAPTER = 24', () => {
      expect(MAX_CHAPTER * STAGES_PER_CHAPTER).toBe(24)
    })

    it('BOSS_CONFIGS 有 3 個 Boss', () => {
      expect(BOSS_CONFIGS).toHaveLength(3)
    })

    it('每個 Boss 的 S > A > B > C 門檻', () => {
      for (const boss of BOSS_CONFIGS) {
        expect(boss.damageThresholds.S).toBeGreaterThan(boss.damageThresholds.A)
        expect(boss.damageThresholds.A).toBeGreaterThan(boss.damageThresholds.B)
        expect(boss.damageThresholds.B).toBeGreaterThan(boss.damageThresholds.C)
      }
    })
  })
})
