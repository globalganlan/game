/**
 * authService  帳號系統前端服務
 *
 * 訪客自動登入 + 帳密綁定 + 跨裝置登入。
 * Token 存 localStorage，狀態存 memory（不依賴 React）。
 *
 * 對應 Spec: specs/auth-system.md v0.1
 */

import { callAuthApi, getStoredToken, setStoredToken } from './apiClient'

const STORAGE_KEY_LOGGED_OUT = 'globalganlan_logged_out'

/* 
   型別
    */

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

/* 
   內部 state
    */

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

/* 
   UUID v4 生成
    */

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

/* 
   公開 API
    */

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
 * 1. 有 localStorage token  login-guest
 * 2. 沒有 token  不自動建帳，返回離線（由 UI 按鈕觸發 registerGuest）
 * 3. 失敗  離線模式（不阻塞遊戲）
 */
export async function autoLogin(): Promise<AuthState> {
  //  使用者主動登出過  不自動登入，等手動點擊
  if (localStorage.getItem(STORAGE_KEY_LOGGED_OUT)) {
    currentAuth = { isLoggedIn: false, playerId: null, displayName: '倖存者', isBound: false, guestToken: null }
    notify()
    return getAuthState()
  }

  const savedToken = getStoredToken()

  if (savedToken) {
    // 嘗試用 token 登入
    try {
      const res = await callAuthApi<ApiResponse>('login-guest', { guestToken: savedToken })
      if (res.success) {
        localStorage.removeItem(STORAGE_KEY_LOGGED_OUT) // 自動登入成功  確保旗標清乾淨
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
      // token 不存在  可能被清除，等使用者手動選擇
    } catch {
      // 網路錯誤  離線模式
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

  // 無 token 或 token 失效  返回未登入狀態，等使用者按鈕觸發 registerGuest
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
 * 註冊新訪客帳號（由 UI 按鈕「訪客模式進入」觸發）
 */
export async function registerGuest(): Promise<AuthState> {
  //  手動登入  清除登出旗標
  localStorage.removeItem(STORAGE_KEY_LOGGED_OUT)
  // 先檢查是否已有本地 token（優先複用）
  const existingToken = getStoredToken()
  if (existingToken) {
    try {
      const res = await callAuthApi<ApiResponse>('login-guest', { guestToken: existingToken })
      if (res.success) {
        currentAuth = {
          isLoggedIn: true,
          playerId: res.playerId ?? null,
          displayName: res.displayName ?? '倖存者',
          isBound: res.isBound ?? false,
          guestToken: existingToken,
        }
        notify()
        return getAuthState()
      }
    } catch {
      // 繼續往下建新帳
    }
  }

  const newToken = uuidv4()
  try {
    const res = await callAuthApi<ApiResponse>('register-guest', { guestToken: newToken })
    if (res.success) {
      setStoredToken(newToken)
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

  // 註冊也失敗  純離線
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
  //  手動登入  清除登出旗標
  localStorage.removeItem(STORAGE_KEY_LOGGED_OUT)
  const res = await callAuthApi<ApiResponse>('login', { email, password })
  if (!res.success) return { success: false, error: res.error }

  // 儲存 token + 更新 state
  if (res.guestToken) {
    setStoredToken(res.guestToken)
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
 * 綁定帳號（訪客  有帳密）
 */
export async function bindAccount(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!currentAuth.guestToken) return { success: false, error: 'not_logged_in' }
  const res = await callAuthApi<ApiResponse>('bind-account', { guestToken: currentAuth.guestToken, email, password })
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
  const res = await callAuthApi<ApiResponse>('change-name', { guestToken: currentAuth.guestToken, newName })
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
  const res = await callAuthApi<ApiResponse>('change-password', { guestToken: currentAuth.guestToken, oldPassword, newPassword })
  return { success: res.success, error: res.error }
}

/**
 * 登出（清除記憶體狀態，回到登入畫面）
 *  保留 localStorage 的 guestToken，下次訪客登入可回到同一帳號
 */
export function logout(): void {
  // 保留 guestToken，但標記已登出（阻止 autoLogin 自動登入）
  localStorage.setItem(STORAGE_KEY_LOGGED_OUT, '1')
  currentAuth = {
    isLoggedIn: false,
    playerId: null,
    displayName: '倖存者',
    isBound: false,
    guestToken: null,
  }
  notify()
}
