/**
 * DragPlane — 拖曳平面（R3F 子元件）
 *
 * 在拖曳時攔截指標事件並投射到 y=1.25 平面。
 */

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface DragPlaneProps {
  enabled: boolean
  dragPosRef: React.RefObject<THREE.Vector3>
  dragPointerIdRef: React.RefObject<number | null>
  onDragEnd: (point: THREE.Vector3 | null) => void
}

export function DragPlane({ enabled, dragPosRef, dragPointerIdRef, onDragEnd }: DragPlaneProps) {
  const { gl, camera } = useThree()

  useEffect(() => {
    if (!enabled) return

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.25)
    const tmpV = new THREE.Vector3()
    const ray = new THREE.Raycaster()

    const project = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = -((clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(new THREE.Vector2(x, y), camera)
      return ray.ray.intersectPlane(plane, tmpV)
    }

    const onMove = (e: PointerEvent) => {
      const ip = project(e.clientX, e.clientY)
      if (ip) dragPosRef.current.copy(ip)
    }

    const onUp = (e: PointerEvent) => {
      const ip = project(e.clientX, e.clientY)
      onDragEnd(ip ?? null)
      try {
        if (dragPointerIdRef.current != null) {
          gl.domElement.releasePointerCapture(dragPointerIdRef.current)
          dragPointerIdRef.current = null
        }
      } catch { /* ignore */ }
    }

    gl.domElement.addEventListener('pointermove', onMove)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    try {
      if (dragPointerIdRef.current != null) {
        gl.domElement.setPointerCapture(dragPointerIdRef.current)
      }
    } catch { /* ignore */ }

    return () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try {
        if (dragPointerIdRef.current != null) {
          gl.domElement.releasePointerCapture(dragPointerIdRef.current)
          dragPointerIdRef.current = null
        }
      } catch { /* ignore */ }
    }
  }, [enabled, gl, camera, dragPosRef, dragPointerIdRef, onDragEnd])

  return null
}
