/**
 * HTML / DOM 層 UI 元件
 *
 * - TransitionOverlay : 過場幕（遮蔽載入 / 重啟不合理畫面）
 * - Thumbnail3D       : 英雄縮圖
 * - ThumbnailList     : 英雄選擇欄
 * - ToastMessage      : 浮動提示訊息
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { RawHeroData } from '../types'

/* ────────────────────────────
   TransitionOverlay
   ──────────────────────────── */

interface TransitionOverlayProps {
  visible: boolean
  fading: boolean
  text: string
  progress?: number | null
}

/** 過場全螢幕遮罩（含 CRT 掃描線 + 載入進度條） */
export function TransitionOverlay({ visible, fading, text, progress = null }: TransitionOverlayProps) {
  if (!visible) return null

  const normalizedProgress =
    typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        background: 'radial-gradient(ellipse at center, #1a0505 0%, #050000 70%, #000 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fading ? undefined : 1,
        animation: fading ? 'curtainFadeOut 1s ease-in forwards' : undefined,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* CRT 掃描線 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.03) 2px, rgba(255,0,0,0.03) 4px)',
          pointerEvents: 'none',
        }}
      />
      {/* 移動掃描光條 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '120px',
          background: 'linear-gradient(180deg, transparent, rgba(255,0,0,0.07), transparent)',
          animation: 'scanDown 3s linear infinite',
          pointerEvents: 'none',
        }}
      />
      {/* 暗角 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div className="transition-text">{text}</div>

      {/* 進度條外框 */}
      <div
        style={{
          width: 'clamp(120px, 30vw, 200px)',
          height: '2px',
          background: 'rgba(80,0,0,0.5)',
          marginTop: '24px',
          overflow: 'hidden',
          borderRadius: '1px',
          zIndex: 1,
        }}
      >
        {normalizedProgress === null ? (
          <div
            style={{
              width: '40%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, #ff2200, transparent)',
              animation: 'loadingSlide 1.5s ease-in-out infinite',
            }}
          />
        ) : (
          <div
            style={{
              width: `${normalizedProgress * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #aa1100, #ff2200)',
              transition: 'width 180ms ease-out',
            }}
          />
        )}
      </div>

      {normalizedProgress !== null && (
        <div
          style={{
            marginTop: '10px',
            color: 'rgba(255, 120, 120, 0.9)',
            fontSize: '12px',
            letterSpacing: '0.08em',
          }}
        >
          {Math.round(normalizedProgress * 100)}%
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────
   Thumbnail3D
   ──────────────────────────── */

interface Thumbnail3DProps {
  modelId: string
}

/** 以 PNG 縮圖顯示英雄（若無縮圖顯示 fallback 文字） */
export function Thumbnail3D({ modelId }: Thumbnail3DProps) {
  const thumbUrl = `${import.meta.env.BASE_URL}models/${modelId}/thumbnail.png`
  const [imgReady, setImgReady] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    let mounted = true
    const img = new Image()
    img.onload = () => {
      if (!mounted) return
      setImgReady(true)
      setImgFailed(false)
    }
    img.onerror = () => {
      if (!mounted) return
      setImgReady(false)
      setImgFailed(true)
    }
    img.src = thumbUrl
    return () => {
      mounted = false
    }
  }, [thumbUrl])

  return (
    <div
      className="thumb-canvas"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {imgReady ? (
        <img
          src={thumbUrl}
          alt={modelId}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '12px',
            textAlign: 'center',
            padding: '6px',
          }}
        >
          {imgFailed ? '無縮圖' : '載入中...'}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────
   ThumbnailList
   ──────────────────────────── */

interface ThumbnailListProps {
  heroes: RawHeroData[]
  onThumbClick?: (hero: RawHeroData) => void
  selectedKeys?: string[]
  canAdjust?: boolean
}

/** 底部英雄選擇欄（可橫向捲動） */
export function ThumbnailList({
  heroes = [],
  onThumbClick,
  selectedKeys = [],
  canAdjust = false,
}: ThumbnailListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ active: false, startX: 0, scrollStart: 0, moved: false })

  // 桌面端：垂直滾輪 → 水平捲動（必須用原生 listener 設 passive:false 才能 preventDefault）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [heroes.length]) // heroes 變化時重新綁定

  // 桌面端：按住拖曳滑動 + 點擊判定
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const ds = dragState.current

    const onDown = (e: PointerEvent) => {
      ds.active = true
      ds.startX = e.clientX
      ds.scrollStart = el.scrollLeft
      ds.moved = false
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }

    const onMove = (e: PointerEvent) => {
      if (!ds.active) return
      const dx = e.clientX - ds.startX
      if (Math.abs(dx) > 3) ds.moved = true
      el.scrollLeft = ds.scrollStart - dx
    }

    const onUp = (e: PointerEvent) => {
      const wasDrag = ds.moved
      ds.active = false
      ds.moved = false
      el.releasePointerCapture(e.pointerId)
      el.style.cursor = 'grab'

      // 沒拖曳 → 點擊：暫時啟用子元素 pointer-events 來找到卡片
      if (!wasDrag && canAdjust && onThumbClick) {
        const cards = el.querySelectorAll<HTMLElement>('.thumb-card')
        cards.forEach(c => c.style.pointerEvents = 'auto')
        const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
        cards.forEach(c => c.style.pointerEvents = '')
        const card = hit?.closest('.thumb-card') as HTMLElement | null
        if (card) {
          const idx = Number(card.dataset.thumbIdx)
          if (!isNaN(idx) && heroes[idx]) onThumbClick(heroes[idx])
        }
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroes, canAdjust, onThumbClick])

  if (heroes.length === 0) return null

  return (
    <div className={`thumb-bar ${canAdjust ? 'setup-mode' : 'locked-mode'}`}>
      <div
        ref={scrollRef}
        className="thumb-scroll-container"
        style={{ cursor: 'grab' }}
      >
        {heroes.map((h, i) => {
          // 解析 modelId
          const rawId = String(
            h._modelId || h.ModelID || h.HeroID || h.ModelId || h.Model || h.id || h.Name || '',
          ).trim()
          const zombieMatch = rawId.match(/zombie[_-]?(\d+)/i)
          const numberMatch = rawId.match(/\d+/)
          const modelId = zombieMatch
            ? `zombie_${zombieMatch[1]}`
            : numberMatch
              ? `zombie_${numberMatch[0]}`
              : `zombie_${i + 1}`

          const keyRaw = h.HeroID ?? h.id ?? h.ModelID ?? h.Name ?? h._modelId
          const heroKey = keyRaw != null ? String(keyRaw).trim() : `${modelId}_${i}`
          const isSelected = selectedKeys.includes(heroKey)

          return (
            <div
              key={heroKey}
              data-thumb-idx={i}
              className={`thumb-card ${canAdjust ? '' : 'disabled'}`}
            >
              <Thumbnail3D modelId={modelId} />
              <div className="thumb-name">{h.Name || `喪屍 ${i + 1}`}</div>
              {isSelected && (
                <div className="selected-checkmark">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9,16.17L4.83,12l-1.42,1.41L9,19L21,7l-1.41-1.41L9,16.17z"
                    />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!canAdjust && <div className="thumb-lock-hint">僅可在進入屠殺前調整上陣英雄</div>}
    </div>
  )
}

/* ────────────────────────────
   ToastMessage — 浮動提示訊息
   ──────────────────────────── */

interface ToastItem {
  id: number
  text: string
}

/** 可呼叫 showToast 的 hook，回傳 { showToast, toastElements } */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((text: string) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, text }])
  }, [])

  /* 直接回傳 JSX，不包成 inline component（避免 state 變動時整棵 tree 被 unmount） */
  const toastElements = toasts.map((t) => (
    <div
      key={t.id}
      className="toast-item"
      onAnimationEnd={() => removeToast(t.id)}
    >
      {t.text}
    </div>
  ))

  return { showToast, toastElements } as const
}
