/**
 * ShopPanel — 商店面板
 *
 * 提供道具/鑽石/限時禮包購買。
 * 使用金幣/鑽石/競技幣等貨幣兌換素材。
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { getSaveState, updateProgress, applyCurrenciesFromServer } from '../services/saveService'
import { addItemsLocally, getItemQuantity, removeItemsLocally } from '../services/inventoryService'
import { callApi } from '../services/apiClient'
import { emitAcquire } from '../services/acquireToastBus'

/* ────────────────────────────
   商品定義
   ──────────────────────────── */

interface ShopItem {
  id: string
  name: string
  icon: string
  description: string
  price: number
  currency: 'gold' | 'diamond' | 'arena' | 'stardust' | 'equip_scrap'
  rewards: { itemId: string; quantity: number }[]
  /** 每日購買上限（0=無限） */
  dailyLimit: number
  category: ShopCategory
}

type ShopCategory = 'daily' | 'material' | 'special' | 'stardust' | 'scrap' | 'arena'

const SHOP_CATEGORIES: { key: ShopCategory; label: string; icon: string }[] = [
  { key: 'daily', label: '每日商店', icon: '🔄' },
  { key: 'material', label: '素材商店', icon: '🧪' },
  { key: 'stardust', label: '星塵兌換', icon: '✨' },
  { key: 'arena', label: '競技兌換', icon: '🏅' },
  { key: 'special', label: '特殊商店', icon: '⭐' },
  { key: 'scrap', label: '碎片兌換', icon: '🔩' },
]

const SHOP_ITEMS: ShopItem[] = [
  // ── 每日商店 ──
  {
    id: 'daily_exp_s', name: '經驗 ×500', icon: '',
    description: '為英雄提升等級的經驗資源',
    price: 1000, currency: 'gold',
    rewards: [{ itemId: 'exp', quantity: 500 }],
    dailyLimit: 10, category: 'daily',
  },
  {
    id: 'daily_exp_m', name: '經驗 ×1,500', icon: '',
    description: '中量經驗資源，後期必備',
    price: 5000, currency: 'gold',
    rewards: [{ itemId: 'exp', quantity: 1500 }],
    dailyLimit: 5, category: 'daily',
  },
  {
    id: 'daily_exp_l', name: '經驗 ×2,000', icon: '',
    description: '大量經驗，快速提升英雄等級',
    price: 20, currency: 'diamond',
    rewards: [{ itemId: 'exp', quantity: 2000 }],
    dailyLimit: 3, category: 'daily',
  },
  // （強化石已移除 — 強化僅消耗金幣）
  // ── 素材商店 ──
  {
    id: 'mat_class_power', name: '力量職業石 ×1', icon: '🗡️',
    description: '力量型英雄突破必備',
    price: 10000, currency: 'gold',
    rewards: [{ itemId: 'asc_class_power', quantity: 1 }],
    dailyLimit: 0, category: 'material',
  },
  {
    id: 'mat_class_agility', name: '敏捷職業石 ×1', icon: '🏃',
    description: '敏捷型英雄突破必備',
    price: 10000, currency: 'gold',
    rewards: [{ itemId: 'asc_class_agility', quantity: 1 }],
    dailyLimit: 0, category: 'material',
  },
  {
    id: 'mat_class_defense', name: '防禦職業石 ×1', icon: '🛡️',
    description: '防禦型英雄突破必備',
    price: 10000, currency: 'gold',
    rewards: [{ itemId: 'asc_class_defense', quantity: 1 }],
    dailyLimit: 0, category: 'material',
  },
  {
    id: 'mat_class_universal', name: '通用職業石 ×1', icon: '🌐',
    description: '可替代任何職業石',
    price: 50, currency: 'diamond',
    rewards: [{ itemId: 'asc_class_universal', quantity: 1 }],
    dailyLimit: 0, category: 'material',
  },
  // ── 星塵兌換店 ──
  {
    id: 'sd_exp_5000', name: '經驗 ×5,000', icon: '💚',
    description: '用星塵兌換大量經驗資源',
    price: 10, currency: 'stardust',
    rewards: [{ itemId: 'exp', quantity: 5000 }],
    dailyLimit: 0, category: 'stardust',
  },
  {
    id: 'sd_gold_50k', name: '金幣 ×50,000', icon: '💰',
    description: '用星塵兌換大量金幣',
    price: 15, currency: 'stardust',
    rewards: [{ itemId: 'gold', quantity: 50000 }],
    dailyLimit: 0, category: 'stardust',
  },
  {
    id: 'sd_class_universal', name: '通用職業石 ×2', icon: '🌐',
    description: '可替代任何職業石的突破素材',
    price: 20, currency: 'stardust',
    rewards: [{ itemId: 'asc_class_universal', quantity: 2 }],
    dailyLimit: 0, category: 'stardust',
  },
  {
    id: 'sd_chest_gold', name: '金級寶箱 ×1', icon: '🥇',
    description: '頂級獎勵，含大量資源與經驗',
    price: 50, currency: 'stardust',
    rewards: [{ itemId: 'chest_gold', quantity: 1 }],
    dailyLimit: 3, category: 'stardust',
  },
  {
    id: 'sd_diamond_100', name: '鑽石 ×100', icon: '💎',
    description: '用星塵兌換高級貨幣',
    price: 80, currency: 'stardust',
    rewards: [{ itemId: 'diamond', quantity: 100 }],
    dailyLimit: 0, category: 'stardust',
  },
  // ── 特殊商店 ──
  {
    id: 'special_gold_pack', name: '金幣禮包（10,000 金）', icon: '💰',
    description: '快速獲取大量金幣',
    price: 30, currency: 'diamond',
    rewards: [{ itemId: 'gold', quantity: 10000 }],
    dailyLimit: 5, category: 'special',
  },
  {
    id: 'special_ticket_hero', name: '英雄召喚券 ×1', icon: '🎟️',
    description: '可用於英雄召喚，免費抽取一次',
    price: 50, currency: 'diamond',
    rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }],
    dailyLimit: 3, category: 'special',
  },
  {
    id: 'special_ticket_equip', name: '裝備鍛造券 ×1', icon: '🔧',
    description: '可用於裝備鍛造，免費鍛造一次',
    price: 50, currency: 'diamond',
    rewards: [{ itemId: 'gacha_ticket_equip', quantity: 1 }],
    dailyLimit: 3, category: 'special',
  },
  // ── 星塵兌換店（召喚券） ──
  {
    id: 'sd_ticket_hero', name: '英雄召喚券 ×1', icon: '🎟️',
    description: '用星塵兌換英雄召喚券',
    price: 30, currency: 'stardust',
    rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }],
    dailyLimit: 0, category: 'stardust',
  },
  {
    id: 'sd_ticket_equip', name: '裝備鍛造券 ×1', icon: '🔧',
    description: '用星塵兌換裝備鍛造券',
    price: 30, currency: 'stardust',
    rewards: [{ itemId: 'gacha_ticket_equip', quantity: 1 }],
    dailyLimit: 0, category: 'stardust',
  },
  // ── 碎片兌換店 ──
  {
    id: 'scrap_chest_equip', name: '裝備寶箱 ×1', icon: '📦',
    description: '用裝備碎片兌換隨機裝備寶箱',
    price: 10, currency: 'equip_scrap',
    rewards: [{ itemId: 'chest_equipment', quantity: 1 }],
    dailyLimit: 0, category: 'scrap',
  },
  // ── 競技兌換店 ──
  {
    id: 'arena_exp_3000', name: '經驗 ×3,000', icon: '💚',
    description: '用競技幣兌換大量經驗',
    price: 5, currency: 'arena',
    rewards: [{ itemId: 'exp', quantity: 3000 }],
    dailyLimit: 0, category: 'arena',
  },
  {
    id: 'arena_gold_20k', name: '金幣 ×20,000', icon: '💰',
    description: '用競技幣兌換金幣',
    price: 5, currency: 'arena',
    rewards: [{ itemId: 'gold', quantity: 20000 }],
    dailyLimit: 0, category: 'arena',
  },
  {
    id: 'arena_diamond_30', name: '鑽石 ×30', icon: '💎',
    description: '用競技幣兌換鑽石',
    price: 10, currency: 'arena',
    rewards: [{ itemId: 'diamond', quantity: 30 }],
    dailyLimit: 0, category: 'arena',
  },
  {
    id: 'arena_class_universal', name: '通用職業石 ×1', icon: '🌐',
    description: '可替代任何職業突破石',
    price: 15, currency: 'arena',
    rewards: [{ itemId: 'asc_class_universal', quantity: 1 }],
    dailyLimit: 0, category: 'arena',
  },
  {
    id: 'arena_chest_equip', name: '裝備寶箱 ×1', icon: '📦',
    description: '用競技幣兌換隨機裝備寶箱',
    price: 8, currency: 'arena',
    rewards: [{ itemId: 'chest_equipment', quantity: 1 }],
    dailyLimit: 0, category: 'arena',
  },
  {
    id: 'arena_ticket_hero', name: '英雄召喚券 ×1', icon: '🎟️',
    description: '用競技幣兌換英雄召喚券',
    price: 20, currency: 'arena',
    rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }],
    dailyLimit: 0, category: 'arena',
  },
]

import { getItemIcon, getItemName } from '../constants/rarity'
import { CurrencyIcon } from './CurrencyIcon'
import { ClickableItemIcon } from './ClickableItemIcon'
import { InfoTip } from './InfoTip'
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'

/* (CURRENCY_ICON removed — now using CurrencyIcon component) */

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface ShopPanelProps {
  onBack: () => void
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function ShopPanel({ onBack }: ShopPanelProps) {
  const [activeCategory, setActiveCategory] = useState<ShopCategory>('daily')
  const [purchaseMsg, setPurchaseMsg] = useState('')
  const [purchasedToday, setPurchasedToday] = useState<Record<string, number>>({})
  const [bulkItem, setBulkItem] = useState<ShopItem | null>(null)
  const [bulkQty, setBulkQty] = useState(1)
  const [bulkBuying, setBulkBuying] = useState(false)

  // 載入今日已購買次數
  useEffect(() => {
    callApi<{ purchases: Record<string, number> }>('shop-daily-status', {})
      .then(res => {
        if (res.success && res.purchases) {
          setPurchasedToday(res.purchases)
        }
      })
      .catch(() => { /* ignore */ })
  }, [])

  const saveState = getSaveState()
  const gold = saveState?.save.gold ?? 0
  const diamond = saveState?.save.diamond ?? 0
  const stardust = getItemQuantity('currency_stardust')
  const equipScrap = getItemQuantity('equip_scrap')
  const pvpCoin = getItemQuantity('pvp_coin')

  const filteredItems = useMemo(
    () => SHOP_ITEMS.filter(item => item.category === activeCategory),
    [activeCategory],
  )

  /** 取得某貨幣的目前餘額 */
  const getBalance = useCallback((currency: ShopItem['currency']): number => {
    if (currency === 'gold') return gold
    if (currency === 'diamond') return diamond
    if (currency === 'stardust') return stardust
    if (currency === 'equip_scrap') return equipScrap
    if (currency === 'arena') return pvpCoin
    return 0
  }, [gold, diamond, stardust, equipScrap, pvpCoin])

  const canAfford = useCallback((item: ShopItem): boolean => {
    return getBalance(item.currency) >= item.price
  }, [getBalance])

  const getRemainingPurchases = useCallback((item: ShopItem): number | null => {
    if (item.dailyLimit <= 0) return null
    const bought = purchasedToday[item.id] ?? 0
    return Math.max(0, item.dailyLimit - bought)
  }, [purchasedToday])

  /** 計算某商品的最大可購買數量（考慮餘額 + 每日上限） */
  const getMaxBuyable = useCallback((item: ShopItem): number => {
    const balance = getBalance(item.currency)
    const affordMax = item.price > 0 ? Math.floor(balance / item.price) : 999
    const remaining = getRemainingPurchases(item)
    const limitMax = remaining !== null ? remaining : 999
    return Math.max(0, Math.min(affordMax, limitMax))
  }, [getBalance, getRemainingPurchases])

  /** 打開批量購買彈窗 */
  const openBulkModal = useCallback((item: ShopItem) => {
    const max = getMaxBuyable(item)
    setBulkItem(item)
    setBulkQty(Math.min(1, max))
  }, [getMaxBuyable])

  const handlePurchase = useCallback(async (item: ShopItem, quantity: number = 1) => {
    const remaining = getRemainingPurchases(item)
    if (remaining !== null && remaining <= 0) {
      setPurchaseMsg('今日已達購買上限')
      return
    }
    const totalCost = item.price * quantity
    if (getBalance(item.currency) < totalCost) {
      const names: Record<string, string> = { gold: '金幣', diamond: '鑽石', stardust: '星塵', equip_scrap: '裝備碎片', arena: '競技幣' }
      setPurchaseMsg(`${names[item.currency] ?? '貨幣'}不足`)
      return
    }

    // 先呼叫後端確認購買 → 成功後才更新本地狀態
    setBulkBuying(true)
    try {
      const res = await callApi<{ currencies?: { gold?: number; diamond?: number; exp?: number }; inventory?: { itemId: string; quantity: number }[] }>('shop-buy', { shopItemId: item.id, quantity })
      if (!res.success) {
        setPurchaseMsg('購買失敗，請稍後再試')
        setTimeout(() => setPurchaseMsg(''), 2500)
        return
      }

      // 伺服器確認成功 → 以伺服器權威值覆蓋貨幣
      if (res.currencies) {
        applyCurrenciesFromServer(res.currencies)
      }

      // 星塵/碎片/競技幣扣款（非 save 貨幣，需本地扣）
      if (item.currency === 'stardust') {
        removeItemsLocally([{ itemId: 'currency_stardust', quantity: item.price * quantity }])
      } else if (item.currency === 'equip_scrap') {
        removeItemsLocally([{ itemId: 'equip_scrap', quantity: item.price * quantity }])
      } else if (item.currency === 'arena') {
        removeItemsLocally([{ itemId: 'pvp_coin', quantity: item.price * quantity }])
      }

      // 非資源類獎勵本地加背包（乘以數量）
      const RESOURCE_REWARDS = ['exp', 'gold', 'diamond', 'stardust'] as const
      const inventoryItems = item.rewards
        .filter(r => !(RESOURCE_REWARDS as readonly string[]).includes(r.itemId))
        .map(r => ({ ...r, quantity: r.quantity * quantity }))
      if (inventoryItems.length > 0) addItemsLocally(inventoryItems)

      // 獲得物品動畫
      const CURRENCY_IDS = ['gold', 'diamond', 'stardust', 'exp'] as const
      emitAcquire(item.rewards.map(r => ({
        type: r.itemId.startsWith('currency_') || (CURRENCY_IDS as readonly string[]).includes(r.itemId) ? 'currency' as const : 'item' as const,
        id: r.itemId,
        name: getItemName(r.itemId),
        quantity: r.quantity * quantity,
      })))

      // 更新購買計數
      setPurchasedToday(prev => ({
        ...prev,
        [item.id]: (prev[item.id] ?? 0) + quantity,
      }))

      const rewardNames = item.rewards.map(r => `${getItemIcon(r.itemId)} ${getItemName(r.itemId)} ×${r.quantity * quantity}`).join('、')
      setPurchaseMsg(`購買成功！獲得 ${rewardNames}`)
      setBulkItem(null)
      setTimeout(() => setPurchaseMsg(''), 2500)
    } catch (e) {
      console.warn('[shop] shop-buy error:', e)
      setPurchaseMsg('購買失敗，請檢查網路連線')
      setTimeout(() => setPurchaseMsg(''), 2500)
    } finally {
      setBulkBuying(false)
    }
  }, [getBalance, getRemainingPurchases, gold, diamond, stardust, equipScrap, pvpCoin])

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🏪 商店</h2>
          <PanelInfoTip description={PANEL_DESCRIPTIONS.shop} />
          <div className="resource-bar">
            <InfoTip icon={<CurrencyIcon type="gold" />} value={gold.toLocaleString()} label="金幣" description="購買道具、強化裝備所需" className="menu-gold" />
            <InfoTip icon={<CurrencyIcon type="diamond" />} value={diamond.toLocaleString()} label="鑽石" description="購買稀有商品、禮包" className="menu-diamond" />
            <InfoTip icon={<CurrencyIcon type="stardust" />} value={stardust.toLocaleString()} label="星塵" description="重複英雄轉化而來，可在商店兑換稀有道具" className="menu-stardust" />
            <InfoTip icon={<span style={{fontSize:'0.85em'}}>🔩</span>} value={equipScrap.toLocaleString()} label="裝備碎片" description="分解裝備獲得，可兌換強化素材或裝備寶箱" className="menu-stardust" />
            <InfoTip icon={<CurrencyIcon type="pvp_coin" />} value={pvpCoin.toLocaleString()} label="競技幣" description="試煉場勝利獲得，可在競技兌換店換取道具" className="menu-stardust" />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="shop-tabs">
          {SHOP_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              className={`shop-tab ${activeCategory === cat.key ? 'shop-tab-active' : ''}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Purchase notification */}
        {purchaseMsg && <div className="shop-msg">{purchaseMsg}</div>}

        {/* Items Grid */}
        <div className="shop-grid">
          {filteredItems.map(item => {
            const affordable = canAfford(item)
            const remaining = getRemainingPurchases(item)
            const soldOut = remaining !== null && remaining <= 0
            return (
              <div key={item.id} className={`shop-item ${!affordable || soldOut ? 'shop-item-disabled' : ''}`}>
                <div className="shop-item-icon"><ClickableItemIcon itemId={item.rewards[0]?.itemId ?? ''} /></div>
                <div className="shop-item-body">
                  <div className="shop-item-name">{item.name}</div>
                  <div className="shop-item-desc">{item.description}</div>
                  <div className="shop-item-footer">
                    <span className={`shop-price ${!affordable ? 'shop-price-insufficient' : ''}`}>
                      {item.currency === 'gold' ? <CurrencyIcon type="gold" /> : item.currency === 'diamond' ? <CurrencyIcon type="diamond" /> : item.currency === 'stardust' ? <CurrencyIcon type="stardust" /> : item.currency === 'equip_scrap' ? <span style={{fontSize:'0.85em'}}>🔩</span> : item.currency === 'arena' ? <CurrencyIcon type="pvp_coin" /> : '🏟️'} {item.price.toLocaleString()}
                    </span>
                    {remaining !== null && (
                      <span className={`shop-remaining ${soldOut ? 'sold-out' : ''}`}>
                        {soldOut ? '已售罄' : `剩 ${remaining} 次`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="shop-buy-btn"
                  disabled={!affordable || soldOut}
                  onClick={() => openBulkModal(item)}
                >
                  {soldOut ? '售罄' : '購買'}
                </button>
              </div>
            )
          })}
        </div>

        {/* ── 批量購買彈窗 ── */}
        {bulkItem && (() => {
          const maxQty = getMaxBuyable(bulkItem)
          const totalCost = bulkItem.price * bulkQty
          const balance = getBalance(bulkItem.currency)
          const remaining = getRemainingPurchases(bulkItem)
          const currencyNames: Record<string, string> = { gold: '金幣', diamond: '鑽石', stardust: '星塵', equip_scrap: '裝備碎片', arena: '競技幣' }
          const currencyLabel = currencyNames[bulkItem.currency] ?? '貨幣'

          const renderCurrencyIcon = () => {
            if (bulkItem.currency === 'gold') return <CurrencyIcon type="gold" />
            if (bulkItem.currency === 'diamond') return <CurrencyIcon type="diamond" />
            if (bulkItem.currency === 'stardust') return <CurrencyIcon type="stardust" />
            if (bulkItem.currency === 'equip_scrap') return <span style={{fontSize:'0.85em'}}>🔩</span>
            if (bulkItem.currency === 'arena') return <CurrencyIcon type="pvp_coin" />
            return null
          }

          return (
            <div className="shop-bulk-overlay" onClick={() => !bulkBuying && setBulkItem(null)}>
              <div className="shop-bulk-modal" onClick={e => e.stopPropagation()}>
                <button className="shop-bulk-close" onClick={() => !bulkBuying && setBulkItem(null)}>✕</button>
                <div className="shop-bulk-header">
                  <div className="shop-bulk-icon"><ClickableItemIcon itemId={bulkItem.rewards[0]?.itemId ?? ''} /></div>
                  <div className="shop-bulk-info">
                    <div className="shop-bulk-name">{bulkItem.name}</div>
                    <div className="shop-bulk-desc">{bulkItem.description}</div>
                  </div>
                </div>

                <div className="shop-bulk-price-row">
                  <span className="shop-bulk-label">單價</span>
                  <span className="shop-bulk-price">{renderCurrencyIcon()} {bulkItem.price.toLocaleString()}</span>
                </div>

                <div className="shop-bulk-price-row">
                  <span className="shop-bulk-label">{currencyLabel}餘額</span>
                  <span className="shop-bulk-price">{renderCurrencyIcon()} {balance.toLocaleString()}</span>
                </div>

                {remaining !== null && (
                  <div className="shop-bulk-price-row">
                    <span className="shop-bulk-label">今日剩餘</span>
                    <span className="shop-bulk-remaining">{remaining} 次</span>
                  </div>
                )}

                {/* 數量選擇器 */}
                <div className="shop-bulk-qty-section">
                  <span className="shop-bulk-label">購買數量</span>
                  <div className="shop-bulk-qty-controls">
                    <button className="shop-bulk-qty-btn" disabled={bulkQty <= 1} onClick={() => setBulkQty(q => Math.max(1, q - 1))}>−</button>
                    <button className="shop-bulk-qty-btn" disabled={bulkQty <= 1} onClick={() => setBulkQty(q => Math.max(1, q - 10))}>−10</button>
                    <input
                      className="shop-bulk-qty-input"
                      type="number"
                      min={1}
                      max={maxQty}
                      value={bulkQty}
                      onChange={e => {
                        const v = Math.max(1, Math.min(maxQty, Math.floor(Number(e.target.value) || 1)))
                        setBulkQty(v)
                      }}
                    />
                    <button className="shop-bulk-qty-btn" disabled={bulkQty >= maxQty} onClick={() => setBulkQty(q => Math.min(maxQty, q + 10))}>+10</button>
                    <button className="shop-bulk-qty-btn" disabled={bulkQty >= maxQty} onClick={() => setBulkQty(q => Math.min(maxQty, q + 1))}>+</button>
                    <button className="shop-bulk-qty-btn shop-bulk-max-btn" disabled={bulkQty >= maxQty} onClick={() => setBulkQty(maxQty)}>MAX</button>
                  </div>
                </div>

                {/* 滑桿 */}
                {maxQty > 1 && (
                  <input
                    className="shop-bulk-slider"
                    type="range"
                    min={1}
                    max={maxQty}
                    value={bulkQty}
                    onChange={e => setBulkQty(Number(e.target.value))}
                  />
                )}

                {/* 獎勵預覽 */}
                <div className="shop-bulk-rewards">
                  <span className="shop-bulk-label">獲得</span>
                  <div className="shop-bulk-reward-list">
                    {bulkItem.rewards.map(r => (
                      <span key={r.itemId} className="shop-bulk-reward-item">
                        {getItemIcon(r.itemId)} {getItemName(r.itemId)} ×{(r.quantity * bulkQty).toLocaleString()}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 總價 + 確認 */}
                <div className="shop-bulk-footer">
                  <div className={`shop-bulk-total ${totalCost > balance ? 'shop-bulk-total-insufficient' : ''}`}>
                    <span>總計：</span>
                    {renderCurrencyIcon()} <strong>{totalCost.toLocaleString()}</strong>
                  </div>
                  <button
                    className="shop-bulk-confirm"
                    disabled={bulkBuying || bulkQty <= 0 || maxQty <= 0 || totalCost > balance}
                    onClick={() => handlePurchase(bulkItem, bulkQty)}
                  >
                    {bulkBuying ? '購買中...' : `確認購買 ×${bulkQty}`}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
