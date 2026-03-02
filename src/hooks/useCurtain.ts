/**
 * useCurtain — 過場幕狀態與動畫控制
 *
 * 從 App.tsx 抽出，管理 TransitionOverlay 的可見性、淡出、文字。
 */
import { useState, useRef, useCallback } from 'react'
import { SCENE_RENDER_GRACE_MS, CURTAIN_FADE_MS } from '../game/constants'

export function useCurtain() {
  const [curtainVisible, setCurtainVisible] = useState(true)
  const [curtainFading, setCurtainFading] = useState(false)
  const [curtainText, setCurtainText] = useState('載入資源中...')
  const initialReady = useRef(false)
  const curtainClosePromiseRef = useRef<Promise<boolean> | null>(null)

  const closeCurtain = useCallback((delayMs = SCENE_RENDER_GRACE_MS) => {
    if (curtainClosePromiseRef.current) return curtainClosePromiseRef.current
    initialReady.current = true
    curtainClosePromiseRef.current = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        setCurtainFading(true)
        setTimeout(() => {
          setCurtainVisible(false)
          resolve(true)
        }, CURTAIN_FADE_MS)
      }, delayMs)
    })
    return curtainClosePromiseRef.current
  }, [])

  /** 重置過場幕到初始狀態（登出時使用） */
  const resetCurtain = useCallback(() => {
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('載入資源中...')
    initialReady.current = false
    curtainClosePromiseRef.current = null
  }, [])

  return {
    curtainVisible, setCurtainVisible,
    curtainFading, setCurtainFading,
    curtainText, setCurtainText,
    initialReady, curtainClosePromiseRef,
    closeCurtain, resetCurtain,
  }
}
