/**
 * CheckinPanel — 每日簽到面板
 *
 * 7 天循環簽到獎勵：連續簽到累計天數，斷簽重置。
 * 獎勵由 GAS daily-checkin handler 伺服器端計算與發放。
 */

import { useState, useCallback } from 'react'
import type { SaveData } from '../services/saveService'
import { CurrencyIcon } from './CurrencyIcon'
import { getItemName } from '../constants/rarity'
import { ClickableItemIcon } from './ClickableItemIcon'
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'

/* ────────────────────────────
   常數 — 7 日獎勵預覽（與 GAS CHECKIN_REWARDS_ 對應）
   ──────────────────────────── */

interface DayReward {
  gold?: number
  diamond?: number
  items?: { itemId: string; quantity: number }[]
}

const REWARDS: DayReward[] = [
  { gold: 5000 },
  { gold: 8000, items: [{ itemId: 'exp', quantity: 500 }] },
  { diamond: 50, items: [{ itemId: 'gacha_ticket_hero', quantity: 1 }] },
  { gold: 12000, items: [{ itemId: 'chest_bronze', quantity: 1 }] },
  { diamond: 80, items: [{ itemId: 'exp', quantity: 1500 }, { itemId: 'gacha_ticket_equip', quantity: 1 }] },
  { gold: 20000, items: [{ itemId: 'chest_silver', quantity: 1 }, { itemId: 'gacha_ticket_hero', quantity: 1 }] },
  { diamond: 200, items: [{ itemId: 'chest_gold', quantity: 1 }, { itemId: 'gacha_ticket_hero', quantity: 2 }, { itemId: 'gacha_ticket_equip', quantity: 2 }] },
]

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface CheckinPanelProps {
  onBack: () => void
  saveData: SaveData | null
  onCheckin: () => Promise<{ success: boolean; checkinDay?: number; error?: string; reward?: DayReward }>
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function CheckinPanel({ onBack, saveData, onCheckin }: CheckinPanelProps) {
  const checkinDay = saveData?.checkinDay ?? 0
  const checkinLastDate = saveData?.checkinLastDate ?? ''

  // 判斷今天是否已簽到（UTC+8）
  const todayStr = getTaipeiDate()
  const yesterdayStr = getYesterdayTaipeiDate()
  const alreadyCheckedIn = checkinLastDate === todayStr

  // ★ 判斷連續簽到是否有效：最後簽到必須是今天或昨天，且未滿 7 天才算延續
  // 今天已簽 → 完整顯示 checkinDay；昨天簽且 <7 → 連續中；否則 → 斷簽或週期結束
  const isStreakAlive = checkinLastDate === todayStr
    || (checkinLastDate === yesterdayStr && checkinDay < 7)
  const effectiveDay = isStreakAlive ? checkinDay : 0

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [localDay, setLocalDay] = useState(effectiveDay)
  const [localChecked, setLocalChecked] = useState(alreadyCheckedIn)

  const handleCheckin = useCallback(async () => {
    if (localChecked || loading) return
    setLoading(true)
    setMsg('')
    try {
      const res = await onCheckin()
      if (res.success && res.checkinDay) {
        setLocalDay(res.checkinDay)
        setLocalChecked(true)
        setMsg(`簽到成功！第 ${res.checkinDay} 天`)
      } else {
        setMsg(res.error === 'already_checked_in' ? '今天已經簽到過了' : `簽到失敗：${res.error}`)
        if (res.error === 'already_checked_in') setLocalChecked(true)
      }
    } catch {
      setMsg('網路錯誤，請稍後重試')
    }
    setLoading(false)
  }, [localChecked, loading, onCheckin])

  return (
    <div className="panel-overlay">
      <div className="panel-container checkin-panel">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">📅 每日簽到</h2>
          <PanelInfoTip description={PANEL_DESCRIPTIONS.checkin} />
        </div>

        <div className="checkin-subtitle">
          連續簽到 {localDay > 0 ? localDay : 0} 天 {localChecked ? '✅ 今日已簽' : ''}
        </div>

        {/* 7 日格子 */}
        <div className="checkin-grid">
          {REWARDS.map((reward, i) => {
            const dayNum = i + 1
            const isClaimed = dayNum <= localDay
            const isCurrent = dayNum === (localChecked ? localDay : localDay + 1)
            const isToday = isCurrent && !localChecked

            return (
              <div
                key={dayNum}
                className={`checkin-day-card ${isClaimed ? 'checkin-claimed' : ''} ${isToday ? 'checkin-today' : ''} ${isCurrent && localChecked ? 'checkin-current-done' : ''}`}
              >
                <div className="checkin-day-label">第 {dayNum} 天</div>
                <div className="checkin-day-rewards">
                  {reward.gold && (
                    <span className="checkin-reward-line"><CurrencyIcon type="gold" /> {reward.gold.toLocaleString()}</span>
                  )}
                  {reward.diamond && (
                    <span className="checkin-reward-line"><CurrencyIcon type="diamond" /> {reward.diamond}</span>
                  )}
                  {reward.items?.map((it, j) => (
                    <span key={j} className="checkin-reward-line">
                      <ClickableItemIcon itemId={it.itemId}> {getItemName(it.itemId)} ×{it.quantity}</ClickableItemIcon>
                    </span>
                  ))}
                </div>
                {isClaimed && <div className="checkin-check-mark">✓</div>}
              </div>
            )
          })}
        </div>

        {/* 簽到按鈕 */}
        <button
          className={`checkin-btn ${localChecked ? 'checkin-btn-done' : ''}`}
          disabled={localChecked || loading}
          onClick={handleCheckin}
        >
          {loading ? '簽到中...' : localChecked ? '今日已簽到' : '立即簽到'}
        </button>

        {msg && <div className="checkin-msg">{msg}</div>}
      </div>
    </div>
  )
}

/* ────────────────────────────
   Utility
   ──────────────────────────── */

/** 取得 UTC+8 (Taipei) 的 YYYY-MM-DD 字串 */
function getTaipeiDate(): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const taipei = new Date(utc + 8 * 3600000)
  const y = taipei.getFullYear()
  const m = String(taipei.getMonth() + 1).padStart(2, '0')
  const d = String(taipei.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 取得 UTC+8 (Taipei) 昨天的 YYYY-MM-DD 字串 */
function getYesterdayTaipeiDate(): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const taipei = new Date(utc + 8 * 3600000 - 86400000)
  const y = taipei.getFullYear()
  const m = String(taipei.getMonth() + 1).padStart(2, '0')
  const d = String(taipei.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
