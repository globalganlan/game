/**
 * InventoryPanel — 背包面板
 *
 * 顯示玩家目前擁有的道具與裝備。
 * 支援分類篩選、道具詳情、出售操作。
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { InventoryItem } from '../services/saveService'
import type { RawHeroData } from '../types'
import {
  loadInventory,
  getInventoryState,
  filterItemsByCategory,
  onInventoryChange,
  type ItemCategory,
  type ItemDefinition,
  type InventoryState,
} from '../services/inventoryService'

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

const KNOWN_ITEM_NAMES: Record<string, { name: string; icon: string; category?: string }> = {
  currency_stardust:  { name: '星塵',     icon: '✨' },
  currency_gold:      { name: '金幣',     icon: '💰' },
  currency_diamond:   { name: '鑽石',     icon: '💎' },
}

/** 根據 itemId pattern 推導中文名稱 */
function resolveFallbackName(
  itemId: string,
  heroMap?: Map<number, string>,
): { name: string; icon: string } {
  // 1. 已知靜態道具
  if (KNOWN_ITEM_NAMES[itemId]) return KNOWN_ITEM_NAMES[itemId]

  // 2. 突破碎片：asc_fragment_<heroId>
  const fragMatch = itemId.match(/^asc_fragment_(\d+)$/)
  if (fragMatch) {
    const heroId = Number(fragMatch[1])
    const heroName = heroMap?.get(heroId)
    return {
      name: heroName ? `${heroName}碎片` : `突破碎片 #${heroId}`,
      icon: '🔮',
    }
  }

  // 3. 其他 currency_xxx
  if (itemId.startsWith('currency_')) {
    const suffix = itemId.replace('currency_', '')
    return { name: suffix, icon: '🪙' }
  }

  // 4. 其他 exp_ / equip_ 等 pattern
  if (itemId.startsWith('exp_'))   return { name: itemId.replace('exp_', '經驗：'), icon: '📗' }
  if (itemId.startsWith('equip_')) return { name: itemId.replace('equip_', '裝備：'), icon: '🗡️' }

  // 5. 最終 fallback
  return { name: itemId, icon: '❓' }
}

/* ────────────────────────────
   Category Tabs
   ──────────────────────────── */

interface CategoryTab {
  key: ItemCategory | 'all'
  icon: string
  label: string
}

const TABS: CategoryTab[] = [
  { key: 'all',                icon: '📦', label: '全部' },
  { key: 'exp_material',       icon: '📗', label: '經驗' },
  { key: 'ascension_material', icon: '🔥', label: '突破' },
  { key: 'equipment_material', icon: '🔧', label: '裝備素材' },
  { key: 'equipment',          icon: '🗡️', label: '裝備' },
  { key: 'chest',              icon: '🎁', label: '寶箱' },
]

/* ────────────────────────────
   Rarity Colors
   ──────────────────────────── */

const RARITY_COLORS: Record<string, string> = {
  N:   '#aaa',
  R:   '#4dabf7',
  SR:  '#be4bdb',
  SSR: '#ffd43b',
}

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

  // 英雄碎片縮圖
  const fragMatch = item.itemId.match(/^asc_fragment_(\d+)$/)
  const thumbUrl = fragMatch
    ? `${import.meta.env.BASE_URL}models/zombie_${fragMatch[1]}/thumbnail.png`
    : null

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
  const [isLoading, setIsLoading] = useState(false)

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
    if (activeTab === 'all') {
      return invState.items.filter((i) => i.quantity > 0)
    }
    return filterItemsByCategory(activeTab)
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

        {/* Items Grid */}
        <div className="inv-grid">
          {isLoading && <div className="inv-loading">載入中...</div>}
          {!isLoading && filteredItems.length === 0 && (
            <div className="inv-empty">此分類無道具</div>
          )}
          {filteredItems.map((item) => (
            <ItemCell
              key={item.itemId}
              item={item}
              definition={getDef(item.itemId)}
              heroMap={heroNameMap}
              onClick={() => setSelectedItem(item)}
            />
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
    </div>
  )
}
