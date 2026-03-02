/**
 * StageSelect — 關卡選擇面板
 *
 * 主線關卡從 Workers API 動態載入（stage_configs D1 表），
 * 其他模式（爬塔/每日/PvP/Boss）保持 domain 層邏輯。
 *
 * UI 特色：
 *  - 每章有獨立主題色（城市灰/森林綠/荒原橘）
 *  - 關卡卡片顯示名稱、難度星、推薦等級、獎勵預覽
 *  - Boss 關有特殊金框
 */

import { useState, useMemo, useEffect } from 'react'
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
import { fetchStageConfigs, type StageConfigFromAPI } from '../services/stageService'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface StageSelectProps {
  storyProgress: { chapter: number; stage: number }
  towerFloor: number
  stageStars: Record<string, number>
  onBack: () => void
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
  { key: 'story', icon: '📖', label: '主線', unlockMode: null },
  { key: 'tower', icon: '🗼', label: '爬塔', unlockMode: 'tower' },
  { key: 'daily', icon: '📅', label: '每日副本', unlockMode: 'daily' },
  { key: 'pvp', icon: '⚔️', label: '競技場', unlockMode: 'pvp' },
  { key: 'boss', icon: '👹', label: '首領', unlockMode: 'boss' },
]

/* ────────────────────────────
   章節主題定義
   ──────────────────────────── */

const CHAPTER_THEMES: Record<number, {
  icon: string; gradient: string; accentColor: string; borderColor: string
}> = {
  1: {
    icon: '🏙️',
    gradient: 'linear-gradient(135deg, rgba(74,85,104,0.35), rgba(45,55,72,0.15))',
    accentColor: '#a0aec0',
    borderColor: 'rgba(160,174,192,0.35)',
  },
  2: {
    icon: '🌲',
    gradient: 'linear-gradient(135deg, rgba(39,103,73,0.35), rgba(34,84,61,0.15))',
    accentColor: '#68d391',
    borderColor: 'rgba(104,211,145,0.35)',
  },
  3: {
    icon: '🏜️',
    gradient: 'linear-gradient(135deg, rgba(156,66,33,0.35), rgba(124,45,18,0.15))',
    accentColor: '#ed8936',
    borderColor: 'rgba(237,137,54,0.35)',
  },
}

/* ────────────────────────────
   Difficulty Skulls
   ──────────────────────────── */

function DifficultyStars({ level }: { level: number }) {
  return (
    <span className="sc-difficulty">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= level ? 'sc-diff-filled' : 'sc-diff-empty'}>💀</span>
      ))}
    </span>
  )
}

/* ────────────────────────────
   Story Stages (API-driven)
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
  const [configs, setConfigs] = useState<StageConfigFromAPI[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedChapter, setSelectedChapter] = useState(storyProgress.chapter)

  useEffect(() => {
    let cancelled = false
    fetchStageConfigs()
      .then(data => { if (!cancelled) { setConfigs(data); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const playerProgress = (storyProgress.chapter - 1) * 8 + storyProgress.stage

  const chapters = useMemo(() => {
    const map = new Map<number, StageConfigFromAPI[]>()
    for (const cfg of configs) {
      const arr = map.get(cfg.chapter) || []
      arr.push(cfg)
      map.set(cfg.chapter, arr)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([ch, stages]) => ({ chapter: ch, stages: stages.sort((a, b) => a.stage - b.stage) }))
  }, [configs])

  const currentChapter = chapters.find(c => c.chapter === selectedChapter)
  const theme = CHAPTER_THEMES[selectedChapter] || CHAPTER_THEMES[1]

  if (loading) {
    return <div className="sc-loading">⏳ 載入關卡資料中…</div>
  }

  if (chapters.length === 0) {
    return <div className="sc-loading">暫無關卡資料</div>
  }

  return (
    <div className="sc-story">
      {/* 章節選擇器 */}
      <div className="sc-chapter-tabs">
        {chapters.map(ch => {
          const t = CHAPTER_THEMES[ch.chapter] || CHAPTER_THEMES[1]
          const chExtra = ch.stages[0]?.extra
          const chapterName = chExtra?.chapterName || `第 ${ch.chapter} 章`
          const chapterIcon = chExtra?.chapterIcon || t.icon
          const isActive = selectedChapter === ch.chapter
          return (
            <button
              key={ch.chapter}
              className={`sc-chapter-tab ${isActive ? 'sc-chapter-active' : ''}`}
              style={{
                borderColor: isActive ? t.accentColor : 'transparent',
                color: isActive ? t.accentColor : '#999',
                background: isActive ? t.gradient : 'transparent',
              }}
              onClick={() => setSelectedChapter(ch.chapter)}
            >
              <span className="sc-chapter-tab-icon">{chapterIcon}</span>
              <span className="sc-chapter-tab-name">{chapterName}</span>
            </button>
          )
        })}
      </div>

      {/* 章節描述 Banner */}
      {currentChapter && currentChapter.stages[0]?.extra?.description && (
        <div className="sc-chapter-banner" style={{ background: theme.gradient, borderColor: theme.borderColor }}>
          <span className="sc-chapter-banner-text">
            {currentChapter.stages[0].extra.description}
          </span>
        </div>
      )}

      {/* 關卡卡片 */}
      {currentChapter && (
        <div className="sc-stage-grid">
          {currentChapter.stages.map(cfg => {
            const linearIdx = (cfg.chapter - 1) * 8 + cfg.stage
            const cleared = linearIdx < playerProgress
            const current = linearIdx === playerProgress
            const locked = linearIdx > playerProgress
            const bestStars = stageStars[cfg.stageId] || 0
            const displayStars = cleared && bestStars === 0 ? 3 : bestStars
            const is3Star = displayStars >= 3
            const isBoss = cfg.extra?.isBoss || false

            return (
              <button
                key={cfg.stageId}
                className={`sc-stage-card ${cleared ? 'sc-cleared' : ''} ${current ? 'sc-current' : ''} ${locked ? 'sc-locked' : ''} ${is3Star ? 'sc-maxed' : ''} ${isBoss ? 'sc-boss-stage' : ''}`}
                style={{
                  borderColor: current ? theme.accentColor
                    : isBoss && !locked ? 'rgba(233,196,106,0.5)'
                      : cleared ? theme.borderColor : undefined,
                }}
                disabled={is3Star}
                onClick={() => {
                  if (locked) { onLockedClick(cfg.stageId); return }
                  onSelect(cfg.stageId)
                }}
              >
                {/* Header */}
                <div className="sc-card-header">
                  <span className="sc-card-id">{cfg.stageId}</span>
                  {isBoss && <span className="sc-card-boss-badge">首領</span>}
                  {locked && <span className="sc-card-lock">🔒</span>}
                  {current && <span className="sc-card-current">📍</span>}
                  {is3Star && <span className="sc-card-complete">✅</span>}
                </div>

                {/* 名稱 */}
                <div className="sc-card-name">{cfg.extra?.stageName || `關卡 ${cfg.stage}`}</div>

                {/* 難度 */}
                <DifficultyStars level={cfg.extra?.difficulty || 1} />

                {/* 推薦等級 + 敵人數量 */}
                <div className="sc-card-meta">
                  <span className="sc-card-rec">Lv.{cfg.extra?.recommendedLevel || 1}</span>
                  <span className="sc-card-enemy-count">👾×{cfg.enemies.length}</span>
                </div>

                {/* 獎勵 */}
                <div className="sc-card-rewards">
                  <span><CurrencyIcon type="gold" />{cfg.rewards.gold}</span>
                  {(cfg.rewards.diamond ?? 0) > 0 && (
                    <span><CurrencyIcon type="diamond" />{cfg.rewards.diamond}</span>
                  )}
                </div>

                {/* 星級 */}
                {cleared && (
                  <div className="sc-card-stars">
                    {[1, 2, 3].map(i => (
                      <span key={i} className={i <= displayStars ? 'sc-star-earned' : 'sc-star-empty'}>
                        {i <= displayStars ? '⭐' : '☆'}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
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
          <span>首領層</span>
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

      {today.map((dungeon: DailyDungeon) => (
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
      ))}
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
              <span className="pvp-opponent-power">{opp.power.toLocaleString()}</span>
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
          const requiredProgress = idx === 0 ? 16 : idx === 1 ? 20 : 24
          const unlocked = progress >= requiredProgress
          return (
            <div key={boss.bossId} className={`boss-card ${!unlocked ? 'boss-card-locked' : ''}`}>
              <div className="boss-card-header">
                <span className="boss-card-name">{boss.name}</span>
                {!unlocked && <span className="boss-card-lock">🔒</span>}
              </div>
              <div className="boss-card-stats">
                <span>生命 {boss.hp.toLocaleString()}</span>
                <span>攻擊 {boss.atk}</span>
                <span>速度 {boss.speed}</span>
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
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🗺️ 關卡選擇</h2>
        </div>

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

        {lockToast && (
          <div className="stage-lock-toast">{lockToast}</div>
        )}
      </div>
    </div>
  )
}
