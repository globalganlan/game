/**
 * InventoryPanel — 背包面板
 *
 * 顯示玩家目前擁有的道具與裝備。
 * 支援分類篩選、排序、道具詳情、使用/出售操作。
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { InventoryItem } from '../services/saveService'
import { getSaveState } from '../services/saveService'
import type { RawHeroData } from '../types'
import {
  loadInventory,
  getInventoryState,
  filterItemsByCategory,
  onInventoryChange,
  sellItems,
  useItem,
  lockEquipment,
  type ItemCategory,
  type ItemDefinition,
  type InventoryState,
} from '../services/inventoryService'
import type { EquipmentInstance } from '../domain/progressionSystem'
import { enhancedMainStat } from '../domain/progressionSystem'
import { emitAcquire } from '../services/acquireToastBus'
import { emitToast } from '../services/acquireToastBus'
import { openEquipmentChest, getEquipDisplayName, SET_NAMES } from '../domain/equipmentGacha'
import { addEquipmentLocally, equipItem, unequipItem, getHeroEquipment } from '../services/inventoryService'
import { statZh } from '../constants/statNames'
import { CodexPanel } from './CodexPanel'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface InventoryPanelProps {
  onBack: () => void
  heroesList?: RawHeroData[]
  heroInstances?: import('../services/saveService').HeroInstance[]
}

/* ────────────────────────────
   Fallback 中文名稱
   ──────────────────────────── */

import { getItemIcon, getItemName } from '../constants/rarity'
import { CurrencyIcon } from './CurrencyIcon'

/** 根據 itemId pattern 推導中文名稱 */
function resolveFallbackName(
  itemId: string,
  heroMap?: Map<number, string>,
): { name: string; icon: string } {
  // 1. 突破碎片：asc_fragment_<heroId>（需要 heroMap 才能顯示英雄名稱）
  const fragMatch = itemId.match(/^asc_fragment_(\d+)$/)
  if (fragMatch) {
    const heroId = Number(fragMatch[1])
    const heroName = heroMap?.get(heroId)
    return {
      name: heroName ? `${heroName}碎片` : `突破碎片 #${heroId}`,
      icon: getItemIcon(itemId),
    }
  }

  // 2. 共用名稱 + icon
  return { name: getItemName(itemId), icon: getItemIcon(itemId) }
}

/* ────────────────────────────
   Category Tabs
   ──────────────────────────── */

interface CategoryTab {
  key: ItemCategory | 'all' | 'codex'
  icon: React.ReactNode
  label: string
}

const TABS: CategoryTab[] = [
  { key: 'all',                icon: '📦', label: '全部' },
  { key: 'equipment',          icon: '⚔️', label: '裝備' },
  { key: 'ascension_material', icon: '🔥', label: '突破' },
  { key: 'general_material',   icon: '🧪', label: '素材' },
  { key: 'chest',              icon: '🎁', label: '寶箱' },
  { key: 'currency',           icon: <CurrencyIcon type="gold" />, label: '貨幣' },
  { key: 'codex',              icon: '📖', label: '圖鑑' },
]

type SortMode = 'default' | 'rarity-desc' | 'quantity-desc' | 'name-asc'

/* ────────────────────────────
   Rarity Colors（共用常數）
   ──────────────────────────── */

import { RARITY_COLORS } from '../constants/rarity'
// getItemIcon, getItemName 已在上方匯入

/* ────────────────────────────
   Item Cell
   ──────────────────────────── */

interface ItemCellProps {
  item: InventoryItem
  definition?: ItemDefinition
  onClick: () => void
}

function ItemCell({ item, definition, onClick, heroMap }: ItemCellProps & { heroMap?: Map<number, string> }) {
  const fallback = resolveFallbackName(item.itemId, heroMap)
  // 英雄碎片：一律用 fallback（帶英雄名稱），不用 DB 原始 name
  const isFragment = item.itemId.startsWith('asc_fragment_')
  const name = isFragment ? fallback.name : (definition?.name || fallback.name)
  const rarity = definition?.rarity || 'N'
  const icon = definition?.icon || fallback.icon
  const border = RARITY_COLORS[rarity] || '#666'
  const qty = Math.round(item.quantity)

  // 英雄碎片：使用英雄縮圖 + 拼圖角標
  const fragMatch = item.itemId.match(/^asc_fragment_(\d+)$/)
  const thumbUrl = fragMatch
    ? `${import.meta.env.BASE_URL}models/zombie_${fragMatch[1]}/thumbnail.png`
    : null

  return (
    <button
      className="inv-cell"
      style={{ '--cell-border': border } as React.CSSProperties}
      onClick={onClick}
    >
      {thumbUrl ? (
        <span className="inv-cell-icon inv-cell-thumb-wrap">
          <img className="inv-cell-thumb" src={thumbUrl} alt={name} />
          <span className="inv-cell-puzzle">🧩</span>
        </span>
      ) : (
        <span className="inv-cell-icon">{icon}</span>
      )}
      <span className="inv-cell-name">{name}</span>
      <span className="inv-cell-qty">×{qty}</span>
    </button>
  )
}

/* ────────────────────────────
   Item Detail Modal
   ──────────────────────────── */

interface ItemDetailProps {
  item: InventoryItem
  definition?: ItemDefinition
  onClose: () => void
}

function ItemDetail({ item, definition, onClose, heroMap }: ItemDetailProps & { heroMap?: Map<number, string> }) {
  const fallback = resolveFallbackName(item.itemId, heroMap)
  const isFragment = item.itemId.startsWith('asc_fragment_')
  const name = isFragment ? fallback.name : (definition?.name || fallback.name)
  const rawDesc = definition?.description || '無描述'
  const desc = isFragment ? '可用於英雄突破升星的專屬碎片' : rawDesc
  const rarity = definition?.rarity || 'N'
  const sellPrice = definition?.sellPrice || 0
  const qty = Math.round(item.quantity)
  const [actionMsg, setActionMsg] = useState('')

  // 英雄碎片縮圖
  const fragMatch = item.itemId.match(/^asc_fragment_(\d+)$/)
  const thumbUrl = fragMatch
    ? `${import.meta.env.BASE_URL}models/zombie_${fragMatch[1]}/thumbnail.png`
    : null

  const canUse = !!definition?.useAction
  const canSell = sellPrice > 0 && qty > 0
  const [loading, setLoading] = useState(false)

  const isChest = item.itemId.startsWith('chest_')

  const handleUse = useCallback(async () => {
    if (!canUse || loading) return
    try {
      // 裝備寶箱 — 本地生成裝備（裝備 ID 需前端產生以綁定 equipId）
      if (item.itemId === 'chest_equipment') {
        const eq = openEquipmentChest()
        addEquipmentLocally([eq])
        setLoading(true)
        setActionMsg('開啟中...')
        const result = await useItem(item.itemId, 1, undefined, { equipment: [eq] })
        setLoading(false)
        if (!result.success) {
          setActionMsg('使用失敗')
          return
        }
        const eqName = getEquipDisplayName(eq)
        setActionMsg(`開啟獲得：${eq.rarity} ${eqName}`)
        emitAcquire([{
          type: 'equipment' as const,
          id: eq.equipId,
          name: eqName,
          quantity: 1,
          rarity: eq.rarity,
        }])
        return
      }

      // 銅/銀/金寶箱 — 伺服器開獎（防作弊，結果以伺服器為準）
      if (item.itemId === 'chest_bronze' || item.itemId === 'chest_silver' || item.itemId === 'chest_gold') {
        setLoading(true)
        setActionMsg('開啟中...')
        const result = await useItem(item.itemId, 1)
        setLoading(false)
        if (!result.success) {
          setActionMsg('使用失敗')
          return
        }
        // 伺服器回傳實際獎勵 → 寫入本地
        if (result.result && typeof result.result === 'object') {
          const r = result.result as Record<string, unknown>
          const { addItemsLocally } = await import('../services/inventoryService')
          const { updateLocalCurrency, updateProgress, getSaveState } = await import('../services/saveService')
          const acquireItems: { type: 'currency' | 'item'; id: string; name: string; quantity: number; rarity?: 'N' | 'R' | 'SR' | 'SSR' }[] = []
          if (typeof r.gold === 'number' && r.gold > 0) {
            updateLocalCurrency('gold', r.gold)
            acquireItems.push({ type: 'currency', id: 'gold', name: '金幣', quantity: r.gold })
          }
          if (typeof r.diamond === 'number' && r.diamond > 0) {
            updateLocalCurrency('diamond', r.diamond)
            acquireItems.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: r.diamond, rarity: 'SR' })
          }
          if (typeof r.exp === 'number' && r.exp > 0) {
            updateProgress({ exp: (getSaveState()?.save.exp ?? 0) + r.exp })
            acquireItems.push({ type: 'currency', id: 'exp', name: '經驗', quantity: r.exp })
          }
          if (Array.isArray(r.items)) {
            const toAdd = (r.items as { itemId?: string; quantity?: number }[])
              .filter(i => i.itemId && i.quantity)
              .map(i => ({ itemId: i.itemId!, quantity: i.quantity! }))
            if (toAdd.length > 0) addItemsLocally(toAdd)
            for (const ri of toAdd) {
              acquireItems.push({ type: 'item', id: ri.itemId, name: getItemName(ri.itemId), quantity: ri.quantity })
            }
          }
          if (acquireItems.length > 0) emitAcquire(acquireItems)
        }
        setActionMsg('寶箱已開啟！')
        return
      }

      // 一般道具
      const result = await useItem(item.itemId, 1)
      if (result.success) {
        if (result.result && typeof result.result === 'object') {
          const r = result.result as Record<string, unknown>
          const items: { type: 'currency' | 'item'; id: string; name: string; quantity: number; rarity?: 'N' | 'R' | 'SR' | 'SSR' }[] = []
          if (typeof r.gold === 'number' && r.gold > 0) items.push({ type: 'currency', id: 'gold', name: '金幣', quantity: r.gold })
          if (typeof r.diamond === 'number' && r.diamond > 0) items.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: r.diamond, rarity: 'SR' })
          if (Array.isArray(r.items)) {
            for (const ri of r.items as { itemId?: string; name?: string; quantity?: number }[]) {
              if (ri.itemId && ri.quantity) items.push({ type: 'item', id: ri.itemId, name: getItemName(ri.itemId), quantity: ri.quantity })
            }
          }
          if (items.length > 0) {
            emitAcquire(items)
            try {
              const { updateLocalCurrency, updateProgress, getSaveState } = await import('../services/saveService')
              const { addItemsLocally } = await import('../services/inventoryService')
              if (typeof r.gold === 'number' && r.gold > 0) updateLocalCurrency('gold', r.gold as number)
              if (typeof r.diamond === 'number' && r.diamond > 0) updateLocalCurrency('diamond', r.diamond as number)
              if (typeof r.exp === 'number' && r.exp > 0) updateProgress({ exp: (getSaveState()?.save.exp ?? 0) + (r.exp as number) })
              // 同步道具到本地背包
              if (Array.isArray(r.items)) {
                const toAdd = (r.items as { itemId?: string; quantity?: number }[])
                  .filter(i => i.itemId && i.quantity)
                  .map(i => ({ itemId: i.itemId!, quantity: i.quantity! }))
                if (toAdd.length > 0) addItemsLocally(toAdd)
              }
            } catch { /* silent */ }
          }
          setActionMsg(r.type === 'chest' ? '寶箱已開啟！' : '使用成功！')
        } else {
          setActionMsg('使用成功！')
        }
      } else {
        setActionMsg('使用失敗')
      }
    } catch { setActionMsg('使用失敗') }
  }, [item.itemId, canUse, loading])

  const handleSell = useCallback(() => {
    if (!canSell) return
    const gold = sellItems([{ itemId: item.itemId, quantity: 1 }])
    // 本地金幣同步（sellItems 已樂觀扣背包，金幣需 saveService 更新）
    if (gold > 0) {
      import('../services/saveService').then(({ updateLocalCurrency }) => {
        updateLocalCurrency('gold', gold)
      })
    }
    setActionMsg(`出售獲得 ${gold} 金幣`)
  }, [item.itemId, canSell])

  return (
    <div className="inv-detail-backdrop" onClick={onClose}>
      <div className="inv-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="inv-detail-close" onClick={onClose}>✕</button>
        <div className="inv-detail-header">
          {thumbUrl ? (
            <span className="inv-detail-icon inv-cell-thumb-wrap">
              <img className="inv-cell-thumb" src={thumbUrl} alt={name} style={{ width: 48, height: 48 }} />
              <span className="inv-cell-puzzle">🧩</span>
            </span>
          ) : (
            <span className="inv-detail-icon">{definition?.icon || fallback.icon}</span>
          )}
          <div>
            <h3 style={{ color: RARITY_COLORS[rarity] }}>{name}</h3>
            <span className="inv-detail-rarity">{rarity}</span>
          </div>
        </div>
        <p className="inv-detail-desc">{desc}</p>
        <div className="inv-detail-info">
          <span>數量：{qty}</span>
          {sellPrice > 0 && <span>出售價：金幣 {sellPrice}/個</span>}
        </div>
        {actionMsg && <div className="inv-action-msg">{actionMsg}</div>}
        <div className="inv-detail-actions">
          {canUse && (
            <button className="inv-action-btn inv-use-btn" onClick={handleUse} disabled={loading}>
              {loading ? '開啟中...' : (isChest ? '開啟' : '使用')}
            </button>
          )}
          {canSell && (
            <button className="inv-action-btn inv-sell-btn" onClick={handleSell}>
              出售 (+{sellPrice}<CurrencyIcon type="gold" />)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────
   Equipment Detail Modal
   ──────────────────────────── */

interface EquipmentDetailProps {
  equip: EquipmentInstance
  onClose: () => void
  heroInstances?: import('../services/saveService').HeroInstance[]
  heroNameMap?: Map<number, string>
}

function EquipmentDetail({ equip, onClose, heroInstances, heroNameMap }: EquipmentDetailProps) {
  const [actionMsg, setActionMsg] = useState('')
  const [showHeroSelect, setShowHeroSelect] = useState(false)
  const slotLabel = equip.slot === 'weapon' ? '武器' : equip.slot === 'armor' ? '護甲'
    : equip.slot === 'ring' ? '戒指' : '鞋子'
  const slotIcon = equip.slot === 'weapon' ? '⚔️' : equip.slot === 'armor' ? '🛡️'
    : equip.slot === 'ring' ? '💍' : '👢'

  const handleToggleLock = useCallback(async () => {
    const newLocked = !equip.locked
    await lockEquipment(equip.equipId, newLocked)
    setActionMsg(newLocked ? '已鎖定' : '已解鎖')
  }, [equip])

  const handleUnequip = useCallback(async () => {
    try {
      await unequipItem(equip.equipId)
      setActionMsg('已卸下裝備')
      emitToast('✅ 已卸下裝備')
    } catch { setActionMsg('卸下失敗') }
  }, [equip.equipId])

  const handleEquipTo = useCallback(async (heroInstId: string, heroName: string) => {
    try {
      // 先檢查該英雄同格位是否已有裝備
      const heroEqs = getHeroEquipment(heroInstId)
      const conflict = heroEqs.find(e => e.slot === equip.slot && e.equipId !== equip.equipId)
      await equipItem(equip.equipId, heroInstId)
      setActionMsg(`已裝備給 ${heroName}`)
      emitToast(`✅ 已裝備給 ${heroName}${conflict ? '（舊裝備已自動卸下）' : ''}`)
      setShowHeroSelect(false)
    } catch { setActionMsg('裝備失敗') }
  }, [equip.equipId, equip.slot])

  // 英雄名稱解析
  const getHeroName = useCallback((instId: string) => {
    const inst = heroInstances?.find(h => h.instanceId === instId)
    if (!inst) return instId
    return heroNameMap?.get(inst.heroId) ?? `英雄#${inst.heroId}`
  }, [heroInstances, heroNameMap])

  return (
    <div className="inv-detail-backdrop" onClick={onClose}>
      <div className="inv-detail-card inv-equip-detail" onClick={e => e.stopPropagation()}>
        <button className="inv-detail-close" onClick={onClose}>✕</button>
        <div className="inv-detail-header">
          <span className="inv-detail-icon">{slotIcon}</span>
          <div>
            <h3 style={{ color: RARITY_COLORS[equip.rarity] ?? '#ddd' }}>
              {getEquipDisplayName(equip)}
              {equip.enhanceLevel > 0 && <span className="inv-equip-enhance"> +{equip.enhanceLevel}</span>}
            </h3>
            <span className="inv-detail-rarity">
              {equip.rarity} · {slotLabel}
              {equip.locked && ' · 🔒'}
            </span>
          </div>
        </div>
        {/* 主屬性 */}
        <div className="inv-equip-main-stat">
          <span>{statZh(equip.mainStat ?? '?')}</span>
          <span className="inv-equip-stat-val">+{enhancedMainStat(equip.mainStatValue ?? 0, equip.enhanceLevel ?? 0)}</span>
        </div>
        {/* 副屬性 */}
        {(equip.subStats ?? []).length > 0 && (
          <div className="inv-equip-sub-stats">
            {(equip.subStats ?? []).map((sub, i) => (
              <div key={i} className="inv-equip-sub-row">
                <span>{statZh(sub.stat)}</span>
                <span>+{sub.value}{sub.isPercent ? '%' : ''}</span>
              </div>
            ))}
          </div>
        )}
        {/* 套裝 */}
        {equip.setId && (
          <div className="inv-equip-set-tag">套裝：{SET_NAMES[equip.setId] || equip.setId}</div>
        )}
        {/* 裝備狀態 */}
        {equip.equippedBy && (
          <div className="inv-equip-equipped-by">已裝備給：{getHeroName(equip.equippedBy)}</div>
        )}
        {actionMsg && <div className="inv-action-msg">{actionMsg}</div>}
        <div className="inv-detail-actions">
          <button className="inv-action-btn inv-lock-btn" onClick={handleToggleLock}>
            {equip.locked ? '🔓 解鎖' : '🔒 鎖定'}
          </button>
          {equip.equippedBy ? (
            <button className="inv-action-btn inv-sell-btn" onClick={handleUnequip}>
              ⬇️ 卸下
            </button>
          ) : (
            <button className="inv-action-btn inv-use-btn" onClick={() => setShowHeroSelect(true)}>
              ⬆️ 裝備給英雄
            </button>
          )}
        </div>

        {/* 英雄選擇彈窗 */}
        {showHeroSelect && heroInstances && heroInstances.length > 0 && (
          <div className="inv-hero-select">
            <div className="inv-hero-select-title">選擇英雄</div>
            {heroInstances.map(h => {
              const name = heroNameMap?.get(h.heroId) ?? `英雄#${h.heroId}`
              return (
                <button
                  key={h.instanceId}
                  className="inv-hero-select-btn"
                  onClick={() => handleEquipTo(h.instanceId, name)}
                >
                  {name} (Lv.{h.level})
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────
   Main Panel
   ──────────────────────────── */

export function InventoryPanel({ onBack, heroesList, heroInstances }: InventoryPanelProps) {
  const heroNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const h of (heroesList ?? [])) {
      const id = Number(h.HeroID ?? 0)
      if (id && h.Name) m.set(id, h.Name)
    }
    return m
  }, [heroesList])
  const [invState, setInvState] = useState<InventoryState | null>(getInventoryState)
  const [activeTab, setActiveTab] = useState<ItemCategory | 'all' | 'codex'>('all')
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [selectedEquip, setSelectedEquip] = useState<EquipmentInstance | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('default')

  const saveState = getSaveState()
  const gold = saveState?.save.gold ?? 0
  const diamond = saveState?.save.diamond ?? 0

  // Load inventory on mount if not cached
  useEffect(() => {
    if (!invState) {
      setIsLoading(true)
      loadInventory()
        .then(setInvState)
        .catch((e) => console.warn('[inventory] load failed:', e))
        .finally(() => setIsLoading(false))
    }
    const unsub = onInventoryChange(setInvState)
    return unsub
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(() => {
    if (!invState) return []
    let items: InventoryItem[]
    if (activeTab === 'all') {
      items = invState.items.filter((i) => i.quantity > 0)
    } else if (activeTab === 'equipment') {
      // 裝備分頁由 equipment 清單處理，這裡回傳空
      items = []
    } else if (activeTab === 'codex') {
      items = []
    } else {
      items = filterItemsByCategory(activeTab)
    }
    // 排序
    if (sortMode === 'quantity-desc') {
      items = [...items].sort((a, b) => b.quantity - a.quantity)
    } else if (sortMode === 'rarity-desc') {
      const rarityOrder: Record<string, number> = { SSR: 4, SR: 3, R: 2, N: 1 }
      items = [...items].sort((a, b) => {
        const ra = rarityOrder[invState.definitions.get(a.itemId)?.rarity ?? 'N'] ?? 0
        const rb = rarityOrder[invState.definitions.get(b.itemId)?.rarity ?? 'N'] ?? 0
        return rb - ra
      })
    } else if (sortMode === 'name-asc') {
      items = [...items].sort((a, b) => {
        const na = invState.definitions.get(a.itemId)?.name ?? a.itemId
        const nb = invState.definitions.get(b.itemId)?.name ?? b.itemId
        return na.localeCompare(nb)
      })
    }
    return items
  }, [invState, activeTab, sortMode])

  /** 裝備清單（全部 / 裝備分頁都需要） */
  const equipmentList = useMemo(() => {
    if (!invState || (activeTab !== 'equipment' && activeTab !== 'all')) return []
    return [...invState.equipment].sort((a, b) => {
      const aEquipped = a.equippedBy ? 0 : 1
      const bEquipped = b.equippedBy ? 0 : 1
      if (aEquipped !== bEquipped) return aEquipped - bEquipped
      // 同組內依稀有度排序
      const rarityOrder: Record<string, number> = { SSR: 4, SR: 3, R: 2, N: 1 }
      return (rarityOrder[b.rarity] ?? 0) - (rarityOrder[a.rarity] ?? 0)
    })
  }, [invState, activeTab])

  const showEquipment = activeTab === 'all' || activeTab === 'equipment'

  /** 圖鑑：已擁有的裝備 templateId 集合 */
  const ownedEquipTemplateIds = useMemo(() => {
    const s = new Set<string>()
    if (invState) {
      for (const eq of invState.equipment) {
        if (eq.templateId) s.add(eq.templateId)
      }
    }
    return s
  }, [invState])

  const getDef = useCallback(
    (itemId: string): ItemDefinition | undefined => invState?.definitions.get(itemId),
    [invState],
  )

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🎒 背包</h2>
          <div className="inv-currency-bar">
            <span className="inv-currency"><CurrencyIcon type="gold" /> {gold.toLocaleString()}</span>
            <span className="inv-currency"><CurrencyIcon type="diamond" /> {diamond.toLocaleString()}</span>
          </div>
          {invState && (
            <span className="inv-capacity">
              {invState.equipment.length}/{invState.equipmentCapacity} 裝備
            </span>
          )}
        </div>

        {/* Category Tabs */}
        <div className="inv-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`inv-tab ${activeTab === tab.key ? 'inv-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Sort bar （圖鑑 tab 不顯示） */}
        {activeTab !== 'codex' && (<>
        <div className="inv-sort-bar">
          <select
            className="inv-sort-select"
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
          >
            <option value="default">預設排序</option>
            <option value="rarity-desc">稀有度↓</option>
            <option value="quantity-desc">數量↓</option>
            <option value="name-asc">名稱排序</option>
          </select>
        </div>

        {/* Items Grid */}
        <div className="inv-grid">
          {isLoading && <div className="inv-loading">載入中...</div>}
          {!isLoading && activeTab !== 'equipment' && filteredItems.length === 0 && equipmentList.length === 0 && (
            <div className="inv-empty">此分類無道具</div>
          )}
          {activeTab !== 'equipment' && filteredItems.map((item) => (
            <ItemCell
              key={item.itemId}
              item={item}
              definition={getDef(item.itemId)}
              heroMap={heroNameMap}
              onClick={() => setSelectedItem(item)}
            />
          ))}
          {/* 裝備（全部 / 裝備分頁） */}
          {showEquipment && activeTab === 'equipment' && equipmentList.length === 0 && (
            <div className="inv-empty">尚無裝備</div>
          )}
          {showEquipment && equipmentList.map(eq => (
            <button
              key={eq.equipId}
              className={`inv-cell inv-equip-cell${eq.equippedBy ? ' inv-equip-in-use' : ''}`}
              style={{ '--cell-border': RARITY_COLORS[eq.rarity] ?? '#666' } as React.CSSProperties}
              onClick={() => setSelectedEquip(eq)}
            >
              <span className="inv-cell-icon">
                {eq.slot === 'weapon' ? '⚔️' : eq.slot === 'armor' ? '🛡️' : eq.slot === 'ring' ? '💍' : '👢'}
              </span>
              <span className="inv-cell-name">{getEquipDisplayName(eq)}</span>
              <span className="inv-cell-qty">
                +{eq.enhanceLevel}
                {eq.locked && ' 🔒'}
              </span>
              {eq.equippedBy && <span className="inv-equip-badge">使用中</span>}
            </button>
          ))}
        </div>
      </>)}

      {/* 圖鑑面板 */}
      {activeTab === 'codex' && (
        <CodexPanel ownedEquipTemplateIds={ownedEquipTemplateIds} />
      )}
      </div>

      {/* Item Detail */}
      {selectedItem && (
        <ItemDetail
          item={selectedItem}
          definition={getDef(selectedItem.itemId)}
          heroMap={heroNameMap}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Equipment Detail */}
      {selectedEquip && (
        <EquipmentDetail
          equip={selectedEquip}
          onClose={() => setSelectedEquip(null)}
          heroInstances={heroInstances}
          heroNameMap={heroNameMap}
        />
      )}
    </div>
  )
}
