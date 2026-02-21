import { useState, useEffect, useRef, Suspense, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Billboard, Text, Sparkles, Sky, useTexture } from '@react-three/drei'
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

function ZombiePart({ texture, offset = [0, 0], repeat = [1, 1], color, ...props }) {
  const tex = texture ? texture.clone() : null
  if (tex) {
    tex.offset.set(offset[0], offset[1])
    tex.repeat.set(repeat[0], repeat[1])
  }
  return (
    <mesh {...props}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={tex}
        color={texture ? 'white' : color}
        roughness={0.8}
        transparent={!!texture}
        alphaTest={0.5}
      />
    </mesh>
  )
}

function ZombieModel({ texture, color, state, isPlayer }) {
  const groupRef = useRef()
  const torsoRef = useRef()
  const headRef = useRef()

  const lUpperArmRef = useRef()
  const lLowerArmRef = useRef()
  const rUpperArmRef = useRef()
  const rLowerArmRef = useRef()

  const lThighRef = useRef()
  const lCalfRef = useRef()
  const rThighRef = useRef()
  const rCalfRef = useRef()

  useFrame((clockState, delta) => {
    const t = clockState.clock.getElapsedTime()
    const noise = (Math.sin(t * 15) * 0.1) + (Math.sin(t * 22) * 0.05) // Twitchy noise

    // Base Breathing/Swaying
    if (state === 'IDLE' || state === 'READY') {
      groupRef.current.rotation.y = Math.sin(t * 0.8) * 0.05
      torsoRef.current.rotation.x = Math.sin(t * 1.2) * 0.03 + noise * 0.2

      // Neck twitching
      headRef.current.rotation.x = Math.sin(t * 2.5) * 0.1 + noise * 0.5
      headRef.current.rotation.z = Math.sin(t * 1.8) * 0.05

      // Arms - Jerky idle
      lUpperArmRef.current.rotation.x = Math.PI * 0.2 + Math.sin(t * 1.5) * 0.1 + noise * 0.3
      lLowerArmRef.current.rotation.x = -Math.PI * 0.1 + Math.sin(t * 1.5) * 0.2

      rUpperArmRef.current.rotation.x = Math.PI * 0.4 + Math.cos(t * 1.8) * 0.1
      rLowerArmRef.current.rotation.x = -Math.PI * 0.2 + noise * 0.5

      // Leg limping
      lThighRef.current.rotation.x = Math.sin(t * 1.2) * 0.02
      rThighRef.current.rotation.z = 0.15 + noise * 0.1
    }

    if (state === 'ATTACKING') {
      // Violent lunge
      const attackPhase = Math.sin(t * 10)
      torsoRef.current.rotation.x = THREE.MathUtils.lerp(torsoRef.current.rotation.x, -0.6, 0.4)
      lUpperArmRef.current.rotation.x = THREE.MathUtils.lerp(lUpperArmRef.current.rotation.x, -Math.PI * 0.8, 0.5)
      lLowerArmRef.current.rotation.x = THREE.MathUtils.lerp(lLowerArmRef.current.rotation.x, -Math.PI * 0.3, 0.5)
      rUpperArmRef.current.rotation.x = THREE.MathUtils.lerp(rUpperArmRef.current.rotation.x, -Math.PI * 0.7, 0.5)
    }

    if (state === 'HURT') {
      // Snapping back
      groupRef.current.position.z = Math.sin(t * 60) * 0.12
      torsoRef.current.rotation.x = THREE.MathUtils.lerp(torsoRef.current.rotation.x, -0.8, 0.6)
      headRef.current.rotation.x = -0.5
    } else {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.1)
    }
  })

  // Mapping realistic patches
  // Torso: [0.2, 0.3], Head: [0.3, 0.65], Arms: [0.6, 0.3], [0.1, 0.3]
  return (
    <group ref={groupRef} rotation={[0, isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]}>
      {/* Torso Chain */}
      <group ref={torsoRef} position={[0, 0.8, 0]}>
        <ZombiePart
          texture={texture}
          offset={[0.2, 0.3]}
          repeat={[0.5, 0.45]}
          position={[0, 0.6, 0]}
          scale={[0.7, 1.2, 0.5]}
          color={color}
        />

        {/* Head and Neck */}
        <group ref={headRef} position={[0, 1.3, 0]}>
          <ZombiePart
            texture={texture}
            offset={[0.3, 0.65]}
            repeat={[0.4, 0.35]}
            position={[0, 0.3, 0]}
            scale={[0.65, 0.65, 0.6]}
            color={color}
          />
          {/* Eyes */}
          <mesh position={[0.22, 0.42, 0.31]}><boxGeometry args={[0.08, 0.08, 0.05]} /><meshBasicMaterial color="#ff0000" /></mesh>
          <mesh position={[-0.18, 0.45, 0.31]}><boxGeometry args={[0.06, 0.06, 0.05]} /><meshBasicMaterial color="#ffff00" /></mesh>
        </group>

        {/* Left Arm Chain */}
        <group ref={lUpperArmRef} position={[0.45, 1.1, 0]}>
          <ZombiePart
            texture={texture}
            offset={[0.6, 0.4]}
            repeat={[0.2, 0.3]}
            position={[0, -0.25, 0]}
            scale={[0.25, 0.6, 0.25]}
            color={color}
          />
          <group ref={lLowerArmRef} position={[0, -0.5, 0]}>
            <ZombiePart
              texture={texture}
              offset={[0.6, 0.1]}
              repeat={[0.2, 0.3]}
              position={[0, -0.25, 0]}
              scale={[0.2, 0.6, 0.2]}
              color={color}
            />
          </group>
        </group>

        {/* Right Arm Chain */}
        <group ref={rUpperArmRef} position={[-0.45, 1.0, 0]}>
          <ZombiePart
            texture={texture}
            offset={[0.1, 0.4]}
            repeat={[0.2, 0.3]}
            position={[0, -0.25, 0]}
            scale={[0.3, 0.6, 0.3]}
            color={color}
          />
          <group ref={rLowerArmRef} position={[0, -0.5, 0]}>
            <ZombiePart
              texture={texture}
              offset={[0.1, 0.1]}
              repeat={[0.2, 0.3]}
              position={[0, -0.2, 0]}
              scale={[0.22, 0.5, 0.22]}
              color={color}
            />
            {/* Exposed Bone */}
            <mesh position={[0, -0.45, 0]}><boxGeometry args={[0.12, 0.3, 0.12]} /><meshStandardMaterial color="#ddd" /></mesh>
          </group>
        </group>
      </group>

      {/* Legs - Hip Joints */}
      <group ref={lThighRef} position={[0.22, 0.8, 0]}>
        <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.3, 0.8, 0.3]} /><meshStandardMaterial color="#111" /></mesh>
        <group ref={lCalfRef} position={[0, -0.8, 0]} rotation={[0.2, 0, 0]}>
          <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.28, 0.8, 0.28]} /><meshStandardMaterial color="#000" /></mesh>
        </group>
      </group>

      <group ref={rThighRef} position={[-0.22, 0.8, 0]} rotation={[0.3, 0, -0.1]}>
        <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.35, 0.6, 0.35]} /><meshStandardMaterial color="#2d2d2d" /></mesh>
        <group ref={rCalfRef} position={[0, -0.6, 0]} rotation={[-0.5, 0, 0]}>
          <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.35, 0.6, 0.35]} /><meshStandardMaterial color="#222" /></mesh>
          <mesh position={[0, -0.65, 0]}><boxGeometry args={[0.38, 0.15, 0.45]} /><meshStandardMaterial color="#400" /></mesh>
        </group>
      </group>
    </group>
  )
}

function Hero({ position, heroData, isPlayer, gameState, damagePopups }) {
  const meshRef = useRef()
  const texture = useTexture(`${import.meta.env.BASE_URL}${isPlayer ? 'player_zombie_realistic.png' : 'enemy_zombie_realistic.png'}`)

  const color = isPlayer ? '#2d5a27' : '#5a2727'
  const isAttacking = (isPlayer && gameState === 'PLAYER_ATTACKING') || (!isPlayer && gameState === 'ENEMY_ATTACKING')
  const isHurt = (isPlayer && gameState === 'ENEMY_STRIKING') || (!isPlayer && gameState === 'PLAYER_STRIKING')

  useFrame((state, delta) => {
    if (isAttacking && meshRef.current) {
      const targetX = isPlayer ? position[0] + 4 : position[0] - 4
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetX, 0.2)
    } else if (meshRef.current) {
      meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, position[0], 0.1)
    }
  })

  return (
    <group position={position} ref={meshRef}>
      <ZombieModel
        texture={texture}
        color={color}
        state={isAttacking ? 'ATTACKING' : (isHurt ? 'HURT' : 'IDLE')}
        isPlayer={isPlayer}
      />

      {damagePopups.map(p => (
        <DamagePopup key={p.id} value={p.value} position={[0, 4, 0]} />
      ))}

      <Billboard position={[0, 4.5, 0]}>
        <Text fontSize={0.4} color="white" outlineColor="black" outlineWidth={0.06}>
          {heroData.Name}
        </Text>
        <Text position={[0, -0.4, 0]} fontSize={0.3} color={isPlayer ? '#4ade80' : '#f87171'} outlineColor="black" outlineWidth={0.03}>
          HP: {Math.max(0, heroData.currentHP)}
        </Text>
      </Billboard>
    </group>
  )
}

function Debris({ position, scale, rotation, color = '#222' }) {
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  )
}

function Arena() {
  const debris = useMemo(() => {
    const items = []
    while (items.length < 100) {
      const x = (Math.random() - 0.5) * 60
      const z = (Math.random() - 0.5) * 60
      // 避免碎片生成在角色對戰區域 (Safe Zone)
      if (Math.abs(x) < 15 && Math.abs(z) < 10) continue

      const isWall = items.length < 30
      items.push({
        position: [x, isWall ? 2 : -0.2, z],
        scale: isWall ? [Math.random() * 4 + 1, Math.random() * 8 + 2, 0.5] : [Math.random() * 2 + 0.5, 0.1 + Math.random() * 0.4, Math.random() * 2 + 0.5],
        rotation: [0, Math.random() * Math.PI, 0],
        color: isWall ? (items.length % 2 === 0 ? '#444' : '#322') : (Math.random() > 0.5 ? '#222' : '#2a2a2a')
      })
    }
    return items
  }, [])

  return (
    <>
      <Sky distance={450000} sunPosition={[0, 0.1, 0]} inclination={0} azimuth={1.25} rayleigh={6} turbidity={10} />
      <Sparkles count={200} scale={40} size={1.5} speed={0.4} opacity={0.3} color="#ff6666" />
      <gridHelper args={[120, 120, '#333', '#1a1a1a']} position={[0, 0.01, 0]} />
      <fog attach="fog" args={['#050505', 10, 60]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#0a0a0a" roughness={1} />
      </mesh>

      {debris.map((d, i) => <Debris key={i} {...d} />)}

      <ambientLight intensity={1.2} />
      <hemisphereLight intensity={0.8} skyColor="#440000" groundColor="#000000" />
      <pointLight position={[15, 10, 10]} intensity={15} color="#ff3300" distance={30} decay={2} />
      <pointLight position={[-15, 12, -10]} intensity={12} color="#cc0000" distance={30} decay={2} />
      <directionalLight position={[0, 30, 10]} intensity={1.5} color="#666" castShadow />
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

  useEffect(() => {
    fetch(API_URL)
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
  }, [])

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
    setTurn(currentTurn)

    // Player Attack Phase
    setGameState('PLAYER_ATTACKING')
    setLog(`ROUND ${currentTurn}：玩家發起進攻！`)
    await new Promise(r => setTimeout(r, 600))

    setGameState('PLAYER_STRIKING') // Trigger enemy hurt animation
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

    await new Promise(r => setTimeout(r, 1000))

    // Enemy Attack Phase
    setGameState('ENEMY_ATTACKING')
    setLog(`ROUND ${currentTurn}：敵人瘋狂撕咬！`)
    await new Promise(r => setTimeout(r, 600))

    setGameState('ENEMY_STRIKING') // Trigger player hurt animation
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

    await new Promise(r => setTimeout(r, 1200))
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
          <button onClick={() => window.location.reload()} style={{
            padding: '15px 40px', fontSize: '1.1rem', cursor: 'pointer', background: 'white',
            color: 'black', border: 'none', fontWeight: 'bold'
          }}>
            重啟循環
          </button>
        </div>
      )}

      <Canvas camera={{ position: [0, 10, 28], fov: 32 }} shadows>
        <Suspense fallback={null}>
          <Arena />
          {!loading && playerHero && (
            <Hero
              position={[-7, 0, 0]}
              heroData={playerHero}
              isPlayer={true}
              gameState={gameState}
              damagePopups={playerDamage}
            />
          )}
          {!loading && enemyHero && (
            <Hero
              position={[7, 0, 0]}
              heroData={enemyHero}
              isPlayer={false}
              gameState={gameState}
              damagePopups={enemyDamage}
            />
          )}
          <OrbitControls
            target={[0, 3, 0]}
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
