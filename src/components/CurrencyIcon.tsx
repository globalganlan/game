/**
 * CurrencyIcon / ItemIcon — 統一貨幣 & 道具 icon 元件
 *
 * 金幣、鑽石、經驗、星塵使用 CSS badge（跨平台穩定、風格一致）。
 * 其他道具沿用 emoji icon（由 rarity.ts getItemIcon 提供）。
 *
 * 所有介面（HUD、主選單、抽卡、商店、背包、信箱、關卡選擇、勝利結算）
 * 均統一使用此元件，不再使用內嵌 `<i className="icon-xxx">` 或散落 emoji。
 */

import { getItemIcon } from '../constants/rarity'

export type CurrencyType = 'gold' | 'diamond' | 'exp' | 'stardust'

/** CSS badge icon for main currencies */
export function CurrencyIcon({ type }: { type: CurrencyType }) {
  switch (type) {
    case 'gold':     return <i className="icon-coin">G</i>
    case 'diamond':  return <i className="icon-dia"><span>D</span></i>
    case 'exp':      return <i className="icon-exp">E</i>
    case 'stardust': return <i className="icon-stardust">S</i>
  }
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
}

/**
 * 通用道具 icon 元件 — 貨幣自動渲染 CSS badge，其他渲染 emoji。
 * 用於信箱獎勵、抽卡結果、掉落等需根據 itemId 動態顯示 icon 的場合。
 */
export function ItemIcon({ itemId }: { itemId: string }) {
  const ct = CURRENCY_TYPE_MAP[itemId]
  if (ct) return <CurrencyIcon type={ct} />
  return <>{getItemIcon(itemId)}</>
}
