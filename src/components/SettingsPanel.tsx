/**
 * SettingsPanel — 設定面板
 *
 * 功能：帳號綁定（email + 密碼）+ 綁定獎勵、修改暱稱、PWA 安裝、登出
 */

import { useState, useCallback, useEffect } from 'react'
import { bindAccount, changeName, changePassword, getAuthState } from '../services/authService'
import { audioManager } from '../services/audioService'
import { useLogout } from '../hooks/useLogout'
import { translateError } from '../utils/errorMessages'
import { CurrencyIcon } from './CurrencyIcon'
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'
import {
  detectPlatform,
  isStandalone,
  hasInstallPrompt,
  triggerInstall,
  claimPwaReward,
  getInstallInstructions,
  onInstallPromptAvailable,
  onAppInstalled,
} from '../services/pwaService'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface SettingsPanelProps {
  onBack: () => void
  onLogout: () => void
  displayName: string
  isBound: boolean
  /** 綁定/安裝獎勵領取後刷新信箱 */
  onRefreshMail?: () => void
  /** PWA 安裝獎勵是否已領取（from save_data） */
  pwaRewardClaimed?: boolean
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function SettingsPanel({ onBack, onLogout, displayName, isBound: initialBound, onRefreshMail, pwaRewardClaimed: initialPwaClaimed }: SettingsPanelProps) {
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

  /* ── PWA 安裝 ── */
  const [pwaInstalled, setPwaInstalled] = useState(() => isStandalone())
  const [canInstall, setCanInstall] = useState(() => hasInstallPrompt())
  const [pwaRewardClaimed, setPwaRewardClaimed] = useState(initialPwaClaimed ?? false)
  const [pwaClaimLoading, setPwaClaimLoading] = useState(false)
  const [pwaMsg, setPwaMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const platform = detectPlatform()

  const handleBind = useCallback(async () => {
    setBindMsg(null)
    if (!email.includes('@')) { setBindMsg({ ok: false, text: 'Email 格式不正確' }); return }
    if (password.length < 6) { setBindMsg({ ok: false, text: '密碼至少 6 個字元' }); return }
    if (password !== confirmPw) { setBindMsg({ ok: false, text: '兩次密碼不一致' }); return }

    setBindLoading(true)
    try {
      const res = await bindAccount(email, password)
      if (res.success) {
        setBindMsg({ ok: true, text: '帳號綁定成功！綁定獎勵已寄送至信箱 📬' })
        setIsBound(true)
        // 綁定成功後刷新信箱（獎勵信件會自動送達）
        onRefreshMail?.()
      } else {
        setBindMsg({ ok: false, text: translateError(res.error, '綁定失敗') })
      }
    } catch (e) {
      setBindMsg({ ok: false, text: '網路連線失敗，請稍後再試' })
    } finally {
      setBindLoading(false)
    }
  }, [email, password, confirmPw, onRefreshMail])

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

  const handleFullLogout = useLogout(onLogout)

  /* ── PWA 事件訂閱 ── */
  useEffect(() => {
    const unsub1 = onInstallPromptAvailable(() => setCanInstall(true))
    const unsub2 = onAppInstalled(() => {
      setPwaInstalled(true)
      setCanInstall(false)
      // 自動領取 PWA 獎勵
      handleClaimPwaReward()
    })
    return () => { unsub1(); unsub2() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 觸發 PWA 安裝 */
  const handlePwaInstall = useCallback(async () => {
    const accepted = await triggerInstall()
    if (accepted) {
      setPwaInstalled(true)
      setCanInstall(false)
      handleClaimPwaReward()
    } else {
      setPwaMsg({ ok: false, text: '安裝已取消' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 領取 PWA 獎勵 */
  const handleClaimPwaReward = useCallback(async () => {
    if (pwaRewardClaimed) return
    const authState = getAuthState()
    if (!authState.guestToken) return

    setPwaClaimLoading(true)
    try {
      const res = await claimPwaReward(authState.guestToken)
      if (res.success) {
        setPwaRewardClaimed(true)
        setPwaMsg({ ok: true, text: '🎁 安裝獎勵已寄送至信箱！' })
        onRefreshMail?.()
      } else if (res.error === 'already_claimed') {
        setPwaRewardClaimed(true)
      } else {
        setPwaMsg({ ok: false, text: '獎勵領取失敗，請稍後再試' })
      }
    } catch {
      setPwaMsg({ ok: false, text: '網路連線失敗' })
    } finally {
      setPwaClaimLoading(false)
    }
  }, [pwaRewardClaimed, onRefreshMail])

  const authState = getAuthState()

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">⚙️ 設定</h2>
          <PanelInfoTip description={PANEL_DESCRIPTIONS.settings} />
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
                <span>背景音樂</span>
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
                <span>音效</span>
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
              <div className="settings-reward-preview">
                🎁 綁定獎勵：<CurrencyIcon type="diamond" /> 200 + <CurrencyIcon type="gold" /> 5,000
              </div>
              <div className="settings-form-col">
                <input
                  className="settings-input"
                  type="email"
                  placeholder="電子信箱"
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

          {/* ── PWA 安裝 ── */}
          <section className="settings-section">
            <h3 className="settings-section-title">📱 加入主畫面</h3>
            {pwaInstalled ? (
              <div className="settings-bound-badge">
                ✅ 已安裝為 App{pwaRewardClaimed ? '' : '（獎勵領取中...）'}
              </div>
            ) : (
              <>
                <div className="settings-pwa-benefits">
                  <div className="settings-pwa-benefit">⚡ 更快的載入速度（資源離線快取）</div>
                  <div className="settings-pwa-benefit">📱 從主畫面一鍵啟動，如同原生 App</div>
                  <div className="settings-pwa-benefit">🔒 更穩定的遊戲體驗（不受瀏覽器分頁限制）</div>
                  <div className="settings-pwa-benefit">🎁 首次安裝可獲得 <CurrencyIcon type="diamond" />100 + <CurrencyIcon type="gold" />3,000 獎勵！</div>
                </div>
                {canInstall ? (
                  <button
                    className="settings-btn settings-btn-primary"
                    onClick={handlePwaInstall}
                  >
                    📲 安裝全球感染
                  </button>
                ) : (
                  <div className="settings-pwa-instructions">
                    <p className="settings-hint" style={{ marginBottom: '6px' }}>
                      {platform === 'ios' ? '📋 iOS 安裝步驟：' :
                       platform === 'android' ? '📋 Android 安裝步驟：' :
                       '📋 安裝步驟：'}
                    </p>
                    {getInstallInstructions(platform).map((step, i) => (
                      <div key={i} className="settings-pwa-step">{step}</div>
                    ))}
                  </div>
                )}
              </>
            )}
            {pwaMsg && (
              <div className={`settings-msg ${pwaMsg.ok ? 'settings-msg-ok' : 'settings-msg-err'}`}>
                {pwaMsg.text}
              </div>
            )}
            {pwaClaimLoading && (
              <div className="settings-msg settings-msg-ok">獎勵領取中...</div>
            )}
          </section>

          {/* ── 登出 ── */}
          <section className="settings-section">
            <button className="settings-btn settings-btn-danger" onClick={handleFullLogout}>
              🚪 登出
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
