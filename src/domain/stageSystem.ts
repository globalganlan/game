/**
 * stageSystem — 關卡系統 Domain 邏輯
 *
 * 包含：主線關卡、無盡爬塔、每日副本、Boss 戰的敵方生成與獎勵計算
 *
 * 對應 Spec: specs/stage-system.md v0.2
 */

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface StageEnemy {
  heroId: number
  slot: number
  levelMultiplier: number
  hpMultiplier: number
  atkMultiplier: number
  speedMultiplier: number
}

export interface StageReward {
  exp: number
  gold: number
  diamond?: number
  items?: { itemId: string; quantity: number; dropRate: number }[]
}

export interface StageConfig {
  stageId: string
  chapter: number
  stage: number
  enemies: StageEnemy[]
  recommendedLevel: number
  rewards: StageReward
  firstClearRewards: StageReward
}

export interface TowerFloorConfig {
  floor: number
  enemies: StageEnemy[]
  rewards: StageReward
  isBoss: boolean
}

export interface DungeonDifficulty {
  tier: 'easy' | 'normal' | 'hard'
  requiredChapter: number
  enemies: StageEnemy[]
  rewards: StageReward
}

export interface DailyDungeon {
  dungeonId: string
  name: string
  availableDays: number[]  // 0=Sun, 1=Mon, ...
  difficulties: DungeonDifficulty[]
}

export interface BossSkill {
  name: string
  type: 'aoe' | 'single' | 'buff' | 'debuff'
  triggerCondition: 'every_N_turns' | 'hp_below'
  triggerValue: number
  effect: string
}

export interface BossConfig {
  bossId: string
  name: string
  heroId: number
  hp: number
  atk: number
  speed: number
  turnLimit: number
  damageThresholds: { S: number; A: number; B: number; C: number }
}

export type StarRating = 1 | 2 | 3

/* ════════════════════════════════════
   共用工具
   ════════════════════════════════════ */

const ZOMBIE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/* ════════════════════════════════════
   主線關卡 — 固定敵方陣容（seeded random）
   ════════════════════════════════════ */

/**
 * 根據 stageId（如 "1-3"）產生固定不變的敵方陣容。
 * 使用 seeded PRNG 確保同一關卡每次傳回相同結果。
 */
export function getStoryStageConfig(stageId: string): StageConfig {
  const parts = stageId.split('-').map(Number)
  const chapter = parts[0] || 1
  const stage = parts[1] || 1
  const linearIndex = (chapter - 1) * 8 + stage  // 1~24

  // Seed: chapter * 1000 + stage → deterministic
  const rng = seededRandom(chapter * 1000 + stage)

  // 敵方數量：隨關卡遞增 2~6
  const minCount = Math.min(2 + Math.floor(linearIndex / 4), 6)
  const maxCount = Math.min(minCount + 2, 6)
  const enemyCount = minCount + Math.floor(rng() * (maxCount - minCount + 1))

  // 難度倍率：隨關卡遞增
  const hpMult  = 1.0 + (linearIndex - 1) * 0.12
  const atkMult = 1.0 + (linearIndex - 1) * 0.08
  const spdMult = 1.0 + (linearIndex - 1) * 0.015

  const enemies: StageEnemy[] = []
  for (let i = 0; i < enemyCount; i++) {
    const heroId = ZOMBIE_IDS[Math.floor(rng() * ZOMBIE_IDS.length)]
    enemies.push({
      heroId,
      slot: i,
      levelMultiplier: 1,
      hpMultiplier: hpMult,
      atkMultiplier: atkMult,
      speedMultiplier: spdMult,
    })
  }

  const recommendedLevel = Math.min(1 + (linearIndex - 1) * 2, 60)

  return {
    stageId,
    chapter,
    stage,
    enemies,
    recommendedLevel,
    rewards: {
      exp: 30 + linearIndex * 15,
      gold: 50 + linearIndex * 30,
      diamond: stage === 8 ? 20 : 0,           // 每章最後一關給鑽石
      items: linearIndex % 3 === 0
        ? [{ itemId: 'exp_core_s', quantity: 1, dropRate: 0.6 }]
        : [],
    },
    firstClearRewards: {
      exp: 60 + linearIndex * 20,
      gold: 100 + linearIndex * 50,
      diamond: 30,
      items: [{ itemId: 'exp_core_s', quantity: 2, dropRate: 1.0 }],
    },
  }
}

/* ════════════════════════════════════
   模式解鎖條件
   ════════════════════════════════════ */

export interface UnlockConditions {
  tower: { chapter: 1; stage: 4 }
  daily: { chapter: 1; stage: 8 }
  pvp:   { chapter: 2; stage: 1 }
  boss:  { chapter: 2; stage: 8 }
}

export const MODE_UNLOCK: UnlockConditions = {
  tower: { chapter: 1, stage: 4 },
  daily: { chapter: 1, stage: 8 },
  pvp:   { chapter: 2, stage: 1 },
  boss:  { chapter: 2, stage: 8 },
}

export function isModeUnlocked(
  mode: keyof UnlockConditions,
  storyProgress: { chapter: number; stage: number },
): boolean {
  const req = MODE_UNLOCK[mode]
  const playerProgress = (storyProgress.chapter - 1) * 8 + storyProgress.stage
  const reqProgress = (req.chapter - 1) * 8 + req.stage
  return playerProgress >= reqProgress
}

/* ════════════════════════════════════
   星級評價
   ════════════════════════════════════ */

export function calculateStarRating(totalHeroes: number, survivingHeroes: number): StarRating {
  if (survivingHeroes >= totalHeroes) return 3         // 全員存活
  if (totalHeroes - survivingHeroes <= 2) return 2     // ≤2 人陣亡
  return 1                                              // 通關即可
}

/* ════════════════════════════════════
   無盡爬塔 — 動態生成
   ════════════════════════════════════ */

export function getTowerFloorConfig(floor: number): TowerFloorConfig {
  const rng = seededRandom(floor * 7919)
  const isBoss = floor % 10 === 0
  const hpMult = 1.0 + floor * 0.15
  const atkMult = 1.0 + floor * 0.10
  const spdMult = 1.0 + floor * 0.02

  let enemies: StageEnemy[]

  if (isBoss) {
    // Boss floor: single high-stat enemy
    const bossId = ZOMBIE_IDS[Math.floor(rng() * ZOMBIE_IDS.length)]
    enemies = [{
      heroId: bossId,
      slot: 1,
      levelMultiplier: 1,
      hpMultiplier: hpMult * 3,
      atkMultiplier: atkMult * 2,
      speedMultiplier: spdMult,
    }]
  } else {
    // Regular floor: 3-6 enemies
    const enemyCount = Math.min(6, 3 + Math.floor(floor / 5))
    enemies = []
    for (let i = 0; i < enemyCount; i++) {
      const heroId = ZOMBIE_IDS[Math.floor(rng() * ZOMBIE_IDS.length)]
      enemies.push({
        heroId,
        slot: i,
        levelMultiplier: 1,
        hpMultiplier: hpMult,
        atkMultiplier: atkMult,
        speedMultiplier: spdMult,
      })
    }
  }

  return {
    floor,
    enemies,
    rewards: getTowerReward(floor),
    isBoss,
  }
}

export function getTowerReward(floor: number): StageReward {
  const isBossFloor = floor % 10 === 0
  return {
    exp: 50 + floor * 10,
    gold: 100 + floor * 20,
    diamond: isBossFloor ? 50 : 0,
    items: isBossFloor
      ? [{ itemId: 'chest_equipment', quantity: 1, dropRate: 1.0 }]
      : floor % 5 === 0
        ? [{ itemId: 'exp_core_m', quantity: 1, dropRate: 0.5 }]
        : [],
  }
}

/* ════════════════════════════════════
   每日副本
   ════════════════════════════════════ */

export const DAILY_DUNGEONS: DailyDungeon[] = [
  {
    dungeonId: 'power_trial',
    name: '力量試煉',
    availableDays: [1, 4],  // Mon, Thu
    difficulties: [
      {
        tier: 'easy',
        requiredChapter: 1,
        enemies: [
          { heroId: 2, slot: 0, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
          { heroId: 8, slot: 1, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
          { heroId: 13, slot: 2, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
        ],
        rewards: {
          exp: 100, gold: 500,
          items: [
            { itemId: 'asc_class_power', quantity: 2, dropRate: 1.0 },
            { itemId: 'eqm_enhance_s', quantity: 3, dropRate: 1.0 },
          ],
        },
      },
      {
        tier: 'normal',
        requiredChapter: 2,
        enemies: [
          { heroId: 2, slot: 0, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 8, slot: 1, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 13, slot: 2, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 2, slot: 3, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
        ],
        rewards: {
          exp: 200, gold: 1000,
          items: [
            { itemId: 'asc_class_power', quantity: 4, dropRate: 1.0 },
            { itemId: 'eqm_enhance_m', quantity: 2, dropRate: 1.0 },
            { itemId: 'exp_core_m', quantity: 1, dropRate: 0.5 },
          ],
        },
      },
      {
        tier: 'hard',
        requiredChapter: 3,
        enemies: [
          { heroId: 2, slot: 0, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 8, slot: 1, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 13, slot: 2, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 2, slot: 3, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 8, slot: 4, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
        ],
        rewards: {
          exp: 400, gold: 2000,
          items: [
            { itemId: 'asc_class_power', quantity: 8, dropRate: 1.0 },
            { itemId: 'eqm_enhance_l', quantity: 1, dropRate: 1.0 },
            { itemId: 'exp_core_l', quantity: 1, dropRate: 0.3 },
          ],
        },
      },
    ],
  },
  {
    dungeonId: 'agility_trial',
    name: '敏捷試煉',
    availableDays: [2, 5],  // Tue, Fri
    difficulties: [
      {
        tier: 'easy',
        requiredChapter: 1,
        enemies: [
          { heroId: 1, slot: 0, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
          { heroId: 10, slot: 1, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
          { heroId: 14, slot: 2, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
        ],
        rewards: {
          exp: 100, gold: 500,
          items: [
            { itemId: 'asc_class_agility', quantity: 2, dropRate: 1.0 },
            { itemId: 'eqm_enhance_s', quantity: 3, dropRate: 1.0 },
          ],
        },
      },
      {
        tier: 'normal',
        requiredChapter: 2,
        enemies: [
          { heroId: 1, slot: 0, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 10, slot: 1, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 14, slot: 2, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 4, slot: 3, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
        ],
        rewards: {
          exp: 200, gold: 1000,
          items: [
            { itemId: 'asc_class_agility', quantity: 4, dropRate: 1.0 },
            { itemId: 'eqm_enhance_m', quantity: 2, dropRate: 1.0 },
          ],
        },
      },
      {
        tier: 'hard',
        requiredChapter: 3,
        enemies: [
          { heroId: 1, slot: 0, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 10, slot: 1, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 14, slot: 2, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 4, slot: 3, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 1, slot: 4, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
        ],
        rewards: {
          exp: 400, gold: 2000,
          items: [
            { itemId: 'asc_class_agility', quantity: 8, dropRate: 1.0 },
            { itemId: 'eqm_enhance_l', quantity: 1, dropRate: 1.0 },
          ],
        },
      },
    ],
  },
  {
    dungeonId: 'defense_trial',
    name: '防禦試煉',
    availableDays: [3, 6],  // Wed, Sat
    difficulties: [
      {
        tier: 'easy',
        requiredChapter: 1,
        enemies: [
          { heroId: 3, slot: 0, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
          { heroId: 12, slot: 1, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
          { heroId: 6, slot: 2, levelMultiplier: 1, hpMultiplier: 1.0, atkMultiplier: 1.0, speedMultiplier: 1.0 },
        ],
        rewards: {
          exp: 100, gold: 500,
          items: [
            { itemId: 'asc_class_defense', quantity: 2, dropRate: 1.0 },
            { itemId: 'eqm_enhance_s', quantity: 3, dropRate: 1.0 },
          ],
        },
      },
      {
        tier: 'normal',
        requiredChapter: 2,
        enemies: [
          { heroId: 3, slot: 0, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 12, slot: 1, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 6, slot: 2, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
          { heroId: 3, slot: 3, levelMultiplier: 1, hpMultiplier: 1.5, atkMultiplier: 1.3, speedMultiplier: 1.1 },
        ],
        rewards: {
          exp: 200, gold: 1000,
          items: [
            { itemId: 'asc_class_defense', quantity: 4, dropRate: 1.0 },
            { itemId: 'eqm_enhance_m', quantity: 2, dropRate: 1.0 },
          ],
        },
      },
      {
        tier: 'hard',
        requiredChapter: 3,
        enemies: [
          { heroId: 3, slot: 0, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 12, slot: 1, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 6, slot: 2, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 3, slot: 3, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
          { heroId: 12, slot: 4, levelMultiplier: 1, hpMultiplier: 2.5, atkMultiplier: 2.0, speedMultiplier: 1.2 },
        ],
        rewards: {
          exp: 400, gold: 2000,
          items: [
            { itemId: 'asc_class_defense', quantity: 8, dropRate: 1.0 },
            { itemId: 'eqm_enhance_l', quantity: 1, dropRate: 1.0 },
          ],
        },
      },
    ],
  },
]

/** 取得今日可用的每日副本 */
export function getTodayDungeons(): DailyDungeon[] {
  const dayOfWeek = new Date().getDay() // 0=Sun, 1=Mon, ...
  if (dayOfWeek === 0) return DAILY_DUNGEONS // Sunday: all open
  return DAILY_DUNGEONS.filter(d => d.availableDays.includes(dayOfWeek))
}

/** 取得可用的副本難度 */
export function getAvailableDifficulties(
  dungeon: DailyDungeon,
  storyProgress: { chapter: number; stage: number },
): DungeonDifficulty[] {
  return dungeon.difficulties.filter(d => storyProgress.chapter >= d.requiredChapter)
}

/* ════════════════════════════════════
   獎勵結算
   ════════════════════════════════════ */

/** 依掉落率隨機抽取掉落物 */
export function rollDrops(
  rewards: StageReward,
  rng = Math.random,
): { itemId: string; quantity: number }[] {
  if (!rewards.items) return []
  const drops: { itemId: string; quantity: number }[] = []
  for (const item of rewards.items) {
    if (rng() <= item.dropRate) {
      drops.push({ itemId: item.itemId, quantity: item.quantity })
    }
  }
  return drops
}

/** 合併重複的掉落物 */
export function mergeDrops(drops: { itemId: string; quantity: number }[]): { itemId: string; quantity: number }[] {
  const map: Record<string, number> = {}
  for (const d of drops) {
    map[d.itemId] = (map[d.itemId] || 0) + d.quantity
  }
  return Object.entries(map).map(([itemId, quantity]) => ({ itemId, quantity }))
}

/* ════════════════════════════════════
   關卡推進
   ════════════════════════════════════ */

/** 最大章節數 */
export const MAX_CHAPTER = 3
/** 每章關卡數 */
export const STAGES_PER_CHAPTER = 8

/**
 * 取得下一關 stageId。
 * "1-8" → "2-1"，最後一關 "3-8" → null（全部通關）
 */
export function getNextStageId(currentStageId: string): string | null {
  const parts = currentStageId.split('-').map(Number)
  let chapter = parts[0] || 1
  let stage = parts[1] || 1

  stage++
  if (stage > STAGES_PER_CHAPTER) {
    chapter++
    stage = 1
  }
  if (chapter > MAX_CHAPTER) return null
  return `${chapter}-${stage}`
}

/** 判斷 stageId 是否為首次通關（等於或超過目前進度的關卡都算首次） */
export function isFirstClear(
  stageId: string,
  storyProgress: { chapter: number; stage: number },
): boolean {
  const parts = stageId.split('-').map(Number)
  const stageCh = parts[0] || 1
  const stageSt = parts[1] || 1
  const stageLinear = (stageCh - 1) * STAGES_PER_CHAPTER + stageSt
  const progressLinear = (storyProgress.chapter - 1) * STAGES_PER_CHAPTER + storyProgress.stage
  return stageLinear >= progressLinear
}
