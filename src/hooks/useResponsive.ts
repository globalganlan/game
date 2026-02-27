/**
 * useResponsive — 裝置分級 hook
 *
 * 偵測 mobile / tablet / desktop，
 * 回傳 FOV、鏡頭位置、文字縮放、DPR 等即用設定。
 * 遊戲統一直屏模式，桌機用 9:16 容器。
 */

import { useState, useEffect, useMemo } from 'react'
import type { DeviceType, ResponsiveInfo } from '../types'

interface DeviceInfo {
  device: DeviceType
  isLandscape: boolean
}

function getDeviceInfo(): DeviceInfo {
  const w = window.innerWidth
  const h = window.innerHeight
  const isPortrait = h > w
  let device: DeviceType
  if (w <= 480 || (isPortrait && w <= 600) || (!isPortrait && h <= 480)) device = 'mobile'
  else if (w <= 1024 || (isPortrait && w <= 800) || (!isPortrait && h <= 800)) device = 'tablet'
  else device = 'desktop'
  // 桌機不算 landscape（本身就能正常顯示）
  const isLandscape = !isPortrait && device !== 'desktop'
  return { device, isLandscape }
}

export function useResponsive(): ResponsiveInfo {
  const [info, setInfo] = useState<DeviceInfo>(getDeviceInfo)

  useEffect(() => {
    const onResize = () => {
      // orientationchange 延遲才能拿到正確尺寸
      setTimeout(() => setInfo(getDeviceInfo()), 100)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  return useMemo((): ResponsiveInfo => {
    const { device, isLandscape } = info
    const dpr: [number, number] = device === 'mobile' ? [1, 1.5] : [1, 2]
    const textScale = device === 'mobile' ? 0.55 : device === 'tablet' ? 0.7 : 0.8

    return {
      device,
      isLandscape,
      fov: 58,
      camPos: [0, 12, 10],
      camTarget: [0, 0, 0],
      textScale,
      dpr,
    }
  }, [info])
}
