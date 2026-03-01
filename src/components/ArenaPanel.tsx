/**
 * ArenaPanel — 競技場排名 UI
 *
 * 三分頁：排行榜、防守陣型、獎勵
 *
 * 對應 Spec: specs/arena-pvp.md v0.1
 */

import { useState, useEffect, useCallback } from 'react'
import { CurrencyIcon } from './CurrencyIcon'
import {
  getArenaRankings,
  completeArenaChallenge,
  setDefenseFormation,
  clearArenaCache,
  type ArenaRankingsResult,
} from '../services/arenaService'
import {
  getChallengeable,
  getChallengeReward,
  RANK_MILESTONES,
  DAILY_REWARD_TIERS,
  ARENA_MAX_RANK,
  type ArenaEntry,
} from '../domain/arenaSystem'
import type { RawHeroData } from '../types'
import type { HeroInstance, SaveData } from '../services/saveService'

/* ════════════════════════════════════
   Props
   ════════════════════════════════════ */

interface ArenaPanelProps {
  onBack: () => void
  onStartBattle: (targetRank: number, defender: ArenaEntry) => void
  saveData: SaveData | null
  heroesList: RawHeroData[]
  heroInstances: HeroInstance[]
  formation: (string | null)[]
}

type Tab = 'rankings' | 'defense' | 'rewards'

/* ════════════════════════════════════
   Component
   ════════════════════════════════════ */

export function ArenaPanel({
  onBack,
  onStartBattle,
  saveData,
  heroesList,
  heroInstances,
  formation,
}: ArenaPanelProps) {
  const [tab, setTab] = useState<Tab>('rankings')
  const [data, setData] = useState<ArenaRankingsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defFormation, setDefFormation] = useState<(string | null)[]>([null, null, null, null, null, null])
  const [savingDef, setSavingDef] = useState(false)

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

  // 挑戰
  const handleChallenge = (entry: ArenaEntry) => {
    onStartBattle(entry.rank, entry)
  }

  // 取得可挑戰的排名
  const challengeable = data ? new Set(getChallengeable(data.myRank)) : new Set<number>()

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

  // 取得英雄名稱
  const getHeroName = (instanceId: string | null) => {
    if (!instanceId) return '空位'
    const inst = heroInstances.find(h => h.instanceId === instanceId || String(h.heroId) === instanceId)
    if (!inst) return '未知'
    const raw = heroesList.find(h => Number(h.HeroID ?? h.id ?? 0) === Number(inst.heroId))
    return raw?.Name as string ?? `英雄#${inst.heroId}`
  }

  return (
    <div className="arena-panel">
      {/* 頂部 */}
      <div className="arena-header">
        <button className="arena-back-btn" onClick={onBack}>← 返回</button>
        <span className="arena-title">⚔️ 競技場排名</span>
      </div>

      {/* 我的資訊 */}
      {data && (
        <div className="arena-my-info">
          <div className="arena-info-row">
            <span>我的排名: <strong>#{data.myRank}</strong></span>
            <span>今日剩餘: <strong>{data.challengesLeft}/5</strong> 次</span>
          </div>
          <div className="arena-info-row">
            <span>本週最高: <strong>#{data.highestRank}</strong></span>
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
      <div className="arena-content">
        {loading && <div className="arena-loading">載入中…</div>}
        {error && <div className="arena-error">{error}</div>}

        {/* ── 排行榜 ── */}
        {tab === 'rankings' && data && !loading && (
          <div className="arena-rankings-list">
            {data.rankings
              .sort((a, b) => a.rank - b.rank)
              .map(entry => {
                const isMe = entry.rank === data.myRank && !entry.isNPC
                const canChallenge = challengeable.has(entry.rank) && data.challengesLeft > 0
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : ''

                return (
                  <div key={entry.rank} className={`arena-rank-row ${isMe ? 'arena-rank-me' : ''}`}>
                    <span className="arena-rank-num">
                      {medal} #{entry.rank}
                    </span>
                    <span className="arena-rank-name">
                      {entry.displayName}
                      {entry.isNPC && <span className="arena-npc-tag">(NPC)</span>}
                    </span>
                    <span className="arena-rank-power">⚡ {entry.power.toLocaleString()}</span>
                    {!isMe && canChallenge && (
                      <button className="arena-challenge-btn" onClick={() => handleChallenge(entry)}>
                        挑戰
                      </button>
                    )}
                    {isMe && <span className="arena-me-tag">◄ 我</span>}
                  </div>
                )
              })}
          </div>
        )}

        {/* ── 防守陣型 ── */}
        {tab === 'defense' && (
          <div className="arena-defense">
            <div className="arena-defense-hint">配置你的防守陣型，其他玩家挑戰你時將使用此陣型</div>
            <div className="arena-defense-grid">
              {defFormation.map((id, i) => (
                <div key={i} className="arena-defense-slot">
                  <span className="arena-slot-label">位置 {i + 1}</span>
                  <span className="arena-slot-hero">{getHeroName(id)}</span>
                </div>
              ))}
            </div>
            <div className="arena-defense-actions">
              <button className="arena-copy-btn" onClick={handleCopyFormation}>
                📋 複製出征陣型
              </button>
              <button className="arena-save-btn" onClick={handleSaveDefense} disabled={savingDef}>
                {savingDef ? '儲存中...' : '💾 儲存防守陣型'}
              </button>
            </div>
          </div>
        )}

        {/* ── 獎勵 ── */}
        {tab === 'rewards' && (
          <div className="arena-rewards">
            {/* 排名里程碑 */}
            <div className="arena-reward-section">
              <div className="arena-reward-section-title">🎯 排名里程碑獎勵（每週重置）</div>
              {RANK_MILESTONES.map((m, i) => {
                const reached = data ? data.highestRank <= m.rankThreshold : false
                return (
                  <div key={i} className={`arena-reward-row ${reached ? 'reached' : ''}`}>
                    <span className="arena-reward-cond">前 {m.rankThreshold} 名</span>
                    <span className="arena-reward-detail">
                      <CurrencyIcon type="diamond" />{m.reward.diamond}
                      <CurrencyIcon type="gold" />{m.reward.gold.toLocaleString()}
                      <span className="arena-pvp-coin">🏅{m.reward.pvpCoin}</span>
                    </span>
                    <span className={`arena-reward-status ${reached ? 'claimed' : ''}`}>
                      {reached ? '✅' : '⬜'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 每日排名獎勵 */}
            <div className="arena-reward-section">
              <div className="arena-reward-section-title">📅 每日排名獎勵（21:00 UTC 發放至信箱）</div>
              {DAILY_REWARD_TIERS.map((tier, i) => (
                <div key={i} className="arena-reward-row">
                  <span className="arena-reward-cond">
                    {tier.minRank === tier.maxRank ? `第 ${tier.minRank} 名` : `${tier.minRank}~${tier.maxRank} 名`}
                  </span>
                  <span className="arena-reward-detail">
                    <CurrencyIcon type="diamond" />{tier.reward.diamond}
                    <CurrencyIcon type="gold" />{tier.reward.gold.toLocaleString()}
                    <span className="arena-pvp-coin">🏅{tier.reward.pvpCoin}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* 挑戰獎勵 */}
            <div className="arena-reward-section">
              <div className="arena-reward-section-title">⚔️ 每場挑戰獎勵</div>
              <div className="arena-reward-row">
                <span className="arena-reward-cond">勝利</span>
                <span className="arena-reward-detail">
                  <CurrencyIcon type="gold" />2,000 <span className="arena-pvp-coin">🏅5</span>
                </span>
              </div>
              <div className="arena-reward-row">
                <span className="arena-reward-cond">敗北</span>
                <span className="arena-reward-detail">
                  <CurrencyIcon type="gold" />500 <span className="arena-pvp-coin">🏅1</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
