/**
 * ItemInfoPopup — 通用道具詳情彈窗（唯讀）
 *
 * 用於：簽到預覽、商店道具、信箱獎勵等場景。
 * 點擊道具 → 顯示名稱、icon、稀有度、說明。
 * 純展示用，不含操作按鈕（使用/分解等）。
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getItemIcon, getItemName, RARITY_COLORS } from '../constants/rarity'
import type { Rarity } from '../constants/rarity'
import { getItemDefinition, loadItemDefinitions } from '../services/inventoryService'
import { ChestLootPreview } from './ChestLootPreview'

interface ItemInfoPopupProps {
  itemId: string
  onClose: () => void
}

/** 道具預覽描述（靜態兜底，當 D1 定義尚未載入時使用） */
const ITEM_DESCRIPTIONS: Record<string, string> = {
  exp: '經驗資源，用於提升英雄等級。',
  chest_bronze: '銅級寶箱，可開啟獲得金幣與隨機素材。',
  chest_silver: '銀級寶箱，獎勵更豐厚，含鑽石與隨機素材。',
  chest_gold: '金級寶箱，頂級獎勵，有機會獲得裝備寶箱。',
  chest_equipment: '隨機獲得一件 R~SSR 裝備。',
  asc_class_power: '力量型英雄突破必備素材。',
  asc_class_agility: '敏捷型英雄突破必備素材。',
  asc_class_defense: '防禦型英雄突破必備素材。',
  asc_class_universal: '可替代任何職業石的通用突破素材。',
  stamina_potion: '恢復體力，可用於挑戰更多關卡。',
  gold_pack_10k: '使用後獲得 10,000 金幣。',
  gold: '基礎遊戲貨幣，用於購買道具與強化裝備。',
  diamond: '高級貨幣，用於召喚、購買稀有道具。',
  gacha_ticket_hero: '英雄召喚專用券，每張可抵扣一次單抽的鑽石費用。透過簽到、活動或商店取得。',
  gacha_ticket_equip: '裝備鍛造專用券，每張可抵扣一次鍛造的鑽石費用。透過簽到、活動或商店取得。',
}

/** 道具稀有度兜底推斷 */
function inferRarity(itemId: string): Rarity {
  if (itemId.includes('gold') || itemId.includes('_l') || itemId === 'chest_equipment') return 'SR'
  if (itemId.includes('silver') || itemId.includes('_m')) return 'R'
  return 'N'
}

export function ItemInfoPopup({ itemId, onClose }: ItemInfoPopupProps) {
  const [def, setDef] = useState(getItemDefinition(itemId))

  // 確保定義已載入
  useEffect(() => {
    if (!def) {
      loadItemDefinitions().then(() => {
        setDef(getItemDefinition(itemId))
      }).catch(() => { /* 靜默 */ })
    }
  }, [itemId, def])

  const icon = def?.icon || getItemIcon(itemId)
  const name = def?.name || getItemName(itemId)
  const rarity: Rarity = (def?.rarity as Rarity) || inferRarity(itemId)
  const desc = def?.description || ITEM_DESCRIPTIONS[itemId] || '無描述'

  return createPortal(
    <div className="inv-detail-backdrop" onClick={onClose}>
      <div className="inv-detail-card item-info-popup" onClick={(e) => e.stopPropagation()}>
        <button className="inv-detail-close" onClick={onClose}>✕</button>
        <div className="inv-detail-header">
          <span className="inv-detail-icon">{icon}</span>
          <div>
            <h3 style={{ color: RARITY_COLORS[rarity] }}>{name}</h3>
            <span className="inv-detail-rarity">{rarity}</span>
          </div>
        </div>
        <p className="inv-detail-desc">{desc}</p>
        {itemId.startsWith('chest_') && <ChestLootPreview chestId={itemId} />}
      </div>
    </div>,
    document.body
  )
}
