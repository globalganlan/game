/**
 * InfoTip — 通用資源資訊提示元件
 *
 * 使用 React Portal 渲染 popup 到 body，
 * 確保不被任何父層 overflow/z-index 遮蔽或裁切。
 * 點擊任何外部區域自動關閉。
 *
 * @example
 *   <InfoTip
 *     icon={<CurrencyIcon type="gold" />}
 *     value="12,345"
 *     label="金幣"
 *     description="升級、購買、強化所需的通用貨幣"
 *   />
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface InfoTipProps {
  /** 顯示的 icon (如 <CurrencyIcon />) */
  icon: React.ReactNode
  /** 顯示的數值文字 */
  value: string
  /** 貨幣/資源的名稱 */
  label: string
  /** 描述說明 */
  description: string
  /** 額外 className, 用於顏色 */
  className?: string
}

export function InfoTip({ icon, value, label, description, className = '' }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((e: MouseEvent | TouchEvent) => {
    const target = e.target as Node
    if (
      triggerRef.current && !triggerRef.current.contains(target) &&
      popupRef.current && !popupRef.current.contains(target)
    ) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      // 延遲綁定避免同一次 click 事件立即觸發
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('touchstart', handleClickOutside)
      }, 10)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
    }
  }, [open, handleClickOutside])

  // Portal 定位：popup 在 body 層，根據 trigger 位置計算
  useLayoutEffect(() => {
    if (!open || !popupRef.current || !triggerRef.current) return
    const el = popupRef.current
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8

    // 預設在 trigger 下方居中
    let top = triggerRect.bottom + 8
    let left = triggerRect.left + triggerRect.width / 2

    // 先設位置讓瀏覽器渲染，再量實際寬高
    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.style.transform = 'translateX(-50%)'

    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      // 左邊超出
      if (r.left < margin) {
        el.style.transform = `translateX(calc(-50% + ${margin - r.left}px))`
      }
      // 右邊超出
      else if (r.right > vw - margin) {
        el.style.transform = `translateX(calc(-50% - ${r.right - (vw - margin)}px))`
      }
      // 底部超出 → 改到 trigger 上方
      if (r.bottom > vh - margin) {
        el.style.top = `${triggerRect.top - r.height - 8}px`
      }
    })
  }, [open])

  const popup = open ? createPortal(
    <div className="infotip-popup" ref={popupRef}>
      <div className="infotip-popup-header">
        {icon} <strong>{label}</strong>
      </div>
      <div className="infotip-popup-desc">{description}</div>
      <div className="infotip-popup-value">目前持有：{value}</div>
    </div>,
    document.body,
  ) : null

  return (
    <div className={`infotip-wrap ${className}`}>
      <span className="infotip-trigger" ref={triggerRef} onClick={() => setOpen(!open)}>
        {icon}{value}
      </span>
      {popup}
    </div>
  )
}
