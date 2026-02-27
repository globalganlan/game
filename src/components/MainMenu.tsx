/**
 * MainMenu — 主選單導航中心
 *
 * 登入後的首頁，提供各功能入口：
 * 戰鬥（自由 / 關卡）、英雄管理、背包、召喚、設定
 */

import type { MenuScreen } from '../types'
import type { SaveData } from '../services/saveService'
import { getTimerYield } from '../services/saveService'

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
  /** 資源預覽 */
  resourcePreview?: { gold: number; expItems: number; hoursElapsed: number } | null
  /** 信箱未領取獎勵數量（>0 顯示紅點） */
  mailUnclaimedCount?: number
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
}

const MENU_ITEMS: MenuItem[] = [
  { key: 'stages',    icon: '🗺️', label: '關卡',  sub: '主線·爬塔·副本',   color: '#457b9d' },
  { key: 'heroes',    icon: '🧟', label: '英雄',  sub: '養成·突破·升星',   color: '#2a9d8f' },
  { key: 'gacha',     icon: '🎰', label: '召喚',  sub: '招募新同伴',       color: '#e9c46a' },
  { key: 'inventory', icon: '🎒', label: '背包',  sub: '道具·裝備',        color: '#f4a261' },
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
  resourcePreview,
  mailUnclaimedCount = 0,
}: MainMenuProps) {
  const name = saveData?.displayName || '倖存者'
  const level = saveData?.level ?? 1
  const gold = saveData?.gold ?? 0
  const diamond = saveData?.diamond ?? 0
  const story = saveData?.storyProgress
  const storyText = story ? `${story.chapter}-${story.stage}` : '1-1'

  const handleClick = (item: MenuItem) => {
    onNavigate(item.key as MenuScreen)
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
        </div>
        <div className="menu-resources">
          <span className="menu-res-item menu-gold" title="金幣 — 升級、購買、強化"><i className="icon-coin">G</i>{gold.toLocaleString()}</span>
          <span className="menu-res-item menu-diamond" title="鑽石 — 召喚、加速、購買稀有道具"><i className="icon-dia">D</i>{diamond.toLocaleString()}</span>
        </div>
      </div>

      {/* ── 離線產出（與關卡進度群組化） ── */}
      {(() => {
        const timerStage = saveData?.resourceTimerStage || '1-1'
        const speed = getTimerYield(timerStage)
        return (
          <div className="menu-progress-group">
            <div className="menu-progress-header">
              <span className="menu-progress-stage">🗺️ 關卡進度：{storyText}</span>
              <span className="menu-progress-speed">
                產速：<i className="icon-coin">G</i>{speed.goldPerHour}/h · <i className="icon-exp">E</i>{speed.expItemsPerHour}/h
              </span>
            </div>
            <div className="menu-progress-hint">通關越多，離線產出速度越快！</div>
            <div className="menu-timer-row">
              <div className="menu-timer-info">
                {resourcePreview && resourcePreview.gold > 0 ? (
                  <>
                    <span>⏱️ 待領取：<i className="icon-coin">G</i>{resourcePreview.gold.toLocaleString()} / <i className="icon-exp">E</i>{resourcePreview.expItems}</span>
                    <span className="menu-timer-hours">({resourcePreview.hoursElapsed}h 累積)</span>
                  </>
                ) : (
                  <span>⏱️ 離線產出累積中...</span>
                )}
              </div>
              {resourcePreview && resourcePreview.gold > 0 ? (
                <button className="menu-timer-btn" onClick={onCollectResources}>
                  領取
                </button>
              ) : (
                <span className="menu-timer-idle">累積中...</span>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── 功能按鈕列 ── */}
      <div className="menu-grid">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.key}
            className="menu-card"
            style={{ '--card-accent': item.color } as React.CSSProperties}
            onClick={() => handleClick(item)}
          >
            <span className="menu-card-icon">{item.icon}</span>
            <span className="menu-card-label">{item.label}</span>
            <span className="menu-card-sub">{item.sub}</span>
            {item.key === 'mailbox' && mailUnclaimedCount > 0 && (
              <span className="menu-card-badge">{mailUnclaimedCount > 99 ? '99+' : mailUnclaimedCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── 底部 ── */}
      <div className="menu-footer">
        <span>全球感染 v0.2</span>
      </div>
    </div>
  )
}
