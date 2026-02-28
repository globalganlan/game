/**
 * ZombieModel — GLB 骨骼動畫模型
 *
 * 載入 zombie_X.glb (Mesh + 骨架) 及 idle / attack / hurt / dying / run 五組動畫 GLB，
 * 使用 SkeletonUtils.clone() 正確複製 SkinnedMesh + 骨骼。
 * 動畫切換使用 crossFadeTo 避免 bind-pose 閃現（HURT / DEAD 除外，需強制覆蓋權重）。
 */

import { useRef, useEffect, useMemo } from 'react'
import { useAnimations } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import * as THREE from 'three'
import { getGlbForSuspense } from '../loaders/glbLoader'
import type { AnimationState } from '../types'

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface ZombieModelProps {
  modelId?: string
  isPlayer: boolean
  state: AnimationState
  onReady?: () => void
  onActionDone?: (state: AnimationState) => void
  isDragging?: boolean
  speed?: number
  /** 每次遞增觸發一次受擊紅色閃光 */
  hitFlashSignal?: number
}

/* ────────────────────────────
   Component
   ──────────────────────────── */

export function ZombieModel({
  modelId,
  isPlayer,
  state,
  onReady,
  onActionDone,
  isDragging = false,
  speed = 1,
  hitFlashSignal = 0,
}: ZombieModelProps) {
  // 穩定 ref — 避免 onActionDone 變化時觸發不必要的 useEffect
  const onActionDoneRef = useRef(onActionDone)
  useEffect(() => { onActionDoneRef.current = onActionDone })

  // 標準化 modelId（例如 "2" → "zombie_2"）
  let zombieId = modelId || (isPlayer ? 'zombie_1' : 'zombie_2')
  if (/^\d+$/.test(zombieId.toString())) {
    zombieId = `zombie_${zombieId}`
  }

  const modelFolder = `${import.meta.env.BASE_URL}models/${zombieId}`

  // 載入 Mesh GLB (含骨架，無動畫) + 五組動畫 GLB（觸發 Suspense）
  const meshAsset  = getGlbForSuspense(`${modelFolder}/${zombieId}.glb`)
  const idleAnim   = getGlbForSuspense(`${modelFolder}/${zombieId}_idle.glb`)
  const attackAnim = getGlbForSuspense(`${modelFolder}/${zombieId}_attack.glb`)
  const hurtAnim   = getGlbForSuspense(`${modelFolder}/${zombieId}_hurt.glb`)
  const dyingAnim  = getGlbForSuspense(`${modelFolder}/${zombieId}_dying.glb`)
  const runAnim    = getGlbForSuspense(`${modelFolder}/${zombieId}_run.glb`)

  // 用 SkeletonUtils.clone 正確克隆 SkinnedMesh + 骨骼
  const { scene, modelScale } = useMemo(() => {
    const cloned = SkeletonUtils.clone(meshAsset.scene)

    // 材質獨立化 — GLB 已是 MeshStandardMaterial，只需 clone 確保實例獨立
    // 並確保 emissive 乾淨以支援受擊紅色閃光
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const cloneMat = (m: THREE.Material): THREE.MeshStandardMaterial => {
          const cloned = m.clone() as THREE.MeshStandardMaterial
          // 確保 emissive 乾淨
          if (cloned.emissive) cloned.emissive.set(0, 0, 0)
          cloned.emissiveIntensity = 1
          cloned.emissiveMap = null
          return cloned
        }
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(cloneMat)
        } else if (mesh.material) {
          mesh.material = cloneMat(mesh.material)
        }
      }
    })

    const bbox = new THREE.Box3().setFromObject(cloned)
    // GLB 模型的骨架帶有 90°X 旋轉（FBX Y-up→Blender Z-up 轉換），
    // 所以模型站立高度治Z 軸，不是 Y 軸。
    // Armature 的旋轉會在渲染時把 Z 映射到 Y（世界上方）。
    const height = bbox.max.z - bbox.min.z
    const s = height > 0 ? 2.5 / height : 1
    return { scene: cloned, modelScale: s }
  }, [meshAsset, zombieId])

  // 合併全部動畫 clip（從各 animation-only GLB 取出）
  const animations = useMemo(() => {
    const clips: THREE.AnimationClip[] = []
    const sources: [typeof idleAnim, string][] = [
      [idleAnim, 'IDLE'],
      [attackAnim, 'ATTACKING'],
      [hurtAnim, 'HURT'],
      [dyingAnim, 'DEAD'],
      [runAnim, 'RUN'],
    ]
    for (const [src, label] of sources) {
      const anim = src.animations[0]
      if (anim) {
        const clip = anim.clone()
        clip.name = `${label}_${zombieId}`

        // RUN 動畫需移除根骨骼的 position track（root motion），
        // 否則 Mixamo 的位移 + useFrame lerp 會疊加，造成跑過頭和上下彈跳。
        if (label === 'RUN') {
          clip.tracks = clip.tracks.filter(
            (t) => !t.name.endsWith('.position'),
          )
        }

        clips.push(clip)
      }
    }
    return clips
  }, [idleAnim, attackAnim, hurtAnim, dyingAnim, runAnim, zombieId])

  const groupRef = useRef<THREE.Group>(null)
  const prevActionRef = useRef<THREE.AnimationAction | null>(null)
  const autoTransitionRef = useRef(false) // 標記 finished-handler 是否已自動過渡到 IDLE
  const { actions, mixer } = useAnimations(animations, scene)

  // 追蹤當前單次動作，用於 useFrame 備援完成偵測
  const singleRunActionRef = useRef<THREE.AnimationAction | null>(null)
  const singleRunStateRef = useRef<AnimationState | null>(null)
  const singleRunDoneCalledRef = useRef(false)

  // 首次掛載通知
  useEffect(() => { onReady?.() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 分頁隱藏補時：切回來時推進 mixer，讓暫停的動畫自然完成 ──
  useEffect(() => {
    if (!mixer) return
    let hiddenAt = 0
    const onVisChange = () => {
      if (document.hidden) {
        hiddenAt = performance.now()
      } else if (hiddenAt > 0) {
        const deltaSec = (performance.now() - hiddenAt) / 1000
        hiddenAt = 0
        // 補進隱藏期間的時間（上限 30s），讓 LoopOnce 動畫觸發 finished
        mixer.update(Math.min(deltaSec, 30))
      }
    }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [mixer])

  // ── 動畫狀態切換 ──
  useEffect(() => {
    if (isDragging) return

    const actionName = `${state}_${zombieId}`
    const newAction = actions?.[actionName]
    if (!newAction) {
      // ★ 動畫缺失時立即通知完成，避免 waitForAction 5s 超時
      const singleRun = state === 'DEAD' || state === 'ATTACKING' || state === 'HURT'
      if (singleRun) {
        onActionDoneRef.current?.(state)
      }
      return
    }

    // 單次動作：LoopOnce + clampWhenFinished
    const singleRun = state === 'DEAD' || state === 'ATTACKING' || state === 'HURT'
    if (singleRun) {
      newAction.setLoop(THREE.LoopOnce, 1)
      newAction.clampWhenFinished = true
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity)
      newAction.clampWhenFinished = false
    }

    // 若 finished-handler 已自動過渡到此動作，跳過以免中斷正在進行的 fade
    const wasAutoTransition = autoTransitionRef.current
    autoTransitionRef.current = false
    if (wasAutoTransition && prevActionRef.current === newAction) {
      // 清除 singleRun 追蹤（已自動過渡）
      singleRunActionRef.current = null
      singleRunStateRef.current = null
      singleRunDoneCalledRef.current = false
      return
    }

    // 播放邏輯
    const FADE_DUR = 0.25 // crossFade 過渡時長（秒）
    const prev = prevActionRef.current

    if (state === 'HURT' || state === 'DEAD') {
      // 強制全權重播放：HURT / DEAD 需要立即覆蓋，不可混合
      if (prev && prev !== newAction) {
        prev.fadeOut(FADE_DUR)
      }
      newAction.reset()
      newAction.setEffectiveTimeScale(1)
      newAction.setEffectiveWeight(1)
      newAction.play()
    } else if (prev && prev !== newAction) {
      // 一般切換：crossFade 平滑過渡
      if (prev.paused || !prev.isRunning()) {
        prev.paused = false
        prev.enabled = true
        prev.setEffectiveWeight(1)
      }
      newAction.reset()
      newAction.setEffectiveTimeScale(1)
      newAction.setEffectiveWeight(1)
      prev.crossFadeTo(newAction, FADE_DUR, false)
      newAction.play()
    } else {
      newAction.reset()
      newAction.setEffectiveTimeScale(1)
      newAction.setEffectiveWeight(1)
      newAction.fadeIn(FADE_DUR).play()
    }
    prevActionRef.current = newAction

    // 追蹤 singleRun 動作，供 useFrame 備援偵測
    if (singleRun) {
      singleRunActionRef.current = newAction
      singleRunStateRef.current = state
      singleRunDoneCalledRef.current = false
    } else {
      singleRunActionRef.current = null
      singleRunStateRef.current = null
      singleRunDoneCalledRef.current = false
    }

    // 單次動作完成事件（mixer 'finished' 主通道）
    let handler: ((e: { action: THREE.AnimationAction }) => void) | null = null
    if (singleRun && mixer) {
      handler = (e) => {
        if (e.action === newAction) {
          if (!singleRunDoneCalledRef.current) {
            singleRunDoneCalledRef.current = true
            onActionDoneRef.current?.(state)
          }

          // 自動過渡到待機動畫（HURT / ATTACKING 結束後）
          if (state !== 'DEAD') {
            const idleActionName = `IDLE_${zombieId}`
            const idleAction = actions?.[idleActionName]
            if (idleAction) {
              const TRANS_DUR = 0.3
              newAction.fadeOut(TRANS_DUR)
              idleAction.reset()
              idleAction.setLoop(THREE.LoopRepeat, Infinity)
              idleAction.clampWhenFinished = false
              idleAction.setEffectiveTimeScale(1)
              idleAction.fadeIn(TRANS_DUR)
              idleAction.play()
              prevActionRef.current = idleAction
              autoTransitionRef.current = true
            }
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mixer.addEventListener('finished', handler as any)
    }

    return () => {
      if (mixer && handler) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mixer.removeEventListener('finished', handler as any)
      }
    }
  }, [state, actions, mixer, isDragging, zombieId])

  // ── useFrame 備援：偵測單次動畫完成（防止 mixer 'finished' 遺漏） ──
  useFrame(() => {
    const action = singleRunActionRef.current
    if (!action || singleRunDoneCalledRef.current) return
    // 檢查動畫是否已播完（paused by clampWhenFinished 或 time >= duration）
    const clip = action.getClip()
    if (clip && action.time >= clip.duration - 0.05) {
      singleRunDoneCalledRef.current = true
      const doneState = singleRunStateRef.current
      if (doneState) {
        onActionDoneRef.current?.(doneState)
      }
      // 自動過渡到 IDLE（與 finished handler 邏輯一致）
      if (doneState && doneState !== 'DEAD') {
        const idleActionName = `IDLE_${zombieId}`
        const idleAction = actions?.[idleActionName]
        if (idleAction) {
          const TRANS_DUR = 0.3
          action.fadeOut(TRANS_DUR)
          idleAction.reset()
          idleAction.setLoop(THREE.LoopRepeat, Infinity)
          idleAction.clampWhenFinished = false
          idleAction.setEffectiveTimeScale(1)
          idleAction.fadeIn(TRANS_DUR)
          idleAction.play()
          prevActionRef.current = idleAction
          autoTransitionRef.current = true
        }
      }
    }
  })

  // ── 受擊紅色閃光（color tint + emissive 雙管齊下，確保任何材質都可見）──
  const flashTimerRef = useRef(0)
  const prevFlashSignalRef = useRef(hitFlashSignal)
  const FLASH_DURATION = 0.28 // 秒
  const FLASH_EMISSIVE = new THREE.Color(2.0, 0.0, 0.0)
  const BLACK = new THREE.Color(0, 0, 0)
  const FLASH_TINT = new THREE.Color(1.0, 0.0, 0.0) // color tint 目標（純紅）

  // 收集場景中所有 MeshStandardMaterial 及其原始 color
  const matData = useMemo(() => {
    const result: { mat: THREE.MeshStandardMaterial; origColor: THREE.Color }[] = []
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const rawMat = (child as THREE.Mesh).material
        const materials = Array.isArray(rawMat) ? rawMat : [rawMat]
        for (const m of materials) {
          if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            result.push({
              mat: m as THREE.MeshStandardMaterial,
              origColor: (m as THREE.MeshStandardMaterial).color.clone(),
            })
          }
        }
      }
    })
    return result
  }, [scene])

  useFrame((_s, delta) => {
    // 偵測 signal 遞增
    if (hitFlashSignal !== prevFlashSignalRef.current) {
      prevFlashSignalRef.current = hitFlashSignal
      flashTimerRef.current = FLASH_DURATION
    }

    if (flashTimerRef.current <= 0) return
    flashTimerRef.current -= delta

    const t = Math.max(0, flashTimerRef.current / FLASH_DURATION)
    // 快亮快滅的 bell-curve 效果
    const intensity = t > 0.5 ? (1 - t) / 0.5 : t / 0.5

    for (const { mat, origColor } of matData) {
      // emissive：疊加紅色自發光
      mat.emissive.copy(BLACK).lerp(FLASH_EMISSIVE, intensity)
      // color tint：原始色混合亮紅，雙重確保可見
      mat.color.copy(origColor).lerp(FLASH_TINT, intensity * 0.5)
    }

    // 結束時確保完全歸零
    if (flashTimerRef.current <= 0) {
      for (const { mat, origColor } of matData) {
        mat.emissive.copy(BLACK)
        mat.color.copy(origColor)
      }
    }
  })

  // ── 拖曳時暫停動畫 ──
  useEffect(() => {
    if (!mixer) return
    if (isDragging) {
      mixer.timeScale = 0
    } else {
      mixer.timeScale = state === 'IDLE' ? 1 : speed
    }
  }, [isDragging, mixer, speed, state])

  return (
    <group
      ref={groupRef}
      scale={modelScale}
      rotation={[0, isPlayer ? Math.PI : 0, 0]}
    >
      <primitive object={scene} />
    </group>
  )
}
