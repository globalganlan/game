import { useState, useEffect, useRef, Suspense, useMemo } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, Billboard, Text, Sparkles, Sky, useAnimations } from '@react-three/drei'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import * as THREE from 'three'

// Suppress THREE.Clock deprecation warning (internal to R3F)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('THREE.Clock: This module has been deprecated')) return;
  originalWarn(...args);
};

const API_URL = 'https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec'

function DamagePopup({ value, position }) {
  const ref = useRef()
  const [opacity, setOpacity] = useState(1)

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.position.y += delta * 1.5
      setOpacity(prev => Math.max(0, prev - delta * 0.8))
    }
  })

  if (opacity <= 0) return null

  return (
    <Billboard position={position} ref={ref}>
      <Text fontSize={0.8} color="#ff0000" outlineColor="white" outlineWidth={0.05} fillOpacity={opacity} outlineOpacity={opacity}>
        -{value}
      </Text>
    </Billboard>
  )
}

/**
 * OBJ 與 FBX 頂點數完全一致（同一個 mesh），直接按索引 1:1 複製頂點色彩
 */
function transferVertexColors(fbxScene, objModel) {
  // 從 OBJ 收集頂點色彩
  const objColors = []
  objModel.traverse((child) => {
    if (child.isMesh && child.geometry.attributes.color) {
      objColors.push(child.geometry.attributes.color)
    }
  })
  if (objColors.length === 0) return

  // 對每個 FBX mesh 套用色彩
  let colorIdx = 0
  fbxScene.traverse((child) => {
    if (!(child.isMesh || child.isSkinnedMesh)) return
    const fbxPos = child.geometry.attributes.position
    if (!fbxPos || colorIdx >= objColors.length) return

    const objCol = objColors[colorIdx]
    const count = Math.min(fbxPos.count, objCol.count)
    const colors = new Float32Array(fbxPos.count * 3)

    for (let i = 0; i < count; i++) {
      colors[i * 3] = objCol.getX(i)
      colors[i * 3 + 1] = objCol.getY(i)
      colors[i * 3 + 2] = objCol.getZ(i)
    }

    child.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    child.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
    child.castShadow = true
    child.receiveShadow = true
    colorIdx++
  })
}

function ZombieModel({ isPlayer, state }) {
  const zombieId = isPlayer ? 'zombie_1' : 'zombie_2'
  const modelFolder = `${import.meta.env.BASE_URL}models/${zombieId}`

  // 載入 OBJ（頂點色彩來源）
  const objModel = useLoader(OBJLoader, `${modelFolder}/mesh.obj`)

  // 載入 Mixamo FBX 動畫
  const idle = useLoader(FBXLoader, `${modelFolder}/${zombieId}_idle.fbx`)
  const attack = useLoader(FBXLoader, `${modelFolder}/${zombieId}_attack.fbx`)
  const hurt = useLoader(FBXLoader, `${modelFolder}/${zombieId}_hurt.fbx`)
  const dying = useLoader(FBXLoader, `${modelFolder}/${zombieId}_dying.fbx`)

  // 用 SkeletonUtils.clone 正確克隆 SkinnedMesh + 骨骼，再轉移頂點色彩
  const { scene, modelScale } = useMemo(() => {
    const cloned = SkeletonUtils.clone(idle)
    transferVertexColors(cloned, objModel)

    // 計算模型高度，動態決定 scale 讓角色約 2.5 單位高
    const bbox = new THREE.Box3().setFromObject(cloned)
    const height = bbox.max.y - bbox.min.y
    const s = height > 0 ? 2.5 / height : 1
    return { scene: cloned, modelScale: s }
  }, [idle, objModel])

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
  const { actions } = useAnimations(animations, scene)

  // 播放對應狀態的動畫 — 用 crossFade 避免切換時回到 bind pose 造成下蹲
  useEffect(() => {
    if (!actions || !actions[state]) return

    const newAction = actions[state]

    if (state === 'DEAD') {
      newAction.setLoop(THREE.LoopOnce, 1)
      newAction.clampWhenFinished = true
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity)
    }

    if (prevActionRef.current && prevActionRef.current !== newAction) {
      newAction.reset()
      prevActionRef.current.crossFadeTo(newAction, 0.2, true)
      newAction.play()
    } else {
      newAction.reset().fadeIn(0.2).play()
    }

    prevActionRef.current = newAction
  }, [state, actions])

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

function Hero({ position, heroData, isPlayer, gameState, damagePopups }) {
  const meshRef = useRef()
  const [basePosition] = useState(position)

  const isAttacking = (isPlayer && gameState === 'PLAYER_ATTACKING') || (!isPlayer && gameState === 'ENEMY_ATTACKING')
  const isHurt = (isPlayer && gameState === 'ENEMY_STRIKING') || (!isPlayer && gameState === 'PLAYER_STRIKING')
  const isDead = heroData.currentHP <= 0

  useFrame((state, delta) => {
    if (isDead || !meshRef.current) return

    if (isAttacking) {
      const targetX = isPlayer ? basePosition[0] + 4 : basePosition[0] - 4
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetX, 0.2)
    } else {
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, basePosition[0], 0.1)
    }
  })

  const currentState = isDead ? 'DEAD' : (isAttacking ? 'ATTACKING' : (isHurt ? 'HURT' : 'IDLE'))

  return (
    <group position={basePosition} ref={meshRef} renderOrder={10}>
      <Suspense fallback={null}>
        <ZombieModel isPlayer={isPlayer} state={currentState} />
      </Suspense>

      {damagePopups.map(pop => (
        <DamagePopup key={pop.id} value={pop.value} position={[0, 4.5, 0]} />
      ))}

      <Billboard position={[0, 3.5, 0]} renderOrder={15}>
        <Text fontSize={0.4} color="white" outlineColor="black" outlineWidth={0.06}>
          {heroData.Name}
        </Text>
        <Text position={[0, -0.5, 0]} fontSize={0.3} color={isPlayer ? '#4ade80' : '#f87171'} outlineColor="black" outlineWidth={0.03}>
          HP: {Math.max(0, heroData.currentHP)}
        </Text>
      </Billboard>
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

    // 簡易 hash 讓相鄰頂點位移有連貫性（模擬粗糙起伏表面）
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

    while (items.length < 200) {
      const x = (Math.random() - 0.5) * 70
      const z = (Math.random() - 0.5) * 70
      // 排除區 = 可視戰場範圍 + 一點點餘裕
      if (Math.abs(x) < 5 && z > -5 && z < 13) continue

      const isWall = items.length < 30
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
    const geo = new THREE.PlaneGeometry(200, 200, 128, 128)
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
      <Sky distance={450000} sunPosition={[0, 0.1, 0]} inclination={0} azimuth={1.25} rayleigh={6} turbidity={10} />
      <Sparkles count={200} scale={40} size={1.5} speed={0.4} opacity={0.3} color="#ff6666" />
      <fog attach="fog" args={['#1a0e06', 10, 60]} />

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
  const [turn, setTurn] = useState(0)
  const [log, setLog] = useState('正在尋找倖存的人類樣本...')
  const [playerDamage, setPlayerDamage] = useState([])
  const [enemyDamage, setEnemyDamage] = useState([])
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  useEffect(() => { speedRef.current = speed }, [speed])

  const fetchData = useRef(null)
  fetchData.current = () => {
    return fetch(API_URL)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setPlayerHero({ ...data[0], currentHP: data[0].HP })
          setEnemyHero(data[1] ? { ...data[1], currentHP: data[1].HP } : { ...data[0], Name: '複製喪屍', currentHP: data[0].HP })
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
    setGameState('FETCHING')
    setTurn(0)
    setLog('正在尋找倖存的人類樣本...')
    setPlayerDamage([])
    setEnemyDamage([])
    fetchData.current()
  }

  const addDamage = (target, value) => {
    const id = Math.random()
    if (target === 'player') {
      setPlayerDamage(prev => [...prev, { id, value }])
      setTimeout(() => setPlayerDamage(prev => prev.filter(p => p.id !== id)), 1500)
    } else {
      setEnemyDamage(prev => [...prev, { id, value }])
      setTimeout(() => setEnemyDamage(prev => prev.filter(p => p.id !== id)), 1500)
    }
  }

  const runBattleStep = async (currentTurn, pHero, eHero) => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms / speedRef.current))
    setTurn(currentTurn)

    setGameState('PLAYER_ATTACKING')
    setLog(`ROUND ${currentTurn}：玩家發起進攻！`)
    await delay(600)

    setGameState('PLAYER_STRIKING')
    const dmgToEnemy = pHero.ATK
    addDamage('enemy', dmgToEnemy)
    const nextEHP = Math.max(0, eHero.currentHP - dmgToEnemy)
    const updatedEHero = { ...eHero, currentHP: nextEHP }
    setEnemyHero(updatedEHero)

    if (nextEHP <= 0) {
      setLog('戰鬥結果：你生存了下來，但代價是什麼？')
      setGameState('GAMEOVER')
      return
    }

    await delay(1000)

    setGameState('ENEMY_ATTACKING')
    setLog(`ROUND ${currentTurn}：敵人瘋狂撕咬！`)
    await delay(600)

    setGameState('ENEMY_STRIKING')
    const dmgToPlayer = eHero.ATK
    addDamage('player', dmgToPlayer)
    const nextPHP = Math.max(0, pHero.currentHP - dmgToPlayer)
    const updatedPHero = { ...pHero, currentHP: nextPHP }
    setPlayerHero(updatedPHero)

    if (nextPHP <= 0) {
      setLog('戰鬥結果：你淪為了它們的一員...')
      setGameState('GAMEOVER')
      return
    }

    await delay(1200)
    runBattleStep(currentTurn + 1, updatedPHero, updatedEHero)
  }

  const startAutoBattle = () => {
    if (gameState !== 'IDLE') return
    runBattleStep(1, playerHero, enemyHero)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020202', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, padding: '30px 60px',
        zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        color: '#eee'
      }}>
        <div style={{ width: '300px' }}>
          <h2 style={{ margin: 0, color: '#4ade80', fontSize: '1rem', opacity: 0.8 }}>{playerHero?.Name}</h2>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#4ade80' }}>HP {playerHero?.currentHP}</div>
        </div>

        <div style={{ flex: 1, textAlign: 'center', pointerEvents: 'auto' }}>
          <h1 style={{ margin: 0, color: '#ff1111', letterSpacing: '10px', fontSize: '2rem', textShadow: '0 0 20px rgba(255,0,0,0.6)' }}>ZOMBIE ARENA</h1>
          <div style={{
            background: 'rgba(0,0,0,0.6)', padding: '10px 25px', marginTop: '15px',
            borderRadius: '2px', display: 'inline-block', border: '1px solid #444',
            color: 'white', fontWeight: 'bold', fontSize: '0.9rem'
          }}>
            {gameState === 'IDLE' ? '等待指令' : log}
          </div>
          {turn > 0 && <div style={{ color: '#ffcc00', marginTop: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>ROUND {turn}</div>}
        </div>

        <div style={{ width: '300px', textAlign: 'right' }}>
          <h2 style={{ margin: 0, color: '#f87171', fontSize: '1rem', opacity: 0.8 }}>{enemyHero?.Name}</h2>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#f87171' }}>HP {enemyHero?.currentHP}</div>
        </div>
      </div>

      {gameState === 'IDLE' && turn === 0 && (
        <div style={{ position: 'absolute', bottom: 60, width: '100%', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
          <button onClick={startAutoBattle} style={{
            padding: '18px 70px', fontSize: '1.5rem', cursor: 'pointer', background: '#990000',
            color: 'white', border: '2px solid #ff0000', borderRadius: '4px', fontWeight: '900',
            boxShadow: '0 0 30px rgba(153,0,0,0.5)', transition: 'transform 0.1s'
          }}>
            進入屠殺
          </button>
        </div>
      )}

      {gameState === 'GAMEOVER' && (
        <div style={{ position: 'absolute', bottom: 60, width: '100%', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
          <button onClick={resetGame} style={{
            padding: '15px 40px', fontSize: '1.1rem', cursor: 'pointer', background: 'white',
            color: 'black', border: 'none', fontWeight: 'bold'
          }}>
            重啟循環
          </button>
        </div>
      )}

      {gameState !== 'IDLE' && gameState !== 'FETCHING' && gameState !== 'GAMEOVER' && (
        <div style={{ position: 'absolute', bottom: 20, right: 30, zIndex: 10 }}>
          <button
            onClick={() => setSpeed(s => { const order = [1, 2, 4]; return order[(order.indexOf(s) + 1) % 3] })}
            style={{
              padding: '8px 18px', fontSize: '1rem', cursor: 'pointer',
              background: 'rgba(50,50,50,0.85)', color: '#ff4444',
              border: '1px solid #666', borderRadius: '4px', fontWeight: 'bold',
            }}
          >
            x{speed}
          </button>
        </div>
      )}

      <Canvas camera={{ position: [0, 3, 10], fov: 45 }} shadows>
        <Suspense fallback={null}>
          <Arena />
          {!loading && playerHero && (
            <Hero
              position={[-3.5, 0, 0]}
              heroData={playerHero}
              isPlayer={true}
              gameState={gameState}
              damagePopups={playerDamage}
            />
          )}
          {!loading && enemyHero && (
            <Hero
              position={[3.5, 0, 0]}
              heroData={enemyHero}
              isPlayer={false}
              gameState={gameState}
              damagePopups={enemyDamage}
            />
          )}
          <OrbitControls
            target={[0, 1.5, 0]}
            enableRotate={false}
            enablePan={false}
            enableZoom={false}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

export default App
