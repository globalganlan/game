/**
 * ArenaPanel — 競技場排名 UI
 *
 * 三分頁：排行榜、防守陣型、獎勵
 *
 * 對應 Spec: .ai/specs/arena-pvp.md v0.1
 */

import { useState, useEffect, useCallback } from 'react'
import { CurrencyIcon } from './CurrencyIcon'
import { ClickableItemIcon } from './ClickableItemIcon'
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'
import { Thumbnail3D } from './UIOverlay'
import { RARITY_CONFIG, type Rarity } from '../constants/rarity'
import {
  getArenaRankings,
  completeArenaChallenge,
  setDefenseFormation,
  getDefenseFormation,
  clearArenaCache,
  refreshArenaOpponents,
  type ArenaRankingsResult,
  type ArenaOpponent,
} from '../services/arenaService'
import {
  getChallengeReward,
  RANK_MILESTONES,
  DAILY_REWARD_TIERS,
  ARENA_MAX_RANK,
  ARENA_DAILY_REFRESHES,
  getChallengeRange,
  type ArenaEntry,
  type ArenaReward,
} from '../domain/arenaSystem'
import type { RawHeroData } from '../types'
import type { HeroInstance, SaveData } from '../services/saveService'
import type { AcquireItem } from '../hooks/useAcquireToast'
import { getItemName, toRarity } from '../constants/rarity'

function resolveModelId(h: RawHeroData, idx = 0): string {
  const rawId = h._modelId || h.ModelID || h.HeroID || h.ModelId || h.Model || h.id || h.Name
  if (!rawId) return `zombie_${idx + 1}`
  const idText = rawId.toString().trim()
  const zm = idText.match(/zombie[_-]?(\d+)/i)
  if (zm) return `zombie_${zm[1]}`
  const nm = idText.match(/\d+/)
  if (nm) return `zombie_${nm[0]}`
  return `zombie_${idx + 1}`
}

/* ════════════════════════════════════
   Props
   ════════════════════════════════════ */

interface ArenaPanelProps {
  onBack: () => void
  onStartBattle: (targetUserId: string, defender: ArenaEntry | ArenaOpponent) => void | Promise<void>
  onSetupDefense: () => void
  saveData: SaveData | null
  heroesList: RawHeroData[]
  heroInstances: HeroInstance[]
  formation: (string | null)[]
  showAcquire?: (items: AcquireItem[]) => void
}

type Tab = 'rankings' | 'defense' | 'rewards'

/* ════════════════════════════════════
   Component
   ════════════════════════════════════ */

export function ArenaPanel({
  onBack,
  onStartBattle,
  onSetupDefense,
  saveData,
  heroesList,
  heroInstances,
  showAcquire,
  formation,
}: ArenaPanelProps) {
  const [tab, setTab] = useState<Tab>('rankings')
  const [data, setData] = useState<ArenaRankingsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defFormation, setDefFormation] = useState<(string | null)[]>([null, null, null, null, null, null])
  const [savingDef, setSavingDef] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [challenging, setChallenging] = useState(false)
  const [sweepResult, setSweepResult] = useState<{
    rewards: ArenaReward
    milestoneReward: ArenaReward | null
    newRank: number
  } | null>(null)

  // 載入排行榜
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getArenaRankings()
      setData(result)
    } catch {
      setError('無法載入排行榜')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 載入已儲存的防守陣型
  useEffect(() => {
    getDefenseFormation().then(f => {
      if (f && f.some(Boolean)) setDefFormation(f)
    })
  }, [])

  // 挑戰（用 playerId 識別對手）
  const handleChallenge = async (entry: ArenaOpponent) => {
    if (challenging) return
    setChallenging(true)
    try {
      await onStartBattle(entry.playerId, entry)
    } finally {
      setChallenging(false)
    }
  }

  // 刷新對手清單
  const handleRefreshOpponents = async () => {
    setRefreshing(true)
    try {
      const res = await refreshArenaOpponents()
      if (res.success && data) {
        setData({ ...data, opponents: res.opponents ?? [], refreshesLeft: res.refreshesLeft ?? 0 })
      } else if (res.error === 'no_refreshes_left') {
        setError('今日免費刷新次數已用完')
        setTimeout(() => setError(null), 2000)
      }
    } catch { /* ignore */ }
    setRefreshing(false)
  }

  // 挑戰跨度提示
  const challengeRange = data ? getChallengeRange(data.myRank) : 0

  // 防守陣型 — 一鍵複製
  const handleCopyFormation = () => {
    setDefFormation([...formation])
  }

  // 防守陣型 — 儲存
  const handleSaveDefense = async () => {
    setSavingDef(true)
    await setDefenseFormation(defFormation)
    setSavingDef(false)
  }

  // 取得英雄完整資訊（名稱、modelId、稀有度、等級、星級）
  const getHeroInfo = (instanceId: string | null) => {
    if (!instanceId) return null
    const inst = heroInstances.find(h => h.instanceId === instanceId || String(h.heroId) === instanceId)
    if (!inst) return null
    const raw = heroesList.find(h => Number(h.HeroID ?? h.id ?? 0) === Number(inst.heroId))
    if (!raw) return null
    return {
      name: (raw.Name as string) ?? `英雄#${inst.heroId}`,
      modelId: resolveModelId(raw),
      rarity: toRarity((raw as Record<string, unknown>).Rarity),
      level: inst.level ?? 1,
      stars: inst.stars ?? 0,
    }
  }

  // 掃蕩（自動勝利後一名）
  const handleSweep = async () => {
    if (!data || data.challengesLeft <= 0 || data.myRank >= ARENA_MAX_RANK) return
    setSweeping(true)
    try {
      const res = await completeArenaChallenge(data.myRank + 1, true)
      if (res.success && res.rewards) {
        setSweepResult({
          rewards: res.rewards,
          milestoneReward: res.milestoneReward ?? null,
          newRank: res.newRank ?? data.myRank,
        })
        // 觸發獲得物品動畫
        if (showAcquire) {
          const items: AcquireItem[] = []
          const rw = res.rewards
          const ml = res.milestoneReward
          if (rw.gold > 0) items.push({ type: 'currency', id: 'gold', name: '金幣', quantity: rw.gold + (ml?.gold ?? 0) })
          else if (ml?.gold) items.push({ type: 'currency', id: 'gold', name: '金幣', quantity: ml.gold })
          if (rw.diamond > 0) items.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: rw.diamond + (ml?.diamond ?? 0) })
          else if (ml?.diamond) items.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: ml.diamond })
          if (rw.exp > 0) items.push({ type: 'currency', id: 'exp', name: '經驗', quantity: rw.exp + (ml?.exp ?? 0) })
          else if (ml?.exp) items.push({ type: 'currency', id: 'exp', name: '經驗', quantity: ml.exp })
          if (rw.pvpCoin > 0) items.push({ type: 'item', id: 'pvp_coin', name: getItemName('pvp_coin'), quantity: rw.pvpCoin + (ml?.pvpCoin ?? 0) })
          else if (ml?.pvpCoin) items.push({ type: 'item', id: 'pvp_coin', name: getItemName('pvp_coin'), quantity: ml.pvpCoin })
          if (items.length > 0) showAcquire(items)
        }
        await loadData()
      }
    } catch { /* ignore */ }
    setSweeping(false)
  }

  const closeSweepResult = () => setSweepResult(null)

  return (
    <div className="arena-panel">
      {/* 頂部 */}
      <div className="arena-header">
        <button className="arena-back-btn" onClick={onBack}>← 返回</button>
        <span className="arena-title">⚔️ 競技場排名 <PanelInfoTip description={PANEL_DESCRIPTIONS.arena} /></span>
      </div>

      {/* 我的資訊 */}
      {data && (
        <div className="arena-my-info">
          <div className="arena-info-row">
            <span className="arena-my-rank">我的排名: <strong>#{data.myRank}</strong></span>
            <span className="arena-challenges">今日剩餘: <strong>{data.challengesLeft}/5</strong> 次</span>
          </div>
          <div className="arena-info-row">
            <span>本週最高: <strong>#{data.highestRank}</strong></span>
            <span>挑戰跨度: <strong>{challengeRange}</strong> 名</span>
          </div>
        </div>
      )}

      {/* Tab 切換 */}
      <div className="arena-tabs">
        <button className={`arena-tab ${tab === 'rankings' ? 'active' : ''}`} onClick={() => setTab('rankings')}>🏆 排行榜</button>
        <button className={`arena-tab ${tab === 'defense' ? 'active' : ''}`} onClick={() => setTab('defense')}>🛡️ 防守陣型</button>
        <button className={`arena-tab ${tab === 'rewards' ? 'active' : ''}`} onClick={() => setTab('rewards')}>📦 獎勵</button>
      </div>

      {/* Tab 內容 */}
      <div className="arena-body">
        {loading && <div className="arena-loading">載入中…</div>}
        {error && <div className="arena-error">{error}</div>}

        {/* ── 排行榜 ── */}
        {tab === 'rankings' && data && !loading && (
          <div className="arena-rank-list">
            {/* Top 10 排行榜 */}
            <div className="arena-section-header">🏆 排行榜 Top 10</div>
            {data.rankings
              .filter(e => e.rank <= 10)
              .sort((a, b) => a.rank - b.rank)
              .map(entry => {
                const isMe = entry.rank === data.myRank && !entry.isNPC
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : ''
                return (
                  <div key={`top-${entry.rank}`} className={`arena-rank-row ${isMe ? 'arena-me' : ''}`}>
                    <span className="arena-rank-num">{medal} #{entry.rank}</span>
                    <span className="arena-rank-name">
                      {entry.displayName}
                      {entry.isNPC && <span className="arena-npc-tag">(NPC)</span>}
                    </span>
                    <span className="arena-rank-power">⚔️ {entry.power.toLocaleString()}</span>
                    {isMe && <span className="arena-me-tag">◄ 我</span>}
                  </div>
                )
              })}

            {/* 我的排名（不在 Top 10 時顯示） */}
            {data.myRank > 10 && (
              <div className="arena-rank-row arena-me" style={{ marginTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: '6px' }}>
                <span className="arena-rank-num">#{data.myRank}</span>
                <span className="arena-rank-name">{saveData?.displayName || '我'}</span>
                <span className="arena-rank-power">⚔️ {(data.myPower ?? 0).toLocaleString()}</span>
                <span className="arena-me-tag">◄ 我</span>
              </div>
            )}

            {/* 挑戰對手清單 */}
            <div className="arena-section-header" style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚔️ 挑戰對手</span>
              <button
                className="arena-refresh-btn"
                onClick={handleRefreshOpponents}
                disabled={refreshing || (data.refreshesLeft ?? 0) <= 0}
              >
                {refreshing ? '刷新中…' : `🔄 刷新 (${data.refreshesLeft}/${ARENA_DAILY_REFRESHES})`}
              </button>
            </div>
            {data.opponents.length === 0 && (
              <div className="arena-loading">已在最高排名，無可挑戰對手</div>
            )}
            {data.opponents
              .sort((a, b) => a.rank - b.rank)
              .map(entry => {
                const canChallenge = data.challengesLeft > 0
                return (
                  <div key={`opp-${entry.playerId}`} className="arena-rank-row">
                    <span className="arena-rank-num">#{entry.rank}</span>
                    <span className="arena-rank-name">
                      {entry.displayName}
                      {entry.isNPC && <span className="arena-npc-tag">(NPC)</span>}
                    </span>
                    <span className="arena-rank-power">⚔️ {entry.power.toLocaleString()}</span>
                    {canChallenge && (
                      <button className="arena-challenge-btn" onClick={() => handleChallenge(entry)} disabled={challenging}>
                        {challenging ? '載入中…' : '挑戰'}
                      </button>
                    )}
                  </div>
                )
              })}

            {/* 掃蕩（打後一名） */}
            {data.myRank < ARENA_MAX_RANK && data.challengesLeft > 0 && (
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <button className="arena-sweep-btn" onClick={handleSweep} disabled={sweeping}>
                  {sweeping ? '⚡…' : '⚡ 掃蕩（打後一名拿獎勵）'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 防守陣型 ── */}
        {tab === 'defense' && (
          <div className="arena-defense-section">
            <div className="arena-defense-title">配置你的防守陣型，其他玩家挑戰你時將使用此陣型</div>
            <div className="arena-defense-grid">
              {defFormation.map((id, i) => {
                const info = getHeroInfo(id)
                if (!info) {
                  return (
                    <div key={i} className="arena-defense-slot">
                      <span className="arena-slot-empty">空位</span>
                    </div>
                  )
                }
                const rcfg = RARITY_CONFIG[info.rarity]
                return (
                  <div key={i} className="arena-defense-slot filled" style={{ borderColor: rcfg.border }}>
                    <span className="arena-slot-rarity" style={{ color: rcfg.color }}>{info.rarity}</span>
                    <div className="arena-slot-thumb">
                      <Thumbnail3D modelId={info.modelId} />
                    </div>
                    <div className="arena-slot-name">{info.name}</div>
                    <div className="arena-slot-stats">
                      <span className="arena-slot-level">Lv.{info.level}</span>
                      <span className="arena-slot-stars">
                        {Array.from({ length: 6 }, (_, si) => (
                          <span key={si} className={si < info.stars ? 'star-filled' : 'star-empty'}>★</span>
                        ))}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="arena-defense-actions">
              <button className="arena-def-btn primary" onClick={onSetupDefense}>
                🎮 前往配置防守陣型
              </button>
            </div>
          </div>
        )}

        {/* ── 獎勵 ── */}
        {tab === 'rewards' && (
          <div className="arena-rewards-section">
            {/* 排名里程碑 */}
            <div className="arena-reward-group">
              <div className="arena-reward-group-title">🎯 排名里程碑獎勵（每週重置）</div>
              {RANK_MILESTONES.map((m, i) => {
                const reached = data ? data.highestRank <= m.rankThreshold : false
                return (
                  <div key={i} className={`arena-reward-row ${reached ? 'reached' : ''}`}>
                    <span className="arena-reward-rank">前 {m.rankThreshold} 名</span>
                    <span className="arena-reward-items">
                      <span className="arena-reward-item"><CurrencyIcon type="diamond" />{m.reward.diamond}</span>
                      <span className="arena-reward-item"><CurrencyIcon type="gold" />{m.reward.gold.toLocaleString()}</span>
                      <span className="arena-reward-item"><CurrencyIcon type="pvp_coin" />{m.reward.pvpCoin}</span>
                    </span>
                    <span className={`arena-reward-reached ${reached ? '' : 'arena-reward-pending'}`}>
                      {reached ? '✅ 已達成' : '⬜'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 每日排名獎勵 */}
            <div className="arena-reward-group">
              <div className="arena-reward-group-title">📅 每日排名獎勵（21:00 UTC 發放至信箱）</div>
              {DAILY_REWARD_TIERS.map((tier, i) => (
                <div key={i} className="arena-reward-row">
                  <span className="arena-reward-rank">
                    {tier.minRank === tier.maxRank ? `第 ${tier.minRank} 名` : `${tier.minRank}~${tier.maxRank} 名`}
                  </span>
                  <span className="arena-reward-items">
                    <span className="arena-reward-item"><CurrencyIcon type="diamond" />{tier.reward.diamond}</span>
                    <span className="arena-reward-item"><CurrencyIcon type="gold" />{tier.reward.gold.toLocaleString()}</span>
                    <span className="arena-reward-item"><CurrencyIcon type="pvp_coin" />{tier.reward.pvpCoin}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* 挑戰獎勵 */}
            <div className="arena-reward-group">
              <div className="arena-reward-group-title">⚔️ 每場挑戰獎勵</div>
              <div className="arena-reward-row">
                <span className="arena-reward-rank">勝利</span>
                <span className="arena-reward-items">
                  <span className="arena-reward-item"><CurrencyIcon type="gold" />2,000</span>
                  <span className="arena-reward-item"><CurrencyIcon type="pvp_coin" />5</span>
                  <span className="arena-reward-item"><CurrencyIcon type="exp" />150</span>
                </span>
              </div>
              <div className="arena-reward-row">
                <span className="arena-reward-rank">敗北</span>
                <span className="arena-reward-items">
                  <span className="arena-reward-item"><CurrencyIcon type="gold" />500</span>
                  <span className="arena-reward-item"><CurrencyIcon type="pvp_coin" />1</span>
                  <span className="arena-reward-item"><CurrencyIcon type="exp" />50</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* ── 掃蕩結算面板 ── */}
      {sweepResult && (
        <div className="arena-sweep-overlay" onClick={closeSweepResult}>
          <div className="arena-sweep-result" onClick={e => e.stopPropagation()}>
            <div className="arena-sweep-result-banner">
              <span className="sweep-result-title">⚡ 掃蕩勝利</span>
              <span className="sweep-result-sub">排名上升至 #{sweepResult.newRank}</span>
            </div>
            <div className="arena-sweep-rewards">
              <div className="sweep-reward-header">⚔️ 競技場掃蕩獎勵</div>
              <div className="sweep-reward-list">
                {sweepResult.rewards.gold > 0 && (
                  <div className="sweep-reward-item">
                    <span className="reward-icon gold"><ClickableItemIcon itemId="gold" /></span>
                    <span className="reward-label">金幣</span>
                    <span className="reward-value">+{sweepResult.rewards.gold.toLocaleString()}</span>
                  </div>
                )}
                {sweepResult.rewards.diamond > 0 && (
                  <div className="sweep-reward-item">
                    <span className="reward-icon diamond"><ClickableItemIcon itemId="diamond" /></span>
                    <span className="reward-label">鑽石</span>
                    <span className="reward-value">+{sweepResult.rewards.diamond}</span>
                  </div>
                )}
                {sweepResult.rewards.exp > 0 && (
                  <div className="sweep-reward-item">
                    <span className="reward-icon exp"><ClickableItemIcon itemId="exp" /></span>
                    <span className="reward-label">經驗</span>
                    <span className="reward-value">+{sweepResult.rewards.exp.toLocaleString()}</span>
                  </div>
                )}
                {sweepResult.rewards.pvpCoin > 0 && (
                  <div className="sweep-reward-item">
                    <span className="reward-icon"><ClickableItemIcon itemId="pvp_coin" /></span>
                    <span className="reward-label">競技幣</span>
                    <span className="reward-value">+{sweepResult.rewards.pvpCoin}</span>
                  </div>
                )}
              </div>
              {/* 里程碑額外獎勵 */}
              {sweepResult.milestoneReward && (
                <>
                  <div className="sweep-reward-header milestone">🎯 排名里程碑獎勵</div>
                  <div className="sweep-reward-list">
                    {sweepResult.milestoneReward.gold > 0 && (
                      <div className="sweep-reward-item">
                        <span className="reward-icon gold"><ClickableItemIcon itemId="gold" /></span>
                        <span className="reward-label">金幣</span>
                        <span className="reward-value">+{sweepResult.milestoneReward.gold.toLocaleString()}</span>
                      </div>
                    )}
                    {sweepResult.milestoneReward.diamond > 0 && (
                      <div className="sweep-reward-item">
                        <span className="reward-icon diamond"><ClickableItemIcon itemId="diamond" /></span>
                        <span className="reward-label">鑽石</span>
                        <span className="reward-value">+{sweepResult.milestoneReward.diamond}</span>
                      </div>
                    )}
                    {sweepResult.milestoneReward.exp > 0 && (
                      <div className="sweep-reward-item">
                        <span className="reward-icon exp"><ClickableItemIcon itemId="exp" /></span>
                        <span className="reward-label">經驗</span>
                        <span className="reward-value">+{sweepResult.milestoneReward.exp.toLocaleString()}</span>
                      </div>
                    )}
                    {sweepResult.milestoneReward.pvpCoin > 0 && (
                      <div className="sweep-reward-item">
                        <span className="reward-icon"><ClickableItemIcon itemId="pvp_coin" /></span>
                        <span className="reward-label">競技幣</span>
                        <span className="reward-value">+{sweepResult.milestoneReward.pvpCoin}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <button className="arena-sweep-confirm-btn" onClick={closeSweepResult}>
              確認
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
