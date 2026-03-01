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
import { expToNextLevel } from '../domain/progressionSystem'

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
  getResourcePreview?: () => { gold: number; expItems: number; hoursElapsed: number } | null
  /** 信箱未領取獎勵數量（>0 顯示紅點） */
  mailUnclaimedCount?: number
  /** 隊伍總戰力 */
  combatPower?: number
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
  { key: 'stages',    icon: '🗺️', label: '關卡',  sub: '主線·爬塔·副本',   color: '#457b9d' },
  { key: 'heroes',    icon: '🧟', label: '英雄',  sub: '養成·突破·升星',   color: '#2a9d8f', unlock: { chapter: 1, stage: 2, hint: '通關 1-1 後解鎖' } },
  { key: 'gacha',     icon: '🎰', label: '召喚',  sub: '招募新同伴',       color: '#e9c46a', unlock: { chapter: 1, stage: 3, hint: '通關 1-2 後解鎖' } },
  { key: 'inventory', icon: '🎒', label: '背包',  sub: '道具·裝備',        color: '#f4a261', unlock: { chapter: 1, stage: 2, hint: '通關 1-1 後解鎖' } },
  { key: 'arena',     icon: '⚔️', label: '競技場', sub: '排名·對戰·獎勵',  color: '#e74c3c', unlock: { chapter: 2, stage: 1, hint: '通關 1-8 後解鎖' } },
  { key: 'shop',      icon: '🏪', label: '商店',  sub: '購買素材·禮包',    color: '#72b01d', unlock: { chapter: 1, stage: 3, hint: '通關 1-2 後解鎖' } },
  { key: 'mailbox',   icon: '📬', label: '信箱',  sub: '信件·獎勵',        color: '#7ec8e3' },
  { key: 'settings',  icon: '⚙️', label: '設定',  sub: '帳號·綁定',        color: '#888' },
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
  const level = saveData?.level ?? 1
  const curExp = saveData?.exp ?? 0
  const needed = expToNextLevel(level)
  const expPct = needed > 0 ? Math.min(100, (curExp / needed) * 100) : 100
  const gold = saveData?.gold ?? 0
  const diamond = saveData?.diamond ?? 0
  const story = saveData?.storyProgress
  const storyText = story ? `${story.chapter}-${story.stage}` : '1-1'
  const storyProgress = story ?? { chapter: 1, stage: 1 }

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
          <span className="menu-player-level" title="指揮官等級 — 提升等級解鎖更多功能與內容">Lv.{level}</span>
          <div className="menu-exp-wrap" title={`EXP ${curExp} / ${needed}`}>
            <div className="menu-exp-bar">
              <div className="menu-exp-fill" style={{ width: `${expPct}%` }} />
            </div>
            <span className="menu-exp-text">{curExp}/{needed}</span>
          </div>
        </div>
        <div className="menu-resources">
          <span className="menu-res-item menu-gold" title="金幣 — 升級、購買、強化"><CurrencyIcon type="gold" />{gold.toLocaleString()}</span>
          <span className="menu-res-item menu-diamond" title="鑽石 — 召喚、加速、購買稀有道具"><CurrencyIcon type="diamond" />{diamond.toLocaleString()}</span>
          <span className="menu-res-item menu-cp" title="隊伍戰力">⚡{combatPower.toLocaleString()}</span>
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
                <span className="menu-progress-speed">
                  產速：<CurrencyIcon type="gold" />{speed.goldPerHour}/h · <CurrencyIcon type="exp" />{speed.expItemsPerHour}/h
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
                        <span>⏱️ 待領取：<CurrencyIcon type="gold" />{resourcePreview.gold.toLocaleString()} / <CurrencyIcon type="exp" />{resourcePreview.expItems}</span>
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
                <span className="menu-card-badge">{mailUnclaimedCount > 99 ? '99+' : mailUnclaimedCount}</span>
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
