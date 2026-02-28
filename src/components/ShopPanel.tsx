/**
 * ShopPanel — 商店面板
 *
 * 提供道具/鑽石/限時禮包購買。
 * 使用金幣/鑽石/競技幣等貨幣兌換素材。
 */

import { useState, useMemo, useCallback } from 'react'
import { getSaveState, updateProgress } from '../services/saveService'
import { addItemsLocally } from '../services/inventoryService'

/* ────────────────────────────
   商品定義
   ──────────────────────────── */

interface ShopItem {
  id: string
  name: string
  icon: string
  description: string
  price: number
  currency: 'gold' | 'diamond' | 'arena'
  rewards: { itemId: string; quantity: number }[]
  /** 每日購買上限（0=無限） */
  dailyLimit: number
  category: ShopCategory
}

type ShopCategory = 'daily' | 'material' | 'equipment' | 'special'

const SHOP_CATEGORIES: { key: ShopCategory; label: string; icon: string }[] = [
  { key: 'daily', label: '每日商店', icon: '🔄' },
  { key: 'material', label: '素材商店', icon: '🧪' },
  { key: 'equipment', label: '裝備商店', icon: '⚔️' },
  { key: 'special', label: '特殊商店', icon: '⭐' },
]

const SHOP_ITEMS: ShopItem[] = [
  // ── 每日商店 ──
  {
    id: 'daily_exp_s', name: '小型經驗核心 ×5', icon: '🟢',
    description: '為英雄提升經驗的基礎素材',
    price: 1000, currency: 'gold',
    rewards: [{ itemId: 'exp_core_s', quantity: 5 }],
    dailyLimit: 10, category: 'daily',
  },
  {
    id: 'daily_exp_m', name: '中型經驗核心 ×3', icon: '🔵',
    description: '中等經驗素材，後期必備',
    price: 5000, currency: 'gold',
    rewards: [{ itemId: 'exp_core_m', quantity: 3 }],
    dailyLimit: 5, category: 'daily',
  },
  {
    id: 'daily_exp_l', name: '大型經驗核心 ×1', icon: '🟣',
    description: '大量經驗，快速升級',
    price: 20, currency: 'diamond',
    rewards: [{ itemId: 'exp_core_l', quantity: 1 }],
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
  {
    id: 'mat_reroll', name: '重洗石 ×1', icon: '🔮',
    description: '重新隨機裝備副屬性',
    price: 80, currency: 'diamond',
    rewards: [{ itemId: 'eqm_reroll', quantity: 1 }],
    dailyLimit: 0, category: 'material',
  },
  // ── 裝備商店 ──
  {
    id: 'equip_chest', name: '裝備寶箱', icon: '📦',
    description: '隨機獲得一件 R~SSR 裝備',
    price: 100, currency: 'diamond',
    rewards: [{ itemId: 'chest_equipment', quantity: 1 }],
    dailyLimit: 5, category: 'equipment',
  },
  {
    id: 'forge_ore_common', name: '普通鍛造礦 ×10', icon: '⛏️',
    description: '鍛造裝備用基礎礦石',
    price: 5000, currency: 'gold',
    rewards: [{ itemId: 'forge_ore_common', quantity: 10 }],
    dailyLimit: 0, category: 'equipment',
  },
  {
    id: 'forge_ore_rare', name: '稀有鍛造礦 ×5', icon: '💠',
    description: '鍛造高級裝備用礦石',
    price: 30, currency: 'diamond',
    rewards: [{ itemId: 'forge_ore_rare', quantity: 5 }],
    dailyLimit: 0, category: 'equipment',
  },
  // ── 特殊商店 ──
  {
    id: 'special_gold_pack', name: '金幣禮包（10,000 金）', icon: '💰',
    description: '快速獲取大量金幣',
    price: 30, currency: 'diamond',
    rewards: [{ itemId: 'gold_pack_10k', quantity: 1 }],
    dailyLimit: 5, category: 'special',
  },
]

import { getItemIcon, getItemName } from '../constants/rarity'
import { CurrencyIcon } from './CurrencyIcon'

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

  const saveState = getSaveState()
  const gold = saveState?.save.gold ?? 0
  const diamond = saveState?.save.diamond ?? 0

  const filteredItems = useMemo(
    () => SHOP_ITEMS.filter(item => item.category === activeCategory),
    [activeCategory],
  )

  const canAfford = useCallback((item: ShopItem): boolean => {
    if (item.currency === 'gold') return gold >= item.price
    if (item.currency === 'diamond') return diamond >= item.price
    return false
  }, [gold, diamond])

  const getRemainingPurchases = useCallback((item: ShopItem): number | null => {
    if (item.dailyLimit <= 0) return null
    const bought = purchasedToday[item.id] ?? 0
    return Math.max(0, item.dailyLimit - bought)
  }, [purchasedToday])

  const handlePurchase = useCallback((item: ShopItem) => {
    const remaining = getRemainingPurchases(item)
    if (remaining !== null && remaining <= 0) {
      setPurchaseMsg('今日已達購買上限')
      return
    }
    if (!canAfford(item)) {
      setPurchaseMsg(`${item.currency === 'gold' ? '金幣' : '鑽石'}不足`)
      return
    }

    // 樂觀扣款
    if (item.currency === 'gold') {
      updateProgress({ gold: gold - item.price })
    } else if (item.currency === 'diamond') {
      updateProgress({ diamond: diamond - item.price })
    }

    // 樂觀發放獎勵
    addItemsLocally(item.rewards)

    // 更新購買計數
    setPurchasedToday(prev => ({
      ...prev,
      [item.id]: (prev[item.id] ?? 0) + 1,
    }))

    const rewardNames = item.rewards.map(r => `${getItemIcon(r.itemId)} ${getItemName(r.itemId)} ×${r.quantity}`).join('、')
    setPurchaseMsg(`購買成功！獲得 ${rewardNames}`)
    setTimeout(() => setPurchaseMsg(''), 2500)
  }, [canAfford, getRemainingPurchases, gold, diamond])

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🏪 商店</h2>
          <div className="shop-currency-bar">
            <span className="shop-currency gold"><CurrencyIcon type="gold" /> {gold.toLocaleString()}</span>
            <span className="shop-currency diamond"><CurrencyIcon type="diamond" /> {diamond.toLocaleString()}</span>
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
                <div className="shop-item-icon">{item.icon}</div>
                <div className="shop-item-body">
                  <div className="shop-item-name">{item.name}</div>
                  <div className="shop-item-desc">{item.description}</div>
                  <div className="shop-item-footer">
                    <span className={`shop-price ${!affordable ? 'shop-price-insufficient' : ''}`}>
                      {item.currency === 'gold' ? <CurrencyIcon type="gold" /> : item.currency === 'diamond' ? <CurrencyIcon type="diamond" /> : '🏟️'} {item.price.toLocaleString()}
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
      </div>
    </div>
  )
}
