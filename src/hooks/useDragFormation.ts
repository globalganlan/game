/**
 * useDragFormation — 拖曳陣型 + 英雄上/下陣
 *
 * 從 App.tsx 抽出，管理：
 *   - 拖曳狀態（selectedSlot, dragging, dragSourceRef 等）
 *   - startDrag / endDragAt（拖曳開始/結束）
 *   - handleThumbnailClick（縮圖點擊上/下陣）
 *   - selectedKeys（目前上陣中的 hero key 列表）
 */
import { useState, useRef, useCallback } from 'react'
import * as THREE from 'three'
import type { RawHeroData, SlotHero } from '../types'
import { PLAYER_SLOT_POSITIONS } from '../game/constants'
import { normalizeModelId } from '../game/helpers'

interface UseDragFormationParams {
  canAdjustFormation: boolean
  playerSlots: (SlotHero | null)[]
  updatePlayerSlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  heroesList: RawHeroData[]
  showToast: (msg: string) => void
}

export function useDragFormation({
  canAdjustFormation, playerSlots, updatePlayerSlots, heroesList, showToast,
}: UseDragFormationParams) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const dragSourceRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragPosRef = useRef(new THREE.Vector3())
  const dragOffsetRef = useRef(new THREE.Vector3())
  const dragPointerIdRef = useRef<number | null>(null)

  const clearDrag = useCallback(() => {
    dragSourceRef.current = null
    setSelectedSlot(null)
    setDragging(false)
  }, [])

  const findNearestPlayerSlot = (point: THREE.Vector3) => {
    let best = -1, bestD = Infinity
    PLAYER_SLOT_POSITIONS.forEach((p, i) => {
      const d = Math.hypot(p[0] - point.x, p[2] - point.z)
      if (d < bestD) { bestD = d; best = i }
    })
    return { idx: best, dist: bestD }
  }

  const endDragAt = useCallback((point: THREE.Vector3 | null) => {
    if (!canAdjustFormation) { clearDrag(); return }
    const s = dragSourceRef.current
    if (s == null) { clearDrag(); return }
    const dropPoint = point || dragPosRef.current
    const { idx, dist } = findNearestPlayerSlot(dropPoint)
    if (idx !== -1 && dist <= 1.5) {
      updatePlayerSlots((prev) => {
        const ns = [...prev]
        const tmp = ns[s]
        ns[s] = ns[idx]
        ns[idx] = tmp
        return ns
      })
    }
    clearDrag()

  }, [canAdjustFormation, updatePlayerSlots, clearDrag])

  const startDrag = useCallback((i: number, pointerOrPoint: unknown) => {
    if (!canAdjustFormation) return
    dragSourceRef.current = i
    setDragging(true)
    const basePos = new THREE.Vector3(...PLAYER_SLOT_POSITIONS[i])
    let ip = basePos
    if (pointerOrPoint && typeof pointerOrPoint === 'object') {
      const evt = pointerOrPoint as { point?: THREE.Vector3; pointerId?: number }
      if (evt.point) ip = evt.point
      if (evt.pointerId != null) dragPointerIdRef.current = evt.pointerId
    }
    const projected = ip.clone()
    projected.y = 0
    dragPosRef.current.copy(projected)
    dragOffsetRef.current.copy(new THREE.Vector3().subVectors(basePos, dragPosRef.current))
  }, [canAdjustFormation])

  /* ── 英雄縮圖點擊 ── */
  const handleThumbnailClick = useCallback((h: RawHeroData) => {
    if (!canAdjustFormation) return
    const heroKey = String(h.HeroID ?? h.id ?? h.ModelID ?? h.Name ?? h._modelId ?? '').trim()
    const existsIdx = playerSlots.findIndex((s) => {
      if (!s) return false
      const k = String(s.HeroID ?? s.id ?? s.ModelID ?? s.Name ?? s._modelId ?? '').trim()
      return k && heroKey && k === heroKey
    })
    if (existsIdx !== -1) {
      updatePlayerSlots((prev) => { const ns = [...prev]; ns[existsIdx] = null; return ns })
      showToast(`${h.Name || '英雄'} 已下陣`)
      return
    }
    const priorityOrder = [0, 1, 2, 3, 4, 5]
    let targetIndex = selectedSlot ?? -1
    if (targetIndex < 0) {
      for (const pi of priorityOrder) {
        if (!playerSlots[pi]) { targetIndex = pi; break }
      }
    }
    if (targetIndex < 0) { showToast('上陣欄位已滿，請先下陣一位英雄'); return }
    const idx = heroesList.indexOf(h)
    const mid = normalizeModelId(h, idx >= 0 ? idx : 0)
    updatePlayerSlots((prev) => {
      const ns = [...prev]
      ns[targetIndex] = {
        ...h,
        currentHP: (h.HP ?? 1) as number,
        _uid: `${mid}_player_${targetIndex}`,
        _modelId: mid,
        ModelID: mid,
      }
      return ns
    })
    showToast(`${h.Name || '英雄'} 已上陣`)
    setSelectedSlot(null)
  }, [canAdjustFormation, playerSlots, updatePlayerSlots, heroesList, showToast, selectedSlot])

  const selectedKeys = playerSlots
    .filter(Boolean)
    .map((h) => String((h as SlotHero).HeroID ?? (h as SlotHero).id ?? (h as SlotHero).ModelID ?? (h as SlotHero).Name ?? (h as SlotHero)._modelId ?? '').trim())
    .filter(Boolean)

  return {
    selectedSlot, setSelectedSlot,
    dragging, dragSourceRef,
    dragPosRef, dragOffsetRef, dragPointerIdRef,
    startDrag, endDragAt, handleThumbnailClick,
    selectedKeys,
  }
}
