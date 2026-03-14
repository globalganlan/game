/**
 * SceneProps ??章�?專屬 3D ?�景?�具
 *
 * 每�?SceneMode ?�獨?��??�景?�具，�??�鬥?�面?�具沉浸?��?
 * - city: 路�??�建築�?骸、�??�、路??
 * - forest: 樹幹?�倒木?��???
 * - wasteland: 購物車、破?��??�油�?
 * - factory: 機械齒輪?�管線架?�鐵�?
 * - hospital: ?��??��?滴架?�醫?��?
 * - residential: 桌�??��?子、書??
 * - underground: 汽�??�交?��??�水泥柱
 * - core: ?��?水晶?��??�主�??�發?�管
 *
 * ?�具?�置使用 deterministic seeded RNG，避?��?次�??�渲?��??��?局??
 * 中央?�鬥?�??(|x|<7, |z|<9) 不放置�??��?
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SceneMode } from './Arena'

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Seeded PRNG & Scatter Placement
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** ?��????位置，避?�中央戰鬥�???*/
function scatter(
  count: number, seed: number, spread = 26, minDist = 7,
): { pos: [number, number, number]; rot: number }[] {
  const rng = mulberry32(seed)
  const results: { pos: [number, number, number]; rot: number }[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 20) {
    attempts++
    const x = (rng() - 0.5) * spread
    const z = (rng() - 0.5) * spread
    if (Math.abs(x) < minDist && Math.abs(z) < minDist + 2) continue
    results.push({ pos: [x, 0, z], rot: rng() * Math.PI * 2 })
  }
  return results
}

/** 敵方後方專用散佈（z: -5 ~ -17，填充鏡頭可見的背景區） */
function scatterBehind(
  count: number, seed: number, spreadX = 24, zMin = -17, zMax = -5,
): { pos: [number, number, number]; rot: number }[] {
  const rng = mulberry32(seed)
  const results: { pos: [number, number, number]; rot: number }[] = []
  let attempts = 0
  while (results.length < count && attempts < count * 20) {
    attempts++
    const x = (rng() - 0.5) * spreadX
    const z = zMin + rng() * (zMax - zMin)
    if (Math.abs(x) < 3.5 && z > -8) continue
    results.push({ pos: [x, 0, z], rot: rng() * Math.PI * 2 })
  }
  return results
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   ?�用氛�??��? ??碎石?�、�?漬、�???
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

/** ?�面碎石????增�?廢�???*/
function RubblePile({ position, rotation = 0, scale = 1, color = '#5a5048' }: { position: [number, number, number]; rotation?: number; scale?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {/* 大石�?*/}
      <mesh position={[0, 0.08, 0]} rotation={[0.3, 0.5, 0.2]} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.15, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0.18, 0.06, 0.1]} rotation={[0.6, 0.2, 0.4]}>
        <dodecahedronGeometry args={[0.1, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-0.12, 0.05, -0.08]} rotation={[0.1, 0.8, 0.3]}>
        <dodecahedronGeometry args={[0.08, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* 碎�???? */}
      <mesh position={[0.25, 0.02, -0.15]} rotation={[0.4, 1.2, 0]}>
        <dodecahedronGeometry args={[0.05, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-0.2, 0.02, 0.2]} rotation={[0.7, 0, 0.5]}>
        <dodecahedronGeometry args={[0.04, 0]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

/** 血�?污漬 ???�面不�??�深?�貼??*/
function BloodStain({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh rotation={[-Math.PI / 2, 0, position[0] * 3.7]} position={[0, 0.005, 0]}>
        <circleGeometry args={[0.4, 7]} />
        <meshBasicMaterial color="#3a1010" transparent opacity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, position[2] * 2.1]} position={[0.2, 0.005, 0.15]}>
        <circleGeometry args={[0.2, 5]} />
        <meshBasicMaterial color="#2a0808" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.15, 0.005, -0.1]}>
        <circleGeometry args={[0.15, 6]} />
        <meshBasicMaterial color="#350c0c" transparent opacity={0.4} />
      </mesh>
    </group>
  )
}

/** ??��?�圾 ??紙張?��??��???*/
function ScatteredLitter({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 紙張 */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2 + 0.05, 0, rotation * 2]}>
        <planeGeometry args={[0.25, 0.18]} />
        <meshBasicMaterial color="#c8c0a8" side={THREE.DoubleSide} />
      </mesh>
      {/* 壓�?罐頭 */}
      <mesh position={[0.3, 0.03, 0.15]} rotation={[Math.PI / 2, 0, rotation]}>
        <cylinderGeometry args={[0.04, 0.04, 0.08, 6]} />
        <meshBasicMaterial color="#888888" />
      </mesh>
      {/* 碎玻??(尖銳三�??? */}
      <mesh position={[-0.2, 0.005, 0.1]} rotation={[-Math.PI / 2, 0, rotation * 1.5]}>
        <circleGeometry args={[0.06, 3]} />
        <meshBasicMaterial color="#aabbcc" transparent opacity={0.4} />
      </mesh>
    </group>
  )
}

/** ?��??�跡 ???�在?�屬表面 */
function RustMark({ position, normal = [0, 0, 1] as [number, number, number], scale = 1 }: { position: [number, number, number]; normal?: [number, number, number]; scale?: number }) {
  const rot = normal[1] > 0.5 ? [-Math.PI / 2, 0, 0] as [number, number, number] : [0, 0, 0] as [number, number, number]
  return (
    <mesh position={position} rotation={rot} scale={scale}>
      <circleGeometry args={[0.12, 5]} />
      <meshBasicMaterial color="#6a3a18" transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   City Props ???��??�口
   路�??�建築�?骸、�??�、混?��?路�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function Signpost({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const bent = (Math.sin(rotation * 7) - 0.5) * 0.2
  return (
    <group position={position} rotation={[bent, rotation, 0]}>
      {/* 彎曲?�鏽?�桿 */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 3, 6]} />
        <meshBasicMaterial color="#4a4038" />
      </mesh>
      {/* ?��??�跡 */}
      <RustMark position={[0.06, 1.2, 0]} scale={0.8} />
      <RustMark position={[-0.04, 2.0, 0]} scale={0.6} />
      {/* 褪色路�? */}
      <mesh position={[0, 2.7, 0]} castShadow>
        <boxGeometry args={[1.0, 0.5, 0.06]} />
        <meshBasicMaterial color="#1a3a18" />
      </mesh>
      <mesh position={[0, 2.7, 0.04]}>
        <boxGeometry args={[0.85, 0.35, 0.02]} />
        <meshBasicMaterial color="#6a7a58" />
      </mesh>
      {/* ?�面?��? */}
      <mesh position={[0.2, 2.8, 0.05]} rotation={[0, 0, 0.5]}>
        <circleGeometry args={[0.1, 5]} />
        <meshBasicMaterial color="#5a3a18" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* ?��?碎石 */}
      <RubblePile position={[0.3, 0, 0.2]} rotation={rotation * 2} color="#5a5048" />
    </group>
  )
}

function BuildingRuin({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const h = 3 + Math.abs(Math.sin(position[0] * 7.3)) * 4
  const w = 1.5 + Math.abs(Math.sin(position[2] * 3.1)) * 2
  return (
    <group position={position} rotation={[0, rotation, (Math.sin(rotation * 3) - 0.5) * 0.08]}>
      {/* 主�?�????��???*/}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.4]} />
        <meshBasicMaterial color="#5a4a38" />
      </mesh>
      {/* 裸露磚�?紋�?（深?��?紋�? */}
      <mesh position={[-w * 0.15, h * 0.3, 0.21]}>
        <boxGeometry args={[w * 0.3, 0.08, 0.01]} />
        <meshBasicMaterial color="#4a3828" />
      </mesh>
      <mesh position={[w * 0.1, h * 0.45, 0.21]}>
        <boxGeometry args={[w * 0.25, 0.08, 0.01]} />
        <meshBasicMaterial color="#4a3828" />
      </mesh>
      {/* 窗戶�?+ 碎玻?��???*/}
      {h > 4 && (
        <>
          <mesh position={[-w * 0.25, h * 0.55, 0.21]}>
            <boxGeometry args={[0.4, 0.5, 0.02]} />
            <meshBasicMaterial color="#0a0a12" />
          </mesh>
          {/* ?��?碎�?殘�??��?框�? */}
          <mesh position={[-w * 0.25, h * 0.55 - 0.22, 0.22]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.15, 0.08, 0.01]} />
            <meshBasicMaterial color="#99aabb" transparent opacity={0.3} />
          </mesh>
          <mesh position={[w * 0.25, h * 0.55, 0.21]}>
            <boxGeometry args={[0.4, 0.5, 0.02]} />
            <meshBasicMaterial color="#0a0a12" />
          </mesh>
        </>
      )}
      {/* 碎�??�部（�?碎�?�?*/}
      <mesh position={[w * 0.2, h - 0.1, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[w * 0.4, 0.3, 0.4]} />
        <meshBasicMaterial color="#6a5a48" />
      </mesh>
      <mesh position={[-w * 0.15, h + 0.05, 0.1]} rotation={[0.2, 0.5, -0.4]} castShadow>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshBasicMaterial color="#5a4a38" />
      </mesh>
      {/* ?��?血�?*/}
      <BloodStain position={[w * 0.3, 0, 0.25]} scale={0.7} />
      {/* 底部?�礫??*/}
      <RubblePile position={[-w * 0.3, 0, 0.4]} rotation={rotation * 3} />
      <RubblePile position={[w * 0.2, 0, -0.3]} rotation={rotation * 5} color="#6a5a48" />
    </group>
  )
}

function StreetLight({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const tilt = (Math.sin(rotation * 5) - 0.5) * 0.2
  return (
    <group position={position} rotation={[tilt, rotation, tilt * 0.5]}>
      {/* ?��??�柱 */}
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 4, 6]} />
        <meshBasicMaterial color="#3a3a35" />
      </mesh>
      {/* ?��? */}
      <RustMark position={[0.07, 1.0, 0]} scale={1.2} />
      <RustMark position={[-0.05, 2.5, 0]} scale={0.7} />
      {/* 彎曲?��? */}
      <mesh position={[0.4, 3.8, 0]} rotation={[0, 0, -0.5]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 1, 5]} />
        <meshBasicMaterial color="#3a3a38" />
      </mesh>
      {/* ?��??�罩 ??微弱?��? */}
      <mesh position={[0.7, 3.7, 0]}>
        <boxGeometry args={[0.3, 0.12, 0.2]} />
        <meshBasicMaterial color="#666650" />
      </mesh>
      {/* ?��??��? */}
      <mesh position={[0.35, 3.2, 0.1]} rotation={[0.3, 0, -0.8]}>
        <cylinderGeometry args={[0.008, 0.008, 1.2, 4]} />
        <meshBasicMaterial color="#222222" />
      </mesh>
      {/* 底部碎石 */}
      <RubblePile position={[0.2, 0, 0.15]} rotation={rotation} color="#4a4a40" />
    </group>
  )
}

function ConcreteBarrier({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const cracked = Math.sin(rotation * 9) > 0
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.7, 0.5]} />
        <meshBasicMaterial color="#7a7870" />
      </mesh>
      {/* 污漬?��???*/}
      <mesh position={[-0.3, 0.4, 0.26]}>
        <circleGeometry args={[0.15, 5]} />
        <meshBasicMaterial color="#5a5850" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {cracked && (
        <mesh position={[0.2, 0.2, 0.26]} rotation={[0, 0, 0.7]}>
          <boxGeometry args={[0.02, 0.5, 0.01]} />
          <meshBasicMaterial color="#3a3830" />
        </mesh>
      )}
      {/* 褪色?��?�?*/}
      <mesh position={[0, 0.55, 0.26]}>
        <boxGeometry args={[1.6, 0.1, 0.01]} />
        <meshBasicMaterial color="#aa7722" />
      </mesh>
      {/* ?��??��? */}
      <mesh position={[-0.85, 0.6, 0.2]} rotation={[0.3, 0.5, 0.2]}>
        <dodecahedronGeometry args={[0.08, 0]} />
        <meshBasicMaterial color="#7a7870" />
      </mesh>
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Forest Props ???��?森�?
   樹幹?�倒木?��??�、�??�叢
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function TreeTrunk({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const h = 3 + Math.abs(Math.sin(position[0] * 5)) * 3
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.35, h, 7]} />
        <meshBasicMaterial color="#3a2a18" />
      </mesh>
      {/* ?��??�樹?��?�?*/}
      {h > 4 && (
        <mesh position={[0.15, h - 0.2, 0]} rotation={[0.3, 0, 0.5]}>
          <cylinderGeometry args={[0.1, 0.18, 1.2, 5]} />
          <meshBasicMaterial color="#2a1a10" />
        </mesh>
      )}
      {/* ?�部鼓起 */}
      <mesh position={[0, 0.15, 0]}>
        <dodecahedronGeometry args={[0.45, 1]} />
        <meshBasicMaterial color="#2a1a0a" />
      </mesh>
      {/* 樹皮?�落?�跡 */}
      <mesh position={[0.22, h * 0.3, 0.1]} rotation={[0, 0.3, 0.2]}>
        <boxGeometry args={[0.08, 0.4, 0.02]} />
        <meshBasicMaterial color="#5a4028" />
      </mesh>
      {/* ?��?寄�? */}
      <mesh position={[-0.2, h * 0.25, 0.15]} rotation={[0.3, 0, -0.5]}>
        <circleGeometry args={[0.1, 5]} />
        <meshBasicMaterial color="#5a7a3a" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.18, h * 0.45, -0.12]} rotation={[-0.2, 0.5, 0.3]}>
        <circleGeometry args={[0.07, 5]} />
        <meshBasicMaterial color="#4a6a2a" side={THREE.DoubleSide} />
      </mesh>
      {/* ?��? */}
      {h > 3.5 && (
        <group position={[0.25, h * 0.5, 0]}>
          {[0, 0.06, 0.12].map((off, i) => (
            <mesh key={i} position={[0, off, 0]} rotation={[0, 0, 0.15]}>
              <boxGeometry args={[0.015, 0.25, 0.01]} />
              <meshBasicMaterial color="#1a0a00" />
            </mesh>
          ))}
        </group>
      )}
      {/* ?�面?��?碎�? */}
      <RubblePile position={[0.3, 0, 0.2]} rotation={rotation * 2} color="#3a2a10" />
    </group>
  )
}

function FallenLog({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.25, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.22, 2.5, 6]} />
        <meshBasicMaterial color="#3a2818" />
      </mesh>
      {/* ?��? ??多�?不�??��???*/}
      <mesh position={[0, 0.4, 0.1]}>
        <boxGeometry args={[1.5, 0.05, 0.3]} />
        <meshBasicMaterial color="#2a5a20" />
      </mesh>
      <mesh position={[-0.4, 0.42, -0.08]}>
        <circleGeometry args={[0.2, 5]} />
        <meshBasicMaterial color="#1a4a15" side={THREE.DoubleSide} />
      </mesh>
      {/* ?��?端面 */}
      <mesh position={[1.25, 0.25, 0]} rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[0.2, 7]} />
        <meshBasicMaterial color="#5a4028" side={THREE.DoubleSide} />
      </mesh>
      {/* 小�??�叢 */}
      <mesh position={[0.3, 0.45, 0.12]}>
        <coneGeometry args={[0.05, 0.1, 4]} />
        <meshBasicMaterial color="#8a6a40" />
      </mesh>
      <mesh position={[0.4, 0.44, 0.08]}>
        <coneGeometry args={[0.035, 0.07, 4]} />
        <meshBasicMaterial color="#7a5a30" />
      </mesh>
      {/* 樹皮碎�???�� */}
      <mesh position={[-0.6, 0.02, 0.3]} rotation={[-Math.PI / 2 + 0.1, 0, rotation]}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
        <meshBasicMaterial color="#4a3820" />
      </mesh>
      <mesh position={[0.5, 0.02, -0.25]} rotation={[-Math.PI / 2, 0, rotation * 2]}>
        <boxGeometry args={[0.1, 0.06, 0.02]} />
        <meshBasicMaterial color="#3a2818" />
      </mesh>
    </group>
  )
}

function Mushroom({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const s = 0.5 + Math.abs(Math.sin(position[0] * 11)) * 0.8
  const glowColor = Math.sin(position[0] * 7) > 0 ? '#22aa44' : '#44aa88'
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={s}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.6, 5]} />
        <meshBasicMaterial color="#d4c8a0" />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <sphereGeometry args={[0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#8b2020" />
      </mesh>
      {/* ?��? */}
      <mesh position={[0.08, 0.7, 0.08]}>
        <sphereGeometry args={[0.04, 4, 4]} />
        <meshBasicMaterial color="#ddddcc" />
      </mesh>
      <mesh position={[-0.06, 0.68, -0.1]}>
        <sphereGeometry args={[0.03, 4, 4]} />
        <meshBasicMaterial color="#ccccbb" />
      </mesh>
      {/* ?�絲?�延?�面 */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, rotation]}>
        <circleGeometry args={[0.3, 6]} />
        <meshBasicMaterial color="#3a4a2a" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* ?��?小�? */}
      <mesh position={[0.2, 0.12, 0.1]}>
        <cylinderGeometry args={[0.02, 0.03, 0.24, 4]} />
        <meshBasicMaterial color="#c8b888" />
      </mesh>
      <mesh position={[0.2, 0.26, 0.1]}>
        <sphereGeometry args={[0.06, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#7a1818" />
      </mesh>
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Wasteland Props ??死�??��? / 廢�??�場
   購物車、破?��??�油桶、翻?��?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function ShoppingCart({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[(Math.sin(rotation * 3) - 0.5) * 0.3, rotation, 0]}>
      {/* 車�? ???��??�屬 */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.6, 0.4, 0.45]} />
        <meshBasicMaterial color="#7a7068" wireframe />
      </mesh>
      {/* 車�?底板 */}
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.58, 0.02, 0.43]} />
        <meshBasicMaterial color="#6a6058" />
      </mesh>
      {/* ?��? */}
      <mesh position={[0, 0.8, -0.22]} castShadow>
        <boxGeometry args={[0.5, 0.04, 0.04]} />
        <meshBasicMaterial color="#5a5550" />
      </mesh>
      {/* 輪�? ???��?缺失 */}
      {[[-0.22, 0.08, 0.15], [0.22, 0.08, 0.15], [-0.22, 0.08, -0.15]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.03, 8]} />
          <meshBasicMaterial color="#333330" />
        </mesh>
      ))}
      {/* ?��? */}
      <RustMark position={[0.25, 0.5, 0.23]} scale={0.8} />
      <RustMark position={[-0.2, 0.65, -0.23]} scale={0.6} />
      {/* 車內??��?�圾 */}
      <mesh position={[0.1, 0.4, 0.05]} rotation={[0.3, 0.5, 0.1]}>
        <boxGeometry args={[0.12, 0.08, 0.08]} />
        <meshBasicMaterial color="#4a6a3a" />
      </mesh>
      {/* ?�面碎石 */}
      <RubblePile position={[0.35, 0, 0.25]} rotation={rotation * 2} color="#5a5048" />
    </group>
  )
}

function BrokenShelf({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, (Math.sin(rotation * 7) - 0.5) * 0.15]}>
      {/* ?�板 */}
      <mesh position={[-0.55, 1, 0]} castShadow>
        <boxGeometry args={[0.06, 2, 0.4]} />
        <meshBasicMaterial color="#7a6040" />
      </mesh>
      <mesh position={[0.55, 0.8, 0]} castShadow>
        <boxGeometry args={[0.06, 1.6, 0.4]} />
        <meshBasicMaterial color="#6a5030" />
      </mesh>
      {/* 層板 */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[1.1, 0.04, 0.38]} />
        <meshBasicMaterial color="#8a7858" />
      </mesh>
      <mesh position={[0.1, 1.1, 0]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[1.0, 0.04, 0.38]} />
        <meshBasicMaterial color="#7a6848" />
      </mesh>
      {/* ??��?��? ??罐頭?�瓶�?*/}
      <mesh position={[-0.2, 0.46, 0.1]} rotation={[0, 0.4, 0.1]}>
        <cylinderGeometry args={[0.04, 0.04, 0.1, 6]} />
        <meshBasicMaterial color="#aa4422" />
      </mesh>
      <mesh position={[0.3, 0.46, -0.05]} rotation={[Math.PI / 2, 0, rotation]}>
        <cylinderGeometry args={[0.03, 0.03, 0.12, 6]} />
        <meshBasicMaterial color="#448844" />
      </mesh>
      {/* ?�落?????�面??�� */}
      <mesh position={[0.2, 0.02, 0.25]} rotation={[-Math.PI / 2, 0, 0.7]}>
        <boxGeometry args={[0.15, 0.1, 0.02]} />
        <meshBasicMaterial color="#8a7050" />
      </mesh>
      <ScatteredLitter position={[-0.4, 0, 0.3]} rotation={rotation * 3} />
      {/* ?�塵污漬 */}
      <mesh position={[-0.3, 0.8, 0.21]} rotation={[0, 0, 0.3]}>
        <circleGeometry args={[0.12, 5]} />
        <meshBasicMaterial color="#5a4838" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function OilDrum({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const tipped = Math.sin(rotation * 13) > 0.3
  const leaking = Math.sin(rotation * 7) > 0
  return (
    <group position={position} rotation={[tipped ? 1.4 : 0, rotation, 0]}>
      <mesh position={[0, tipped ? 0.28 : 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.9, 10]} />
        <meshBasicMaterial color="#8a5518" />
      </mesh>
      {/* 桶�? */}
      <mesh position={[0, tipped ? 0.73 : 0.95, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 10]} />
        <meshBasicMaterial color="#7a5518" />
      </mesh>
      {/* ?�帶 */}
      <mesh position={[0, tipped ? 0.15 : 0.35, 0]}>
        <cylinderGeometry args={[0.29, 0.29, 0.06, 10]} />
        <meshBasicMaterial color="#5a3010" />
      </mesh>
      <RustMark position={[0.2, tipped ? 0.3 : 0.6, 0.15]} scale={1.0} />
      {/* 漏油?�跡 */}
      {leaking && tipped && (
        <mesh position={[0.4, 0.005, 0]} rotation={[-Math.PI / 2, 0, rotation]}>
          <circleGeometry args={[0.3, 6]} />
          <meshBasicMaterial color="#1a1508" transparent opacity={0.5} />
        </mesh>
      )}
      {/* 標籤殘�? */}
      <mesh position={[0, tipped ? 0.28 : 0.5, 0.285]}>
        <boxGeometry args={[0.2, 0.15, 0.005]} />
        <meshBasicMaterial color="#c8b888" />
      </mesh>
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Factory Props ??工業廢�?
   機械齒輪?�管線架?�工業桶?�輸?�帶??
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function MachineryGear({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const s = 0.8 + Math.abs(Math.sin(position[0] * 3)) * 0.6
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={s}>
      {/* 齒輪?��? */}
      <mesh position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.6, 0.12, 6, 12]} />
        <meshBasicMaterial color="#454550" />
      </mesh>
      {/* 中�?�?*/}
      <mesh position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.3, 8]} />
        <meshBasicMaterial color="#555560" />
      </mesh>
      {/* ?��?�?*/}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.6, 0.5]} />
        <meshBasicMaterial color="#3a3a42" />
      </mesh>
      {/* ?��?大�??��? */}
      <RustMark position={[0.5, 0.8, 0.1]} scale={1.5} />
      <RustMark position={[-0.3, 0.4, 0.26]} scale={1.0} />
      {/* 油漬?�面 */}
      <mesh position={[0, 0.005, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 6]} />
        <meshBasicMaterial color="#1a1a10" transparent opacity={0.4} />
      </mesh>
      {/* 底部碎�? */}
      <RubblePile position={[0.5, 0, 0.3]} rotation={rotation * 2} color="#4a4a48" />
    </group>
  )
}

function PipeRack({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 橫管 ???��???*/}
      <mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 2.5, 8]} />
        <meshBasicMaterial color="#7a6050" />
      </mesh>
      <mesh position={[0, 0.8, 0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 2.2, 7]} />
        <meshBasicMaterial color="#8a6e38" />
      </mesh>
      {/* ?�架 */}
      {[-0.9, 0.9].map(x => (
        <mesh key={x} position={[x, 0.6, 0.15]} castShadow>
          <boxGeometry args={[0.08, 1.2, 0.08]} />
          <meshBasicMaterial color="#4a4a52" />
        </mesh>
      ))}
      {/* 管�??�口漏水 */}
      <mesh position={[0.5, 0.9, 0.15]} rotation={[-Math.PI / 2 + 0.2, 0, 0]}>
        <circleGeometry args={[0.08, 5]} />
        <meshBasicMaterial color="#3a5a4a" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* ?�印 */}
      <RustMark position={[-0.3, 1.22, 0.12]} scale={0.9} />
      <RustMark position={[0.6, 0.82, 0.38]} scale={0.7} />
    </group>
  )
}

function ConveyorFrame({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 框架 */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 0.08, 0.8]} />
        <meshBasicMaterial color="#484850" />
      </mesh>
      {/* ?�架 */}
      {[[-1, 0.22, 0.3], [1, 0.22, 0.3], [-1, 0.22, -0.3], [1, 0.22, -0.3]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.08, 0.44, 0.08]} />
          <meshBasicMaterial color="#3a3a42" />
        </mesh>
      ))}
      {/* 滾輪 */}
      {[-0.8, 0, 0.8].map(x => (
        <mesh key={x} position={[x, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.6, 7]} />
          <meshBasicMaterial color="#5a5a62" />
        </mesh>
      ))}
      {/* ?��??�送帶殘�? */}
      <mesh position={[0.3, 0.52, 0]} rotation={[0, 0, 0.05]}>
        <boxGeometry args={[1.2, 0.02, 0.65]} />
        <meshBasicMaterial color="#2a2a28" />
      </mesh>
      {/* ?��? */}
      <RustMark position={[-0.8, 0.46, 0.41]} scale={1.1} />
      {/* ?�面??��?�件 */}
      <ScatteredLitter position={[0.6, 0, 0.5]} rotation={rotation} />
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Hospital Props ??沉�??�院
   ?��??��?滴架?�醫?��??�輪�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function HospitalBed({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 床�? ??污漬??*/}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.12, 2.0]} />
        <meshBasicMaterial color="#b8b0a0" />
      </mesh>
      {/* 血漬在床�?�?*/}
      <mesh position={[0.15, 0.565, 0.2]} rotation={[-Math.PI / 2, 0, 0.3]}>
        <circleGeometry args={[0.18, 6]} />
        <meshBasicMaterial color="#4a1515" transparent opacity={0.5} />
      </mesh>
      {/* 床架 */}
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[0.92, 0.06, 2.02]} />
        <meshBasicMaterial color="#8a99aa" />
      </mesh>
      {/* ??*/}
      {[[-0.38, 0.19, 0.85], [0.38, 0.19, 0.85], [-0.38, 0.19, -0.85], [0.38, 0.19, -0.85]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <cylinderGeometry args={[0.03, 0.03, 0.38, 5]} />
          <meshBasicMaterial color="#888888" />
        </mesh>
      ))}
      {/* 床頭??*/}
      <mesh position={[0, 0.75, -0.95]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.05]} />
        <meshBasicMaterial color="#7a8899" />
      </mesh>
      {/* ?�頭 ??歪�? */}
      <mesh position={[0.08, 0.6, -0.7]} rotation={[0, 0.15, 0.05]}>
        <boxGeometry args={[0.5, 0.08, 0.3]} />
        <meshBasicMaterial color="#c8c0b0" />
      </mesh>
      {/* 床�???��??*/}
      <ScatteredLitter position={[0.5, 0, 0.3]} rotation={rotation * 2} />
      {/* ?�面血�?*/}
      <BloodStain position={[-0.3, 0, 0.5]} scale={0.6} />
    </group>
  )
}

function IVStand({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, (Math.sin(rotation * 9) - 0.5) * 0.2]}>
      {/* 立桿 */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.025, 1.8, 5]} />
        <meshBasicMaterial color="#aaaaaa" />
      </mesh>
      {/* ?�部?�鉤 */}
      <mesh position={[0, 1.82, 0]}>
        <boxGeometry args={[0.25, 0.03, 0.03]} />
        <meshBasicMaterial color="#999999" />
      </mesh>
      {/* 點滴�?*/}
      <mesh position={[0.08, 1.6, 0]}>
        <boxGeometry args={[0.1, 0.2, 0.06]} />
        <meshBasicMaterial color="#8aaa99" transparent opacity={0.6} />
      </mesh>
      {/* 輸液�????��? */}
      <mesh position={[0.06, 1.35, 0.02]} rotation={[0.1, 0, 0.05]}>
        <cylinderGeometry args={[0.005, 0.005, 0.4, 4]} />
        <meshBasicMaterial color="#ccccbb" />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.15, 0.18, 0.04, 8]} />
        <meshBasicMaterial color="#888888" />
      </mesh>
      {/* ?�印 */}
      <RustMark position={[0.025, 0.5, 0]} scale={0.5} />
      {/* ?�面滴液 */}
      <mesh position={[0.1, 0.005, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.06, 5]} />
        <meshBasicMaterial color="#3a5a4a" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

function MedCabinet({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const doorOpen = Math.sin(rotation * 11) > 0.3
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 1.2, 0.35]} />
        <meshBasicMaterial color="#c8c8c0" />
      </mesh>
      {/* ?� ???��??��? */}
      <mesh position={[doorOpen ? 0.25 : 0, 0.6, doorOpen ? 0.25 : 0.18]} rotation={[0, doorOpen ? 0.8 : 0, 0]}>
        <boxGeometry args={[0.55, 1.1, 0.02]} />
        <meshBasicMaterial color="#bbc0bb" />
      </mesh>
      {/* ?��? */}
      <mesh position={[doorOpen ? 0.05 : 0.2, 0.6, doorOpen ? 0.35 : 0.2]}>
        <boxGeometry args={[0.04, 0.12, 0.03]} />
        <meshBasicMaterial color="#999999" />
      </mesh>
      {/* 紅�?�???褮色 */}
      <mesh position={[0, 0.9, 0.19]}>
        <boxGeometry args={[0.15, 0.04, 0.01]} />
        <meshBasicMaterial color="#993333" />
      </mesh>
      <mesh position={[0, 0.9, 0.19]}>
        <boxGeometry args={[0.04, 0.15, 0.01]} />
        <meshBasicMaterial color="#993333" />
      </mesh>
      {/* 櫃內?�瓶??�� (?��??�?��??��?) */}
      {doorOpen && (
        <>
          <mesh position={[-0.1, 0.45, 0.05]}>
            <cylinderGeometry args={[0.03, 0.03, 0.08, 5]} />
            <meshBasicMaterial color="#cc7733" />
          </mesh>
          <mesh position={[0.1, 0.85, 0.0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.1, 5]} />
            <meshBasicMaterial color="#33aa55" />
          </mesh>
        </>
      )}
      {/* 櫃�?下方?�面??��?�瓶 */}
      <mesh position={[0.2, 0.02, 0.25]} rotation={[Math.PI / 2, 0, rotation * 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.08, 5]} />
        <meshBasicMaterial color="#ddaa44" />
      </mesh>
      {/* 汙漬 */}
      <mesh position={[-0.15, 0.3, 0.19]} rotation={[0, 0, 0.5]}>
        <circleGeometry args={[0.08, 5]} />
        <meshBasicMaterial color="#6a5a4a" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Residential Props ??廢�?住�??�
   桌�??��?子、書?�、電視�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function Table({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 桌面 ???��???*/}
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.06, 0.6]} />
        <meshBasicMaterial color="#6a4820" />
      </mesh>
      {/* 桌腳 */}
      {[[-0.42, 0.32, 0.22], [0.42, 0.32, 0.22], [-0.42, 0.32, -0.22], [0.42, 0.32, -0.22]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.05, 0.64, 0.05]} />
          <meshBasicMaterial color="#5a3818" />
        </mesh>
      ))}
      {/* 桌面汙漬 */}
      <mesh position={[0.15, 0.685, 0.05]} rotation={[-Math.PI / 2, 0, 0.6]}>
        <circleGeometry args={[0.1, 5]} />
        <meshBasicMaterial color="#4a3015" transparent opacity={0.35} />
      </mesh>
      {/* 桌�???��?????�盤�?*/}
      <mesh position={[-0.2, 0.7, 0.1]} rotation={[-Math.PI / 2 + 0.03, 0, rotation]}>
        <circleGeometry args={[0.1, 7]} />
        <meshBasicMaterial color="#c8c0b0" side={THREE.DoubleSide} />
      </mesh>
      {/* 桌�??�圾 */}
      <ScatteredLitter position={[0.3, 0, -0.2]} rotation={rotation * 2} />
    </group>
  )
}

function Chair({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const tipped = Math.sin(rotation * 11) > 0.5
  return (
    <group position={position} rotation={[tipped ? 1.2 : 0, rotation, 0]}>
      {/* 座面 */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.4, 0.04, 0.4]} />
        <meshBasicMaterial color="#7a5828" />
      </mesh>
      {/* 椅�? ???��?壞�?�?*/}
      <mesh position={[0, 0.65, -0.18]} castShadow>
        <boxGeometry args={[0.38, 0.5, 0.04]} />
        <meshBasicMaterial color="#6a4818" />
      </mesh>
      {/* 裂縫 */}
      <mesh position={[0.05, 0.6, -0.16]} rotation={[0, 0, 0.6]}>
        <boxGeometry args={[0.015, 0.25, 0.005]} />
        <meshBasicMaterial color="#3a2008" />
      </mesh>
      {/* 椅腳 ??一?�短一�?*/}
      {[[-0.16, 0.2, 0.16], [0.16, 0.2, 0.16], [-0.16, 0.18, -0.16], [0.16, 0.2, -0.16]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.03, i === 2 ? 0.36 : 0.4, 0.03]} />
          <meshBasicMaterial color="#4a2808" />
        </mesh>
      ))}
    </group>
  )
}

function Bookshelf({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, (Math.sin(rotation * 5) - 0.5) * 0.1]}>
      {/* 外�? */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 1.8, 0.3]} />
        <meshBasicMaterial color="#5a4018" />
      </mesh>
      {/* 層板 */}
      {[0.35, 0.7, 1.05, 1.4].map(y => (
        <mesh key={y} position={[0, y, 0.02]}>
          <boxGeometry args={[0.7, 0.03, 0.25]} />
          <meshBasicMaterial color="#4a3010" />
        </mesh>
      ))}
      {/* ??��?�書 ???��??�本 */}
      <mesh position={[-0.1, 0.5, 0.05]} rotation={[0, 0.2, 0.1]}>
        <boxGeometry args={[0.15, 0.2, 0.1]} />
        <meshBasicMaterial color="#884422" />
      </mesh>
      <mesh position={[0.15, 0.85, 0.05]} rotation={[0, -0.15, -0.05]}>
        <boxGeometry args={[0.12, 0.18, 0.08]} />
        <meshBasicMaterial color="#336644" />
      </mesh>
      <mesh position={[0.2, 1.2, 0.06]} rotation={[0, 0.3, 0.15]}>
        <boxGeometry args={[0.1, 0.16, 0.07]} />
        <meshBasicMaterial color="#445588" />
      </mesh>
      {/* ?�面?�落?�書 */}
      <mesh position={[-0.3, 0.04, 0.22]} rotation={[-0.1, 0.8, 0.05]}>
        <boxGeometry args={[0.14, 0.02, 0.2]} />
        <meshBasicMaterial color="#774433" />
      </mesh>
      <mesh position={[0.1, 0.03, 0.3]} rotation={[-0.05, 0.3, 0]}>
        <boxGeometry args={[0.12, 0.02, 0.16]} />
        <meshBasicMaterial color="#225544" />
      </mesh>
      {/* ?�塵 */}
      <mesh position={[0, 1.8, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.75, 0.28, 0.005]} />
        <meshBasicMaterial color="#8a8878" transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

function TVSet({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const cracked = Math.sin(rotation * 9) > 0
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* ?��?機殼 */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.7, 0.45, 0.08]} />
        <meshBasicMaterial color="#2a2a32" />
      </mesh>
      {/* ?��? (碎�?) */}
      <mesh position={[0, 0.5, 0.045]}>
        <boxGeometry args={[0.6, 0.36, 0.01]} />
        <meshBasicMaterial color="#1a1a28" />
      </mesh>
      {/* 碎�?�?*/}
      {cracked && (
        <>
          <mesh position={[-0.05, 0.55, 0.052]} rotation={[0, 0, 0.7]}>
            <boxGeometry args={[0.015, 0.3, 0.002]} />
            <meshBasicMaterial color="#444450" />
          </mesh>
          <mesh position={[0.08, 0.45, 0.052]} rotation={[0, 0, -0.4]}>
            <boxGeometry args={[0.01, 0.2, 0.002]} />
            <meshBasicMaterial color="#444450" />
          </mesh>
          {/* 裂縫交�?點�? */}
          <mesh position={[0, 0.5, 0.053]}>
            <circleGeometry args={[0.02, 4]} />
            <meshBasicMaterial color="#667788" transparent opacity={0.3} />
          </mesh>
        </>
      )}
      {/* 底座 */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.3, 0.08, 0.15]} />
        <meshBasicMaterial color="#333340" />
      </mesh>
      {/* ?�塵 */}
      <mesh position={[0, 0.74, 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.65, 0.06, 0.005]} />
        <meshBasicMaterial color="#7a7868" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Underground Props ???��??��???
   汽�?殘骸?�交?��??�水泥柱?��???
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function CarWreck({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const burned = Math.sin(rotation * 5) > 0.3
  return (
    <group position={position} rotation={[(Math.sin(rotation * 3) - 0.5) * 0.08, rotation, 0]}>
      {/* 車身 ???��???*/}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.6, 0.9]} />
        <meshBasicMaterial color={burned ? '#2a2020' : '#3a4050'} />
      </mesh>
      {/* 車�?/駕�??????�陷 */}
      <mesh position={[0.1, burned ? 0.85 : 0.9, 0]} castShadow>
        <boxGeometry args={[0.9, burned ? 0.38 : 0.45, 0.8]} />
        <meshBasicMaterial color={burned ? '#1a1818' : '#2a3040'} />
      </mesh>
      {/* 車�? ???��? */}
      <mesh position={[0.1, 0.92, 0.41]}>
        <boxGeometry args={[0.5, 0.2, 0.01]} />
        <meshBasicMaterial color="#445566" transparent opacity={0.35} />
      </mesh>
      {/* 碎玻?�散??*/}
      {[[-0.2, 0.02, 0.55], [0.3, 0.02, 0.6]].map((p, i) => (
        <mesh key={`g${i}`} position={p as [number, number, number]} rotation={[-Math.PI / 2, 0, rotation * (i + 1)]}>
          <circleGeometry args={[0.06, 4]} />
          <meshBasicMaterial color="#88aacc" transparent opacity={0.3} />
        </mesh>
      ))}
      {/* 輪�? ??缺�???*/}
      {[[-0.55, 0.18, 0.45], [0.55, 0.18, 0.45], [-0.55, 0.18, -0.45]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 8]} />
          <meshBasicMaterial color="#222228" />
        </mesh>
      ))}
      {/* 車頭??(碎�?) */}
      <mesh position={[-0.75, 0.45, 0.3]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshBasicMaterial color="#998866" />
      </mesh>
      {/* ?��? */}
      <RustMark position={[0.4, 0.3, 0.46]} scale={0.3} />
      <RustMark position={[-0.6, 0.55, 0.46]} scale={0.2} />
      {/* 血�?*/}
      <BloodStain position={[0.5, 0.01, 0.7]} scale={0.5} />
      {/* ?�面漏油 */}
      <mesh position={[-0.3, 0.01, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 6]} />
        <meshBasicMaterial color="#1a1a10" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

function TrafficCone({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const fallen = Math.sin(rotation * 7) > 0.4
  return (
    <group position={position} rotation={[fallen ? 1.4 : 0, rotation, 0]}>
      <mesh position={[0, fallen ? 0.15 : 0.25, 0]} castShadow>
        <coneGeometry args={[0.15, 0.5, 6]} />
        <meshBasicMaterial color="#aa4400" />
      </mesh>
      {/* ?��?�???褪色 */}
      <mesh position={[0, fallen ? 0.22 : 0.32, 0]}>
        <coneGeometry args={[0.12, 0.1, 6]} />
        <meshBasicMaterial color="#ccccaa" />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, fallen ? 0.02 : 0.03, 0]}>
        <boxGeometry args={[0.3, 0.04, 0.3]} />
        <meshBasicMaterial color="#993c00" />
      </mesh>
      {/* 髒污 */}
      <mesh position={[0.02, fallen ? 0.1 : 0.15, 0.1]} rotation={[0.3, 0, 0.1]}>
        <boxGeometry args={[0.08, 0.15, 0.005]} />
        <meshBasicMaterial color="#5a4020" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

function ConcreteColumn({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const h = 3 + Math.abs(Math.sin(position[0] * 4.7)) * 2
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.35, 0.4, h, 8]} />
        <meshBasicMaterial color="#585e68" />
      </mesh>
      {/* 裂縫紋路 ??多�? */}
      <mesh position={[0.3, h * 0.4, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.02, h * 0.3, 0.02]} />
        <meshBasicMaterial color="#383840" />
      </mesh>
      <mesh position={[-0.2, h * 0.6, 0.2]} rotation={[0, 0.4, -0.15]}>
        <boxGeometry args={[0.015, h * 0.2, 0.015]} />
        <meshBasicMaterial color="#404448" />
      </mesh>
      {/* ?��?外露 */}
      <mesh position={[0.28, h * 0.7, 0.1]} rotation={[0, 0, 0.1]}>
        <cylinderGeometry args={[0.015, 0.015, 0.5, 4]} />
        <meshBasicMaterial color="#8a5030" />
      </mesh>
      {/* 底部水漬 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 8]} />
        <meshBasicMaterial color="#4a5058" transparent opacity={0.2} />
      </mesh>
      {/* ?��? */}
      <RustMark position={[0.15, h * 0.35, 0.35]} scale={0.15} />
    </group>
  )
}

function ParkingBarrier({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const bent = Math.sin(rotation * 13) > 0.3
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 橫桿 ??彎曲 */}
      <mesh position={[bent ? -0.1 : 0, bent ? 0.5 : 0.6, 0]} rotation={[0, 0, Math.PI / 2 + (bent ? 0.15 : 0)]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.0, 6]} />
        <meshBasicMaterial color="#bbaa18" />
      </mesh>
      {/* 立柱 */}
      {[-0.9, 0.9].map(x => (
        <mesh key={x} position={[x, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
          <meshBasicMaterial color="#bbaa18" />
        </mesh>
      ))}
      {/* ?��? */}
      <RustMark position={[-0.4, 0.55, 0.05]} scale={0.12} />
      <RustMark position={[0.6, 0.62, -0.04]} scale={0.1} />
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Core Props ???�日?��?
   ?��?水晶?��??�主�??�發?�管?�浮?��?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function EnergyCrystal({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const ref = useRef<THREE.Group>(null)
  const s = 0.6 + Math.abs(Math.sin(position[0] * 5.3)) * 0.8
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.3 + rotation
      ref.current.position.y = position[1] + 0.5 + Math.sin(clock.elapsedTime * 0.8 + rotation) * 0.15
    }
  })
  return (
    <group ref={ref} position={position} scale={s}>
      <mesh castShadow>
        <octahedronGeometry args={[0.5, 0]} />
        <meshBasicMaterial
          color="#aa44cc"
         
         
         
         
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* 小�??��???*/}
      <mesh position={[0.5, 0.3, 0]}>
        <octahedronGeometry args={[0.15, 0]} />
        <meshBasicMaterial color="#cc66ee" transparent opacity={0.7} />
      </mesh>
      <mesh position={[-0.35, -0.2, 0.3]}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshBasicMaterial color="#bb55dd" transparent opacity={0.6} />
      </mesh>
      {/* 底座?�環 */}
      <mesh position={[0, -0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.03, 6, 16]} />
        <meshBasicMaterial color="#884488" transparent opacity={0.5} />
      </mesh>
      {/* ?�面裂縫?�能?�侵??*/}
      <mesh position={[0, -0.48, 0]} rotation={[-Math.PI / 2, 0, rotation * 3]}>
        <ringGeometry args={[0.5, 0.8, 6]} />
        <meshBasicMaterial color="#6622aa" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function TechConsole({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const damaged = Math.sin(rotation * 7) > 0.2
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 主�?�?*/}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 1.0, 0.5]} />
        <meshBasicMaterial color="#2a1830" />
      </mesh>
      {/* ?��? ??碎�?/�?�� */}
      <mesh position={[0, 0.7, 0.26]}>
        <boxGeometry args={[0.6, 0.35, 0.02]} />
        <meshBasicMaterial
          color={damaged ? '#110022' : '#220044'}
         
         
        />
      </mesh>
      {/* 碎�?�?*/}
      {damaged && (
        <mesh position={[-0.08, 0.75, 0.275]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.01, 0.25, 0.002]} />
          <meshBasicMaterial color="#443355" />
        </mesh>
      )}
      {/* ?�示??*/}
      {[[-0.25, 0.35], [0, 0.35], [0.25, 0.35]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.26]}>
          <sphereGeometry args={[0.03, 6, 6]} />
          <meshBasicMaterial
            color={i === 0 ? '#44ff44' : i === 1 ? '#ffaa22' : '#ff2222'}
           
           
          />
        </mesh>
      ))}
      {/* ?�面?��? */}
      <mesh position={[0.3, 0.02, 0.35]} rotation={[-Math.PI / 2, 0, rotation * 2]}>
        <torusGeometry args={[0.15, 0.01, 4, 8]} />
        <meshBasicMaterial color="#222230" />
      </mesh>
      {/* ?��? */}
      <RustMark position={[-0.35, 0.3, 0.26]} scale={0.12} />
    </group>
  )
}

function GlowTube({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  const h = 1.5 + Math.abs(Math.sin(position[2] * 7)) * 1.5
  const broken = Math.sin(rotation * 11) > 0.4
  return (
    <group position={position} rotation={[0, rotation, broken ? 0.2 : 0]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, h, 8]} />
        <meshBasicMaterial
          color={broken ? '#443366' : '#6633aa'}
         
         
          transparent
          opacity={broken ? 0.45 : 0.7}
        />
      </mesh>
      {/* 底座 */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.15, 0.18, 0.1, 8]} />
        <meshBasicMaterial color="#3a2048" />
      </mesh>
      {/* ?�座 */}
      <mesh position={[0, h + 0.05, 0]}>
        <cylinderGeometry args={[0.18, 0.15, 0.1, 8]} />
        <meshBasicMaterial color="#3a2048" />
      </mesh>
      {/* 底部液�?滴落 */}
      <mesh position={[0.05, 0.01, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.06, 5]} />
        <meshBasicMaterial color="#5522aa" transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   Scene Prop Generator ??依場?�模式產?��???
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

function generateSceneElements(mode: SceneMode, stageId: string = '1-1'): React.ReactNode[] {
  const elements: React.ReactNode[] = []
  // �?stageId（�? "3-5"）�??�數?��?移�?讓�?章�??��??��?不�??�具佈�?
  const [ch, st] = stageId.split('-').map(Number)
  const stageSeed = (isNaN(ch) ? 1 : ch) * 100 + (isNaN(st) ? 1 : st)
  const seed = mode.charCodeAt(0) * 1000 + mode.charCodeAt(1) * 100 + (mode.charCodeAt(2) ?? 0) + stageSeed

  switch (mode) {
    case 'city':
    case 'story': {
      const signs = scatter(5, seed + 1, 24, 8)
      const buildings = scatter(6, seed + 2, 28, 10)
      const lights = scatter(4, seed + 3, 22, 8)
      const barriers = scatter(6, seed + 4, 20, 7)
      signs.forEach((s, i) => elements.push(<Signpost key={`sign${i}`} position={s.pos} rotation={s.rot} />))
      buildings.forEach((s, i) => elements.push(<BuildingRuin key={`bld${i}`} position={s.pos} rotation={s.rot} />))
      lights.forEach((s, i) => elements.push(<StreetLight key={`sl${i}`} position={s.pos} rotation={s.rot} />))
      barriers.forEach((s, i) => elements.push(<ConcreteBarrier key={`bar${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(4, seed + 10, 22, 8).forEach((s, i) => elements.push(<RubblePile key={`crub${i}`} position={s.pos} scale={0.6 + Math.abs(Math.sin(s.rot * 3)) * 0.4} />))
      scatter(3, seed + 11, 20, 7).forEach((s, i) => elements.push(<BloodStain key={`cbld${i}`} position={[s.pos[0], 0.01, s.pos[2]]} scale={0.4 + Math.abs(Math.sin(s.rot * 5)) * 0.5} />))
      scatter(5, seed + 12, 18, 7).forEach((s, i) => elements.push(<ScatteredLitter key={`clit${i}`} position={s.pos} rotation={s.rot} />))
      // 敵方後方加密
      scatterBehind(4, seed + 20).forEach((s, i) => elements.push(<BuildingRuin key={`bbld${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 21).forEach((s, i) => elements.push(<ConcreteBarrier key={`bbar${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 22).forEach((s, i) => elements.push(<StreetLight key={`bsl${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(4, seed + 23).forEach((s, i) => elements.push(<RubblePile key={`brub${i}`} position={s.pos} scale={0.5 + Math.abs(Math.sin(s.rot * 3)) * 0.5} />))
      break
      const trees = scatter(10, seed + 1, 26, 9)
      const logs = scatter(5, seed + 2, 22, 8)
      const mushrooms = scatter(8, seed + 3, 20, 7)
      trees.forEach((s, i) => elements.push(<TreeTrunk key={`tree${i}`} position={s.pos} rotation={s.rot} />))
      logs.forEach((s, i) => elements.push(<FallenLog key={`log${i}`} position={s.pos} rotation={s.rot} />))
      mushrooms.forEach((s, i) => elements.push(<Mushroom key={`mush${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(3, seed + 10, 22, 8).forEach((s, i) => elements.push(<BloodStain key={`fbld${i}`} position={[s.pos[0], 0.01, s.pos[2]]} scale={0.3 + Math.abs(Math.sin(s.rot * 4)) * 0.4} />))
      scatter(4, seed + 11, 18, 7).forEach((s, i) => elements.push(<ScatteredLitter key={`flit${i}`} position={s.pos} rotation={s.rot} />))
      // 敵方後方加密
      scatterBehind(5, seed + 20).forEach((s, i) => elements.push(<TreeTrunk key={`btree${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 21).forEach((s, i) => elements.push(<FallenLog key={`blog${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(4, seed + 22).forEach((s, i) => elements.push(<Mushroom key={`bmush${i}`} position={s.pos} rotation={s.rot} />))
      break
    }
    case 'wasteland': {
      const carts = scatter(5, seed + 1, 22, 8)
      const shelves = scatter(4, seed + 2, 24, 9)
      const drums = scatter(6, seed + 3, 22, 7)
      carts.forEach((s, i) => elements.push(<ShoppingCart key={`cart${i}`} position={s.pos} rotation={s.rot} />))
      shelves.forEach((s, i) => elements.push(<BrokenShelf key={`shelf${i}`} position={s.pos} rotation={s.rot} />))
      drums.forEach((s, i) => elements.push(<OilDrum key={`drum${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(5, seed + 10, 20, 8).forEach((s, i) => elements.push(<RubblePile key={`wrub${i}`} position={s.pos} scale={0.5 + Math.abs(Math.sin(s.rot * 2)) * 0.5} />))
      scatter(4, seed + 11, 18, 7).forEach((s, i) => elements.push(<ScatteredLitter key={`wlit${i}`} position={s.pos} rotation={s.rot} />))
      scatter(2, seed + 12, 20, 7).forEach((s, i) => elements.push(<BloodStain key={`wbld${i}`} position={[s.pos[0], 0.01, s.pos[2]]} scale={0.3 + Math.abs(Math.sin(s.rot * 6)) * 0.3} />))
      // 敵方後方加密
      scatterBehind(4, seed + 20).forEach((s, i) => elements.push(<OilDrum key={`bdrum${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 21).forEach((s, i) => elements.push(<BrokenShelf key={`bshelf${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 22).forEach((s, i) => elements.push(<ShoppingCart key={`bcart${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(4, seed + 23).forEach((s, i) => elements.push(<RubblePile key={`bwrub${i}`} position={s.pos} scale={0.5 + Math.abs(Math.sin(s.rot * 2)) * 0.5} />))
      break
    }
    case 'factory': {
      const gears = scatter(5, seed + 1, 24, 8)
      const pipes = scatter(4, seed + 2, 22, 9)
      const conveyors = scatter(3, seed + 3, 24, 10)
      const drums = scatter(5, seed + 4, 20, 7)
      gears.forEach((s, i) => elements.push(<MachineryGear key={`gear${i}`} position={s.pos} rotation={s.rot} />))
      pipes.forEach((s, i) => elements.push(<PipeRack key={`pipe${i}`} position={s.pos} rotation={s.rot} />))
      conveyors.forEach((s, i) => elements.push(<ConveyorFrame key={`conv${i}`} position={s.pos} rotation={s.rot} />))
      drums.forEach((s, i) => elements.push(<OilDrum key={`fdrum${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(4, seed + 10, 22, 8).forEach((s, i) => elements.push(<RubblePile key={`frub${i}`} position={s.pos} scale={0.5 + Math.abs(Math.sin(s.rot * 3)) * 0.5} />))
      scatter(3, seed + 11, 18, 7).forEach((s, i) => elements.push(<ScatteredLitter key={`flit${i}`} position={s.pos} rotation={s.rot} />))
      // 敵方後方加密
      scatterBehind(3, seed + 20).forEach((s, i) => elements.push(<MachineryGear key={`bgear${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 21).forEach((s, i) => elements.push(<PipeRack key={`bpipe${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 22).forEach((s, i) => elements.push(<OilDrum key={`bfdrum${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(2, seed + 23).forEach((s, i) => elements.push(<ConveyorFrame key={`bconv${i}`} position={s.pos} rotation={s.rot} />))
      break
    }
    case 'hospital': {
      const beds = scatter(5, seed + 1, 22, 9)
      const ivs = scatter(5, seed + 2, 20, 8)
      const cabinets = scatter(4, seed + 3, 22, 8)
      beds.forEach((s, i) => elements.push(<HospitalBed key={`bed${i}`} position={s.pos} rotation={s.rot} />))
      ivs.forEach((s, i) => elements.push(<IVStand key={`iv${i}`} position={s.pos} rotation={s.rot} />))
      cabinets.forEach((s, i) => elements.push(<MedCabinet key={`cab${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(5, seed + 10, 20, 8).forEach((s, i) => elements.push(<BloodStain key={`hbld${i}`} position={[s.pos[0], 0.01, s.pos[2]]} scale={0.4 + Math.abs(Math.sin(s.rot * 3)) * 0.6} />))
      scatter(3, seed + 11, 18, 7).forEach((s, i) => elements.push(<ScatteredLitter key={`hlit${i}`} position={s.pos} rotation={s.rot} />))
      // 敵方後方加密
      scatterBehind(3, seed + 20).forEach((s, i) => elements.push(<HospitalBed key={`bbed${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 21).forEach((s, i) => elements.push(<IVStand key={`biv${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 22).forEach((s, i) => elements.push(<MedCabinet key={`bcab${i}`} position={s.pos} rotation={s.rot} />))
      break
    }
    case 'residential': {
      const tables = scatter(4, seed + 1, 22, 8)
      const chairs = scatter(7, seed + 2, 20, 7)
      const shelves = scatter(3, seed + 3, 24, 9)
      const tvs = scatter(3, seed + 4, 20, 8)
      tables.forEach((s, i) => elements.push(<Table key={`tbl${i}`} position={s.pos} rotation={s.rot} />))
      chairs.forEach((s, i) => elements.push(<Chair key={`chr${i}`} position={s.pos} rotation={s.rot} />))
      shelves.forEach((s, i) => elements.push(<Bookshelf key={`bks${i}`} position={s.pos} rotation={s.rot} />))
      tvs.forEach((s, i) => elements.push(<TVSet key={`tv${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(3, seed + 10, 20, 8).forEach((s, i) => elements.push(<RubblePile key={`rrub${i}`} position={s.pos} scale={0.4 + Math.abs(Math.sin(s.rot * 2)) * 0.4} />))
      scatter(3, seed + 11, 18, 7).forEach((s, i) => elements.push(<BloodStain key={`rbld${i}`} position={[s.pos[0], 0.01, s.pos[2]]} scale={0.3 + Math.abs(Math.sin(s.rot * 4)) * 0.3} />))
      scatter(4, seed + 12, 16, 6).forEach((s, i) => elements.push(<ScatteredLitter key={`rlit${i}`} position={s.pos} rotation={s.rot} />))
      // 敵方後方加密
      scatterBehind(3, seed + 20).forEach((s, i) => elements.push(<Table key={`btbl${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(4, seed + 21).forEach((s, i) => elements.push(<Chair key={`bchr${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(2, seed + 22).forEach((s, i) => elements.push(<Bookshelf key={`bbks${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(2, seed + 23).forEach((s, i) => elements.push(<TVSet key={`btv${i}`} position={s.pos} rotation={s.rot} />))
      break
    }
    case 'underground': {
      const cars = scatter(4, seed + 1, 24, 10)
      const cones = scatter(8, seed + 2, 22, 7)
      const columns = scatter(6, seed + 3, 26, 8)
      const barriers = scatter(4, seed + 4, 20, 8)
      cars.forEach((s, i) => elements.push(<CarWreck key={`car${i}`} position={s.pos} rotation={s.rot} />))
      cones.forEach((s, i) => elements.push(<TrafficCone key={`cone${i}`} position={s.pos} rotation={s.rot} />))
      columns.forEach((s, i) => elements.push(<ConcreteColumn key={`col${i}`} position={s.pos} rotation={s.rot} />))
      barriers.forEach((s, i) => elements.push(<ParkingBarrier key={`pbar${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(4, seed + 10, 22, 8).forEach((s, i) => elements.push(<RubblePile key={`urub${i}`} position={s.pos} scale={0.5 + Math.abs(Math.sin(s.rot * 3)) * 0.5} />))
      scatter(4, seed + 11, 20, 8).forEach((s, i) => elements.push(<BloodStain key={`ubld${i}`} position={[s.pos[0], 0.01, s.pos[2]]} scale={0.4 + Math.abs(Math.sin(s.rot * 5)) * 0.5} />))
      scatter(3, seed + 12, 18, 7).forEach((s, i) => elements.push(<ScatteredLitter key={`ulit${i}`} position={s.pos} rotation={s.rot} />))
      // 敵方後方加密
      scatterBehind(3, seed + 20).forEach((s, i) => elements.push(<CarWreck key={`bcar${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(4, seed + 21).forEach((s, i) => elements.push(<ConcreteColumn key={`bcol${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(4, seed + 22).forEach((s, i) => elements.push(<TrafficCone key={`bcone${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(2, seed + 23).forEach((s, i) => elements.push(<ParkingBarrier key={`bpbar${i}`} position={s.pos} rotation={s.rot} />))
      break
    }
    case 'core': {
      const crystals = scatter(6, seed + 1, 22, 8)
      const consoles = scatter(4, seed + 2, 24, 9)
      const tubes = scatter(6, seed + 3, 20, 7)
      crystals.forEach((s, i) => elements.push(<EnergyCrystal key={`crys${i}`} position={s.pos} rotation={s.rot} />))
      consoles.forEach((s, i) => elements.push(<TechConsole key={`cons${i}`} position={s.pos} rotation={s.rot} />))
      tubes.forEach((s, i) => elements.push(<GlowTube key={`tube${i}`} position={s.pos} rotation={s.rot} />))
      // 氛�??��?
      scatter(3, seed + 10, 20, 8).forEach((s, i) => elements.push(<RubblePile key={`xrub${i}`} position={s.pos} scale={0.4 + Math.abs(Math.sin(s.rot * 2)) * 0.4} />))
      scatter(2, seed + 11, 18, 7).forEach((s, i) => elements.push(<BloodStain key={`xbld${i}`} position={[s.pos[0], 0.01, s.pos[2]]} scale={0.3 + Math.abs(Math.sin(s.rot * 4)) * 0.4} />))
      // 敵方後方加密
      scatterBehind(4, seed + 20).forEach((s, i) => elements.push(<EnergyCrystal key={`bcrys${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 21).forEach((s, i) => elements.push(<GlowTube key={`btube${i}`} position={s.pos} rotation={s.rot} />))
      scatterBehind(3, seed + 22).forEach((s, i) => elements.push(<TechConsole key={`bcons${i}`} position={s.pos} rotation={s.rot} />))
      break
    }
    // tower / daily / pvp / boss 不額外加道具（使用通用 debris）
    default:
      break
  }
  return elements
}

/* ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???
   主�?�?
   ?��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��??��???*/

export function SceneProps({ sceneMode, stageId = '1-1' }: { sceneMode: SceneMode; stageId?: string }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const elements = useMemo(() => generateSceneElements(sceneMode, stageId), [sceneMode, stageId])
  return <>{elements}</>
}
