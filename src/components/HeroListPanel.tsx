/**
 * HeroListPanel — 英雄列表面板
 *
 * 顯示玩家擁有的英雄，含等級/突破/星級/裝備資訊。
 * 點擊英雄可查看詳細數值（3D 待機模型 + 屬性 + 技能 + 裝備）。
 * 養成操作：升級/突破/升星（v2 — 完整功能版）。
 */

import { useState, useMemo, useRef, useEffect, useCallback, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useAnimations, OrbitControls } from '@react-three/drei'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import * as THREE from 'three'
import type { RawHeroData } from '../types'
import type { HeroInstance } from '../services/saveService'
import { updateHeroLocally, getSaveState, updateProgress, applyCurrenciesFromServer } from '../services/saveService'
import type { SkillTemplate, HeroSkillConfig } from '../domain/types'
import { getHeroSkillSet } from '../services/dataService'
import {
  getStarPassiveSlots, getAscensionMultiplier, getStarMultiplier,
  getStatAtLevel, getLevelCap, consumeExpMaterials, expToNextLevel,
  canAscend, canStarUp, getAscensionCost, getStarUpCost,
  getInitialStars, enhancedMainStat, getEnhanceCost, getMaxEnhanceLevel,
  getActiveSetBonuses, getFinalStats,
} from '../domain/progressionSystem'
import type { EquipmentInstance } from '../domain/progressionSystem'
import {
  upgradeHero as apiUpgradeHero,
  ascendHero as apiAscendHero,
  starUpHero as apiStarUpHero,
} from '../services/progressionService'
import {
  getItemQuantity, onInventoryChange,
  getHeroEquipment, getUnequippedEquipment,
  equipItem, unequipItem,
  removeItemsLocally, enhanceEquipment,
} from '../services/inventoryService'
import { getEquipDisplayName, SET_NAMES } from '../domain/equipmentGacha'
import { getGlbForSuspense } from '../loaders/glbLoader'
// 3D idle animation is the hero detail showcase; Thumbnail3D kept for grid cards only
import { Thumbnail3D } from './UIOverlay'

/* ────────────────────────────
   Rarity Config（共用常數）
   ──────────────────────────── */

import { RARITY_CONFIG } from '../constants/rarity'
import { statZh } from '../constants/statNames'
type RarityLabel = 'SSR' | 'SR' | 'R' | 'N'

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

/** 初始星數（使用 domain 函式） */
function initialStars(rarity: number | string | unknown): number {
  return getInitialStars(Number(rarity))
}

/* ────────────────────────────
   Exp Materials
   ──────────────────────────── */

import { getItemIcon, getItemName } from '../constants/rarity'
import { CurrencyIcon, ItemIcon } from './CurrencyIcon'

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
  const heroAny = hero as Record<string, unknown>
  const rarityNum = Number(heroAny.Rarity ?? 3)
  const ascMult = getAscensionMultiplier(asc, rarityNum)
  const minStars = initialStars((hero as Record<string, unknown>).Rarity)
  const stars = Math.max(instance?.stars ?? minStars, minStars)
  const starMult = getStarMultiplier(stars, rarityNum)
  const calcStatBase = (base: number | undefined) =>
    base != null ? Math.floor(getStatAtLevel(Number(base), lvl, rarityNum) * ascMult * starMult) : '?'

  const rarity = numToRarity(heroAny.Rarity)
  const rcfg = RARITY_CONFIG[rarity]
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

  // 裝備 (4 格位 — 與 domain EquipmentSlot 一致)
  const EQUIP_SLOTS = [
    { key: 'weapon', label: '武器', icon: '⚔️' },
    { key: 'armor', label: '護甲', icon: '🛡️' },
    { key: 'ring', label: '戒指', icon: '💍' },
    { key: 'boots', label: '鞋子', icon: '👢' },
  ]

  // ── 養成 Modal 狀態 ──
  const [modalMode, setModalMode] = useState<'none' | 'upgrade' | 'ascend' | 'starUp' | 'equip' | 'enhance'>('none')
  const [isProcessing, setIsProcessing] = useState(false)
  const [resultMsg, setResultMsg] = useState('')
  const [equipSelectSlot, setEquipSelectSlot] = useState<string>('')
  // 背包訂閱（用於讀取素材數量）
  const [, setInvTick] = useState(0)
  useEffect(() => {
    const unsub = onInventoryChange(() => setInvTick(t => t + 1))
    return unsub
  }, [])

  const levelCap = getLevelCap(asc)
  const isOwned = !!instance
  const isMaxLevel = lvl >= levelCap

  // ── 升級 helpers（使用 EXP 資源） ──
  const availableExp = getSaveState()?.save.exp ?? 0

  /** 計算升 N 級所需經驗（從目前等級 & 殘餘經驗出發） */
  const expNeededForLevels = useCallback((n: number) => {
    let needed = 0
    let lv = lvl
    const curExp = instance?.exp ?? 0
    for (let i = 0; i < n && lv < levelCap; i++) {
      needed += expToNextLevel(lv) - (i === 0 ? curExp : 0)
      lv++
    }
    return needed
  }, [lvl, instance?.exp, levelCap])

  // 升 1 級 / 升 N 級（最多 10 級，但不超過等級上限）
  const levelsToMax10 = Math.min(10, levelCap - lvl)
  const cost1 = expNeededForLevels(1)
  const costN = levelsToMax10 > 1 ? expNeededForLevels(levelsToMax10) : cost1
  const can1 = availableExp >= cost1 && lvl < levelCap
  const canN = availableExp >= costN && levelsToMax10 > 1

  const handleOpenUpgrade = useCallback(() => {
    setResultMsg('')
    setModalMode('upgrade')
  }, [])

  const handleUpgradeByLevels = useCallback(async (n: number) => {
    if (!instance || isProcessing) return
    const cost = expNeededForLevels(n)
    if (cost <= 0 || availableExp < cost) return
    setIsProcessing(true)
    try {
      const useAmount = Math.min(cost, availableExp)
      // 先呼叫後端
      const res = await apiUpgradeHero(instance.instanceId, useAmount)
      if (res.success) {
        updateHeroLocally(heroId, { level: res.newLevel, exp: res.newExp })
        if (res.currencies) applyCurrenciesFromServer(res.currencies)
        setResultMsg(`升級成功！Lv.${lvl} → Lv.${res.newLevel}`)
      } else {
        setResultMsg('升級失敗')
      }
      // 升級後不關閉 Modal，讓玩家可以繼續升級
    } catch (e) {
      setResultMsg('升級失敗：' + String(e))
    } finally {
      setIsProcessing(false)
    }
  }, [instance, isProcessing, availableExp, lvl, levelCap, heroId, expNeededForLevels])

  // ── 突破 helpers ──
  const ascCost = getAscensionCost(asc)
  const canDoAscend = isOwned && canAscend(lvl, asc)
  const fragmentId = `asc_fragment_${heroId}`
  const ownedFragments = getItemQuantity(fragmentId)
  const heroClassType = String(heroAny.Type ?? '').toLowerCase()
  const classStoneId = heroClassType === '力量' ? 'asc_class_power'
    : heroClassType === '敏捷' ? 'asc_class_agility'
    : heroClassType === '防禦' ? 'asc_class_defense'
    : 'asc_class_universal'
  const ownedClassStones = getItemQuantity(classStoneId) + getItemQuantity('asc_class_universal')
  const currentGold = getSaveState()?.save.gold ?? 0
  const hasAscMaterials = ascCost
    ? ownedFragments >= ascCost.fragments
      && ownedClassStones >= ascCost.classStones
      && currentGold >= ascCost.gold
    : false

  const handleConfirmAscend = useCallback(async () => {
    if (!instance || !canDoAscend || !hasAscMaterials || isProcessing) return
    setIsProcessing(true)
    try {
      const res = await apiAscendHero(instance.instanceId)
      if (res.success) {
        updateHeroLocally(heroId, { ascension: res.newAscension })
        if (res.currencies) applyCurrenciesFromServer(res.currencies)
        // 扣除突破素材（伺服器已扣，本地同步）
        if (ascCost) {
          const matDeductions: { itemId: string; quantity: number }[] = []
          if (ascCost.fragments > 0) matDeductions.push({ itemId: fragmentId, quantity: ascCost.fragments })
          if (ascCost.classStones > 0) matDeductions.push({ itemId: classStoneId, quantity: ascCost.classStones })
          if (matDeductions.length > 0) removeItemsLocally(matDeductions)
        }
        setResultMsg(`突破成功！突破 ${asc} → ${res.newAscension}，等級上限 ${getLevelCap(res.newAscension)}`)
      } else {
        setResultMsg('突破失敗')
      }
      setTimeout(() => setModalMode('none'), 1200)
    } catch (e) {
      setResultMsg('突破失敗：' + String(e))
    } finally {
      setIsProcessing(false)
    }
  }, [instance, canDoAscend, hasAscMaterials, isProcessing, asc, heroId, ascCost, currentGold])

  // ── 升星 helpers ──
  const starCost = stars < 6 ? getStarUpCost(stars) : Infinity
  const canDoStarUp = isOwned && canStarUp(stars, ownedFragments)

  const handleConfirmStarUp = useCallback(async () => {
    if (!instance || !canDoStarUp || isProcessing) return
    setIsProcessing(true)
    try {
      const newStars = stars + 1
      updateHeroLocally(heroId, { stars: newStars })
      // 樂觀扣除升星碎片
      if (starCost > 0 && starCost !== Infinity) {
        removeItemsLocally([{ itemId: fragmentId, quantity: starCost }])
      }
      apiStarUpHero(instance.instanceId).catch(console.warn)
      setResultMsg(`升星成功！★${stars} → ★${newStars}`)
      setTimeout(() => setModalMode('none'), 1200)
    } catch (e) {
      setResultMsg('升星失敗：' + String(e))
    } finally {
      setIsProcessing(false)
    }
  }, [instance, canDoStarUp, isProcessing, stars, heroId])

  // ── 裝備 helpers ──
  const heroEquipment = isOwned ? getHeroEquipment(instance!.instanceId) : []
  const equippedBySlot = useMemo(() => {
    const map: Record<string, EquipmentInstance | undefined> = {}
    for (const eq of heroEquipment) map[eq.slot] = eq
    return map
  }, [heroEquipment])

  const availableForSlot = useMemo(() => {
    if (!equipSelectSlot) return []
    return getUnequippedEquipment().filter(eq => eq.slot === equipSelectSlot)
  }, [equipSelectSlot])

  const handleSlotClick = useCallback((slotKey: string) => {
    if (!isOwned) return
    const equipped = equippedBySlot[slotKey]
    if (equipped) {
      // 已裝備 → 卸下
      unequipItem(equipped.equipId).catch(console.warn)
      setResultMsg(`已卸下 ${getEquipDisplayName(equipped)}`)
    } else {
      // 空欄位 → 打開裝備選擇
      setEquipSelectSlot(slotKey)
      setResultMsg('')
      setModalMode('equip')
    }
  }, [isOwned, equippedBySlot])

  const handleEquipSelect = useCallback(async (eq: EquipmentInstance) => {
    if (!instance) return
    await equipItem(eq.equipId, instance.instanceId)
    setResultMsg(`已裝備 ${getEquipDisplayName(eq)}`)
    setModalMode('none')
  }, [instance])

  // ── 強化裝備 ──
  const [enhanceTarget, setEnhanceTarget] = useState<EquipmentInstance | null>(null)

  const handleOpenEnhance = useCallback((eq: EquipmentInstance) => {
    setEnhanceTarget(eq)
    setResultMsg('')
    setModalMode('enhance')
  }, [])

  const handleConfirmEnhance = useCallback(async () => {
    if (!enhanceTarget || isProcessing) return
    setIsProcessing(true)
    try {
      const res = await enhanceEquipment(enhanceTarget.equipId)
      if (res.success) {
        setResultMsg(`強化成功！+${res.newLevel}`)
        // 更新本地 target 以便 modal 顯示新數值
        setEnhanceTarget(prev => prev ? { ...prev, enhanceLevel: res.newLevel ?? prev.enhanceLevel + 1 } : null)
      } else {
        setResultMsg(`強化失敗：${res.error === 'insufficient_gold' ? '金幣不足' : res.error === 'max_enhance_level' ? '已達最高等級' : res.error}`)
      }
    } catch (e) {
      setResultMsg('強化失敗：' + String(e))
    } finally {
      setIsProcessing(false)
    }
  }, [enhanceTarget, isProcessing])

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

        {/* ── 屬性（含裝備+套裝效果） ── */}
        <div className="hd2-section-title">屬性</div>
        {(() => {
          const baseHP = Number(hero.HP ?? 0)
          const baseATK = Number(hero.ATK ?? 0)
          const baseDEF = Number(heroAny.DEF ?? 0)
          const baseSPD = Number(heroAny.Speed ?? heroAny.SPD ?? 0)
          const baseCR = Number(heroAny.CritRate ?? 0)
          const baseCD = Number(heroAny.CritDmg ?? 0)
          const baseOnly = {
            HP: calcStatBase(baseHP) as number,
            ATK: calcStatBase(baseATK) as number,
            DEF: calcStatBase(baseDEF) as number,
            SPD: baseSPD,
            CritRate: baseCR,
            CritDmg: baseCD,
          }
          // 如果有裝備，計算完整最終數值
          const hasEquip = heroEquipment.length > 0
          const finalStats = hasEquip ? getFinalStats(
            { HP: baseHP, ATK: baseATK, DEF: baseDEF, SPD: baseSPD, CritRate: baseCR, CritDmg: baseCD },
            { heroId, level: lvl, exp: instance?.exp ?? 0, ascension: asc, stars, equipment: heroEquipment },
            rarityNum,
          ) : null
          const statRows: { label: string; key: keyof typeof baseOnly; suffix?: string }[] = [
            { label: '生命', key: 'HP' },
            { label: '攻擊', key: 'ATK' },
            { label: '防禦', key: 'DEF' },
            { label: '速度', key: 'SPD' },
            { label: '暴擊率', key: 'CritRate', suffix: '%' },
            { label: '暴擊傷害', key: 'CritDmg', suffix: '%' },
          ]
          return (
            <div className="hd2-stats-grid">
              {statRows.map(({ label, key, suffix }) => {
                const base = baseOnly[key]
                const final = finalStats ? finalStats[key] : base
                const bonus = final - base
                return (
                  <div key={key} className="hd2-stat">
                    <span className="hd2-stat-label">{label}</span>
                    <span className="hd2-stat-val">
                      {final}{suffix ?? ''}
                      {bonus > 0 && <span style={{ color: '#4ade80', fontSize: '0.8em', marginLeft: 4 }}>(+{bonus}{suffix ?? ''})</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })()}

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
                <div className="hd2-skill-icon">{passive ? resolveSkillIcon(passive.icon, 'passive') : '🔒'}</div>
                <div className="hd2-skill-body">
                  {passive ? (
                    <>
                      <div className="hd2-skill-name">
                        <span className={`hd2-skill-badge ${unlocked ? 'passive' : 'locked'}`}>
                          {unlocked ? `被動${i + 1}` : `🔒 ★${reqStars} 解鎖`}
                        </span>
                        {passive.name}
                      </div>
                      <div className="hd2-skill-desc">{passive.description || '—'}</div>
                    </>
                  ) : (
                    <div className="hd2-skill-name hd2-skill-na">🔒 ★{reqStars} 解鎖</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 裝備 ── */}
        <div className="hd2-section-title">裝備 {isOwned && <span className="hd2-section-hint">（點擊欄位穿脫）</span>}</div>
        <div className="hd2-equip-row">
          {EQUIP_SLOTS.map(({ key, label, icon }) => {
            const eq = equippedBySlot[key]
            return (
              <div
                key={key}
                className={`hd2-equip-slot ${eq ? 'equipped' : ''} ${isOwned ? 'clickable' : ''}`}
                onClick={() => handleSlotClick(key)}
                title={eq ? `${getEquipDisplayName(eq)} +${eq.enhanceLevel}\n點擊卸下` : `${label}：空\n點擊裝備`}
              >
                <span className="hd2-equip-icon">{icon}</span>
                {eq ? (
                  <>
                    <div className="hd2-equip-detail">
                      <div className="hd2-equip-header">
                        <span className={`hd2-equip-rarity-tag rarity-${(eq.rarity || 'N').toLowerCase()}`}>{eq.rarity || 'N'}</span>
                        <span className="hd2-equip-name">{getEquipDisplayName(eq)}</span>
                        {(eq.enhanceLevel ?? 0) > 0 && <span className="hd2-equip-lv">+{eq.enhanceLevel}</span>}
                      </div>
                      <span className="hd2-equip-main-stat">
                        {statZh(eq.mainStat ?? '?')} +{enhancedMainStat(eq.mainStatValue ?? 0, eq.enhanceLevel ?? 0, eq.rarity ?? 'SR')}
                      </span>
                      {(eq.subStats ?? []).length > 0 && (
                        <div className="hd2-equip-sub-list">
                          {(eq.subStats ?? []).map((sub, si) => (
                            <span key={si} className="hd2-equip-sub-item">
                              {statZh(sub.stat)} +{sub.value}{sub.isPercent ? '%' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {isOwned && (eq.enhanceLevel ?? 0) < getMaxEnhanceLevel(eq.rarity || 'N') && (
                      <button
                        className="hd2-equip-enhance-btn"
                        onClick={(e) => { e.stopPropagation(); handleOpenEnhance(eq) }}
                        title="強化裝備"
                      >⚒️</button>
                    )}
                  </>
                ) : (
                  <span className="hd2-equip-text">{label}：空</span>
                )}
              </div>
            )
          })}
        </div>

        {/* ── 套裝效果 ── */}
        {(() => {
          const activeBonuses = getActiveSetBonuses(heroEquipment)
          if (activeBonuses.length === 0) return null
          const BONUS_ZH: Record<string, string> = {
            ATK_percent: '攻擊%', DEF_percent: '防禦%', HP_percent: '生命%',
            SPD_flat: '速度', CritRate_percent: '暴擊率%', CritDmg_percent: '暴擊傷害%',
            lifesteal: '吸血', counter: '反擊率',
          }
          // 依套裝分組顯示
          const setGroups = new Map<string, typeof activeBonuses>()
          for (const b of activeBonuses) {
            const arr = setGroups.get(b.setId) || []
            arr.push(b)
            setGroups.set(b.setId, arr)
          }
          return (
            <div className="hd2-set-bonuses">
              <div className="hd2-section-title">套裝效果</div>
              {Array.from(setGroups.entries()).map(([setId, bonuses]) => (
                <div key={setId} className="hd2-set-group">
                  <span className="hd2-set-name">{SET_NAMES[setId] || setId}</span>
                  {bonuses.map((b, i) => (
                    <span key={i} className="hd2-set-bonus-tag">
                      {b.requiredCount}件：{BONUS_ZH[b.bonusType] || b.bonusType} +{b.bonusValue}{b.bonusType.includes('flat') ? '' : '%'}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── 操作按鈕 ── */}
        <div className="hd2-actions">
          <button
            className="hd2-btn hd2-btn-upgrade"
            disabled={!isOwned || isMaxLevel}
            title={!isOwned ? '尚未擁有' : isMaxLevel ? '已達等級上限' : '消耗經驗素材提升等級'}
            onClick={handleOpenUpgrade}
          >
            <span className="hd2-btn-icon">📈</span><span>升級</span>
          </button>
          <button
            className="hd2-btn hd2-btn-ascend"
            disabled={!canDoAscend}
            title={!isOwned ? '尚未擁有' : asc >= 5 ? '已達最高突破' : !canAscend(lvl, asc) ? `需達到 Lv.${levelCap}` : '突破提升等級上限'}
            onClick={() => { setResultMsg(''); setModalMode('ascend') }}
          >
            <span className="hd2-btn-icon">🔥</span><span>突破</span>
          </button>
          <button
            className="hd2-btn hd2-btn-star"
            disabled={!isOwned || stars >= 6}
            title={!isOwned ? '尚未擁有' : stars >= 6 ? '已達最高星級' : '消耗碎片提升星級'}
            onClick={() => { setResultMsg(''); setModalMode('starUp') }}
          >
            <span className="hd2-btn-icon">⭐</span><span>升星</span>
          </button>
        </div>

        {/* ═══════ 升級 Modal ═══════ */}
        {modalMode === 'upgrade' && (
          <div className="hd2-modal-backdrop" onClick={() => setModalMode('none')}>
            <div className="hd2-modal hd2-modal-upgrade" onClick={e => e.stopPropagation()}>
              <h4 className="hd2-modal-title">📈 英雄升級</h4>
              <div className="hd2-modal-info">
                <strong>Lv.{lvl}</strong> / 等級上限 Lv.{levelCap}
              </div>

              {/* 當前數值預覽 */}
              <div className="hd2-upgrade-stats">
                {[
                  { label: '生命', base: Number(hero.HP ?? 0) },
                  { label: '攻擊', base: Number(hero.ATK ?? 0) },
                  { label: '防禦', base: Number(heroAny.DEF ?? 0) },
                ].map(({ label, base }) => {
                  const current = Math.floor(getStatAtLevel(base, lvl, rarityNum) * ascMult * starMult)
                  const next = lvl < levelCap ? Math.floor(getStatAtLevel(base, lvl + 1, rarityNum) * ascMult * starMult) : current
                  return (
                    <div key={label} className="hd2-upgrade-stat-row">
                      <span className="hd2-upgrade-stat-label">{label}</span>
                      <span className="hd2-upgrade-stat-val">{current}</span>
                      {lvl < levelCap && <span className="hd2-upgrade-stat-arrow">→</span>}
                      {lvl < levelCap && <span className="hd2-upgrade-stat-next">{next}</span>}
                    </div>
                  )
                })}
              </div>

              <div className="hd2-material-list">
                <div className="hd2-material-row">
                  <span className="hd2-mat-icon"><CurrencyIcon type="exp" /></span>
                  <span className="hd2-mat-name">經驗資源</span>
                  <span className="hd2-mat-exp">可用：{availableExp.toLocaleString()}</span>
                </div>
              </div>

              {resultMsg && <div className="hd2-result-msg">{resultMsg}</div>}

              {/* 左右對稱按鈕 */}
              <div className="hd2-upgrade-btn-row">
                <button
                  className="hd2-modal-confirm hd2-upgrade-left"
                  disabled={!can1 || isProcessing}
                  onClick={() => handleUpgradeByLevels(1)}
                >
                  {isProcessing ? '...' : <>升 1 級<br /><span className="hd2-cost-hint">{cost1.toLocaleString()} <CurrencyIcon type="exp" /></span></>}
                </button>
                <button
                  className="hd2-modal-confirm hd2-upgrade-right"
                  disabled={(!canN && levelsToMax10 > 1) || isProcessing || levelsToMax10 <= 1}
                  onClick={() => handleUpgradeByLevels(levelsToMax10)}
                >
                  {isProcessing ? '...' : levelsToMax10 > 1
                    ? <>升 {levelsToMax10} 級<br /><span className="hd2-cost-hint">{costN.toLocaleString()} <CurrencyIcon type="exp" /></span></>
                    : '已達上限'}
                </button>
              </div>

              <div className="hd2-modal-btns">
                <button className="hd2-modal-cancel" onClick={() => setModalMode('none')}>關閉</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ 突破 Modal ═══════ */}
        {modalMode === 'ascend' && ascCost && (
          <div className="hd2-modal-backdrop" onClick={() => setModalMode('none')}>
            <div className="hd2-modal" onClick={e => e.stopPropagation()}>
              <h4 className="hd2-modal-title">🔥 英雄突破</h4>
              <div className="hd2-modal-info">
                突破 {asc} → {asc + 1}（等級上限 {levelCap} → {getLevelCap(asc + 1)}）
              </div>
              <div className="hd2-material-list">
                <div className="hd2-material-row">
                  <span className="hd2-mat-icon">{getItemIcon('asc_fragment_0')}</span>
                  <span className="hd2-mat-name">英雄碎片</span>
                  <span className={`hd2-mat-qty ${ownedFragments >= ascCost.fragments ? 'sufficient' : 'insufficient'}`}>
                    {ownedFragments}/{ascCost.fragments}
                  </span>
                </div>
                <div className="hd2-material-row">
                  <span className="hd2-mat-icon">{getItemIcon('asc_class_power')}</span>
                  <span className="hd2-mat-name">職業石</span>
                  <span className={`hd2-mat-qty ${ownedClassStones >= ascCost.classStones ? 'sufficient' : 'insufficient'}`}>
                    {ownedClassStones}/{ascCost.classStones}
                  </span>
                </div>
                <div className="hd2-material-row">
                  <span className="hd2-mat-icon"><CurrencyIcon type="gold" /></span>
                  <span className="hd2-mat-name">金幣</span>
                  <span className={`hd2-mat-qty ${currentGold >= ascCost.gold ? 'sufficient' : 'insufficient'}`}>
                    {currentGold.toLocaleString()}/{ascCost.gold.toLocaleString()}
                  </span>
                </div>
              </div>
              {resultMsg && <div className="hd2-result-msg">{resultMsg}</div>}
              <div className="hd2-modal-btns">
                <button className="hd2-modal-cancel" onClick={() => setModalMode('none')}>取消</button>
                <button
                  className="hd2-modal-confirm"
                  disabled={!hasAscMaterials || isProcessing}
                  onClick={handleConfirmAscend}
                >{isProcessing ? '處理中...' : '確認突破'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ 升星 Modal ═══════ */}
        {modalMode === 'starUp' && (
          <div className="hd2-modal-backdrop" onClick={() => setModalMode('none')}>
            <div className="hd2-modal" onClick={e => e.stopPropagation()}>
              <h4 className="hd2-modal-title">⭐ 英雄升星</h4>
              <div className="hd2-modal-info">
                <StarDisplay count={stars} /> → <StarDisplay count={Math.min(6, stars + 1)} />
              </div>
              <div className="hd2-material-list">
                <div className="hd2-material-row">
                  <span className="hd2-mat-icon">{getItemIcon('asc_fragment_0')}</span>
                  <span className="hd2-mat-name">英雄碎片</span>
                  <span className={`hd2-mat-qty ${ownedFragments >= starCost ? 'sufficient' : 'insufficient'}`}>
                    {ownedFragments}/{starCost}
                  </span>
                </div>
              </div>
              <div className="hd2-star-bonus">
                升星加成：屬性 ×{getStarMultiplier(stars + 1).toFixed(2)} · 被動欄位 {getStarPassiveSlots(stars + 1)} 個
              </div>
              {resultMsg && <div className="hd2-result-msg">{resultMsg}</div>}
              <div className="hd2-modal-btns">
                <button className="hd2-modal-cancel" onClick={() => setModalMode('none')}>取消</button>
                <button
                  className="hd2-modal-confirm"
                  disabled={!canDoStarUp || isProcessing}
                  onClick={handleConfirmStarUp}
                >{isProcessing ? '處理中...' : '確認升星'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ 裝備選擇 Modal ═══════ */}
        {modalMode === 'equip' && (
          <div className="hd2-modal-backdrop" onClick={() => setModalMode('none')}>
            <div className="hd2-modal" onClick={e => e.stopPropagation()}>
              <h4 className="hd2-modal-title">
                {EQUIP_SLOTS.find(s => s.key === equipSelectSlot)?.icon}{' '}
                選擇{EQUIP_SLOTS.find(s => s.key === equipSelectSlot)?.label ?? '裝備'}
              </h4>
              {availableForSlot.length === 0 ? (
                <div className="hd2-modal-info">沒有可用的裝備</div>
              ) : (
                <div className="hd2-equip-list">
                  {availableForSlot.map(eq => (
                    <button
                      key={eq.equipId}
                      className="hd2-equip-option"
                      onClick={() => handleEquipSelect(eq)}
                    >
                      <div className="hd2-equip-option-header">
                        <span className={`hd2-equip-rarity rarity-${(eq.rarity || 'N').toLowerCase()}`}>{eq.rarity || 'N'}</span>
                        <span className="hd2-equip-option-name">{getEquipDisplayName(eq)}</span>
                        {(eq.enhanceLevel ?? 0) > 0 && <span className="hd2-equip-lv">+{eq.enhanceLevel}</span>}
                      </div>
                      <div className="hd2-equip-option-stats">
                        <span>{statZh(eq.mainStat ?? '?')} +{enhancedMainStat(eq.mainStatValue ?? 0, eq.enhanceLevel ?? 0, eq.rarity ?? 'N')}</span>
                        {(Array.isArray(eq.subStats) ? eq.subStats : []).map((sub, i) => (
                          <span key={i} className="hd2-sub-stat">
                            {statZh(sub.stat)} +{sub.value}{sub.isPercent ? '%' : ''}
                          </span>
                        ))}
                      </div>
                      {eq.setId && <span className="hd2-equip-set">{SET_NAMES[eq.setId] || eq.setId}</span>}
                    </button>
                  ))}
                </div>
              )}
              <div className="hd2-modal-btns">
                <button className="hd2-modal-cancel" onClick={() => setModalMode('none')}>取消</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ 強化裝備 Modal ═══════ */}
        {modalMode === 'enhance' && enhanceTarget && (() => {
          const maxLvl = getMaxEnhanceLevel(enhanceTarget.rarity)
          const cost = getEnhanceCost(enhanceTarget.enhanceLevel, enhanceTarget.rarity)
          const isMax = enhanceTarget.enhanceLevel >= maxLvl
          const currentMain = enhancedMainStat(enhanceTarget.mainStatValue, enhanceTarget.enhanceLevel, enhanceTarget.rarity)
          const nextMain = isMax ? currentMain : enhancedMainStat(enhanceTarget.mainStatValue, enhanceTarget.enhanceLevel + 1, enhanceTarget.rarity)
          return (
            <div className="hd2-modal-backdrop" onClick={() => setModalMode('none')}>
              <div className="hd2-modal" onClick={e => e.stopPropagation()}>
                <h4 className="hd2-modal-title">⚒️ 裝備強化</h4>
                <div className="hd2-modal-info">
                  <div><strong>{getEquipDisplayName(enhanceTarget)}</strong> <span className={`hd2-equip-rarity rarity-${(enhanceTarget.rarity || 'N').toLowerCase()}`}>{enhanceTarget.rarity || 'N'}</span></div>
                  <div>+{enhanceTarget.enhanceLevel} / {maxLvl}</div>
                  <div style={{ marginTop: 6 }}>
                    {statZh(enhanceTarget.mainStat)}: {currentMain}
                    {!isMax && <span style={{ color: '#4ade80' }}> → {nextMain}</span>}
                  </div>
                </div>
                {isMax ? (
                  <div className="hd2-modal-info" style={{ color: '#facc15' }}>已達最高強化等級</div>
                ) : (
                  <div className="hd2-modal-info">
                    費用：<span style={{ color: '#fbbf24' }}>{cost.toLocaleString()}</span> 金幣
                    {currentGold < cost && <span style={{ color: '#f87171', marginLeft: 8 }}>（不足）</span>}
                  </div>
                )}
                {resultMsg && <div className="hd2-result">{resultMsg}</div>}
                <div className="hd2-modal-btns">
                  {!isMax && (
                    <button
                      className="hd2-modal-confirm"
                      disabled={isProcessing || currentGold < cost}
                      onClick={handleConfirmEnhance}
                    >
                      {isProcessing ? '強化中…' : '確認強化'}
                    </button>
                  )}
                  <button className="hd2-modal-cancel" onClick={() => setModalMode('none')}>關閉</button>
                </div>
              </div>
            </div>
          )
        })()}
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
  const minStars = initialStars((hero as Record<string, unknown>).Rarity)
  const stars = Math.max(instance?.stars ?? minStars, minStars)

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
