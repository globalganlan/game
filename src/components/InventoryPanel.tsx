/**
 * InventoryPanel — 背包面板
 *
 * 顯示玩家目前擁有的道具與裝備。
 * 支援分類篩選、排序、道具詳情、使用操作。
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { InventoryItem } from '../services/saveService'
import { getSaveState } from '../services/saveService'
import type { RawHeroData } from '../types'
import {
  loadInventory,
  getInventoryState,
  filterItemsByCategory,
  onInventoryChange,
  useItem,
  decomposeEquipment,
  enhanceEquipment,
  type ItemCategory,
  type ItemDefinition,
  type InventoryState,
} from '../services/inventoryService'
import type { EquipmentInstance } from '../domain/progressionSystem'
import { enhancedMainStat, getMaxEnhanceLevel, getEnhanceCost, getTotalEnhanceCost } from '../domain/progressionSystem'
import { emitAcquire } from '../services/acquireToastBus'
import { emitToast } from '../services/acquireToastBus'
import { openEquipmentChest, getEquipDisplayName, SET_NAMES } from '../domain/equipmentGacha'
import { addEquipmentLocally, equipItem, unequipItem, getHeroEquipment, getItemQuantity, lockEquipment } from '../services/inventoryService'
import { statZh } from '../constants/statNames'
import { CodexPanel } from './CodexPanel'
import { Thumbnail3D } from './UIOverlay'

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
import { InfoTip } from './InfoTip'
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'

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
  { key: 'chest',              icon: '🎁', label: '寶箱' },
  { key: 'currency',           icon: <CurrencyIcon type="gold" />, label: '貨幣' },
  { key: 'codex',              icon: '📖', label: '圖鑑' },
]

type SortMode = 'default' | 'rarity-desc' | 'quantity-desc' | 'name-asc'

/* ────────────────────────────
   Rarity Colors（共用常數）
   ──────────────────────────── */

import { RARITY_COLORS } from '../constants/rarity'
import { ChestLootPreview } from './ChestLootPreview'
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
          <Thumbnail3D modelId={`zombie_${fragMatch![1]}`} />
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
  const qty = Math.round(item.quantity)
  const [actionMsg, setActionMsg] = useState('')

  // 英雄碎片縮圖
  const fragMatch = item.itemId.match(/^asc_fragment_(\d+)$/)
  const thumbUrl = fragMatch
    ? `${import.meta.env.BASE_URL}models/zombie_${fragMatch[1]}/thumbnail.png`
    : null

  const canUse = !!definition?.useAction
  const [loading, setLoading] = useState(false)

  const isChest = item.itemId.startsWith('chest_')
  const [openQty, setOpenQty] = useState(1)
  // 當擁有數量變化時，clamp openQty
  useEffect(() => { setOpenQty(q => Math.min(q, Math.max(1, qty))) }, [qty])

  const handleUse = useCallback(async () => {
    if (!canUse || loading) return
    const useQty = isChest ? Math.min(openQty, qty) : 1
    if (useQty < 1) return
    try {
      // 裝備寶箱 — 本地生成裝備（裝備 ID 需前端產生以綁定 equipId）
      if (item.itemId === 'chest_equipment') {
        const eqs = Array.from({ length: useQty }, () => openEquipmentChest())
        addEquipmentLocally(eqs)
        setLoading(true)
        setActionMsg(`開啟 ${useQty} 個中...`)
        const result = await useItem(item.itemId, useQty, undefined, { equipment: eqs })
        setLoading(false)
        if (!result.success) {
          setActionMsg('使用失敗')
          return
        }
        // 統計各稀有度數量
        const rarityCounts: Record<string, number> = {}
        // 合併同名+同稀有度裝備為一筆 toast（例：吸血護甲 R ×2）
        const mergedMap = new Map<string, { type: 'equipment'; id: string; name: string; quantity: number; rarity: 'N' | 'R' | 'SR' | 'SSR' }>()
        for (const eq of eqs) {
          rarityCounts[eq.rarity] = (rarityCounts[eq.rarity] || 0) + 1
          const displayName = getEquipDisplayName(eq)
          const key = `${displayName}_${eq.rarity}`
          const existing = mergedMap.get(key)
          if (existing) {
            existing.quantity += 1
          } else {
            mergedMap.set(key, { type: 'equipment', id: eq.equipId, name: displayName, quantity: 1, rarity: eq.rarity })
          }
        }
        emitAcquire(Array.from(mergedMap.values()))
        const summaryParts = Object.entries(rarityCounts).map(([r, c]) => `${r}×${c}`)
        setActionMsg(`🎉 開啟 ${useQty} 個獲得：${summaryParts.join('、')}`)
        // 若剩餘數量不足 1，自動關閉
        const newQty = getItemQuantity(item.itemId)
        if (newQty < 1) { setTimeout(() => onClose(), 1200) }
        return
      }

      // 銅/銀/金寶箱 — 伺服器開獎（防作弊，結果以伺服器為準）
      if (item.itemId === 'chest_bronze' || item.itemId === 'chest_silver' || item.itemId === 'chest_gold') {
        setLoading(true)
        setActionMsg(`開啟 ${useQty} 個中...`)
        const result = await useItem(item.itemId, useQty)
        setLoading(false)
        if (!result.success) {
          setActionMsg('使用失敗')
          return
        }
        // 以伺服器回傳的 currencies 絕對值覆蓋本地
        if (result.currencies) {
          const { applyCurrenciesFromServer } = await import('../services/saveService')
          applyCurrenciesFromServer(result.currencies)
        }
        // 伺服器回傳實際獎勵 → Toast 動畫 + 道具同步
        const rewardLines: string[] = []
        if (result.result && typeof result.result === 'object') {
          const r = result.result as Record<string, unknown>
          const { addItemsLocally } = await import('../services/inventoryService')
          const acquireItems: { type: 'currency' | 'item'; id: string; name: string; quantity: number; rarity?: 'N' | 'R' | 'SR' | 'SSR' }[] = []
          if (typeof r.gold === 'number' && r.gold > 0) {
            acquireItems.push({ type: 'currency', id: 'gold', name: '金幣', quantity: r.gold })
            rewardLines.push(`💰 金幣 ×${r.gold.toLocaleString()}`)
          }
          if (typeof r.diamond === 'number' && r.diamond > 0) {
            acquireItems.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: r.diamond, rarity: 'SR' })
            rewardLines.push(`💎 鑽石 ×${r.diamond}`)
          }
          if (typeof r.exp === 'number' && r.exp > 0) {
            acquireItems.push({ type: 'currency', id: 'exp', name: '經驗', quantity: r.exp })
            rewardLines.push(`💚 經驗 ×${r.exp.toLocaleString()}`)
          }
          if (Array.isArray(r.items)) {
            const toAdd = (r.items as { itemId?: string; quantity?: number }[])
              .filter(i => i.itemId && i.quantity)
              .map(i => ({ itemId: i.itemId!, quantity: i.quantity! }))
            if (toAdd.length > 0) addItemsLocally(toAdd)
            for (const ri of toAdd) {
              acquireItems.push({ type: 'item', id: ri.itemId, name: getItemName(ri.itemId), quantity: ri.quantity })
              rewardLines.push(`${getItemIcon(ri.itemId)} ${getItemName(ri.itemId)} ×${ri.quantity}`)
            }
          }
          if (acquireItems.length > 0) emitAcquire(acquireItems)
        }
        setActionMsg(rewardLines.length > 0 ? `🎉 開啟 ${useQty} 個獲得：${rewardLines.join('、')}` : '寶箱已開啟！')
        // 若剩餘數量不足 1，自動關閉
        const newQty = getItemQuantity(item.itemId)
        if (newQty < 1) { setTimeout(() => onClose(), 1500) }
        return
      }

      // 一般道具
      const result = await useItem(item.itemId, 1)
      if (result.success) {
        // 以伺服器回傳的 currencies 絕對值覆蓋本地
        if (result.currencies) {
          const { applyCurrenciesFromServer } = await import('../services/saveService')
          applyCurrenciesFromServer(result.currencies)
        }
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
              const { addItemsLocally } = await import('../services/inventoryService')
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
  }, [item.itemId, canUse, loading, openQty, qty])

  return createPortal(
    <div className="inv-detail-backdrop" onClick={onClose}>
      <div className="inv-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="inv-detail-close" onClick={onClose}>✕</button>
        <div className="inv-detail-header">
          {thumbUrl ? (
            <span className="inv-detail-icon inv-cell-thumb-wrap">
              <Thumbnail3D modelId={`zombie_${fragMatch![1]}`} />
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
        {isChest && <ChestLootPreview chestId={item.itemId} />}
        <div className="inv-detail-info">
          <span>數量：{qty}</span>
        </div>
        {actionMsg && <div className="inv-action-msg">{actionMsg}</div>}
        {/* 寶箱數量選擇器 */}
        {isChest && canUse && qty > 1 && (
          <div className="inv-chest-qty-section">
            <span className="inv-chest-qty-label">開啟數量</span>
            <div className="inv-chest-qty-controls">
              <button className="inv-chest-qty-btn" disabled={openQty <= 1 || loading} onClick={() => setOpenQty(q => Math.max(1, q - 1))}>−</button>
              <button className="inv-chest-qty-btn" disabled={openQty <= 1 || loading} onClick={() => setOpenQty(q => Math.max(1, q - 10))}>−10</button>
              <input
                className="inv-chest-qty-input"
                type="number"
                min={1}
                max={qty}
                value={openQty}
                disabled={loading}
                onChange={e => setOpenQty(Math.max(1, Math.min(qty, Math.floor(Number(e.target.value) || 1))))}
              />
              <button className="inv-chest-qty-btn" disabled={openQty >= qty || loading} onClick={() => setOpenQty(q => Math.min(qty, q + 10))}>+10</button>
              <button className="inv-chest-qty-btn" disabled={openQty >= qty || loading} onClick={() => setOpenQty(q => Math.min(qty, q + 1))}>+</button>
              <button className="inv-chest-qty-btn inv-chest-max-btn" disabled={openQty >= qty || loading} onClick={() => setOpenQty(qty)}>MAX</button>
            </div>
            {qty > 2 && (
              <input
                className="inv-chest-qty-slider"
                type="range"
                min={1}
                max={qty}
                value={openQty}
                disabled={loading}
                onChange={e => setOpenQty(Number(e.target.value))}
              />
            )}
          </div>
        )}
        <div className="inv-detail-actions">
          {canUse && (
            <button className="inv-action-btn inv-use-btn" onClick={handleUse} disabled={loading}>
              {loading ? '開啟中...' : (isChest ? (openQty > 1 ? `開啟 ×${openQty}` : '開啟') : '使用')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
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
  const [lockingBusy, setLockingBusy] = useState(false)
  const [enhanceBusy, setEnhanceBusy] = useState(false)
  const [decomposeBusy, setDecomposeBusy] = useState(false)
  const [localEquip, setLocalEquip] = useState(equip)
  const [showDecomposeConfirm, setShowDecomposeConfirm] = useState(false)
  const slotLabel = localEquip.slot === 'weapon' ? '武器' : localEquip.slot === 'armor' ? '護甲'
    : localEquip.slot === 'ring' ? '戒指' : '鞋子'
  const slotIcon = localEquip.slot === 'weapon' ? '⚔️' : localEquip.slot === 'armor' ? '🛡️'
    : localEquip.slot === 'ring' ? '💍' : '👢'

  const maxEnhance = getMaxEnhanceLevel(localEquip.rarity || 'N')
  const canEnhance = localEquip.enhanceLevel < maxEnhance
  const enhanceCost = canEnhance ? getEnhanceCost(localEquip.enhanceLevel, localEquip.rarity) : 0

  const handleUnequip = useCallback(async () => {
    try {
      emitToast('⏳ 卸下裝備中...')
      await unequipItem(localEquip.equipId)
      setActionMsg('已卸下裝備')
      emitToast('✅ 已卸下裝備')
    } catch {
      setActionMsg('卸下失敗')
      emitToast('❌ 卸下裝備失敗')
    }
  }, [localEquip.equipId])

  const handleEquipTo = useCallback(async (heroInstId: string, heroName: string) => {
    try {
      emitToast(`⏳ 裝備給 ${heroName} 中...`)
      const heroEqs = getHeroEquipment(heroInstId)
      const conflict = heroEqs.find(e => e.slot === localEquip.slot && e.equipId !== localEquip.equipId)
      await equipItem(localEquip.equipId, heroInstId)
      setActionMsg(`已裝備給 ${heroName}`)
      emitToast(`✅ 已裝備給 ${heroName}${conflict ? '（舊裝備已自動卸下）' : ''}`)
      setShowHeroSelect(false)
    } catch {
      setActionMsg('裝備失敗')
      emitToast('❌ 裝備失敗')
    }
  }, [localEquip.equipId, localEquip.slot])

  const handleToggleLock = useCallback(async () => {
    if (lockingBusy) return
    setLockingBusy(true)
    const newLocked = !localEquip.locked
    emitToast(newLocked ? '⏳ 鎖定中...' : '⏳ 解鎖中...')
    const ok = await lockEquipment(localEquip.equipId, newLocked)
    setLockingBusy(false)
    if (ok) {
      setLocalEquip(prev => ({ ...prev, locked: newLocked }))
      emitToast(newLocked ? '🔒 裝備已鎖定' : '🔓 裝備已解鎖')
      setActionMsg(newLocked ? '已鎖定' : '已解鎖')
    } else {
      setActionMsg('操作失敗')
      emitToast('❌ 鎖定操作失敗')
    }
  }, [localEquip.equipId, localEquip.locked, lockingBusy])

  const handleDecompose = useCallback(async () => {
    if (decomposeBusy) return
    if (localEquip.equippedBy) { setActionMsg('請先卸下裝備再分解'); return }
    if (localEquip.locked) { setActionMsg('請先解鎖裝備再分解'); return }
    if (!showDecomposeConfirm) { setShowDecomposeConfirm(true); return }
    setDecomposeBusy(true)
    emitToast('⏳ 分解中...')
    const res = await decomposeEquipment([localEquip.equipId])
    setDecomposeBusy(false)
    if (res.success) {
      emitToast(`♻️ 分解獲得 ${res.goldGained} 金幣 + ${res.scrapGained} 裝備碎片`)
      emitAcquire([
        { type: 'currency', id: 'gold', name: '金幣', quantity: res.goldGained ?? 0 },
        { type: 'item', id: 'equip_scrap', name: '裝備碎片', quantity: res.scrapGained ?? 0 },
      ])
      onClose()
    } else {
      const errMsg = res.error === 'cannot_decompose_equipped' ? '請先卸下裝備' : (res.error ?? '未知錯誤')
      setActionMsg(`分解失敗：${errMsg}`)
      emitToast(`❌ 分解失敗：${errMsg}`)
      setShowDecomposeConfirm(false)
    }
  }, [localEquip, decomposeBusy, onClose, showDecomposeConfirm])

  // 分解預覽獎勵
  const DECOMPOSE_REWARDS: Record<string, { gold: number; scrap: number }> = {
    N: { gold: 100, scrap: 1 }, R: { gold: 300, scrap: 2 },
    SR: { gold: 800, scrap: 5 }, SSR: { gold: 2000, scrap: 10 },
  }
  const decomposePreview = useMemo(() => {
    const reward = DECOMPOSE_REWARDS[localEquip.rarity] || DECOMPOSE_REWARDS['N']
    const enhanceRefund = getTotalEnhanceCost(localEquip.enhanceLevel ?? 0, localEquip.rarity as 'N' | 'R' | 'SR' | 'SSR')
    return {
      gold: reward.gold + enhanceRefund,
      enhanceRefund,
      scrap: reward.scrap,
    }
  }, [localEquip.rarity, localEquip.enhanceLevel])

  const handleEnhance = useCallback(async () => {
    if (enhanceBusy || !canEnhance) return
    setEnhanceBusy(true)
    emitToast('⏳ 強化中...')
    const res = await enhanceEquipment(localEquip.equipId)
    setEnhanceBusy(false)
    if (res.success) {
      setLocalEquip(prev => ({ ...prev, enhanceLevel: res.newLevel ?? prev.enhanceLevel + 1 }))
      setActionMsg(`強化成功！+${res.newLevel}`)
      emitToast(`⚒️ 強化成功！+${res.newLevel}`)
    } else {
      const errMsg = res.error === 'insufficient_gold' ? '金幣不足' : res.error === 'max_enhance_level' ? '已達最高等級' : (res.error ?? '未知錯誤')
      setActionMsg(`強化失敗：${errMsg}`)
      emitToast(`❌ 強化失敗：${errMsg}`)
    }
  }, [localEquip.equipId, enhanceBusy, canEnhance])

  // 英雄名稱解析
  const getHeroName = useCallback((instId: string) => {
    const inst = heroInstances?.find(h => h.instanceId === instId)
    if (!inst) return instId
    return heroNameMap?.get(inst.heroId) ?? `英雄#${inst.heroId}`
  }, [heroInstances, heroNameMap])

  return createPortal(
    <div className="inv-detail-backdrop" onClick={onClose}>
      <div className="inv-detail-card inv-equip-detail" onClick={e => e.stopPropagation()}>
        <button className="inv-detail-close" onClick={onClose}>✕</button>
        <div className="inv-detail-header">
          <span className="inv-detail-icon">{slotIcon}</span>
          <div>
            <h3 style={{ color: RARITY_COLORS[localEquip.rarity] ?? '#ddd' }}>
              {getEquipDisplayName(localEquip)}
              {localEquip.enhanceLevel > 0 && <span className="inv-equip-enhance"> +{localEquip.enhanceLevel}</span>}
            </h3>
            <span className="inv-detail-rarity">
              {localEquip.rarity} · {slotLabel}
            </span>
          </div>
        </div>
        {/* 主屬性 */}
        <div className="inv-equip-main-stat">
          <span>{statZh(localEquip.mainStat ?? '?')}</span>
          <span className="inv-equip-stat-val">+{enhancedMainStat(localEquip.mainStatValue ?? 0, localEquip.enhanceLevel ?? 0)}</span>
        </div>
        {/* 副屬性 */}
        {(localEquip.subStats ?? []).length > 0 && (
          <div className="inv-equip-sub-stats">
            {(localEquip.subStats ?? []).map((sub, i) => (
              <div key={i} className="inv-equip-sub-row">
                <span>{statZh(sub.stat)}</span>
                <span>+{sub.value}{sub.isPercent ? '%' : ''}</span>
              </div>
            ))}
          </div>
        )}
        {/* 套裝 */}
        {localEquip.setId && (
          <div className="inv-equip-set-tag">套裝：{SET_NAMES[localEquip.setId] || localEquip.setId}</div>
        )}
        {/* 裝備狀態 */}
        {localEquip.equippedBy && (
          <div className="inv-equip-equipped-by">已裝備給：{getHeroName(localEquip.equippedBy)}</div>
        )}
        {actionMsg && <div className="inv-action-msg">{actionMsg}</div>}
        <div className="inv-detail-actions">
          <button className={`inv-action-btn ${localEquip.locked ? 'inv-lock-btn-active' : 'inv-lock-btn'}`} onClick={handleToggleLock} disabled={lockingBusy}>
            {lockingBusy ? '⏳ 處理中...' : localEquip.locked ? '🔒 已鎖定' : '🔓 鎖定'}
          </button>
          {localEquip.equippedBy ? (
            <button className="inv-action-btn inv-sell-btn" onClick={handleUnequip}>
              ⬇️ 卸下
            </button>
          ) : (
            <button className="inv-action-btn inv-use-btn" onClick={() => setShowHeroSelect(true)}>
              ⬆️ 裝備給英雄
            </button>
          )}
          {canEnhance && (
            <button className="inv-action-btn inv-use-btn" onClick={handleEnhance} disabled={enhanceBusy}>
              {enhanceBusy ? '⏳ 強化中...' : `⚒️ 強化（${enhanceCost} 金）`}
            </button>
          )}
          {!localEquip.equippedBy && !localEquip.locked && !showDecomposeConfirm && (
            <button className="inv-action-btn inv-decompose-btn" onClick={handleDecompose} disabled={decomposeBusy}>
              {decomposeBusy ? '⏳ 分解中...' : '♻️ 分解'}
            </button>
          )}
        </div>
        {/* 分解確認面板 */}
        {showDecomposeConfirm && (
          <div className="inv-decompose-confirm">
            <div className="inv-decompose-confirm-title">確定要分解此裝備？</div>
            <div className="inv-decompose-confirm-rewards">
              <span>返還：<CurrencyIcon type="gold" /> {decomposePreview.gold.toLocaleString()} 金幣</span>
              {decomposePreview.enhanceRefund > 0 && (
                <span className="inv-decompose-enhance-note">（含強化金幣 100% 返還 +{decomposePreview.enhanceRefund.toLocaleString()}）</span>
              )}
              <span>返還：🔩 {decomposePreview.scrap} 裝備碎片</span>
            </div>
            <div className="inv-decompose-confirm-btns">
              <button className="inv-action-btn inv-decompose-btn" onClick={handleDecompose} disabled={decomposeBusy}>
                {decomposeBusy ? '⏳ 分解中...' : '確認分解'}
              </button>
              <button className="inv-action-btn inv-cancel-btn" onClick={() => setShowDecomposeConfirm(false)}>
                取消
              </button>
            </div>
          </div>
        )}

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
    </div>,
    document.body
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
  const [showBulkDecompose, setShowBulkDecompose] = useState(false)
  const [bulkRarities, setBulkRarities] = useState<Set<string>>(new Set(['N', 'R']))
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

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
    // 過濾已移除的道具（強化石）
    const DEPRECATED_ITEMS = new Set(['eqm_enhance_s', 'eqm_enhance_m', 'eqm_enhance_l', 'forge_ore_common', 'forge_ore_rare'])
    items = items.filter(i => !DEPRECATED_ITEMS.has(i.itemId))
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

  // ── 一鍵分解：篩選可分解裝備 ──
  const bulkDecomposeTargets = useMemo(() => {
    if (!invState) return []
    return invState.equipment.filter(eq =>
      bulkRarities.has(eq.rarity) && !eq.equippedBy && !eq.locked
    )
  }, [invState, bulkRarities])

  const DECOMPOSE_REWARDS_TABLE: Record<string, { gold: number; scrap: number }> = {
    N: { gold: 100, scrap: 1 }, R: { gold: 300, scrap: 2 },
    SR: { gold: 800, scrap: 5 }, SSR: { gold: 2000, scrap: 10 },
  }

  const bulkDecomposePreview = useMemo(() => {
    let totalGold = 0, totalScrap = 0
    for (const eq of bulkDecomposeTargets) {
      const reward = DECOMPOSE_REWARDS_TABLE[eq.rarity] || DECOMPOSE_REWARDS_TABLE['N']
      totalGold += reward.gold + (eq.enhanceLevel ?? 0) * 50
      totalScrap += reward.scrap
    }
    return { count: bulkDecomposeTargets.length, gold: totalGold, scrap: totalScrap }
  }, [bulkDecomposeTargets])

  const toggleBulkRarity = useCallback((r: string) => {
    setBulkRarities(prev => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r); else next.add(r)
      return next
    })
  }, [])

  const handleBulkDecompose = useCallback(async () => {
    if (isBulkProcessing || bulkDecomposeTargets.length === 0) return
    setIsBulkProcessing(true)
    setBulkResult(null)
    emitToast(`⏳ 批量分解 ${bulkDecomposeTargets.length} 件中...`)
    const ids = bulkDecomposeTargets.map(eq => eq.equipId)
    const res = await decomposeEquipment(ids)
    setIsBulkProcessing(false)
    if (res.success) {
      setBulkResult(`✅ 分解 ${res.decomposed} 件裝備，獲得 ${res.goldGained} 金幣 + ${res.scrapGained} 碎片`)
      emitToast(`♻️ 批量分解 ${res.decomposed} 件，獲得 ${res.goldGained} 金幣 + ${res.scrapGained} 碎片`)
      emitAcquire([
        { type: 'currency', id: 'gold', name: '金幣', quantity: res.goldGained ?? 0 },
        { type: 'item', id: 'equip_scrap', name: '裝備碎片', quantity: res.scrapGained ?? 0 },
      ])
    } else {
      const errMsg = res.error === 'cannot_decompose_equipped' ? '含有穿戴中裝備' : (res.error ?? '分解失敗')
      setBulkResult(`❌ ${errMsg}`)
      emitToast(`❌ 批量分解失敗：${errMsg}`)
    }
  }, [isBulkProcessing, bulkDecomposeTargets])

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
          <PanelInfoTip description={PANEL_DESCRIPTIONS.inventory} />
          <div className="resource-bar">
            <InfoTip icon={<CurrencyIcon type="gold" />} value={gold.toLocaleString()} label="金幣" description="升級、購買、強化所需的通用貨幣" className="menu-gold" />
            <InfoTip icon={<CurrencyIcon type="diamond" />} value={diamond.toLocaleString()} label="鑽石" description="召喚、加速、購買稀有道具" className="menu-diamond" />
          </div>
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
          {showEquipment && (
            <button
              className="inv-action-btn inv-decompose-btn inv-bulk-decompose-trigger"
              onClick={() => { setShowBulkDecompose(true); setBulkResult(null) }}
            >
              ♻️ 一鍵分解
            </button>
          )}
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
              </span>
              {eq.locked && <span className="inv-equip-lock-badge">🔒</span>}
              {eq.equippedBy && <span className="inv-equip-badge">使用中</span>}
            </button>
          ))}
        </div>
      </>)}

      {/* 圖鑑面板 */}
      {activeTab === 'codex' && (
        <CodexPanel />
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

      {/* 一鍵分解彈窗 */}
      {showBulkDecompose && createPortal(
        <div className="inv-detail-backdrop" onClick={() => !isBulkProcessing && setShowBulkDecompose(false)}>
          <div className="inv-detail-card inv-bulk-decompose-panel" onClick={e => e.stopPropagation()}>
            <button className="inv-detail-close" onClick={() => !isBulkProcessing && setShowBulkDecompose(false)}>✕</button>
            <h3 className="inv-bulk-title">♻️ 一鍵分解裝備</h3>
            <p className="inv-bulk-desc">勾選要分解的稀有度（穿戴中、已鎖定的裝備會自動排除）</p>
            <div className="inv-bulk-rarity-checks">
              {(['N', 'R', 'SR', 'SSR'] as const).map(r => {
                const count = invState?.equipment.filter(eq => eq.rarity === r && !eq.equippedBy && !eq.locked).length ?? 0
                return (
                  <label key={r} className={`inv-bulk-rarity-label${bulkRarities.has(r) ? ' inv-bulk-rarity-active' : ''}`}
                    style={{ borderColor: RARITY_COLORS[r] ?? '#666' }}>
                    <input type="checkbox" checked={bulkRarities.has(r)} onChange={() => toggleBulkRarity(r)} />
                    <span style={{ color: RARITY_COLORS[r] ?? '#aaa' }}>{r}</span>
                    <span className="inv-bulk-rarity-count">({count})</span>
                  </label>
                )
              })}
            </div>
            <div className="inv-bulk-preview">
              <div className="inv-bulk-preview-row">
                <span>符合裝備</span><span className="inv-bulk-preview-val">{bulkDecomposePreview.count} 件</span>
              </div>
              <div className="inv-bulk-preview-row">
                <span><CurrencyIcon type="gold" /> 金幣</span><span className="inv-bulk-preview-val">+{bulkDecomposePreview.gold.toLocaleString()}</span>
              </div>
              <div className="inv-bulk-preview-row">
                <span>🔩 裝備碎片</span><span className="inv-bulk-preview-val">+{bulkDecomposePreview.scrap}</span>
              </div>
            </div>
            {bulkResult && <div className="inv-bulk-result">{bulkResult}</div>}
            <div className="inv-bulk-actions">
              <button
                className="inv-action-btn inv-decompose-btn"
                disabled={isBulkProcessing || bulkDecomposePreview.count === 0}
                onClick={handleBulkDecompose}
              >
                {isBulkProcessing ? '分解中...' : `確認分解 (${bulkDecomposePreview.count} 件)`}
              </button>
              <button className="inv-action-btn inv-cancel-btn" onClick={() => setShowBulkDecompose(false)} disabled={isBulkProcessing}>
                關閉
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
