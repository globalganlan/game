/**
 * battleEngine.ts — Cloudflare Workers 版戰鬥引擎
 * 從 gas/battleEngine.js 完整移植（1279 行 → TypeScript）
 *
 * 重要差異：
 * - 不再覆蓋全域 Math.random，改為傳入 rng 函式
 * - 所有函式為模組私有，只匯出 runBattle
 * - _currentExtraTurnQueue 改為傳入上下文
 */
import { createSeededRng } from '../utils/helpers.js';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface BattleHero {
  uid: string;
  heroId: number;
  side: 'player' | 'enemy';
  slot: number;
  currentHP: number;
  maxHP: number;
  energy: number;
  finalStats: {
    HP: number; ATK: number; DEF: number; SPD: number;
    CritRate: number; CritDmg: number;
    [key: string]: number;
  };
  statusEffects: StatusEffect[];
  shields: Shield[];
  passiveUsage: Record<string, number>;
  targetModifiers: { targetOverride: string; applyTo: string; multiplier?: number; sourceSkillId: string }[];
  activePassives: Passive[];
  passives?: Passive[];
  activeSkill: Skill | null;
  totalDamageDealt: number;
  totalHealingDone: number;
  killCount: number;
}

interface StatusEffect {
  type: string;
  value: number;
  hpValue?: number;  // DOT 專用：maxHP 百分比係數
  duration: number;
  stacks: number;
  maxStacks: number;
  sourceHeroId: string;
}

interface Shield {
  value: number;
  duration: number;
  sourceHeroId: string;
}

interface Passive {
  skillId: string;
  name: string;
  passiveTrigger: string;
  target?: string;
  description: string;
  effects: SkillEffect[];
}

interface Skill {
  skillId: string;
  name: string;
  target: string;
  effects: SkillEffect[];
}

interface SkillEffect {
  type: string;
  scalingStat?: string;
  multiplier?: number;
  flatValue?: number;
  status?: string;
  statusValue?: number;
  statusDuration?: number;
  statusChance?: number;
  statusMaxStacks?: number;
  min?: number;
  max?: number;
  perAlly?: boolean;
  targetHpThreshold?: number;
}

interface DamageResult {
  damage: number;
  isCrit: boolean;
  isDodge: boolean;
  damageType: string;
  shieldAbsorbed: number;
  reflectDamage: number;
}

interface BattleContext {
  turn: number;
  attacker: BattleHero;
  target: BattleHero | null;
  targets: BattleHero[];
  allAllies: BattleHero[];
  allEnemies: BattleHero[];
  damageDealt: number;
  isKill: boolean;
  isCrit: boolean;
  isDodge: boolean;
  damageMult?: number;
  /** triggerPassives 設定：目前觸發器名稱，用於 damage case 區分反擊/追擊 */
  _currentTrigger?: string;
  /** on_ally_attacked 專用：記錄發動攻擊的敵方英雄（追擊目標） */
  _originalAttacker?: BattleHero;
}

type EmitFn = (action: Record<string, unknown>) => void;
type RngFn = () => number;

// ═══════════════════════════════════════════════════════
// Energy System
// ═══════════════════════════════════════════════════════

const ENERGY_CONFIG = { maxEnergy: 1000, onAttack: 200, onBeAttacked: 150, onKill: 100, perTurn: 50 };

function addEnergy(hero: BattleHero, amount: number): number {
  const prev = hero.energy;
  hero.energy = Math.min(ENERGY_CONFIG.maxEnergy, hero.energy + amount);
  return hero.energy - prev;
}
function turnStartEnergy(hero: BattleHero) { return addEnergy(hero, ENERGY_CONFIG.perTurn); }
function onAttackEnergy(hero: BattleHero) { return addEnergy(hero, ENERGY_CONFIG.onAttack); }
function onBeAttackedEnergy(hero: BattleHero) { return hero.currentHP <= 0 ? 0 : addEnergy(hero, ENERGY_CONFIG.onBeAttacked); }
function onKillEnergy(hero: BattleHero) { return addEnergy(hero, ENERGY_CONFIG.onKill); }
function consumeEnergy(hero: BattleHero) { hero.energy = 0; }
function canCastUltimate(hero: BattleHero) {
  return hero.energy >= ENERGY_CONFIG.maxEnergy && hero.activeSkill != null && !isSilenced(hero);
}

// ═══════════════════════════════════════════════════════
// Buff System
// ═══════════════════════════════════════════════════════

const DOT_TYPES = ['dot_burn', 'dot_poison', 'dot_bleed'];
const CONTROL_TYPES = ['stun', 'freeze', 'silence', 'fear'];
const BUFF_TYPES = [
  'atk_up', 'def_up', 'spd_up', 'crit_rate_up', 'crit_dmg_up',
  'dmg_reduce', 'shield', 'regen', 'energy_boost', 'dodge_up', 'reflect', 'taunt',
];

function isDebuff(type: string) { return !BUFF_TYPES.includes(type) && type !== 'immunity' && type !== 'cleanse'; }

function applyStatus(target: BattleHero, effect: Omit<StatusEffect, 'stacks'>): boolean {
  if (isDebuff(effect.type) && hasStatus(target, 'immunity')) return false;
  const existing = target.statusEffects.find(s => s.type === effect.type);
  if (existing) {
    if (CONTROL_TYPES.includes(effect.type)) {
      existing.duration = Math.max(existing.duration, effect.duration);
      return true;
    }
    if (existing.stacks < existing.maxStacks) {
      existing.stacks++;
      existing.value += effect.value;
      if (effect.hpValue) existing.hpValue = (existing.hpValue || 0) + effect.hpValue;
    }
    existing.duration = Math.max(existing.duration, effect.duration);
    return true;
  }
  target.statusEffects.push({ ...effect, stacks: 1 } as StatusEffect);
  return true;
}

function cleanse(target: BattleHero, count = 1): string[] {
  const removed: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = target.statusEffects.findIndex(s => isDebuff(s.type));
    if (idx >= 0) {
      removed.push(target.statusEffects[idx].type);
      target.statusEffects.splice(idx, 1);
    }
  }
  return removed;
}

function getStatusValue(hero: BattleHero, type: string): number {
  return hero.statusEffects.filter(s => s.type === type).reduce((sum, s) => sum + s.value * s.stacks, 0);
}
function hasStatus(hero: BattleHero, type: string) { return hero.statusEffects.some(s => s.type === type); }
function isControlled(hero: BattleHero) { return hasStatus(hero, 'stun') || hasStatus(hero, 'freeze'); }
function isSilenced(hero: BattleHero) { return hasStatus(hero, 'silence'); }
function isFeared(hero: BattleHero) { return hasStatus(hero, 'fear'); }
function hasTaunt(hero: BattleHero) { return hasStatus(hero, 'taunt'); }

const DOT_POISON_HP_CAP = 100_000;
function processDotEffects(hero: BattleHero, allHeroes: BattleHero[]) {
  const results: Array<{ type: string; damage: number; sourceUid: string }> = [];
  for (const status of hero.statusEffects) {
    if (!DOT_TYPES.includes(status.type)) continue;
    const source = allHeroes.find(h => h.uid === status.sourceHeroId);
    // 統一 DOT 計算：ATK × value + min(maxHP, HP_CAP) × hpValue
    const sourceAtk = source?.finalStats.ATK ?? 0;
    const cappedHP = Math.min(hero.maxHP, DOT_POISON_HP_CAP);
    const atkDmg = Math.floor(sourceAtk * (status.value || 0));
    const hpDmg = Math.floor(cappedHP * (status.hpValue || 0));
    const dmg = atkDmg + hpDmg;
    if (dmg > 0) {
      hero.currentHP = Math.max(0, hero.currentHP - dmg);
      results.push({ type: status.type, damage: dmg, sourceUid: status.sourceHeroId });
    }
  }
  return results;
}

function processRegen(hero: BattleHero): number {
  let total = 0;
  for (const s of hero.statusEffects) {
    if (s.type !== 'regen') continue;
    // value 已包含疊層合計，不需再乘 stacks
    const heal = Math.floor(hero.maxHP * s.value);
    if (heal > 0) {
      const actual = Math.min(heal, hero.maxHP - hero.currentHP);
      hero.currentHP += actual;
      total += actual;
    }
  }
  return total;
}

function tickStatusDurations(hero: BattleHero): string[] {
  const expired: string[] = [];
  const permaSet = new Set(hero.statusEffects.filter(s => s.duration === 0));
  for (const s of hero.statusEffects) {
    if (s.duration > 0) {
      s.duration--;
      if (s.duration <= 0) expired.push(s.type);
    }
  }
  hero.statusEffects = hero.statusEffects.filter(s => s.duration > 0 || permaSet.has(s));
  return expired;
}

function tickShieldDurations(hero: BattleHero) {
  hero.shields = hero.shields
    .map(s => ({ value: s.value, duration: s.duration - 1, sourceHeroId: s.sourceHeroId }))
    .filter(s => s.duration > 0 && s.value > 0);
}

function getBuffedStats(hero: BattleHero) {
  const base = { ...hero.finalStats };
  base.ATK = Math.max(1, Math.floor(base.ATK * (1 + getStatusValue(hero, 'atk_up') - getStatusValue(hero, 'atk_down'))));
  base.DEF = Math.max(0, Math.floor(base.DEF * (1 + getStatusValue(hero, 'def_up') - getStatusValue(hero, 'def_down'))));
  base.SPD = Math.max(1, Math.floor(base.SPD * (1 + getStatusValue(hero, 'spd_up') - getStatusValue(hero, 'spd_down'))));
  base.CritRate = Math.max(0, Math.min(100, base.CritRate + getStatusValue(hero, 'crit_rate_up') * 100 - getStatusValue(hero, 'crit_rate_down') * 100));
  return base;
}

function absorbDamageByShields(hero: BattleHero, damage: number): [number, number] {
  let remaining = damage;
  let absorbed = 0;
  for (const s of hero.shields) {
    if (remaining <= 0) break;
    const absorb = Math.min(s.value, remaining);
    s.value -= absorb;
    remaining -= absorb;
    absorbed += absorb;
  }
  hero.shields = hero.shields.filter(s => s.value > 0);
  return [remaining, absorbed];
}

// ═══════════════════════════════════════════════════════
// Damage / Heal
// ═══════════════════════════════════════════════════════

function calculateDamage(rng: RngFn, attacker: BattleHero, target: BattleHero, skill?: SkillEffect): DamageResult {
  const atkStats = getBuffedStats(attacker);
  const defStats = getBuffedStats(target);

  // 0. 閃避
  const dodgeRate = Math.min(getStatusValue(target, 'dodge_up'), 0.75);
  if (rng() < dodgeRate) {
    return { damage: 0, isCrit: false, isDodge: true, damageType: 'miss', shieldAbsorbed: 0, reflectDamage: 0 };
  }

  // 1. 基礎傷害
  const scalingStat = skill?.scalingStat || 'ATK';
  const statValue = (atkStats as any)[scalingStat] ?? atkStats.ATK;
  const multiplier = skill?.multiplier ?? 1.0;
  const flatValue = skill?.flatValue ?? 0;
  let dmg = statValue * multiplier + flatValue;

  // 2. DEF 減傷
  const defReduction = 100 / (100 + Math.max(0, defStats.DEF));
  dmg *= defReduction;

  // 3. 暴擊
  const critRate = Math.min(atkStats.CritRate / 100, 1.0);
  const isCrit = rng() < critRate;
  if (isCrit) dmg *= (1 + atkStats.CritDmg / 100);

  // 4. (element system removed)

  // 5. 隨機浮動 ±5%
  dmg *= 0.95 + rng() * 0.10;

  // 6+7. 防守方修正
  let targetMult = 1.0;
  targetMult -= getStatusValue(target, 'dmg_reduce');
  if (hasStatus(target, 'fear')) targetMult *= 1.2;
  targetMult = Math.max(0.1, targetMult);
  dmg *= targetMult;

  // 8. 取整
  dmg = Math.max(1, Math.floor(dmg));

  // 9. 護盾
  const [actualDmg, shieldAbsorbed] = absorbDamageByShields(target, dmg);

  // 10. 反彈
  const reflectRate = getStatusValue(target, 'reflect');
  const reflectDamage = reflectRate > 0 ? Math.floor(actualDmg * reflectRate) : 0;

  let damageType = 'normal';
  if (isCrit) damageType = 'crit';
  if (shieldAbsorbed > 0 && actualDmg === 0) damageType = 'shield';

  return { damage: actualDmg, isCrit, isDodge: false, damageType, shieldAbsorbed, reflectDamage };
}

function calculateHeal(rng: RngFn, healer: BattleHero, target: BattleHero, skill: SkillEffect) {
  const healerStats = getBuffedStats(healer);
  const statValue = (healerStats as any)[skill.scalingStat || 'ATK'] ?? healerStats.ATK;
  let heal = statValue * (skill.multiplier ?? 1.0) + (skill.flatValue ?? 0);
  if (rng() < Math.min(healerStats.CritRate / 100, 1.0)) heal *= 1.5;
  heal = Math.min(Math.floor(heal), target.maxHP - target.currentHP);
  return { heal: Math.max(0, heal), isCrit: false };
}

// ═══════════════════════════════════════════════════════
// Target Strategy
// ═══════════════════════════════════════════════════════

const FRONT_INDICES = [0, 1, 2];
const BACK_INDICES = [3, 4, 5];
function slotColumn(slot: number) { return slot % 3; }

function pickByColumnProximity(candidates: BattleHero[], preferCol: number): BattleHero | null {
  const sameCol = candidates.find(c => slotColumn(c.slot) === preferCol);
  if (sameCol) return sameCol;
  candidates.sort((a, b) => Math.abs(slotColumn(a.slot) - preferCol) - Math.abs(slotColumn(b.slot) - preferCol));
  return candidates[0] ?? null;
}

function selectNormalAttackTarget(attacker: BattleHero, enemies: BattleHero[]): BattleHero | null {
  const alive = enemies.filter(e => e.currentHP > 0);
  if (!alive.length) return null;
  const taunters = alive.filter(e => hasTaunt(e));
  if (taunters.length) return taunters[0];
  const col = slotColumn(attacker.slot);
  const frontAlive = alive.filter(e => FRONT_INDICES.includes(e.slot));
  if (frontAlive.length) return pickByColumnProximity(frontAlive, col) ?? frontAlive[0];
  const backAlive = alive.filter(e => BACK_INDICES.includes(e.slot));
  if (backAlive.length) return pickByColumnProximity(backAlive, col) ?? backAlive[0];
  return alive[0];
}

function selectRandomEnemies(rng: RngFn, enemies: BattleHero[], count: number): BattleHero[] {
  if (!enemies.length) return [];
  const results: BattleHero[] = [];
  for (let i = 0; i < count; i++) results.push(enemies[Math.floor(rng() * enemies.length)]);
  return results;
}

function selectTargets(rng: RngFn, targetType: string, attacker: BattleHero, allies: BattleHero[], enemies: BattleHero[]): BattleHero[] {
  const aliveEnemies = enemies.filter(e => e.currentHP > 0);
  const aliveAllies = allies.filter(a => a.currentHP > 0);
  switch (targetType) {
    case 'single_enemy': { const t = selectNormalAttackTarget(attacker, aliveEnemies); return t ? [t] : []; }
    case 'all_enemies': return aliveEnemies;
    case 'random_enemies_3': return selectRandomEnemies(rng, aliveEnemies, 3);
    case 'front_row_enemies': { const f = aliveEnemies.filter(e => FRONT_INDICES.includes(e.slot)); return f.length ? f : aliveEnemies.filter(e => BACK_INDICES.includes(e.slot)); }
    case 'back_row_enemies': { const b = aliveEnemies.filter(e => BACK_INDICES.includes(e.slot)); return b.length ? b : aliveEnemies.filter(e => FRONT_INDICES.includes(e.slot)); }
    case 'single_ally': { if (!aliveAllies.length) return []; return [aliveAllies.slice().sort((a, b) => (a.currentHP / a.maxHP) - (b.currentHP / b.maxHP))[0]]; }
    case 'all_allies': return aliveAllies;
    case 'self': return [attacker];
    default: {
      const m = targetType.match(/^random_enemies_(\d+)$/);
      if (m) return selectRandomEnemies(rng, aliveEnemies, parseInt(m[1]));
      const fb = selectNormalAttackTarget(attacker, aliveEnemies);
      return fb ? [fb] : [];
    }
  }
}

// ═══════════════════════════════════════════════════════
// Battle Engine Core
// ═══════════════════════════════════════════════════════

function makeContext(turn: number, actor: BattleHero, allHeroes: BattleHero[], target?: BattleHero, isKill = false): BattleContext {
  return {
    turn, attacker: actor, target: target ?? null, targets: target ? [target] : [],
    allAllies: allHeroes.filter(h => h.side === actor.side),
    allEnemies: allHeroes.filter(h => h.side !== actor.side),
    damageDealt: 0, isKill, isCrit: false, isDodge: false,
  };
}

function getMaxUsage(passive: Passive): number {
  if (passive.skillId === 'PAS_1_4') return 2;
  if (passive.passiveTrigger === 'on_lethal') return 1;
  return 999999;
}

function resolvePassiveTargets(hero: BattleHero, effectType: string, passiveTarget: string, context: BattleContext): BattleHero[] {
  switch (passiveTarget) {
    case 'all_allies': return context.allAllies.filter(h => h.side === hero.side && h.currentHP > 0);
    case 'all_enemies': return context.allEnemies.filter(h => h.side !== hero.side && h.currentHP > 0);
    case 'self':
    default:
      if (effectType === 'debuff' && context.target && context.target.currentHP > 0) return [context.target];
      return [hero];
  }
}

function executePassiveEffect(
  rng: RngFn, hero: BattleHero, effect: SkillEffect, context: BattleContext,
  emit: EmitFn, extraTurnQueue: string[]
): boolean {
  const chance = effect.statusChance ?? 1.0;
  if (rng() > chance) return false;

  const ownerPassive = hero.activePassives.find(p => p.effects?.includes(effect));
  const passiveTargetType = ownerPassive?.target ?? 'self';

  switch (effect.type) {
    case 'buff':
    case 'debuff': {
      if (!effect.status) return false;
      const targets = resolvePassiveTargets(hero, effect.type, passiveTargetType, context);
      let effectValue = effect.statusValue ?? 0;
      if (effect.perAlly) {
        const aliveAllies = context.allAllies.filter(h => h.side === hero.side && h.currentHP > 0).length;
        effectValue *= aliveAllies;
      }
      for (const t of targets) {
        const isDot = effect.status!.startsWith('dot_');
        applyStatus(t, {
          type: effect.status, value: effectValue,
          ...(isDot && effect.multiplier ? { hpValue: effect.multiplier } : {}),
          duration: effect.statusDuration ?? 0, maxStacks: effect.statusMaxStacks ?? 1,
          sourceHeroId: hero.uid,
        });
      }
      return true;
    }
    case 'heal': {
      const healTargets = resolvePassiveTargets(hero, 'buff', passiveTargetType, context);
      for (const ht of healTargets) {
        if (ht.currentHP <= 0) continue;
        const scalingStat = effect.scalingStat ?? 'HP';
        const base = (ht.finalStats as any)[scalingStat] ?? ht.maxHP;
        const healAmt = Math.floor(base * (effect.multiplier ?? 0.1) + (effect.flatValue ?? 0));
        const actual = Math.min(healAmt, ht.maxHP - ht.currentHP);
        ht.currentHP += actual;
        hero.totalHealingDone += actual;
      }
      return true;
    }
    case 'energy': {
      const energyTargets = resolvePassiveTargets(hero, 'buff', passiveTargetType, context);
      for (const et of energyTargets) { if (et.currentHP > 0) addEnergy(et, effect.flatValue ?? 0); }
      return true;
    }
    case 'dispel_debuff':
      cleanse(hero, 1);
      return true;
    case 'damage_mult': {
      if (effect.targetHpThreshold != null && context.target) {
        const targetHpPct = context.target.currentHP / context.target.maxHP;
        if (targetHpPct >= effect.targetHpThreshold) return false;
      }
      context.damageMult = (context.damageMult ?? 1.0) * (effect.multiplier ?? 1.0);
      return true;
    }
    case 'reflect':
      applyStatus(hero, { type: 'reflect', value: effect.multiplier ?? 0.15, duration: 0, maxStacks: 1, sourceHeroId: hero.uid });
      return true;
    case 'damage_mult_random': {
      const min = effect.min ?? 0.5;
      const max = effect.max ?? 1.8;
      context.damageMult = (context.damageMult ?? 1.0) * (min + rng() * (max - min));
      return true;
    }
    case 'damage': {
      const trigger = context._currentTrigger;
      let actualTarget: BattleHero | null = context.target;
      let actionType: string = 'PASSIVE_DAMAGE';
      if (trigger === 'on_be_attacked') {
        actualTarget = context.attacker;
        actionType = 'COUNTER_ATTACK';
      } else if (trigger === 'on_ally_skill' || trigger === 'on_ally_attacked') {
        if (trigger === 'on_ally_attacked' && context._originalAttacker) {
          actualTarget = context._originalAttacker;
        }
        actionType = 'CHASE_ATTACK';
      }
      if (actualTarget && actualTarget.currentHP > 0 && actualTarget.uid !== hero.uid) {
        const dmg = calculateDamage(rng, hero, actualTarget, effect);
        if (!dmg.isDodge) {
          actualTarget.currentHP = Math.max(0, actualTarget.currentHP - dmg.damage);
          hero.totalDamageDealt += dmg.damage;
          const killed = actualTarget.currentHP <= 0;
          emit({ type: actionType, attackerUid: hero.uid, targetUid: actualTarget.uid, damage: dmg.damage, killed });
          if (killed) { emit({ type: 'DEATH', targetUid: actualTarget.uid }); hero.killCount++; }
        }
      }
      return true;
    }
    case 'revive':
      return true;
    case 'extra_turn': extraTurnQueue.push(hero.uid); return true;
    case 'cc': {
      if (!effect.status) return false;
      const ccTargets = resolvePassiveTargets(hero, 'debuff', passiveTargetType, context);
      for (const t of ccTargets) {
        applyStatus(t, {
          type: effect.status, value: effect.statusValue ?? 0,
          duration: effect.statusDuration ?? 1, maxStacks: 1,
          sourceHeroId: hero.uid,
        });
      }
      return true;
    }
    case 'dot': {
      if (!effect.status) return false;
      const dotTargets = resolvePassiveTargets(hero, 'debuff', passiveTargetType, context);
      for (const t of dotTargets) {
        const isDot = effect.status.startsWith('dot_');
        applyStatus(t, {
          type: effect.status, value: effect.statusValue ?? 0.3,
          ...(isDot && effect.multiplier ? { hpValue: effect.multiplier } : {}),
          duration: effect.statusDuration ?? 2, maxStacks: effect.statusMaxStacks ?? 3,
          sourceHeroId: hero.uid,
        });
      }
      return true;
    }
    case 'random_debuff': {
      const debuffPool: string[] = ['atk_down', 'def_down', 'spd_down', 'silence'];
      const randomDebuff = debuffPool[Math.floor(rng() * debuffPool.length)];
      const debuffTargets = resolvePassiveTargets(hero, 'debuff', passiveTargetType, context);
      for (const t of debuffTargets) {
        applyStatus(t, {
          type: randomDebuff, value: effect.statusValue ?? 0.15,
          duration: effect.statusDuration ?? 1, maxStacks: 1,
          sourceHeroId: hero.uid,
        });
      }
      return true;
    }
    default: return false;
  }
}

function triggerPassives(
  rng: RngFn, hero: BattleHero, trigger: string, context: BattleContext,
  emit: EmitFn, extraTurnQueue: string[]
) {
  if (hero.currentHP <= 0) return;
  // 記錄目前觸發器，讓 executePassiveEffect 的 damage case 判斷反擊/追擊
  context._currentTrigger = trigger;
  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== trigger) continue;
    const usageKey = passive.skillId;
    const usageCount = hero.passiveUsage[usageKey] || 0;
    if (trigger === 'on_lethal' && usageCount >= getMaxUsage(passive)) continue;
    let anyEffectApplied = false;
    for (const eff of passive.effects) {
      if (executePassiveEffect(rng, hero, eff, context, emit, extraTurnQueue)) anyEffectApplied = true;
    }
    if (!anyEffectApplied) continue;
    hero.passiveUsage[usageKey] = usageCount + 1;
    emit({ type: 'PASSIVE_TRIGGER', heroUid: hero.uid, skillId: passive.skillId, skillName: passive.name });
  }
}

function checkHpBelowPassives(
  rng: RngFn, hero: BattleHero, turn: number, allHeroes: BattleHero[],
  emit: EmitFn, extraTurnQueue: string[]
) {
  if (hero.currentHP <= 0) return;
  const hpPct = hero.currentHP / hero.maxHP;
  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== 'hp_below_pct') continue;
    let threshold = 0.30;
    if (passive.description.includes('15%')) threshold = 0.15;
    else if (passive.description.includes('50%')) threshold = 0.50;
    if (hpPct < threshold) {
      const usageKey = passive.skillId + '_hp_below';
      if (hero.passiveUsage[usageKey]) continue;
      let anyApplied = false;
      for (const eff of passive.effects) {
        if (executePassiveEffect(rng, hero, eff, makeContext(turn, hero, allHeroes), emit, extraTurnQueue)) anyApplied = true;
      }
      if (!anyApplied) continue;
      hero.passiveUsage[usageKey] = 1;
      emit({ type: 'PASSIVE_TRIGGER', heroUid: hero.uid, skillId: passive.skillId, skillName: passive.name });
    }
  }
}

function executeNormalAttack(
  rng: RngFn, attacker: BattleHero, allies: BattleHero[], enemies: BattleHero[],
  turn: number, allHeroes: BattleHero[], emit: EmitFn, extraTurnQueue: string[]
) {
  const target = selectNormalAttackTarget(attacker, enemies);
  if (!target) return;
  const ctx = makeContext(turn, attacker, allHeroes, target);
  triggerPassives(rng, attacker, 'on_attack', ctx, emit, extraTurnQueue);
  const result = calculateDamage(rng, attacker, target);
  if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
    result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult));
  }
  let killed = false;
  let _atkEnergyNew: number | undefined;
  let _tgtEnergyNew: number | undefined;
  if (!result.isDodge) {
    target.currentHP = Math.max(0, target.currentHP - result.damage);
    attacker.totalDamageDealt += result.damage;
    killed = target.currentHP <= 0;
    if (result.reflectDamage > 0) attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage);
    if (onAttackEnergy(attacker) > 0) _atkEnergyNew = attacker.energy;
    if (!killed && onBeAttackedEnergy(target) > 0) _tgtEnergyNew = target.energy;
    if (killed) { attacker.killCount++; onKillEnergy(attacker); _atkEnergyNew = attacker.energy; }
  }
  emit({ type: 'NORMAL_ATTACK', attackerUid: attacker.uid, targetUid: target.uid, result, killed, _atkEnergyNew, _tgtEnergyNew });
  if (!result.isDodge) {
    if (!killed) {
      triggerPassives(rng, target, 'on_be_attacked', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
      triggerPassives(rng, target, 'on_take_damage', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
      // v2.9: 觸發被攻擊者隊友的 on_ally_attacked 被動
      const attackedSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0);
      for (const ally of attackedSideAllies) {
        const allyCtx = makeContext(turn, ally, allHeroes, target);
        allyCtx._originalAttacker = attacker;
        triggerPassives(rng, ally, 'on_ally_attacked', allyCtx, emit, extraTurnQueue);
      }
    }
    if (result.isCrit) triggerPassives(rng, attacker, 'on_crit', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
    if (killed) {
      triggerPassives(rng, attacker, 'on_kill', makeContext(turn, attacker, allHeroes, target, true), emit, extraTurnQueue);
      const deadSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0);
      for (const ally of deadSideAllies) {
        triggerPassives(rng, ally, 'on_ally_death', makeContext(turn, ally, allHeroes, target), emit, extraTurnQueue);
      }
    }
  } else {
    triggerPassives(rng, target, 'on_dodge', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
  }
  checkHpBelowPassives(rng, attacker, turn, allHeroes, emit, extraTurnQueue);
  checkHpBelowPassives(rng, target, turn, allHeroes, emit, extraTurnQueue);
}

function executeSkill(
  rng: RngFn, attacker: BattleHero, skill: Skill, allies: BattleHero[], enemies: BattleHero[],
  turn: number, allHeroes: BattleHero[], emit: EmitFn, extraTurnQueue: string[]
) {
  const targets = selectTargets(rng, skill.target, attacker, allies, enemies);
  if (!targets.length) return;
  const ctx = makeContext(turn, attacker, allHeroes, targets[0]);
  triggerPassives(rng, attacker, 'on_attack', ctx, emit, extraTurnQueue);
  const skillResults: unknown[] = [];
  const _tgtEnergyMap: Record<string, number> = {};

  for (const effect of skill.effects) {
    for (const target of targets) {
      if (target.currentHP <= 0 && effect.type === 'damage') continue;
      switch (effect.type) {
        case 'damage': {
          const result = calculateDamage(rng, attacker, target, effect);
          if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
            result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult));
          }
          let killed = false;
          if (!result.isDodge) {
            target.currentHP = Math.max(0, target.currentHP - result.damage);
            attacker.totalDamageDealt += result.damage;
            killed = target.currentHP <= 0;
            if (result.reflectDamage > 0) attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage);
            if (!killed) {
              if (onBeAttackedEnergy(target) > 0) _tgtEnergyMap[target.uid] = target.energy;
              triggerPassives(rng, target, 'on_be_attacked', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
              triggerPassives(rng, target, 'on_take_damage', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
              // v2.9: 觸發被攻擊者隊友的 on_ally_attacked 被動
              const attackedSideAllies = allHeroes.filter(h => h.side === target.side && h.uid !== target.uid && h.currentHP > 0);
              for (const ally of attackedSideAllies) {
                const allyCtx = makeContext(turn, ally, allHeroes, target);
                allyCtx._originalAttacker = attacker;
                triggerPassives(rng, ally, 'on_ally_attacked', allyCtx, emit, extraTurnQueue);
              }
            }
            if (killed) { attacker.killCount++; onKillEnergy(attacker); triggerPassives(rng, attacker, 'on_kill', makeContext(turn, attacker, allHeroes, target, true), emit, extraTurnQueue); }
            if (result.isCrit) triggerPassives(rng, attacker, 'on_crit', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
          } else {
            triggerPassives(rng, target, 'on_dodge', makeContext(turn, attacker, allHeroes, target), emit, extraTurnQueue);
          }
          skillResults.push({ uid: target.uid, result, killed });
          break;
        }
        case 'heal': {
          const hr = calculateHeal(rng, attacker, target, effect);
          target.currentHP = Math.min(target.maxHP, target.currentHP + hr.heal);
          attacker.totalHealingDone += hr.heal;
          skillResults.push({ uid: target.uid, result: hr });
          break;
        }
        case 'buff': case 'debuff': {
          const chance = effect.statusChance ?? 1.0;
          if (rng() < chance && effect.status) {
            const isDot = effect.status.startsWith('dot_');
            const success = applyStatus(target, {
              type: effect.status, value: effect.statusValue ?? 0,
              ...(isDot && effect.multiplier ? { hpValue: effect.multiplier } : {}),
              duration: effect.statusDuration ?? 2, maxStacks: effect.statusMaxStacks ?? 1,
              sourceHeroId: attacker.uid,
            });
            if (success) {
              emit({ type: 'BUFF_APPLY', targetUid: target.uid, effect: {
                type: effect.status, value: effect.statusValue ?? 0,
                duration: effect.statusDuration ?? 2, stacks: 1,
                maxStacks: effect.statusMaxStacks ?? 1, sourceHeroId: attacker.uid,
              }});
            }
          }
          break;
        }
        case 'energy': addEnergy(target, effect.flatValue ?? 0); break;
        case 'cc':
        case 'dot': {
          const dotChance = effect.statusChance ?? 1.0;
          if (rng() < dotChance && effect.status) {
            const isDot = effect.status.startsWith('dot_');
            const success = applyStatus(target, {
              type: effect.status, value: effect.statusValue ?? 0,
              ...(isDot && effect.multiplier ? { hpValue: effect.multiplier } : {}),
              duration: effect.statusDuration ?? 2, maxStacks: effect.statusMaxStacks ?? 1,
              sourceHeroId: attacker.uid,
            });
            if (success) {
              emit({ type: 'BUFF_APPLY', targetUid: target.uid, effect: {
                type: effect.status, value: effect.statusValue ?? 0,
                duration: effect.statusDuration ?? 2, stacks: 1,
                maxStacks: effect.statusMaxStacks ?? 1, sourceHeroId: attacker.uid,
              }});
            }
          }
          break;
        }
        case 'dispel_debuff': cleanse(target, 1); break;
        default: break;
      }
    }
  }
  consumeEnergy(attacker);
  emit({ type: 'SKILL_CAST', attackerUid: attacker.uid, skillId: skill.skillId, skillName: skill.name, targets: skillResults, _atkEnergyNew: attacker.energy, _tgtEnergyMap: Object.keys(_tgtEnergyMap).length ? _tgtEnergyMap : undefined });
  // v2.9: 觸發隊友的 on_ally_skill 被動
  const firstEnemyTarget = targets.find(t => t.side !== attacker.side && t.currentHP > 0) ?? null;
  const allySkillAllies = allHeroes.filter(h => h.side === attacker.side && h.uid !== attacker.uid && h.currentHP > 0);
  for (const ally of allySkillAllies) {
    triggerPassives(rng, ally, 'on_ally_skill', makeContext(turn, ally, allHeroes, firstEnemyTarget!), emit, extraTurnQueue);
  }
  for (const t of targets) checkHpBelowPassives(rng, t, turn, allHeroes, emit, extraTurnQueue);
  checkHpBelowPassives(rng, attacker, turn, allHeroes, emit, extraTurnQueue);
}

function processInterruptUltimates(
  rng: RngFn, players: BattleHero[], enemies: BattleHero[],
  turn: number, allHeroes: BattleHero[], emit: EmitFn,
  alreadyActedUids: Record<string, boolean>, extraTurnQueue: string[]
) {
  let count = 0;
  let found = true;
  while (found && count < 20) {
    found = false;
    const candidates = allHeroes
      .filter(h => h.currentHP > 0 && canCastUltimate(h) && !alreadyActedUids[h.uid])
      .sort((a, b) => {
        const d = getBuffedStats(b).SPD - getBuffedStats(a).SPD;
        if (d !== 0) return d;
        return a.side === 'player' ? -1 : 1;
      });
    for (const hero of candidates) {
      if (hero.currentHP <= 0 || !canCastUltimate(hero)) continue;
      const allies = hero.side === 'player' ? players : enemies;
      const foes = hero.side === 'player' ? enemies : players;
      executeSkill(rng, hero, hero.activeSkill!, allies, foes, turn, allHeroes, emit, extraTurnQueue);
      alreadyActedUids[hero.uid] = true;
      found = true;
      count++;
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return;
      break;
    }
  }
}

function processExtraTurns(
  rng: RngFn, extraTurnQueue: string[], extraTurnUsed: Record<string, boolean>,
  players: BattleHero[], enemies: BattleHero[],
  turn: number, allHeroes: BattleHero[], emit: EmitFn
) {
  let processed = 0;
  while (extraTurnQueue.length > 0 && processed < 10) {
    const uid = extraTurnQueue.shift()!;
    processed++;
    if (extraTurnUsed[uid]) continue;
    const hero = allHeroes.find(h => h.uid === uid);
    if (!hero || hero.currentHP <= 0) continue;
    extraTurnUsed[uid] = true;
    const heroAllies = hero.side === 'player' ? players : enemies;
    const heroFoes = hero.side === 'player' ? enemies : players;
    emit({ type: 'EXTRA_TURN', heroUid: uid, reason: 'extra_turn' });
    processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
    if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return;
    if (hero.currentHP <= 0) continue;
    if (isControlled(hero) || isFeared(hero)) continue;
    executeNormalAttack(rng, hero, heroAllies, heroFoes, turn, allHeroes, emit, extraTurnQueue);
    processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
    if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) return;
  }
}

// ═══════════════════════════════════════════════════════
// 主引擎
// ═══════════════════════════════════════════════════════

function runBattleEngine(rng: RngFn, players: BattleHero[], enemies: BattleHero[], maxTurns = 50) {
  const actions: Record<string, unknown>[] = [];
  const allHeroes = [...players, ...enemies];
  const emit: EmitFn = (a) => actions.push(a);

  // 補齊欄位
  for (const hero of allHeroes) {
    hero.statusEffects ??= [];
    hero.shields ??= [];
    hero.passiveUsage ??= {};
    hero.targetModifiers ??= [];
    hero.activePassives ??= hero.passives?.slice() ?? [];
    hero.totalDamageDealt ??= 0;
    hero.totalHealingDone ??= 0;
    hero.killCount ??= 0;
  }

  // battle_start 被動
  for (const h of allHeroes) {
    if (h.currentHP <= 0) continue;
    triggerPassives(rng, h, 'always', makeContext(0, h, allHeroes), emit, []);
    triggerPassives(rng, h, 'battle_start', makeContext(0, h, allHeroes), emit, []);
  }

  for (let turn = 1; turn <= maxTurns; turn++) {
    emit({ type: 'TURN_START', turn });
    const alivePlayers = players.filter(p => p.currentHP > 0);
    const aliveEnemies = enemies.filter(e => e.currentHP > 0);
    if (!alivePlayers.length || !aliveEnemies.length) break;

    const actors = [...alivePlayers, ...aliveEnemies].sort((a, b) => {
      const d = getBuffedStats(b).SPD - getBuffedStats(a).SPD;
      if (d !== 0) return d;
      if (a.slot !== b.slot) return a.slot - b.slot;
      return a.side === 'player' ? -1 : 1;
    });

    const extraTurnUsed: Record<string, boolean> = {};
    const extraTurnQueue: string[] = [];

    for (const actor of actors) {
      if (actor.currentHP <= 0) continue;
      const allies = actor.side === 'player' ? players : enemies;
      const foes = actor.side === 'player' ? enemies : players;

      const eDelta = turnStartEnergy(actor);
      if (eDelta > 0) emit({ type: 'ENERGY_CHANGE', heroUid: actor.uid, delta: eDelta, newValue: actor.energy });

      const dotResults = processDotEffects(actor, allHeroes);
      for (const dr of dotResults) emit({ type: 'DOT_TICK', targetUid: actor.uid, dotType: dr.type, damage: dr.damage, sourceUid: dr.sourceUid });
      if (actor.currentHP <= 0) { emit({ type: 'DEATH', targetUid: actor.uid }); continue; }

      processRegen(actor);
      triggerPassives(rng, actor, 'turn_start', makeContext(turn, actor, allHeroes), emit, extraTurnQueue);

      // every_n_turns
      for (const p of actor.activePassives) {
        if (p.passiveTrigger !== 'every_n_turns') continue;
        const n = (p.description.includes('每 2') || p.description.includes('每2')) ? 2 : 3;
        if (turn % n === 0) {
          let anyApplied = false;
          for (const eff of p.effects) { if (executePassiveEffect(rng, actor, eff, makeContext(turn, actor, allHeroes), emit, extraTurnQueue)) anyApplied = true; }
          if (anyApplied) emit({ type: 'PASSIVE_TRIGGER', heroUid: actor.uid, skillId: p.skillId, skillName: p.name });
        }
      }

      processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break;
      if (actor.currentHP <= 0) continue;

      if (isControlled(actor) || isFeared(actor)) continue;
      executeNormalAttack(rng, actor, allies, foes, turn, allHeroes, emit, extraTurnQueue);
      processInterruptUltimates(rng, players, enemies, turn, allHeroes, emit, {}, extraTurnQueue);
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break;

      processExtraTurns(rng, extraTurnQueue, extraTurnUsed, players, enemies, turn, allHeroes, emit);
      if (players.every(p => p.currentHP <= 0) || enemies.every(e => e.currentHP <= 0)) break;
    }

    // 回合結束
    for (const h of allHeroes) {
      if (h.currentHP <= 0) continue;
      const expired = tickStatusDurations(h);
      for (const e of expired) emit({ type: 'BUFF_EXPIRE', targetUid: h.uid, effectType: e });
      tickShieldDurations(h);
      const hpBefore = h.currentHP;
      triggerPassives(rng, h, 'turn_end', makeContext(turn, h, allHeroes), emit, extraTurnQueue);
      if (hpBefore > 0 && h.currentHP <= 0) emit({ type: 'DEATH', targetUid: h.uid });
    }

    emit({ type: 'TURN_END', turn });
    if (players.every(p => p.currentHP <= 0)) { emit({ type: 'BATTLE_END', winner: 'enemy' }); return { winner: 'enemy' as const, actions }; }
    if (enemies.every(e => e.currentHP <= 0)) { emit({ type: 'BATTLE_END', winner: 'player' }); return { winner: 'player' as const, actions }; }
  }

  if (players.every(p => p.currentHP <= 0)) { emit({ type: 'BATTLE_END', winner: 'enemy' }); return { winner: 'enemy' as const, actions }; }
  if (enemies.every(e => e.currentHP <= 0)) { emit({ type: 'BATTLE_END', winner: 'player' }); return { winner: 'player' as const, actions }; }
  emit({ type: 'BATTLE_END', winner: 'draw' });
  return { winner: 'draw' as const, actions };
}

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

export function runBattle(
  players: BattleHero[], enemies: BattleHero[],
  maxTurns = 50, seed?: number
) {
  const rng = seed != null ? createSeededRng(seed) : Math.random;
  const clonedP = JSON.parse(JSON.stringify(players)) as BattleHero[];
  const clonedE = JSON.parse(JSON.stringify(enemies)) as BattleHero[];
  const result = runBattleEngine(rng, clonedP, clonedE, maxTurns);
  return { ...result, finalPlayers: clonedP, finalEnemies: clonedE };
}


