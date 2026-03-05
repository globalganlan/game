/**
 * CurrencyIcon / ItemIcon — 統一貨幣 & 道具 icon 元件
 *
 * 金幣 💰、鑽石 💎、經驗 💚、星塵 ✨、戰力 ⚔️ 使用 emoji 統一顯示。
 * 其他道具沿用 emoji icon（由 rarity.ts getItemIcon 提供）。
 */

import { getItemIcon } from '../constants/rarity'

export type CurrencyType = 'gold' | 'diamond' | 'exp' | 'stardust' | 'cp' | 'pvp_coin'

const CURRENCY_EMOJI: Record<CurrencyType, string> = {
  gold: '💰',
  diamond: '💎',
  exp: '💚',
  stardust: '✨',
  cp: '⚔️',
  pvp_coin: '🏅',
}

/** Emoji icon for main currencies */
export function CurrencyIcon({ type }: { type: CurrencyType }) {
  return <span className="currency-emoji">{CURRENCY_EMOJI[type]}</span>
}

/** itemId → CurrencyType mapping (only for display-as-badge items) */
const CURRENCY_TYPE_MAP: Record<string, CurrencyType> = {
  gold: 'gold',
  currency_gold: 'gold',
  diamond: 'diamond',
  currency_diamond: 'diamond',
  exp: 'exp',
  currency_exp: 'exp',
  stardust: 'stardust',
  currency_stardust: 'stardust',
  pvp_coin: 'pvp_coin',
  currency_pvp_coin: 'pvp_coin',
}

/**
 * 通用道具 icon 元件 — 貨幣自動渲染 emoji，其他渲染 emoji。
 * 用於信箱獎勵、抽卡結果、掉落等需根據 itemId 動態顯示 icon 的場合。
 */
export function ItemIcon({ itemId }: { itemId: string }) {
  const ct = CURRENCY_TYPE_MAP[itemId]
  if (ct) return <CurrencyIcon type={ct} />
  return <>{getItemIcon(itemId)}</>
}
