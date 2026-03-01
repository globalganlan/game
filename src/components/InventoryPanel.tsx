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
import { openEquipmentChest, getEquipDisplayName } from '../domain/equipmentGacha'
import { addEquipmentLocally } from '../services/inventoryService'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface InventoryPanelProps {
  onBack: () => void
  heroesList?: RawHeroData[]
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
  key: ItemCategory | 'all'
  icon: React.ReactNode
  label: string
}

const TABS: CategoryTab[] = [
  { key: 'all',                icon: '📦', label: '全部' },
  { key: 'exp_material',       icon: '📗', label: '經驗' },
  { key: 'ascension_material', icon: '🔥', label: '突破' },
  { key: 'general_material',   icon: '🧪', label: '通用' },
  { key: 'chest',              icon: '🎁', label: '寶箱' },
  { key: 'currency',           icon: <CurrencyIcon type="gold" />, label: '貨幣' },
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
  const name = definition?.name || fallback.name
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
  const name = definition?.name || fallback.name
  const desc = definition?.description || '無描述'
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

  const handleUse = useCallback(async () => {
    if (!canUse) return
    try {
      // 裝備寶箱 — 本地生成裝備
      if (item.itemId === 'chest_equipment') {
        const eq = openEquipmentChest()
        addEquipmentLocally([eq])
        // 扣減寶箱（本地 + 背景同步，帶 equipment 讓 server 持久化）
        const result = await useItem(item.itemId, 1, undefined, { equipment: [eq] })
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
      // 一般道具
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const result = await useItem(item.itemId, 1)
      if (result.success) {
        setActionMsg('使用成功！')
        // 寶箱/道具結果觸發獲得物品動畫
        if (result.result && typeof result.result === 'object') {
          const r = result.result as Record<string, unknown>
          const items: { type: 'currency' | 'item'; id: string; name: string; quantity: number; rarity?: 'N' | 'R' | 'SR' | 'SSR' }[] = []
          if (typeof r.gold === 'number' && r.gold > 0) items.push({ type: 'currency', id: 'gold', name: '金幣', quantity: r.gold })
          if (typeof r.diamond === 'number' && r.diamond > 0) items.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: r.diamond, rarity: 'SR' })
          if (typeof r.exp === 'number' && r.exp > 0) items.push({ type: 'currency', id: 'exp', name: '經驗', quantity: r.exp })
          if (Array.isArray(r.items)) {
            for (const ri of r.items as { itemId?: string; name?: string; quantity?: number }[]) {
              if (ri.itemId && ri.quantity) items.push({ type: 'item', id: ri.itemId, name: ri.name || ri.itemId, quantity: ri.quantity })
            }
          }
          if (items.length > 0) emitAcquire(items)
        }
      } else {
        setActionMsg('使用失敗')
      }
    } catch { setActionMsg('使用失敗') }
  }, [item.itemId, canUse])

  const handleSell = useCallback(async () => {
    if (!canSell) return
    try {
      const gold = await sellItems([{ itemId: item.itemId, quantity: 1 }])
      setActionMsg(`出售獲得 ${gold} 金幣`)
    } catch { setActionMsg('出售失敗') }
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
            <button className="inv-action-btn inv-use-btn" onClick={handleUse}>
              使用
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
}

function EquipmentDetail({ equip, onClose }: EquipmentDetailProps) {
  const [actionMsg, setActionMsg] = useState('')
  const slotLabel = equip.slot === 'weapon' ? '武器' : equip.slot === 'armor' ? '護甲'
    : equip.slot === 'ring' ? '戒指' : '鞋子'
  const slotIcon = equip.slot === 'weapon' ? '⚔️' : equip.slot === 'armor' ? '🛡️'
    : equip.slot === 'ring' ? '💍' : '👢'

  const handleToggleLock = useCallback(async () => {
    const newLocked = !equip.locked
    await lockEquipment(equip.equipId, newLocked)
    setActionMsg(newLocked ? '已鎖定' : '已解鎖')
  }, [equip])

  return (
    <div className="inv-detail-backdrop" onClick={onClose}>
      <div className="inv-detail-card inv-equip-detail" onClick={e => e.stopPropagation()}>
        <button className="inv-detail-close" onClick={onClose}>✕</button>
        <div className="inv-detail-header">
          <span className="inv-detail-icon">{slotIcon}</span>
          <div>
            <h3 style={{ color: RARITY_COLORS[equip.rarity] ?? '#ddd' }}>
              {equip.templateId}
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
          <span>{equip.mainStat}</span>
          <span className="inv-equip-stat-val">+{enhancedMainStat(equip.mainStatValue, equip.enhanceLevel)}</span>
        </div>
        {/* 副屬性 */}
        {equip.subStats.length > 0 && (
          <div className="inv-equip-sub-stats">
            {equip.subStats.map((sub, i) => (
              <div key={i} className="inv-equip-sub-row">
                <span>{sub.stat}</span>
                <span>+{sub.value}{sub.isPercent ? '%' : ''}</span>
              </div>
            ))}
          </div>
        )}
        {/* 套裝 */}
        {equip.setId && (
          <div className="inv-equip-set-tag">套裝：{equip.setId}</div>
        )}
        {/* 裝備狀態 */}
        {equip.equippedBy && (
          <div className="inv-equip-equipped-by">已裝備給英雄</div>
        )}
        {actionMsg && <div className="inv-action-msg">{actionMsg}</div>}
        <div className="inv-detail-actions">
          <button className="inv-action-btn inv-lock-btn" onClick={handleToggleLock}>
            {equip.locked ? '🔓 解鎖' : '🔒 鎖定'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────
   Main Panel
   ──────────────────────────── */

export function InventoryPanel({ onBack, heroesList }: InventoryPanelProps) {
  const heroNameMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const h of (heroesList ?? [])) {
      const id = Number(h.HeroID ?? 0)
      if (id && h.Name) m.set(id, h.Name)
    }
    return m
  }, [heroesList])
  const [invState, setInvState] = useState<InventoryState | null>(getInventoryState)
  const [activeTab, setActiveTab] = useState<ItemCategory | 'all'>('all')
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

  /** 裝備分頁用的裝備清單 */
  const equipmentList = useMemo(() => {
    if (!invState || activeTab !== 'equipment') return []
    return invState.equipment
  }, [invState, activeTab])

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

        {/* Sort bar */}
        <div className="inv-sort-bar">
          <select
            className="inv-sort-select"
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
          >
            <option value="default">預設排序</option>
            <option value="rarity-desc">稀有度↓</option>
            <option value="quantity-desc">數量↓</option>
            <option value="name-asc">名稱 A-Z</option>
          </select>
        </div>

        {/* Items Grid */}
        <div className="inv-grid">
          {isLoading && <div className="inv-loading">載入中...</div>}
          {!isLoading && activeTab !== 'equipment' && filteredItems.length === 0 && (
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
          {/* 裝備分頁 */}
          {activeTab === 'equipment' && equipmentList.length === 0 && (
            <div className="inv-empty">尚無裝備</div>
          )}
          {activeTab === 'equipment' && equipmentList.map(eq => (
            <button
              key={eq.equipId}
              className="inv-cell inv-equip-cell"
              style={{ '--cell-border': RARITY_COLORS[eq.rarity] ?? '#666' } as React.CSSProperties}
              onClick={() => setSelectedEquip(eq)}
            >
              <span className="inv-cell-icon">
                {eq.slot === 'weapon' ? '⚔️' : eq.slot === 'armor' ? '🛡️' : eq.slot === 'ring' ? '💍' : '👢'}
              </span>
              <span className="inv-cell-name">{eq.templateId}</span>
              <span className="inv-cell-qty">
                +{eq.enhanceLevel}
                {eq.locked && ' 🔒'}
              </span>
            </button>
          ))}
        </div>
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
        />
      )}
    </div>
  )
}
