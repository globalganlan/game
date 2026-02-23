import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import './App.css'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Billboard, Text, Sparkles, Sky, useAnimations } from '@react-three/drei'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import * as THREE from 'three'

// Debugging disabled in production / by user request
function pushDebug(msg) {
  // no-op: debug overlay removed
}

// Suppress a couple noisy three.js deprecation warnings (internal to R3F)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (!args || !args[0] || typeof args[0] !== 'string') return originalWarn(...args);
  const msg = args[0];
  // suppress the known THREE.Clock deprecation and PCFSoftShadowMap deprecation messages
  if (msg.includes('THREE.Clock: This module has been deprecated') || msg.includes('PCFSoftShadowMap has been deprecated')) return;
  originalWarn(...args);
};

const API_URL = 'https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec'

/** 螢幕尺寸分級 hook */
function useResponsive() {
  const getInfo = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const isPortrait = h > w
    const aspect = w / h
    let device
    if (w <= 480 || (isPortrait && w <= 600))  device = 'mobile'
    else if (w <= 1024 || (isPortrait && w <= 800)) device = 'tablet'
    else device = 'desktop'
    return { device, isPortrait, aspect }
  }
  const [info, setInfo] = useState(getInfo)
  useEffect(() => {
    const onResize = () => setInfo(getInfo())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', () => setTimeout(onResize, 150))
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  return useMemo(() => {
    const { device, isPortrait, aspect } = info
    // 直式手機需要更高的鏡頭 + 更廣的 FOV 才能看到整個戰場
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

/** 根據螢幕自動調整鏡頭 */
function ResponsiveCamera({ fov, position, target }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.fov = fov
    camera.position.set(...position)
    camera.updateProjectionMatrix()
  }, [fov, position, camera])
  return <OrbitControls target={target} enableRotate={false} enablePan={false} enableZoom={false} />
}

function DamagePopup({ value, position, textScale = 1 }) {
  const ref = useRef()
  const [opacity, setOpacity] = useState(1)

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.position.y = ref.current.position.y + delta * 0.2
      setOpacity(prev => Math.max(0, prev - delta * 0.8))
    }
  })

  if (opacity <= 0) return null

  return (
    <Billboard position={position} ref={ref}>
      <Text fontSize={0.8 * textScale} color="#ff0000" outlineColor="white" outlineWidth={0.05} fillOpacity={opacity} outlineOpacity={opacity}>
        -{value}
      </Text>
    </Billboard>
  )
}

/**
 * 過場幕 — 遮蔽模型載入 / 重啟的不合理畫面
 */
function TransitionOverlay({ visible, fading, text }) {
  if (!visible) return null

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'radial-gradient(ellipse at center, #1a0505 0%, #050000 70%, #000 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: fading ? undefined : 1,
      animation: fading ? 'curtainFadeOut 1s ease-in forwards' : undefined,
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      {/* CRT 掃描線 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.03) 2px, rgba(255,0,0,0.03) 4px)',
        pointerEvents: 'none',
      }} />
      {/* 移動掃描光條 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '120px',
        background: 'linear-gradient(180deg, transparent, rgba(255,0,0,0.07), transparent)',
        animation: 'scanDown 3s linear infinite',
        pointerEvents: 'none',
      }} />
      {/* 暗角 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%)',
        pointerEvents: 'none',
      }} />
      <div className="transition-text">{text}</div>
      <div style={{
        width: 'clamp(120px, 30vw, 200px)', height: '2px', background: 'rgba(80,0,0,0.5)',
        marginTop: '24px', overflow: 'hidden', borderRadius: '1px', zIndex: 1,
      }}>
        <div style={{
          width: '40%', height: '100%',
          background: 'linear-gradient(90deg, transparent, #ff2200, transparent)',
          animation: 'loadingSlide 1.5s ease-in-out infinite',
        }} />
      </div>
    </div>
  )
}

function ZombieModel({ modelId, isPlayer, state, onReady, onActionDone, hurtSignal, isDragging = false }) {
  // Stable ref for onActionDone — prevents useEffect re-fire when parent re-renders
  const onActionDoneRef = useRef(onActionDone)
  useEffect(() => { onActionDoneRef.current = onActionDone })
  // modelId provided by parent via hero data; fallback to player/enemy defaults
  const zombieId = modelId || (isPlayer ? 'zombie_1' : 'zombie_2')
  const modelFolder = `${import.meta.env.BASE_URL}models/${zombieId}`

  // 載入 OBJ（頂點色彩來源）
  // const objModel = useLoader(OBJLoader, `${modelFolder}/mesh.obj`)

  // 載入 Mixamo FBX 動畫
  const idle = useLoader(FBXLoader, `${modelFolder}/${zombieId}_idle.fbx`)
  const attack = useLoader(FBXLoader, `${modelFolder}/${zombieId}_attack.fbx`)
  const hurt = useLoader(FBXLoader, `${modelFolder}/${zombieId}_hurt.fbx`)
  const dying = useLoader(FBXLoader, `${modelFolder}/${zombieId}_dying.fbx`)

  // 用 SkeletonUtils.clone 正確克隆 SkinnedMesh + 骨骼，再轉移頂點色彩
  const { scene, modelScale } = useMemo(() => {
    const cloned = SkeletonUtils.clone(idle)

    // 計算模型高度，動態決定 scale 讓角色約 2.5 單位高
    const bbox = new THREE.Box3().setFromObject(cloned)
    const height = bbox.max.y - bbox.min.y
    const s = height > 0 ? 2.5 / height : 1
    return { scene: cloned, modelScale: s }
  }, [idle])

  // 合併全部動畫 clip（正確克隆 AnimationClip）
  const animations = useMemo(() => {
    const clips = []
    idle.animations.forEach(a => { const c = a.clone(); c.name = 'IDLE'; clips.push(c) })
    attack.animations.forEach(a => { const c = a.clone(); c.name = 'ATTACKING'; clips.push(c) })
    hurt.animations.forEach(a => { const c = a.clone(); c.name = 'HURT'; clips.push(c) })
    dying.animations.forEach(a => { const c = a.clone(); c.name = 'DEAD'; clips.push(c) })
    return clips
  }, [idle, attack, hurt, dying])

  const groupRef = useRef()
  const prevActionRef = useRef(null)
  const { actions, mixer } = useAnimations(animations, scene)

  // 模型載入完成通知（Suspense resolve 後首次 mount 時觸發）
  useEffect(() => { if (onReady) onReady() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 播放對應狀態的動畫 — 用 crossFade 避免切換時回到 bind pose 造成下蹲
  // If the model is being dragged, skip switching animations to avoid visual glitches.
  useEffect(() => {
    if (isDragging) {
      pushDebug('ZombieModel: dragging — skip state change')
      return
    }
    if (!actions || !actions[state]) {
      pushDebug(`ZombieModel: no action for state ${state} available: ${Object.keys(actions || {}).join(',')}`)
      return
    }

    const newAction = actions[state]

    // For single-run actions (attack, hurt, dead) play once and clamp; idle loops
    const singleRun = state === 'DEAD' || state === 'ATTACKING' || state === 'HURT'
    if (singleRun) {
      newAction.setLoop(THREE.LoopOnce, 1)
      newAction.clampWhenFinished = true
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity)
    }

    const playAction = () => {
      try {
        const clipName = newAction._clip && newAction._clip.name
        const dur = newAction._clip && newAction._clip.duration
        // For HURT we force immediate, full-weight playback to ensure it's visible
        if (state === 'HURT') {
          newAction.reset()
          newAction.time = 0
          newAction.setEffectiveTimeScale(1)
          newAction.setEffectiveWeight(1)
          newAction.play()
          pushDebug(`ZombieModel: force-play HURT clip=${clipName} dur=${dur}`)
        } else if (prevActionRef.current && prevActionRef.current !== newAction) {
          newAction.reset()
          prevActionRef.current.crossFadeTo(newAction, 0.2, true)
          newAction.play()
          pushDebug(`ZombieModel: crossfade to ${state} clip=${clipName} dur=${dur}`)
        } else {
          newAction.reset().fadeIn(0.2).play()
          pushDebug(`ZombieModel: fadeIn play ${state} clip=${clipName} dur=${dur}`)
        }
        prevActionRef.current = newAction
      } catch (err) {
        pushDebug(`ZombieModel: playAction error ${err}`)
      }
    }

    playAction()

    // If this is a single-run action, wait for mixer 'finished' event and notify
    let handler = null
    if (singleRun && mixer) {
      handler = (e) => {
        try {
          if (e.action === newAction) {
            pushDebug(`ZombieModel: finished action ${state}`)
            if (onActionDoneRef.current) onActionDoneRef.current(state)
          }
        } catch (err) {
          // ignore
        }
      }
      mixer.addEventListener('finished', handler)
    }

    // nothing here for external hurtSignal in this effect

    return () => {
      if (mixer && handler) mixer.removeEventListener('finished', handler)
    }
  }, [state, actions, mixer, isDragging])  // onActionDone excluded — read from ref

  // Watch external hurtSignal and force-play HURT when it increments
  useEffect(() => {
    if (typeof hurtSignal === 'undefined') return
    try {
      const act = actions && actions['HURT']
      if (act) {
        act.reset()
        act.time = 0
        act.setEffectiveTimeScale(1)
        act.setEffectiveWeight(1)
        act.play()
        pushDebug(`ZombieModel: external hurtSignal play HURT`) 
      } else {
        pushDebug('ZombieModel: external hurtSignal but HURT action missing')
      }
    } catch (err) {
      pushDebug(`ZombieModel: external hurtSignal error ${err}`)
    }
  }, [hurtSignal, actions])

  // Pause/resume mixer while dragging so the animation freezes in-place
  useEffect(() => {
    if (!mixer) return
    try {
      if (isDragging) {
        mixer.timeScale = 0
        pushDebug('ZombieModel: mixer paused for drag')
      } else {
        mixer.timeScale = 1
        pushDebug('ZombieModel: mixer resumed')
      }
    } catch (err) {
      pushDebug(`ZombieModel: pause/resume error ${err}`)
    }
  }, [isDragging, mixer])

  return (
    <group
      ref={groupRef}
      scale={modelScale}
      rotation={[0, isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]}
    >
      <primitive object={scene} />
    </group>
  )
}

/** 建立圓角矩形 Shape（中心為原點） */
function makeRoundedRect(w, h, r) {
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

/** 3D 血條：背景灰 + 前景色，始終面向鏡頭（圓角） */
function HealthBar3D({ position, ratio, width = 1.6, height = 0.12, color = '#1aff50' }) {
  const bgMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#333', transparent: true, opacity: 0.6, depthTest: false }), [])
  const fgMat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }), [color])

  const clampedRatio = Math.max(0, Math.min(1, ratio))
  const radius = height * 0.5  // 全圓角（藥丸形）

  const bgGeo = useMemo(() => new THREE.ShapeGeometry(makeRoundedRect(width, height, radius)), [width, height, radius])
  const fgGeo = useMemo(() => {
    if (clampedRatio <= 0) return null
    const fgW = width * clampedRatio
    const fgH = height * 0.8
    return new THREE.ShapeGeometry(makeRoundedRect(fgW, fgH, Math.min(radius, fgW / 2, fgH / 2)))
  }, [width, height, clampedRatio, radius])

  return (
    <Billboard position={position} renderOrder={16}>
      {/* 背景條 */}
      <mesh position={[0, 0, 0]} geometry={bgGeo} material={bgMat} renderOrder={16} />
      {/* 前景條（從左側開始縮短） */}
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

/** Slot marker with optional highlight/pulse */
function SlotMarker({ position, index, selected, color = '#ffffff', onClick, onDragStart, onDrop }) {
  const ref = useRef()
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.getElapsedTime()
    const pulse = selected ? 1 + Math.sin(t * 6) * 0.06 : 1
    ref.current.scale.set(pulse, 1, pulse)
  })

  // flat, embedded on ground (rotate to lie on XZ plane). smaller y-offset to sit on ground
  // non-interactive visual marker (slots are not directly clickable)
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[position[0], position[1] + 0.02, position[2]]}
      raycast={undefined}
    >
      <ringGeometry args={[0.62, 0.9, 64]} />
      <meshBasicMaterial color={selected ? '#1aff50' : color} transparent opacity={selected ? 0.95 : 0.18} depthTest={false} />
    </mesh>
  )
}

// Thumbnail 3D preview (small Canvas) -------------------------------------------------
function ModelPreview({ modelId }) {
  const modelFolder = `${import.meta.env.BASE_URL}models/${modelId}`
  const thumbName = `${modelId}_thumbnail.png`
  const thumbUrl = `${modelFolder}/${thumbName}`
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    let mounted = true
    // Check existence quickly, then load with TextureLoader to avoid OBJ parsing and HTML responses
    fetch(thumbUrl, { method: 'HEAD' }).then(res => {
      if (!mounted) return
      if (!res.ok) {
        setTexture(null)
        return
      }
      const loader = new THREE.TextureLoader()
      loader.load(
        thumbUrl,
        (tex) => { if (mounted) { tex.needsUpdate = true; setTexture(tex) } },
        undefined,
        () => { if (mounted) setTexture(null) }
      )
    }).catch(() => { if (mounted) setTexture(null) })

    return () => { mounted = false }
  }, [thumbUrl])

  if (!texture) return null

  return (
    <mesh scale={[1.6, 1.6, 1]} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent={true} />
    </mesh>
  )
}

function Thumbnail3D({ modelId }) {
  const thumbUrl = `${import.meta.env.BASE_URL}models/${modelId}/${modelId}_thumbnail.png`
  const [imgReady, setImgReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const img = new Image()
    img.onload = () => { if (mounted) setImgReady(true) }
    img.onerror = () => { if (mounted) setImgReady(false) }
    img.src = thumbUrl
    return () => { mounted = false }
  }, [thumbUrl])

  return (
    <div className="thumb-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {imgReady ? (
        <img src={thumbUrl} alt={modelId} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <Canvas orthographic camera={{ position: [0, 0, 5], zoom: 60 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 5, 5]} />
          <Suspense fallback={null}>
            <ModelPreview modelId={modelId} />
          </Suspense>
        </Canvas>
      )}
    </div>
  )
}

function ThumbnailList({ heroes = [], onThumbClick, selectedIds = [] }) {
  if (!heroes || heroes.length === 0) return null
  return (
    <div className="thumb-bar">
      {heroes.map((h, i) => {
        const id = h.ModelID || h.id || `zombie_${i + 1}`
        const modelId = id.toString().startsWith('zombie') ? id : `zombie_${i + 1}`
        const uid = h.id || h.ModelID || h.Name
        const selected = selectedIds.includes(uid)
        return (
          <div key={i} className="thumb-card" style={{ position: 'relative', cursor: onThumbClick ? 'pointer' : 'default' }} onClick={() => onThumbClick && onThumbClick(h)}>
            <Thumbnail3D modelId={modelId} />
            <div className="thumb-name">{h.Name || `喪屍 ${i + 1}`}</div>
            {selected && (
              <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#1aff50', padding: '2px 6px', borderRadius: '6px', fontSize: '12px' }}>已上陣</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Hero({ position, heroData, isPlayer, gameState, actorState, uid, damagePopups, onModelReady, onActionDone, onMoveDone, hurtSignal = 0, textScale = 1, onDragStart, onDrop, slotIndex, dragSourceRef, dragPosRef, dragOffsetRef, isDragActive }) {
  const meshRef = useRef()
  const [basePosition] = useState(position)
  const isAdvancing = actorState === 'ADVANCING'
  const isAttacking = actorState ? actorState === 'ATTACKING' : ((isPlayer && gameState === 'PLAYER_ATTACKING') || (!isPlayer && gameState === 'ENEMY_ATTACKING'))
  const isRetreating = actorState === 'RETREATING'
  const isHurt = actorState ? actorState === 'HURT' : ((isPlayer && gameState === 'ENEMY_STRIKING') || (!isPlayer && gameState === 'PLAYER_STRIKING'))
  const isDead = heroData.currentHP <= 0

  // Check if THIS hero is being dragged by reading refs directly (not via props/state)
  const amIDragged = () => isDragActive && dragSourceRef && dragSourceRef.current === slotIndex

  // Stable refs for callbacks to avoid stale closure in useFrame
  const onMoveDoneRef = useRef(onMoveDone)
  useEffect(() => { onMoveDoneRef.current = onMoveDone })
  const uidRef = useRef(uid)
  useEffect(() => { uidRef.current = uid })
  const moveDoneCalledRef = useRef(false)

  // Reset moveDoneCalled when state changes
  useEffect(() => {
    moveDoneCalledRef.current = false
  }, [actorState])

  useFrame((state, delta) => {
    if (isDead || !meshRef.current) return
    if (amIDragged()) {
      // Read drag position directly from shared ref — updated every pointermove, no re-render needed
      const wx = dragPosRef.current.x + dragOffsetRef.current.x
      const wz = dragPosRef.current.z + dragOffsetRef.current.z
      meshRef.current.position.x = wx - basePosition[0]
      meshRef.current.position.y = 0  // model stays grounded; DragPlane at y=1.25 handles the visual offset
      meshRef.current.position.z = wz - basePosition[2]
      return
    }

    if (isAdvancing) {
      // Move toward center of arena (world x=0 → local x = -basePosition[0])
      const targetLocalX = -basePosition[0]
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetLocalX, 0.12)
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, 0.1)
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, 0, 0.1)
      // Signal when close enough
      if (!moveDoneCalledRef.current && Math.abs(meshRef.current.position.x - targetLocalX) < 0.15) {
        moveDoneCalledRef.current = true
        if (onMoveDoneRef.current) onMoveDoneRef.current(uidRef.current)
      }
    } else if (isAttacking) {
      // Stay at current position while attacking (no lerp)
    } else if (isRetreating) {
      // Lerp back to base (local 0,0,0)
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, 0, 0.12)
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, 0.1)
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, 0, 0.1)
      // Signal when close enough
      if (!moveDoneCalledRef.current && Math.abs(meshRef.current.position.x) < 0.15) {
        moveDoneCalledRef.current = true
        if (onMoveDoneRef.current) onMoveDoneRef.current(uidRef.current)
      }
    } else {
      // IDLE / HURT / DEAD — lerp back to base
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, 0, 0.1)
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, 0.1)
      meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, 0, 0.1)
    }
  })

  // Map actorState to ZombieModel animation state
  // ADVANCING/RETREATING use IDLE animation (model walks via position lerp while in idle pose)
  const currentState = isDead ? 'DEAD' : (isAttacking ? 'ATTACKING' : (isHurt ? 'HURT' : 'IDLE'))

  const modelId = heroData._modelId || heroData.ModelID || heroData.id || 'zombie_1'

  return (
    <group position={basePosition}>
      <group ref={meshRef} renderOrder={10} onPointerDown={(e) => { e.stopPropagation(); onDragStart && onDragStart(e); }}>
          <Suspense fallback={null}>
          <ZombieModel key={`${modelId}_${uid}`} modelId={modelId} isPlayer={isPlayer} state={currentState} onReady={onModelReady} onActionDone={onActionDone} hurtSignal={hurtSignal} isDragging={amIDragged()} />
        </Suspense>

      {damagePopups.map(pop => (
        <DamagePopup key={pop.id} value={pop.value} position={[0, 2.5, 0]} textScale={textScale} />
      ))}

      <Billboard position={[0, 3.5, 0]} renderOrder={15}>
        <Text fontSize={0.4 * textScale} color="white" outlineColor="black" outlineWidth={0.06}>
          {heroData.Name}
        </Text>
      </Billboard>
      {/* 3D 血條 */}
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

function Debris({ position, scale, rotation, color = '#222', type = 'box' }) {
  const { geometry, material } = useMemo(() => {
    let geo
    switch (type) {
      case 'slab':
        geo = new THREE.BoxGeometry(1, 1, 1, 6, 4, 6)
        break
      case 'pillar':
        geo = new THREE.CylinderGeometry(0.3, 0.55, 1, 7, 6)
        break
      case 'rock':
        geo = new THREE.DodecahedronGeometry(0.5, 2)
        break
      case 'rebar':
        geo = new THREE.CylinderGeometry(0.06, 0.1, 1, 5, 5)
        break
      case 'chunk':
        geo = new THREE.TetrahedronGeometry(0.5, 2)
        break
      default:
        geo = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5)
    }

    const hash = (x, y, z) => {
      let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
      return h - Math.floor(h)
    }

    const pos = geo.attributes.position
    const normals = geo.attributes.normal
    const colors = new Float32Array(pos.count * 3)
    const baseColor = new THREE.Color(color)
    // 沿法線方向位移 → 產生凹凸起伏感
    const strength = type === 'rebar' ? 0.015 : type === 'pillar' ? 0.08 : 0.18

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i)
      const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i)
      // 法線方向位移 + 少量隨機擾動 → 粗糙凹凸
      const noiseVal = (hash(px * 3, py * 3, pz * 3) - 0.5) * 2
      const disp = noiseVal * strength
      const jitter = (Math.random() - 0.5) * strength * 0.3
      pos.setXYZ(
        i,
        px + nx * disp + (Math.random() - 0.5) * strength * 0.15,
        py + ny * disp + jitter,
        pz + nz * disp + (Math.random() - 0.5) * strength * 0.15
      )
      // 頂點色差 — 加入汙漬斑塊（大範圍明暗 + 局部雜色）
      const coarse = hash(px * 1.5, py * 1.5, pz * 1.5)   // 大斑
      const fine   = hash(px * 8, py * 8, pz * 8)           // 細紋
      const v = 0.45 + coarse * 0.35 + fine * 0.2
      // 偶爾加入微量色相偏移（鏽蝕 / 苔蘚）
      const hueShift = (hash(px * 5.3, pz * 5.3, py * 2.1) - 0.5) * 0.08
      colors[i * 3]     = Math.min(1, baseColor.r * v + hueShift)
      colors[i * 3 + 1] = Math.min(1, baseColor.g * v - Math.abs(hueShift) * 0.5)
      colors[i * 3 + 2] = Math.min(1, baseColor.b * v)
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85 + Math.random() * 0.15,
      metalness: type === 'rebar' ? 0.55 : 0.02,
      flatShading: true,
    })

    return { geometry: geo, material: mat }
  }, [color, type])

  return (
    <mesh
      position={position} rotation={rotation} scale={scale}
      geometry={geometry} material={material}
      castShadow receiveShadow renderOrder={-1}
    />
  )
}

function Rain({ count = 1200, area = 30, height = 15, speed = 14 }) {
  const meshRef = useRef()
  // 每條雨絲 = 2 個頂點（上端 + 下端），形成細長線段
  const streakLen = 0.6          // 雨絲長度
  const windX = 4                // 水平風速（X 方向）→ 決定傾斜角度
  const windZ = -1.5             // 微量 Z 風

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 2 * 3)   // count 條線 × 2 端點 × xyz
    const vel = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * area
      const y = Math.random() * height
      const z = (Math.random() - 0.5) * area
      vel[i] = 0.8 + Math.random() * 0.4
      // 線段上端
      const bi = i * 6
      pos[bi]     = x;  pos[bi + 1] = y;  pos[bi + 2] = z
      // 線段下端（沿落下方向偏移 → 傾斜雨絲）
      const dx = (windX / speed) * streakLen
      const dz = (windZ / speed) * streakLen
      pos[bi + 3] = x + dx;  pos[bi + 4] = y - streakLen;  pos[bi + 5] = z + dz
    }
    return { positions: pos, velocities: vel }
  }, [count, area, height])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    const pos = meshRef.current.geometry.attributes.position.array
    const dy = speed * delta
    const dx = windX * delta
    const dz = windZ * delta
    for (let i = 0; i < count; i++) {
      const bi = i * 6
      // 移動兩端
      pos[bi]     += dx;  pos[bi + 1] -= dy * velocities[i];  pos[bi + 2] += dz
      pos[bi + 3] += dx;  pos[bi + 4] -= dy * velocities[i];  pos[bi + 5] += dz
      // 觸地重置
      if (pos[bi + 1] < -0.5) {
        const nx = (Math.random() - 0.5) * area
        const ny = height + Math.random() * 3
        const nz = (Math.random() - 0.5) * area
        const sdx = (windX / speed) * streakLen
        const sdz = (windZ / speed) * streakLen
        pos[bi]     = nx;       pos[bi + 1] = ny;              pos[bi + 2] = nz
        pos[bi + 3] = nx + sdx; pos[bi + 4] = ny - streakLen;  pos[bi + 5] = nz + sdz
      }
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true
  })

  const material = useMemo(() => new THREE.LineBasicMaterial({
    color: '#99aabb',
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  return (
    <lineSegments ref={meshRef} material={material}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count * 2}
          itemSize={3}
        />
      </bufferGeometry>
    </lineSegments>
  )
}

function Arena() {
  const debris = useMemo(() => {
    const items = []
    // 牆壁：混凝土灰、暗棕磚、深灰水泥
    const wallTypes  = ['slab', 'box', 'pillar']
    const wallColors = {
      slab:   ['#8a8078', '#6e6258', '#9c8e80', '#b0a090'],  // 水泥灰/米色
      box:    ['#5a4030', '#6b4423', '#4a3018'],              // 磚紅棕
      pillar: ['#707068', '#585850', '#908880'],              // 混凝土灰
    }
    // 地面碎石：每種類型有明顯不同色調
    const rubbleTypes = ['rock', 'chunk', 'slab', 'box', 'rebar']
    const rubbleColors = {
      rock:   ['#605848', '#787060', '#504838'],              // 岩石灰褐
      chunk:  ['#8b4513', '#a0522d', '#6b3410'],              // 紅褐色碎塊
      slab:   ['#989088', '#807870', '#a8a098'],              // 淺灰水泥板
      box:    ['#5c4a38', '#4a3828', '#6e5c48'],              // 深棕木板
      rebar:  ['#b87333', '#c08040', '#8b5a2b', '#d4874a'],   // 鏽橘色鋼筋
    }

    while (items.length < 80) {
      const x = (Math.random() - 0.5) * 35
      const z = (Math.random() - 0.5) * 35
      // 排除區 = 可視戰場範圍 + 一點點餘裕
      if (Math.abs(x) < 6 && z > -16 && z < 16) continue

      const isWall = items.length < 12
      const type = isWall
        ? wallTypes[Math.floor(Math.random() * wallTypes.length)]
        : rubbleTypes[Math.floor(Math.random() * rubbleTypes.length)]

      const palette = isWall ? wallColors[type] : rubbleColors[type]
      const chosenColor = palette[Math.floor(Math.random() * palette.length)]

      // 計算 scale，再用 scaleY 算出正確 Y 讓底部貼地
      let sx, sy, sz
      if (isWall) {
        if (type === 'pillar') {
          sx = 0.8 + Math.random() * 0.5
          sy = Math.random() * 5 + 3
          sz = 0.8 + Math.random() * 0.5
        } else {
          sx = Math.random() * 3 + 1
          sy = Math.random() * 6 + 2
          sz = 0.3 + Math.random() * 0.5
        }
      } else if (type === 'rebar') {
        sx = 1; sy = Math.random() * 2 + 1; sz = 1
      } else {
        sx = Math.random() * 1.5 + 0.3
        sy = 0.15 + Math.random() * 0.6
        sz = Math.random() * 1.5 + 0.3
      }

      // 讓物體底部落在地面（y=0）上
      // box / slab 高度中心 = sy*0.5, cylinder(pillar/rebar) 也是 sy*0.5
      // rock / chunk 半徑 ≈ sy*0.5
      const baseY = isWall ? sy * 0.5 : (type === 'rock' || type === 'chunk' ? sy * 0.25 : sy * 0.5)
      const groundY = isWall ? baseY : baseY * 0.6 - 0.05  // 地面碎石略微嵌入地表

      items.push({
        position: [x, groundY, z],
        scale: [sx, sy, sz],
        rotation: [
          (Math.random() - 0.5) * (isWall ? 0.12 : 0.4),
          Math.random() * Math.PI,
          (Math.random() - 0.5) * (isWall ? 0.08 : 0.35)
        ],
        color: chosenColor,
        type
      })
    }
    return items
  }, [])

  const groundGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(60, 60, 64, 64)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)

    const hash = (x, y) => {
      let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
      return h - Math.floor(h)
    }

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i)

      // 戰場中心區域（喪屍活動範圍）壓平，外圍才有起伏
      const distX = Math.abs(px), distZ = Math.abs(py)
      const inArena = distX < 12 && distZ < 8
      const edgeFade = inArena ? 0 : Math.min(1, (Math.max(distX - 12, distZ - 8, 0)) / 5)

      // 多層噪波起伏（乘以 edgeFade，中心區 = 0）
      const n1 = (hash(px * 0.15, py * 0.15) - 0.5) * 0.5
      const n2 = (hash(px * 0.5, py * 0.5) - 0.5) * 0.18
      const n3 = (hash(px * 2.0, py * 2.0) - 0.5) * 0.05
      pos.setZ(i, (n1 + n2 + n3) * edgeFade)

      // 頂點色 — 更深的廢土色調
      const coarse = hash(px * 0.2, py * 0.2)
      const fine   = hash(px * 1.5, py * 1.5)
      const detail = hash(px * 5, py * 5)
      const v = 0.35 + coarse * 0.25 + fine * 0.12 + detail * 0.05
      // 基底色更深
      const brownMix = hash(px * 0.3 + 100, py * 0.3 + 100)
      const r = (0.16 + brownMix * 0.10) * v
      const g = (0.11 + brownMix * 0.06) * v
      const b = (0.06 + brownMix * 0.03) * v
      // 偶爾深色污漬
      const stain = hash(px * 0.8 + 50, py * 0.8 + 50) < 0.2 ? 0.5 : 1.0
      colors[i * 3]     = Math.min(1, r * stain)
      colors[i * 3 + 1] = Math.min(1, g * stain)
      colors[i * 3 + 2] = Math.min(1, b * stain)
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <>
      <Sky distance={450000} sunPosition={[0, -0.15, 0]} inclination={0} azimuth={1.25} rayleigh={0.2} turbidity={20} />
      <Sparkles count={80} scale={20} size={1.5} speed={0.4} opacity={0.3} color="#ff6666" />
      <Rain />
      <fog attach="fog" args={['#1a0e06', 8, 35]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={groundGeo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0.0} flatShading />
      </mesh>

      {debris.map((d, i) => <Debris key={i} {...d} />)}

      <ambientLight intensity={2.5} />
      <hemisphereLight intensity={1.2} skyColor="#ff4400" groundColor="#220000" />
      <pointLight position={[15, 10, 10]} intensity={40} color="#ff6633" distance={40} decay={2} castShadow
        shadow-mapSize-width={512} shadow-mapSize-height={512} />
      <pointLight position={[-15, 12, -10]} intensity={30} color="#ff2200" distance={40} decay={2} castShadow
        shadow-mapSize-width={512} shadow-mapSize-height={512} />
      <pointLight position={[0, 15, 5]} intensity={25} color="#ffffff" distance={30} decay={2} castShadow
        shadow-mapSize-width={512} shadow-mapSize-height={512} />
      <directionalLight position={[5, 25, 15]} intensity={5} color="#ffffff" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-15} shadow-camera-right={15}
        shadow-camera-top={15} shadow-camera-bottom={-15}
        shadow-camera-near={0.5} shadow-camera-far={50} />
      <directionalLight position={[-5, 20, 10]} intensity={3} color="#ff8866" castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    </>
  )
}

function App() {
  const [loading, setLoading] = useState(true)
  const [gameState, setGameState] = useState('FETCHING')
  const [playerHero, setPlayerHero] = useState(null)
  const [enemyHero, setEnemyHero] = useState(null)
  const [heroesList, setHeroesList] = useState([])
  const [turn, setTurn] = useState(0)
  const turnRef = useRef(0)
  const [log, setLog] = useState('正在尋找倖存的人類樣本...')
  const [damagePopups, setDamagePopups] = useState([])
  const [playerHurtSignal, setPlayerHurtSignal] = useState(0)
  const [enemyHurtSignal, setEnemyHurtSignal] = useState(0)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  useEffect(() => { speedRef.current = speed }, [speed])

  // 6 slots per side: 3 rows × 2 columns (indices: row0:0-1, row1:2-3, row2:4-5)
  const emptySlots = Array(6).fill(null)
  const [playerSlots, setPlayerSlots] = useState(emptySlots)
  const [enemySlots, setEnemySlots] = useState(emptySlots)
  // refs that always mirror latest slot state (avoid stale closure in async battle loop)
  const pSlotsRef = useRef(emptySlots)
  const eSlotsRef = useRef(emptySlots)
  // Wrapper setters that keep refs in immediate sync (useEffect is too late for async loops)
  const updatePlayerSlots = useCallback((updater) => {
    setPlayerSlots(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      pSlotsRef.current = next
      return next
    })
  }, [])
  const updateEnemySlots = useCallback((updater) => {
    setEnemySlots(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      eSlotsRef.current = next
      return next
    })
  }, [])
  // per-actor state map + ref helper for synchronous updates
  const [actorStates, setActorStates] = useState({})
  const actorStatesRef = useRef({})
  const setActorState = (id, s) => {
    actorStatesRef.current = { ...actorStatesRef.current, [id]: s }
    setActorStates(actorStatesRef.current)
  }

  // ── 過場幕狀態 ──
  const [curtainVisible, setCurtainVisible] = useState(true)
  const [curtainFading, setCurtainFading] = useState(false)
  const [curtainText, setCurtainText] = useState('掃描倖存者中...')
  const initialReady = useRef(false)
  const modelsReadyCount = useRef(0)

  const handleModelReady = useCallback(() => {
    modelsReadyCount.current++
    if (!initialReady.current && modelsReadyCount.current >= 2) {
      initialReady.current = true
      setTimeout(() => {
        setCurtainFading(true)
        setTimeout(() => setCurtainVisible(false), 1000)
      }, 500)
    }
  }, [])

  // Refs used to await model action completion during battle (per-actor)
  const actionResolveRefs = useRef({})
  const waitForAction = useCallback((uid) => {
    return new Promise(resolve => { actionResolveRefs.current[uid] = resolve })
  }, [])
  const handleActorActionDone = useCallback((uid) => {
    try {
      const r = actionResolveRefs.current[uid]
      if (r) {
        r()
        delete actionResolveRefs.current[uid]
      }
    } catch (e) { }
  }, [])

  // Refs used to await movement (advance to center / retreat to base)
  const moveResolveRefs = useRef({})
  const waitForMove = useCallback((uid) => {
    return new Promise(resolve => { moveResolveRefs.current[uid] = resolve })
  }, [])
  const handleMoveDone = useCallback((uid) => {
    try {
      const r = moveResolveRefs.current[uid]
      if (r) { r(); delete moveResolveRefs.current[uid] }
    } catch (e) { }
  }, [])

  const addDamage = (targetUid, value) => {
    const id = Math.random()
    setDamagePopups(prev => [...prev, { id, uid: targetUid, value }])
    setTimeout(() => setDamagePopups(prev => prev.filter(p => p.id !== id)), 1500)
  }

  // 安全閥：8 秒內模型未就緒則強制收起
  useEffect(() => {
    const t = setTimeout(() => {
      if (!initialReady.current) {
        initialReady.current = true
        setCurtainFading(true)
        setTimeout(() => setCurtainVisible(false), 1000)
      }
    }, 8000)
    return () => clearTimeout(t)
  }, [])

  const fetchData = useRef(null)
  fetchData.current = () => {
    return fetch(API_URL)
      .then(res => res.json())
      .then(data => {
        setHeroesList(data || [])
        if (data && data.length > 0) {
          setPlayerHero({ ...data[0], currentHP: data[0].HP })
          setEnemyHero(data[1] ? { ...data[1], currentHP: data[1].HP } : { ...data[0], Name: '複製喪屍', currentHP: data[0].HP })

          // Auto-fill enemy slots: choose random 1..min(6, data.length) unique entries
          try {
            const avail = [...data]
            const maxPick = Math.min(6, avail.length)
            const pickCount = Math.floor(Math.random() * maxPick) + 1
            const chosen = []
            for (let i = 0; i < pickCount; i++) {
              const idx = Math.floor(Math.random() * avail.length)
              chosen.push(avail.splice(idx, 1)[0])
            }
            const newEnemySlots = Array(6).fill(null)
            for (let i = 0; i < chosen.length; i++) {
              const mid = normalizeModelId(chosen[i], i)
              newEnemySlots[i] = { ...chosen[i], slot: i, currentHP: chosen[i].HP, _uid: `${mid}_${Date.now()}_${i}`, _modelId: mid, ModelID: mid }
            }
            updateEnemySlots(newEnemySlots)
          } catch (e) {
            // ignore if anything goes wrong
          }

          setGameState('IDLE')
          setLog('戰鬥準備就緒')
        }
        setLoading(false)
      })
      .catch(() => {
        setLog('通訊設施已毀壞')
        setLoading(false)
      })
  }

  // 初始載入
  useEffect(() => {
    fetchData.current()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resetGame = () => {
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('重新啟動循環...')

    setTimeout(() => {
      setGameState('FETCHING')
      setTurn(0)
      turnRef.current = 0
      setLog('正在尋找倖存的人類樣本...')
      setDamagePopups([])
      updatePlayerSlots(emptySlots)
      updateEnemySlots(emptySlots)
      actorStatesRef.current = {}
      setActorStates({})
      setPlayerHurtSignal(0)
      setEnemyHurtSignal(0)
      fetchData.current().finally(() => {
        setTimeout(() => {
          setCurtainFading(true)
          setTimeout(() => setCurtainVisible(false), 1000)
        }, 800)
      })
    }, 600)
  }

  // Battle loop: process actors from both sides (slots) in speed order until one side is wiped
  const runBattleLoop = async () => {
    setGameState('BATTLE')
    turnRef.current = 1
    setTurn(1)
    // helper to compute speed
    const getSpeed = (h) => h.SPD || h.SPEED || h.AGI || h.ATK || 1
    const delay = (ms) => new Promise(r => setTimeout(r, ms / speedRef.current))

    while (true) {
      const players = pSlotsRef.current.map((p, i) => p ? ({ side: 'player', slot: i, hero: p }) : null).filter(Boolean)
      const enemies = eSlotsRef.current.map((e, i) => e ? ({ side: 'enemy', slot: i, hero: e }) : null).filter(Boolean)
      if (players.length === 0 || enemies.length === 0) break

      // build actor list
      const actors = [...players, ...enemies].map(a => ({ ...a, speed: getSpeed(a.hero) }))
      actors.sort((a, b) => b.speed - a.speed)

      for (const actor of actors) {
        // re-check alive (slot may have changed)
        const curSideSlots = actor.side === 'player' ? pSlotsRef.current : eSlotsRef.current
        const actorEntry = curSideSlots[actor.slot]
        if (!actorEntry || actorEntry.currentHP <= 0) continue

        const uid = actorEntry._uid
        setLog(`ROUND ${turnRef.current}：${actor.side === 'player' ? '玩家' : '敵人'} ${actorEntry.Name} 發動攻擊`)

        // ── select target FIRST (before movement) ──
        // 2-column × 3-row layout
        // Slot indices: row0: 0-1, row1: 2-3, row2: 4-5
        // Front column = closer to center of arena:
        //   Enemy front col = col 0 (x=2.0) → indices 0,2,4; back col = col 1 (x=4.5) → indices 1,3,5
        //   Player front col = col 1 (x=-2.0) → indices 1,3,5; back col = col 0 (x=-4.5) → indices 0,2,4
        const targetSlotsSnap = actor.side === 'player' ? eSlotsRef.current : pSlotsRef.current
        const actorRow = Math.floor(actor.slot / 2)  // 0,1,2

        // Determine front/back column indices for the TARGET side
        let frontIndices, backIndices
        if (actor.side === 'player') {
          frontIndices = [0, 2, 4]
          backIndices = [1, 3, 5]
        } else {
          frontIndices = [1, 3, 5]
          backIndices = [0, 2, 4]
        }

        let target = null

        // Priority 1: front column — same row first (對位), then other rows
        const frontSameRow = frontIndices.find(idx => Math.floor(idx / 2) === actorRow)
        if (frontSameRow !== undefined) {
          const cand = targetSlotsSnap[frontSameRow]
          if (cand && cand.currentHP > 0) target = { ...cand, slot: frontSameRow }
        }
        if (!target) {
          for (const idx of frontIndices) {
            if (idx === frontSameRow) continue
            const cand = targetSlotsSnap[idx]
            if (cand && cand.currentHP > 0) { target = { ...cand, slot: idx }; break }
          }
        }

        // Priority 2: back column — ONLY if NO front column targets alive
        if (!target) {
          const anyFrontAlive = frontIndices.some(idx => {
            const c = targetSlotsSnap[idx]
            return c && c.currentHP > 0
          })
          if (!anyFrontAlive) {
            const backSameRow = backIndices.find(idx => Math.floor(idx / 2) === actorRow)
            if (backSameRow !== undefined) {
              const cand = targetSlotsSnap[backSameRow]
              if (cand && cand.currentHP > 0) target = { ...cand, slot: backSameRow }
            }
            if (!target) {
              for (const idx of backIndices) {
                if (idx === backSameRow) continue
                const cand = targetSlotsSnap[idx]
                if (cand && cand.currentHP > 0) { target = { ...cand, slot: idx }; break }
              }
            }
          }
        }

        // Fallback: any alive at all
        if (!target) {
          for (let si = 0; si < targetSlotsSnap.length; si++) {
            const cand = targetSlotsSnap[si]
            if (cand && cand.currentHP > 0) { target = { ...cand, slot: si }; break }
          }
        }
        if (!target) continue

        // ── 1) ADVANCE to center ──
        setActorState(uid, 'ADVANCING')
        await waitForMove(uid)

        // ── 2) Play ATTACK animation at center ──
        setActorState(uid, 'ATTACKING')
        await waitForAction(uid)

        // ── 3) Apply damage to target (while attacker is still at center) ──
        // trigger hurt animation on target
        setActorState(target._uid, 'HURT')
        if (actor.side === 'player') setEnemyHurtSignal(s => s + 1)
        else setPlayerHurtSignal(s => s + 1)
        await new Promise(r => requestAnimationFrame(() => r()))

        const dmg = actorEntry.ATK || actorEntry.hero?.ATK || 1
        addDamage(target._uid, dmg)
        let died = false
        if (actor.side === 'player') {
          await new Promise(resolve => {
            updateEnemySlots(prev => {
              const ns = [...prev]
              if (!ns[target.slot]) { resolve(); return ns }
              const curHP = ns[target.slot].currentHP || 0
              const nextHP = Math.max(0, curHP - dmg)
              ns[target.slot] = { ...ns[target.slot], currentHP: nextHP }
              died = nextHP <= 0
              resolve()
              return ns
            })
          })
          if (died) {
            const deadUid = target._uid
            setActorState(deadUid, 'DEAD')
            await waitForAction(deadUid)
            updateEnemySlots(prev => { const ns = [...prev]; ns[target.slot] = null; return ns })
          }
        } else {
          await new Promise(resolve => {
            updatePlayerSlots(prev => {
              const ns = [...prev]
              if (!ns[target.slot]) { resolve(); return ns }
              const curHP = ns[target.slot].currentHP || 0
              const nextHP = Math.max(0, curHP - dmg)
              ns[target.slot] = { ...ns[target.slot], currentHP: nextHP }
              died = nextHP <= 0
              resolve()
              return ns
            })
          })
          if (died) {
            const deadUid = target._uid
            setActorState(deadUid, 'DEAD')
            await waitForAction(deadUid)
            updatePlayerSlots(prev => { const ns = [...prev]; ns[target.slot] = null; return ns })
          }
        }

        // ── 4) RETREAT back to base ──
        setActorState(uid, 'RETREATING')
        await waitForMove(uid)
        // 5) Return to idle
        setActorState(uid, 'IDLE')
        await delay(120)
      }

      turnRef.current += 1
      setTurn(turnRef.current)
    }

    // decide winner (read from refs for latest state)
    const leftAlive = pSlotsRef.current.some(s => s && s.currentHP > 0)
    const rightAlive = eSlotsRef.current.some(s => s && s.currentHP > 0)
    if (leftAlive && !rightAlive) {
      setLog('戰鬥結果：你生存了下來，但代價是什麼？')
      setGameState('GAMEOVER')
    } else if (!leftAlive && rightAlive) {
      setLog('戰鬥結果：你淪為了它們的一員...')
      setGameState('GAMEOVER')
    } else {
      setLog('戰鬥結束')
      setGameState('IDLE')
    }
  }

  const startAutoBattle = () => {
    if (gameState !== 'IDLE') return
    runBattleLoop()
  }

  const responsive = useResponsive()
  const [selectedSlot, setSelectedSlot] = useState(null)
  const dragSourceRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const dragPosRef = useRef(new THREE.Vector3())
  const dragOffsetRef = useRef(new THREE.Vector3())
  const dragPointerIdRef = useRef(null)

  // Slot positions (6 per side): 3 rows × 2 columns, player on LEFT, enemy on RIGHT
  // Indices: row0: 0-1, row1: 2-3, row2: 4-5 (left->right within the side)
  const rowZ = [-3.0, 0.0, 3.0]
  const playerColsX = [-4.5, -2.0] // two columns for player (left side)
  const enemyColsX = [2.0, 4.5]    // two columns for enemy (right side)

  const playerSlotPositions = [
    [playerColsX[0], 0, rowZ[0]], [playerColsX[1], 0, rowZ[0]],
    [playerColsX[0], 0, rowZ[1]], [playerColsX[1], 0, rowZ[1]],
    [playerColsX[0], 0, rowZ[2]], [playerColsX[1], 0, rowZ[2]],
  ]

  const enemySlotPositions = [
    [enemyColsX[0], 0, rowZ[0]], [enemyColsX[1], 0, rowZ[0]],
    [enemyColsX[0], 0, rowZ[1]], [enemyColsX[1], 0, rowZ[1]],
    [enemyColsX[0], 0, rowZ[2]], [enemyColsX[1], 0, rowZ[2]],
  ]

  const normalizeModelId = (h, idx = 0) => {
    let id = h && (h.ModelID || h.id || h.Model || h.ModelId)
    if (!id) id = `zombie_${idx + 1}`
    id = id.toString().trim()
    // If id is a bare number (e.g. "1", "2", "3"), prefix with "zombie_"
    if (/^\d+$/.test(id)) id = `zombie_${id}`
    // If still not in zombie_N format, fallback
    if (!id.startsWith('zombie')) id = `zombie_${idx + 1}`
    return id
  }

  // Thumbnail click: toggle hero into first empty player slot or remove if already present
  const handleThumbnailClick = (h) => {
    if (!h) return
    const uid = h.id || h.ModelID || h.Name
    const existsIndex = playerSlots.findIndex(s => s && (s.id === uid || s.ModelID === h.ModelID || s.Name === h.Name))
    if (existsIndex !== -1) {
      // remove if already present
      const ns = [...playerSlots]
      ns[existsIndex] = null
      updatePlayerSlots(ns)
      return
    }
    // If a slot is selected, place into that slot; otherwise place into first empty
    // Priority: prefer front row (numbers 1-3) then back row (4-6)
    // Our index mapping is: right-col top->bottom = 1,2,3 => indices [1,3,5]; left-col top->bottom = 4,5,6 => [0,2,4]
    const priorityOrder = [1, 3, 5, 0, 2, 4]
    let targetIndex = (selectedSlot != null) ? selectedSlot : -1
    if (targetIndex === -1 || targetIndex == null) {
      for (let pi of priorityOrder) {
        if (playerSlots[pi] == null) { targetIndex = pi; break }
      }
    }
    if (targetIndex === -1 || targetIndex == null) {
      setLog('已無可用上陣位置')
      return
    }
    const idx = heroesList.indexOf(h)
    const mid = normalizeModelId(h, idx >= 0 ? idx : 0)
    const newHero = { ...h, currentHP: h.HP, _uid: `${mid}_${Date.now()}`, _modelId: mid, ModelID: mid }
    const ns = [...playerSlots]
    ns[targetIndex] = newHero
    updatePlayerSlots(ns)
    // clear selection after placing
    setSelectedSlot(null)
  }

  const handleSlotClick = (i) => {
    // slots are not clickable per new UX
  }

  // Drag lifecycle: start drag from hero at index i with event.point and base pos
  const startDrag = (i, pointerOrPoint) => {
    dragSourceRef.current = i
    setDragging(true)
    const basePos = new THREE.Vector3(...playerSlotPositions[i])
    let ip = basePos
    if (pointerOrPoint && pointerOrPoint.point) {
      ip = pointerOrPoint.point
      try { dragPointerIdRef.current = pointerOrPoint.pointerId } catch (e) { dragPointerIdRef.current = null }
    } else if (pointerOrPoint && typeof pointerOrPoint.x === 'number') {
      ip = pointerOrPoint
    }
    // Force y=0 to match the ground plane used by subsequent pointermove raycasts;
    // otherwise clicking the model surface (e.g. y=1.2) creates a negative y offset
    // that buries the model underground during drag.
    const projected = (ip || basePos).clone()
    projected.y = 0
    dragPosRef.current.copy(projected)
    dragOffsetRef.current.copy(new THREE.Vector3().subVectors(basePos, dragPosRef.current))
  }

  const clearDrag = () => {
    dragSourceRef.current = null
    setSelectedSlot(null)
    setDragging(false)
  }

  const findNearestPlayerSlot = (point) => {
    if (!point) return { idx: -1, dist: Infinity }
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < playerSlotPositions.length; i++) {
      const p = playerSlotPositions[i]
      const d = Math.hypot(p[0] - point.x, p[2] - point.z)
      if (d < bestD) { bestD = d; best = i }
    }
    return { idx: best, dist: bestD }
  }

  const endDragAt = (point) => {
    const s = dragSourceRef.current
    if (s == null) { clearDrag(); return }
    const dropPoint = point || dragPosRef.current
    const { idx, dist } = findNearestPlayerSlot(dropPoint)
    const threshold = 1.5
    const ns = [...playerSlots]
    if (idx !== -1 && dist <= threshold) {
      // swap positions between s and idx
      const tmp = ns[s]
      ns[s] = ns[idx]
      ns[idx] = tmp
      updatePlayerSlots(ns)
    } else {
      // revert: nothing to do because Hero will render from base positions
    }
    clearDrag()
  }

  // DragPlane: when dragging is enabled, track pointer move and release in world space (y=0 plane)
  function DragPlane({ enabled }) {
    const { gl, camera } = useThree()
    useEffect(() => {
      if (!enabled) return
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.25)  // intersect at y=1.25 (model center height)
      const tmpV = new THREE.Vector3()
      const onMove = (e) => {
        const rect = gl.domElement.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        const pointer = new THREE.Vector2(x, y)
        const ray = new THREE.Raycaster()
        ray.setFromCamera(pointer, camera)
        const ip = ray.ray.intersectPlane(plane, tmpV)
        if (ip) {
          dragPosRef.current.copy(ip)
        }
      }
      const onUp = (e) => {
        const rect = gl.domElement.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        const pointer = new THREE.Vector2(x, y)
        const ray = new THREE.Raycaster()
        ray.setFromCamera(pointer, camera)
        const ip = ray.ray.intersectPlane(plane, tmpV)
        endDragAt(ip)
        try {
          if (dragPointerIdRef.current != null && gl.domElement.releasePointerCapture) {
            gl.domElement.releasePointerCapture(dragPointerIdRef.current)
            dragPointerIdRef.current = null
          }
        } catch (err) { /* ignore */ }
      }
      // listen on both canvas and window: pointer capture may send events to the captured target
      gl.domElement.addEventListener('pointermove', onMove)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      // If we have a pointerId from startDrag, ensure the canvas captures it so we reliably receive events
      try {
        if (dragPointerIdRef.current != null && gl.domElement.setPointerCapture) {
          gl.domElement.setPointerCapture(dragPointerIdRef.current)
        }
      } catch (err) { /* ignore */ }
      
      return () => {
        gl.domElement.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        try {
          if (dragPointerIdRef.current != null && gl.domElement.releasePointerCapture) {
            gl.domElement.releasePointerCapture(dragPointerIdRef.current)
            dragPointerIdRef.current = null
          }
        } catch (err) { /* ignore */ }
      }
    }, [enabled, gl, camera])
    return null
  }

  const removeFromSlot = (i) => {
    const ns = [...playerSlots]
    ns[i] = null
    updatePlayerSlots(ns)
    if (selectedSlot === i) setSelectedSlot(null)
  }

  const selectedIds = playerSlots.filter(Boolean).map(h => h._modelId || h.ModelID || h.id || h.Name)

  // On-screen debug overlay (show recent debug events)
  function DebugOverlay() {
    const [tick, setTick] = useState(0)
    useEffect(() => {
      const id = setInterval(() => setTick(t => (t + 1) % 100000), 500)
      return () => clearInterval(id)
    }, [])
    const items = (window.__GG_DEBUG_EVENTS || []).slice(-12).reverse()
    return (
      <div style={{ position: 'absolute', right: 8, top: 8, zIndex: 9999, pointerEvents: 'none', width: '320px' }}>
        <div style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '8px', fontSize: '12px', borderRadius: '6px', maxHeight: '220px', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>DBG</div>
          {items.map((it, idx) => <div key={idx} style={{ opacity: 0.9, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{it}</div>)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100dvh', background: '#020202', position: 'relative', overflow: 'hidden', touchAction: 'none' }}>
      {/* ── 3D Canvas (底層) ── */}
      <Canvas
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        camera={{ position: responsive.camPos, fov: responsive.fov }}
        shadows
        dpr={responsive.dpr}
        onCreated={({ gl }) => {
          if (gl && gl.shadowMap) {
            gl.shadowMap.enabled = true
            gl.shadowMap.type = THREE.PCFShadowMap
          }
        }}
      >
        <Suspense fallback={null}>
          <Arena />
          {/* battlefield slot markers (visual only) */}
          {!loading && playerSlotPositions.map((pos, i) => (
            <SlotMarker key={`slot${i}`} position={pos} index={i} selected={false} />
          ))}
          {/* enemy slot markers (visual only) */}
          {!loading && enemySlotPositions.map((pos, i) => (
            <SlotMarker key={`enslot${i}`} position={pos} index={i} selected={false} color={'#ff4444'} onClick={() => { /* no-op */ }} onDragStart={() => {}} onDrop={() => {}} />
          ))}
          {/* Render player slots (Heroes are interactive/draggable) */}
          {!loading && playerSlots.map((p, i) => p && (
              <Hero
              key={`p${i}`}
              position={playerSlotPositions[i]}
              heroData={p}
              isPlayer={true}
              uid={p._uid}
              actorState={actorStates[p._uid]}
              gameState={gameState}
              damagePopups={damagePopups.filter(d => d.uid === p._uid)}
              onModelReady={handleModelReady}
              onActionDone={() => handleActorActionDone(p._uid)}
              onMoveDone={handleMoveDone}
              hurtSignal={playerHurtSignal}
              textScale={responsive.textScale}
              onDragStart={(e) => { e && e.stopPropagation(); startDrag(i, e); }}
              onDrop={(e) => { /* noop: global DragPlane handles release */ }}
              slotIndex={i}
              dragSourceRef={dragSourceRef}
              dragPosRef={dragPosRef}
              dragOffsetRef={dragOffsetRef}
              isDragActive={dragging}
            />
          ))}

          {/* Global drag tracker (active only while dragging) */}
          <DragPlane enabled={dragging} />

          {/* Render enemy slots */}
          {!loading && enemySlots.map((e, i) => e && (
            <Hero
              key={`e${i}`}
              position={enemySlotPositions[i]}
              heroData={e}
              isPlayer={false}
              uid={e._uid}
              actorState={actorStates[e._uid]}
              gameState={gameState}
              damagePopups={damagePopups.filter(d => d.uid === e._uid)}
              onModelReady={handleModelReady}
              onActionDone={() => handleActorActionDone(e._uid)}
              onMoveDone={handleMoveDone}
              hurtSignal={enemyHurtSignal}
              textScale={responsive.textScale}
            />
          ))}
          <ResponsiveCamera fov={responsive.fov} position={responsive.camPos} target={responsive.camTarget} />
        </Suspense>
      </Canvas>

      {/* ── 直式提示 ── */}
      {responsive.device === 'mobile' && responsive.isPortrait && (
        <div className="orient-hint">
          <span className="orient-icon">📱↻</span>
          橫向持握體驗更佳
        </div>
      )}

      {/* ── HUD ── */}
      <div className="game-hud">
        <div className="hud-center">
          <h1 className="hud-title">全球感染</h1>
          <div className="hud-log">
            {gameState === 'IDLE' ? '等待指令' : log}
          </div>
          {turn > 0 && <div className="hud-round">ROUND {turn}</div>}
        </div>
      </div>

      {/* Player slot UI removed — slots are now on the battlefield as clickable markers */}

      {gameState === 'IDLE' && turn === 0 && (
        <div className="btn-bottom-center">
          <button onClick={startAutoBattle} className="btn-start">進入屠殺</button>
        </div>
      )}

      {gameState === 'GAMEOVER' && (
        <div className="btn-bottom-center">
          <button onClick={resetGame} className="btn-reset">重啟循環</button>
        </div>
      )}

      {gameState !== 'IDLE' && gameState !== 'FETCHING' && gameState !== 'GAMEOVER' && (
        <div className="btn-speed-wrap">
          <button
            onClick={() => setSpeed(s => { const order = [1, 2, 4]; return order[(order.indexOf(s) + 1) % 3] })}
            className="btn-speed"
          >
            x{speed}
          </button>
        </div>
      )}

      <ThumbnailList heroes={heroesList} onThumbClick={handleThumbnailClick} selectedIds={selectedIds} />
      {/* Debug overlay removed */}
      <TransitionOverlay visible={curtainVisible} fading={curtainFading} text={curtainText} />
    </div>
  )
}

export default App
