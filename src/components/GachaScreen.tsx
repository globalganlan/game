/**
 * GachaScreen — 召喚（抽卡）畫面
 *
 * 顯示卡池資訊、保底進度、單抽/十連按鈕、抽卡結果動畫。
 */

import { useState, useCallback, useEffect } from 'react'
import {
  localPull,
  getPoolRemaining,
  getPityState,
  onPoolChange,
} from '../services/gachaLocalPool'
import {
  SINGLE_PULL_COST,
  TEN_PULL_COST,
  STANDARD_BANNER,
  type GachaRarity,
} from '../domain/gachaSystem'
import type { RawHeroData } from '../types'
import { Thumbnail3D } from './UIOverlay'

/** 將原始英雄資料的 ID 正規化為 `zombie_N` 格式 */
function resolveModelId(h: RawHeroData): string {
  const rawId = h._modelId || h.ModelID || h.HeroID || h.ModelId || h.Model || h.id || h.Name
  if (!rawId) return 'zombie_1'
  const idText = rawId.toString().trim()
  const zm = idText.match(/zombie[_-]?(\d+)/i)
  if (zm) return `zombie_${zm[1]}`
  const nm = idText.match(/\d+/)
  if (nm) return `zombie_${nm[0]}`
  return 'zombie_1'
}

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface GachaScreenProps {
  diamond: number
  heroesList: RawHeroData[]
  onBack: () => void
  onDiamondChange?: (delta: number) => void
  onPullSuccess?: (newHeroIds: number[]) => void
  initialPity?: number
}

/* ────────────────────────────
   Rarity Config
   ──────────────────────────── */

const RARITY_CONFIG: Record<GachaRarity, { color: string; glow: string; label: string }> = {
  SSR: { color: '#ffd43b', glow: '0 0 20px #ffd43b', label: '★★★★ SSR' },
  SR:  { color: '#be4bdb', glow: '0 0 15px #be4bdb', label: '★★★ SR' },
  R:   { color: '#4dabf7', glow: '0 0 10px #4dabf7', label: '★★ R' },
  N:   { color: '#aaa',    glow: 'none',              label: '★ N' },
}

/* ────────────────────────────
   Result Card
   ──────────────────────────── */

interface PullResult {
  heroId: number
  rarity: string
  isNew: boolean
  isFeatured: boolean
}

function ResultCard({ result, hero }: { result: PullResult; hero?: RawHeroData }) {
  const cfg = RARITY_CONFIG[(result.rarity as GachaRarity) || 'N'] || RARITY_CONFIG.N
  const name = hero?.Name || `英雄#${result.heroId}`
  const modelId = hero ? resolveModelId(hero) : `zombie_${result.heroId}`

  return (
    <div
      className="gacha-result-card"
      style={{ borderColor: cfg.color, boxShadow: cfg.glow }}
    >
      {result.isNew && <span className="gacha-new-badge">NEW!</span>}
      {result.isFeatured && <span className="gacha-featured-badge">UP</span>}
      <div className="gacha-result-portrait">
        <Thumbnail3D modelId={modelId} />
      </div>
      <span className="gacha-result-name">{name}</span>
      <span className="gacha-result-rarity" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  )
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function GachaScreen({ diamond, heroesList, onBack, onDiamondChange, onPullSuccess, initialPity = 0 }: GachaScreenProps) {
  const [results, setResults] = useState<PullResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [pityCount, setPityCount] = useState(getPityState().pullsSinceLastSSR || initialPity)
  const [poolRemaining, setPoolRemainingState] = useState(getPoolRemaining())
  const [error, setError] = useState<string | null>(null)

  const banner = STANDARD_BANNER

  const heroMap = new Map<number, RawHeroData>()
  for (const h of heroesList) {
    const hid = Number(h.HeroID ?? h.id ?? 0)
    if (hid) heroMap.set(hid, h)
  }

  /* ── 訂閱池數量變化 ── */
  useEffect(() => {
    const unsub = onPoolChange((remaining) => {
      setPoolRemainingState(remaining)
    })
    return unsub
  }, [])

  /* ── 抽卡：100% 本地處理，零等待 ── */
  const doPull = useCallback((count: 1 | 10) => {
    const cost = count === 10 ? TEN_PULL_COST : SINGLE_PULL_COST
    if (diamond < cost) {
      setError(`鑽石不足！需要 💎${cost}，目前 💎${diamond}`)
      return
    }

    setError(null)

    // 本地抽卡 — 同步回傳，0ms
    const res = localPull(banner.id, count, diamond)

    if (!res.success) {
      if (res.error === 'pool_empty') {
        setError('伺服器忙碌中，請稍後再試...')
      } else {
        setError('抽卡失敗：' + (res.error || '未知錯誤'))
      }
      return
    }

    setResults(res.results)
    setPityCount(res.newPityState.pullsSinceLastSSR)
    setPoolRemainingState(res.poolRemaining)
    setShowResults(true)
    onDiamondChange?.(-res.diamondCost)

    // 通知父元件本次抽到的新英雄 ID
    const newIds = res.results.filter(r => r.isNew).map(r => r.heroId)
    if (newIds.length > 0) onPullSuccess?.(newIds)
  }, [diamond, banner.id, onDiamondChange, onPullSuccess])

  const closeResults = () => {
    setShowResults(false)
    setResults([])
  }

  return (
    <div className="panel-overlay gacha-overlay">
      <div className="panel-container gacha-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🎰 {banner.name}</h2>
          <span className="gacha-diamond">💎 {diamond.toLocaleString()}</span>
        </div>

        {/* Banner Info */}
        <div className="gacha-banner">
          <div className="gacha-banner-art">
            <div className="gacha-banner-title">常駐招募</div>
            <div className="gacha-banner-sub">所有英雄均可獲得</div>
          </div>

          {/* Rate Info */}
          <div className="gacha-rates">
            <span className="gacha-rate-item" style={{ color: '#ffd43b' }}>SSR 1.5%</span>
            <span className="gacha-rate-item" style={{ color: '#be4bdb' }}>SR 10%</span>
            <span className="gacha-rate-item" style={{ color: '#4dabf7' }}>R 35%</span>
            <span className="gacha-rate-item" style={{ color: '#aaa' }}>N 53.5%</span>
          </div>

          {/* Pity Counter */}
          <div className="gacha-pity">
            <div className="gacha-pity-bar">
              <div
                className="gacha-pity-fill"
                style={{ width: `${Math.min(100, (pityCount / 90) * 100)}%` }}
              />
            </div>
            <span className="gacha-pity-text">
              保底進度：{pityCount}/90
              {pityCount >= 75 && <span className="gacha-pity-hot"> 🔥 軟保底!</span>}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && <div className="gacha-error">{error}</div>}

        {/* Pull Buttons */}
        <div className="gacha-buttons">
          <button
            className="gacha-pull-btn gacha-pull-single"
            disabled={diamond < SINGLE_PULL_COST}
            onClick={() => doPull(1)}
          >
            <span className="gacha-btn-label">單抽</span>
            <span className="gacha-btn-cost">💎 {SINGLE_PULL_COST}</span>
          </button>
          <button
            className="gacha-pull-btn gacha-pull-ten"
            disabled={diamond < TEN_PULL_COST}
            onClick={() => doPull(10)}
          >
            <span className="gacha-btn-label">十連抽</span>
            <span className="gacha-btn-cost">💎 {TEN_PULL_COST}</span>
          </button>
        </div>
      </div>

      {/* Results Overlay */}
      {showResults && (
        <div className="gacha-results-overlay" onClick={closeResults}>
          <div className="gacha-results-container" onClick={(e) => e.stopPropagation()}>
            <h3 className="gacha-results-title">召喚結果</h3>
            <div className="gacha-results-grid">
              {results.map((r, i) => (
                <ResultCard key={i} result={r} hero={heroMap.get(r.heroId)} />
              ))}
            </div>
            <button className="gacha-results-close" onClick={closeResults}>
              確認
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
