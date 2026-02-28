/**
 * LoginScreen — 登入畫面
 *
 * 三種模式：
 *   1. 自動訪客登入中（進度指示）
 *   2. 訪客登入失敗 → 手動重試 / 帳密登入
 *   3. 帳密登入表單
 *
 * 風格：末日 CRT 掃描線（與 TransitionOverlay 一致）
 */

import { useState, useEffect } from 'react'
import type { UseAuthReturn } from '../hooks/useAuth'

interface LoginScreenProps {
  auth: UseAuthReturn
  onEnterGame: () => void
}

export function LoginScreen({ auth, onEnterGame }: LoginScreenProps) {
  const { auth: state, loading, error, doAutoLogin, doRegisterGuest, doLogin } = auth
  const [mode, setMode] = useState<'auto' | 'login'>('auto')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dots, setDots] = useState('')

  // 自動登入
  useEffect(() => {
    doAutoLogin()
  }, [doAutoLogin])

  // 登入成功 → 自動進場
  useEffect(() => {
    if (state.isLoggedIn) {
      const t = setTimeout(onEnterGame, 600)
      return () => clearTimeout(t)
    }
  }, [state.isLoggedIn, onEnterGame])

  // 載入動畫
  useEffect(() => {
    if (!loading) return
    const t = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 500)
    return () => clearInterval(t)
  }, [loading])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    const ok = await doLogin(email.trim(), password.trim())
    if (ok) onEnterGame()
  }

  return (
    <div className="login-screen">
      {/* CRT 效果 */}
      <div className="login-scanlines" />
      <div className="login-scan-bar" />
      <div className="login-vignette" />

      {/* 標題 */}
      <div className="login-title">全球感染</div>
      <div className="login-subtitle">GLOBAL GANLAN</div>

      {/* 內容區 */}
      <div className="login-content">
        {/* ── 自動模式 ── */}
        {mode === 'auto' && loading && (
          <div className="login-status">
            <span className="login-status-text">連線中{dots}</span>
          </div>
        )}

        {mode === 'auto' && !loading && state.isLoggedIn && (
          <div className="login-status">
            <span className="login-status-text login-success">
              歡迎回來，{state.displayName}
            </span>
          </div>
        )}

        {mode === 'auto' && !loading && !state.isLoggedIn && (
          <div className="login-actions">
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn login-btn-primary" onClick={doRegisterGuest}>
              訪客模式進入
            </button>
            <div className="login-divider">
              <span>或</span>
            </div>
            <button className="login-btn login-btn-ghost" onClick={() => setMode('login')}>
              帳號登入
            </button>
          </div>
        )}

        {/* ── 帳密登入 ── */}
        {mode === 'login' && (
          <form className="login-form" onSubmit={handleEmailLogin}>
            {error && <div className="login-error">{error}</div>}
            <input
              className="login-input"
              type="email"
              placeholder="電子郵件"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
            <input
              className="login-input"
              type="password"
              placeholder="密碼"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
            />
            <button
              className="login-btn login-btn-primary"
              type="submit"
              disabled={loading}
            >
              {loading ? '登入中...' : '登入'}
            </button>
            <button
              className="login-btn login-btn-ghost"
              type="button"
              onClick={() => { setMode('auto'); doRegisterGuest() }}
              disabled={loading}
            >
              返回訪客模式
            </button>
          </form>
        )}
      </div>

      {/* 底部 */}
      <div className="login-footer">
        v0.1 — 末日從此開始
      </div>
    </div>
  )
}
