/**
 * SettingsPanel — 設定面板
 *
 * 功能：帳號綁定（email + 密碼）、修改暱稱、登出
 */

import { useState, useCallback, useEffect } from 'react'
import { bindAccount, changeName, changePassword, logout, getAuthState } from '../services/authService'
import { audioManager } from '../services/audioService'
import { translateError } from '../utils/errorMessages'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface SettingsPanelProps {
  onBack: () => void
  onLogout: () => void
  displayName: string
  isBound: boolean
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function SettingsPanel({ onBack, onLogout, displayName, isBound: initialBound }: SettingsPanelProps) {
  /* ── 音量設定 ── */
  const [audioSettings, setAudioSettings] = useState(audioManager.getSettings())
  useEffect(() => {
    return audioManager.subscribe(() => setAudioSettings(audioManager.getSettings()))
  }, [])

  /* ── 綁定帳號 ── */
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [bindLoading, setBindLoading] = useState(false)
  const [bindMsg, setBindMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isBound, setIsBound] = useState(initialBound)

  /* ── 改名 ── */
  const [newName, setNewName] = useState(displayName)
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)

  /* ── 改密碼 ── */
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleBind = useCallback(async () => {
    setBindMsg(null)
    if (!email.includes('@')) { setBindMsg({ ok: false, text: 'Email 格式不正確' }); return }
    if (password.length < 6) { setBindMsg({ ok: false, text: '密碼至少 6 個字元' }); return }
    if (password !== confirmPw) { setBindMsg({ ok: false, text: '兩次密碼不一致' }); return }

    setBindLoading(true)
    try {
      const res = await bindAccount(email, password)
      if (res.success) {
        setBindMsg({ ok: true, text: '帳號綁定成功！' })
        setIsBound(true)
      } else {
        setBindMsg({ ok: false, text: translateError(res.error, '綁定失敗') })
      }
    } catch (e) {
      setBindMsg({ ok: false, text: '網路連線失敗，請稍後再試' })
    } finally {
      setBindLoading(false)
    }
  }, [email, password, confirmPw])

  const handleChangeName = useCallback(async () => {
    setNameMsg(null)
    const trimmed = newName.trim()
    if (!trimmed || trimmed.length < 1 || trimmed.length > 16) {
      setNameMsg({ ok: false, text: '暱稱 1~16 個字元' })
      return
    }
    setNameLoading(true)
    try {
      const res = await changeName(trimmed)
      if (res.success) {
        setNameMsg({ ok: true, text: '暱稱已更新！' })
      } else {
        setNameMsg({ ok: false, text: translateError(res.error, '暱稱更新失敗') })
      }
    } catch (e) {
      setNameMsg({ ok: false, text: '網路連線失敗，請稍後再試' })
    } finally {
      setNameLoading(false)
    }
  }, [newName])

  const handleChangePassword = useCallback(async () => {
    setPwMsg(null)
    if (!oldPw) { setPwMsg({ ok: false, text: '請輸入目前密碼' }); return }
    if (newPw.length < 6) { setPwMsg({ ok: false, text: '新密碼至少 6 個字元' }); return }
    if (newPw !== newPwConfirm) { setPwMsg({ ok: false, text: '兩次新密碼不一致' }); return }

    setPwLoading(true)
    try {
      const res = await changePassword(oldPw, newPw)
      if (res.success) {
        setPwMsg({ ok: true, text: '密碼已更新！' })
        setOldPw(''); setNewPw(''); setNewPwConfirm('')
      } else {
        setPwMsg({ ok: false, text: translateError(res.error, '密碼更新失敗') })
      }
    } catch (e) {
      setPwMsg({ ok: false, text: '網路連線失敗，請稍後再試' })
    } finally {
      setPwLoading(false)
    }
  }, [oldPw, newPw, newPwConfirm])

  const handleLogout = () => {
    logout()
    onLogout()
  }

  const authState = getAuthState()

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">⚙️ 設定</h2>
        </div>

        <div className="settings-scroll">
          {/* ── 音量設定 ── */}
          <section className="settings-section">
            <h3 className="settings-section-title">🔊 音量設定</h3>
            <div className="settings-audio-row">
              <label className="settings-audio-label">
                <span>主音量</span>
                <input
                  type="range"
                  min={0} max={100} step={1}
                  value={Math.round(audioSettings.masterVolume * 100)}
                  onChange={(e) => audioManager.setMasterVolume(Number(e.target.value) / 100)}
                  className="settings-slider"
                />
                <span className="settings-audio-val">{Math.round(audioSettings.masterVolume * 100)}%</span>
              </label>
            </div>
            <div className="settings-audio-row">
              <label className="settings-audio-label">
                <span>BGM</span>
                <input
                  type="range"
                  min={0} max={100} step={1}
                  value={Math.round(audioSettings.bgmVolume * 100)}
                  onChange={(e) => audioManager.setBgmVolume(Number(e.target.value) / 100)}
                  className="settings-slider"
                />
                <span className="settings-audio-val">{Math.round(audioSettings.bgmVolume * 100)}%</span>
              </label>
            </div>
            <div className="settings-audio-row">
              <label className="settings-audio-label">
                <span>SFX</span>
                <input
                  type="range"
                  min={0} max={100} step={1}
                  value={Math.round(audioSettings.sfxVolume * 100)}
                  onChange={(e) => audioManager.setSfxVolume(Number(e.target.value) / 100)}
                  className="settings-slider"
                />
                <span className="settings-audio-val">{Math.round(audioSettings.sfxVolume * 100)}%</span>
              </label>
            </div>
            <div className="settings-audio-row">
              <button
                className={`settings-btn ${audioSettings.muted ? 'settings-btn-danger' : 'settings-btn-secondary'}`}
                onClick={() => audioManager.toggleMute()}
              >
                {audioSettings.muted ? '🔇 已靜音 — 點擊取消' : '🔊 靜音'}
              </button>
            </div>
          </section>

          {/* ── 帳號資訊 ── */}
          <section className="settings-section">
            <h3 className="settings-section-title">帳號資訊</h3>
            <div className="settings-info-row">
              <span className="settings-label">狀態</span>
              <span className={`settings-value ${isBound ? 'settings-bound' : 'settings-unbound'}`}>
                {isBound ? '✅ 已綁定' : '⚠️ 訪客帳號'}
              </span>
            </div>
            {authState.playerId && (
              <div className="settings-info-row">
                <span className="settings-label">玩家 ID</span>
                <span className="settings-value settings-id">{authState.playerId}</span>
              </div>
            )}
          </section>

          {/* ── 修改暱稱 ── */}
          <section className="settings-section">
            <h3 className="settings-section-title">修改暱稱</h3>
            <div className="settings-form-row">
              <input
                className="settings-input"
                type="text"
                placeholder="輸入新暱稱"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={16}
              />
              <button
                className="settings-btn settings-btn-secondary"
                disabled={nameLoading || !newName.trim()}
                onClick={handleChangeName}
              >
                {nameLoading ? '...' : '更新'}
              </button>
            </div>
            {nameMsg && (
              <div className={`settings-msg ${nameMsg.ok ? 'settings-msg-ok' : 'settings-msg-err'}`}>
                {nameMsg.text}
              </div>
            )}
          </section>

          {/* ── 綁定帳號 ── */}
          {!isBound && (
            <section className="settings-section">
              <h3 className="settings-section-title">綁定帳號密碼</h3>
              <p className="settings-hint">
                綁定後可在其他裝置用 Email + 密碼登入，保留所有進度。
              </p>
              <div className="settings-form-col">
                <input
                  className="settings-input"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className="settings-input"
                  type="password"
                  placeholder="密碼（至少 6 字元）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <input
                  className="settings-input"
                  type="password"
                  placeholder="確認密碼"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                />
                <button
                  className="settings-btn settings-btn-primary"
                  disabled={bindLoading}
                  onClick={handleBind}
                >
                  {bindLoading ? '綁定中...' : '🔗 綁定帳號'}
                </button>
              </div>
              {bindMsg && (
                <div className={`settings-msg ${bindMsg.ok ? 'settings-msg-ok' : 'settings-msg-err'}`}>
                  {bindMsg.text}
                </div>
              )}
            </section>
          )}

          {isBound && (
            <section className="settings-section">
              <h3 className="settings-section-title">帳號綁定</h3>
              <div className="settings-bound-badge">✅ 帳號已綁定，可跨裝置登入</div>
            </section>
          )}

          {/* ── 修改密碼（僅已綁定帳號可用） ── */}
          {isBound && (
            <section className="settings-section">
              <h3 className="settings-section-title">修改密碼</h3>
              <div className="settings-form-col">
                <input
                  className="settings-input"
                  type="password"
                  placeholder="目前密碼"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                />
                <input
                  className="settings-input"
                  type="password"
                  placeholder="新密碼（至少 6 字元）"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <input
                  className="settings-input"
                  type="password"
                  placeholder="確認新密碼"
                  value={newPwConfirm}
                  onChange={(e) => setNewPwConfirm(e.target.value)}
                />
                <button
                  className="settings-btn settings-btn-secondary"
                  disabled={pwLoading || !oldPw || !newPw}
                  onClick={handleChangePassword}
                >
                  {pwLoading ? '更新中...' : '🔑 修改密碼'}
                </button>
              </div>
              {pwMsg && (
                <div className={`settings-msg ${pwMsg.ok ? 'settings-msg-ok' : 'settings-msg-err'}`}>
                  {pwMsg.text}
                </div>
              )}
            </section>
          )}

          {/* ── 登出 ── */}
          <section className="settings-section">
            <button className="settings-btn settings-btn-danger" onClick={handleLogout}>
              🚪 登出
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
