/**
 * authService 認證流程測試
 *
 * 用 mock 取代真實 API 呼叫 + 模擬 localStorage，
 * 驗證所有登入/登出/刷新情境中旗標（token、logged_out）的正確性。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock localStorage ──
const store: Record<string, string> = {}
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { for (const k in store) delete store[k] },
  get length() { return Object.keys(store).length },
  key: (i: number) => Object.keys(store)[i] ?? null,
}
vi.stubGlobal('localStorage', mockLocalStorage)

// ── Mock fetch（模擬 GAS API 回應）──
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function apiOk(extra: Record<string, unknown> = {}) {
  return { json: () => Promise.resolve({ success: true, playerId: 'P1', displayName: '測試者', isBound: false, ...extra }) }
}
function apiFail(error = 'invalid_token') {
  return { json: () => Promise.resolve({ success: false, error }) }
}

// ── 動態 import（讓每個 test 拿到乾淨的模組狀態）──
// 因為 authService 有 module-level state（currentAuth），我們用 resetModules
let authService: typeof import('../authService')

const TOKEN_KEY = 'globalganlan_guest_token'
const LOGOUT_KEY = 'globalganlan_logged_out'

beforeEach(async () => {
  mockLocalStorage.clear()
  mockFetch.mockReset()
  vi.resetModules()
  authService = await import('../authService')
})

describe('authService 登入流程', () => {
  // ─── autoLogin ───

  it('無 token 時 autoLogin 不登入', async () => {
    const state = await authService.autoLogin()
    expect(state.isLoggedIn).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('有 token 時 autoLogin 自動登入', async () => {
    localStorage.setItem(TOKEN_KEY, 'test-token')
    mockFetch.mockResolvedValueOnce(apiOk())

    const state = await authService.autoLogin()
    expect(state.isLoggedIn).toBe(true)
    expect(state.displayName).toBe('測試者')
  })

  it('有 token + logged_out 旗標時 autoLogin 不登入', async () => {
    localStorage.setItem(TOKEN_KEY, 'test-token')
    localStorage.setItem(LOGOUT_KEY, '1')

    const state = await authService.autoLogin()
    expect(state.isLoggedIn).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('autoLogin 成功後清除 logged_out 旗標', async () => {
    localStorage.setItem(TOKEN_KEY, 'test-token')
    localStorage.setItem(LOGOUT_KEY, '1')

    // 先 autoLogin（因為有旗標所以不登入）
    await authService.autoLogin()
    expect(localStorage.getItem(LOGOUT_KEY)).toBe('1')

    // 模擬手動點擊「訪客模式進入」清旗標
    mockFetch.mockResolvedValueOnce(apiOk())
    await authService.registerGuest()
    expect(localStorage.getItem(LOGOUT_KEY)).toBeNull()

    // 手動重置模組模擬「刷新頁面」
    vi.resetModules()
    const freshModule = await import('../authService')
    mockFetch.mockResolvedValueOnce(apiOk())
    const state = await freshModule.autoLogin()
    expect(state.isLoggedIn).toBe(true)
  })

  // ─── registerGuest ───

  it('registerGuest 清除 logged_out 旗標', async () => {
    localStorage.setItem(LOGOUT_KEY, '1')
    mockFetch.mockResolvedValueOnce(apiOk({ guestToken: 'new-token' }))

    const state = await authService.registerGuest()
    expect(state.isLoggedIn).toBe(true)
    expect(localStorage.getItem(LOGOUT_KEY)).toBeNull()
  })

  it('registerGuest 有舊 token 時複用同帳號', async () => {
    localStorage.setItem(TOKEN_KEY, 'old-token')
    mockFetch.mockResolvedValueOnce(apiOk())

    const state = await authService.registerGuest()
    expect(state.isLoggedIn).toBe(true)
    // token 未改變（複用舊帳號）
    expect(localStorage.getItem(TOKEN_KEY)).toBe('old-token')
  })

  it('registerGuest 舊 token 失效時建新帳號', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired-token')
    mockFetch
      .mockResolvedValueOnce(apiFail('invalid_token')) // login-guest 失敗
      .mockResolvedValueOnce(apiOk()) // register-guest 成功

    const state = await authService.registerGuest()
    expect(state.isLoggedIn).toBe(true)
    // token 被更新為新的 UUID
    expect(localStorage.getItem(TOKEN_KEY)).not.toBe('expired-token')
  })

  // ─── loginWithEmail ───

  it('loginWithEmail 清除 logged_out 旗標', async () => {
    localStorage.setItem(LOGOUT_KEY, '1')
    mockFetch.mockResolvedValueOnce(apiOk({ guestToken: 'email-token', isBound: true }))

    const result = await authService.loginWithEmail('a@b.com', 'pass')
    expect(result.success).toBe(true)
    expect(localStorage.getItem(LOGOUT_KEY)).toBeNull()
  })

  // ─── logout ───

  it('logout 設置 logged_out 旗標但保留 token', async () => {
    localStorage.setItem(TOKEN_KEY, 'my-token')
    mockFetch.mockResolvedValueOnce(apiOk())
    await authService.autoLogin()

    authService.logout()

    expect(localStorage.getItem(TOKEN_KEY)).toBe('my-token') // token 保留
    expect(localStorage.getItem(LOGOUT_KEY)).toBe('1')       // 旗標設置
    expect(authService.getAuthState().isLoggedIn).toBe(false) // 記憶體清除
  })

  // ─── 完整生命週期 ───

  it('訪客登入 → 刷新 → 自動登入（不卡在登入畫面）', async () => {
    // 1. 首次訪客登入
    mockFetch.mockResolvedValueOnce(apiOk({ guestToken: 'g1' }))
    const s1 = await authService.registerGuest()
    expect(s1.isLoggedIn).toBe(true)

    // 2. 模擬刷新（重載模組）
    vi.resetModules()
    const fresh = await import('../authService')
    mockFetch.mockResolvedValueOnce(apiOk())
    const s2 = await fresh.autoLogin()
    expect(s2.isLoggedIn).toBe(true)
  })

  it('訪客登入 → 登出 → 刷新 → 停在登入畫面', async () => {
    // 1. 訪客登入
    mockFetch.mockResolvedValueOnce(apiOk())
    await authService.registerGuest()

    // 2. 登出
    authService.logout()

    // 3. 模擬刷新
    vi.resetModules()
    const fresh = await import('../authService')
    const s = await fresh.autoLogin()
    expect(s.isLoggedIn).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1) // 只有步驟1呼叫過API
  })

  it('訪客登入 → 登出 → 訪客登入 → 刷新 → 自動登入', async () => {
    // 1. 訪客登入
    mockFetch.mockResolvedValueOnce(apiOk())
    await authService.registerGuest()

    // 2. 登出
    authService.logout()
    expect(localStorage.getItem(LOGOUT_KEY)).toBe('1')

    // 3. 再次訪客登入（回到同帳號）
    mockFetch.mockResolvedValueOnce(apiOk())
    const s3 = await authService.registerGuest()
    expect(s3.isLoggedIn).toBe(true)
    expect(localStorage.getItem(LOGOUT_KEY)).toBeNull()

    // 4. 模擬刷新
    vi.resetModules()
    const fresh = await import('../authService')
    mockFetch.mockResolvedValueOnce(apiOk())
    const s4 = await fresh.autoLogin()
    expect(s4.isLoggedIn).toBe(true)
  })

  it('訪客登入 → 登出 → 帳密登入 → 刷新 → 自動登入', async () => {
    // 1. 訪客登入
    mockFetch.mockResolvedValueOnce(apiOk({ guestToken: 'g1' }))
    await authService.registerGuest()

    // 2. 登出
    authService.logout()

    // 3. 帳密登入
    mockFetch.mockResolvedValueOnce(apiOk({ guestToken: 'email-token', isBound: true }))
    await authService.loginWithEmail('a@b.com', 'pass')
    expect(localStorage.getItem(LOGOUT_KEY)).toBeNull()

    // 4. 模擬刷新
    vi.resetModules()
    const fresh = await import('../authService')
    mockFetch.mockResolvedValueOnce(apiOk({ isBound: true }))
    const s = await fresh.autoLogin()
    expect(s.isLoggedIn).toBe(true)
  })
})
