/**
 * 小型 3D 元件 — DamagePopup / HealthBar3D / SlotMarker / ResponsiveCamera
 *
 * 這些元件都在 R3F Canvas 內使用。
 */

import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { Vector3Tuple } from 'three'

/* ────────────────────────────
   工具：圓角矩形 Shape
   ──────────────────────────── */

function makeRoundedRect(w: number, h: number, r: number): THREE.Shape {
  r = Math.min(r, w / 2, h / 2)
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2 + r, -h / 2)
  shape.lineTo(w / 2 - r, -h / 2)
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  shape.lineTo(w / 2, h / 2 - r)
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  shape.lineTo(-w / 2 + r, h / 2)
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  shape.lineTo(-w / 2, -h / 2 + r)
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return shape
}

/* ────────────────────────────
   ResponsiveCamera
   ──────────────────────────── */

interface ResponsiveCameraProps {
  fov: number
  position: Vector3Tuple
  target: Vector3Tuple
}

/** 根據螢幕自動調整鏡頭 FOV 與位置 */
export function ResponsiveCamera({ fov, position, target }: ResponsiveCameraProps) {
  const { camera } = useThree()

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = fov
    cam.position.set(...position)
    cam.updateProjectionMatrix()
  }, [fov, position, camera])

  return (
    <OrbitControls
      target={target}
      enableRotate={false}
      enablePan={false}
      enableZoom={false}
    />
  )
}

/* ────────────────────────────
   DamagePopup
   ──────────────────────────── */

interface DamagePopupProps {
  value: number
  position: Vector3Tuple
  textScale?: number
}

/** 浮動傷害數字（向上飄移 + 淡出） */
export function DamagePopup({ value, position, textScale = 1 }: DamagePopupProps) {
  const ref = useRef<THREE.Group>(null)
  const [opacity, setOpacity] = useState(1)

  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.position.y += delta * 0.2
      setOpacity((prev) => Math.max(0, prev - delta * 0.8))
    }
  })

  if (opacity <= 0) return null

  return (
    <Billboard position={position} ref={ref}>
      <Text
        fontSize={0.8 * textScale}
        color="#ff0000"
        outlineColor="white"
        outlineWidth={0.05}
        fillOpacity={opacity}
        outlineOpacity={opacity}
      >
        -{value}
      </Text>
    </Billboard>
  )
}

/* ────────────────────────────
   HealthBar3D
   ──────────────────────────── */

interface HealthBar3DProps {
  position: Vector3Tuple
  ratio: number
  width?: number
  height?: number
  color?: string
}

/** 3D 血條：背景灰 + 前景色，始終面向鏡頭（圓角藥丸形） */
export function HealthBar3D({
  position,
  ratio,
  width = 1.6,
  height = 0.12,
  color = '#1aff50',
}: HealthBar3DProps) {
  const bgMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#333', transparent: true, opacity: 0.6, depthTest: false }),
    [],
  )
  const fgMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }),
    [color],
  )

  const clampedRatio = Math.max(0, Math.min(1, ratio))
  const radius = height * 0.5

  const bgGeo = useMemo(
    () => new THREE.ShapeGeometry(makeRoundedRect(width, height, radius)),
    [width, height, radius],
  )
  const fgGeo = useMemo(() => {
    if (clampedRatio <= 0) return null
    const fgW = width * clampedRatio
    const fgH = height * 0.8
    return new THREE.ShapeGeometry(makeRoundedRect(fgW, fgH, Math.min(radius, fgW / 2, fgH / 2)))
  }, [width, height, clampedRatio, radius])

  return (
    <Billboard position={position} renderOrder={16}>
      <mesh position={[0, 0, 0]} geometry={bgGeo} material={bgMat} renderOrder={16} />
      {clampedRatio > 0 && fgGeo && (
        <mesh
          position={[(clampedRatio - 1) * width * 0.5, 0, 0.001]}
          geometry={fgGeo}
          material={fgMat}
          renderOrder={17}
        />
      )}
    </Billboard>
  )
}

/* ────────────────────────────
   SlotMarker
   ──────────────────────────── */

interface SlotMarkerProps {
  position: Vector3Tuple
  selected?: boolean
  color?: string
}

/** 地面的圓環格子標記（視覺用，不可互動） */
export function SlotMarker({ position, selected = false, color = '#ffffff' }: SlotMarkerProps) {
  const ref = useRef<THREE.Mesh>(null)

  const SQUASH = 0.6 // Y 軸壓扁比例，讓圓環呈橢圓

  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.getElapsedTime()
    const pulse = selected ? 1 + Math.sin(t * 6) * 0.06 : 1
    ref.current.scale.set(pulse, SQUASH * pulse, pulse)
  })

  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[position[0], position[1] + 0.02, position[2]]}
    >
      <ringGeometry args={[0.75, 0.9, 64]} />
      <meshBasicMaterial
        color={selected ? '#1aff50' : color}
        transparent
        opacity={selected ? 0.95 : 0.5}
        depthWrite={false}
        depthTest
      />
    </mesh>
  )
}
