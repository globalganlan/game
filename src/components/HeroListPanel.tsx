/**
 * HeroListPanel — 英雄列表面板
 *
 * 顯示玩家擁有的英雄，含等級/突破/星級/裝備資訊。
 * 點擊英雄可查看詳細數值（3D 待機模型 + 屬性 + 技能 + 裝備）。
 */

import { useState, useMemo, useRef, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useAnimations, OrbitControls } from '@react-three/drei'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import * as THREE from 'three'
import type { RawHeroData } from '../types'
import type { HeroInstance } from '../services/saveService'
import type { SkillTemplate, HeroSkillConfig } from '../domain/types'
import { getHeroSkillSet } from '../services/dataService'
import { getStarPassiveSlots } from '../domain/progressionSystem'
import { getGlbForSuspense } from '../loaders/glbLoader'
// 3D idle animation is the hero detail showcase; Thumbnail3D kept for grid cards only
import { Thumbnail3D } from './UIOverlay'

/* ────────────────────────────
   Rarity Config
   ──────────────────────────── */

type RarityLabel = 'SSR' | 'SR' | 'R' | 'N'

const RARITY_CONFIG: Record<RarityLabel, { color: string; border: string; bg: string }> = {
  SSR: { color: '#ffd43b', border: '#ffd43b', bg: 'rgba(255,212,59,0.12)' },
  SR:  { color: '#be4bdb', border: '#be4bdb', bg: 'rgba(190,75,219,0.10)' },
  R:   { color: '#4dabf7', border: '#4dabf7', bg: 'rgba(77,171,247,0.08)' },
  N:   { color: '#888',    border: '#555',    bg: 'rgba(136,136,136,0.06)' },
}

function numToRarity(n: number | string | unknown): RarityLabel {
  const v = Number(n)
  if (v >= 4) return 'SSR'
  if (v === 3) return 'SR'
  if (v === 2) return 'R'
  return 'N'
}

/** 稀有度排序權值（高稀有度排前） */
function raritySortWeight(h: RawHeroData): number {
  const r = Number((h as Record<string, unknown>).Rarity ?? 1)
  return -r  // 負數讓高稀有度排前
}

/** 初始星數（依稀有度：SSR→3, SR→2, others→1） */
function initialStars(rarity: number | string | unknown): number {
  const v = Number(rarity)
  if (v >= 4) return 3
  if (v === 3) return 2
  return 1
}

/** 將原始英雄資料的 ID 正規化為 `zombie_N` 格式 */
function resolveModelId(h: RawHeroData, idx = 0): string {
  const rawId = h._modelId || h.ModelID || h.HeroID || h.ModelId || h.Model || h.id || h.Name
  if (!rawId) return `zombie_${idx + 1}`
  const idText = rawId.toString().trim()
  const zm = idText.match(/zombie[_-]?(\d+)/i)
  if (zm) return `zombie_${zm[1]}`
  const nm = idText.match(/\d+/)
  if (nm) return `zombie_${nm[0]}`
  return `zombie_${idx + 1}`
}

/* ────────────────────────────
   Element / Type Config
   ──────────────────────────── */

const ELEMENT_ICON: Record<string, string> = {
  闇: '🌑', 毒: '☠️', 火: '🔥', 冰: '❄️', 光: '✨', 雷: '⚡',
}

const ELEMENT_COLOR: Record<string, string> = {
  闇: '#9775fa', 毒: '#51cf66', 火: '#ff6b6b', 冰: '#74c0fc', 光: '#ffd43b', 雷: '#ffa94d',
}

/** 被動技能解鎖所需星級（索引 0=被動1, 1=被動2, ...） */
function getPassiveUnlockStars(passiveIndex: number): number {
  // 根據 STAR_PASSIVE_SLOTS: 1★→1, 2★→2, 4★→3, 6★→4
  const req = [1, 2, 4, 6]
  return req[passiveIndex] ?? 6
}

/** 解析技能圖標：若 icon 是純文字 key（如 "flame_burst"）則回傳 fallback emoji */
function resolveSkillIcon(icon: string, type: 'active' | 'passive'): string {
  if (!icon) return type === 'active' ? '⚔️' : '🔮'
  // 若全為英文字母/數字/底線，判定為 text key → 用 fallback
  if (/^[a-z0-9_]+$/i.test(icon)) return type === 'active' ? '⚔️' : '🔮'
  return icon
}

/* ────────────────────────────
   3D Model Preview (R3F)
   ──────────────────────────── */

/** R3F 子元件：載入 GLB mesh + idle 動畫，播放待機動畫 */
function IdlePreviewModel({ modelId }: { modelId: string }) {
  const groupRef = useRef<THREE.Group>(null!)
  const modelFolder = `${import.meta.env.BASE_URL}models/${modelId}`
  const meshAsset = getGlbForSuspense(`${modelFolder}/${modelId}.glb`)
  const idleAsset = getGlbForSuspense(`${modelFolder}/${modelId}_idle.glb`)

  const { scene: clonedScene, modelScale, centerOffset } = useMemo(() => {
    const cloned = SkeletonUtils.clone(meshAsset.scene)
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const cloneMat = (m: THREE.Material): THREE.MeshStandardMaterial => {
          const c = m.clone() as THREE.MeshStandardMaterial
          if (c.emissive) c.emissive.set(0, 0, 0)
          c.emissiveIntensity = 1
          c.emissiveMap = null
          return c
        }
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(cloneMat)
        else if (mesh.material) mesh.material = cloneMat(mesh.material)
      }
    })
    const bbox = new THREE.Box3().setFromObject(cloned)
    const height = bbox.max.z - bbox.min.z // GLB Armature 保留 Z-up
    const s = height > 0 ? 2.5 / height : 1
    // 計算縮放後的垂直中心偏移（Z-up → Y-up after primitive rendering）
    const centerZ = (bbox.min.z + bbox.max.z) / 2
    const yOffset = -centerZ * s
    return { scene: cloned, modelScale: s, centerOffset: yOffset }
  }, [meshAsset])

  const { actions } = useAnimations(idleAsset.animations, groupRef)

  useEffect(() => {
    const idle = Object.values(actions)[0]
    if (idle) idle.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play()
    return () => { idle?.stop() }
  }, [actions])

  return (
    <group ref={groupRef} position={[0, centerOffset, 0]}>
      <primitive object={clonedScene} scale={modelScale} />
    </group>
  )
}

/** 英雄 3D 模型預覽（獨立 Canvas） */
function HeroModelPreview({ modelId }: { modelId: string }) {
  return (
    <div className="hero-model-preview">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 28 }}
        className="hero-model-canvas"
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 2]} intensity={0.9} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.8}
        />
        <Suspense fallback={null}>
          <IdlePreviewModel modelId={modelId} />
        </Suspense>
      </Canvas>
    </div>
  )
}

/* ────────────────────────────
   Props
   ──────────────────────────── */

interface HeroListPanelProps {
  heroesList: RawHeroData[]
  heroInstances: HeroInstance[]
  onBack: () => void
  /** 技能模板 Map（skillId → SkillTemplate） */
  skills: Map<string, SkillTemplate>
  /** 英雄技能配置 Map（heroId → HeroSkillConfig） */
  heroSkills: Map<number, HeroSkillConfig>
}

/* ────────────────────────────
   星級顯示
   ──────────────────────────── */

function StarDisplay({ count }: { count: number }) {
  return (
    <span className="hero-stars">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={i < count ? 'star-filled' : 'star-empty'}>★</span>
      ))}
    </span>
  )
}

/* ────────────────────────────
   突破顯示
   ──────────────────────────── */

function AscensionPips({ level }: { level: number }) {
  return (
    <span className="hero-ascension">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < level ? 'asc-pip-filled' : 'asc-pip-empty'}>◆</span>
      ))}
    </span>
  )
}

/* ────────────────────────────
   Detail Panel (v2 — 完整英雄資訊)
   ──────────────────────────── */

interface HeroDetailProps {
  hero: RawHeroData
  instance?: HeroInstance
  onClose: () => void
  skills: Map<string, SkillTemplate>
  heroSkills: Map<number, HeroSkillConfig>
}

function HeroDetail({ hero, instance, onClose, skills, heroSkills }: HeroDetailProps) {
  const lvl = instance?.level ?? 1
  const asc = instance?.ascension ?? 0
  const statMult = 1 + (lvl - 1) * 0.04
  const ascMult = 1 + asc * 0.05
  const calcStat = (base: number | undefined) =>
    base != null ? Math.floor(Number(base) * statMult * ascMult) : '?'

  const heroAny = hero as Record<string, unknown>
  const rarity = numToRarity(heroAny.Rarity)
  const rcfg = RARITY_CONFIG[rarity]
  const stars = initialStars(heroAny.Rarity)
  const passiveSlots = getStarPassiveSlots(stars)
  const element = String(heroAny.Element ?? '')
  const heroType = String(heroAny.Type ?? '?')
  const description = String(heroAny.Description ?? '')
  const modelId = resolveModelId(hero)

  // 技能
  const heroId = Number(hero.HeroID ?? hero.id ?? 0)
  const skillSet = useMemo(
    () => getHeroSkillSet(heroId, skills, heroSkills),
    [heroId, skills, heroSkills],
  )

  // 裝備
  const equippedItems = instance?.equippedItems ?? {}
  const EQUIP_SLOTS = [
    { key: 'weapon', label: '武器', icon: '⚔️' },
    { key: 'armor', label: '護甲', icon: '🛡️' },
    { key: 'accessory', label: '飾品', icon: '💍' },
  ]

  return (
    <div className="hero-detail-backdrop" onClick={onClose}>
      <div className="hd2-card" onClick={(e) => e.stopPropagation()}>
        <button className="hd2-close" onClick={onClose}>✕</button>

        {/* ── 3D 模型 + 基礎資訊 ── */}
        <div className="hd2-top">
          <div className="hd2-model-wrap">
            <HeroModelPreview modelId={modelId} />
          </div>
          <div className="hd2-identity">
            <div className="hd2-name-row">
              <h3 className="hd2-name">{hero.Name || '未知英雄'}</h3>
              <span className="hd2-rarity-badge" style={{ color: rcfg.color, borderColor: rcfg.border }}>{rarity}</span>
            </div>
            <StarDisplay count={stars} />
            <div className="hd2-tags">
              {element && (
                <span className="hd2-tag" style={{ color: ELEMENT_COLOR[element] ?? '#aaa' }}>
                  {ELEMENT_ICON[element] ?? '❓'} {element}
                </span>
              )}
              <span className="hd2-tag">{heroType}</span>
            </div>
            <div className="hd2-level-row">
              <span className="hd2-lv">Lv.{lvl}</span>
              <AscensionPips level={asc} />
            </div>
            {description && <p className="hd2-desc">{description}</p>}
          </div>
        </div>

        {/* ── 屬性 ── */}
        <div className="hd2-section-title">屬性</div>
        <div className="hd2-stats-grid">
          <div className="hd2-stat"><span className="hd2-stat-label">HP</span><span className="hd2-stat-val">{calcStat(hero.HP as number)}</span></div>
          <div className="hd2-stat"><span className="hd2-stat-label">ATK</span><span className="hd2-stat-val">{calcStat(hero.ATK as number)}</span></div>
          <div className="hd2-stat"><span className="hd2-stat-label">DEF</span><span className="hd2-stat-val">{calcStat(heroAny.DEF as number)}</span></div>
          <div className="hd2-stat"><span className="hd2-stat-label">SPD</span><span className="hd2-stat-val">{String(heroAny.Speed ?? heroAny.SPD ?? '?')}</span></div>
          <div className="hd2-stat"><span className="hd2-stat-label">暴擊率</span><span className="hd2-stat-val">{String(heroAny.CritRate ?? '?')}%</span></div>
          <div className="hd2-stat"><span className="hd2-stat-label">暴擊傷害</span><span className="hd2-stat-val">{String(heroAny.CritDmg ?? '?')}%</span></div>
        </div>

        {/* ── 技能 ── */}
        <div className="hd2-section-title">技能</div>
        <div className="hd2-skills">
          {/* 主動技 */}
          {skillSet.activeSkill ? (
            <div className="hd2-skill hd2-skill-active">
              <div className="hd2-skill-icon">{resolveSkillIcon(skillSet.activeSkill.icon, 'active')}</div>
              <div className="hd2-skill-body">
                <div className="hd2-skill-name"><span className="hd2-skill-badge active">主動</span> {skillSet.activeSkill.name}</div>
                <div className="hd2-skill-desc">{skillSet.activeSkill.description || '—'}</div>
              </div>
            </div>
          ) : (
            <div className="hd2-skill hd2-skill-locked">
              <div className="hd2-skill-icon">⚔️</div>
              <div className="hd2-skill-body">
                <div className="hd2-skill-name hd2-skill-na">尚無主動技能</div>
              </div>
            </div>
          )}
          {/* 被動技（最多 4 個） */}
          {[0, 1, 2, 3].map((i) => {
            const passive = skillSet.passives[i]
            const reqStars = getPassiveUnlockStars(i)
            const unlocked = i < passiveSlots
            return (
              <div key={i} className={`hd2-skill ${unlocked ? '' : 'hd2-skill-locked'}`}>
                <div className="hd2-skill-icon">{unlocked && passive ? resolveSkillIcon(passive.icon, 'passive') : '🔒'}</div>
                <div className="hd2-skill-body">
                  {unlocked && passive ? (
                    <>
                      <div className="hd2-skill-name"><span className="hd2-skill-badge passive">被動{i + 1}</span> {passive.name}</div>
                      <div className="hd2-skill-desc">{passive.description || '—'}</div>
                    </>
                  ) : (
                    <div className="hd2-skill-name hd2-skill-na">★{reqStars} 解鎖</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 裝備 ── */}
        <div className="hd2-section-title">裝備</div>
        <div className="hd2-equip-row">
          {EQUIP_SLOTS.map(({ key, label, icon }) => (
            <div key={key} className={`hd2-equip-slot ${equippedItems[key] ? 'equipped' : ''}`}>
              <span className="hd2-equip-icon">{icon}</span>
              <span className="hd2-equip-text">{equippedItems[key] || `${label}：空`}</span>
            </div>
          ))}
        </div>

        {/* ── 操作按鈕 ── */}
        <div className="hd2-actions">
          <button className="hd2-btn hd2-btn-upgrade" disabled title="升級素材系統（開發中）">
            <span className="hd2-btn-icon">📈</span><span>升級</span>
          </button>
          <button className="hd2-btn hd2-btn-ascend" disabled title="突破系統（開發中）">
            <span className="hd2-btn-icon">🔥</span><span>突破</span>
          </button>
          <button className="hd2-btn hd2-btn-star" disabled title="升星系統（開發中）">
            <span className="hd2-btn-icon">⭐</span><span>升星</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────
   Hero Card
   ──────────────────────────── */

interface HeroCardProps {
  hero: RawHeroData
  instance?: HeroInstance
  onClick: () => void
}

function HeroCard({ hero, instance, onClick }: HeroCardProps) {
  const lvl = instance?.level ?? 1
  const asc = instance?.ascension ?? 0
  const isOwned = !!instance
  const rarity = numToRarity((hero as Record<string, unknown>).Rarity)
  const rcfg = RARITY_CONFIG[rarity]
  const stars = initialStars((hero as Record<string, unknown>).Rarity)

  return (
    <button
      className={`hero-card ${isOwned ? 'hero-card-owned' : 'hero-card-locked'}`}
      style={{ borderColor: rcfg.border, background: rcfg.bg }}
      onClick={onClick}
    >
      <span className="hero-card-rarity-badge" style={{ color: rcfg.color }}>{rarity}</span>
      <div className="hero-card-portrait">
        <Thumbnail3D modelId={resolveModelId(hero)} />
      </div>
      <div className="hero-card-info">
        <span className="hero-card-name">{hero.Name || '???'}</span>
        {isOwned && (
          <>
            <span className="hero-card-level">Lv.{lvl}</span>
            <StarDisplay count={stars} />
            {asc > 0 && <AscensionPips level={asc} />}
          </>
        )}
        {!isOwned && <span className="hero-card-locked-text">未獲得</span>}
      </div>
    </button>
  )
}

/* ────────────────────────────
   Main Panel
   ──────────────────────────── */

export function HeroListPanel({ heroesList, heroInstances, onBack, skills, heroSkills }: HeroListPanelProps) {
  const [selectedHero, setSelectedHero] = useState<RawHeroData | null>(null)
  const [filter, setFilter] = useState<'all' | 'owned'>('all')

  const instanceMap = useMemo(() => {
    const map = new Map<number, HeroInstance>()
    for (const inst of heroInstances) {
      map.set(inst.heroId, inst)
    }
    return map
  }, [heroInstances])

  const filteredHeroes = useMemo(() => {
    let list = [...heroesList]
    if (filter === 'owned') {
      list = list.filter((h) => {
        const hid = Number(h.HeroID ?? h.id ?? 0)
        return instanceMap.has(hid)
      })
    }
    // 按稀有度降序排列
    list.sort((a, b) => raritySortWeight(a) - raritySortWeight(b))
    return list
  }, [heroesList, filter, instanceMap])

  /** 依稀有度分組 */
  const groupedHeroes = useMemo(() => {
    const groups: { label: RarityLabel; heroes: RawHeroData[] }[] = []
    const order: RarityLabel[] = ['SSR', 'SR', 'R', 'N']
    for (const r of order) {
      const heroes = filteredHeroes.filter(h => numToRarity((h as Record<string, unknown>).Rarity) === r)
      if (heroes.length > 0) groups.push({ label: r, heroes })
    }
    return groups
  }, [filteredHeroes])

  const getInstanceFor = (hero: RawHeroData): HeroInstance | undefined => {
    const hid = Number(hero.HeroID ?? hero.id ?? 0)
    return instanceMap.get(hid)
  }

  return (
    <div className="panel-overlay">
      <div className="panel-container">
        {/* Header */}
        <div className="panel-header">
          <button className="panel-back-btn" onClick={onBack}>← 返回</button>
          <h2 className="panel-title">🧟 英雄列表</h2>
          <div className="panel-filter">
            <button
              className={`filter-btn ${filter === 'all' ? 'filter-active' : ''}`}
              onClick={() => setFilter('all')}
            >全部 ({heroesList.length})</button>
            <button
              className={`filter-btn ${filter === 'owned' ? 'filter-active' : ''}`}
              onClick={() => setFilter('owned')}
            >已獲得 ({new Set(heroInstances.map(h => h.heroId)).size})</button>
          </div>
        </div>

        {/* Grid — 依稀有度分組 */}
        <div className="hero-grid-grouped">
          {groupedHeroes.map(group => (
            <div key={group.label} className="hero-rarity-section">
              <div className="hero-rarity-header" style={{ color: RARITY_CONFIG[group.label].color }}>
                <span className="hero-rarity-header-label">{group.label}</span>
                <span className="hero-rarity-header-line" style={{ background: RARITY_CONFIG[group.label].color }} />
                <span className="hero-rarity-header-count">{group.heroes.length}</span>
              </div>
              <div className="hero-grid">
                {group.heroes.map((hero, i) => (
                  <HeroCard
                    key={`${hero.HeroID ?? hero.id ?? i}`}
                    hero={hero}
                    instance={getInstanceFor(hero)}
                    onClick={() => setSelectedHero(hero)}
                  />
                ))}
              </div>
            </div>
          ))}
          {filteredHeroes.length === 0 && (
            <div className="hero-grid-empty">尚無英雄</div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedHero && (
        <HeroDetail
          hero={selectedHero}
          instance={getInstanceFor(selectedHero)}
          onClose={() => setSelectedHero(null)}
          skills={skills}
          heroSkills={heroSkills}
        />
      )}
    </div>
  )
}
