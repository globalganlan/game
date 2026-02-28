/**
 * optimisticQueue 進階測試 — generateOpId / getPendingOps / clearPendingOps / hasPendingOps
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  generateOpId,
  getPendingOps,
  clearPendingOps,
  hasPendingOps,
  getInflightCount,
  onQueueChange,
} from '../optimisticQueue'

/* ═══════ mock localStorage ═══════ */

let store: Record<string, string> = {}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ═══════ generateOpId ═══════ */

describe('optimisticQueue — generateOpId', () => {
  it('回傳以 op_ 開頭的字串', () => {
    const id = generateOpId()
    expect(id).toMatch(/^op_/)
  })

  it('每次不同', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateOpId()))
    expect(ids.size).toBe(50)
  })

  it('包含時間戳', () => {
    const id = generateOpId()
    // 格式: op_{timestamp}_{random}_{counter}
    const parts = id.split('_')
    const ts = Number(parts[1])
    expect(ts).toBeGreaterThan(1700000000000) // 2023 年後的時間戳
  })
})

/* ═══════ getPendingOps / clearPendingOps ═══════ */

describe('optimisticQueue — getPendingOps', () => {
  it('空狀態 → []', () => {
    expect(getPendingOps()).toEqual([])
  })

  it('有 pending ops 時能讀回', () => {
    const ops = [{
      opId: 'op_test_1',
      action: 'test',
      params: {},
      createdAt: new Date().toISOString(),
    }]
    store['globalganlan_pending_ops'] = JSON.stringify(ops)
    expect(getPendingOps()).toHaveLength(1)
    expect(getPendingOps()[0].opId).toBe('op_test_1')
  })

  it('過期的 ops 被過濾（>24h）', () => {
    const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString()
    const ops = [{
      opId: 'op_old',
      action: 'test',
      params: {},
      createdAt: old,
    }]
    store['globalganlan_pending_ops'] = JSON.stringify(ops)
    expect(getPendingOps()).toHaveLength(0)
  })

  it('JSON 損壞 → []', () => {
    store['globalganlan_pending_ops'] = '{broken json'
    expect(getPendingOps()).toEqual([])
  })
})

describe('optimisticQueue — clearPendingOps', () => {
  it('清除後 hasPendingOps → false', () => {
    const ops = [{
      opId: 'op_1',
      action: 'test',
      params: {},
      createdAt: new Date().toISOString(),
    }]
    store['globalganlan_pending_ops'] = JSON.stringify(ops)
    expect(hasPendingOps()).toBe(true)
    clearPendingOps()
    expect(hasPendingOps()).toBe(false)
  })
})

/* ═══════ hasPendingOps ═══════ */

describe('optimisticQueue — hasPendingOps', () => {
  it('空 → false', () => {
    expect(hasPendingOps()).toBe(false)
  })

  it('有新鮮 op → true', () => {
    store['globalganlan_pending_ops'] = JSON.stringify([{
      opId: 'op_x',
      action: 'foo',
      params: {},
      createdAt: new Date().toISOString(),
    }])
    expect(hasPendingOps()).toBe(true)
  })
})

/* ═══════ getInflightCount ═══════ */

describe('optimisticQueue — getInflightCount', () => {
  it('初始為 0', () => {
    expect(getInflightCount()).toBe(0)
  })
})

/* ═══════ onQueueChange 訂閱 ═══════ */

describe('optimisticQueue — onQueueChange', () => {
  it('回傳取消訂閱函式', () => {
    const fn = vi.fn()
    const unsub = onQueueChange(fn)
    expect(typeof unsub).toBe('function')
    unsub()
  })
})
