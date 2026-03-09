/**
 * Domain Types — 戰鬥系統核心型別
 *
 * 純型別定義，無任何 runtime 依賴。
 * 所有 domain 模組共用此檔案。
 */

/* ════════════════════════════════════
   屬性系統
   ════════════════════════════════════ */

export type Element = 'fire' | 'water' | 'wind' | 'thunder' | 'earth' | 'light' | 'dark'

/* ════════════════════════════════════
   角色基礎數值
   ════════════════════════════════════ */

/** 角色結算後最終數值（含等級/突破/裝備/Buff 加成） */
export interface FinalStats {
  HP: number
  ATK: number
  DEF: number
  SPD: number
  CritRate: number   // 百分比 e.g. 15 = 15%
  CritDmg: number    // 百分比 e.g. 50 = +50% → 暴擊倍率 1.5
}

/* ════════════════════════════════════
   Buff / Debuff 系統
   ════════════════════════════════════ */

export type StatusType =
  // Buff（正面效果）
  | 'atk_up' | 'def_up' | 'spd_up' | 'crit_rate_up' | 'crit_dmg_up'
  | 'dmg_reduce' | 'shield' | 'regen' | 'energy_boost'
  | 'dodge_up' | 'reflect' | 'taunt'
  // Debuff（負面效果）
  | 'atk_down' | 'def_down' | 'spd_down' | 'crit_rate_down'
  | 'dot_burn' | 'dot_poison' | 'dot_bleed'
  | 'stun' | 'freeze' | 'silence' | 'fear'
  // 特殊
  | 'immunity' | 'cleanse'

export interface StatusEffect {
  type: StatusType
  value: number          // 效果數值（如 0.2 = 20%）
  duration: number       // 剩餘回合數（0 = 永久直到戰鬥結束）
  stacks: number         // 當前疊加層數
  maxStacks: number      // 最大疊加層數
  sourceHeroId: string   // 施加者 UID
}

export interface Shield {
  value: number          // 剩餘護盾量
  duration: number       // 剩餘回合數
  sourceHeroId: string
}

/* ════════════════════════════════════
   技能系統
   ════════════════════════════════════ */

/** 技能目標類型 */
export type TargetType =
  | 'single_enemy'
  | 'all_enemies'
  | 'random_enemies_3'
  | 'front_row_enemies'
  | 'back_row_enemies'
  | 'single_ally'
  | 'all_allies'
  | 'self'

/** 被動觸發時機 */
export type PassiveTrigger =
  | 'battle_start'
  | 'turn_start'
  | 'turn_end'
  | 'on_attack'
  | 'on_kill'
  | 'on_be_attacked'
  | 'on_take_damage'
  | 'on_lethal'
  | 'on_dodge'
  | 'on_crit'
  | 'on_ally_death'
  | 'on_ally_skill'
  | 'hp_below_pct'
  | 'every_n_turns'
  | 'always'

/** 技能效果模組（一個技能可包含多個效果） */
export interface SkillEffect {
  type: 'damage' | 'heal' | 'buff' | 'debuff' | 'energy' | 'revive' | 'dispel_debuff' | 'extra_turn' | 'reflect' | 'damage_mult' | 'damage_mult_random' | 'random_debuff'
  scalingStat?: keyof FinalStats  // 基於哪個數值（ATK / HP / DEF）
  multiplier?: number             // 倍率（1.8 = 180%）
  flatValue?: number              // 固定值加成
  hitCount?: number               // 多段攻擊次數
  min?: number                    // damage_mult_random 最小倍率
  max?: number                    // damage_mult_random 最大倍率
  status?: StatusType             // Buff/Debuff 類型
  statusChance?: number           // 觸發機率（0~1）
  statusValue?: number            // 效果數值
  statusDuration?: number         // 持續回合
  statusMaxStacks?: number        // 最大疊加數
  targetHpThreshold?: number      // damage_mult 條件：目標 HP% 低於閾值才生效（0~1）
  perAlly?: boolean               // buff 效果按存活隊友人數倍增
}

/** 技能模板（對應 Google Sheet: skill_templates） */
export interface SkillTemplate {
  skillId: string
  name: string
  type: 'active' | 'passive'
  element: Element | ''
  target: TargetType | string
  description: string
  effects: SkillEffect[]
  passiveTrigger: PassiveTrigger | ''
  icon: string
}

/** 英雄技能配置（對應 Google Sheet: hero_skills） */
export interface HeroSkillConfig {
  heroId: number
  activeSkillId: string
  passive1_skillId: string
  passive2_skillId: string
  passive3_skillId: string
  passive4_skillId: string
}

/* ════════════════════════════════════
   屬性剋制
   ════════════════════════════════════ */

export interface ElementEntry {
  attacker: Element
  defender: Element
  multiplier: number
}

/* ════════════════════════════════════
   戰鬥角色
   ════════════════════════════════════ */

/** 戰鬥中的完整角色資料 */
export interface BattleHero {
  uid: string
  heroId: number
  modelId: string
  name: string
  side: 'player' | 'enemy'
  slot: number
  element: Element | ''

  // 數值
  baseStats: FinalStats        // 基礎數值（不含 Buff）
  finalStats: FinalStats       // 結算後數值（含等級/裝備，不含戰鬥 Buff）
  currentHP: number
  maxHP: number

  // 能量
  energy: number               // 0~1000

  // 技能
  activeSkill: SkillTemplate | null
  passives: SkillTemplate[]    // 所有被動（4 個）
  activePassives: SkillTemplate[]  // 已解鎖的被動（受星級限制）

  // 狀態效果
  statusEffects: StatusEffect[]
  shields: Shield[]

  // 被動觸發次數追蹤（如"每場一次"的限制）
  passiveUsage: Record<string, number>

  // 戰鬥統計
  totalDamageDealt: number
  totalHealingDone: number
  killCount: number
}

/* ════════════════════════════════════
   戰鬥上下文（傳給被動 / 傷害公式）
   ════════════════════════════════════ */

export interface BattleContext {
  turn: number
  attacker: BattleHero
  target: BattleHero | null
  targets: BattleHero[]
  allAllies: BattleHero[]
  allEnemies: BattleHero[]
  damageDealt: number
  isKill: boolean
  isCrit: boolean
  isDodge: boolean
  /** on_attack 被動設定的傷害倍率修正（多個被動乘算） */
  damageMult?: number
}

/* ════════════════════════════════════
   傷害計算結果
   ════════════════════════════════════ */

export interface DamageResult {
  damage: number
  isCrit: boolean
  isDodge: boolean
  elementMult: number
  damageType: 'normal' | 'crit' | 'dot' | 'miss' | 'shield' | 'weakness'
  shieldAbsorbed: number
  reflectDamage: number
}

export interface HealResult {
  heal: number
  isCrit: boolean
}

/* ════════════════════════════════════
   能量配置
   ════════════════════════════════════ */

export interface EnergyConfig {
  maxEnergy: number
  onAttack: number
  onBeAttacked: number
  onKill: number
  perTurn: number
}

export const DEFAULT_ENERGY_CONFIG: EnergyConfig = {
  maxEnergy: 1000,
  onAttack: 200,
  onBeAttacked: 150,
  onKill: 100,
  perTurn: 50,
}

/* ════════════════════════════════════
   戰鬥動作（引擎 → 表現層的指令）
   ════════════════════════════════════ */

export type BattleAction =
  | { type: 'NORMAL_ATTACK'; attackerUid: string; targetUid: string; result: DamageResult; killed: boolean;
      /** 攻擊者能量快照（onAttack + onKill 後） */ _atkEnergyNew?: number;
      /** 受擊者能量快照（onBeAttacked 後） */ _tgtEnergyNew?: number }
  | { type: 'SKILL_CAST'; attackerUid: string; skillId: string; skillName: string;
      targets: Array<{ uid: string; result: DamageResult | HealResult; killed?: boolean }>;
      /** 攻擊者能量快照（消耗後，通常為 0） */ _atkEnergyNew?: number;
      /** 各受擊目標能量快照 uid→newValue */ _tgtEnergyMap?: Record<string, number> }
  | { type: 'DOT_TICK'; targetUid: string; dotType: StatusType; damage: number; sourceUid?: string }
  | { type: 'BUFF_APPLY'; targetUid: string; effect: StatusEffect }
  | { type: 'BUFF_EXPIRE'; targetUid: string; effectType: StatusType }
  | { type: 'DEATH'; targetUid: string }
  | { type: 'PASSIVE_TRIGGER'; heroUid: string; skillId: string; skillName: string }
  | { type: 'PASSIVE_DAMAGE'; attackerUid: string; targetUid: string; damage: number; killed: boolean }
  | { type: 'ENERGY_CHANGE'; heroUid: string; delta: number; newValue: number }
  | { type: 'EXTRA_TURN'; heroUid: string; reason: string }
  | { type: 'TURN_START'; turn: number }
  | { type: 'TURN_END'; turn: number }
  | { type: 'BATTLE_END'; winner: 'player' | 'enemy' | 'draw' }
