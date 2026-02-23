/**
 * useResponsive — 裝置分級 hook
 *
 * 偵測 mobile / tablet / desktop 及直式 / 橫式，
 * 回傳 FOV、鏡頭位置、文字縮放、DPR 等即用設定。
 */

import { useState, useEffect, useMemo } from 'react'
import type { DeviceType, ResponsiveInfo } from '../types'

interface RawInfo {
  device: DeviceType
  isPortrait: boolean
  aspect: number
}

function getInfo(): RawInfo {
  const w = window.innerWidth
  const h = window.innerHeight
  const isPortrait = h > w
  const aspect = w / h
  let device: DeviceType
  if (w <= 480 || (isPortrait && w <= 600)) device = 'mobile'
  else if (w <= 1024 || (isPortrait && w <= 800)) device = 'tablet'
  else device = 'desktop'
  return { device, isPortrait, aspect }
}

export function useResponsive(): ResponsiveInfo {
  const [info, setInfo] = useState<RawInfo>(getInfo)

  useEffect(() => {
    const onResize = () => setInfo(getInfo())
    window.addEventListener('resize', onResize)

    // orientationchange 需延遲才能拿到正確尺寸
    const onOrient = () => setTimeout(onResize, 150)
    window.addEventListener('orientationchange', onOrient)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onOrient)
    }
  }, [])

  return useMemo((): ResponsiveInfo => {
    const { device, isPortrait } = info

    if (device === 'mobile' && isPortrait) {
      return { device, isPortrait, fov: 72, camPos: [0, 6, 18], camTarget: [0, 2.6, 0], textScale: 0.55, dpr: [1, 1.5] }
    }
    if (device === 'mobile') {
      return { device, isPortrait, fov: 60, camPos: [0, 4.5, 15], camTarget: [0, 2.6, 0], textScale: 0.6, dpr: [1, 1.5] }
    }
    if (device === 'tablet' && isPortrait) {
      return { device, isPortrait, fov: 62, camPos: [0, 5.5, 16], camTarget: [0, 2.6, 0], textScale: 0.7, dpr: [1, 2] }
    }
    if (device === 'tablet') {
      return { device, isPortrait, fov: 50, camPos: [0, 4, 13], camTarget: [0, 2.6, 0], textScale: 0.8, dpr: [1, 2] }
    }

    // desktop
    return { device, isPortrait: false, fov: 45, camPos: [0, 3.8, 13], camTarget: [0, 2.6, 0], textScale: 1.0, dpr: [1, 2] }
  }, [info])
}
