/**
 * AcquireToast — 統一浮動 Toast 元件
 *
 * 渲染 text（純文字）與 item（帶 icon 物品）兩種 toast 條。
 * 每條獨立動畫，animationEnd 自動移除。
 * SSR/SR 物品帶光暈。不阻擋操作（pointer-events: none）。
 *
 * 對應 Spec: specs/item-acquire-toast.md
 */

import { CurrencyIcon } from './CurrencyIcon'
import type { ToastEntry } from '../hooks/useAcquireToast'
import { getItemIcon } from '../constants/rarity'

/** 判斷貨幣類 ID 並回傳 CurrencyIcon type */
function getCurrencyType(id: string): 'gold' | 'diamond' | 'exp' | 'stardust' | null {
  const clean = id.replace('currency_', '')
  if (clean === 'gold' || clean === 'diamond' || clean === 'exp' || clean === 'stardust') return clean
  return null
}

/* ════════════════════════════════════
   主元件
   ════════════════════════════════════ */

export function AcquireToast({
  entries,
  onRemove,
}: {
  entries: ToastEntry[]
  onRemove: (id: number) => void
}) {
  if (entries.length === 0) return null

  return (
    <div className="acquire-toast-stack">
      {entries.map(entry => {
        /* ── 純文字 toast ── */
        if (entry.kind === 'text') {
          return (
            <div
              key={entry.id}
              className="acquire-toast-bar acquire-toast-text"
              style={{ animationDelay: `${entry.delay / 1000}s` }}
              onAnimationEnd={() => onRemove(entry.id)}
            >
              <span className="acquire-toast-name">{entry.text}</span>
            </div>
          )
        }

        /* ── 物品 toast ── */
        const item = entry.item!
        const currType = getCurrencyType(item.id)
        const rarityClass =
          item.rarity === 'SSR' ? 'acquire-toast-ssr'
            : item.rarity === 'SR' ? 'acquire-toast-sr'
              : ''

        return (
          <div
            key={entry.id}
            className={`acquire-toast-bar ${rarityClass}`}
            style={{ animationDelay: `${entry.delay / 1000}s` }}
            onAnimationEnd={() => onRemove(entry.id)}
          >
            <span className="acquire-toast-icon">
              {currType ? (
                <CurrencyIcon type={currType} />
              ) : (
                <span>{getItemIcon(item.id)}</span>
              )}
            </span>
            <span className="acquire-toast-name">{item.name}</span>
            <span className="acquire-toast-qty">
              {item.type === 'currency' ? `+${item.quantity.toLocaleString()}` : `×${item.quantity}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
