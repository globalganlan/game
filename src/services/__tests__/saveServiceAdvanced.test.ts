/**
 * saveService 進階測試 — 純函式 getTimerYield / getAccumulatedResources
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getTimerYield, getAccumulatedResources } from '../saveService'

describe('saveService — getTimerYield', () => {
  it('stageId "1-1" → 最低產出', () => {
    const y = getTimerYield('1-1')
    // progress = (1-1)*8 + 1 = 1
    expect(y.goldPerHour).toBe(100 + 1 * 50) // 150
    expect(y.expItemsPerHour).toBe(Math.max(1, Math.floor(1 / 3))) // 1
  })

  it('stageId "1-8" → chapter 1 最後一關', () => {
    const y = getTimerYield('1-8')
    // progress = (1-1)*8 + 8 = 8
    expect(y.goldPerHour).toBe(100 + 8 * 50) // 500
    expect(y.expItemsPerHour).toBe(Math.floor(8 / 3)) // 2
  })

  it('stageId "3-5" → 中段進度', () => {
    const y = getTimerYield('3-5')
    // progress = (3-1)*8 + 5 = 21
    expect(y.goldPerHour).toBe(100 + 21 * 50) // 1150
    expect(y.expItemsPerHour).toBe(Math.floor(21 / 3)) // 7
  })

  it('stageId "3-8" → 最高進度', () => {
    const y = getTimerYield('3-8')
    // progress = (3-1)*8 + 8 = 24
    expect(y.goldPerHour).toBe(100 + 24 * 50) // 1300
    expect(y.expItemsPerHour).toBe(Math.floor(24 / 3)) // 8
  })

  it('空字串 → 預設 ch=1, st=1', () => {
    const y = getTimerYield('')
    // parts[0] = NaN → 1, parts[1] = undefined → 1, progress = 1
    expect(y.goldPerHour).toBe(150)
  })

  it('goldPerHour 隨進度遞增', () => {
    const y1 = getTimerYield('1-1')
    const y2 = getTimerYield('2-1')
    const y3 = getTimerYield('3-1')
    expect(y2.goldPerHour).toBeGreaterThan(y1.goldPerHour)
    expect(y3.goldPerHour).toBeGreaterThan(y2.goldPerHour)
  })
})

describe('saveService — getAccumulatedResources', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('1 小時累積 (stageId = "1-1")', () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
    const result = getAccumulatedResources('1-1', oneHourAgo)
    expect(result.gold).toBe(150) // 150 gold/h × 1h
    expect(result.expItems).toBe(1) // 1 exp/h × 1h (max(1, 0))
    expect(result.hoursElapsed).toBeCloseTo(1, 0)
  })

  it('3 小時累積 (stageId = "2-5")', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString()
    const result = getAccumulatedResources('2-5', threeHoursAgo)
    const { goldPerHour, expItemsPerHour } = getTimerYield('2-5')
    expect(result.gold).toBe(Math.floor(goldPerHour * 3))
    expect(result.expItems).toBe(Math.floor(expItemsPerHour * 3))
  })

  it('超過 maxHours=24 上限', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
    const result = getAccumulatedResources('1-1', twoDaysAgo, 24)
    // 被限制在 24 小時
    const { goldPerHour } = getTimerYield('1-1')
    expect(result.gold).toBe(Math.floor(goldPerHour * 24))
    expect(result.hoursElapsed).toBeCloseTo(24, 0)
  })

  it('剛領取 → 累積 0', () => {
    const now = new Date().toISOString()
    const result = getAccumulatedResources('1-1', now)
    expect(result.gold).toBe(0)
    expect(result.expItems).toBe(0)
    expect(result.hoursElapsed).toBe(0)
  })

  it('自訂 maxHours=8', () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 3600 * 1000).toISOString()
    const result = getAccumulatedResources('1-1', tenHoursAgo, 8)
    const { goldPerHour } = getTimerYield('1-1')
    expect(result.gold).toBe(Math.floor(goldPerHour * 8))
  })

  it('未來時間 → 不產生負值', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    const result = getAccumulatedResources('1-1', future)
    expect(result.gold).toBe(0)
    expect(result.expItems).toBe(0)
    expect(result.hoursElapsed).toBe(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})
