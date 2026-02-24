/**
 * Hero — 場上英雄（包含移動邏輯、動畫、血條、傷害彈窗）
 *
 * 每個 Hero 包裹一個 ZombieModel（3D 模型 + 動畫），
 * 並透過 useFrame 實現前進 / 後退 / 拖曳位移。
 */

import { useRef, useState, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'

import { ZombieModel } from './ZombieModel'
import { DamagePopup, HealthBar3D } from './SceneWidgets'
import type { SlotHero, ActorState, AnimationState, DamagePopupData } from '../types'
import type { GameState } from '../types'
import type { Vector3Tuple } from 'three'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface HeroProps {
  position: Vector3Tuple
  heroData: SlotHero
  isPlayer: boolean
  gameState: GameState
  actorState?: ActorState
  uid: string
  damagePopups: DamagePopupData[]
  hitFlashSignal?: number
  onModelReady?: () => void
  onActionDone?: (state: AnimationState) => void
  onMoveDone?: (uid: string) => void
  textScale?: number
  speed?: number
  /** 前進目標位置 ref（世界座標） */
  moveTargetsRef?: React.RefObject<Record<string, Vector3Tuple>>
  // 拖曳相關
  onDragStart?: (e: THREE.Event) => void
  slotIndex?: number
  dragSourceRef?: React.RefObject<number | null>
  dragPosRef?: React.RefObject<THREE.Vector3>
  dragOffsetRef?: React.RefObject<THREE.Vector3>
  isDragActive?: boolean
  canAdjustFormation?: boolean
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function Hero({
  position,
  heroData,
  isPlayer,
  actorState,
  uid,
  damagePopups,
  hitFlashSignal = 0,
  onModelReady,
  onActionDone,
  onMoveDone,
  textScale = 1,
  speed = 1,
  moveTargetsRef,
  onDragStart,
  slotIndex,
  dragSourceRef,
  dragPosRef,
  dragOffsetRef,
  isDragActive,
  canAdjustFormation = false,
}: HeroProps) {
  const meshRef = useRef<THREE.Group>(null)
  const [basePosition] = useState<Vector3Tuple>(position)

  const isAdvancing = actorState === 'ADVANCING'
  const isAttacking = actorState === 'ATTACKING'
  const isRetreating = actorState === 'RETREATING'
  const isHurt = actorState === 'HURT'
  const hpDepleted = heroData.currentHP <= 0
  const isDead = actorState === 'DEAD'

  /** 判斷此英雄是否正在被拖曳 */
  const amIDragged = () =>
    isDragActive && dragSourceRef?.current === slotIndex

  // 穩定 ref 避免閉包陷阱
  const onMoveDoneRef = useRef(onMoveDone)
  useEffect(() => { onMoveDoneRef.current = onMoveDone })
  const uidRef = useRef(uid)
  useEffect(() => { uidRef.current = uid })
  const moveDoneCalledRef = useRef(false)

  useEffect(() => {
    moveDoneCalledRef.current = false
  }, [actorState])

  // ── 每幀位移邏輯 ──
  useFrame(() => {
    if (hpDepleted || !meshRef.current) return

    // 拖曳中：直接跟隨指標
    if (amIDragged() && dragPosRef && dragOffsetRef) {
      const wx = dragPosRef.current.x + dragOffsetRef.current.x
      const wz = dragPosRef.current.z + dragOffsetRef.current.z
      meshRef.current.position.x = wx - basePosition[0]
      meshRef.current.position.y = 0
      meshRef.current.position.z = wz - basePosition[2]
      return
    }

    const motionLerp = Math.min(0.12 * speed, 1)
    const driftLerp = Math.min(0.1 * speed, 1)

    if (isAdvancing) {
      // 從 moveTargetsRef 讀取目標世界座標，轉換為相對於 basePosition 的區域偏移
      const mt = moveTargetsRef?.current?.[uid]
      const targetLocalX = mt ? mt[0] - basePosition[0] : -basePosition[0]
      const targetLocalZ = mt ? mt[2] - basePosition[2] : -basePosition[2]
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetLocalX, motionLerp)
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, driftLerp)
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, targetLocalZ, driftLerp)
      const dist = Math.hypot(
        meshRef.current.position.x - targetLocalX,
        meshRef.current.position.z - targetLocalZ,
      )
      if (!moveDoneCalledRef.current && dist < 0.25) {
        moveDoneCalledRef.current = true
        onMoveDoneRef.current?.(uidRef.current)
      }
    } else if (isAttacking) {
      // 攻擊中保持原位
    } else if (isRetreating) {
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, 0, motionLerp)
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, driftLerp)
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, 0, driftLerp)
      const dist = Math.hypot(meshRef.current.position.x, meshRef.current.position.z)
      if (!moveDoneCalledRef.current && dist < 0.25) {
        moveDoneCalledRef.current = true
        onMoveDoneRef.current?.(uidRef.current)
      }
    } else {
      // IDLE / HURT / DEAD — 回歸基礎位置
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, 0, driftLerp)
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, driftLerp)
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, 0, driftLerp)
    }
  })

  // 對應動畫狀態
  const currentState: AnimationState = isDead
    ? 'DEAD'
    : isAttacking
      ? 'ATTACKING'
      : isHurt
        ? 'HURT'
        : 'IDLE'

  const modelId = heroData._modelId || String(heroData.ModelID || heroData.HeroID || heroData.id || 'zombie_1')

  return (
    <group position={basePosition}>
      <group
        ref={meshRef}
        renderOrder={10}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (canAdjustFormation && onDragStart) onDragStart(e as unknown as THREE.Event)
        }}
      >
        {/* 透明 hit area — SkinnedMesh 的 CPU bounding box 不準確，
            用一個不可見的圓柱覆蓋整個英雄範圍來攔截 pointer 事件 */}
        <mesh position={[0, 1.5, 0]} visible={false}>
          <cylinderGeometry args={[0.8, 0.8, 3.2, 8]} />
          <meshBasicMaterial />
        </mesh>

        <Suspense fallback={null}>
          <ZombieModel
            key={`${modelId}_${uid}`}
            modelId={modelId}
            isPlayer={isPlayer}
            state={currentState}
            onReady={onModelReady}
            onActionDone={onActionDone}
            isDragging={amIDragged()}
            speed={speed}
            hitFlashSignal={hitFlashSignal}
          />
        </Suspense>

        {damagePopups.map((pop) => (
          <DamagePopup key={pop.id} value={pop.value} position={[0, 2.5, 0]} textScale={textScale} />
        ))}

        <Billboard position={[0, 3.5, 0]} renderOrder={15}>
          <Text fontSize={0.4 * textScale} color="white" outlineColor="black" outlineWidth={0.06}>
            {heroData.Name}
          </Text>
        </Billboard>

        <HealthBar3D
          position={[0, 3.0, 0]}
          ratio={Math.max(0, heroData.currentHP) / (heroData.HP || 1)}
          width={1.6 * textScale}
          height={0.12 * textScale}
          color={isPlayer ? '#1aff50' : '#f00'}
        />
      </group>
    </group>
  )
}
