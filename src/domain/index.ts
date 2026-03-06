/**
 * Domain 模組統一匯出
 */

// 核心型別
export type {
  Element,
  FinalStats,
  StatusType,
  StatusEffect,
  Shield,
  TargetType,
  PassiveTrigger,
  SkillEffect,
  SkillTemplate,
  HeroSkillConfig,
  ElementEntry,
  BattleHero,
  BattleContext,
  DamageResult,
  HealResult,
  EnergyConfig,
  BattleAction,
} from './types'

export { DEFAULT_ENERGY_CONFIG } from './types'

// 屬性系統
export { getElementMultiplier, isWeakness, isResist, loadElementMatrix } from './elementSystem'

// Buff 系統
export {
  applyStatus,
  removeStatus,
  cleanse,
  processDotEffects,
  processRegen,
  tickStatusDurations,
  tickShieldDurations,
  getStatusValue,
  hasStatus,
  isControlled,
  isSilenced,
  isFeared,
  hasTaunt,
  isDebuff,
  getBuffedStats,
  absorbDamageByShields,
} from './buffSystem'

// 傷害公式
export { calculateDamage, calculateHeal, calculateDot, calculateReflect } from './damageFormula'

// 能量系統
export {
  addEnergy,
  turnStartEnergy,
  onAttackEnergy,
  onBeAttackedEnergy,
  onKillEnergy,
  consumeEnergy,
  canCastUltimate,
  getEnergyConfig,
} from './energySystem'

// 目標策略
export { selectTargets, selectNormalAttackTarget } from './targetStrategy'

// 戰鬥引擎
export { runBattle, runBattleCollect, createBattleHero, checkLethalPassive } from './battleEngine'
export type { BattleEngineConfig, BattleResult, RawHeroInput } from './battleEngine'

// 種子式隨機數產生器（確定性戰鬥用）
export { createSeededRng, generateBattleSeed } from './seededRng'

// 養成系統
export {
  expToNextLevel,
  totalExpForLevel,
  getStatAtLevel,
  getLevelCap,
  consumeExpMaterials,
  getAscensionMultiplier,
  getAscensionCost,
  canAscend,
  getStarMultiplier,
  getStarPassiveSlots,
  getStarUpCost,
  canStarUp,
  getInitialStars,
  enhancedMainStat,
  getMaxEnhanceLevel,
  getEnhanceCost,
  getEquipmentCapacity,
  getExpandCost,
  randomSubStats,
  getSetBonus,
  getActiveSetBonuses,
  getFinalStats,
  ASCENSION_LEVEL_CAP,
  ASCENSION_MULTIPLIER,
  STAR_MULTIPLIER,
  STAR_PASSIVE_SLOTS,
  STAR_UP_COST,
  ASCENSION_COSTS,
  EQUIPMENT_MAX_ENHANCE,
  EQUIPMENT_SETS,
  EQUIPMENT_SLOT_BASE,
  EQUIPMENT_SLOT_MAX,
} from './progressionSystem'

export type {
  EquipmentSlot,
  Rarity,
  SubStat,
  EquipmentInstance,
  HeroInstanceData,
  BaseStats,
  AscensionCost,
  EquipmentSetBonus,
} from './progressionSystem'

// 關卡系統
export {
  isModeUnlocked,
  calculateStarRating,
  getTowerFloorConfig,
  getTowerReward,
  getTodayDungeons,
  getAvailableDifficulties,
  rollDrops,
  mergeDrops,
  DAILY_DUNGEONS,
  MODE_UNLOCK,
} from './stageSystem'

export type {
  StageEnemy,
  StageReward,
  StageConfig,
  TowerFloorConfig,
  DailyDungeon,
  DungeonDifficulty,
  BossConfig,
  StarRating,
  UnlockConditions,
} from './stageSystem'

// 抽卡系統
export {
  getEffectiveSSRRate,
  rollRarity,
  rollHero,
  performSinglePull,
  performTenPull,
  getDuplicateReward,
  canAffordPull,
  getPullCost,
  DEFAULT_RATE_TABLE,
  DEFAULT_PITY_CONFIG,
  SINGLE_PULL_COST,
  TEN_PULL_COST,
  DUPLICATE_STARDUST,
  STANDARD_BANNER,
} from './gachaSystem'

export type {
  GachaRarity,
  GachaBanner,
  RateTable,
  PityConfig,
  PityState,
  GachaPullResult,
  DuplicateReward,
} from './gachaSystem'

// 戰力系統
export {
  CP_WEIGHTS,
  ULTIMATE_POWER_BASE,
  PASSIVE_POWER_EACH,
  SET_2PC_POWER,
  SET_4PC_POWER,
  getSkillPowerBonus,
  getSetBonusPower,
  getHeroCombatPower,
  getTeamCombatPower,
  getEnemyTeamPower,
  getComparisonLevel,
  COMPARISON_TEXT,
  COMPARISON_COLOR,
} from './combatPower'

export type {
  CombatPowerHeroInput,
  EnemyStats,
  ComparisonLevel,
} from './combatPower'

// 競技場系統
export {
  ARENA_MAX_RANK,
  ARENA_DAILY_CHALLENGES,
  ARENA_DAILY_REFRESHES,
  getChallengeRange,
  generateNPCForRank,
  getChallengeable,
  processArenaResult,
  getChallengeReward,
  checkRankMilestone,
  getDailyReward,
  getSeasonReward,
  RANK_MILESTONES,
  DAILY_REWARD_TIERS,
  SEASON_REWARD_TIERS,
} from './arenaSystem'

export type {
  ArenaEntry,
  ArenaReward,
  ArenaChallengeResult,
} from './arenaSystem'
