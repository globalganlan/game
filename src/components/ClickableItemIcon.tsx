/**
 * ClickableItemIcon — 可點擊的道具/貨幣 icon
 *
 * 整合 ItemIcon + ItemInfoPopup：點擊 icon → 彈出道具詳情。
 * 用於替換所有獎勵/道具顯示中「只顯示不可點」的情況。
 *
 * 支援 children：將 icon + 名稱 + 數量包成一個整體可點擊區域。
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ItemIcon, CurrencyIcon, type CurrencyType } from './CurrencyIcon'
import { ItemInfoPopup } from './ItemInfoPopup'

interface ClickableItemIconProps {
  /** 道具/貨幣 ID */
  itemId: string
  /** 可選 label（如 "金幣 1000"） */
  label?: string
  /** 是否顯示 label */
  showLabel?: boolean
  /** 自訂 className */
  className?: string
  /** 子元素（如名稱+數量），會一起放在可點擊區域內 */
  children?: ReactNode
}

/** 根據 itemId 判斷是否為貨幣類型 */
const CURRENCY_MAP: Record<string, CurrencyType> = {
  gold: 'gold', currency_gold: 'gold',
  diamond: 'diamond', currency_diamond: 'diamond',
  exp: 'exp', currency_exp: 'exp',
  stardust: 'stardust', currency_stardust: 'stardust',
  pvp_coin: 'pvp_coin', currency_pvp_coin: 'pvp_coin',
}

export function ClickableItemIcon({ itemId, label, showLabel, className, children }: ClickableItemIconProps) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <>
      <span
        className={`clickable-item-icon ${className ?? ''}`}
        onClick={(e) => { e.stopPropagation(); setShowInfo(true) }}
        role="button"
        tabIndex={0}
        title="點擊查看詳情"
      >
        {CURRENCY_MAP[itemId]
          ? <CurrencyIcon type={CURRENCY_MAP[itemId]} />
          : <ItemIcon itemId={itemId} />
        }
        {showLabel && label && <span className="clickable-item-label">{label}</span>}
        {children}
      </span>
      {showInfo && (
        <ItemInfoPopup itemId={itemId} onClose={() => setShowInfo(false)} />
      )}
    </>
  )
}
