/**
 * Arena — 場景環境（地面 + 碎片 + 雨 + 燈光 + 天空）
 *
 * 五者連動：Ground / Debris / Rain / Sparkles / Fog
 * 修改場景大小時，必須五者一起調整。
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { DebrisItem, DebrisType } from '../types'

/* ────────────────────────────
   Debris（單一碎片）
   ──────────────────────────── */

interface DebrisProps extends DebrisItem {} // eslint-disable-line @typescript-eslint/no-empty-object-type

/** 偽噪波 hash */
function hash(x: number, y: number, z: number = 0): number {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return h - Math.floor(h)
}

function Debris({ position, scale, rotation, color = '#222', type = 'box' }: DebrisProps) {
  const { geometry, material } = useMemo(() => {
    let geo: THREE.BufferGeometry
    switch (type as DebrisType) {
      case 'slab':
        geo = new THREE.BoxGeometry(1, 1, 1, 6, 4, 6); break
      case 'pillar':
        geo = new THREE.CylinderGeometry(0.3, 0.55, 1, 7, 6); break
      case 'rock':
        geo = new THREE.DodecahedronGeometry(0.5, 2); break
      case 'rebar':
        geo = new THREE.CylinderGeometry(0.06, 0.1, 1, 5, 5); break
      case 'chunk':
        geo = new THREE.TetrahedronGeometry(0.5, 2); break
      default:
        geo = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5)
    }

    const pos = geo.attributes.position as THREE.BufferAttribute
    const normals = geo.attributes.normal as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const baseColor = new THREE.Color(color)
    const strength = type === 'rebar' ? 0.015 : type === 'pillar' ? 0.08 : 0.18

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i)
      const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i)
      const noiseVal = (hash(px * 3, py * 3, pz * 3) - 0.5) * 2
      const disp = noiseVal * strength
      const jitter = (Math.random() - 0.5) * strength * 0.3
      pos.setXYZ(
        i,
        px + nx * disp + (Math.random() - 0.5) * strength * 0.15,
        py + ny * disp + jitter,
        pz + nz * disp + (Math.random() - 0.5) * strength * 0.15,
      )

      // 頂點色差 — 加入汙漬斑塊
      const coarse = hash(px * 1.5, py * 1.5, pz * 1.5)
      const fine = hash(px * 8, py * 8, pz * 8)
      const v = 0.45 + coarse * 0.35 + fine * 0.2
      const hueShift = (hash(px * 5.3, pz * 5.3, py * 2.1) - 0.5) * 0.08
      colors[i * 3] = Math.min(1, baseColor.r * v + hueShift)
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
      position={position}
      rotation={rotation}
      scale={scale}
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      renderOrder={-1}
    />
  )
}

/* ────────────────────────────
   Rain（LineSegments 雨絲）
   ──────────────────────────── */

interface RainProps {
  count?: number
  area?: number
  height?: number
  speed?: number
}

function Rain({ count = 1200, area = 30, height = 15, speed = 14 }: RainProps) {
  const meshRef = useRef<THREE.LineSegments>(null)
  const streakLen = 0.6
  const windX = 4
  const windZ = -1.5

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 2 * 3)
    const vel = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * area
      const y = Math.random() * height
      const z = (Math.random() - 0.5) * area
      vel[i] = 0.8 + Math.random() * 0.4
      const bi = i * 6
      pos[bi] = x; pos[bi + 1] = y; pos[bi + 2] = z
      const dx = (windX / speed) * streakLen
      const dz = (windZ / speed) * streakLen
      pos[bi + 3] = x + dx; pos[bi + 4] = y - streakLen; pos[bi + 5] = z + dz
    }
    return { positions: pos, velocities: vel }
  }, [count, area, height, speed])

  useFrame((_state, delta) => {
    if (!meshRef.current) return
    const pos = (meshRef.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    const dy = speed * delta
    const dx = windX * delta
    const dz = windZ * delta
    for (let i = 0; i < count; i++) {
      const bi = i * 6
      pos[bi] += dx; pos[bi + 1] -= dy * velocities[i]; pos[bi + 2] += dz
      pos[bi + 3] += dx; pos[bi + 4] -= dy * velocities[i]; pos[bi + 5] += dz
      if (pos[bi + 1] < -0.5) {
        const nx = (Math.random() - 0.5) * area
        const ny = height + Math.random() * 3
        const nz = (Math.random() - 0.5) * area
        const sdx = (windX / speed) * streakLen
        const sdz = (windZ / speed) * streakLen
        pos[bi] = nx; pos[bi + 1] = ny; pos[bi + 2] = nz
        pos[bi + 3] = nx + sdx; pos[bi + 4] = ny - streakLen; pos[bi + 5] = nz + sdz
      }
    }
    ;(meshRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  })

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#99aabb',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  return (
    <lineSegments ref={meshRef} material={material}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count * 2}
        />
      </bufferGeometry>
    </lineSegments>
  )
}

/* ────────────────────────────
   碎片佈局產生
   ──────────────────────────── */

function generateDebris(): DebrisItem[] {
  const items: DebrisItem[] = []

  const wallTypes: DebrisType[] = ['slab', 'box', 'pillar']
  const wallColors: Record<string, string[]> = {
    slab: ['#8a8078', '#6e6258', '#9c8e80', '#b0a090'],
    box: ['#5a4030', '#6b4423', '#4a3018'],
    pillar: ['#707068', '#585850', '#908880'],
  }
  const rubbleTypes: DebrisType[] = ['rock', 'chunk', 'slab', 'box', 'rebar']
  const rubbleColors: Record<string, string[]> = {
    rock: ['#605848', '#787060', '#504838'],
    chunk: ['#8b4513', '#a0522d', '#6b3410'],
    slab: ['#989088', '#807870', '#a8a098'],
    box: ['#5c4a38', '#4a3828', '#6e5c48'],
    rebar: ['#b87333', '#c08040', '#8b5a2b', '#d4874a'],
  }

  while (items.length < 80) {
    const x = (Math.random() - 0.5) * 35
    const z = (Math.random() - 0.5) * 35
    // 排除中央戰場
    if (Math.abs(x) < 6 && z > -16 && z < 16) continue

    const isWall = items.length < 12
    const type = isWall
      ? wallTypes[Math.floor(Math.random() * wallTypes.length)]
      : rubbleTypes[Math.floor(Math.random() * rubbleTypes.length)]

    const palette = isWall ? wallColors[type] : rubbleColors[type]
    const chosenColor = palette[Math.floor(Math.random() * palette.length)]

    let sx: number, sy: number, sz: number
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

    const baseY = isWall ? sy * 0.5 : (type === 'rock' || type === 'chunk' ? sy * 0.25 : sy * 0.5)
    const groundY = isWall ? baseY : baseY * 0.6 - 0.05

    items.push({
      position: [x, groundY, z],
      scale: [sx, sy, sz],
      rotation: [
        (Math.random() - 0.5) * (isWall ? 0.12 : 0.4),
        Math.random() * Math.PI,
        (Math.random() - 0.5) * (isWall ? 0.08 : 0.35),
      ],
      color: chosenColor,
      type,
    })
  }

  return items
}

/* ────────────────────────────
   地面幾何產生
   ──────────────────────────── */

function createGroundGeometry(): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(60, 60, 64, 64)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)

  const hash2 = (x: number, y: number) => {
    let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return h - Math.floor(h)
  }

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i)
    const distX = Math.abs(px), distZ = Math.abs(py)
    const inArena = distX < 12 && distZ < 8
    const edgeFade = inArena ? 0 : Math.min(1, Math.max(distX - 12, distZ - 8, 0) / 5)

    const n1 = (hash2(px * 0.15, py * 0.15) - 0.5) * 0.5
    const n2 = (hash2(px * 0.5, py * 0.5) - 0.5) * 0.18
    const n3 = (hash2(px * 2.0, py * 2.0) - 0.5) * 0.05
    pos.setZ(i, (n1 + n2 + n3) * edgeFade)

    const coarse = hash2(px * 0.2, py * 0.2)
    const fine = hash2(px * 1.5, py * 1.5)
    const detail = hash2(px * 5, py * 5)
    const v = 0.35 + coarse * 0.25 + fine * 0.12 + detail * 0.05
    const brownMix = hash2(px * 0.3 + 100, py * 0.3 + 100)
    const r = (0.16 + brownMix * 0.10) * v
    const g = (0.11 + brownMix * 0.06) * v
    const b = (0.06 + brownMix * 0.03) * v
    const stain = hash2(px * 0.8 + 50, py * 0.8 + 50) < 0.2 ? 0.5 : 1.0
    colors[i * 3] = Math.min(1, r * stain)
    colors[i * 3 + 1] = Math.min(1, g * stain)
    colors[i * 3 + 2] = Math.min(1, b * stain)
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

/* ────────────────────────────
   Arena（場景主元件）
   ──────────────────────────── */

export function Arena() {
  const debris = useMemo(generateDebris, [])
  const groundGeo = useMemo(createGroundGeometry, [])

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={[0, -0.15, 0]}
        inclination={0}
        azimuth={1.25}
        rayleigh={0.2}
        turbidity={20}
      />
      <Sparkles count={80} scale={20} size={1.5} speed={0.4} opacity={0.3} color="#ff6666" />
      <Rain />
      <fog attach="fog" args={['#1a0e06', 8, 35]} />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={groundGeo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0.0} flatShading />
      </mesh>

      {debris.map((d, i) => (
        <Debris key={i} {...d} />
      ))}

      {/* 燈光 */}
      <ambientLight intensity={2.5} />
      <hemisphereLight intensity={1.2} args={['#ff4400', '#220000']} />

      <pointLight position={[15, 10, 10]} intensity={40} color="#ff6633" distance={40} decay={2} castShadow />
      <pointLight position={[-15, 12, -10]} intensity={30} color="#ff2200" distance={40} decay={2} castShadow />
      <pointLight position={[0, 15, 5]} intensity={25} color="#ffffff" distance={30} decay={2} castShadow />

      <directionalLight
        position={[5, 25, 15]}
        intensity={5}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
      />
      <directionalLight
        position={[-5, 20, 10]}
        intensity={3}
        color="#ff8866"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
    </>
  )
}
