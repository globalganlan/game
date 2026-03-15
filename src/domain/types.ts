/**
 * Domain Types — 戰鬥系統核心型別
 *
 * 純型別定義，無任何 runtime 依賴。
 * 所有 domain 模組共用此檔案。
 */

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
  sourceEffectId?: string // v2.0: 來源 effectId（用於同源/異源判斷）
}

export interface Shield {
  value: number          // 剩餘護盾量
  duration: number       // 剩餘回合數
  sourceHeroId: string
}

/* ════════════════════════════════════
   技能系統
   ════════════════════════════════════ */

/** v2.0: 目標變更修飾（modify_target 被動效果） */
export interface TargetModifier {
  targetOverride: EffectTarget   // 新目標類型
  applyTo: 'normal' | 'active' | 'both'  // 影響哪種攻擊
  multiplier?: number            // 傷害修正（多目標降低倍率）
  sourceSkillId: string          // 來源被動 skillId
}

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

/** 效果目標類型（TargetType + trigger_source） */
export type EffectTarget = TargetType | 'trigger_source'

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
  // v2.0 新增觸發
  | 'on_normal_attack'
  | 'on_skill_cast'
  | 'on_ally_attacked'
  | 'hp_above_pct'
  | 'enemy_count_below'
  | 'ally_count_below'
  | 'has_status'

/** 效果觸發條件（含 immediate） */
export type EffectTrigger = 'immediate' | PassiveTrigger

/** 效果分類（19 種） */
export type EffectCategory =
  | 'damage' | 'dot' | 'heal' | 'buff' | 'debuff' | 'cc'
  | 'shield' | 'energy' | 'extra_turn' | 'counter_attack'
  | 'chase_attack' | 'revive' | 'dispel_debuff' | 'dispel_buff'
  | 'reflect' | 'steal_buff' | 'transfer_debuff' | 'execute'
  | 'modify_target'

/** 效果模板（對應 D1: effect_templates） */
export interface EffectTemplate {
  effectId: string
  name: string
  category: EffectCategory
  trigger: EffectTrigger
  triggerParam?: number | string
  triggerChance?: number     // 0~1, 預設 1.0
  triggerLimit?: number      // 每場觸發上限, 0=無限
  target: EffectTarget
  scalingStat?: keyof FinalStats
  multiplier?: number
  flatValue?: number
  hitCount?: number
  min?: number
  max?: number
  status?: StatusType
  statusChance?: number
  statusValue?: number
  statusDuration?: number
  statusMaxStacks?: number
  targetHpThreshold?: number
  perAlly?: boolean
  targetOverride?: EffectTarget   // modify_target 用
  applyTo?: 'normal' | 'active' | 'both'  // modify_target 用
}

/** 技能效果關聯（對應 D1: skill_effects） */
export interface SkillEffectLink {
  skillId: string
  effectId: string
  sortOrder: number
  overrideParams: string     // JSON
  dependsOn?: string         // 前置 effectId
  skillLevel: number         // 1~5
}

/** 解析後的效果（EffectTemplate + overrideParams 合併 + 依賴資訊） */
export interface ResolvedEffect extends EffectTemplate {
  dependsOnName?: string
}

/** 技能效果模組（一個技能可包含多個效果） */
export interface SkillEffect {
  type: 'damage' | 'heal' | 'buff' | 'debuff' | 'energy' | 'revive' | 'dispel_debuff' | 'extra_turn' | 'reflect' | 'damage_mult' | 'damage_mult_random' | 'random_debuff'
    | 'dispel_buff' | 'steal_buff' | 'transfer_debuff' | 'execute' | 'counter_attack' | 'chase_attack' | 'shield' | 'cc' | 'dot' | 'modify_target'
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
  dependsOn?: string              // v2.0: 前置效果 ID（命中才觸發後續）
  targetOverride?: EffectTarget   // v2.0: modify_target 用：新目標類型
  applyTo?: 'normal' | 'active' | 'both'  // v2.0: modify_target 用：影響哪種攻擊
}

/** 技能模板（對應 Google Sheet: skill_templates） */
export interface SkillTemplate {
  skillId: string
  name: string
  type: 'active' | 'passive'
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

  // v2.0: modify_target 目標變更修飾
  targetModifiers: TargetModifier[]

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
  /** 連鎖防護：當前為反擊中，不可再觸發反擊 */
  _isCounterAttack?: boolean
  /** 連鎖防護：當前為追擊中，不可再觸發追擊 */
  _isChaseAttack?: boolean
  /** triggerPassives 設定：目前觸發器名稱，用於 damage case 區分反擊/追擊 */
  _currentTrigger?: string
  /** on_ally_attacked 專用：記錄發動攻擊的敵方英雄（追擊目標） */
  _originalAttacker?: BattleHero
}

/* ════════════════════════════════════
   傷害計算結果
   ════════════════════════════════════ */

export interface DamageResult {
  damage: number
  isCrit: boolean
  isDodge: boolean
  damageType: 'normal' | 'crit' | 'dot' | 'miss' | 'shield'
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
  // v2.0 新增 action 類型
  | { type: 'COUNTER_ATTACK'; attackerUid: string; targetUid: string; damage: number; killed: boolean }
  | { type: 'CHASE_ATTACK'; attackerUid: string; targetUid: string; damage: number; killed: boolean }
  | { type: 'EXECUTE'; attackerUid: string; targetUid: string }
  | { type: 'STEAL_BUFF'; heroUid: string; targetUid: string; buffType: StatusType }
  | { type: 'TRANSFER_DEBUFF'; heroUid: string; targetUid: string; debuffType: StatusType }
  | { type: 'SHIELD_APPLY'; heroUid: string; targetUid: string; value: number }
  | { type: 'SHIELD_BREAK'; heroUid: string }
