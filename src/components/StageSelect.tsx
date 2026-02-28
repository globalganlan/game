/**
 * StageSelect — 關卡選擇面板
 *
 * 三大模式：主線關卡、無盡爬塔、每日副本
 * 各模式根據玩家進度解鎖。
 */

import { useState, useMemo } from 'react'
import {
  isModeUnlocked,
  MODE_UNLOCK,
  getTodayDungeons,
  getTowerFloorConfig,
  getPvPOpponents,
  BOSS_CONFIGS,
  type DailyDungeon,
  type PvPOpponent,
  type BossConfig,
} from '../domain/stageSystem'
import { CurrencyIcon } from './CurrencyIcon'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface StageSelectProps {
  /** 玩家當前劇情進度 */
  storyProgress: { chapter: number; stage: number }
  /** 玩家爬塔樓層 */
  towerFloor: number
  /** 各關卡最佳星級 */
  stageStars: Record<string, number>
  /** 返回主選單 */
  onBack: () => void
  /** 選擇關卡後進入戰鬥準備 */
  onSelectStage: (mode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss', stageId: string) => void
}

/* ────────────────────────────
   Mode Tabs
   ──────────────────────────── */

type StageMode = 'story' | 'tower' | 'daily' | 'pvp' | 'boss'

interface ModeTab {
  key: StageMode
  icon: string
  label: string
  unlockMode: 'tower' | 'daily' | 'pvp' | 'boss' | null
}

const MODE_TABS: ModeTab[] = [
  { key: 'story', icon: '📖', label: '主線',   unlockMode: null },
  { key: 'tower', icon: '🗼', label: '爬塔',   unlockMode: 'tower' },
  { key: 'daily', icon: '📅', label: '每日副本', unlockMode: 'daily' },
  { key: 'pvp',   icon: '⚔️', label: '競技場', unlockMode: 'pvp' },
  { key: 'boss',  icon: '👹', label: 'Boss',   unlockMode: 'boss' },
]

/* ────────────────────────────
   Story Stages
   ──────────────────────────── */

function StoryStages({
  storyProgress,
  stageStars,
  onSelect,
  onLockedClick,
}: {
  storyProgress: { chapter: number; stage: number }
  stageStars: Record<string, number>
  onSelect: (stageId: string) => void
  onLockedClick: (stageId: string) => void
}) {
  const currentChapter = storyProgress.chapter
  const currentStage = storyProgress.stage

  // Generate chapters 1-3 with 8 stages each
  const chapters = useMemo(() => {
    return Array.from({ length: 3 }, (_, ci) => {
      const ch = ci + 1
      const stages = Array.from({ length: 8 }, (_, si) => {
        const st = si + 1
        const stageId = `${ch}-${st}`
        const progress = (ch - 1) * 8 + st
        const playerProgress = (currentChapter - 1) * 8 + currentStage
        const cleared = progress < playerProgress
        const current = progress === playerProgress
        const locked = progress > playerProgress
        const bestStars = stageStars[stageId] || 0
        const maxStars = cleared && bestStars === 0 ? 3 : bestStars // fallback: cleared前端視為3星

        return { stageId, stage: st, cleared, current, locked, bestStars: maxStars }
      })
      return { chapter: ch, stages }
    })
  }, [currentChapter, currentStage, stageStars])

  return (
    <div className="stage-story">
      {chapters.map((ch) => (
        <div key={ch.chapter} className="stage-chapter">
          <h3 className="stage-chapter-title">第 {ch.chapter} 章</h3>
          <div className="stage-list">
            {ch.stages.map((s) => {
              const is3Star = s.bestStars >= 3
              return (
                <button
                  key={s.stageId}
                  className={`stage-btn ${s.cleared ? 'stage-cleared' : ''} ${s.current ? 'stage-current' : ''} ${s.locked ? 'stage-locked' : ''} ${is3Star ? 'stage-maxed' : ''}`}
                  disabled={is3Star}
                  onClick={() => {
                    if (s.locked) { onLockedClick(s.stageId); return }
                    onSelect(s.stageId)
                  }}
                >
                  <span className="stage-btn-id">{s.stageId}</span>
                  {s.cleared && (
                    <span className="stage-btn-stars">
                      {[1, 2, 3].map(i => (
                        <span key={i} className={i <= s.bestStars ? 'star-active' : 'star-empty'}>
                          {i <= s.bestStars ? '⭐' : '☆'}
                        </span>
                      ))}
                    </span>
                  )}
                  {s.current && <span className="stage-btn-badge">📍</span>}
                  {s.locked && <span className="stage-btn-lock">🔒</span>}
                  {is3Star && <span className="stage-btn-complete">✅</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────
   Tower
   ──────────────────────────── */

function TowerPanel({
  currentFloor,
  onSelect,
}: {
  currentFloor: number
  onSelect: (floor: string) => void
}) {
  const floorConfig = getTowerFloorConfig(currentFloor)

  return (
    <div className="stage-tower">
      <div className="tower-current">
        <div className="tower-floor-big">{currentFloor}F</div>
        <div className="tower-floor-label">當前樓層</div>
      </div>

      <div className="tower-info">
        <div className="tower-info-row">
          <span>敵人數量</span>
          <span>{floorConfig.enemies.length}</span>
        </div>
        <div className="tower-info-row">
          <span>Boss 層</span>
          <span>{floorConfig.isBoss ? '✅ 是' : '否'}</span>
        </div>
        <div className="tower-info-row">
          <span>獎勵金幣</span>
          <span><CurrencyIcon type="gold" /> {floorConfig.rewards.gold}</span>
        </div>
        <div className="tower-info-row">
          <span>獎勵經驗</span>
          <span><CurrencyIcon type="exp" /> {floorConfig.rewards.exp}</span>
        </div>
        {(floorConfig.rewards.diamond ?? 0) > 0 && (
          <div className="tower-info-row">
            <span>獎勵鑽石</span>
            <span><CurrencyIcon type="diamond" /> {floorConfig.rewards.diamond}</span>
          </div>
        )}
      </div>

      <button
        className="tower-challenge-btn"
        onClick={() => onSelect(String(currentFloor))}
      >
        ⚔️ 挑戰第 {currentFloor} 層
      </button>
    </div>
  )
}

/* ────────────────────────────
   Daily Dungeons
   ──────────────────────────── */

function DailyPanel({
  storyProgress,
  onSelect,
}: {
  storyProgress: { chapter: number; stage: number }
  onSelect: (dungeonId: string) => void
}) {
  const today = getTodayDungeons()
  const dayNames = ['日', '一', '二', '三', '四', '五', '六']
  const dayOfWeek = new Date().getDay()

  return (
    <div className="stage-daily">
      <div className="daily-header">
        <span>今天是星期{dayNames[dayOfWeek]}</span>
      </div>

      {today.length === 0 && (
        <div className="daily-empty">今日無開放副本</div>
      )}

      {today.map((dungeon: DailyDungeon) => {
        const _availableTiers = dungeon.difficulties.filter(
          d => storyProgress.chapter >= d.requiredChapter,
        )

        return (
          <div key={dungeon.dungeonId} className="daily-dungeon-card">
            <div className="daily-dungeon-header">
              <span className="daily-dungeon-name">{dungeon.name}</span>
              <span className="daily-dungeon-days">
                開放日：{dungeon.availableDays.map(d => dayNames[d]).join('、')}
              </span>
            </div>
            <div className="daily-dungeon-tiers">
              {dungeon.difficulties.map((diff) => {
                const unlocked = storyProgress.chapter >= diff.requiredChapter
                const tierLabel = { easy: '簡單', normal: '普通', hard: '困難' }[diff.tier]
                return (
                  <button
                    key={diff.tier}
                    className={`daily-tier-btn ${unlocked ? '' : 'daily-tier-locked'}`}
                    disabled={!unlocked}
                    onClick={() => onSelect(`${dungeon.dungeonId}_${diff.tier}`)}
                  >
                    <span>{tierLabel}</span>
                    {!unlocked && <span className="daily-tier-req">需第{diff.requiredChapter}章</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ────────────────────────────
   PvP 競技場
   ──────────────────────────── */

function PvPPanel({
  storyProgress,
  onSelect,
}: {
  storyProgress: { chapter: number; stage: number }
  onSelect: (opponentId: string) => void
}) {
  const opponents = useMemo(
    () => getPvPOpponents(storyProgress),
    [storyProgress],
  )
  const difficulties = ['💚 一般', '💛 菁英', '❤️ 強敵']

  return (
    <div className="stage-pvp">
      <div className="pvp-header">
        <span className="pvp-title">⚔️ 競技場</span>
        <span className="pvp-subtitle">每日對手陣容，勝利可獲得競技幣</span>
      </div>
      <div className="pvp-opponent-list">
        {opponents.map((opp: PvPOpponent, idx: number) => (
          <div key={opp.opponentId} className="pvp-opponent-card">
            <div className="pvp-opponent-header">
              <span className="pvp-opponent-name">{difficulties[idx]} {opp.name}</span>
              <span className="pvp-opponent-power">⚡ {opp.power.toLocaleString()}</span>
            </div>
            <div className="pvp-opponent-info">
              <span>編隊：{opp.enemies.length} 名</span>
            </div>
            <button
              className="pvp-challenge-btn"
              onClick={() => onSelect(opp.opponentId)}
            >
              挑戰
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────
   Boss 挑戰
   ──────────────────────────── */

function BossPanel2({
  storyProgress,
  onSelect,
}: {
  storyProgress: { chapter: number; stage: number }
  onSelect: (bossId: string) => void
}) {
  const progress = (storyProgress.chapter - 1) * 8 + storyProgress.stage

  return (
    <div className="stage-boss">
      <div className="boss-header">
        <span className="boss-title">👹 Boss 挑戰</span>
        <span className="boss-subtitle">限時 30 回合，以傷害量評價 S/A/B/C 級</span>
      </div>
      <div className="boss-list">
        {BOSS_CONFIGS.map((boss: BossConfig, idx: number) => {
          const requiredProgress = idx === 0 ? 16 : idx === 1 ? 20 : 24 // 2-8, 3-4, 3-8
          const unlocked = progress >= requiredProgress
          return (
            <div key={boss.bossId} className={`boss-card ${!unlocked ? 'boss-card-locked' : ''}`}>
              <div className="boss-card-header">
                <span className="boss-card-name">{boss.name}</span>
                {!unlocked && <span className="boss-card-lock">🔒</span>}
              </div>
              <div className="boss-card-stats">
                <span>HP {boss.hp.toLocaleString()}</span>
                <span>ATK {boss.atk}</span>
                <span>SPD {boss.speed}</span>
              </div>
              <div className="boss-card-thresholds">
                <span className="rank-s">S ≥{boss.damageThresholds.S.toLocaleString()}</span>
                <span className="rank-a">A ≥{boss.damageThresholds.A.toLocaleString()}</span>
                <span className="rank-b">B ≥{boss.damageThresholds.B.toLocaleString()}</span>
              </div>
              <button
                className="boss-challenge-btn"
                disabled={!unlocked}
                onClick={() => onSelect(boss.bossId)}
              >
                {unlocked ? '⚔️ 挑戰' : `通關 ${Math.ceil(requiredProgress / 8)}-${requiredProgress % 8 || 8} 解鎖`}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────
   Main Component
   ──────────────────────────── */

export function StageSelect({
  storyProgress,
  towerFloor,
  stageStars,
  onBack,
  onSelectStage,
}: StageSelectProps) {
  const [activeMode, setActiveMode] = useState<StageMode>('story')
  const [lockToast, setLockToast] = useState<string | null>(null)

  /** 點擊未解鎖tab時顯示 toast */
  const handleTabClick = (tab: ModeTab) => {
    if (tab.unlockMode && !isModeUnlocked(tab.unlockMode, storyProgress)) {
      const req = MODE_UNLOCK[tab.unlockMode]
      setLockToast(`通關 ${req.chapter}-${req.stage} 後解鎖「${tab.label}」玩法`)
      setTimeout(() => setLockToast(null), 2500)
      return
    }
    setActiveMode(tab.key)
  }

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🗺️ 關卡選擇</h2>
        </div>

        {/* Mode Tabs */}
        <div className="stage-mode-tabs">
          {MODE_TABS.map((tab) => {
            const unlocked = tab.unlockMode
              ? isModeUnlocked(tab.unlockMode, storyProgress)
              : true

            return (
              <button
                key={tab.key}
                className={`stage-mode-tab ${activeMode === tab.key ? 'stage-mode-active' : ''} ${!unlocked ? 'stage-mode-locked' : ''}`}
                onClick={() => handleTabClick(tab)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {!unlocked && <span className="stage-mode-lock">🔒</span>}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="stage-content">
          {activeMode === 'story' && (
            <StoryStages
              storyProgress={storyProgress}
              stageStars={stageStars}
              onSelect={(id) => onSelectStage('story', id)}
              onLockedClick={(id) => {
                setLockToast(`請先通關前一關再挑戰 ${id}`)
                setTimeout(() => setLockToast(null), 2500)
              }}
            />
          )}
          {activeMode === 'tower' && (
            <TowerPanel
              currentFloor={towerFloor}
              onSelect={(id) => onSelectStage('tower', id)}
            />
          )}
          {activeMode === 'daily' && (
            <DailyPanel
              storyProgress={storyProgress}
              onSelect={(id) => onSelectStage('daily', id)}
            />
          )}
          {activeMode === 'pvp' && (
            <PvPPanel
              storyProgress={storyProgress}
              onSelect={(id) => onSelectStage('pvp', id)}
            />
          )}
          {activeMode === 'boss' && (
            <BossPanel2
              storyProgress={storyProgress}
              onSelect={(id) => onSelectStage('boss', id)}
            />
          )}
        </div>

        {/* 鎖定提示 */}
        {lockToast && (
          <div className="stage-lock-toast">{lockToast}</div>
        )}
      </div>
    </div>
  )
}
