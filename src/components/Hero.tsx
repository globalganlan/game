/**
 * Hero — 場上英雄（包含移動邏輯、動畫、血條、傷害彈窗）
 *
 * 每個 Hero 包裹一個 ZombieModel（3D 模型 + 動畫），
 * 並透過 useFrame 實現前進 / 後退 / 拖曳位移。
 */

import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { ZombieModel } from './ZombieModel'
import type { CcType } from './ZombieModel'
import { DamagePopup, HealthBar3D, EnergyBar3D, SkillToast3D, PassiveHint3D, BuffIcons3D, BuffApplyToast3D, VfxRenderer, SkillFlash } from './SceneWidgets'
import type { SlotHero, ActorState, AnimationState, DamagePopupData, VfxEvent } from '../types'
import type { SkillToast, PassiveHint, BuffApplyHint } from './BattleHUD'
import type { StatusEffect } from '../domain/types'

import type { Vector3Tuple } from 'three'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface HeroProps {
  position: Vector3Tuple
  heroData: SlotHero
  isPlayer: boolean
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
  onClickRemove?: () => void
  slotIndex?: number
  dragSourceRef?: React.RefObject<number | null>
  dragPosRef?: React.RefObject<THREE.Vector3>
  dragOffsetRef?: React.RefObject<THREE.Vector3>
  isDragActive?: boolean
  canAdjustFormation?: boolean
  /** 能量比例（0~1），戰鬥中用於顯示 3D 能量條 */
  energyRatio?: number
  /** 技能彈幕（顯示在此英雄頭頂） */
  skillToasts?: SkillToast[]
  /** 被動觸發提示（顯示在此英雄頭頂） */
  passiveHints?: PassiveHint[]
  /** 當前身上的 Buff/Debuff 列表（顯示 3D Icon） */
  battleBuffs?: StatusEffect[]
  /** Buff/Debuff 施加漂浮文字 */
  buffApplyHints?: BuffApplyHint[]
  /** 粒子特效事件 */
  vfxEvents?: VfxEvent[]
  /** 技能閃光事件 */
  skillFlashes?: { id: number; uid: string; timestamp: number }[]
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
  onClickRemove,
  slotIndex,
  dragSourceRef,
  dragPosRef,
  dragOffsetRef,
  isDragActive,
  canAdjustFormation = false,
  energyRatio,
  skillToasts = [],
  passiveHints = [],
  battleBuffs = [],
  buffApplyHints = [],
  vfxEvents = [],
  skillFlashes = [],
}: HeroProps) {
  const meshRef = useRef<THREE.Group>(null)
  const [basePosition] = useState<Vector3Tuple>(position)

  /** 區分點擊 vs 拖曳：記錄 pointerdown 座標，pointerup 時比較位移量 */
  const downPosRef = useRef<{ x: number; y: number } | null>(null)

  const isAdvancing = actorState === 'ADVANCING'

  // ── 從 battleBuffs 偵測控制效果（優先級：stun > freeze > silence > fear）──
  const CC_PRIORITY: CcType[] = ['stun', 'freeze', 'silence', 'fear']
  const activeCcType = useMemo<CcType | null>(() => {
    for (const cc of CC_PRIORITY) {
      if (battleBuffs.some(b => b.type === cc)) return cc
    }
    return null
  }, [battleBuffs])

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
    if (!meshRef.current) return

    // ★ HP 歸零但仍在移動狀態 → 立即觸發 moveDone 避免 waitForMove 5s 超時
    if (hpDepleted) {
      if ((isAdvancing || isRetreating) && !moveDoneCalledRef.current) {
        moveDoneCalledRef.current = true
        onMoveDoneRef.current?.(uidRef.current)
      }
      return
    }

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
        : (isAdvancing || isRetreating)
          ? 'RUN'
          : 'IDLE'

  const modelId = heroData._modelId || String(heroData.ModelID || heroData.HeroID || heroData.id || 'zombie_1')

  return (
    <group position={basePosition}>
      <group
        ref={meshRef}
        renderOrder={10}
        onPointerDown={(e) => {
          e.stopPropagation()
          downPosRef.current = { x: (e as any).clientX ?? (e as any).nativeEvent?.clientX ?? 0, y: (e as any).clientY ?? (e as any).nativeEvent?.clientY ?? 0 }
          if (canAdjustFormation && onDragStart) onDragStart(e as unknown as THREE.Event)
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          if (!canAdjustFormation || !onClickRemove || !downPosRef.current) return
          const cx = (e as any).clientX ?? (e as any).nativeEvent?.clientX ?? 0
          const cy = (e as any).clientY ?? (e as any).nativeEvent?.clientY ?? 0
          const dx = cx - downPosRef.current.x
          const dy = cy - downPosRef.current.y
          downPosRef.current = null
          if (Math.hypot(dx, dy) < 5) onClickRemove()
        }}
      >
        {/* 透明 hit area — SkinnedMesh 的 CPU bounding box 不準確，
            用一個不可見的圓柱覆蓋整個英雄範圍來攔截 pointer 事件 */}
        <mesh position={[0, 1.5, 0]} visible={false}>
          <cylinderGeometry args={[0.8, 0.8, 3.2, 8]} />
          <meshBasicMaterial />
        </mesh>

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
          ccType={activeCcType}
        />

        {damagePopups.map((pop) => (
          <DamagePopup key={pop.id} value={pop.value} damageType={pop.damageType} position={[0, 2.5, 0]} textScale={textScale} />
        ))}

        {/* 技能名稱浮動標示（頭頂上方，避免遮擋身體閃光/粒子） */}
        {skillToasts.map((t) => (
          <SkillToast3D key={t.id} heroName={t.heroName} skillName={t.skillName} position={[0, 2.8, 0]} textScale={textScale} />
        ))}

        {/* 被動觸發浮動標示（依序往上錯開避免重疊） */}
        {passiveHints.map((ph, idx) => (
          <PassiveHint3D key={ph.id} skillName={ph.skillName} position={[0, 1.0 + idx * 0.55, 0]} textScale={textScale} />
        ))}

        {/* Buff/Debuff 施加漂浮文字 */}
        {buffApplyHints.map((bh) => (
          <BuffApplyToast3D key={bh.id} effectType={bh.effectType} isBuff={bh.isBuff} position={[0, 0.8, 0]} textScale={textScale} />
        ))}

        {/* Buff/Debuff 3D 圖示列 */}
        <BuffIcons3D effects={battleBuffs} textScale={textScale} />

        {/* 粒子特效 */}
        {vfxEvents.map((v) => (
          <VfxRenderer key={v.id} type={v.type} position={[0, 1.2, 0]} />
        ))}

        {/* 技能閃光 */}
        {skillFlashes.map((f) => (
          <SkillFlash key={f.id} position={[0, 1.2, 0]} color="#ffffff" intensity={12} />
        ))}

        <Html position={[0, 3.5, 0]} center zIndexRange={[1, 0]} wrapperClass="hero-name-html" style={{ pointerEvents: 'none' }}>
          <div className="hero-name-label">{heroData.Name}</div>
        </Html>

        <HealthBar3D
          position={[0, 3.0, 0]}
          ratio={Math.max(0, heroData.currentHP) / (heroData.HP || 1)}
          width={1.6 * textScale}
          height={0.12 * textScale}
          color={isPlayer ? '#1aff50' : '#f00'}
        />

        {energyRatio !== undefined && (
          <EnergyBar3D
            position={[0, 2.75, 0]}
            ratio={energyRatio}
            width={1.6 * textScale}
            height={0.08 * textScale}
          />
        )}
      </group>
    </group>
  )
}
