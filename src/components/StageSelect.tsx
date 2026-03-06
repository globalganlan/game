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
  getTowerReward,
  getPvPReward,
  BOSS_CONFIGS,
  DAILY_LIMITS,
  getBossRewardByBossAndRank,
  type DailyDungeon,
  type PvPOpponent,
  type BossConfig,
} from '../domain/stageSystem'
import { fetchStageConfigs, type StageConfigFromAPI } from '../services/stageService'
import { callApi } from '../services/apiClient'
import { CurrencyIcon } from './CurrencyIcon'
import { ClickableItemIcon } from './ClickableItemIcon'
import { getItemName } from '../constants/rarity'
import { RedDot } from './RedDot'
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'

/* ────────────────────────────
   Daily Counts 型別
   ──────────────────────────── */

interface DailyCounts {
  daily: number
  pvp: number
  boss: number
  date: string
}

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface StageSelectProps {
  storyProgress: { chapter: number; stage: number }
  towerFloor: number
  onBack: () => void
  onSelectStage: (mode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss', stageId: string) => void
  /** App.tsx 已預先 fetch 的每日次數，用作初始值避免紅點閃現 */
  initialDailyCounts?: DailyCounts | null
  /** 從戰鬥返回時，自動切到對應的模式 tab */
  initialMode?: 'story' | 'tower' | 'daily' | 'pvp' | 'boss'
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
  { key: 'pvp', icon: '⚔️', label: '試煉場', unlockMode: 'pvp' },
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
  4: {
    icon: '🏭',
    gradient: 'linear-gradient(135deg, rgba(74,74,90,0.40), rgba(50,50,65,0.15))',
    accentColor: '#a0a4b8',
    borderColor: 'rgba(160,164,184,0.35)',
  },
  5: {
    icon: '🏥',
    gradient: 'linear-gradient(135deg, rgba(200,210,220,0.30), rgba(160,175,190,0.12))',
    accentColor: '#b2d8e8',
    borderColor: 'rgba(178,216,232,0.35)',
  },
  6: {
    icon: '🏘️',
    gradient: 'linear-gradient(135deg, rgba(180,140,80,0.35), rgba(140,100,50,0.15))',
    accentColor: '#e8c872',
    borderColor: 'rgba(232,200,114,0.35)',
  },
  7: {
    icon: '🅿️',
    gradient: 'linear-gradient(135deg, rgba(30,40,70,0.45), rgba(20,28,50,0.20))',
    accentColor: '#6888b0',
    borderColor: 'rgba(104,136,176,0.35)',
  },
  8: {
    icon: '☢️',
    gradient: 'linear-gradient(135deg, rgba(120,30,60,0.45), rgba(80,20,50,0.20))',
    accentColor: '#d86090',
    borderColor: 'rgba(216,96,144,0.35)',
  },
}

/* ────────────────────────────
   Difficulty Skulls
   ──────────────────────────── */

function DifficultyStars({ level }: { level: number }) {
  const labels = ['', '簡單', '普通', '中等', '困難', '極難']
  return (
    <span className="sc-difficulty" title={`難度：${labels[level] || level}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= level ? 'sc-diff-filled' : 'sc-diff-empty'}>⭐</span>
      ))}
    </span>
  )
}

/* ────────────────────────────
   Story Stages (API-driven)
   ──────────────────────────── */

function StoryStages({
  storyProgress,
  onSelect,
  onLockedClick,
}: {
  storyProgress: { chapter: number; stage: number }
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
            const isBoss = cfg.extra?.isBoss || false

            return (
              <button
                key={cfg.stageId}
                className={`sc-stage-card ${cleared ? 'sc-cleared sc-maxed' : ''} ${current ? 'sc-current' : ''} ${locked ? 'sc-locked' : ''} ${isBoss ? 'sc-boss-stage' : ''}`}
                style={{
                  borderColor: current ? theme.accentColor
                    : isBoss && !locked ? 'rgba(233,196,106,0.5)'
                      : cleared ? theme.borderColor : undefined,
                }}
                disabled={cleared}
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
                  {cleared && <span className="sc-card-complete">✅</span>}
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

                {/* 獎勵預覽 */}
                {cfg.rewards && (
                  <div className="sc-card-rewards">
                    {cfg.rewards.exp > 0 && <span className="sc-reward-tag"><CurrencyIcon type="exp" /> {cfg.rewards.exp}</span>}
                    {cfg.rewards.gold > 0 && <span className="sc-reward-tag"><CurrencyIcon type="gold" /> {cfg.rewards.gold}</span>}
                    {(cfg.rewards.diamond ?? 0) > 0 && <span className="sc-reward-tag"><CurrencyIcon type="diamond" /> {cfg.rewards.diamond}</span>}
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
  const reward = getTowerReward(currentFloor)

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
      </div>

      {/* 獎勵預覽 */}
      <div className="tower-rewards">
        <div className="tower-rewards-title">🎁 過關獎勵</div>
        <div className="tower-rewards-list">
          <span className="sc-reward-tag"><CurrencyIcon type="gold" /> {reward.gold}</span>
          <span className="sc-reward-tag"><CurrencyIcon type="exp" /> {reward.exp}</span>
          {reward.diamond ? <span className="sc-reward-tag"><CurrencyIcon type="diamond" /> {reward.diamond}</span> : null}
          {reward.items?.map((it, i) => (
            <span key={i} className="sc-reward-tag"><ClickableItemIcon itemId={it.itemId}> {getItemName(it.itemId)} ×{it.quantity}</ClickableItemIcon></span>
          ))}
        </div>
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
  dailyCounts,
}: {
  storyProgress: { chapter: number; stage: number }
  onSelect: (dungeonId: string) => void
  dailyCounts: DailyCounts | null
}) {
  const today = getTodayDungeons()
  const dayNames = ['日', '一', '二', '三', '四', '五', '六']
  const dayOfWeek = new Date().getDay()
  const used = dailyCounts?.daily ?? 0
  const limit = DAILY_LIMITS.daily
  const remaining = Math.max(0, limit - used)

  return (
    <div className="stage-daily">
      <div className="daily-header">
        <span>今天是星期{dayNames[dayOfWeek]}</span>
        <span className="daily-attempts">剩餘次數：{remaining}/{limit}</span>
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
              const noAttempts = remaining <= 0
              return (
                <button
                  key={diff.tier}
                  className={`daily-tier-btn ${!unlocked ? 'daily-tier-locked' : ''} ${noAttempts ? 'daily-tier-locked' : ''}`}
                  disabled={!unlocked || noAttempts}
                  onClick={() => onSelect(`${dungeon.dungeonId}_${diff.tier}`)}
                >
                  <span>{tierLabel}</span>
                  {!unlocked && <span className="daily-tier-req">需第{diff.requiredChapter}章</span>}
                  {/* 獎勵預覽 */}
                  {unlocked && (
                    <span className="daily-tier-rewards">
                      <CurrencyIcon type="gold" /> {diff.rewards.gold}
                      {' '}<CurrencyIcon type="exp" /> {diff.rewards.exp}
                      {diff.rewards.items?.filter(it => it.dropRate >= 1).slice(0, 2).map((it, i) => (
                        <span key={i}> <ClickableItemIcon itemId={it.itemId}>×{it.quantity}</ClickableItemIcon></span>
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {remaining <= 0 && (
        <div className="daily-exhausted">今日挑戰次數已用完，明天再來！</div>
      )}
    </div>
  )
}

/* ────────────────────────────
   PvP 競技場
   ──────────────────────────── */

function PvPPanel({
  storyProgress,
  onSelect,
  dailyCounts,
}: {
  storyProgress: { chapter: number; stage: number }
  onSelect: (opponentId: string) => void
  dailyCounts: DailyCounts | null
}) {
  const [opponents, setOpponents] = useState<PvPOpponent[]>([])
  const [loading, setLoading] = useState(true)

  const progress = (storyProgress.chapter - 1) * 8 + storyProgress.stage
  const used = dailyCounts?.pvp ?? 0
  const limit = DAILY_LIMITS.pvp
  const remaining = Math.max(0, limit - used)

  useEffect(() => {
    let cancelled = false
    callApi<{ opponents: PvPOpponent[] }>('pvp-opponents', {})
      .then(res => {
        if (!cancelled && res.success && res.opponents) {
          setOpponents(res.opponents)
        }
      })
      .catch(err => {
        console.warn('[PvP] 後端取得對手失敗，使用本地生成:', err)
        import('../domain/stageSystem').then(mod => {
          if (!cancelled) setOpponents(mod.getPvPOpponents(storyProgress))
        })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [storyProgress.chapter, storyProgress.stage])

  const difficulties = ['💚 一般', '💛 菁英', '❤️ 強敵']
  const noAttempts = remaining <= 0

  return (
    <div className="stage-pvp">
      <div className="pvp-header">
        <span className="pvp-title">⚔️ 試煉場</span>
        <span className="pvp-subtitle">每日對手陣容，勝利可獲得競技幣</span>
      </div>
      <div className="pvp-meta-row">
        <span className="daily-attempts">剩餘次數：{remaining}/{limit}</span>
      </div>
      {noAttempts && (
        <div className="daily-exhausted">今日挑戰次數已用完，明天再來！</div>
      )}
      {loading ? (
        <div className="sc-loading">⏳ 載入對手中…</div>
      ) : (
      <div className="pvp-opponent-list">
        {opponents.map((opp: PvPOpponent, idx: number) => {
          const oppReward = getPvPReward(progress, idx)
          return (
          <div key={opp.opponentId} className="pvp-opponent-card">
            <div className="pvp-opponent-header">
              <span className="pvp-opponent-name">{difficulties[idx]} {opp.name}</span>
              <span className="pvp-opponent-power">⚔️ 戰力 {opp.power.toLocaleString()}</span>
            </div>
            <div className="pvp-opponent-rewards" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: '0.75em', marginBottom: 6, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><CurrencyIcon type="gold" /> 金幣 {oppReward.gold}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><CurrencyIcon type="exp" /> 經驗 {oppReward.exp}</span>
              {(oppReward.diamond ?? 0) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><CurrencyIcon type="diamond" /> 鑽石 {oppReward.diamond}</span>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><CurrencyIcon type="pvp_coin" /> 試煉幣 {oppReward.items?.[0]?.quantity ?? 3}</span>
            </div>
            <button
              className="pvp-challenge-btn"
              disabled={noAttempts}
              onClick={() => onSelect(opp.opponentId)}
            >
              {noAttempts ? '次數已用完' : '挑戰'}
            </button>
          </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

/* ────────────────────────────
   Boss 挑戰
   ──────────────────────────── */

function BossPanel2({
  storyProgress,
  onSelect,
  dailyCounts,
}: {
  storyProgress: { chapter: number; stage: number }
  onSelect: (bossId: string) => void
  dailyCounts: DailyCounts | null
}) {
  const progress = (storyProgress.chapter - 1) * 8 + storyProgress.stage
  const used = dailyCounts?.boss ?? 0
  const limit = DAILY_LIMITS.boss
  const remaining = Math.max(0, limit - used)
  const noAttempts = remaining <= 0

  return (
    <div className="stage-boss">
      <div className="boss-header">
        <span className="boss-title">👹 Boss 挑戰</span>
        <span className="boss-subtitle">限時 30 回合，以傷害量評價 S/A/B/C 級</span>
      </div>
      <div className="pvp-meta-row">
        <span className="daily-attempts">剩餘次數：{remaining}/{limit}</span>
      </div>
      {noAttempts && (
        <div className="daily-exhausted">今日挑戰次數已用完，明天再來！</div>
      )}
      <div className="boss-list">
        {BOSS_CONFIGS.map((boss: BossConfig, idx: number) => {
          const requiredProgress = idx === 0 ? 16 : idx === 1 ? 20 : 24
          const unlocked = progress >= requiredProgress
          const ranks = ['S', 'A', 'B', 'C'] as const
          const rankColors: Record<string, string> = { S: '#ffd700', A: '#c0c0c0', B: '#cd7f32', C: '#888' }
          return (
            <div key={boss.bossId} className={`boss-card ${!unlocked ? 'boss-card-locked' : ''}`}>
              <div className="boss-card-header">
                <span className="boss-card-name">{boss.name}</span>
                {!unlocked && <span className="boss-card-lock">🔒</span>}
              </div>
              <div className="boss-card-stats">
                <span>血量 ∞</span>
                <span>攻擊 {boss.atk}</span>
                <span>速度 {boss.speed}</span>
              </div>
              <div className="boss-card-thresholds">
                <span className="rank-s">S ≥{boss.damageThresholds.S.toLocaleString()}</span>
                <span className="rank-a">A ≥{boss.damageThresholds.A.toLocaleString()}</span>
                <span className="rank-b">B ≥{boss.damageThresholds.B.toLocaleString()}</span>
              </div>
              {/* Boss 各評級完整獎勵 */}
              <div className="boss-card-reward-detail" style={{ fontSize: '0.7em', marginTop: 4 }}>
                {ranks.map(r => {
                  const rw = getBossRewardByBossAndRank(boss.bossId, r)
                  return (
                    <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, color: rankColors[r] }}>
                      <span style={{ fontWeight: 'bold', width: 16 }}>{r}</span>
                      <CurrencyIcon type="gold" /> {rw.gold}
                      {(rw.diamond ?? 0) > 0 && <>{' '}<CurrencyIcon type="diamond" /> {rw.diamond}</>}
                      {' '}<CurrencyIcon type="exp" /> {rw.exp}
                      {rw.items?.map((it, i) => (
                        <span key={i}> <ClickableItemIcon itemId={it.itemId}>×{it.quantity}</ClickableItemIcon></span>
                      ))}
                    </div>
                  )
                })}
              </div>
              <button
                className="boss-challenge-btn"
                disabled={!unlocked || noAttempts}
                onClick={() => onSelect(boss.bossId)}
              >
                {!unlocked ? `通關 ${Math.ceil(requiredProgress / 8)}-${requiredProgress % 8 || 8} 解鎖` : noAttempts ? '次數已用完' : '⚔️ 挑戰'}
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
  onBack,
  onSelectStage,
  initialDailyCounts,
  initialMode,
}: StageSelectProps) {
  const [activeMode, setActiveMode] = useState<StageMode>(initialMode ?? 'story')
  const [lockToast, setLockToast] = useState<string | null>(null)
  const [dailyCounts, setDailyCounts] = useState<DailyCounts | null>(initialDailyCounts ?? null)

  // 取得每日剩餘次數
  useEffect(() => {
    let cancelled = false
    callApi<{ dailyCounts: DailyCounts }>('daily-counts', {})
      .then(res => {
        if (!cancelled && res.success && res.dailyCounts) {
          setDailyCounts(res.dailyCounts)
        }
      })
      .catch(() => { /* 離線或失敗 → 不顯示次數 */ })
    return () => { cancelled = true }
  }, [])

  /** 某模式是否還有剩餘次數（用於紅點） */
  const hasRemaining = (mode: string): boolean => {
    const limit = DAILY_LIMITS[mode]
    if (!limit) return false
    if (!dailyCounts) return false // 未載入完畢前不顯示紅點，避免閃現
    const used = (dailyCounts as unknown as Record<string, number>)[mode] ?? 0
    return used < limit
  }

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
          <PanelInfoTip description={PANEL_DESCRIPTIONS.stageSelect} />
        </div>

        <div className="stage-mode-tabs">
          {MODE_TABS.map((tab) => {
            const unlocked = tab.unlockMode
              ? isModeUnlocked(tab.unlockMode, storyProgress)
              : true
            const showRedDot = unlocked && hasRemaining(tab.key)

            return (
              <button
                key={tab.key}
                className={`stage-mode-tab ${activeMode === tab.key ? 'stage-mode-active' : ''} ${!unlocked ? 'stage-mode-locked' : ''}`}
                onClick={() => handleTabClick(tab)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {!unlocked && <span className="stage-mode-lock">🔒</span>}
                {showRedDot && <RedDot size="sm" />}
              </button>
            )
          })}
        </div>

        <div className="stage-content">
          {activeMode === 'story' && (
            <StoryStages
              storyProgress={storyProgress}
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
              dailyCounts={dailyCounts}
            />
          )}
          {activeMode === 'pvp' && (
            <PvPPanel
              storyProgress={storyProgress}
              onSelect={(id) => onSelectStage('pvp', id)}
              dailyCounts={dailyCounts}
            />
          )}
          {activeMode === 'boss' && (
            <BossPanel2
              storyProgress={storyProgress}
              onSelect={(id) => onSelectStage('boss', id)}
              dailyCounts={dailyCounts}
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
