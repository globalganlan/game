/**
 * MailboxPanel — 信箱面板
 *
 * 功能：信件列表、詳情閱覽、領取獎勵、刪除信件
 * 資料由 App 預加載，開啟時直接顯示。
 * 刪除採樂觀更新：先從 state 移除，再呼叫 API。
 */

import { useState, useCallback } from 'react'
import {
  readMail,
  claimMailReward,
  claimAllMail,
  deleteMail,
  deleteAllRead,
  type MailItem,
  type MailReward,
} from '../services/mailService'
import { translateError } from '../utils/errorMessages'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface MailboxPanelProps {
  onBack: () => void
  /** 領取獎勵後通知上層刷新資源（鑽石/金幣） */
  onRewardsClaimed?: (rewards: MailReward[]) => void
  /** App 預加載的信件列表 */
  mailItems: MailItem[]
  /** 預加載是否完成 */
  mailLoaded: boolean
  /** 更新 App state 中的信件列表 */
  onMailItemsChange: (items: MailItem[]) => void
  /** 從 API 重新載入信件（寫入操作後呼叫） */
  onRefreshMail: () => Promise<void>
}

/* ────────────────────────────
   Helpers
   ──────────────────────────── */

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

import { getItemName } from '../constants/rarity'
import { ItemIcon } from './CurrencyIcon'

function rewardLabel(r: MailReward): string {
  return `${getItemName(r.itemId)} ×${r.quantity}`
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function MailboxPanel({
  onBack,
  onRewardsClaimed,
  mailItems: mails,
  mailLoaded,
  onMailItemsChange: setMails,
  onRefreshMail: _onRefreshMail,
}: MailboxPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const selected = mails.find(m => m.mailId === selectedId) ?? null
  const loading = !mailLoaded

  /* ── 選取/已讀 ── */
  const handleSelect = useCallback(async (mailId: string) => {
    setSelectedId(mailId)
    setActionMsg(null)
    const mail = mails.find(m => m.mailId === mailId)
    if (mail && !mail.read) {
      // 樂觀更新已讀
      setMails(mails.map(m => m.mailId === mailId ? { ...m, read: true } : m))
      readMail(mailId).catch(() => { /* silent */ })
    }
  }, [mails, setMails])

  /* ── 領取單封（樂觀更新 — 零等待） ── */
  const handleClaim = useCallback(async () => {
    if (!selected || selected.claimed || selected.rewards.length === 0) return

    // 樂觀：直接用已知 rewards 顯示結果 + 立即更新 UI
    const rewards = selected.rewards
    const text = rewards.map(rewardLabel).join('、')
    setActionMsg({ ok: true, text: `已領取：${text}` })
    setMails(mails.map(m => m.mailId === selected.mailId ? { ...m, claimed: true, read: true } : m))

    // 背景 API（claimMailReward 內部走 optimisticQueue）
    claimMailReward(selected.mailId).catch(() => { /* 備份在 localStorage，登入時 reconcile */ })
    onRewardsClaimed?.(rewards)
  }, [selected, mails, setMails, onRewardsClaimed])

  /* ── 一鍵領取（樂觀更新 — 零等待） ── */
  const handleClaimAll = useCallback(async () => {
    // 計算本地可領取數
    const claimable = mails.filter(m => !m.claimed && m.rewards.length > 0)
    if (claimable.length === 0) {
      setActionMsg({ ok: true, text: '沒有可領取的獎勵' })
      return
    }

    // 樂觀：立即匯總獎勵 + 更新 UI
    const allRewards: { itemId: string; quantity: number }[] = []
    for (const m of claimable) {
      for (const r of m.rewards) {
        const existing = allRewards.find(x => x.itemId === r.itemId)
        if (existing) existing.quantity += r.quantity
        else allRewards.push({ ...r })
      }
    }
    const text = allRewards.map(rewardLabel).join('、')
    setActionMsg({ ok: true, text: `已領取 ${claimable.length} 封：${text}` })
    setMails(mails.map(m =>
      !m.claimed && m.rewards.length > 0 ? { ...m, claimed: true, read: true } : m,
    ))

    // 背景 API
    claimAllMail().catch(() => { /* localStorage 備份 */ })
    onRewardsClaimed?.(allRewards)
  }, [mails, setMails, onRewardsClaimed])

  /* ── 刪除單封（樂觀更新） ── */
  const handleDelete = useCallback(async () => {
    if (!selected) return
    setActionLoading(true)
    setActionMsg(null)

    // 樂觀：先從 state 移除
    const mailId = selected.mailId
    const prevMails = [...mails]
    setMails(mails.filter(m => m.mailId !== mailId))
    setSelectedId(null)
    setActionMsg({ ok: true, text: '已刪除' })

    try {
      const res = await deleteMail(mailId)
      if (!res.success) {
        // 回滾
        setMails(prevMails)
        setSelectedId(mailId)
        const errMap: Record<string, string> = { has_unclaimed_rewards: '請先領取獎勵再刪除' }
        setActionMsg({ ok: false, text: errMap[res.error || ''] || translateError(res.error, '刪除失敗') })
      }
    } catch (e) {
      // 回滾
      setMails(prevMails)
      setSelectedId(mailId)
      setActionMsg({ ok: false, text: `刪除失敗：${e}` })
    } finally {
      setActionLoading(false)
    }
  }, [selected, mails, setMails])

  /* ── 清空已領取獎勵的信件（樂觀更新） ── */
  const handleDeleteAllClaimed = useCallback(async () => {
    setActionLoading(true)
    setActionMsg(null)

    // 已領取 = (rewards.length > 0 && claimed) 或 (rewards.length === 0 且已讀)
    const toDelete = mails.filter(m =>
      (m.rewards.length > 0 && m.claimed) || (m.rewards.length === 0 && m.read)
    )
    if (toDelete.length === 0) {
      setActionMsg({ ok: true, text: '沒有可清除的信件' })
      setActionLoading(false)
      return
    }

    // 樂觀：先移除
    const prevMails = [...mails]
    const deleteIds = new Set(toDelete.map(m => m.mailId))
    setMails(mails.filter(m => !deleteIds.has(m.mailId)))
    setSelectedId(null)
    setActionMsg({ ok: true, text: `已清除 ${toDelete.length} 封信件` })

    try {
      const { deletedCount } = await deleteAllRead()
      setActionMsg({ ok: true, text: `已清除 ${deletedCount} 封信件` })
    } catch (e) {
      // 回滾
      setMails(prevMails)
      setActionMsg({ ok: false, text: `清除失敗：${e}` })
    } finally {
      setActionLoading(false)
    }
  }, [mails, setMails])

  /* ── 能否刪除（已領取 or 無獎勵） ── */
  const canDelete = selected && (selected.claimed || selected.rewards.length === 0)

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">📬 信箱</h2>
          <div className="mail-header-actions">
            <button
              className="settings-btn settings-btn-primary mail-claim-all-btn"
              disabled={actionLoading || loading}
              onClick={handleClaimAll}
            >
              📦 全部領取
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mail-content">
          {loading && <div className="mail-empty">載入中...</div>}

          {!loading && mails.length === 0 && (
            <div className="mail-empty">📭 目前沒有信件</div>
          )}

          {!loading && mails.length > 0 && !selected && (
            <div className="mail-list">
              {mails.map(m => (
                <button
                  key={m.mailId}
                  className={`mail-item ${m.read ? 'mail-item-read' : 'mail-item-unread'}`}
                  onClick={() => handleSelect(m.mailId)}
                >
                  <div className="mail-item-left">
                    {!m.read && <span className="mail-dot" />}
                    <span className="mail-item-title">{m.title}</span>
                  </div>
                  <div className="mail-item-right">
                    {m.rewards.length > 0 && !m.claimed && <span className="mail-reward-icon">🎁</span>}
                    <span className="mail-item-date">{formatDate(m.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && selected && (
            <div className="mail-detail">
              <button className="mail-detail-back" onClick={() => { setSelectedId(null); setActionMsg(null) }}>
                ← 返回列表
              </button>
              <h3 className="mail-detail-title">{selected.title}</h3>
              <div className="mail-detail-date">{formatDate(selected.createdAt)}</div>
              <div className="mail-detail-body">{selected.body}</div>

              {selected.rewards.length > 0 && (
                <div className="mail-detail-rewards">
                  <div className="mail-rewards-label">📦 附件獎勵</div>
                  <div className="mail-rewards-list">
                    {selected.rewards.map((r, i) => (
                      <span key={i} className="mail-reward-tag">
                        <span className="mail-reward-tag-icon"><ItemIcon itemId={r.itemId} /></span>
                        {rewardLabel(r)}
                      </span>
                    ))}
                  </div>
                  {!selected.claimed && (
                    <button
                      className="settings-btn settings-btn-primary mail-claim-btn"
                      disabled={actionLoading}
                      onClick={handleClaim}
                    >
                      {actionLoading ? '領取中...' : '🎁 領取獎勵'}
                    </button>
                  )}
                  {selected.claimed && (
                    <div className="mail-claimed-badge">✅ 已領取</div>
                  )}
                </div>
              )}

              {canDelete && (
                <button
                  className="settings-btn settings-btn-danger mail-delete-btn"
                  disabled={actionLoading}
                  onClick={handleDelete}
                >
                  🗑️ 刪除信件
                </button>
              )}
            </div>
          )}

          {/* Action message */}
          {actionMsg && (
            <div className={`settings-msg ${actionMsg.ok ? 'settings-msg-ok' : 'settings-msg-err'} mail-action-msg`}>
              {actionMsg.text}
            </div>
          )}
        </div>

        {/* Footer */}
        {mails.length > 0 && (
          <div className="mail-footer">
            <button
              className="settings-btn settings-btn-danger"
              disabled={actionLoading || loading}
              onClick={handleDeleteAllClaimed}
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              🗑️ 清空已領取
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
