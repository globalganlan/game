/**
 * GachaScreen — 召喚（抽卡）畫面
 *
 * 兩個頁籤：英雄召喚 / 裝備鍛造
 * 英雄：保底進度、單抽/十連（鑽石）
 * 裝備：金幣池/鑽石池、十連保底 SR+、無保底累計
 */

import { useState, useCallback, useEffect } from 'react'
import {
  SINGLE_PULL_COST,
  TEN_PULL_COST,
  STANDARD_BANNER,
  type GachaRarity,
} from '../domain/gachaSystem'
import { STAT_ZH } from '../constants/statNames'
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
import { getStatAtLevel, getAscensionMultiplier, getStarMultiplier, RARITY_INITIAL_STARS } from '../domain/progressionSystem'
import type { RawHeroData } from '../types'
import { translateError } from '../utils/errorMessages'
import { Thumbnail3D } from './UIOverlay'
import { addItemsLocally, removeItemsLocally, addEquipmentLocally, getItemQuantity } from '../services/inventoryService'
import { emitAcquire } from '../services/acquireToastBus'
import { getItemName } from '../constants/rarity'
import type { AcquireItem } from '../hooks/useAcquireToast'
import { callApi } from '../services/apiClient'
import { applyCurrenciesFromServer, getSaveState, updateFreePullLocally, updateGachaPityLocally } from '../services/saveService'
import { RedDot } from './RedDot'

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
  onDiamondChange?: (delta: number) => void   // 保留向後相容但不再使用
  onGoldChange?: (delta: number) => void       // 保留向後相容但不再使用
  onPullSuccess?: (newHeroes: { heroId: number; instanceId: string }[]) => void
  initialPity?: number
}

/* ────────────────────────────
   Rarity Config（共用常數）
   ──────────────────────────── */

import { RARITY_CONFIG } from '../constants/rarity'
import { CurrencyIcon } from './CurrencyIcon'
import { InfoTip } from './InfoTip'
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'

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

function ResultCard({ result, hero, onClick }: { result: PullResult; hero?: RawHeroData; onClick?: () => void }) {
  const cfg = RARITY_CONFIG[(result.rarity as GachaRarity) || 'N'] || RARITY_CONFIG.N
  const name = hero?.Name || `英雄#${result.heroId}`
  const modelId = hero ? resolveModelId(hero) : `zombie_${result.heroId}`

  return (
    <div
      className="gacha-result-card"
      style={{ borderColor: cfg.color, boxShadow: cfg.glow }}
      onClick={onClick}
    >
      {result.isNew && <span className="gacha-new-badge">新！</span>}
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

function EquipResultCard({ eq, isGuaranteed, onClick }: { eq: EquipmentInstance; isGuaranteed: boolean; onClick?: () => void }) {
  const cfg = RARITY_CONFIG[eq.rarity] || RARITY_CONFIG.N
  const name = getEquipDisplayName(eq)
  // 部位 emoji
  const slotEmoji: Record<string, string> = { weapon: '🗡️', armor: '🛡️', ring: '💍', boots: '👢' }

  return (
    <div
      className="gacha-result-card gacha-equip-card"
      style={{ borderColor: cfg.color, boxShadow: cfg.glow }}
      onClick={onClick}
    >
      {isGuaranteed && <span className="gacha-new-badge">保底!</span>}
      <div className="gacha-equip-icon">{slotEmoji[eq.slot] || '📦'}</div>
      <span className="gacha-result-name">{name}</span>
      <span className="gacha-result-rarity" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  )
}

/* ────────────────────────────
   Hero Info Popup（唯讀 — 召喚結果點擊查看）
   ──────────────────────────── */

/** 將稀有度文字轉為數字 */
function rarityToNum(r: string): number {
  const map: Record<string, number> = { N: 1, R: 2, SR: 3, SSR: 4 }
  return map[r] || 1
}

const ELEMENT_LABEL: Record<string, string> = {
  fire: '🔥 火', water: '💧 水', wind: '🌀 風', earth: '🪨 地',
  light: '✨ 光', dark: '🌑 暗', Fire: '🔥 火', Water: '💧 水',
  Wind: '🌀 風', Earth: '🪨 地', Light: '✨ 光', Dark: '🌑 暗',
}
const TYPE_LABEL: Record<string, string> = {
  tank: '🛡️ 坦克', attacker: '⚔️ 攻擊', support: '💚 輔助', healer: '💗 治療',
  Tank: '🛡️ 坦克', Attacker: '⚔️ 攻擊', Support: '💚 輔助', Healer: '💗 治療',
}

function HeroInfoPopup({ hero, rarity, onClose }: { hero: RawHeroData; rarity: string; onClose: () => void }) {
  const cfg = RARITY_CONFIG[(rarity as GachaRarity) || 'N'] || RARITY_CONFIG.N
  const modelId = resolveModelId(hero)
  const heroAny = hero as Record<string, unknown>
  const rarityNum = rarityToNum(rarity)
  const initStars = RARITY_INITIAL_STARS[rarityNum] ?? 0
  const ascMult = getAscensionMultiplier(0, rarityNum)
  const starMult = getStarMultiplier(initStars, rarityNum)

  const calcStat = (base: number | undefined) =>
    base != null ? Math.floor(getStatAtLevel(Number(base), 1, rarityNum) * ascMult * starMult) : '?'

  return (
    <div className="gacha-info-backdrop" onClick={onClose}>
      <div className="gacha-info-card" onClick={(e) => e.stopPropagation()}>
        <button className="gacha-info-close" onClick={onClose}>✕</button>

        <div className="gacha-info-top">
          <div className="gacha-info-portrait">
            <Thumbnail3D modelId={modelId} />
          </div>
          <div className="gacha-info-identity">
            <span className="gacha-info-name">{hero.Name || '???'}</span>
            <span className="gacha-info-rarity" style={{ color: cfg.color }}>{cfg.label}</span>
            <div className="gacha-info-tags">
              {heroAny.Element ? <span className="gacha-info-tag">{ELEMENT_LABEL[String(heroAny.Element)] ?? String(heroAny.Element)}</span> : null}
              {heroAny.Type ? <span className="gacha-info-tag">{TYPE_LABEL[String(heroAny.Type)] ?? String(heroAny.Type)}</span> : null}
            </div>
            {heroAny.Description ? <span className="gacha-info-desc">{String(heroAny.Description)}</span> : null}
          </div>
        </div>

        <div className="gacha-info-section-title">Lv.1 基礎屬性</div>
        <div className="gacha-info-stats-grid">
          <div className="gacha-info-stat"><span className="gacha-info-stat-label">生命</span><span className="gacha-info-stat-val">{calcStat(hero.HP as number)}</span></div>
          <div className="gacha-info-stat"><span className="gacha-info-stat-label">攻擊</span><span className="gacha-info-stat-val">{calcStat(hero.ATK as number)}</span></div>
          <div className="gacha-info-stat"><span className="gacha-info-stat-label">防禦</span><span className="gacha-info-stat-val">{calcStat(heroAny.DEF as number)}</span></div>
          <div className="gacha-info-stat"><span className="gacha-info-stat-label">速度</span><span className="gacha-info-stat-val">{String(heroAny.Speed ?? heroAny.SPD ?? '?')}</span></div>
          <div className="gacha-info-stat"><span className="gacha-info-stat-label">暴擊率</span><span className="gacha-info-stat-val">{String(heroAny.CritRate ?? '?')}%</span></div>
          <div className="gacha-info-stat"><span className="gacha-info-stat-label">暴擊傷害</span><span className="gacha-info-stat-val">{String(heroAny.CritDmg ?? '?')}%</span></div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────
   Equipment Info Popup（唯讀 — 裝備結果點擊查看）
   ──────────────────────────── */

// STAT_ZH 已移至 src/constants/statNames.ts 共用

function EquipInfoPopup({ eq, onClose }: { eq: EquipmentInstance; onClose: () => void }) {
  const cfg = RARITY_CONFIG[eq.rarity] || RARITY_CONFIG.N
  const name = getEquipDisplayName(eq)
  const slotEmoji: Record<string, string> = { weapon: '🗡️', armor: '🛡️', ring: '💍', boots: '👢' }
  const setName = SET_NAMES[eq.setId] || eq.setId
  const slotName = SLOT_NAMES[eq.slot] || eq.slot

  return (
    <div className="gacha-info-backdrop" onClick={onClose}>
      <div className="gacha-info-card" onClick={(e) => e.stopPropagation()}>
        <button className="gacha-info-close" onClick={onClose}>✕</button>

        <div className="gacha-info-top">
          <div className="gacha-info-portrait">
            <span className="gacha-info-equip-icon">{slotEmoji[eq.slot] || '📦'}</span>
          </div>
          <div className="gacha-info-identity">
            <span className="gacha-info-name">{name}</span>
            <span className="gacha-info-rarity" style={{ color: cfg.color }}>{cfg.label}</span>
            <div className="gacha-info-tags">
              <span className="gacha-info-tag">{setName}</span>
              <span className="gacha-info-tag">{slotName}</span>
            </div>
            <span className="gacha-info-set-name">+{eq.enhanceLevel} 強化</span>
          </div>
        </div>

        <div className="gacha-info-section-title">主屬性</div>
        <div className="gacha-info-main-stat">
          <span className="gacha-info-main-stat-name">{STAT_ZH[eq.mainStat] || eq.mainStat}</span>
          <span className="gacha-info-main-stat-val">+{eq.mainStatValue}</span>
        </div>

        {eq.subStats.length > 0 && (
          <>
            <div className="gacha-info-section-title">副屬性</div>
            <div className="gacha-info-sub-list">
              {eq.subStats.map((s, i) => (
                <div key={i} className="gacha-info-sub-item">
                  <span className="gacha-info-sub-item-name">{STAT_ZH[s.stat] || s.stat}</span>
                  <span className="gacha-info-sub-item-val">{s.isPercent ? `+${s.value}%` : `+${s.value}`}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function GachaScreen({
  diamond, gold, heroesList, onBack,
  onPullSuccess, initialPity = 0,
}: GachaScreenProps) {
  const [tab, setTab] = useState<GachaTab>('hero')

  // ─── Hero Gacha state ───
  const [results, setResults] = useState<PullResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [pityCount, setPityCount] = useState(initialPity)
  const [error, setError] = useState<string | null>(null)

  // ─── Ticket state ───
  const [heroTickets, setHeroTickets] = useState(0)
  const [equipTickets, setEquipTickets] = useState(0)

  // ─── Free Pull state ───
  const [freePullUsedToday, setFreePullUsedToday] = useState(false)
  const [freeEquipPullUsedToday, setFreeEquipPullUsedToday] = useState(false)
  const [countdown, setCountdown] = useState('')

  /** 取得 UTC+8 今天日期字串 */
  const getTaipeiDateStr = useCallback(() => {
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const taipei = new Date(utc + 8 * 3600000)
    const y = taipei.getFullYear()
    const m = String(taipei.getMonth() + 1).padStart(2, '0')
    const d = String(taipei.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [])

  // 載入券數量 & 免費抽狀態
  useEffect(() => {
    setHeroTickets(getItemQuantity('gacha_ticket_hero'))
    setEquipTickets(getItemQuantity('gacha_ticket_equip'))

    // 從 save data 讀取免費抽使用狀態
    const saveState = getSaveState()
    const today = getTaipeiDateStr()
    const sd = saveState?.save as any
    if (sd?.lastHeroFreePull === today) setFreePullUsedToday(true)
    if (sd?.lastEquipFreePull === today) setFreeEquipPullUsedToday(true)
  }, [getTaipeiDateStr])

  // 倒數計時器 — 到 UTC+8 午夜
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date()
      const utc = now.getTime() + now.getTimezoneOffset() * 60000
      const taipeiNow = new Date(utc + 8 * 3600000)
      // 到午夜的剩餘毫秒
      const midnight = new Date(taipeiNow)
      midnight.setHours(24, 0, 0, 0)
      const diff = midnight.getTime() - taipeiNow.getTime()
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [])

  // ─── Equipment Gacha state ───
  const [equipPool, setEquipPool] = useState<EquipPoolType>('gold')
  const [equipResults, setEquipResults] = useState<EquipPullResult[]>([])
  const [showEquipResults, setShowEquipResults] = useState(false)

  // ─── Info Popup state ───
  const [selectedHeroResult, setSelectedHeroResult] = useState<{ result: PullResult; hero?: RawHeroData } | null>(null)
  const [selectedEquip, setSelectedEquip] = useState<EquipmentInstance | null>(null)

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

  /* ── 英雄抽卡（直接呼叫後端） ── */
  const doPull = useCallback(async (count: 1 | 10, isFree = false) => {
    // 免費抽：不需檢查鑽石
    if (!isFree) {
      // 計算實際花費：券不足以鑽石補
      let diamondNeeded = 0
      if (count === 1) {
        diamondNeeded = heroTickets >= 1 ? 0 : SINGLE_PULL_COST
      } else {
        const ticketsUse = Math.min(heroTickets, 10)
        const remaining = 10 - ticketsUse
        diamondNeeded = remaining > 0 ? (remaining === 10 ? TEN_PULL_COST : remaining * SINGLE_PULL_COST) : 0
      }
      if (diamondNeeded > 0 && diamond < diamondNeeded) {
        setError(`鑽石不足！需要 ${diamondNeeded} 鑽石，目前 ${diamond} 鑽石`)
        return
      }
    }

    setError(null)
    setIsPulling(true)
    setRevealPhase(false)

    try {
      const res = await callApi<{
        results: { heroId: number; rarity: string; isNew: boolean; isFeatured: boolean; stardust: number; fragments: number }[]
        diamondCost: number
        ticketsUsed: number
        freePullUsed: boolean
        newPityState: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
        currencies: { gold?: number; diamond?: number; exp?: number }
        newHeroes?: { heroId: number; instanceId: string }[]
      }>('gacha-pull', { bannerId: banner.id, count, isFree })

      if (!res.success) {
        setIsPulling(false)
        if (res.error === 'free_pull_already_used') {
          setFreePullUsedToday(true)
          setError('今日免費召喚已使用')
        } else {
          setError(translateError(res.error, '抽卡失敗'))
        }
        return
      }

      // 後端唯一權威：用 server 回傳的 currencies 覆蓋本地
      if (res.currencies) applyCurrenciesFromServer(res.currencies)
      setPityCount(res.newPityState.pullsSinceLastSSR)
      updateGachaPityLocally(res.newPityState)
      if (res.ticketsUsed > 0) {
        setHeroTickets(prev => Math.max(0, prev - res.ticketsUsed))
        removeItemsLocally([{ itemId: 'gacha_ticket_hero', quantity: res.ticketsUsed }])
      }
      if (res.freePullUsed) {
        setFreePullUsedToday(true)
        updateFreePullLocally('lastHeroFreePull', getTaipeiDateStr())
      }

      const pullResults: PullResult[] = res.results.map(r => ({
        heroId: r.heroId,
        rarity: r.rarity,
        isNew: r.isNew,
        isFeatured: r.isFeatured,
        stardust: r.stardust || 0,
        fragments: r.fragments || 0,
      }))

      setTimeout(() => {
        setIsPulling(false)
        setResults(pullResults)
        setShowResults(true)
        setRevealPhase(true)
      }, PULL_ANIM_MS)

      // 使用 server 回傳的真實 instanceId（而非前端自行生成 local_ ID）
      const newHeroes: { heroId: number; instanceId: string }[] = res.newHeroes || []
      if (newHeroes.length > 0) onPullSuccess?.(newHeroes)

      const dupeItems: { itemId: string; quantity: number }[] = []
      let totalStardust = 0
      for (const r of pullResults) {
        if (!r.isNew) {
          if (r.stardust > 0) totalStardust += r.stardust
          if (r.fragments > 0) {
            dupeItems.push({ itemId: `asc_fragment_${r.heroId}`, quantity: r.fragments })
          }
        }
      }
      if (totalStardust > 0) dupeItems.push({ itemId: 'currency_stardust', quantity: totalStardust })
      if (dupeItems.length > 0) addItemsLocally(dupeItems)

      const toastItems: AcquireItem[] = pullResults.map((r: PullResult) => ({
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
    } catch (err) {
      setIsPulling(false)
      setError('網路錯誤，請稍後再試')
      console.warn('[GachaScreen] pull error:', err)
    }
  }, [diamond, heroTickets, banner.id, onPullSuccess, heroesList])

  /* ── 裝備抽卡 ── */
  const doEquipPull = useCallback(async (count: 1 | 10, isFree = false) => {
    // 免費抽：限鑽石池單抽
    if (!isFree) {
      if (equipPool === 'diamond') {
        let diamondNeeded = 0
        if (count === 1) {
          diamondNeeded = equipTickets >= 1 ? 0 : getEquipPullCost('diamond', 1).amount
        } else {
          const ticketsUse = Math.min(equipTickets, 10)
          const remaining = 10 - ticketsUse
          const singleCost = getEquipPullCost('diamond', 1).amount
          const tenCost = getEquipPullCost('diamond', 10).amount
          diamondNeeded = remaining > 0 ? (remaining === 10 ? tenCost : remaining * singleCost) : 0
        }
        if (diamondNeeded > diamond) {
          setError(`鑽石不足！需要 ${diamondNeeded.toLocaleString()} 鑽石，目前 ${diamond.toLocaleString()} 鑽石`)
          return
        }
      } else {
        const costInfo = getEquipPullCost(equipPool, count)
        if (gold < costInfo.amount) {
          setError(`金幣不足！需要 ${costInfo.amount.toLocaleString()} 金幣，目前 ${gold.toLocaleString()} 金幣`)
          return
        }
      }
    }

    setError(null)
    setIsPulling(true)
    setRevealPhase(false)

    const pullResults = count === 10 ? equipTenPull(equipPool) : [equipSinglePull(equipPool)]
    const newEquipment = pullResults.map(r => r.equipment)

    try {
      // 先確認 server 成功再寫入本地（避免 server 失敗但本地已加入，refresh 後消失）
      const res = await callApi<{
        success: boolean
        error?: string
        currencies?: { gold?: number; diamond?: number; exp?: number }
        ticketsUsed?: number
        freePullUsed?: boolean
      }>('equip-gacha-pull', {
        poolType: equipPool,
        count,
        isFree,
        equipment: newEquipment,
      })

      if (!res.success) {
        setIsPulling(false)
        if (res.error === 'free_pull_already_used') {
          setFreeEquipPullUsedToday(true)
          setError('今日免費鍛造已使用')
        } else {
          setError(translateError(res.error, '鍛造失敗'))
        }
        return
      }

      // Server 確認成功 → 寫入本地背包
      addEquipmentLocally(newEquipment)

      // 後端唯一權威
      if (res.currencies) applyCurrenciesFromServer(res.currencies)
      if (res.ticketsUsed && res.ticketsUsed > 0) {
        setEquipTickets(prev => Math.max(0, prev - res.ticketsUsed!))
        removeItemsLocally([{ itemId: 'gacha_ticket_equip', quantity: res.ticketsUsed! }])
      }
      if (res.freePullUsed) {
        setFreeEquipPullUsedToday(true)
        updateFreePullLocally('lastEquipFreePull', getTaipeiDateStr())
      }

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
    } catch (err) {
      setIsPulling(false)
      setError('網路錯誤，請稍後再試')
      console.warn('[GachaScreen] equip pull error:', err)
    }
  }, [equipPool, gold, diamond, equipTickets])

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
          <PanelInfoTip description={PANEL_DESCRIPTIONS.gacha} />
          <div className="gacha-currencies">
            <InfoTip icon={<CurrencyIcon type="diamond" />} value={diamond.toLocaleString()} label="鑽石" description="召喚英雄、抽取裝備所需" className="menu-diamond" />
            <InfoTip icon={<CurrencyIcon type="gold" />} value={gold.toLocaleString()} label="金幣" description="金幣池裝備鍛造所需" className="menu-gold" />
          </div>
        </div>

        {/* Tab Selector */}
        <div className="gacha-tabs">
          <button
            className={`gacha-tab ${tab === 'hero' ? 'gacha-tab-active' : ''}`}
            onClick={() => { setTab('hero'); setError(null) }}
            style={{ position: 'relative' }}
          >
            🧟 英雄召喚
            {!freePullUsedToday && <RedDot size="sm" />}
          </button>
          <button
            className={`gacha-tab ${tab === 'equipment' ? 'gacha-tab-active' : ''}`}
            onClick={() => { setTab('equipment'); setError(null) }}
            style={{ position: 'relative' }}
          >
            ⚔️ 裝備鍛造
            {!freeEquipPullUsedToday && <RedDot size="sm" />}
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

            {/* 召喚券資訊 */}
            <div className="gacha-ticket-info">
              <span className="gacha-ticket-item">🎟️ 召喚券：{heroTickets} 張</span>
            </div>

            <div className="gacha-buttons">
              {/* 單抽：免費優先→券優先→鑽石 */}
              <button
                className={`gacha-pull-btn ${!freePullUsedToday ? 'gacha-pull-free' : 'gacha-pull-single'}`}
                disabled={(freePullUsedToday && heroTickets < 1 && diamond < SINGLE_PULL_COST) || isPulling}
                onClick={() => freePullUsedToday ? doPull(1) : doPull(1, true)}
              >
                <span className="gacha-btn-label">單抽</span>
                <span className="gacha-btn-cost">
                  {!freePullUsedToday
                    ? '🎁 免費'
                    : heroTickets >= 1
                      ? '🎟️ ×1'
                      : <><CurrencyIcon type="diamond" /> {SINGLE_PULL_COST}</>
                  }
                </span>
              </button>
              {/* 十連抽：券+鑽石混合 */}
              <button
                className="gacha-pull-btn gacha-pull-ten"
                disabled={(() => {
                  const ticketsUse = Math.min(heroTickets, 10)
                  const remaining = 10 - ticketsUse
                  const cost = remaining > 0 ? (remaining === 10 ? TEN_PULL_COST : remaining * SINGLE_PULL_COST) : 0
                  return cost > diamond
                })() || isPulling}
                onClick={() => doPull(10)}
              >
                <span className="gacha-btn-label">十連抽</span>
                <span className="gacha-btn-cost">
                  {heroTickets >= 10 ? '🎟️ ×10' : heroTickets > 0 ? <>🎟️ ×{heroTickets} + <CurrencyIcon type="diamond" /> {(10 - heroTickets) * SINGLE_PULL_COST}</> : <><CurrencyIcon type="diamond" /> {TEN_PULL_COST}</>}
                </span>
              </button>
            </div>
            {/* 免費抽倒數 */}
            {freePullUsedToday && (
              <div className="gacha-free-countdown">
                距離下次免費召喚：{countdown}
              </div>
            )}
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

            {/* 鑽石池才顯示鍛造券 */}
            {equipPool === 'diamond' && (
              <div className="gacha-ticket-info">
                <span className="gacha-ticket-item">🔧 鍛造券：{equipTickets} 張</span>
              </div>
            )}

            <div className="gacha-buttons">
              {/* 單抽：鑽石池有免費→券→鑽石 / 金幣池直接扣 */}
              <button
                className={`gacha-pull-btn ${equipPool === 'diamond' && !freeEquipPullUsedToday ? 'gacha-pull-free' : 'gacha-pull-single'}`}
                disabled={(() => {
                  if (equipPool === 'diamond' && !freeEquipPullUsedToday) return false // 免費可用
                  if (equipPool === 'gold') return gold < equipCostSingle.amount
                  return equipTickets < 1 && diamond < equipCostSingle.amount
                })() || isPulling}
                onClick={() => {
                  if (equipPool === 'diamond' && !freeEquipPullUsedToday) {
                    doEquipPull(1, true)
                  } else {
                    doEquipPull(1)
                  }
                }}
              >
                <span className="gacha-btn-label">單抽</span>
                <span className="gacha-btn-cost">
                  {equipPool === 'diamond' && !freeEquipPullUsedToday
                    ? '🎁 免費'
                    : equipPool === 'diamond' && equipTickets >= 1
                      ? '🔧 ×1'
                      : <><CurrencyIcon type={equipPool === 'gold' ? 'gold' : 'diamond'} /> {equipCostSingle.amount.toLocaleString()}</>
                  }
                </span>
              </button>
              <button
                className="gacha-pull-btn gacha-pull-ten"
                disabled={(() => {
                  if (equipPool === 'gold') return gold < equipCostTen.amount
                  const ticketsUse = Math.min(equipTickets, 10)
                  const remaining = 10 - ticketsUse
                  const cost = remaining > 0 ? (remaining === 10 ? equipCostTen.amount : remaining * equipCostSingle.amount) : 0
                  return cost > diamond
                })() || isPulling}
                onClick={() => doEquipPull(10)}
              >
                <span className="gacha-btn-label">十連抽</span>
                <span className="gacha-btn-cost">
                  {equipPool === 'diamond' && equipTickets >= 10 
                    ? '🔧 ×10' 
                    : equipPool === 'diamond' && equipTickets > 0 
                      ? <>🔧 ×{equipTickets} + <CurrencyIcon type="diamond" /> {(10 - equipTickets) * equipCostSingle.amount}</>
                      : <><CurrencyIcon type={equipPool === 'gold' ? 'gold' : 'diamond'} /> {equipCostTen.amount.toLocaleString()}</>
                  }
                </span>
              </button>
            </div>
            {/* 鑽石池免費抽倒數 */}
            {equipPool === 'diamond' && freeEquipPullUsedToday && (
              <div className="gacha-free-countdown">
                距離下次免費鍛造：{countdown}
              </div>
            )}
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
                const hero = heroMap.get(r.heroId)
                return (
                  <div key={i} className={`gacha-card-reveal${shimmerClass}`} style={{ animationDelay: `${i * 0.1}s` }}>
                    <ResultCard result={r} hero={hero} onClick={() => setSelectedHeroResult({ result: r, hero })} />
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
                    <EquipResultCard eq={r.equipment} isGuaranteed={r.isGuaranteed} onClick={() => setSelectedEquip(r.equipment)} />
                  </div>
                )
              })}
            </div>
            <button className="gacha-results-close" onClick={closeEquipResults}>確認</button>
          </div>
        </div>
      )}

      {/* Hero Info Popup */}
      {selectedHeroResult && selectedHeroResult.hero && (
        <HeroInfoPopup
          hero={selectedHeroResult.hero}
          rarity={selectedHeroResult.result.rarity}
          onClose={() => setSelectedHeroResult(null)}
        />
      )}

      {/* Equipment Info Popup */}
      {selectedEquip && (
        <EquipInfoPopup
          eq={selectedEquip}
          onClose={() => setSelectedEquip(null)}
        />
      )}
    </div>
  )
}
