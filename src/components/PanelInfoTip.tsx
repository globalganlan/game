/**
 * PanelInfoTip — 面板標題旁的「ℹ️」說明按鈕
 *
 * 點擊後彈出該面板的功能說明文字。
 * 使用 React Portal 渲染 popup，不受父層 overflow 裁切。
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PanelInfoTipProps {
  /** 說明文字（支援多行，用 \n 換行） */
  description: string
  /** 額外渲染在說明文字下方的自訂內容（可放 ClickableItemIcon 等元件） */
  children?: ReactNode
}

export function PanelInfoTip({ description, children }: PanelInfoTipProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
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

  useLayoutEffect(() => {
    if (!open || !popupRef.current || !triggerRef.current) return
    const el = popupRef.current
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8

    let top = triggerRect.bottom + 8
    let left = triggerRect.left + triggerRect.width / 2

    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.style.transform = 'translateX(-50%)'

    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      if (r.left < margin) {
        el.style.transform = `translateX(calc(-50% + ${margin - r.left}px))`
      } else if (r.right > vw - margin) {
        el.style.transform = `translateX(calc(-50% - ${r.right - (vw - margin)}px))`
      }
      if (r.bottom > vh - margin) {
        el.style.top = `${triggerRect.top - r.height - 8}px`
      }
    })
  }, [open])

  const popup = open ? createPortal(
    <div className="panel-infotip-popup" ref={popupRef}>
      {description.split('\n').map((line, i) => (
        <p key={i} className="panel-infotip-line">{line}</p>
      ))}
      {children}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        className="panel-infotip-btn"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        title="功能說明"
        type="button"
        aria-label="說明"
      >
        i
      </button>
      {popup}
    </>
  )
}

/** 各面板的說明文字常數 */
export const PANEL_DESCRIPTIONS = {
  stageSelect: '選擇關卡進行戰鬥。\n包含主線劇情、爬塔挑戰、每日副本、試煉場對戰與 Boss 挑戰。\n通關可獲得金幣、經驗、鑽石等獎勵。',
  arena: '競技場排名系統。\n挑戰其他玩家的防守陣型，勝利可提升排名並獲得鑽石與競技幣。\n可配置防守陣型供其他玩家挑戰。\n每日排名獎勵於 21:00 UTC 發放至信箱。',
  checkin: '每日簽到領取獎勵。\n連續簽到 7 天可獲得越來越豐厚的獎勵。\n中斷簽到將重置天數計算。',
  gacha: '使用鑽石或召喚券抽取英雄與裝備。\n英雄召喚：每 60 抽保底 SSR 英雄。\n裝備鍛造：金幣池與鑽石池，十連保底 SR+ 裝備。\n重複英雄會轉化為星塵與碎片。',
  heroList: '查看與管理所有英雄。\n可升級英雄等級（消耗經驗）、突破提升等級上限（消耗碎片與金幣）、升星強化屬性。\n還可查看英雄詳細屬性與技能。',
  inventory: '管理背包中的道具與裝備。\n可使用寶箱開啟獎勵，道具用於英雄養成。\n裝備可裝備給英雄、強化提升數值、分解回收資源。',
  shop: '使用各種貨幣購買道具與禮包。\n商品分為每日限購、每週限購與永久商品。\n支援金幣、鑽石、星塵、裝備碎片、競技幣等多種貨幣。',
  settings: '調整遊戲設定。\n包含音量控制、綁定帳號（可跨裝置登入）、修改密碼、加入主畫面等功能。',
  mailbox: '查看與領取系統郵件獎勵。\n排名獎勵、活動獎勵等會透過信箱發放。\n可一鍵全部領取附件。',
} as const
