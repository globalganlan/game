/**
 * AcquireToast — 獲得物品動畫提示元件
 *
 * 分兩種模式：
 * 1. 重要物品（SR/SSR 英雄/裝備）→ 逐一全螢幕動畫
 * 2. 一般物品 → 合併列表顯示
 *
 * 對應 Spec: specs/item-acquire-toast.md v0.1
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { CurrencyIcon } from './CurrencyIcon'
import type { AcquireItem } from '../hooks/useAcquireToast'
import { getItemIcon, getItemName } from '../constants/rarity'

/* ════════════════════════════════════
   常數
   ════════════════════════════════════ */

const RARITY_BORDER: Record<string, string> = {
  N: '#9ca3af',
  R: '#60a5fa',
  SR: '#a78bfa',
  SSR: '#fbbf24',
}

const RARITY_DISPLAY: Record<string, number> = {
  N: 600,
  R: 800,
  SR: 1000,
  SSR: 1500,
}

const CURRENCY_TYPES = new Set(['gold', 'diamond', 'exp', 'stardust', 'currency_gold', 'currency_diamond', 'currency_exp', 'currency_stardust'])

const RARITY_ORDER: Record<string, number> = { SSR: 4, SR: 3, R: 2, N: 1 }

const MAX_LIST_ITEMS = 8
const AUTO_CLOSE_MS = 4000

/* ════════════════════════════════════
   判斷是否為「重要」物品
   ════════════════════════════════════ */

function isImportant(item: AcquireItem): boolean {
  return (
    (item.rarity === 'SSR' || item.rarity === 'SR') &&
    (item.type === 'hero' || item.type === 'equipment')
  )
}

/* ════════════════════════════════════
   單物品展示（全螢幕）
   ════════════════════════════════════ */

function SingleItemDisplay({
  item,
  onDone,
}: {
  item: AcquireItem
  onDone: () => void
}) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // enter → show
    timerRef.current = setTimeout(() => {
      setPhase('show')
      // show → exit
      timerRef.current = setTimeout(() => {
        setPhase('exit')
        timerRef.current = setTimeout(onDone, 300)
      }, RARITY_DISPLAY[item.rarity ?? 'N'] ?? 800)
    }, 500)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [item, onDone])

  const handleClick = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase('exit')
    setTimeout(onDone, 150)
  }, [onDone])

  const borderColor = RARITY_BORDER[item.rarity ?? 'N'] ?? '#9ca3af'
  const glowClass = item.rarity === 'SSR' ? 'acquire-ssr-glow' : item.rarity === 'SR' ? 'acquire-sr-glow' : ''
  const shakeClass = item.rarity === 'SSR' ? 'acquire-screen-shake' : ''

  return (
    <div
      className={`acquire-overlay ${shakeClass}`}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <div className={`acquire-single-item ${phase === 'enter' ? 'acquire-item-enter' : phase === 'exit' ? 'acquire-item-exit' : 'acquire-float'} ${glowClass}`}>
        {/* 物品圖示 */}
        <div className="acquire-item-icon" style={{ borderColor }}>
          {item.thumbnail ? (
            <img src={item.thumbnail} alt={item.name} className="acquire-thumb-img" />
          ) : (
            <span className="acquire-item-emoji">{getItemIcon(item.id)}</span>
          )}
        </div>

        {/* 稀有度 */}
        <div className="acquire-rarity-badge" style={{ color: borderColor }}>
          {'★'.repeat(RARITY_ORDER[item.rarity ?? 'N'] ?? 1)} {item.rarity ?? 'N'}
        </div>

        {/* 名稱 */}
        <div className="acquire-item-name" style={{ color: borderColor }}>
          「{item.name}」
        </div>

        {/* NEW 標記 */}
        {item.isNew && <div className="acquire-new-badge">🆕 NEW</div>}
      </div>

      <div className="acquire-tap-hint">— 點擊任意處繼續 —</div>
    </div>
  )
}

/* ════════════════════════════════════
   合併列表展示
   ════════════════════════════════════ */

function ItemListDisplay({
  items,
  onDone,
}: {
  items: AcquireItem[]
  onDone: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    timerRef.current = setTimeout(onDone, AUTO_CLOSE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [onDone])

  const handleConfirm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    onDone()
  }, [onDone])

  // 排序：稀有度降序 → 類型 → 數量降序
  const sorted = [...items].sort((a, b) => {
    const rd = (RARITY_ORDER[b.rarity ?? 'N'] ?? 0) - (RARITY_ORDER[a.rarity ?? 'N'] ?? 0)
    if (rd !== 0) return rd
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return b.quantity - a.quantity
  })

  const display = sorted.slice(0, MAX_LIST_ITEMS)
  const overflow = sorted.length - MAX_LIST_ITEMS

  return (
    <div className="acquire-overlay" onClick={handleConfirm} style={{ cursor: 'pointer' }}>
      <div className="acquire-list-panel" onClick={(e) => e.stopPropagation()}>
        <div className="acquire-list-title">🎉 獲得物品</div>
        <div className="acquire-list-divider" />
        <div className="acquire-list-body">
          {display.map((item, i) => (
            <div key={`${item.id}-${i}`} className="acquire-list-item" style={{ animationDelay: `${i * 0.1}s` }}>
              <span className="acquire-list-icon">
                {CURRENCY_TYPES.has(item.id) ? (
                  <CurrencyIcon type={item.id.replace('currency_', '') as 'gold' | 'diamond' | 'exp' | 'stardust'} />
                ) : (
                  <span>{getItemIcon(item.id)}</span>
                )}
              </span>
              <span className="acquire-list-name" style={{ color: RARITY_BORDER[item.rarity ?? 'N'] ?? '#e2e8f0' }}>
                {item.name}
              </span>
              <span className="acquire-list-qty">
                {item.type === 'currency' ? `+${item.quantity.toLocaleString()}` : `×${item.quantity}`}
              </span>
            </div>
          ))}
          {overflow > 0 && (
            <div className="acquire-list-overflow">...及其他 {overflow} 件</div>
          )}
        </div>
        <div className="acquire-list-divider" />
        <button className="acquire-list-confirm" onClick={handleConfirm}>確認</button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   主元件
   ════════════════════════════════════ */

export function AcquireToast({
  items,
  onComplete,
}: {
  items: AcquireItem[]
  onComplete: () => void
}) {
  const [phase, setPhase] = useState<'important' | 'common' | 'done'>('important')
  const [importantIdx, setImportantIdx] = useState(0)

  // 分類
  const importantItems = items.filter(isImportant)
  const commonItems = items.filter(i => !isImportant(i))

  useEffect(() => {
    if (importantItems.length === 0) {
      setPhase(commonItems.length > 0 ? 'common' : 'done')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase === 'done') onComplete()
  }, [phase, onComplete])

  const handleImportantDone = useCallback(() => {
    const next = importantIdx + 1
    if (next < importantItems.length) {
      setImportantIdx(next)
    } else {
      setPhase(commonItems.length > 0 ? 'common' : 'done')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importantIdx, importantItems.length, commonItems.length])

  const handleCommonDone = useCallback(() => {
    setPhase('done')
  }, [])

  if (phase === 'important' && importantItems[importantIdx]) {
    return <SingleItemDisplay item={importantItems[importantIdx]} onDone={handleImportantDone} />
  }

  if (phase === 'common' && commonItems.length > 0) {
    return <ItemListDisplay items={commonItems} onDone={handleCommonDone} />
  }

  return null
}
