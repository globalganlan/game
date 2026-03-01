/**
 * GachaScreen — 召喚（抽卡）畫面
 *
 * 兩個頁籤：英雄召喚 / 裝備鍛造
 * 英雄：保底進度、單抽/十連（鑽石）
 * 裝備：金幣池/鑽石池、十連保底 SR+、無保底累計
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
import {
  equipSinglePull,
  equipTenPull,
  getEquipPullCost,
  getEquipDisplayName,
  getEquipPoolRates,
  SET_NAMES,
  SLOT_NAMES,
  type EquipPoolType,
  type EquipPullResult,
} from '../domain/equipmentGacha'
import type { EquipmentInstance } from '../domain/progressionSystem'
import type { RawHeroData } from '../types'
import { translateError } from '../utils/errorMessages'
import { Thumbnail3D } from './UIOverlay'
import { addItemsLocally, addEquipmentLocally } from '../services/inventoryService'
import { emitAcquire } from '../services/acquireToastBus'
import { getItemName } from '../constants/rarity'
import type { AcquireItem } from '../hooks/useAcquireToast'
import { fireOptimisticAsync } from '../services/optimisticQueue'

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
  gold: number
  heroesList: RawHeroData[]
  onBack: () => void
  onDiamondChange?: (delta: number) => void
  onGoldChange?: (delta: number) => void
  onPullSuccess?: (newHeroIds: number[]) => void
  initialPity?: number
}

/* ────────────────────────────
   Rarity Config（共用常數）
   ──────────────────────────── */

import { RARITY_CONFIG } from '../constants/rarity'
import { CurrencyIcon } from './CurrencyIcon'

type GachaTab = 'hero' | 'equipment'

/* ────────────────────────────
   Hero Result Card
   ──────────────────────────── */

interface PullResult {
  heroId: number
  rarity: string
  isNew: boolean
  isFeatured: boolean
  stardust: number
  fragments: number
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
      {!result.isNew && <span className="gacha-dupe-badge">重複</span>}
      {result.isFeatured && <span className="gacha-featured-badge">UP</span>}
      <div className="gacha-result-portrait">
        <Thumbnail3D modelId={modelId} />
      </div>
      <span className="gacha-result-name">{name}</span>
      <span className="gacha-result-rarity" style={{ color: cfg.color }}>{cfg.label}</span>
      {!result.isNew && (result.stardust > 0 || result.fragments > 0) && (
        <span className="gacha-dupe-reward">
          {result.stardust > 0 && <span><CurrencyIcon type="stardust" />{result.stardust}</span>}
          {result.fragments > 0 && <span>🧩{result.fragments}</span>}
        </span>
      )}
    </div>
  )
}

/* ────────────────────────────
   Equipment Result Card
   ──────────────────────────── */

function EquipResultCard({ eq, isGuaranteed }: { eq: EquipmentInstance; isGuaranteed: boolean }) {
  const cfg = RARITY_CONFIG[eq.rarity] || RARITY_CONFIG.N
  const name = getEquipDisplayName(eq)
  // 部位 emoji
  const slotEmoji: Record<string, string> = { weapon: '🗡️', armor: '🛡️', ring: '💍', boots: '👢' }

  return (
    <div
      className="gacha-result-card gacha-equip-card"
      style={{ borderColor: cfg.color, boxShadow: cfg.glow }}
    >
      {isGuaranteed && <span className="gacha-new-badge">保底!</span>}
      <div className="gacha-equip-icon">{slotEmoji[eq.slot] || '📦'}</div>
      <span className="gacha-result-name">{name}</span>
      <span className="gacha-result-rarity" style={{ color: cfg.color }}>{cfg.label}</span>
      <span className="gacha-equip-stat">{eq.mainStat} +{eq.mainStatValue}</span>
      {eq.subStats.length > 0 && (
        <div className="gacha-equip-sub">
          {eq.subStats.map((s, i) => (
            <span key={i} className="gacha-equip-sub-item">
              {s.stat} {s.isPercent ? `+${s.value}%` : `+${s.value}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function GachaScreen({
  diamond, gold, heroesList, onBack,
  onDiamondChange, onGoldChange, onPullSuccess, initialPity = 0,
}: GachaScreenProps) {
  const [tab, setTab] = useState<GachaTab>('hero')

  // ─── Hero Gacha state ───
  const [results, setResults] = useState<PullResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [pityCount, setPityCount] = useState(getPityState().pullsSinceLastSSR || initialPity)
  const [_poolRemaining, setPoolRemainingState] = useState(getPoolRemaining())
  const [error, setError] = useState<string | null>(null)

  // ─── Equipment Gacha state ───
  const [equipPool, setEquipPool] = useState<EquipPoolType>('gold')
  const [equipResults, setEquipResults] = useState<EquipPullResult[]>([])
  const [showEquipResults, setShowEquipResults] = useState(false)

  // ─── Pull Animation state ───
  const [isPulling, setIsPulling] = useState(false)
  const [revealPhase, setRevealPhase] = useState(false) // true = cards revealed
  const PULL_ANIM_MS = 1600 // pull animation duration

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

  /* ── 英雄抽卡 ── */
  const doPull = useCallback((count: 1 | 10) => {
    const cost = count === 10 ? TEN_PULL_COST : SINGLE_PULL_COST
    if (diamond < cost) {
      setError(`鑽石不足！需要 ${cost} 鑽石，目前 ${diamond} 鑽石`)
      return
    }

    setError(null)
    setIsPulling(true)
    setRevealPhase(false)
    const res = localPull(banner.id, count, diamond)

    if (!res.success) {
      setIsPulling(false)
      if (res.error === 'pool_empty') {
        setError('伺服器忙碌中，請稍後再試...')
      } else {
        setError(translateError(res.error, '抽卡失敗'))
      }
      return
    }

    onDiamondChange?.(-res.diamondCost)
    setPityCount(res.newPityState.pullsSinceLastSSR)
    setPoolRemainingState(res.poolRemaining)

    // Stash results but delay reveal
    const pullResults = res.results
    setTimeout(() => {
      setIsPulling(false)
      setResults(pullResults)
      setShowResults(true)
      setRevealPhase(true)
    }, PULL_ANIM_MS)

    const newIds = res.results.filter(r => r.isNew).map(r => r.heroId)
    if (newIds.length > 0) onPullSuccess?.(newIds)

    const dupeItems: { itemId: string; quantity: number }[] = []
    let totalStardust = 0
    for (const r of res.results) {
      if (!r.isNew) {
        if (r.stardust > 0) totalStardust += r.stardust
        if (r.fragments > 0) {
          dupeItems.push({ itemId: `asc_fragment_${r.heroId}`, quantity: r.fragments })
        }
      }
    }
    if (totalStardust > 0) dupeItems.push({ itemId: 'currency_stardust', quantity: totalStardust })
    if (dupeItems.length > 0) addItemsLocally(dupeItems)

    const toastItems: AcquireItem[] = res.results.map((r: PullResult) => ({
      type: 'hero' as const,
      id: String(r.heroId),
      name: heroesList.find(h => Number(h.HeroID) === r.heroId)?.Name || `英雄#${r.heroId}`,
      quantity: 1,
      rarity: r.rarity as 'N' | 'R' | 'SR' | 'SSR',
      isNew: r.isNew,
    }))
    for (const d of dupeItems) {
      toastItems.push({ type: 'item' as const, id: d.itemId, name: getItemName(d.itemId), quantity: d.quantity })
    }
    emitAcquire(toastItems)
  }, [diamond, banner.id, onDiamondChange, onPullSuccess, heroesList])

  /* ── 裝備抽卡 ── */
  const doEquipPull = useCallback((count: 1 | 10) => {
    const costInfo = getEquipPullCost(equipPool, count)
    const currency = costInfo.type === 'gold' ? gold : diamond
    const currencyName = costInfo.type === 'gold' ? '金幣' : '鑽石'

    if (currency < costInfo.amount) {
      setError(`${currencyName}不足！需要 ${costInfo.amount.toLocaleString()} ${currencyName}，目前 ${currency.toLocaleString()} ${currencyName}`)
      return
    }

    setError(null)
    setIsPulling(true)
    setRevealPhase(false)

    const pullResults = count === 10 ? equipTenPull(equipPool) : [equipSinglePull(equipPool)]

    // 扣費
    if (costInfo.type === 'gold') {
      onGoldChange?.(-costInfo.amount)
    } else {
      onDiamondChange?.(-costInfo.amount)
    }

    // 裝備寫入本地背包
    const newEquipment = pullResults.map(r => r.equipment)
    addEquipmentLocally(newEquipment)

    // 背景同步到 server
    fireOptimisticAsync('equip-gacha-pull', {
      poolType: equipPool,
      count,
      equipment: JSON.stringify(newEquipment),
    })

    // Delay reveal for animation
    const captured = pullResults
    setTimeout(() => {
      setIsPulling(false)
      setEquipResults(captured)
      setShowEquipResults(true)
      setRevealPhase(true)
    }, PULL_ANIM_MS)

    // 獲得物品動畫
    const toastItems: AcquireItem[] = pullResults.map(r => ({
      type: 'equipment' as const,
      id: r.equipment.equipId,
      name: getEquipDisplayName(r.equipment),
      quantity: 1,
      rarity: r.equipment.rarity,
    }))
    emitAcquire(toastItems)
  }, [equipPool, gold, diamond, onGoldChange, onDiamondChange])

  const closeResults = () => { setShowResults(false); setResults([]); setRevealPhase(false) }
  const closeEquipResults = () => { setShowEquipResults(false); setEquipResults([]); setRevealPhase(false) }

  const equipCostSingle = getEquipPullCost(equipPool, 1)
  const equipCostTen = getEquipPullCost(equipPool, 10)
  const equipRates = getEquipPoolRates(equipPool)
  const currencyForEquip = equipPool === 'gold' ? gold : diamond

  return (
    <div className="panel-overlay gacha-overlay">
      <div className="panel-container gacha-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🎰 召喚</h2>
          <div className="gacha-currencies">
            <span className="gacha-diamond"><CurrencyIcon type="diamond" /> {diamond.toLocaleString()}</span>
            <span className="gacha-gold-display"><CurrencyIcon type="gold" /> {gold.toLocaleString()}</span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="gacha-tabs">
          <button
            className={`gacha-tab ${tab === 'hero' ? 'gacha-tab-active' : ''}`}
            onClick={() => { setTab('hero'); setError(null) }}
          >
            🧟 英雄召喚
          </button>
          <button
            className={`gacha-tab ${tab === 'equipment' ? 'gacha-tab-active' : ''}`}
            onClick={() => { setTab('equipment'); setError(null) }}
          >
            ⚔️ 裝備鍛造
          </button>
        </div>

        {/* ═══ Hero Tab ═══ */}
        {tab === 'hero' && (
          <>
            <div className="gacha-banner">
              <div className="gacha-banner-art">
                <div className="gacha-banner-title">常駐招募</div>
                <div className="gacha-banner-sub">所有英雄均可獲得</div>
              </div>
              <div className="gacha-rates">
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.SSR.color }}>SSR 1.5%</span>
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.SR.color }}>SR 10%</span>
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.R.color }}>R 35%</span>
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.N.color }}>N 53.5%</span>
              </div>
              <div className="gacha-pity">
                <div className="gacha-pity-bar">
                  <div className="gacha-pity-fill" style={{ width: `${Math.min(100, (pityCount / 90) * 100)}%` }} />
                </div>
                <span className="gacha-pity-text">
                  保底進度：{pityCount}/90
                  {pityCount >= 75 && <span className="gacha-pity-hot"> 🔥 軟保底!</span>}
                </span>
              </div>
            </div>

            {error && <div className="gacha-error">{error}</div>}

            <div className="gacha-buttons">
              <button className="gacha-pull-btn gacha-pull-single" disabled={diamond < SINGLE_PULL_COST} onClick={() => doPull(1)}>
                <span className="gacha-btn-label">單抽</span>
                <span className="gacha-btn-cost"><CurrencyIcon type="diamond" /> {SINGLE_PULL_COST}</span>
              </button>
              <button className="gacha-pull-btn gacha-pull-ten" disabled={diamond < TEN_PULL_COST} onClick={() => doPull(10)}>
                <span className="gacha-btn-label">十連抽</span>
                <span className="gacha-btn-cost"><CurrencyIcon type="diamond" /> {TEN_PULL_COST}</span>
              </button>
            </div>
          </>
        )}

        {/* ═══ Equipment Tab ═══ */}
        {tab === 'equipment' && (
          <>
            <div className="gacha-banner">
              <div className="gacha-banner-art gacha-equip-banner">
                <div className="gacha-banner-title">裝備鍛造</div>
                <div className="gacha-banner-sub">8 套裝 × 4 部位 · 十連保底 SR+</div>
              </div>

              {/* Pool Selector */}
              <div className="gacha-pool-selector">
                <button
                  className={`gacha-pool-btn ${equipPool === 'gold' ? 'gacha-pool-active' : ''}`}
                  onClick={() => setEquipPool('gold')}
                >
                  <CurrencyIcon type="gold" /> 金幣池
                </button>
                <button
                  className={`gacha-pool-btn ${equipPool === 'diamond' ? 'gacha-pool-active' : ''}`}
                  onClick={() => setEquipPool('diamond')}
                >
                  <CurrencyIcon type="diamond" /> 鑽石池
                </button>
              </div>

              {/* Rate Info */}
              <div className="gacha-rates">
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.SSR.color }}>SSR {(equipRates.SSR * 100).toFixed(0)}%</span>
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.SR.color }}>SR {(equipRates.SR * 100).toFixed(0)}%</span>
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.R.color }}>R {(equipRates.R * 100).toFixed(0)}%</span>
                <span className="gacha-rate-item" style={{ color: RARITY_CONFIG.N.color }}>N {(equipRates.N * 100).toFixed(0)}%</span>
              </div>

              {/* Set Preview */}
              <div className="gacha-equip-sets">
                {Object.entries(SET_NAMES).map(([id, name]) => (
                  <span key={id} className="gacha-set-tag">{name}</span>
                ))}
              </div>
            </div>

            {error && <div className="gacha-error">{error}</div>}

            <div className="gacha-buttons">
              <button
                className="gacha-pull-btn gacha-pull-single"
                disabled={currencyForEquip < equipCostSingle.amount}
                onClick={() => doEquipPull(1)}
              >
                <span className="gacha-btn-label">單抽</span>
                <span className="gacha-btn-cost">
                  <CurrencyIcon type={equipPool === 'gold' ? 'gold' : 'diamond'} /> {equipCostSingle.amount.toLocaleString()}
                </span>
              </button>
              <button
                className="gacha-pull-btn gacha-pull-ten"
                disabled={currencyForEquip < equipCostTen.amount}
                onClick={() => doEquipPull(10)}
              >
                <span className="gacha-btn-label">十連抽</span>
                <span className="gacha-btn-cost">
                  <CurrencyIcon type={equipPool === 'gold' ? 'gold' : 'diamond'} /> {equipCostTen.amount.toLocaleString()}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Pull Animation Overlay */}
      {isPulling && (
        <div className="gacha-pull-anim-overlay">
          <div className="gacha-pull-anim-ring" />
          <div className="gacha-pull-anim-ring gacha-pull-anim-ring2" />
          <div className="gacha-pull-anim-text">召喚中...</div>
        </div>
      )}

      {/* Hero Results Overlay */}
      {showResults && revealPhase && (
        <div className="gacha-results-overlay" onClick={closeResults}>
          <div className="gacha-results-container" onClick={(e) => e.stopPropagation()}>
            <h3 className="gacha-results-title">召喚結果</h3>
            <div className="gacha-results-grid">
              {results.map((r, i) => {
                const rar = (r.rarity as 'SSR' | 'SR' | 'R' | 'N') || 'N'
                const shimmerClass = rar === 'SSR' ? ' gacha-card-ssr' : rar === 'SR' ? ' gacha-card-sr' : ''
                return (
                  <div key={i} className={`gacha-card-reveal${shimmerClass}`} style={{ animationDelay: `${i * 0.1}s` }}>
                    <ResultCard result={r} hero={heroMap.get(r.heroId)} />
                  </div>
                )
              })}
            </div>
            <button className="gacha-results-close" onClick={closeResults}>確認</button>
          </div>
        </div>
      )}

      {/* Equipment Results Overlay */}
      {showEquipResults && revealPhase && (
        <div className="gacha-results-overlay" onClick={closeEquipResults}>
          <div className="gacha-results-container" onClick={(e) => e.stopPropagation()}>
            <h3 className="gacha-results-title">鍛造結果</h3>
            <div className="gacha-results-grid">
              {equipResults.map((r, i) => {
                const rar = r.equipment.rarity
                const shimmerClass = rar === 'SSR' ? ' gacha-card-ssr' : rar === 'SR' ? ' gacha-card-sr' : ''
                return (
                  <div key={i} className={`gacha-card-reveal${shimmerClass}`} style={{ animationDelay: `${i * 0.1}s` }}>
                    <EquipResultCard eq={r.equipment} isGuaranteed={r.isGuaranteed} />
                  </div>
                )
              })}
            </div>
            <button className="gacha-results-close" onClick={closeEquipResults}>確認</button>
          </div>
        </div>
      )}
    </div>
  )
}
