/**
 * authService — 帳號系統前端服務
 *
 * 訪客自動登入 + 帳密綁定 + 跨裝置登入。
 * Token 存 localStorage，狀態存 memory（不依賴 React）。
 *
 * 對應 Spec: specs/auth-system.md v0.1
 */

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

const STORAGE_KEY_TOKEN = 'globalganlan_guest_token'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface AuthState {
  isLoggedIn: boolean
  playerId: string | null
  displayName: string
  isBound: boolean
  guestToken: string | null
}

interface ApiResponse {
  success: boolean
  error?: string
  playerId?: string
  displayName?: string
  guestToken?: string
  isBound?: boolean
  alreadyExists?: boolean
  message?: string
}

/* ════════════════════════════════════
   內部 state
   ════════════════════════════════════ */

let currentAuth: AuthState = {
  isLoggedIn: false,
  playerId: null,
  displayName: '倖存者',
  isBound: false,
  guestToken: null,
}

type AuthListener = (state: AuthState) => void
const listeners: AuthListener[] = []

function notify() {
  for (const fn of listeners) fn({ ...currentAuth })
}

/* ════════════════════════════════════
   通用 API 呼叫
   ════════════════════════════════════ */

async function callApi(action: string, params: Record<string, unknown> = {}): Promise<ApiResponse> {
  const body = JSON.stringify({ action, ...params })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  return res.json()
}

/* ════════════════════════════════════
   UUID v4 生成
   ════════════════════════════════════ */

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/* ════════════════════════════════════
   公開 API
   ════════════════════════════════════ */

/** 取得當前認證狀態（唯讀副本） */
export function getAuthState(): AuthState {
  return { ...currentAuth }
}

/** 訂閱認證狀態變化 */
export function onAuthChange(fn: AuthListener): () => void {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

/**
 * 自動登入流程（進入遊戲時呼叫一次）
 *
 * 1. 有 localStorage token → login-guest
 * 2. 沒有 token → register-guest（自動建帳）
 * 3. 失敗 → 離線模式（不阻塞遊戲）
 */
export async function autoLogin(): Promise<AuthState> {
  const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN)

  if (savedToken) {
    // 嘗試用 token 登入
    try {
      const res = await callApi('login-guest', { guestToken: savedToken })
      if (res.success) {
        currentAuth = {
          isLoggedIn: true,
          playerId: res.playerId ?? null,
          displayName: res.displayName ?? '倖存者',
          isBound: res.isBound ?? false,
          guestToken: savedToken,
        }
        notify()
        return getAuthState()
      }
      // token 不存在 → 可能被清除，重新註冊
    } catch {
      // 網路錯誤 → 離線模式
      console.warn('[auth] login-guest failed, offline mode')
      currentAuth = {
        isLoggedIn: false,
        playerId: null,
        displayName: '倖存者',
        isBound: false,
        guestToken: savedToken,
      }
      notify()
      return getAuthState()
    }
  }

  // 新訪客 → 註冊
  const newToken = uuidv4()
  try {
    const res = await callApi('register-guest', { guestToken: newToken })
    if (res.success) {
      localStorage.setItem(STORAGE_KEY_TOKEN, newToken)
      currentAuth = {
        isLoggedIn: true,
        playerId: res.playerId ?? null,
        displayName: res.displayName ?? '倖存者',
        isBound: false,
        guestToken: newToken,
      }
      notify()
      return getAuthState()
    }
  } catch {
    console.warn('[auth] register-guest failed, offline mode')
  }

  // 註冊也失敗 → 純離線
  currentAuth = {
    isLoggedIn: false,
    playerId: null,
    displayName: '倖存者',
    isBound: false,
    guestToken: null,
  }
  notify()
  return getAuthState()
}

/**
 * 帳密登入（換裝置 / 另一台電腦）
 */
export async function loginWithEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const res = await callApi('login', { email, password })
  if (!res.success) return { success: false, error: res.error }

  // 儲存 token + 更新 state
  if (res.guestToken) {
    localStorage.setItem(STORAGE_KEY_TOKEN, res.guestToken)
  }
  currentAuth = {
    isLoggedIn: true,
    playerId: res.playerId ?? null,
    displayName: res.displayName ?? '倖存者',
    isBound: true,
    guestToken: res.guestToken ?? null,
  }
  notify()
  return { success: true }
}

/**
 * 綁定帳號（訪客 → 有帳密）
 */
export async function bindAccount(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!currentAuth.guestToken) return { success: false, error: 'not_logged_in' }
  const res = await callApi('bind-account', {
    guestToken: currentAuth.guestToken,
    email,
    password,
  })
  if (res.success) {
    currentAuth = { ...currentAuth, isBound: true }
    notify()
  }
  return { success: res.success, error: res.error }
}

/**
 * 修改暱稱
 */
export async function changeName(newName: string): Promise<{ success: boolean; error?: string }> {
  if (!currentAuth.guestToken) return { success: false, error: 'not_logged_in' }
  const res = await callApi('change-name', {
    guestToken: currentAuth.guestToken,
    newName,
  })
  if (res.success) {
    currentAuth = { ...currentAuth, displayName: newName }
    notify()
  }
  return { success: res.success, error: res.error }
}

/**
 * 修改密碼（必須已綁定 email）
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (!currentAuth.guestToken) return { success: false, error: 'not_logged_in' }
  if (!currentAuth.isBound) return { success: false, error: 'account_not_bound' }
  const res = await callApi('change-password', {
    guestToken: currentAuth.guestToken,
    oldPassword,
    newPassword,
  })
  return { success: res.success, error: res.error }
}

/**
 * 登出（清除本地 token，回到登入畫面）
 */
export function logout(): void {
  localStorage.removeItem(STORAGE_KEY_TOKEN)
  currentAuth = {
    isLoggedIn: false,
    playerId: null,
    displayName: '倖存者',
    isBound: false,
    guestToken: null,
  }
  notify()
}
