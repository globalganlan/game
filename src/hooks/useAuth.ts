/**
 * useAuth — 認證系統 React Hook
 *
 * 包裝 authService，提供 React 響應式狀態 + 操作方法。
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  autoLogin,
  registerGuest,
  loginWithEmail,
  bindAccount,
  changeName,
  logout,
  getAuthState,
  onAuthChange,
  type AuthState,
} from '../services/authService'
import { translateError } from '../utils/errorMessages'

export interface UseAuthReturn {
  /** 當前認證狀態 */
  auth: AuthState
  /** 是否正在進行認證操作 */
  loading: boolean
  /** 最近一次操作的錯誤訊息 */
  error: string | null
  /** 自動登入（App 啟動時呼叫一次） */
  doAutoLogin: () => Promise<void>
  /** 訪客模式進入（手動建帳或複用 token） */
  doRegisterGuest: () => Promise<void>
  /** 帳密登入 */
  doLogin: (email: string, password: string) => Promise<boolean>
  /** 綁定帳號 */
  doBind: (email: string, password: string) => Promise<boolean>
  /** 改名 */
  doChangeName: (name: string) => Promise<boolean>
  /** 登出 */
  doLogout: () => void
}

export function useAuth(): UseAuthReturn {
  const [auth, setAuth] = useState<AuthState>(getAuthState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const unsub = onAuthChange((s) => {
      if (mounted.current) setAuth(s)
    })
    return () => {
      mounted.current = false
      unsub()
    }
  }, [])

  const doAutoLogin = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await autoLogin()
    } catch (e) {
      if (mounted.current) setError(translateError(String(e), '自動登入失敗'))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const doRegisterGuest = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await registerGuest()
    } catch (e) {
      if (mounted.current) setError(translateError(String(e), '建立帳號失敗，請稍後再試'))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const doLogin = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await loginWithEmail(email, password)
      if (!res.success) {
        if (mounted.current) setError(translateError(res.error, '登入失敗'))
        return false
      }
      return true
    } catch (e) {
      if (mounted.current) setError(translateError(String(e), '登入失敗，請檢查網路連線'))
      return false
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const doBind = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await bindAccount(email, password)
      if (!res.success) {
        if (mounted.current) setError(translateError(res.error, '綁定失敗'))
        return false
      }
      return true
    } catch (e) {
      if (mounted.current) setError(translateError(String(e), '綁定失敗，請檢查網路連線'))
      return false
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const doChangeName = useCallback(async (name: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await changeName(name)
      if (!res.success) {
        if (mounted.current) setError(translateError(res.error, '改名失敗'))
        return false
      }
      return true
    } catch (e) {
      if (mounted.current) setError(translateError(String(e), '改名失敗，請檢查網路連線'))
      return false
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const doLogout = useCallback(() => {
    logout()
    setError(null)
  }, [])

  return { auth, loading, error, doAutoLogin, doRegisterGuest, doLogin, doBind, doChangeName, doLogout }
}
