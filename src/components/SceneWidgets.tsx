/**
 * 小型 3D 元件 — DamagePopup / HealthBar3D / SlotMarker / ResponsiveCamera / SkillToast3D / ElementHint3D / PassiveHint3D / BuffIcons3D / BuffApplyToast3D
 *
 * 這些元件都在 R3F Canvas 內使用。
 */

import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { Vector3Tuple } from 'three'
import type { StatusEffect, StatusType } from '../domain/types'
import type { VfxType } from '../types'

import { preloadFont } from 'troika-three-text'
import { preload as suspendPreload } from 'suspend-react'

/** 本機中文字型（避免等待 CDN 下載） */
export const LOCAL_FONT = `${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.ttf`

/**
 * 預載 troika 字型到 suspend-react 快取。
 * 在 Canvas 掛載時呼叫一次，避免首次渲染 <Text> 時觸發 Suspense。
 * drei v10 的 Text 內部使用 suspend(['troika-text', font, characters], ...) —
 * 若字型未預載，throw Promise 會觸發外層 Suspense 邊界。
 */
export function preloadTroikaFont(): void {
  suspendPreload(
    () => new Promise<void>(res => preloadFont({ font: LOCAL_FONT }, res)),
    ['troika-text', LOCAL_FONT, undefined],
  )
}

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
  damageType?: import('../types').DamageDisplayType
}

/** 浮動傷害數字（向上飄移 + 淡出） */
export function DamagePopup({ value, position, textScale = 1, damageType }: DamagePopupProps) {
  const ref = useRef<THREE.Group>(null)
  const [opacity, setOpacity] = useState(1)

  const isCrit = damageType === 'crit'
  const fadeSpeed = isCrit ? 0.6 : 0.8  // 暴擊飄字停留更久

  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.position.y += delta * (isCrit ? 0.25 : 0.2)
      setOpacity((prev) => Math.max(0, prev - delta * fadeSpeed))
    }
  })

  if (opacity <= 0) return null

  const isHeal = value < 0
  const displayValue = Math.abs(value)
  let displayText: string
  let textColor: string
  let fontSize = 1.0

  if (isHeal) {
    displayText = `+${displayValue}`
    textColor = '#00ff88'
  } else if (value === 0) {
    displayText = '閃避'
    textColor = '#aaaaaa'
  } else if (isCrit) {
    displayText = `💥${displayValue}`
    textColor = '#ffaa00'
    fontSize = 1.35  // 暴擊放大 35%
  } else {
    displayText = `-${displayValue}`
    textColor = '#ff0000'
  }

  return (
    <Billboard position={position} ref={ref}>
      <Text
        font={LOCAL_FONT}
        fontSize={fontSize * textScale}
        color={textColor}
        outlineColor={isCrit ? '#663300' : 'white'}
        outlineWidth={isCrit ? 0.08 : 0.05}
        fillOpacity={opacity}
        outlineOpacity={opacity}
      >
        {displayText}
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
   EnergyBar3D
   ──────────────────────────── */

interface EnergyBar3DProps {
  position: Vector3Tuple
  ratio: number
  width?: number
  height?: number
}

/** 3D 能量條：金黃色，滿時發光脈衝，始終面向鏡頭 */
export function EnergyBar3D({
  position,
  ratio,
  width = 1.2,
  height = 0.08,
}: EnergyBar3DProps) {
  const clampedRatio = Math.max(0, Math.min(1, ratio))
  const isFull = clampedRatio >= 1
  const radius = height * 0.5

  const fgRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  const bgMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#222', transparent: true, opacity: 0.5, depthTest: false }),
    [],
  )
  const fgMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: isFull ? '#ffd43b' : '#4dabf7', transparent: true, opacity: 0.85, depthTest: false }),
    [isFull],
  )
  const glowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true, opacity: 0, depthTest: false }),
    [],
  )

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
  const glowGeo = useMemo(
    () => new THREE.ShapeGeometry(makeRoundedRect(width * 1.15, height * 2.2, radius * 2)),
    [width, height, radius],
  )

  // 滿時脈衝動畫
  useFrame((state) => {
    if (!isFull) {
      if (glowRef.current) glowMat.opacity = 0
      if (fgRef.current) fgRef.current.scale.set(1, 1, 1)
      return
    }
    const t = state.clock.getElapsedTime()
    const pulse = 0.35 + Math.sin(t * 4) * 0.25 // 0.1 ~ 0.6
    glowMat.opacity = pulse
    if (fgRef.current) {
      const s = 1 + Math.sin(t * 4) * 0.06
      fgRef.current.scale.set(s, s, 1)
    }
  })

  return (
    <Billboard position={position} renderOrder={16}>
      {/* 滿時發光光暈 */}
      {isFull && <mesh ref={glowRef} geometry={glowGeo} material={glowMat} renderOrder={15} />}
      <mesh geometry={bgGeo} material={bgMat} renderOrder={16} />
      {clampedRatio > 0 && fgGeo && (
        <mesh
          ref={fgRef}
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

/* ────────────────────────────
   SkillToast3D — 大招名稱浮動標示
   ──────────────────────────── */

interface SkillToast3DProps {
  heroName: string
  skillName: string
  position: Vector3Tuple
  textScale?: number
}

/** 攻擊者頭頂顯示技能名稱（自動上浮淡出，金色光暈背景） */
export function SkillToast3D({ heroName, skillName, position, textScale = 1 }: SkillToast3DProps) {
  const ref = useRef<THREE.Group>(null)
  const [opacity, setOpacity] = useState(1)
  const elapsed = useRef(0)

  useFrame((_state, delta) => {
    if (ref.current) {
      elapsed.current += delta
      ref.current.position.y += delta * 0.35
      // 前 0.6 秒保持完全不透明，之後快速淡出
      if (elapsed.current > 0.6) {
        setOpacity((prev) => Math.max(0, prev - delta * 0.8))
      }
      // 開頭彈入動畫：前 0.15 秒放大到 1.15x 再縮回
      const t = elapsed.current
      const scale = t < 0.08 ? 1 + t / 0.08 * 0.15 : t < 0.2 ? 1.15 - (t - 0.08) / 0.12 * 0.15 : 1
      ref.current.scale.set(scale, scale, scale)
    }
  })

  if (opacity <= 0) return null

  const bgW = Math.max(skillName.length, heroName.length) * 0.38 * textScale + 0.6
  const bgH = 1.1 * textScale

  return (
    <Billboard position={position} ref={ref} renderOrder={30}>
      {/* 光暈背景 */}
      <mesh position={[0, 0.25 * textScale, -0.01]} renderOrder={30}>
        <planeGeometry args={[bgW, bgH]} />
        <meshBasicMaterial
          color="#ffa500"
          transparent
          opacity={opacity * 0.3}
          depthTest={false}
        />
      </mesh>
      {/* 英雄名 */}
      <Text
        font={LOCAL_FONT}
        fontSize={0.32 * textScale}
        color="#ffd866"
        outlineColor="#000"
        outlineWidth={0.05}
        fillOpacity={opacity}
        outlineOpacity={opacity}
        anchorY="bottom"
        renderOrder={31}
      >
        {heroName}
        <meshBasicMaterial transparent depthTest={false} />
      </Text>
      {/* 技能名（更大更亮） */}
      <Text
        font={LOCAL_FONT}
        fontSize={0.55 * textScale}
        color="#fff"
        outlineColor="#ff6600"
        outlineWidth={0.06}
        fillOpacity={opacity}
        outlineOpacity={opacity}
        position={[0, 0.5 * textScale, 0]}
        anchorY="bottom"
        renderOrder={31}
      >
        {skillName}
        <meshBasicMaterial transparent depthTest={false} />
      </Text>
    </Billboard>
  )
}

/* ────────────────────────────
   PassiveHint3D — 被動觸發浮動標示
   ──────────────────────────── */

interface PassiveHint3DProps {
  skillName: string
  position: Vector3Tuple
  textScale?: number
}

/** 英雄頭頂顯示被動觸發名稱（紫色上浮淡出） */
export function PassiveHint3D({ skillName, position, textScale = 1 }: PassiveHint3DProps) {
  const ref = useRef<THREE.Group>(null)
  const [opacity, setOpacity] = useState(1)
  const elapsed = useRef(0)

  useFrame((_state, delta) => {
    if (ref.current) {
      elapsed.current += delta
      ref.current.position.y += delta * 0.13
      // 前 0.4 秒保持不透明，之後淡出
      if (elapsed.current > 0.4) {
        setOpacity((prev) => Math.max(0, prev - delta * 0.6))
      }
      // 開頭微彈（前 0.1s 放大到 1.1x 再回縮）
      const t = elapsed.current
      const scale = t < 0.05 ? 1 + t / 0.05 * 0.1 : t < 0.15 ? 1.1 - (t - 0.05) / 0.1 * 0.1 : 1
      ref.current.scale.set(scale, scale, scale)
    }
  })

  if (opacity <= 0) return null

  return (
    <Billboard position={position} ref={ref} renderOrder={29}>
      <Text
        font={LOCAL_FONT}
        fontSize={0.48 * textScale}
        color="#d4a0ff"
        outlineColor="#3a0066"
        outlineWidth={0.04}
        fillOpacity={opacity}
        outlineOpacity={opacity}
        renderOrder={29}
      >
        {'★ ' + skillName}
        <meshBasicMaterial transparent depthTest={false} />
      </Text>
    </Billboard>
  )
}

/* ────────────────────────────
   STATUS_ICONS_3D — 狀態 emoji + 分類（3D 用）
   ──────────────────────────── */

const STATUS_ICONS_3D: Record<string, { icon: string; isBuff: boolean }> = {
  atk_up:        { icon: '攻↑', isBuff: true },
  def_up:        { icon: '防↑', isBuff: true },
  spd_up:        { icon: '速↑', isBuff: true },
  crit_rate_up:  { icon: '暴↑', isBuff: true },
  crit_dmg_up:   { icon: '爆↑', isBuff: true },
  dmg_reduce:    { icon: '減傷', isBuff: true },
  shield:        { icon: '盾',   isBuff: true },
  regen:         { icon: '回血', isBuff: true },
  energy_boost:  { icon: '氣↑', isBuff: true },
  dodge_up:      { icon: '閃↑', isBuff: true },
  reflect:       { icon: '彈',   isBuff: true },
  taunt:         { icon: '嘲諷', isBuff: true },
  immunity:      { icon: '免疫', isBuff: true },
  atk_down:      { icon: '攻↓', isBuff: false },
  def_down:      { icon: '防↓', isBuff: false },
  spd_down:      { icon: '速↓', isBuff: false },
  crit_rate_down:{ icon: '暴↓', isBuff: false },
  dot_burn:      { icon: '燒',   isBuff: false },
  dot_poison:    { icon: '毒',   isBuff: false },
  dot_bleed:     { icon: '血',   isBuff: false },
  stun:          { icon: '暈',   isBuff: false },
  freeze:        { icon: '凍',   isBuff: false },
  silence:       { icon: '默',   isBuff: false },
  fear:          { icon: '懼',   isBuff: false },
}

const STATUS_LABELS: Record<string, string> = {
  atk_up:        '攻擊提升',
  def_up:        '防禦提升',
  spd_up:        '速度提升',
  crit_rate_up:  '暴擊率提升',
  crit_dmg_up:   '暴擊傷害提升',
  dmg_reduce:    '減傷',
  shield:        '護盾',
  regen:         '再生',
  energy_boost:  '能量提升',
  dodge_up:      '閃避提升',
  reflect:       '反彈',
  taunt:         '嘲諷',
  immunity:      '免疫',
  atk_down:      '攻擊下降',
  def_down:      '防禦下降',
  spd_down:      '速度下降',
  crit_rate_down:'暴擊率下降',
  dot_burn:      '灼燒',
  dot_poison:    '中毒',
  dot_bleed:     '流血',
  stun:          '暈眩',
  freeze:        '凍結',
  silence:       '沉默',
  fear:          '恐懼',
  cleanse:       '淨化',
}

/* ────────────────────────────
   BuffIcons3D — 英雄頭頂 Buff/Debuff Icon 列
   ──────────────────────────── */

interface BuffIcons3DProps {
  effects: StatusEffect[]
  textScale?: number
}

/** 在英雄頭頂橫排顯示目前身上的 Buff（綠底）/ Debuff（紅底）icon（純 3D Billboard mesh + troika Text） */
export function BuffIcons3D({ effects, textScale = 1 }: BuffIcons3DProps) {
  const MAX_VISIBLE = 8
  const overflow = effects.length > MAX_VISIBLE ? effects.length - (MAX_VISIBLE - 1) : 0
  const visible = overflow > 0 ? effects.slice(0, MAX_VISIBLE - 1) : effects.slice(0, MAX_VISIBLE)

  if (visible.length === 0) return null

  const boxSize = 0.4 * textScale
  const gap = 0.06 * textScale
  const count = visible.length + (overflow > 0 ? 1 : 0)
  const totalWidth = count * boxSize + (count - 1) * gap
  const startX = -totalWidth / 2 + boxSize / 2

  // 背景材質（綠 buff / 紅 debuff / 灰 overflow）
  const buffBg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.75, depthTest: false }), [])
  const debuffBg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.75, depthTest: false }), [])
  const overflowBg = useMemo(() => new THREE.MeshBasicMaterial({ color: '#6b7280', transparent: true, opacity: 0.80, depthTest: false }), [])
  const boxGeo = useMemo(() => new THREE.PlaneGeometry(boxSize, boxSize), [boxSize])

  return (
    <Billboard position={[0, 3.2, 0]} renderOrder={15}>
      {visible.map((eff, i) => {
        const cfg = STATUS_ICONS_3D[eff.type]
        if (!cfg) return null
        const x = startX + i * (boxSize + gap)
        const label = cfg.icon
        // 根據字數選擇字體大小
        const fs = label.length <= 1
          ? boxSize * 0.65
          : label.length <= 2
            ? boxSize * 0.48
            : boxSize * 0.35
        return (
          <group key={eff.type} position={[x, 0, 0]}>
            <mesh geometry={boxGeo} material={cfg.isBuff ? buffBg : debuffBg} renderOrder={15} />
            <Text
              font={LOCAL_FONT}
              fontSize={fs}
              color="white"
              anchorX="center"
              anchorY="middle"
              position={[0, 0, 0.001]}
              renderOrder={16}
              /* @ts-expect-error troika depthTest */
              depthTest={false}
            >
              {label}
            </Text>
            {eff.stacks > 1 && (
              <Text
                font={LOCAL_FONT}
                fontSize={boxSize * 0.28}
                color="white"
                outlineColor="black"
                outlineWidth={0.015}
                anchorX="right"
                anchorY="bottom"
                position={[boxSize * 0.42, -boxSize * 0.42, 0.002]}
                renderOrder={17}
                /* @ts-expect-error troika depthTest */
                depthTest={false}
              >
                {`×${eff.stacks}`}
              </Text>
            )}
          </group>
        )
      })}
      {overflow > 0 && (
        <group position={[startX + visible.length * (boxSize + gap), 0, 0]}>
          <mesh geometry={boxGeo} material={overflowBg} renderOrder={15} />
          <Text
            font={LOCAL_FONT}
            fontSize={boxSize * 0.5}
            color="white"
            anchorX="center"
            anchorY="middle"
            position={[0, 0, 0.001]}
            renderOrder={16}
            /* @ts-expect-error troika depthTest */
            depthTest={false}
          >
            {`+${overflow}`}
          </Text>
        </group>
      )}
    </Billboard>
  )
}

/* ────────────────────────────
   BuffApplyToast3D — Buff/Debuff 施加漂浮文字
   ──────────────────────────── */

interface BuffApplyToast3DProps {
  effectType: StatusType
  isBuff: boolean
  position: Vector3Tuple
  textScale?: number
}

/** 被施加 Buff/Debuff 時顯示漂浮文字（綠色 = Buff，紅色 = Debuff） */
export function BuffApplyToast3D({ effectType, isBuff, position, textScale = 1 }: BuffApplyToast3DProps) {
  const ref = useRef<THREE.Group>(null)
  const [opacity, setOpacity] = useState(1)
  const elapsed = useRef(0)

  const label = STATUS_LABELS[effectType] || effectType

  useFrame((_state, delta) => {
    if (ref.current) {
      elapsed.current += delta
      ref.current.position.y += delta * 0.15
      // 前 0.3s 保持不透明，之後淡出
      if (elapsed.current > 0.3) {
        setOpacity((prev) => Math.max(0, prev - delta * 0.7))
      }
      // 開頭微彈
      const t = elapsed.current
      const scale = t < 0.05 ? 1 + t / 0.05 * 0.1 : t < 0.15 ? 1.1 - (t - 0.05) / 0.1 * 0.1 : 1
      ref.current.scale.set(scale, scale, scale)
    }
  })

  if (opacity <= 0) return null

  const textColor = isBuff ? '#4ade80' : '#f87171'
  const outColor = isBuff ? '#064e3b' : '#7f1d1d'

  return (
    <Billboard position={position} ref={ref} renderOrder={27}>
      <Text
        font={LOCAL_FONT}
        fontSize={0.55 * textScale}
        color={textColor}
        outlineColor={outColor}
        outlineWidth={0.04}
        fillOpacity={opacity}
        outlineOpacity={opacity}
        renderOrder={27}
      >
        {label}
        <meshBasicMaterial transparent depthTest={false} />
      </Text>
    </Billboard>
  )
}

/* ────────────────────────────
   HitBurstVFX — 攻擊命中粒子爆發
   ──────────────────────────── */

const BURST_COUNT = 18

/** 命中/暴擊時在目標位置爆發粒子 */
export function HitBurstVFX({ position, isCrit = false }: { position: Vector3Tuple; isCrit?: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const elapsed = useRef(0)
  const velocities = useMemo(() => {
    const v = new Float32Array(BURST_COUNT * 3)
    for (let i = 0; i < BURST_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.6
      const spd = 1.5 + Math.random() * 2.5
      v[i * 3] = Math.sin(phi) * Math.cos(theta) * spd
      v[i * 3 + 1] = Math.cos(phi) * spd + 1.0
      v[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * spd
    }
    return v
  }, [])
  const positions = useMemo(() => new Float32Array(BURST_COUNT * 3), [])
  const [done, setDone] = useState(false)

  useFrame((_s, delta) => {
    if (!ref.current || done) return
    elapsed.current += delta
    const t = elapsed.current
    if (t > 0.6) { setDone(true); return }
    const posArr = ref.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < BURST_COUNT; i++) {
      posArr[i * 3] = velocities[i * 3] * t
      posArr[i * 3 + 1] = velocities[i * 3 + 1] * t - 4.9 * t * t
      posArr[i * 3 + 2] = velocities[i * 3 + 2] * t
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    const mat = ref.current.material as THREE.PointsMaterial
    mat.opacity = Math.max(0, 1 - t / 0.6)
  })

  if (done) return null

  return (
    <points ref={ref} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={BURST_COUNT} />
      </bufferGeometry>
      <pointsMaterial
        color={isCrit ? '#ffaa00' : '#ff4422'}
        size={isCrit ? 0.18 : 0.12}
        transparent
        depthTest={false}
        sizeAttenuation
      />
    </points>
  )
}

/* ────────────────────────────
   HealVFX — 治療綠光上升粒子
   ──────────────────────────── */

const HEAL_COUNT = 14

export function HealVFX({ position }: { position: Vector3Tuple }) {
  const ref = useRef<THREE.Points>(null)
  const elapsed = useRef(0)
  const offsets = useMemo(() => {
    const o = new Float32Array(HEAL_COUNT * 3)
    for (let i = 0; i < HEAL_COUNT; i++) {
      const angle = (i / HEAL_COUNT) * Math.PI * 2
      const r = 0.3 + Math.random() * 0.4
      o[i * 3] = Math.cos(angle) * r
      o[i * 3 + 1] = Math.random() * 0.3
      o[i * 3 + 2] = Math.sin(angle) * r
    }
    return o
  }, [])
  const positions = useMemo(() => new Float32Array(HEAL_COUNT * 3), [])
  const [done, setDone] = useState(false)

  useFrame((_s, delta) => {
    if (!ref.current || done) return
    elapsed.current += delta
    const t = elapsed.current
    if (t > 0.8) { setDone(true); return }
    const posArr = ref.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < HEAL_COUNT; i++) {
      const angle = (i / HEAL_COUNT) * Math.PI * 2 + t * 3
      const r = 0.3 + Math.sin(t * 5 + i) * 0.15
      posArr[i * 3] = Math.cos(angle) * r
      posArr[i * 3 + 1] = offsets[i * 3 + 1] + t * 2.0
      posArr[i * 3 + 2] = Math.sin(angle) * r
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    const mat = ref.current.material as THREE.PointsMaterial
    mat.opacity = Math.max(0, 1 - t / 0.8)
  })

  if (done) return null

  return (
    <points ref={ref} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={HEAL_COUNT} />
      </bufferGeometry>
      <pointsMaterial color="#00ff88" size={0.1} transparent depthTest={false} sizeAttenuation />
    </points>
  )
}

/* ────────────────────────────
   BuffShimmerVFX — Buff 施加光點
   ──────────────────────────── */

const SHIMMER_COUNT = 10

export function BuffShimmerVFX({ position }: { position: Vector3Tuple }) {
  const ref = useRef<THREE.Points>(null)
  const elapsed = useRef(0)
  const positions = useMemo(() => new Float32Array(SHIMMER_COUNT * 3), [])
  const [done, setDone] = useState(false)

  useFrame((_s, delta) => {
    if (!ref.current || done) return
    elapsed.current += delta
    const t = elapsed.current
    if (t > 0.7) { setDone(true); return }
    const posArr = ref.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < SHIMMER_COUNT; i++) {
      const angle = (i / SHIMMER_COUNT) * Math.PI * 2 + t * 4
      const r = 0.5 + Math.sin(t * 8 + i * 0.7) * 0.3
      posArr[i * 3] = Math.cos(angle) * r
      posArr[i * 3 + 1] = 0.8 + Math.sin(t * 6 + i) * 0.4
      posArr[i * 3 + 2] = Math.sin(angle) * r
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    const mat = ref.current.material as THREE.PointsMaterial
    mat.opacity = Math.max(0, 1 - t / 0.7)
  })

  if (done) return null

  return (
    <points ref={ref} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={SHIMMER_COUNT} />
      </bufferGeometry>
      <pointsMaterial color="#66ccff" size={0.09} transparent depthTest={false} sizeAttenuation />
    </points>
  )
}

/* ────────────────────────────
   DotTickVFX — DOT 持續傷害粒子
   ──────────────────────────── */

const DOT_COUNT = 8

export function DotTickVFX({ position }: { position: Vector3Tuple }) {
  const ref = useRef<THREE.Points>(null)
  const elapsed = useRef(0)
  const positions = useMemo(() => new Float32Array(DOT_COUNT * 3), [])
  const [done, setDone] = useState(false)

  useFrame((_s, delta) => {
    if (!ref.current || done) return
    elapsed.current += delta
    const t = elapsed.current
    if (t > 0.5) { setDone(true); return }
    const posArr = ref.current.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < DOT_COUNT; i++) {
      const angle = (i / DOT_COUNT) * Math.PI * 2 + t * 5
      const r = 0.2 + t * 0.6
      posArr[i * 3] = Math.cos(angle) * r
      posArr[i * 3 + 1] = 0.5 + t * 1.5
      posArr[i * 3 + 2] = Math.sin(angle) * r
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    const mat = ref.current.material as THREE.PointsMaterial
    mat.opacity = Math.max(0, 1 - t / 0.5)
  })

  if (done) return null

  return (
    <points ref={ref} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={DOT_COUNT} />
      </bufferGeometry>
      <pointsMaterial color="#cc44ff" size={0.08} transparent depthTest={false} sizeAttenuation />
    </points>
  )
}

/* ────────────────────────────
   SkillFlash — 技能施放動態閃光
   ──────────────────────────── */

/** 技能施放時在攻擊者位置產生可見閃光爆發（發光球 + PointLight） */
export function SkillFlash({ position, color = '#ffffff', intensity = 6 }: { position: Vector3Tuple; color?: string; intensity?: number }) {
  const lightRef = useRef<THREE.PointLight>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const elapsed = useRef(0)
  const [done, setDone] = useState(false)

  useFrame((_s, delta) => {
    if (done) return
    elapsed.current += delta
    const t = elapsed.current
    if (t > 0.5) { setDone(true); return }
    // 快速升亮 → 緩慢衰減
    const ramp = t < 0.08 ? t / 0.08 : Math.max(0, 1 - (t - 0.08) / 0.42)
    if (lightRef.current) lightRef.current.intensity = intensity * ramp
    // 發光球：快速膨脹到 r=2.5 再縮回
    if (meshRef.current) {
      const s = ramp * 2.5
      meshRef.current.scale.set(s, s, s)
    }
    if (matRef.current) matRef.current.opacity = ramp * 0.45
  })

  if (done) return null

  return (
    <group position={position}>
      <pointLight ref={lightRef} color={color} intensity={0} distance={15} decay={2} />
      <mesh ref={meshRef} renderOrder={25}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial
          ref={matRef}
          color={color}
          transparent
          opacity={0}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

/* ────────────────────────────
   VfxRenderer — 根據 VfxType 渲染對應特效
   ──────────────────────────── */

export function VfxRenderer({ type, position }: { type: VfxType; position: Vector3Tuple }) {
  switch (type) {
    case 'hit': return <HitBurstVFX position={position} />
    case 'crit': return <HitBurstVFX position={position} isCrit />
    case 'heal': return <HealVFX position={position} />
    case 'buff': return <BuffShimmerVFX position={position} />
    case 'dot': return <DotTickVFX position={position} />
    default: return null
  }
}
