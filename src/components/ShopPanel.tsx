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

type ShopCategory = 'daily' | 'material' | 'special' | 'stardust' | 'scrap'

const SHOP_CATEGORIES: { key: ShopCategory; label: string; icon: string }[] = [
  { key: 'daily', label: '每日商店', icon: '🔄' },
  { key: 'material', label: '素材商店', icon: '🧪' },
  { key: 'stardust', label: '星塵兌換', icon: '✨' },
  { key: 'special', label: '特殊商店', icon: '⭐' },
  { key: 'scrap', label: '碎片兌換', icon: '🔧' },
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
  {
    id: 'daily_enhance_s', name: '小型強化石 ×5', icon: '🔨',
    description: '裝備強化用基礎素材',
    price: 2000, currency: 'gold',
    rewards: [{ itemId: 'eqm_enhance_s', quantity: 5 }],
    dailyLimit: 10, category: 'daily',
  },
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
    id: 'sd_enhance_l', name: '大型強化石 ×3', icon: '🔨',
    description: '裝備強化用高級素材',
    price: 25, currency: 'stardust',
    rewards: [{ itemId: 'eqm_enhance_l', quantity: 3 }],
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
    rewards: [{ itemId: 'gold_pack_10k', quantity: 1 }],
    dailyLimit: 5, category: 'special',
  },
  {
    id: 'special_ticket_hero', name: '英雄召喚券 ×1', icon: '🎫',
    description: '可用於英雄召喚，免費抽取一次',
    price: 50, currency: 'diamond',
    rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }],
    dailyLimit: 3, category: 'special',
  },
  {
    id: 'special_ticket_equip', name: '裝備鍛造券 ×1', icon: '🔨',
    description: '可用於裝備鍛造，免費鍛造一次',
    price: 50, currency: 'diamond',
    rewards: [{ itemId: 'gacha_ticket_equip', quantity: 1 }],
    dailyLimit: 3, category: 'special',
  },
  // ── 星塵兌換店（召喚券） ──
  {
    id: 'sd_ticket_hero', name: '英雄召喚券 ×1', icon: '🎫',
    description: '用星塵兌換英雄召喚券',
    price: 30, currency: 'stardust',
    rewards: [{ itemId: 'gacha_ticket_hero', quantity: 1 }],
    dailyLimit: 0, category: 'stardust',
  },
  {
    id: 'sd_ticket_equip', name: '裝備鍛造券 ×1', icon: '🔨',
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
  {
    id: 'scrap_enhance_s', name: '小型強化石 ×5', icon: '🔨',
    description: '用碎片兌換裝備強化素材',
    price: 3, currency: 'equip_scrap',
    rewards: [{ itemId: 'eqm_enhance_s', quantity: 5 }],
    dailyLimit: 0, category: 'scrap',
  },
  {
    id: 'scrap_enhance_m', name: '中型強化石 ×3', icon: '🔨',
    description: '用碎片兌換中級強化素材',
    price: 8, currency: 'equip_scrap',
    rewards: [{ itemId: 'eqm_enhance_m', quantity: 3 }],
    dailyLimit: 0, category: 'scrap',
  },
  {
    id: 'scrap_enhance_l', name: '大型強化石 ×2', icon: '🔨',
    description: '用碎片兌換高級強化素材',
    price: 15, currency: 'equip_scrap',
    rewards: [{ itemId: 'eqm_enhance_l', quantity: 2 }],
    dailyLimit: 0, category: 'scrap',
  },
]

import { getItemIcon, getItemName } from '../constants/rarity'
import { CurrencyIcon } from './CurrencyIcon'
import { InfoTip } from './InfoTip'
import { ItemInfoPopup } from './ItemInfoPopup'

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
  const [previewItemId, setPreviewItemId] = useState<string | null>(null)

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

  const filteredItems = useMemo(
    () => SHOP_ITEMS.filter(item => item.category === activeCategory),
    [activeCategory],
  )

  const canAfford = useCallback((item: ShopItem): boolean => {
    if (item.currency === 'gold') return gold >= item.price
    if (item.currency === 'diamond') return diamond >= item.price
    if (item.currency === 'stardust') return stardust >= item.price
    if (item.currency === 'equip_scrap') return equipScrap >= item.price
    return false
  }, [gold, diamond, stardust, equipScrap])

  const getRemainingPurchases = useCallback((item: ShopItem): number | null => {
    if (item.dailyLimit <= 0) return null
    const bought = purchasedToday[item.id] ?? 0
    return Math.max(0, item.dailyLimit - bought)
  }, [purchasedToday])

  const handlePurchase = useCallback(async (item: ShopItem) => {
    const remaining = getRemainingPurchases(item)
    if (remaining !== null && remaining <= 0) {
      setPurchaseMsg('今日已達購買上限')
      return
    }
    if (!canAfford(item)) {
      const names: Record<string, string> = { gold: '金幣', diamond: '鑽石', stardust: '星塵', equip_scrap: '裝備碎片' }
      setPurchaseMsg(`${names[item.currency] ?? '貨幣'}不足`)
      return
    }

    // 星塵/碎片扣款（非 save 貨幣，需本地扣）
    if (item.currency === 'stardust') {
      removeItemsLocally([{ itemId: 'currency_stardust', quantity: item.price }])
    } else if (item.currency === 'equip_scrap') {
      removeItemsLocally([{ itemId: 'equip_scrap', quantity: item.price }])
    }

    // 非資源類獎勵本地加背包（伺服器也會同步）
    const RESOURCE_REWARDS = ['exp', 'gold', 'diamond', 'stardust'] as const
    const inventoryItems = item.rewards.filter(r => !(RESOURCE_REWARDS as readonly string[]).includes(r.itemId))
    if (inventoryItems.length > 0) addItemsLocally(inventoryItems)

    // 獲得物品動畫
    const CURRENCY_IDS = ['gold', 'diamond', 'stardust', 'exp'] as const
    emitAcquire(item.rewards.map(r => ({
      type: r.itemId.startsWith('currency_') || (CURRENCY_IDS as readonly string[]).includes(r.itemId) ? 'currency' as const : 'item' as const,
      id: r.itemId,
      name: getItemName(r.itemId),
      quantity: r.quantity,
    })))

    // 呼叫後端 → 以伺服器權威值覆蓋貨幣
    try {
      const res = await callApi<{ currencies?: { gold?: number; diamond?: number; exp?: number } }>('shop-buy', { shopItemId: item.id })
      if (res.success && res.currencies) {
        applyCurrenciesFromServer(res.currencies)
      }
    } catch (e) {
      console.warn('[shop] shop-buy error:', e)
    }

    // 更新購買計數
    setPurchasedToday(prev => ({
      ...prev,
      [item.id]: (prev[item.id] ?? 0) + 1,
    }))

    const rewardNames = item.rewards.map(r => `${getItemIcon(r.itemId)} ${getItemName(r.itemId)} ×${r.quantity}`).join('、')
    setPurchaseMsg(`購買成功！獲得 ${rewardNames}`)
    setTimeout(() => setPurchaseMsg(''), 2500)
  }, [canAfford, getRemainingPurchases, gold, diamond, stardust, equipScrap])

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🏪 商店</h2>
          <div className="shop-currency-bar">
            <InfoTip icon={<CurrencyIcon type="gold" />} value={gold.toLocaleString()} label="金幣" description="購買道具、強化裝備所需" className="menu-gold" />
            <InfoTip icon={<CurrencyIcon type="diamond" />} value={diamond.toLocaleString()} label="鑽石" description="購買稀有商品、禮包" className="menu-diamond" />
            <InfoTip icon={<CurrencyIcon type="stardust" />} value={stardust.toLocaleString()} label="星塵" description="重複英雄轉化而來，可在商店兑換稀有道具" className="menu-stardust" />
            <InfoTip icon={<span style={{fontSize:'0.85em'}}>🔧</span>} value={equipScrap.toLocaleString()} label="碎片" description="分解裝備獲得，可兌換強化素材或裝備寶箱" className="menu-stardust" />
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
                <div className="shop-item-icon shop-item-icon-clickable" onClick={() => setPreviewItemId(item.rewards[0]?.itemId)}>{item.icon || getItemIcon(item.rewards[0]?.itemId ?? '')}</div>
                <div className="shop-item-body">
                  <div className="shop-item-name">{item.name}</div>
                  <div className="shop-item-desc">{item.description}</div>
                  <div className="shop-item-footer">
                    <span className={`shop-price ${!affordable ? 'shop-price-insufficient' : ''}`}>
                      {item.currency === 'gold' ? <CurrencyIcon type="gold" /> : item.currency === 'diamond' ? <CurrencyIcon type="diamond" /> : item.currency === 'stardust' ? <CurrencyIcon type="stardust" /> : item.currency === 'equip_scrap' ? <span style={{fontSize:'0.85em'}}>🔧</span> : '🏟️'} {item.price.toLocaleString()}
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
                  onClick={() => handlePurchase(item)}
                >
                  {soldOut ? '售罄' : '購買'}
                </button>
              </div>
            )
          })}
        </div>
        {previewItemId && <ItemInfoPopup itemId={previewItemId} onClose={() => setPreviewItemId(null)} />}
      </div>
    </div>
  )
}
