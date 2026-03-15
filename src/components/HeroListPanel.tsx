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
import { PanelInfoTip, PANEL_DESCRIPTIONS } from './PanelInfoTip'
import { updateHeroLocally, getSaveState, applyCurrenciesFromServer } from '../services/saveService'
import type { SkillTemplate, HeroSkillConfig } from '../domain/types'
import { getHeroSkillSet } from '../services/dataService'
import { getEffectTemplatesCache, getSkillEffectsCache, resolveSkillEffects } from '../services/dataService'
import { SkillDescPanel, effectDescription } from './SkillDescPanel'
import {
  getStarPassiveSlots, getAscensionMultiplier, getStarMultiplier,
  getStatAtLevel, getLevelCap, expToNextLevel,
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
import { RedDot } from './RedDot'
// 3D idle animation is the hero detail showcase; Thumbnail3D kept for grid cards only
import { Thumbnail3D } from './UIOverlay'

/* ────────────────────────────
   Rarity Config（共用常數）
   ──────────────────────────── */

import { RARITY_CONFIG, toRarity, toRarityNum, type Rarity } from '../constants/rarity'
import { statZh } from '../constants/statNames'

/** 稀有度排序權值（高稀有度排前） */
function raritySortWeight(h: RawHeroData): number {
  return -toRarityNum((h as Record<string, unknown>).Rarity)
}

/** 初始星數（使用 domain 函式） */
function initialStars(rarity: unknown): number {
  return getInitialStars(toRarityNum(rarity))
}

/* ────────────────────────────
   Exp Materials
   ──────────────────────────── */

// rarity utilities imported above (line 12)
import { CurrencyIcon, ItemIcon } from './CurrencyIcon'
import { ClickableItemIcon } from './ClickableItemIcon'

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
   Skill Tag Labels
   ──────────────────────────── */

const TARGET_LABEL: Record<string, string> = {
  single_enemy: '單體敵人',
  all_enemies: '全體敵人',
  random_enemies_3: '隨機3敵',
  front_row_enemies: '前排敵人',
  back_row_enemies: '後排敵人',
  single_ally: '單體隊友',
  all_allies: '全體隊友',
  self: '自身',
  trigger_source: '觸發來源',
}
const TRIGGER_LABEL: Record<string, string> = {
  battle_start: '戰鬥開始',
  turn_start: '回合開始',
  turn_end: '回合結束',
  on_attack: '攻擊時',
  on_normal_attack: '普攻時',
  on_skill_cast: '施放大招時',
  on_kill: '擊殺時',
  on_be_attacked: '被攻擊時',
  on_take_damage: '受傷時',
  on_lethal: '致命時',
  on_dodge: '閃避時',
  on_crit: '暴擊時',
  on_ally_death: '隊友陣亡',
  on_ally_skill: '隊友施技',
  on_ally_attacked: '隊友被攻擊時',
  hp_below_pct: 'HP低於閾值',
  hp_above_pct: 'HP高於閾值',
  every_n_turns: '每N回合',
  enemy_count_below: '敵人≤N時',
  ally_count_below: '隊友≤N時',
  has_status: '帶有狀態時',
  always: '常駐',
}

/** 依技能的 target / passiveTrigger 產生標籤 JSX，並用效果驅動描述 */
function SkillDescWithTags({ skill, skillLevel }: { skill: SkillTemplate; skillLevel?: number }) {
  const tags: { label: string; cls: string }[] = []
  // trigger tag（被動技才有）
  if (skill.passiveTrigger) {
    const tl = TRIGGER_LABEL[skill.passiveTrigger] || skill.passiveTrigger
    tags.push({ label: tl, cls: 'trigger' })
  }
  // target tag
  if (skill.target && skill.target !== 'self') {
    const tl = TARGET_LABEL[skill.target] || skill.target
    tags.push({ label: tl, cls: 'target' })
  }

  // 效果驅動描述：嘗試從 effect_templates 生成
  let descText = skill.description || '—'
  const effTemplates = getEffectTemplatesCache()
  const effLinks = getSkillEffectsCache()
  if (effTemplates.size > 0 && effLinks.size > 0) {
    const resolved = resolveSkillEffects(skill.skillId, skillLevel ?? 1, effTemplates, effLinks)
    if (resolved.length > 0) {
      descText = resolved.map(eff => effectDescription(eff)).join('；')
    }
  }

  return (
    <div className="hd2-skill-desc">
      {tags.length > 0 && (
        <span className="hd2-skill-tags">
          {tags.map((t, i) => (
            <span key={i} className={`hd2-skill-tag ${t.cls}`}>{t.label}</span>
          ))}
        </span>
      )}
      {descText}
    </div>
  )
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
        const convertMat = (m: THREE.Material): THREE.MeshBasicMaterial => {
          const src = m as THREE.MeshStandardMaterial
          const basic = new THREE.MeshBasicMaterial({
            color: src.color?.clone() ?? new THREE.Color(0xffffff),
            map: src.map ?? null,
            transparent: src.transparent,
            opacity: src.opacity,
            alphaMap: src.alphaMap ?? null,
            side: src.side,
            wireframe: src.wireframe,
          })
          basic.needsUpdate = true
          return basic
        }
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(convertMat)
        else if (mesh.material) mesh.material = convertMat(mesh.material)
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

/** 載入完成回報元件（掛在 IdlePreviewModel 旁邊） */
function NotifyLoaded({ onLoaded }: { onLoaded: () => void }) {
  useEffect(() => { onLoaded() }, [onLoaded])
  return null
}

/** 英雄 3D 模型預覽（獨立 Canvas） */
function HeroModelPreview({ modelId }: { modelId: string }) {
  const [loaded, setLoaded] = useState(false)
  const onLoaded = useCallback(() => setLoaded(true), [])
  return (
    <div className="hero-model-preview">
      {!loaded && (
        <div className="hero-model-loading">
          <div className="hero-model-loading-spinner" />
          <span>模型載入中…</span>
        </div>
      )}
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 28 }}
        className="hero-model-canvas"
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        onCreated={() => {
          // ★ 使用 R3F 預設 (ACES + sRGB) — 不覆寫，避免 iOS 紋理色彩問題
        }}
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
          <NotifyLoaded onLoaded={onLoaded} />
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
  const maxStars = 10
  return (
    <span className="hero-stars">
      {Array.from({ length: maxStars }, (_, i) => (
        <span key={i} className={i < count ? (i >= 6 ? 'star-gold' : 'star-filled') : 'star-empty'}>★</span>
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
  const rarityNum = toRarityNum(heroAny.Rarity)
  const ascMult = getAscensionMultiplier(asc, rarityNum)
  const minStars = initialStars((hero as Record<string, unknown>).Rarity)
  const stars = Math.max(instance?.stars ?? minStars, minStars)
  const starMult = getStarMultiplier(stars, rarityNum)
  const calcStatBase = (base: number | undefined) =>
    base != null ? Math.floor(getStatAtLevel(Number(base), lvl, rarityNum) * ascMult * starMult) : '?'

  const rarity = toRarity(heroAny.Rarity)
  const rcfg = RARITY_CONFIG[rarity]
  const passiveSlots = getStarPassiveSlots(stars)
  const skillLevel = stars > 6 ? stars - 5 : 1
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
  // 裝備篩選
  const [equipFilterRarity, setEquipFilterRarity] = useState<Rarity | 'all'>('all')
  const [equipFilterSet, setEquipFilterSet] = useState<string>('all')
  const [equipFilterSubStats, setEquipFilterSubStats] = useState<Set<string>>(new Set())
  // 背包訂閱（用於讀取素材數量 + 裝備變更即時刷新）
  const [invTick, setInvTick] = useState(0)
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
  }, [instance, isProcessing, availableExp, lvl, heroId, expNeededForLevels])

  // ── 突破 helpers ──
  const ascCost = getAscensionCost(asc)
  const canDoAscend = isOwned && canAscend(lvl, asc)
  const fragmentId = `asc_fragment_${heroId}`
  const ownedFragments = getItemQuantity(fragmentId)
  const heroClassType = String(heroAny.Type ?? '').toLowerCase()
  const classStoneId = heroClassType === 'power' || heroClassType === '力量' ? 'asc_class_power'
    : heroClassType === 'agility' || heroClassType === '敏捷' ? 'asc_class_agility'
    : heroClassType === 'defense' || heroClassType === '防禦' ? 'asc_class_defense'
    : 'asc_class_universal'
  const ownedClassStones = classStoneId === 'asc_class_universal'
    ? getItemQuantity('asc_class_universal')
    : getItemQuantity(classStoneId) + getItemQuantity('asc_class_universal')
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
        const errMap: Record<string, string> = {
          insufficient_fragments: '碎片不足',
          insufficient_class_stones: '職業石不足',
          insufficient_gold: '金幣不足',
          level_not_at_cap: '等級未達上限',
          max_ascension: '已達最高突破',
          hero_not_found: '找不到英雄',
        }
        const reason = errMap[(res as unknown as Record<string, unknown>).error as string] ?? '伺服器拒絕'
        setResultMsg(`突破失敗：${reason}`)
      }
      setTimeout(() => setModalMode('none'), 1200)
    } catch (e) {
      setResultMsg('突破失敗：' + String(e))
    } finally {
      setIsProcessing(false)
    }
  }, [instance, canDoAscend, hasAscMaterials, isProcessing, asc, heroId, ascCost, fragmentId, classStoneId])

  // ── 升星 helpers ──
  const starCost = stars < 10 ? getStarUpCost(stars) : Infinity
  const canDoStarUp = isOwned && canStarUp(stars, ownedFragments)

  const handleConfirmStarUp = useCallback(async () => {
    if (!instance || !canDoStarUp || isProcessing) return
    setIsProcessing(true)
    try {
      const res = await apiStarUpHero(instance.instanceId)
      if (res.success) {
        updateHeroLocally(heroId, { stars: res.newStars })
        if (res.fragmentsConsumed > 0) {
          removeItemsLocally([{ itemId: fragmentId, quantity: res.fragmentsConsumed }])
        }
        setResultMsg(`升星成功！★${stars} → ★${res.newStars}`)
        // 滿星自動關閉升星 modal
        if (res.newStars >= 10) {
          setTimeout(() => setModalMode('none'), 1200)
        }
      } else {
        const errMap: Record<string, string> = {
          insufficient_fragments: '碎片不足',
          max_stars: '已達最高星級',
          hero_not_found: '找不到英雄',
        }
        const reason = errMap[(res as unknown as Record<string, unknown>).error as string] ?? '伺服器拒絕'
        setResultMsg(`升星失敗：${reason}`)
      }
      setTimeout(() => setResultMsg(''), 1200)
    } catch (e) {
      setResultMsg('升星失敗：' + String(e))
    } finally {
      setIsProcessing(false)
    }
  }, [instance, canDoStarUp, isProcessing, stars, heroId, fragmentId])

  // ── 裝備 helpers ──
  const heroEquipment = useMemo(
    () => isOwned ? getHeroEquipment(instance!.instanceId) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOwned, instance?.instanceId, invTick],
  )
  const equippedBySlot = useMemo(() => {
    const map: Record<string, EquipmentInstance | undefined> = {}
    for (const eq of heroEquipment) map[eq.slot] = eq
    return map
  }, [heroEquipment])

  // 不使用 useMemo — 裝備/卸下會改變 inventoryState，需要每次 render 重新取得
  const availableForSlotRaw = equipSelectSlot
    ? getUnequippedEquipment().filter(eq => eq.slot === equipSelectSlot)
    : []
  const availableForSlot = availableForSlotRaw.filter(eq => {
    if (equipFilterRarity !== 'all' && eq.rarity !== equipFilterRarity) return false
    if (equipFilterSet !== 'all' && eq.setId !== equipFilterSet) return false
    if (equipFilterSubStats.size > 0) {
      const hasSubs = [...equipFilterSubStats].every(stat =>
        (eq.subStats ?? []).some(sub => sub.stat === stat))
      if (!hasSubs) return false
    }
    return true
  })
  // 收集可用的套裝列表（用於篩選下拉）
  const availableSets = useMemo(() => {
    const sets = new Set<string>()
    for (const eq of availableForSlotRaw) if (eq.setId) sets.add(eq.setId)
    return [...sets].sort()
  }, [availableForSlotRaw])

  const handleSlotClick = useCallback((slotKey: string) => {
    if (!isOwned) return
    // 無論有無裝備，都打開部位編輯介面
    setEquipSelectSlot(slotKey)
    setEquipFilterRarity('all')
    setEquipFilterSet('all')
    setEquipFilterSubStats(new Set())
    setResultMsg('')
    setModalMode('equip')
  }, [isOwned])

  const handleEquipSelect = useCallback(async (eq: EquipmentInstance) => {
    if (!instance) return
    setModalMode('none')
    await equipItem(eq.equipId, instance.instanceId)
    setResultMsg(`已裝備 ${getEquipDisplayName(eq)}`)
  }, [instance])

  const handleUnequipFromModal = useCallback(async (eq: EquipmentInstance) => {
    await unequipItem(eq.equipId).catch(console.warn)
    setResultMsg(`已卸下 ${getEquipDisplayName(eq)}`)
    setModalMode('none')
  }, [])

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

  // ── 技能詳情面板 ──
  const [selectedSkill, setSelectedSkill] = useState<{ skill: SkillTemplate; isLocked?: boolean; unlockStar?: number } | null>(null)

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
                    <span className="hd2-stat-val" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                      {final}{suffix ?? ''}
                      {bonus > 0 && <span style={{ color: '#4ade80', fontSize: '0.75em', marginLeft: 2 }}>(+{bonus}{suffix ?? ''})</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ── 技能 ── */}
        <div className="hd2-section-title">
          技能
          {skillLevel > 1 && <span className="hd2-section-hint" style={{ color: '#f0c040' }}>　技能等級 Lv.{skillLevel}</span>}
        </div>
        <div className="hd2-skills">
          {/* 主動技 */}
          {skillSet.activeSkill ? (
            <div className="hd2-skill hd2-skill-active hd2-skill-clickable"
                 onClick={() => setSelectedSkill({ skill: skillSet.activeSkill! })}>
              <div className="hd2-skill-icon">{resolveSkillIcon(skillSet.activeSkill.icon, 'active')}</div>
              <div className="hd2-skill-body">
                <div className="hd2-skill-name"><span className="hd2-skill-badge active">主動</span> {skillSet.activeSkill.name}</div>
                <SkillDescWithTags skill={skillSet.activeSkill} skillLevel={skillLevel} />
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
              <div key={i} className={`hd2-skill ${unlocked ? '' : 'hd2-skill-locked'} ${passive ? 'hd2-skill-clickable' : ''}`}
                   onClick={() => passive && setSelectedSkill({ skill: passive, isLocked: !unlocked, unlockStar: reqStars })}>
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
                      <SkillDescWithTags skill={passive} skillLevel={skillLevel} />
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
                title={eq ? `${getEquipDisplayName(eq)} +${eq.enhanceLevel}\n點擊編輯` : `${label}：空\n點擊裝備`}
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
            disabled={!isOwned || stars >= 10}
            title={!isOwned ? '尚未擁有' : stars >= 10 ? '已達最高星級' : '消耗碎片提升星級'}
            onClick={() => { setResultMsg(''); setModalMode('starUp') }}
          >
            <span className="hd2-btn-icon">⭐</span><span>升星</span>
            {canDoStarUp && <RedDot size="sm" />}
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
                  <span className="hd2-mat-icon"><ClickableItemIcon itemId="asc_fragment_0" /></span>
                  <span className="hd2-mat-name">英雄碎片</span>
                  <span className={`hd2-mat-qty ${ownedFragments >= ascCost.fragments ? 'sufficient' : 'insufficient'}`}>
                    {ownedFragments}/{ascCost.fragments}
                  </span>
                </div>
                <div className="hd2-material-row">
                  <span className="hd2-mat-icon"><ClickableItemIcon itemId="asc_class_power" /></span>
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
        {modalMode === 'starUp' && (() => {
          const nextStars = Math.min(6, stars + 1)
          const curMult = getStarMultiplier(stars, rarityNum)
          const nextMult = getStarMultiplier(nextStars, rarityNum)
          const curSlots = getStarPassiveSlots(stars)
          const nextSlots = getStarPassiveSlots(nextStars)
          const newPassiveUnlocked = nextSlots > curSlots
          // 計算各屬性預覽
          const statCalc = (base: unknown) => {
            if (base == null) return { cur: '?', next: '?' }
            const b = Number(base)
            const lv = getStatAtLevel(b, lvl, rarityNum) * ascMult
            return {
              cur: Math.floor(lv * curMult),
              next: Math.floor(lv * nextMult),
            }
          }
          const hpStat = statCalc(heroAny.HP)
          const atkStat = statCalc(heroAny.ATK)
          const defStat = statCalc(heroAny.DEF)
          // 新解鎖的被動技能
          const unlockPassive = newPassiveUnlocked ? skillSet.passives[curSlots] : null
          return (
          <div className="hd2-modal-backdrop" onClick={() => setModalMode('none')}>
            <div className="hd2-modal" onClick={e => e.stopPropagation()}>
              <h4 className="hd2-modal-title">⭐ 英雄升星</h4>
              <div className="hd2-modal-info">
                <StarDisplay count={stars} /> → <StarDisplay count={nextStars} />
              </div>
              <div className="hd2-material-list">
                <div className="hd2-material-row">
                  <span className="hd2-mat-icon"><ClickableItemIcon itemId="asc_fragment_0" /></span>
                  <span className="hd2-mat-name">英雄碎片</span>
                  <span className={`hd2-mat-qty ${ownedFragments >= starCost ? 'sufficient' : 'insufficient'}`}>
                    {ownedFragments}/{starCost}
                  </span>
                </div>
              </div>

              {/* 屬性增加預覽 */}
              <div className="hd2-star-stat-preview">
                <div className="hd2-star-stat-title">屬性變化</div>
                {([['❤️ 生命', hpStat], ['⚔️ 攻擊', atkStat], ['🛡️ 防禦', defStat]] as const).map(([label, s]) => (
                  <div key={label} className="hd2-star-stat-row">
                    <span className="hd2-star-stat-label">{label}</span>
                    <span className="hd2-star-stat-val">{s.cur}</span>
                    <span className="hd2-star-stat-arrow">→</span>
                    <span className="hd2-star-stat-val hd2-star-stat-new">{s.next}</span>
                    {typeof s.cur === 'number' && typeof s.next === 'number' && (
                      <span className="hd2-star-stat-diff">+{s.next - s.cur}</span>
                    )}
                  </div>
                ))}
                <div className="hd2-star-stat-row" style={{ marginTop: 4 }}>
                  <span className="hd2-star-stat-label">屬性倍率</span>
                  <span className="hd2-star-stat-val">×{curMult.toFixed(2)}</span>
                  <span className="hd2-star-stat-arrow">→</span>
                  <span className="hd2-star-stat-val hd2-star-stat-new">×{nextMult.toFixed(2)}</span>
                </div>
              </div>

              {/* 技能解鎖預覽 */}
              {newPassiveUnlocked && (
                <div className="hd2-star-skill-unlock">
                  <div className="hd2-star-skill-title">🔓 解鎖被動技能欄位 {nextSlots}</div>
                  {unlockPassive ? (
                    <>
                      <div className="hd2-star-skill-info">
                        <span className="hd2-star-skill-icon">{resolveSkillIcon(unlockPassive.icon, 'passive')}</span>
                        <span className="hd2-star-skill-name">{unlockPassive.name}</span>
                      </div>
                      {unlockPassive.description && (
                        <div className="hd2-star-skill-desc">
                          <SkillDescWithTags skill={unlockPassive} skillLevel={skillLevel} />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="hd2-star-skill-info" style={{ color: '#aaa' }}>
                      （尚未配置被動技能）
                    </div>
                  )}
                </div>
              )}
              {!newPassiveUnlocked && (
                <div className="hd2-star-bonus">
                  被動欄位：{curSlots} 個（不變）
                </div>
              )}
              {/* ★7+ 技能等級提升預覽 */}
              {nextStars > 6 && (
                <div className="hd2-star-bonus" style={{ color: '#f0c040' }}>
                  📈 技能等級：Lv.{stars > 6 ? stars - 5 : 1} → Lv.{nextStars - 5}（全技能效果提升）
                </div>
              )}

              {resultMsg && <div className="hd2-result-msg">{resultMsg}</div>}
              <div className="hd2-modal-btns">
                <button className="hd2-modal-cancel" onClick={() => setModalMode('none')}>關閉</button>
                <button
                  className="hd2-modal-confirm"
                  disabled={!canDoStarUp || isProcessing}
                  onClick={handleConfirmStarUp}
                >{isProcessing ? '處理中...' : '確認升星'}</button>
              </div>
            </div>
          </div>
          )
        })()}

        {/* ═══════ 裝備選擇 Modal ═══════ */}
        {modalMode === 'equip' && (
          <div className="hd2-modal-backdrop" onClick={() => setModalMode('none')}>
            <div className="hd2-modal" onClick={e => e.stopPropagation()}>
              <h4 className="hd2-modal-title">
                {EQUIP_SLOTS.find(s => s.key === equipSelectSlot)?.icon}{' '}
                {EQUIP_SLOTS.find(s => s.key === equipSelectSlot)?.label ?? '裝備'}
              </h4>

              {/* ── 目前已裝備 ── */}
              {equippedBySlot[equipSelectSlot!] && (() => {
                const cur = equippedBySlot[equipSelectSlot!]!
                return (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: 4 }}>目前裝備</div>
                    <div className="hd2-equip-option" style={{ borderColor: 'rgba(250,204,21,0.5)', background: 'rgba(250,204,21,0.08)' }}>
                      <div className="hd2-equip-option-header">
                        <span className={`hd2-equip-rarity rarity-${(cur.rarity || 'N').toLowerCase()}`}>{cur.rarity || 'N'}</span>
                        <span className="hd2-equip-option-name">{getEquipDisplayName(cur)}</span>
                        {(cur.enhanceLevel ?? 0) > 0 && <span className="hd2-equip-lv">+{cur.enhanceLevel}</span>}
                      </div>
                      <div className="hd2-equip-option-stats">
                        <span>{statZh(cur.mainStat ?? '?')} +{enhancedMainStat(cur.mainStatValue ?? 0, cur.enhanceLevel ?? 0, cur.rarity ?? 'N')}</span>
                        {(Array.isArray(cur.subStats) ? cur.subStats : []).map((sub, i) => (
                          <span key={i} className="hd2-sub-stat">
                            {statZh(sub.stat)} +{sub.value}{sub.isPercent ? '%' : ''}
                          </span>
                        ))}
                      </div>
                      {cur.setId && <span className="hd2-equip-set">{SET_NAMES[cur.setId] || cur.setId}</span>}
                      <button
                        className="hd2-modal-cancel"
                        style={{ marginTop: 6, fontSize: '0.72rem', padding: '4px 12px' }}
                        onClick={() => handleUnequipFromModal(cur)}
                      >卸下裝備</button>
                    </div>
                  </div>
                )
              })()}

              {/* ── 篩選控制 ── */}
              {availableForSlotRaw.length > 0 && (
                <div className="hd2-equip-filters">
                  <div className="hd2-equip-filter-group">
                    <span className="hd2-equip-filter-label">稀有度</span>
                    <div className="hd2-equip-filter-btns">
                      {(['all', 'N', 'R', 'SR', 'SSR'] as const).map(r => (
                        <button
                          key={r}
                          className={`hd2-equip-filter-btn${equipFilterRarity === r ? ' active' : ''}${r !== 'all' ? ` rarity-${r.toLowerCase()}` : ''}`}
                          onClick={() => setEquipFilterRarity(r)}
                        >{r === 'all' ? '全部' : r}</button>
                      ))}
                    </div>
                  </div>
                  {availableSets.length > 1 && (
                    <div className="hd2-equip-filter-group">
                      <span className="hd2-equip-filter-label">套裝</span>
                      <div className="hd2-equip-filter-btns">
                        <button
                          className={`hd2-equip-filter-btn${equipFilterSet === 'all' ? ' active' : ''}`}
                          onClick={() => setEquipFilterSet('all')}
                        >全部</button>
                        {availableSets.map(s => (
                          <button
                            key={s}
                            className={`hd2-equip-filter-btn${equipFilterSet === s ? ' active' : ''}`}
                            onClick={() => setEquipFilterSet(s)}
                          >{SET_NAMES[s] || s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── 副屬性篩選 ── */}
              {availableForSlotRaw.length > 0 && (
                <div className="inv-substat-filter" style={{ padding: '0 0 6px' }}>
                  <span className="inv-substat-label">副屬性：</span>
                  {[
                    { stat: 'ATK', label: '攻擊' },
                    { stat: 'HP', label: 'HP' },
                    { stat: 'DEF', label: '防禦' },
                    { stat: 'SPD', label: '速度' },
                    { stat: 'CritRate', label: '暴擊率' },
                    { stat: 'CritDmg', label: '暴擊傷害' },
                  ].map(({ stat, label }) => {
                    const active = equipFilterSubStats.has(stat)
                    return (
                      <button
                        key={stat}
                        className={`inv-substat-btn ${active ? 'inv-substat-active' : ''}`}
                        onClick={() => setEquipFilterSubStats(prev => {
                          const next = new Set(prev)
                          if (next.has(stat)) next.delete(stat); else next.add(stat)
                          return next
                        })}
                      >{label}</button>
                    )
                  })}
                  {equipFilterSubStats.size > 0 && (
                    <button
                      className="inv-substat-btn inv-substat-clear"
                      onClick={() => setEquipFilterSubStats(new Set())}
                    >✕ 清除</button>
                  )}
                  {equipFilterSubStats.size > 0 && (
                    <span className="inv-substat-count">
                      {availableForSlot.length} 件
                    </span>
                  )}
                </div>
              )}

              {/* ── 可選裝備列表 ── */}
              {availableForSlot.length > 0 && equippedBySlot[equipSelectSlot!] && (
                <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: 4 }}>可更換裝備 ({availableForSlot.length})</div>
              )}
              {availableForSlot.length === 0 && !equippedBySlot[equipSelectSlot!] ? (
                <div className="hd2-modal-info">{
                  availableForSlotRaw.length > 0 ? '沒有符合篩選條件的裝備' : '沒有可用的裝備'
                }</div>
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

        {/* ── 技能詳情面板 ── */}
        {selectedSkill && (() => {
          const effTemplates = getEffectTemplatesCache()
          const effLinks = getSkillEffectsCache()
          const skillLevel = stars > 6 ? stars - 5 : 1
          const effects = resolveSkillEffects(selectedSkill.skill.skillId, skillLevel, effTemplates, effLinks)
          // 各等級效果對比（只有等級間確實有差異時才顯示）
          const allLevels = new Map<number, typeof effects>()
          for (let lv = 1; lv <= 5; lv++) {
            const lvEffects = resolveSkillEffects(selectedSkill.skill.skillId, lv, effTemplates, effLinks)
            if (lvEffects.length > 0) allLevels.set(lv, lvEffects)
          }
          // 比對各等級是否真有差異（用 JSON 快速比對）
          let hasDiff = false
          if (allLevels.size > 1) {
            const signatures = new Set<string>()
            for (const effs of allLevels.values()) {
              signatures.add(JSON.stringify(effs.map(e => ({ m: e.multiplier, sc: e.statusChance, sv: e.statusValue, sd: e.statusDuration, fv: e.flatValue, hc: e.hitCount }))))
            }
            hasDiff = signatures.size > 1
          }
          return (
            <div className="skill-desc-overlay" onClick={() => setSelectedSkill(null)}>
              <SkillDescPanel
                skill={selectedSkill.skill}
                effects={effects}
                skillLevel={skillLevel}
                allLevelEffects={hasDiff ? allLevels : undefined}
                isLocked={selectedSkill.isLocked}
                unlockStar={selectedSkill.unlockStar}
                onClose={() => setSelectedSkill(null)}
              />
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
  showStarUpDot?: boolean
}

function HeroCard({ hero, instance, onClick, showStarUpDot }: HeroCardProps) {
  const lvl = instance?.level ?? 1
  const asc = instance?.ascension ?? 0
  const isOwned = !!instance
  const rarity = toRarity((hero as Record<string, unknown>).Rarity)
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
      {showStarUpDot && <RedDot size="sm" />}
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
    const groups: { label: Rarity; heroes: RawHeroData[] }[] = []
    const order: Rarity[] = ['SSR', 'SR', 'R', 'N']
    for (const r of order) {
      const heroes = filteredHeroes.filter(h => toRarity((h as Record<string, unknown>).Rarity) === r)
      if (heroes.length > 0) groups.push({ label: r, heroes })
    }
    return groups
  }, [filteredHeroes])

  /** 可升星的英雄 ID 集合（用於紅點顯示） */
  const starUpReadySet = useMemo(() => {
    const set = new Set<number>()
    for (const inst of heroInstances) {
      const hero = heroesList.find(h => Number(h.HeroID ?? h.id ?? 0) === inst.heroId)
      const minStars = hero ? initialStars((hero as Record<string, unknown>).Rarity) : 0
      const stars = Math.max(inst.stars ?? minStars, minStars)
      const fragments = getItemQuantity(`asc_fragment_${inst.heroId}`)
      if (canStarUp(stars, fragments)) set.add(inst.heroId)
    }
    return set
  }, [heroInstances, heroesList])

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
          <PanelInfoTip description={PANEL_DESCRIPTIONS.heroList} />
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
                    showStarUpDot={starUpReadySet.has(Number(hero.HeroID ?? hero.id ?? 0))}
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
