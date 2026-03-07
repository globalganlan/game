/**
 * MainMenu — 主選單導航中心
 *
 * 登入後的首頁，提供各功能入口：
 * 戰鬥（自由 / 關卡）、英雄管理、背包、召喚、設定
 */

import { useState, useEffect, useCallback } from 'react'
import type { MenuScreen } from '../types'
import type { SaveData } from '../services/saveService'
import { getTimerYield } from '../services/saveService'
import { CurrencyIcon } from './CurrencyIcon'
import { RedDot } from './RedDot'
import { InfoTip } from './InfoTip'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface MainMenuProps {
  /** 存檔基本資料 */
  saveData: SaveData | null
  /** 開啟子畫面 */
  onNavigate: (screen: MenuScreen) => void
  /** 領取計時器資源 */
  onCollectResources?: () => void
  /** 取得最新資源預覽的函式（每次呼叫即時計算） */
  getResourcePreview?: () => { gold: number; exp: number; hoursElapsed: number } | null
  /** 信箱未領取獎勵數量（>0 顯示紅點） */
  mailUnclaimedCount?: number
  /** 隊伍總戰力 */
  combatPower?: number
  /** 是否有可用的每日探索次數（顯示關卡紅點） */
  stagesHasDaily?: boolean
  /** 召喚是否有免費抽可用（英雄或裝備任一） */
  gachaHasFreePull?: boolean
  /** 競技場剩餘挑戰次數（>0 顯示紅點） */
  arenaChallengesLeft?: number
  /** 是否有英雄可升星（顯示紅點） */
  heroesHasStarUp?: boolean
}

/* ────────────────────────────
   Menu Items
   ──────────────────────────── */

interface MenuItem {
  key: MenuScreen | 'battle'
  icon: string
  label: string
  sub: string
  color: string
  /** 解鎖條件：null=永遠開放 */
  unlock?: { chapter: number; stage: number; hint: string } | null
}

const MENU_ITEMS: MenuItem[] = [
  /* ── 永遠開放 ── */
  { key: 'stages', icon: '🗺️', label: '關卡', sub: '主線·爬塔·副本', color: '#457b9d' },
  { key: 'checkin', icon: '📅', label: '簽到', sub: '每日登入獎勵', color: '#e9a820' },
  { key: 'mailbox', icon: '📬', label: '信箱', sub: '信件·獎勵', color: '#7ec8e3' },
  /* ── 通關 1-1 解鎖 ── */
  { key: 'heroes', icon: '🧟', label: '英雄', sub: '養成·突破·升星', color: '#2a9d8f', unlock: { chapter: 1, stage: 2, hint: '通關 1-1 後解鎖' } },
  { key: 'inventory', icon: '🎒', label: '背包', sub: '道具·裝備', color: '#f4a261', unlock: { chapter: 1, stage: 2, hint: '通關 1-1 後解鎖' } },
  /* ── 通關 1-2 解鎖 ── */
  { key: 'gacha', icon: '🎰', label: '召喚', sub: '英雄招募·裝備鍛造', color: '#e9c46a', unlock: { chapter: 1, stage: 3, hint: '通關 1-2 後解鎖' } },
  { key: 'shop', icon: '🏪', label: '商店', sub: '購買素材·禮包', color: '#72b01d', unlock: { chapter: 1, stage: 3, hint: '通關 1-2 後解鎖' } },
  /* ── 通關 1-8 解鎖 ── */
  { key: 'arena', icon: '⚔️', label: '競技場', sub: '排名·對戰·獎勵', color: '#e74c3c', unlock: { chapter: 2, stage: 1, hint: '通關 1-8 後解鎖' } },
  /* ── 設定 ── */
  { key: 'settings', icon: '⚙️', label: '設定', sub: '帳號·綁定', color: '#888' },
]

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function MainMenu({
  saveData,
  onNavigate,
  onCollectResources,
  getResourcePreview,
  mailUnclaimedCount = 0,
  combatPower = 0,
  stagesHasDaily = false,
  gachaHasFreePull = false,
  arenaChallengesLeft = 0,
  heroesHasStarUp = false,
}: MainMenuProps) {
  // 每 30 秒刷新離線獎勵預覽
  const [resourcePreview, setResourcePreview] = useState(
    () => getResourcePreview?.() ?? null,
  )
  const refreshPreview = useCallback(() => {
    setResourcePreview(getResourcePreview?.() ?? null)
  }, [getResourcePreview])
  useEffect(() => {
    refreshPreview()
    const id = setInterval(refreshPreview, 30_000)
    return () => clearInterval(id)
  }, [refreshPreview])
  const name = saveData?.displayName || '倖存者'
  const gold = saveData?.gold ?? 0
  const diamond = saveData?.diamond ?? 0
  const exp = saveData?.exp ?? 0
  const story = saveData?.storyProgress
  const storyText = story ? `${story.chapter}-${story.stage}` : '1-1'
  const storyProgress = story ?? { chapter: 1, stage: 1 }

  // 判斷今天是否尚未簽到（UTC+8）
  const checkinNeeded = (() => {
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const taipei = new Date(utc + 8 * 3600000)
    const todayStr = `${taipei.getFullYear()}-${String(taipei.getMonth() + 1).padStart(2, '0')}-${String(taipei.getDate()).padStart(2, '0')}`
    return (saveData?.checkinLastDate ?? '') !== todayStr
  })()

  const [lockToast, setLockToast] = useState<string | null>(null)

  const handleClick = (item: MenuItem) => {
    // 檢查解鎖條件
    if (item.unlock) {
      const playerProg = (storyProgress.chapter - 1) * 8 + storyProgress.stage
      const reqProg = (item.unlock.chapter - 1) * 8 + item.unlock.stage
      if (playerProg < reqProg) {
        setLockToast(item.unlock.hint)
        setTimeout(() => setLockToast(null), 2500)
        return
      }
    }
    onNavigate(item.key as MenuScreen)
  }

  const isItemLocked = (item: MenuItem): boolean => {
    if (!item.unlock) return false
    const playerProg = (storyProgress.chapter - 1) * 8 + storyProgress.stage
    const reqProg = (item.unlock.chapter - 1) * 8 + item.unlock.stage
    return playerProg < reqProg
  }

  return (
    <div className="main-menu-overlay">
      {/* CRT 背景效果 */}
      <div className="menu-scanlines" />

      {/* ── 頂部：玩家資訊 ── */}
      <div className="menu-header">
        <div className="menu-player-info">
          <span className="menu-player-name">{name}</span>
        </div>
        <div className="menu-resources">
          <InfoTip icon={<CurrencyIcon type="gold" />} value={gold.toLocaleString()} label="金幣" description="升級、購買、強化所需的通用貨幣" className="menu-gold" />
          <InfoTip icon={<CurrencyIcon type="diamond" />} value={diamond.toLocaleString()} label="鑽石" description="召喚、加速、購買稀有道具" className="menu-diamond" />
          <InfoTip icon={<CurrencyIcon type="exp" />} value={exp.toLocaleString()} label="經驗" description="英雄升級所需的經驗值" className="menu-exp" />
          <InfoTip icon={<CurrencyIcon type="cp" />} value={combatPower.toLocaleString()} label="戰力" description="隊伍的整體戰鬥力指標" className="menu-cp" />
        </div>
      </div>

      {/* ── 離線產出（與關卡進度群組化） ── */}
      {(() => {
        const timerStage = saveData?.resourceTimerStage || '1-1'
        const speed = getTimerYield(timerStage)
        // 尚未通關 1-1 的玩家 → 離線獎勵未解鎖
        const hasCleared = storyProgress.chapter > 1 || storyProgress.stage > 1
        return (
          <div className="menu-progress-group">
            <div className="menu-progress-header">
              <span className="menu-progress-stage">🗺️ 關卡進度：{storyText}</span>
              {hasCleared && (
                <span className="menu-progress-speed disp-flex-center" title="離線資源產出速度">
                  產速：<CurrencyIcon type="gold" />{speed.goldPerHour}/h · <CurrencyIcon type="exp" />{speed.expPerHour}/h
                </span>
              )}
            </div>
            {hasCleared ? (
              <>
                <div className="menu-progress-hint">通關越多，離線產出速度越快！</div>
                <div className="menu-timer-row">
                  <div className="menu-timer-info">
                    {resourcePreview && resourcePreview.gold > 0 ? (
                      <>
                        <span className="disp-flex-center">⏱️ 待領取：<CurrencyIcon type="gold" />{resourcePreview.gold.toLocaleString()} / <CurrencyIcon type="exp" />{resourcePreview.exp.toLocaleString()}</span>
                        <span className="menu-timer-hours">({resourcePreview.hoursElapsed}h 累積)</span>
                      </>
                    ) : (
                      <span>⏱️ 離線產出累積中...</span>
                    )}
                  </div>
                  {resourcePreview && resourcePreview.gold > 0 ? (
                    <button className="menu-timer-btn" onClick={() => {
                      onCollectResources?.()
                      // 領取後立即刷新預覽（lastCollect 已更新，金額歸零）
                      setTimeout(refreshPreview, 300)
                    }}>
                      領取
                    </button>
                  ) : (
                    <span className="menu-timer-idle">累積中...</span>
                  )}
                </div>
              </>
            ) : (
              <div className="menu-progress-hint">⚔️ 通關 1-1 後解鎖離線獎勵！</div>
            )}
          </div>
        )
      })()}

      {/* ── 功能按鈕列 ── */}
      <div className="menu-grid">
        {MENU_ITEMS.map((item) => {
          const locked = isItemLocked(item)
          return (
            <button
              key={item.key}
              className={`menu-card ${locked ? 'menu-card-locked' : ''}`}
              style={{ '--card-accent': locked ? '#555' : item.color } as React.CSSProperties}
              onClick={() => handleClick(item)}
            >
              <span className="menu-card-icon">{locked ? '🔒' : item.icon}</span>
              <span className="menu-card-label">{item.label}</span>
              <span className="menu-card-sub">{locked ? item.unlock!.hint : item.sub}</span>
              {item.key === 'mailbox' && !locked && mailUnclaimedCount > 0 && (
                <RedDot count={mailUnclaimedCount} />
              )}
              {item.key === 'checkin' && !locked && checkinNeeded && (
                <RedDot size="sm" />
              )}
              {item.key === 'stages' && !locked && stagesHasDaily && (
                <RedDot size="sm" />
              )}
              {item.key === 'gacha' && !locked && gachaHasFreePull && (
                <RedDot size="sm" />
              )}
              {item.key === 'arena' && !locked && arenaChallengesLeft > 0 && (
                <RedDot size="sm" />
              )}
              {item.key === 'heroes' && !locked && heroesHasStarUp && (
                <RedDot size="sm" />
              )}
            </button>
          )
        })}
      </div>

      {/* 鎖定提示 */}
      {lockToast && (
        <div className="menu-lock-toast">{lockToast}</div>
      )}

      {/* ── 底部 ── */}
      <div className="menu-footer">
        <span>全球感染 v0.2</span>
      </div>
    </div>
  )
}
