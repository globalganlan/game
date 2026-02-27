import { describe, it, expect } from 'vitest'
import {
  isModeUnlocked,
  calculateStarRating,
  getTowerFloorConfig,
  getTowerReward,
  DAILY_DUNGEONS,
  getAvailableDifficulties,
  rollDrops,
  mergeDrops,
  MODE_UNLOCK,
} from '../stageSystem'

/* ════════════════════════════════════
   模式解鎖
   ════════════════════════════════════ */
describe('stageSystem — isModeUnlocked', () => {
  it('tower 需 1-4: 剛好通過', () => {
    expect(isModeUnlocked('tower', { chapter: 1, stage: 4 })).toBe(true)
  })

  it('tower 需 1-4: 尚未到達', () => {
    expect(isModeUnlocked('tower', { chapter: 1, stage: 3 })).toBe(false)
  })

  it('daily 需 1-8', () => {
    expect(isModeUnlocked('daily', { chapter: 1, stage: 8 })).toBe(true)
    expect(isModeUnlocked('daily', { chapter: 1, stage: 7 })).toBe(false)
  })

  it('pvp 需 2-1', () => {
    expect(isModeUnlocked('pvp', { chapter: 2, stage: 1 })).toBe(true)
    // chapter 1, stage 8 = progress 8, pvp req = (2-1)*8+1 = 9 → not unlocked
    expect(isModeUnlocked('pvp', { chapter: 1, stage: 8 })).toBe(false)
  })

  it('boss 需 2-8', () => {
    expect(isModeUnlocked('boss', { chapter: 3, stage: 1 })).toBe(true)
    expect(isModeUnlocked('boss', { chapter: 2, stage: 7 })).toBe(false)
  })

  it('超過進度永遠解鎖', () => {
    expect(isModeUnlocked('tower', { chapter: 5, stage: 1 })).toBe(true)
    expect(isModeUnlocked('boss', { chapter: 10, stage: 1 })).toBe(true)
  })
})

/* ════════════════════════════════════
   星級評價
   ════════════════════════════════════ */
describe('stageSystem — calculateStarRating', () => {
  it('全員存活 → 3星', () => {
    expect(calculateStarRating(5, 5)).toBe(3)
  })

  it('死1人 → 2星', () => {
    expect(calculateStarRating(5, 4)).toBe(2)
  })

  it('死2人 → 2星', () => {
    expect(calculateStarRating(5, 3)).toBe(2)
  })

  it('死3人 → 1星', () => {
    expect(calculateStarRating(5, 2)).toBe(1)
  })

  it('只剩1人 → 1星', () => {
    expect(calculateStarRating(5, 1)).toBe(1)
  })
})

/* ════════════════════════════════════
   無盡爬塔
   ════════════════════════════════════ */
describe('stageSystem — getTowerFloorConfig', () => {
  it('同 floor 生成一致（seeded random）', () => {
    const a = getTowerFloorConfig(5)
    const b = getTowerFloorConfig(5)
    expect(a.enemies.length).toBe(b.enemies.length)
    expect(a.enemies[0].heroId).toBe(b.enemies[0].heroId)
  })

  it('非 Boss 層有 3~6 敵人', () => {
    const cfg = getTowerFloorConfig(3)
    expect(cfg.isBoss).toBe(false)
    expect(cfg.enemies.length).toBeGreaterThanOrEqual(3)
    expect(cfg.enemies.length).toBeLessThanOrEqual(6)
  })

  it('Boss 層（%10=0）只有 1 敵人', () => {
    const cfg = getTowerFloorConfig(10)
    expect(cfg.isBoss).toBe(true)
    expect(cfg.enemies.length).toBe(1)
    expect(cfg.enemies[0].hpMultiplier).toBeGreaterThan(1)
  })

  it('高樓層數值倍率更高', () => {
    const low = getTowerFloorConfig(1)
    const high = getTowerFloorConfig(50)
    expect(high.enemies[0].hpMultiplier).toBeGreaterThan(low.enemies[0].hpMultiplier)
  })
})

describe('stageSystem — getTowerReward', () => {
  it('Boss 層有鑽石獎勵', () => {
    const r = getTowerReward(10)
    expect(r.diamond).toBe(50)
  })

  it('非 Boss 層無鑽石', () => {
    const r = getTowerReward(7)
    expect(r.diamond).toBe(0)
  })

  it('金幣隨樓層增加', () => {
    expect(getTowerReward(50).gold).toBeGreaterThan(getTowerReward(1).gold)
  })
})

/* ════════════════════════════════════
   每日副本
   ════════════════════════════════════ */
describe('stageSystem — 每日副本', () => {
  it('DAILY_DUNGEONS 有 3 個', () => {
    expect(DAILY_DUNGEONS.length).toBe(3)
  })

  it('每個副本都有 difficulties', () => {
    for (const d of DAILY_DUNGEONS) {
      expect(d.difficulties.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('getAvailableDifficulties: 低章節只能打低難度', () => {
    const dungeon = DAILY_DUNGEONS[0]
    const easy = getAvailableDifficulties(dungeon, { chapter: 1, stage: 1 })
    const all = getAvailableDifficulties(dungeon, { chapter: 10, stage: 1 })
    expect(easy.length).toBeLessThanOrEqual(all.length)
  })
})

/* ════════════════════════════════════
   掉落與合併
   ════════════════════════════════════ */
describe('stageSystem — rollDrops / mergeDrops', () => {
  it('dropRate=1 → 必定掉落', () => {
    const reward = {
      exp: 100, gold: 200, diamond: 0,
      items: [{ itemId: 'a', quantity: 1, dropRate: 1.0 }],
    }
    const drops = rollDrops(reward, () => 0)
    expect(drops.length).toBe(1)
    expect(drops[0].itemId).toBe('a')
  })

  it('dropRate=0 → 不掉落', () => {
    const reward = {
      exp: 100, gold: 200, diamond: 0,
      items: [{ itemId: 'a', quantity: 1, dropRate: 0 }],
    }
    const drops = rollDrops(reward, () => 1) // rng > dropRate
    expect(drops.length).toBe(0)
  })

  it('mergeDrops 合併同 itemId', () => {
    const merged = mergeDrops([
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 3 },
      { itemId: 'a', quantity: 5 },
    ])
    const mapById = Object.fromEntries(merged.map(d => [d.itemId, d.quantity]))
    expect(mapById['a']).toBe(7)
    expect(mapById['b']).toBe(3)
  })

  it('mergeDrops 空陣列 → 空', () => {
    expect(mergeDrops([])).toEqual([])
  })
})
