/**
 * stageSystem — 關卡系統 Domain 邏輯
 *
 * 包含：主線關卡、無盡爬塔、每日副本、Boss 戰的敵方生成與獎勵計算
 *
 * 對應 Spec: .ai/specs/stage-system.md v0.2
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
  /** DEF 乘數（預設 1.0 — 不縮放）。早期關卡應設 < 1.0 以避免敵人 DEF 相對 HP/ATK 過高 */
  defMultiplier?: number
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

/* ════════════════════════════════════
   每日次數限制
   ════════════════════════════════════ */

/** 每日限制（主線/爬塔無限） */
export const DAILY_LIMITS: Record<string, number> = {
  daily: 3,   // 每日副本
  pvp: 5,     // 試煉場
  boss: 3,    // 首領戰
}

/** 取得某模式的每日上限（回傳 0 = 無限） */
export function getDailyLimit(mode: string): number {
  return DAILY_LIMITS[mode] ?? 0
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
  // 每 5 層（非 Boss）50% 機率額外 +500 exp，直接併入 exp 欄位
  const bonusExp = (!isBossFloor && floor % 5 === 0 && Math.random() < 0.5) ? 500 : 0
  return {
    exp: 50 + floor * 10 + bonusExp,
    gold: 100 + floor * 20,
    diamond: isBossFloor ? 50 : 0,
    items: isBossFloor
      ? [{ itemId: 'chest_equipment', quantity: 1, dropRate: 1.0 }]
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
          exp: 0, gold: 500,
          items: [
            { itemId: 'asc_class_power', quantity: 3, dropRate: 1.0 },
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
          exp: 0, gold: 1000,
          items: [
            { itemId: 'asc_class_power', quantity: 6, dropRate: 1.0 },
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
          exp: 0, gold: 2000,
          items: [
            { itemId: 'asc_class_power', quantity: 12, dropRate: 1.0 },
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
          exp: 0, gold: 500,
          items: [
            { itemId: 'asc_class_agility', quantity: 3, dropRate: 1.0 },
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
          exp: 0, gold: 1000,
          items: [
            { itemId: 'asc_class_agility', quantity: 6, dropRate: 1.0 },
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
          exp: 0, gold: 2000,
          items: [
            { itemId: 'asc_class_agility', quantity: 12, dropRate: 1.0 },
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
          exp: 0, gold: 500,
          items: [
            { itemId: 'asc_class_defense', quantity: 3, dropRate: 1.0 },
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
          exp: 0, gold: 1000,
          items: [
            { itemId: 'asc_class_defense', quantity: 6, dropRate: 1.0 },
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
          exp: 0, gold: 2000,
          items: [
            { itemId: 'asc_class_defense', quantity: 12, dropRate: 1.0 },
          ],
        },
      },
    ],
  },
]

/** 根據每日副本 stageId（如 "power_trial_easy"）查找副本設定 */
export function getDailyDungeonConfig(stageId: string): { dungeon: DailyDungeon; difficulty: DungeonDifficulty } | null {
  for (const dungeon of DAILY_DUNGEONS) {
    for (const diff of dungeon.difficulties) {
      if (`${dungeon.dungeonId}_${diff.tier}` === stageId) {
        return { dungeon, difficulty: diff }
      }
    }
  }
  return null
}

const TIER_NAMES: Record<string, string> = { easy: '簡單', normal: '普通', hard: '困難' }

/** 取得每日副本中文顯示名稱（如 "力量試煉 - 簡單"） */
export function getDailyDungeonDisplayName(stageId: string): string {
  const config = getDailyDungeonConfig(stageId)
  if (!config) return stageId
  return `${config.dungeon.name} - ${TIER_NAMES[config.difficulty.tier] ?? config.difficulty.tier}`
}

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
export const MAX_CHAPTER = 8
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

/* ════════════════════════════════════
   PvP 競技場
   ════════════════════════════════════ */

export interface PvPOpponent {
  opponentId: string
  name: string
  power: number
  enemies: StageEnemy[]
}

/** 根據玩家進度產生 3 位 PvP 對手（seeded by date + progress） */
export function getPvPOpponents(
  storyProgress: { chapter: number; stage: number },
): PvPOpponent[] {
  const today = new Date()
  const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  const progress = (storyProgress.chapter - 1) * 8 + storyProgress.stage
  const rng = seededRandom(daySeed + progress * 7)

  const names = ['暗影獵人', '末日行者', '腐蝕之王', '殭屍領主', '瘟疫使者', '深淵守望者']
  const opponents: PvPOpponent[] = []

  for (let i = 0; i < 3; i++) {
    const enemyCount = Math.min(6, 3 + Math.floor(progress / 6) + i)
    const hpMult  = 1.0 + progress * 0.10 + i * 0.3
    const atkMult = 1.0 + progress * 0.06 + i * 0.2
    const spdMult = 1.0 + progress * 0.01
    const enemies: StageEnemy[] = []
    for (let j = 0; j < enemyCount; j++) {
      enemies.push({
        heroId: ZOMBIE_IDS[Math.floor(rng() * ZOMBIE_IDS.length)],
        slot: j,
        levelMultiplier: 1,
        hpMultiplier: hpMult,
        atkMultiplier: atkMult,
        speedMultiplier: spdMult,
      })
    }
    const nameIdx = Math.floor(rng() * names.length)
    const power = Math.floor((hpMult + atkMult) * 1000 + enemyCount * 500)
    opponents.push({
      opponentId: `pvp_${i}`,
      name: names[nameIdx],
      power,
      enemies,
    })
  }
  return opponents
}

export function getPvPReward(progress: number, difficultyIndex = 0): StageReward {
  // difficultyIndex: 0=一般, 1=菁英, 2=強敵
  const diffMult = [1.0, 1.5, 2.0][difficultyIndex] ?? 1.0
  return {
    exp: Math.floor((80 + progress * 10) * diffMult),
    gold: Math.floor((200 + progress * 40) * diffMult),
    diamond: Math.floor(10 * diffMult),
    items: [{ itemId: 'pvp_coin', quantity: Math.floor((3 + Math.floor(progress / 4)) * diffMult), dropRate: 1.0 }],
  }
}

/* ════════════════════════════════════
   Boss 挑戰
   ════════════════════════════════════ */

export const BOSS_CONFIGS: BossConfig[] = [
  {
    bossId: 'boss_1',
    name: '腐化巨獸',
    heroId: 5,
    hp: 99999999,
    atk: 120,
    speed: 80,
    turnLimit: 30,
    damageThresholds: { S: 15000, A: 10000, B: 5000, C: 2000 },
  },
  {
    bossId: 'boss_2',
    name: '暗夜領主',
    heroId: 9,
    hp: 99999999,
    atk: 180,
    speed: 100,
    turnLimit: 30,
    damageThresholds: { S: 25000, A: 18000, B: 10000, C: 4000 },
  },
  {
    bossId: 'boss_3',
    name: '末日審判者',
    heroId: 14,
    hp: 99999999,
    atk: 250,
    speed: 120,
    turnLimit: 30,
    damageThresholds: { S: 40000, A: 28000, B: 15000, C: 6000 },
  },
]

export function getBossConfig(bossId: string): BossConfig | null {
  return BOSS_CONFIGS.find(b => b.bossId === bossId) ?? null
}

/** 根據 bossId 產生 StageEnemy 陣列（單一 Boss） */
export function getBossEnemies(bossId: string): StageEnemy[] {
  const boss = getBossConfig(bossId)
  if (!boss) return []
  return [{
    heroId: boss.heroId,
    slot: 1,
    levelMultiplier: 1,
    hpMultiplier: boss.hp / 100,   // base HP is 100 → multiply to target
    atkMultiplier: boss.atk / 20,  // base ATK is 20
    speedMultiplier: boss.speed / 80,
  }]
}

export function getBossReward(bossId: string, totalDamage: number): StageReward {
  const boss = getBossConfig(bossId)
  if (!boss) return { exp: 0, gold: 0 }
  let rank: 'S' | 'A' | 'B' | 'C' = 'C'
  if (totalDamage >= boss.damageThresholds.S) rank = 'S'
  else if (totalDamage >= boss.damageThresholds.A) rank = 'A'
  else if (totalDamage >= boss.damageThresholds.B) rank = 'B'
  return getBossRewardByBossAndRank(bossId, rank)
}

/** 給定 bossId + rank，回傳對應獎勵（越難的 Boss 獎勵越好） */
export function getBossRewardByBossAndRank(bossId: string, rank: string): StageReward {
  // Boss 倍率：boss_1=1.0, boss_2=1.5, boss_3=2.0
  const bossIdx = BOSS_CONFIGS.findIndex(b => b.bossId === bossId)
  const bossMult = [1.0, 1.5, 2.0][bossIdx] ?? 1.0
  const baseRewards: Record<string, StageReward> = {
    S: { exp: 600, gold: 3000, diamond: 100, items: [{ itemId: 'chest_equipment', quantity: 2, dropRate: 1.0 }] },
    A: { exp: 400, gold: 2000, diamond: 50, items: [{ itemId: 'chest_equipment', quantity: 1, dropRate: 1.0 }] },
    B: { exp: 200, gold: 1000, diamond: 20 },
    C: { exp: 100, gold: 500, diamond: 0 },
  }
  const base = baseRewards[rank] ?? baseRewards['C']
  return {
    exp: Math.floor(base.exp * bossMult),
    gold: Math.floor(base.gold * bossMult),
    diamond: Math.floor((base.diamond ?? 0) * bossMult),
    items: base.items?.map(it => ({ ...it, quantity: Math.floor(it.quantity * bossMult) || 1 })),
  }
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
