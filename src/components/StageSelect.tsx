/**
 * StageSelect — 關卡選擇面板
 *
 * 三大模式：主線關卡、無盡爬塔、每日副本
 * 各模式根據玩家進度解鎖。
 */

import { useState, useMemo } from 'react'
import {
  isModeUnlocked,
  getTodayDungeons,
  getTowerFloorConfig,
  type DailyDungeon,
} from '../domain/stageSystem'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface StageSelectProps {
  /** 玩家當前劇情進度 */
  storyProgress: { chapter: number; stage: number }
  /** 玩家爬塔樓層 */
  towerFloor: number
  /** 返回主選單 */
  onBack: () => void
  /** 選擇關卡後進入戰鬥準備 */
  onSelectStage: (mode: 'story' | 'tower' | 'daily', stageId: string) => void
}

/* ────────────────────────────
   Mode Tabs
   ──────────────────────────── */

type StageMode = 'story' | 'tower' | 'daily'

interface ModeTab {
  key: StageMode
  icon: string
  label: string
  unlockMode: 'tower' | 'daily' | null
}

const MODE_TABS: ModeTab[] = [
  { key: 'story', icon: '📖', label: '主線',   unlockMode: null },
  { key: 'tower', icon: '🗼', label: '爬塔',   unlockMode: 'tower' },
  { key: 'daily', icon: '📅', label: '每日副本', unlockMode: 'daily' },
]

/* ────────────────────────────
   Story Stages
   ──────────────────────────── */

function StoryStages({
  storyProgress,
  onSelect,
}: {
  storyProgress: { chapter: number; stage: number }
  onSelect: (stageId: string) => void
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

        return { stageId, stage: st, cleared, current, locked }
      })
      return { chapter: ch, stages }
    })
  }, [currentChapter, currentStage])

  return (
    <div className="stage-story">
      {chapters.map((ch) => (
        <div key={ch.chapter} className="stage-chapter">
          <h3 className="stage-chapter-title">第 {ch.chapter} 章</h3>
          <div className="stage-list">
            {ch.stages.map((s) => (
              <button
                key={s.stageId}
                className={`stage-btn ${s.cleared ? 'stage-cleared' : ''} ${s.current ? 'stage-current' : ''} ${s.locked ? 'stage-locked' : ''}`}
                disabled={s.locked}
                onClick={() => onSelect(s.stageId)}
              >
                <span className="stage-btn-id">{s.stageId}</span>
                {s.cleared && <span className="stage-btn-stars">⭐⭐⭐</span>}
                {s.current && <span className="stage-btn-badge">📍</span>}
                {s.locked && <span className="stage-btn-lock">🔒</span>}
              </button>
            ))}
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
          <span>金幣 {floorConfig.rewards.gold}</span>
        </div>
        <div className="tower-info-row">
          <span>獎勵經驗</span>
          <span>📗 {floorConfig.rewards.exp}</span>
        </div>
        {(floorConfig.rewards.diamond ?? 0) > 0 && (
          <div className="tower-info-row">
            <span>獎勵鑽石</span>
            <span>💎 {floorConfig.rewards.diamond}</span>
          </div>
        )}
      </div>

      <button
        className="tower-challenge-btn"
        onClick={() => onSelect(`tower-${currentFloor}`)}
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
        const availableTiers = dungeon.difficulties.filter(
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
   Main Component
   ──────────────────────────── */

export function StageSelect({
  storyProgress,
  towerFloor,
  onBack,
  onSelectStage,
}: StageSelectProps) {
  const [activeMode, setActiveMode] = useState<StageMode>('story')

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
                disabled={!unlocked}
                onClick={() => setActiveMode(tab.key)}
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
              onSelect={(id) => onSelectStage('story', id)}
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
        </div>
      </div>
    </div>
  )
}
