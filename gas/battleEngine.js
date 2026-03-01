/**
 * battleEngine.js — GAS 後端戰鬥引擎
 *
 * 從 src/domain/ 移植的純邏輯戰鬥引擎（JavaScript 版本）。
 * 接收前端已建構好的 BattleHero[] 陣列，執行完整戰鬥，
 * 回傳 { winner, actions[] } 供前端播放動畫。
 *
 * 移植來源：
 * - src/domain/battleEngine.ts
 * - src/domain/damageFormula.ts
 * - src/domain/buffSystem.ts
 * - src/domain/energySystem.ts
 * - src/domain/targetStrategy.ts
 * - src/domain/elementSystem.ts
 */

// ═══════════════════════════════════════════════════════
// Seeded PRNG — Mulberry32（反作弊用確定性隨機數）
// ═══════════════════════════════════════════════════════

/**
 * 建立 Mulberry32 偽隨機數產生器（與前端 seededRng.ts 完全相同）
 * @param {number} seed - 32-bit 整數種子
 * @returns {function(): number} 回傳 [0, 1) 的浮點數
 */
function createSeededRng_(seed) {
  var state = seed | 0;
  return function() {
    state = (state + 0x6D2B79F5) | 0;
    var t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════
// Element System（屬性剋制）
// ═══════════════════════════════════════════════════════

var ELEMENT_MATRIX_ = {
  fire:    { fire: 0.9, water: 0.7, wind: 1.3, thunder: 1.0, earth: 1.0, light: 1.0, dark: 1.0 },
  water:   { fire: 1.3, water: 0.9, wind: 1.0, thunder: 0.7, earth: 1.0, light: 1.0, dark: 1.0 },
  wind:    { fire: 0.7, water: 1.0, wind: 0.9, thunder: 1.0, earth: 1.3, light: 1.0, dark: 1.0 },
  thunder: { fire: 1.0, water: 1.3, wind: 1.0, thunder: 0.9, earth: 0.7, light: 1.0, dark: 1.0 },
  earth:   { fire: 1.0, water: 1.0, wind: 0.7, thunder: 1.3, earth: 0.9, light: 1.0, dark: 1.0 },
  light:   { fire: 1.0, water: 1.0, wind: 1.0, thunder: 1.0, earth: 1.0, light: 0.9, dark: 1.3 },
  dark:    { fire: 1.0, water: 1.0, wind: 1.0, thunder: 1.0, earth: 1.0, light: 1.3, dark: 0.9 },
};

function getElementMultiplier_(atk, def) {
  if (!atk || !def) return 1.0;
  return (ELEMENT_MATRIX_[atk] && ELEMENT_MATRIX_[atk][def]) || 1.0;
}

function isWeakness_(atk, def) {
  if (!atk || !def) return false;
  return getElementMultiplier_(atk, def) > 1.0;
}

// ═══════════════════════════════════════════════════════
// Energy System（能量系統）
// ═══════════════════════════════════════════════════════

var ENERGY_CONFIG_ = {
  maxEnergy: 1000,
  onAttack: 200,
  onBeAttacked: 150,
  onKill: 100,
  perTurn: 50,
};

function addEnergy_(hero, amount) {
  var prev = hero.energy;
  hero.energy = Math.min(ENERGY_CONFIG_.maxEnergy, hero.energy + amount);
  return hero.energy - prev;
}

function turnStartEnergy_(hero) {
  return addEnergy_(hero, ENERGY_CONFIG_.perTurn);
}

function onAttackEnergy_(hero) {
  return addEnergy_(hero, ENERGY_CONFIG_.onAttack);
}

function onBeAttackedEnergy_(hero) {
  if (hero.currentHP <= 0) return 0;
  return addEnergy_(hero, ENERGY_CONFIG_.onBeAttacked);
}

function onKillEnergy_(hero) {
  return addEnergy_(hero, ENERGY_CONFIG_.onKill);
}

function consumeEnergy_(hero) {
  hero.energy = 0;
}

function canCastUltimate_(hero) {
  return hero.energy >= ENERGY_CONFIG_.maxEnergy &&
    hero.activeSkill != null &&
    !isSilenced_(hero);
}

// ═══════════════════════════════════════════════════════
// Buff System（增益減益系統）
// ═══════════════════════════════════════════════════════

var DOT_TYPES_ = ['dot_burn', 'dot_poison', 'dot_bleed'];
var CONTROL_TYPES_ = ['stun', 'freeze', 'silence', 'fear'];
var BUFF_TYPES_ = [
  'atk_up', 'def_up', 'spd_up', 'crit_rate_up', 'crit_dmg_up',
  'dmg_reduce', 'shield', 'regen', 'energy_boost',
  'dodge_up', 'reflect', 'taunt',
];

// 額外行動佇列（同步運行中由 runBattleEngine_ 設定）
var _currentExtraTurnQueue_ = null;

function isDebuff_(type) {
  return BUFF_TYPES_.indexOf(type) < 0 && type !== 'immunity' && type !== 'cleanse';
}

function applyStatus_(target, effect) {
  if (isDebuff_(effect.type) && hasStatus_(target, 'immunity')) return false;

  var existing = null;
  for (var i = 0; i < target.statusEffects.length; i++) {
    if (target.statusEffects[i].type === effect.type) { existing = target.statusEffects[i]; break; }
  }

  if (existing) {
    if (CONTROL_TYPES_.indexOf(effect.type) >= 0) {
      existing.duration = Math.max(existing.duration, effect.duration);
      return true;
    }
    if (existing.stacks < existing.maxStacks) {
      existing.stacks++;
      existing.value += effect.value;
    }
    existing.duration = Math.max(existing.duration, effect.duration);
    return true;
  }

  target.statusEffects.push({
    type: effect.type,
    value: effect.value,
    duration: effect.duration,
    stacks: 1,
    maxStacks: effect.maxStacks || 1,
    sourceHeroId: effect.sourceHeroId || '',
  });
  return true;
}

function removeStatus_(target, type) {
  target.statusEffects = target.statusEffects.filter(function(s) { return s.type !== type; });
}

function cleanse_(target, count) {
  count = count || 1;
  var removed = [];
  for (var i = 0; i < count; i++) {
    var idx = -1;
    for (var j = 0; j < target.statusEffects.length; j++) {
      if (isDebuff_(target.statusEffects[j].type)) { idx = j; break; }
    }
    if (idx >= 0) {
      removed.push(target.statusEffects[idx].type);
      target.statusEffects.splice(idx, 1);
    }
  }
  return removed;
}

function getStatusValue_(hero, type) {
  var total = 0;
  for (var i = 0; i < hero.statusEffects.length; i++) {
    var s = hero.statusEffects[i];
    if (s.type === type) total += s.value * s.stacks;
  }
  return total;
}

function hasStatus_(hero, type) {
  for (var i = 0; i < hero.statusEffects.length; i++) {
    if (hero.statusEffects[i].type === type) return true;
  }
  return false;
}

function isControlled_(hero) {
  return hasStatus_(hero, 'stun') || hasStatus_(hero, 'freeze');
}

function isSilenced_(hero) {
  return hasStatus_(hero, 'silence');
}

function isFeared_(hero) {
  return hasStatus_(hero, 'fear');
}

function hasTaunt_(hero) {
  return hasStatus_(hero, 'taunt');
}

function processDotEffects_(hero, allHeroes) {
  var results = [];
  for (var i = 0; i < hero.statusEffects.length; i++) {
    var status = hero.statusEffects[i];
    if (DOT_TYPES_.indexOf(status.type) < 0) continue;

    var source = null;
    for (var j = 0; j < allHeroes.length; j++) {
      if (allHeroes[j].uid === status.sourceHeroId) { source = allHeroes[j]; break; }
    }

    var dmg = 0;
    switch (status.type) {
      case 'dot_burn':
        dmg = Math.floor((source ? source.finalStats.ATK : 0) * 0.3 * status.stacks);
        break;
      case 'dot_poison':
        dmg = Math.floor(hero.maxHP * 0.03 * status.stacks);
        break;
      case 'dot_bleed':
        dmg = Math.floor((source ? source.finalStats.ATK : 0) * 0.25 * status.stacks);
        break;
    }

    if (dmg > 0) {
      hero.currentHP = Math.max(0, hero.currentHP - dmg);
      results.push({ type: status.type, damage: dmg, sourceUid: status.sourceHeroId });
    }
  }
  return results;
}

function processRegen_(hero) {
  var totalHeal = 0;
  for (var i = 0; i < hero.statusEffects.length; i++) {
    var s = hero.statusEffects[i];
    if (s.type !== 'regen') continue;
    var heal = Math.floor(hero.maxHP * s.value * s.stacks);
    if (heal > 0) {
      var actual = Math.min(heal, hero.maxHP - hero.currentHP);
      hero.currentHP += actual;
      totalHeal += actual;
    }
  }
  return totalHeal;
}

function tickStatusDurations_(hero) {
  var expired = [];
  // 記錄原本就永久的效果
  var permaSet = [];
  for (var i = 0; i < hero.statusEffects.length; i++) {
    if (hero.statusEffects[i].duration === 0) permaSet.push(hero.statusEffects[i]);
  }

  for (var j = 0; j < hero.statusEffects.length; j++) {
    var s = hero.statusEffects[j];
    if (s.duration > 0) {
      s.duration--;
      if (s.duration <= 0) expired.push(s.type);
    }
  }

  hero.statusEffects = hero.statusEffects.filter(function(s) {
    return s.duration > 0 || permaSet.indexOf(s) >= 0;
  });
  return expired;
}

function tickShieldDurations_(hero) {
  hero.shields = hero.shields
    .map(function(s) { return { value: s.value, duration: s.duration - 1, sourceHeroId: s.sourceHeroId }; })
    .filter(function(s) { return s.duration > 0 && s.value > 0; });
}

function getBuffedStats_(hero) {
  var base = {
    HP: hero.finalStats.HP,
    ATK: hero.finalStats.ATK,
    DEF: hero.finalStats.DEF,
    SPD: hero.finalStats.SPD,
    CritRate: hero.finalStats.CritRate,
    CritDmg: hero.finalStats.CritDmg,
  };

  base.ATK = Math.floor(base.ATK * (1 + getStatusValue_(hero, 'atk_up') - getStatusValue_(hero, 'atk_down')));
  base.DEF = Math.floor(base.DEF * (1 + getStatusValue_(hero, 'def_up') - getStatusValue_(hero, 'def_down')));
  base.SPD = Math.floor(base.SPD * (1 + getStatusValue_(hero, 'spd_up') - getStatusValue_(hero, 'spd_down')));
  base.CritRate = base.CritRate + getStatusValue_(hero, 'crit_rate_up') * 100 - getStatusValue_(hero, 'crit_rate_down') * 100;

  base.ATK = Math.max(1, base.ATK);
  base.DEF = Math.max(0, base.DEF);
  base.SPD = Math.max(1, base.SPD);
  base.CritRate = Math.max(0, Math.min(100, base.CritRate));

  return base;
}

function absorbDamageByShields_(hero, damage) {
  var remaining = damage;
  var absorbed = 0;

  for (var i = 0; i < hero.shields.length; i++) {
    if (remaining <= 0) break;
    var absorb = Math.min(hero.shields[i].value, remaining);
    hero.shields[i].value -= absorb;
    remaining -= absorb;
    absorbed += absorb;
  }
  hero.shields = hero.shields.filter(function(s) { return s.value > 0; });
  return [remaining, absorbed];
}

// ═══════════════════════════════════════════════════════
// Damage Formula（傷害公式）
// ═══════════════════════════════════════════════════════

function calculateDamage_(attacker, target, skill) {
  var atkStats = getBuffedStats_(attacker);
  var defStats = getBuffedStats_(target);

  // 0. 閃避判定
  var dodgeRate = getStatusValue_(target, 'dodge_up');
  var totalDodge = Math.min(dodgeRate, 0.75);
  if (Math.random() < totalDodge) {
    return { damage: 0, isCrit: false, isDodge: true, elementMult: 1.0, damageType: 'miss', shieldAbsorbed: 0, reflectDamage: 0 };
  }

  // 1. 基礎傷害
  var scalingStat = (skill && skill.scalingStat) || 'ATK';
  var statValue = atkStats[scalingStat] || atkStats.ATK;
  var multiplier = (skill && skill.multiplier) || 1.0;
  var flatValue = (skill && skill.flatValue) || 0;
  var baseDmg = statValue * multiplier + flatValue;

  // 2. DEF 減傷
  var effectiveDef = Math.max(0, defStats.DEF);
  var defReduction = 100 / (100 + effectiveDef);
  var dmg = baseDmg * defReduction;

  // 3. 暴擊
  var critRate = Math.min(atkStats.CritRate / 100, 1.0);
  var isCrit = Math.random() < critRate;
  if (isCrit) dmg *= (1 + atkStats.CritDmg / 100);

  // 4. 屬性倍率
  var elementMult = getElementMultiplier_(attacker.element, target.element);
  dmg *= elementMult;

  // 5. 隨機浮動 ±5%
  dmg *= 0.95 + Math.random() * 0.10;

  // 6. 攻擊方修正（atk_up/down 已在 getBuffedStats_ 中處理）
  // 7. 防守方修正
  var targetMult = 1.0;
  targetMult -= getStatusValue_(target, 'dmg_reduce');
  if (hasStatus_(target, 'fear')) targetMult *= 1.2;
  targetMult = Math.max(0.1, targetMult);
  dmg *= targetMult;

  // 8. 取整
  dmg = Math.max(1, Math.floor(dmg));

  // 9. 護盾吸收
  var shieldResult = absorbDamageByShields_(target, dmg);
  var actualDmg = shieldResult[0];
  var shieldAbsorbed = shieldResult[1];

  // 10. 反彈傷害
  var reflectRate = getStatusValue_(target, 'reflect');
  var reflectDamage = reflectRate > 0 ? Math.floor(actualDmg * reflectRate) : 0;

  // 飄字類型
  var damageType = 'normal';
  if (isCrit) damageType = 'crit';
  if (isWeakness_(attacker.element, target.element)) damageType = 'weakness';
  if (shieldAbsorbed > 0 && actualDmg === 0) damageType = 'shield';

  return { damage: actualDmg, isCrit: isCrit, isDodge: false, elementMult: elementMult, damageType: damageType, shieldAbsorbed: shieldAbsorbed, reflectDamage: reflectDamage };
}

function calculateHeal_(healer, target, skill) {
  var healerStats = getBuffedStats_(healer);
  var scalingStat = (skill && skill.scalingStat) || 'ATK';
  var statValue = healerStats[scalingStat] || healerStats.ATK;
  var heal = statValue * ((skill && skill.multiplier) || 1.0) + ((skill && skill.flatValue) || 0);

  var critRate = Math.min(healerStats.CritRate / 100, 1.0);
  var isCrit = Math.random() < critRate;
  if (isCrit) heal *= 1.5;

  heal = Math.min(Math.floor(heal), target.maxHP - target.currentHP);
  heal = Math.max(0, heal);
  return { heal: heal, isCrit: isCrit };
}

// ═══════════════════════════════════════════════════════
// Target Strategy（目標選擇）
// ═══════════════════════════════════════════════════════

var FRONT_INDICES_ = [0, 1, 2];
var BACK_INDICES_ = [3, 4, 5];

function slotColumn_(slot) { return slot % 3; }

function pickByColumnProximity_(candidates, preferCol) {
  var sameCol = null;
  for (var i = 0; i < candidates.length; i++) {
    if (slotColumn_(candidates[i].slot) === preferCol) { sameCol = candidates[i]; break; }
  }
  if (sameCol) return sameCol;
  candidates.sort(function(a, b) {
    return Math.abs(slotColumn_(a.slot) - preferCol) - Math.abs(slotColumn_(b.slot) - preferCol);
  });
  return candidates[0] || null;
}

function selectNormalAttackTarget_(attacker, enemies) {
  var alive = enemies.filter(function(e) { return e.currentHP > 0; });
  if (alive.length === 0) return null;

  var taunters = alive.filter(function(e) { return hasTaunt_(e); });
  if (taunters.length > 0) return taunters[0];

  var col = slotColumn_(attacker.slot);

  var frontAlive = alive.filter(function(e) { return FRONT_INDICES_.indexOf(e.slot) >= 0; });
  if (frontAlive.length > 0) return pickByColumnProximity_(frontAlive, col) || frontAlive[0];

  var backAlive = alive.filter(function(e) { return BACK_INDICES_.indexOf(e.slot) >= 0; });
  if (backAlive.length > 0) return pickByColumnProximity_(backAlive, col) || backAlive[0];

  return alive[0];
}

function selectTargets_(targetType, attacker, allies, enemies) {
  var aliveEnemies = enemies.filter(function(e) { return e.currentHP > 0; });
  var aliveAllies = allies.filter(function(a) { return a.currentHP > 0; });

  switch (targetType) {
    case 'single_enemy': {
      var t = selectNormalAttackTarget_(attacker, aliveEnemies);
      return t ? [t] : [];
    }
    case 'all_enemies':
      return aliveEnemies;
    case 'random_enemies_3':
      return selectRandomEnemies_(aliveEnemies, 3);
    case 'front_row_enemies': {
      var front = aliveEnemies.filter(function(e) { return FRONT_INDICES_.indexOf(e.slot) >= 0; });
      return front.length > 0 ? front : aliveEnemies.filter(function(e) { return BACK_INDICES_.indexOf(e.slot) >= 0; });
    }
    case 'back_row_enemies': {
      var back = aliveEnemies.filter(function(e) { return BACK_INDICES_.indexOf(e.slot) >= 0; });
      return back.length > 0 ? back : aliveEnemies.filter(function(e) { return FRONT_INDICES_.indexOf(e.slot) >= 0; });
    }
    case 'single_ally': {
      if (aliveAllies.length === 0) return [];
      var sorted = aliveAllies.slice().sort(function(a, b) { return (a.currentHP / a.maxHP) - (b.currentHP / b.maxHP); });
      return [sorted[0]];
    }
    case 'all_allies':
      return aliveAllies;
    case 'self':
      return [attacker];
    default: {
      var match = targetType.match(/^random_enemies_(\d+)$/);
      if (match) return selectRandomEnemies_(aliveEnemies, parseInt(match[1]));
      var fb = selectNormalAttackTarget_(attacker, aliveEnemies);
      return fb ? [fb] : [];
    }
  }
}

function selectRandomEnemies_(enemies, count) {
  if (enemies.length === 0) return [];
  var results = [];
  for (var i = 0; i < count; i++) {
    results.push(enemies[Math.floor(Math.random() * enemies.length)]);
  }
  return results;
}

// ═══════════════════════════════════════════════════════
// Battle Engine（戰鬥引擎核心）
// ═══════════════════════════════════════════════════════

/**
 * 執行完整戰鬥（同步收集模式）
 * @param {Object[]} players - 玩家方 BattleHero 陣列
 * @param {Object[]} enemies - 敵方 BattleHero 陣列
 * @param {number} [maxTurns=50] - 最大回合數
 * @returns {{ winner: string, actions: Object[] }}
 */
function runBattleEngine_(players, enemies, maxTurns) {
  maxTurns = maxTurns || 50;
  var actions = [];
  var allHeroes = players.concat(enemies);

  function emit(action) { actions.push(action); }

  // ── 補齊前端可能未傳的欄位 ──
  for (var h = 0; h < allHeroes.length; h++) {
    var hero = allHeroes[h];
    if (!hero.statusEffects) hero.statusEffects = [];
    if (!hero.shields) hero.shields = [];
    if (!hero.passiveUsage) hero.passiveUsage = {};
    if (!hero.activePassives) hero.activePassives = hero.passives ? hero.passives.slice(0) : [];
    hero.totalDamageDealt = hero.totalDamageDealt || 0;
    hero.totalHealingDone = hero.totalHealingDone || 0;
    hero.killCount = hero.killCount || 0;
  }

  // ── 戰鬥開始：觸發 always + battle_start 被動（與前端一致） ──
  for (var bi = 0; bi < allHeroes.length; bi++) {
    if (allHeroes[bi].currentHP <= 0) continue;
    triggerPassives_(allHeroes[bi], 'always', makeContext_(0, allHeroes[bi], allHeroes), emit);
    triggerPassives_(allHeroes[bi], 'battle_start', makeContext_(0, allHeroes[bi], allHeroes), emit);
  }

  // ── 回合迴圈 ──
  for (var turn = 1; turn <= maxTurns; turn++) {
    emit({ type: 'TURN_START', turn: turn });

    var alivePlayers = players.filter(function(p) { return p.currentHP > 0; });
    var aliveEnemies = enemies.filter(function(e) { return e.currentHP > 0; });
    if (alivePlayers.length === 0 || aliveEnemies.length === 0) break;

    // 速度排序
    var actors = alivePlayers.concat(aliveEnemies);
    actors.sort(function(a, b) {
      var spdA = getBuffedStats_(a).SPD;
      var spdB = getBuffedStats_(b).SPD;
      if (spdB !== spdA) return spdB - spdA;
      if (a.slot !== b.slot) return a.slot - b.slot;
      return a.side === 'player' ? -1 : 1;
    });

    // 每個角色行動
    var extraTurnUsed = {};
    var extraTurnQueue = [];
    _currentExtraTurnQueue_ = extraTurnQueue;
    for (var ai = 0; ai < actors.length; ai++) {
      var actor = actors[ai];
      if (actor.currentHP <= 0) continue;

      var allies = actor.side === 'player' ? players : enemies;
      var foes = actor.side === 'player' ? enemies : players;

      // 回合開始能量
      var energyDelta = turnStartEnergy_(actor);
      if (energyDelta > 0) {
        emit({ type: 'ENERGY_CHANGE', heroUid: actor.uid, delta: energyDelta, newValue: actor.energy });
      }

      // DOT 結算
      var dotResults = processDotEffects_(actor, allHeroes);
      for (var di = 0; di < dotResults.length; di++) {
        emit({ type: 'DOT_TICK', targetUid: actor.uid, dotType: dotResults[di].type, damage: dotResults[di].damage, sourceUid: dotResults[di].sourceUid });
      }
      if (actor.currentHP <= 0) {
        emit({ type: 'DEATH', targetUid: actor.uid });
        continue;
      }

      // Regen 結算
      processRegen_(actor);

      // 觸發 turn_start 被動
      triggerPassives_(actor, 'turn_start', makeContext_(turn, actor, allHeroes), emit);

      // 觸發「每 N 回合」被動（與前端一致）
      for (var pni = 0; pni < actor.activePassives.length; pni++) {
        var pnPassive = actor.activePassives[pni];
        if (pnPassive.passiveTrigger !== 'every_n_turns') continue;
        var pnN = (pnPassive.description.indexOf('每 2') >= 0 || pnPassive.description.indexOf('每2') >= 0) ? 2 : 3;
        if (turn % pnN === 0) {
          for (var pnj = 0; pnj < pnPassive.effects.length; pnj++) {
            executePassiveEffect_(actor, pnPassive.effects[pnj], makeContext_(turn, actor, allHeroes), emit);
          }
          emit({ type: 'PASSIVE_TRIGGER', heroUid: actor.uid, skillId: pnPassive.skillId, skillName: pnPassive.name });
        }
      }

      // 控制效果
      if (isControlled_(actor)) continue;
      if (isFeared_(actor)) continue;

      // 決定行動
      if (canCastUltimate_(actor)) {
        executeSkill_(actor, actor.activeSkill, allies, foes, turn, allHeroes, emit);
      } else {
        executeNormalAttack_(actor, allies, foes, turn, allHeroes, emit);
      }

      // 中斷大招：任何角色能量滿了立即施放（含剛行動的自己、被攻擊的對手）
      var interruptActed = {};
      processInterruptUltimates_(players, enemies, turn, allHeroes, emit, interruptActed);
      if (players.every(function(p) { return p.currentHP <= 0; }) ||
          enemies.every(function(e) { return e.currentHP <= 0; })) break;

      // ── 額外行動處理（extra_turn，與前端一致） ──
      processExtraTurns_(extraTurnQueue, extraTurnUsed, players, enemies, turn, allHeroes, emit);
      if (players.every(function(p) { return p.currentHP <= 0; }) ||
          enemies.every(function(e) { return e.currentHP <= 0; })) break;
    }

    // 回合結束 buff duration 倒數
    for (var ti = 0; ti < allHeroes.length; ti++) {
      if (allHeroes[ti].currentHP <= 0) continue;
      var expired = tickStatusDurations_(allHeroes[ti]);
      for (var ei = 0; ei < expired.length; ei++) {
        emit({ type: 'BUFF_EXPIRE', targetUid: allHeroes[ti].uid, effectType: expired[ei] });
      }
      tickShieldDurations_(allHeroes[ti]);
      // ★ 記錄被動觸發前的 HP，以便偵測被動傷害致死
      var hpBeforePassive = allHeroes[ti].currentHP;
      triggerPassives_(allHeroes[ti], 'turn_end', makeContext_(turn, allHeroes[ti], allHeroes), emit);
      // ★ 被動傷害致死 → 補發 DEATH action（前端需要此 action 播放死亡動畫）
      if (hpBeforePassive > 0 && allHeroes[ti].currentHP <= 0) {
        emit({ type: 'DEATH', targetUid: allHeroes[ti].uid });
      }
    }

    emit({ type: 'TURN_END', turn: turn });

    // 勝負判定
    if (players.every(function(p) { return p.currentHP <= 0; })) {
      emit({ type: 'BATTLE_END', winner: 'enemy' });
      _currentExtraTurnQueue_ = null;
      return { winner: 'enemy', actions: actions };
    }
    if (enemies.every(function(e) { return e.currentHP <= 0; })) {
      emit({ type: 'BATTLE_END', winner: 'player' });
      _currentExtraTurnQueue_ = null;
      return { winner: 'player', actions: actions };
    }
  }

  // 迴圈結束勝負判定
  _currentExtraTurnQueue_ = null; // 清理模組級變數
  if (players.every(function(p) { return p.currentHP <= 0; })) {
    emit({ type: 'BATTLE_END', winner: 'enemy' });
    return { winner: 'enemy', actions: actions };
  }
  if (enemies.every(function(e) { return e.currentHP <= 0; })) {
    emit({ type: 'BATTLE_END', winner: 'player' });
    return { winner: 'player', actions: actions };
  }

  emit({ type: 'BATTLE_END', winner: 'draw' });
  return { winner: 'draw', actions: actions };
}

// ── 普攻執行 ──

function executeNormalAttack_(attacker, allies, enemies, turn, allHeroes, emit) {
  var target = selectNormalAttackTarget_(attacker, enemies);
  if (!target) return;

  var ctx = makeContext_(turn, attacker, allHeroes, target);
  triggerPassives_(attacker, 'on_attack', ctx, emit);

  var result = calculateDamage_(attacker, target);

  // 套用 on_attack 被動傷害倍率（damage_mult / damage_mult_random）
  if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
    result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult));
  }

  var killed = false;
  if (!result.isDodge) {
    target.currentHP = Math.max(0, target.currentHP - result.damage);
    attacker.totalDamageDealt += result.damage;
    killed = target.currentHP <= 0;

    if (result.reflectDamage > 0) {
      attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage);
    }
  }

  // 能量
  var _atkEnergyNew, _tgtEnergyNew;
  if (!result.isDodge) {
    var atkEDelta = onAttackEnergy_(attacker);
    if (atkEDelta > 0) _atkEnergyNew = attacker.energy;

    if (!killed) {
      var defEDelta = onBeAttackedEnergy_(target);
      if (defEDelta > 0) _tgtEnergyNew = target.energy;
    }

    if (killed) {
      attacker.killCount++;
      var killEDelta = onKillEnergy_(attacker);
      if (killEDelta > 0 || _atkEnergyNew != null) _atkEnergyNew = attacker.energy;
    }
  }

  emit({
    type: 'NORMAL_ATTACK',
    attackerUid: attacker.uid,
    targetUid: target.uid,
    result: result,
    killed: killed,
    _atkEnergyNew: _atkEnergyNew,
    _tgtEnergyNew: _tgtEnergyNew,
  });

  // 被動觸發
  if (!result.isDodge) {
    if (!killed) {
      triggerPassives_(target, 'on_be_attacked', makeContext_(turn, attacker, allHeroes, target), emit);
      triggerPassives_(target, 'on_take_damage', makeContext_(turn, attacker, allHeroes, target), emit);
    }
    if (result.isCrit) {
      triggerPassives_(attacker, 'on_crit', makeContext_(turn, attacker, allHeroes, target), emit);
    }
    if (killed) {
      triggerPassives_(attacker, 'on_kill', makeContext_(turn, attacker, allHeroes, target, true), emit);
    }
  } else {
    triggerPassives_(target, 'on_dodge', makeContext_(turn, attacker, allHeroes, target), emit);
  }

  checkHpBelowPassives_(attacker, turn, allHeroes, emit);
  checkHpBelowPassives_(target, turn, allHeroes, emit);
}

// ── 技能執行 ──

function executeSkill_(attacker, skill, allies, enemies, turn, allHeroes, emit) {
  var targets = selectTargets_(skill.target, attacker, allies, enemies);
  if (targets.length === 0) return;

  var ctx = makeContext_(turn, attacker, allHeroes, targets[0]);
  triggerPassives_(attacker, 'on_attack', ctx, emit);

  var skillResults = [];
  var killedUids = [];
  var _tgtEnergyMap = {};

  for (var ei = 0; ei < skill.effects.length; ei++) {
    var effect = skill.effects[ei];
    for (var ti = 0; ti < targets.length; ti++) {
      var target = targets[ti];
      if (target.currentHP <= 0 && effect.type === 'damage') continue;

      switch (effect.type) {
        case 'damage': {
          var result = calculateDamage_(attacker, target, effect);
          // 套用 on_attack 被動傷害倍率
          if (ctx.damageMult != null && ctx.damageMult !== 1.0 && !result.isDodge) {
            result.damage = Math.max(1, Math.floor(result.damage * ctx.damageMult));
          }
          var killed = false;

          if (!result.isDodge) {
            target.currentHP = Math.max(0, target.currentHP - result.damage);
            attacker.totalDamageDealt += result.damage;
            killed = target.currentHP <= 0;

            if (result.reflectDamage > 0) {
              attacker.currentHP = Math.max(0, attacker.currentHP - result.reflectDamage);
            }

            if (!killed) {
              var defED = onBeAttackedEnergy_(target);
              if (defED > 0) _tgtEnergyMap[target.uid] = target.energy;
              triggerPassives_(target, 'on_be_attacked', makeContext_(turn, attacker, allHeroes, target), emit);
              triggerPassives_(target, 'on_take_damage', makeContext_(turn, attacker, allHeroes, target), emit);
            }

            if (killed) {
              killedUids.push(target.uid);
              attacker.killCount++;
              onKillEnergy_(attacker);
              triggerPassives_(attacker, 'on_kill', makeContext_(turn, attacker, allHeroes, target, true), emit);
            }

            if (result.isCrit) {
              triggerPassives_(attacker, 'on_crit', makeContext_(turn, attacker, allHeroes, target), emit);
            }
          } else {
            triggerPassives_(target, 'on_dodge', makeContext_(turn, attacker, allHeroes, target), emit);
          }

          skillResults.push({ uid: target.uid, result: result, killed: killed });
          break;
        }

        case 'heal': {
          var healResult = calculateHeal_(attacker, target, effect);
          target.currentHP = Math.min(target.maxHP, target.currentHP + healResult.heal);
          attacker.totalHealingDone += healResult.heal;
          skillResults.push({ uid: target.uid, result: healResult });
          break;
        }

        case 'buff':
        case 'debuff': {
          var chance = effect.statusChance != null ? effect.statusChance : 1.0;
          if (Math.random() < chance && effect.status) {
            var success = applyStatus_(target, {
              type: effect.status,
              value: effect.statusValue || 0,
              duration: effect.statusDuration || 2,
              maxStacks: effect.statusMaxStacks || 1,
              sourceHeroId: attacker.uid,
            });
            if (success) {
              emit({
                type: 'BUFF_APPLY',
                targetUid: target.uid,
                effect: {
                  type: effect.status,
                  value: effect.statusValue || 0,
                  duration: effect.statusDuration || 2,
                  stacks: 1,
                  maxStacks: effect.statusMaxStacks || 1,
                  sourceHeroId: attacker.uid,
                },
              });
            }
          }
          break;
        }

        case 'energy': {
          addEnergy_(target, effect.flatValue || 0);
          break;
        }

        case 'revive':
          break;

        case 'dispel_debuff': {
          cleanse_(target, 1);
          break;
        }

        default:
          break;
      }
    }
  }

  consumeEnergy_(attacker);

  var tgtMapKeys = Object.keys(_tgtEnergyMap);
  emit({
    type: 'SKILL_CAST',
    attackerUid: attacker.uid,
    skillId: skill.skillId,
    skillName: skill.name,
    targets: skillResults,
    _atkEnergyNew: attacker.energy,
    _tgtEnergyMap: tgtMapKeys.length > 0 ? _tgtEnergyMap : undefined,
  });

  for (var ci = 0; ci < targets.length; ci++) {
    checkHpBelowPassives_(targets[ci], turn, allHeroes, emit);
  }
  checkHpBelowPassives_(attacker, turn, allHeroes, emit);
}

// ── 中斷大招 ──

function processInterruptUltimates_(players, enemies, turn, allHeroes, emit, alreadyActedUids) {
  var MAX_INTERRUPTS = 20;
  var count = 0;
  var found = true;
  while (found && count < MAX_INTERRUPTS) {
    found = false;
    var candidates = allHeroes
      .filter(function(h) { return h.currentHP > 0 && canCastUltimate_(h) && !alreadyActedUids[h.uid]; })
      .sort(function(a, b) {
        var spdA = getBuffedStats_(a).SPD;
        var spdB = getBuffedStats_(b).SPD;
        if (spdB !== spdA) return spdB - spdA;
        return a.side === 'player' ? -1 : 1;
      });
    for (var ci = 0; ci < candidates.length; ci++) {
      var hero = candidates[ci];
      if (hero.currentHP <= 0 || !canCastUltimate_(hero)) continue;
      var allies = hero.side === 'player' ? players : enemies;
      var foes = hero.side === 'player' ? enemies : players;
      executeSkill_(hero, hero.activeSkill, allies, foes, turn, allHeroes, emit);
      alreadyActedUids[hero.uid] = true; // 標記已施放，防同一輪重複
      found = true;
      count++;
      if (players.every(function(p) { return p.currentHP <= 0; }) ||
          enemies.every(function(e) { return e.currentHP <= 0; })) return;
      break;
    }
  }
}

// ── 額外行動處理（extra_turn，與前端一致） ──

function processExtraTurns_(extraTurnQueue, extraTurnUsed, players, enemies, turn, allHeroes, emit) {
  var MAX_EXTRA = 10;
  var processed = 0;

  while (extraTurnQueue.length > 0 && processed < MAX_EXTRA) {
    var uid = extraTurnQueue.shift();
    processed++;

    if (extraTurnUsed[uid]) continue;

    var hero = null;
    for (var i = 0; i < allHeroes.length; i++) {
      if (allHeroes[i].uid === uid) { hero = allHeroes[i]; break; }
    }
    if (!hero || hero.currentHP <= 0) continue;

    extraTurnUsed[uid] = true;

    var heroAllies = hero.side === 'player' ? players : enemies;
    var heroFoes = hero.side === 'player' ? enemies : players;

    emit({ type: 'EXTRA_TURN', heroUid: uid, reason: 'extra_turn' });

    if (isControlled_(hero) || isFeared_(hero)) continue;

    if (canCastUltimate_(hero)) {
      executeSkill_(hero, hero.activeSkill, heroAllies, heroFoes, turn, allHeroes, emit);
    } else {
      executeNormalAttack_(hero, heroAllies, heroFoes, turn, allHeroes, emit);
    }

    // 中斷大招（額外行動可能觸發能量溢出）
    var interruptActed2 = {};
    processInterruptUltimates_(players, enemies, turn, allHeroes, emit, interruptActed2);

    if (players.every(function(p) { return p.currentHP <= 0; }) ||
        enemies.every(function(e) { return e.currentHP <= 0; })) return;
  }
}

// ── 被動技能觸發 ──

function triggerPassives_(hero, trigger, context, emit) {
  if (hero.currentHP <= 0) return;

  for (var i = 0; i < hero.activePassives.length; i++) {
    var passive = hero.activePassives[i];
    if (passive.passiveTrigger !== trigger) continue;

    var usageKey = passive.skillId;
    var usageCount = hero.passiveUsage[usageKey] || 0;

    if (trigger === 'on_lethal' && usageCount >= getMaxUsage_(passive)) continue;

    for (var j = 0; j < passive.effects.length; j++) {
      executePassiveEffect_(hero, passive.effects[j], context, emit);
    }

    hero.passiveUsage[usageKey] = usageCount + 1;

    emit({
      type: 'PASSIVE_TRIGGER',
      heroUid: hero.uid,
      skillId: passive.skillId,
      skillName: passive.name,
    });
  }
}

function checkHpBelowPassives_(hero, turn, allHeroes, emit) {
  if (hero.currentHP <= 0) return;

  var hpPct = hero.currentHP / hero.maxHP;

  for (var i = 0; i < hero.activePassives.length; i++) {
    var passive = hero.activePassives[i];
    if (passive.passiveTrigger !== 'hp_below_pct') continue;

    var threshold = 0.30;
    if (passive.description.indexOf('15%') >= 0) threshold = 0.15;
    else if (passive.description.indexOf('30%') >= 0) threshold = 0.30;
    else if (passive.description.indexOf('50%') >= 0) threshold = 0.50;

    if (hpPct < threshold) {
      var usageKey = passive.skillId + '_hp_below';
      if (hero.passiveUsage[usageKey]) continue;

      for (var j = 0; j < passive.effects.length; j++) {
        executePassiveEffect_(hero, passive.effects[j], makeContext_(turn, hero, allHeroes), emit);
      }
      hero.passiveUsage[usageKey] = 1;

      emit({
        type: 'PASSIVE_TRIGGER',
        heroUid: hero.uid,
        skillId: passive.skillId,
        skillName: passive.name,
      });
    }
  }
}

function resolvePassiveTargets_(hero, effectType, passiveTarget, context) {
  switch (passiveTarget) {
    case 'all_allies':
      return context.allAllies.filter(function(h) { return h.side === hero.side && h.currentHP > 0; });
    case 'all_enemies':
      return context.allEnemies.filter(function(h) { return h.side !== hero.side && h.currentHP > 0; });
    case 'self':
    default:
      if (effectType === 'debuff' && context.target && context.target.currentHP > 0) {
        return [context.target];
      }
      return [hero];
  }
}

function executePassiveEffect_(hero, effect, context, emit) {
  var chance = effect.statusChance != null ? effect.statusChance : 1.0;
  if (Math.random() > chance) return;

  // 解析被動 target 欄位（與前端 resolvePassiveTargets 一致）
  var ownerPassive = null;
  for (var pi = 0; pi < hero.activePassives.length; pi++) {
    var p = hero.activePassives[pi];
    if (p.effects && p.effects.indexOf(effect) >= 0) { ownerPassive = p; break; }
  }
  var passiveTargetType = (ownerPassive && ownerPassive.target) ? ownerPassive.target : 'self';

  switch (effect.type) {
    case 'buff':
    case 'debuff': {
      if (!effect.status) return;
      var targets = resolvePassiveTargets_(hero, effect.type, passiveTargetType, context);
      for (var ti = 0; ti < targets.length; ti++) {
        applyStatus_(targets[ti], {
          type: effect.status,
          value: effect.statusValue || 0,
          duration: effect.statusDuration || 0,
          maxStacks: effect.statusMaxStacks || 1,
          sourceHeroId: hero.uid,
        });
      }
      break;
    }
    case 'heal': {
      var healTargets = resolvePassiveTargets_(hero, 'buff', passiveTargetType, context);
      for (var hi = 0; hi < healTargets.length; hi++) {
        var ht = healTargets[hi];
        if (ht.currentHP <= 0) continue;
        var scalingStat = effect.scalingStat || 'HP';
        var base = ht.finalStats[scalingStat] || ht.maxHP;
        var healAmt = Math.floor(base * (effect.multiplier || 0.1) + (effect.flatValue || 0));
        var actual = Math.min(healAmt, ht.maxHP - ht.currentHP);
        ht.currentHP += actual;
        hero.totalHealingDone += actual;
      }
      break;
    }
    case 'energy': {
      var energyTargets = resolvePassiveTargets_(hero, 'buff', passiveTargetType, context);
      for (var ei2 = 0; ei2 < energyTargets.length; ei2++) {
        if (energyTargets[ei2].currentHP <= 0) continue;
        addEnergy_(energyTargets[ei2], effect.flatValue || 0);
      }
      break;
    }
    case 'damage_mult': {
      // on_attack 被動：乘算傷害倍率（多個被動可疊加）
      context.damageMult = (context.damageMult || 1.0) * (effect.multiplier || 1.0);
      break;
    }
    case 'damage_mult_random': {
      // on_attack 被動：隨機傷害倍率
      var min = effect.min != null ? effect.min : 0.5;
      var max = effect.max != null ? effect.max : 1.8;
      context.damageMult = (context.damageMult || 1.0) * (min + Math.random() * (max - min));
      break;
    }
    case 'damage': {
      // 非 on_attack 觸發的額外傷害（如 on_dodge 反擊）
      if (context.target && context.target.currentHP > 0) {
        var dmg = calculateDamage_(hero, context.target, effect);
        if (!dmg.isDodge) {
          context.target.currentHP = Math.max(0, context.target.currentHP - dmg.damage);
          hero.totalDamageDealt += dmg.damage;
          var killed = context.target.currentHP <= 0;
          if (emit) {
            emit({
              type: 'PASSIVE_DAMAGE',
              attackerUid: hero.uid,
              targetUid: context.target.uid,
              damage: dmg.damage,
              killed: killed,
            });
            if (killed) {
              emit({ type: 'DEATH', targetUid: context.target.uid });
            }
          }
        }
      }
      break;
    }
    case 'revive':
      break;
    case 'extra_turn':
      // 將英雄加入額外行動佇列（與前端一致）
      if (_currentExtraTurnQueue_) _currentExtraTurnQueue_.push(hero.uid);
      break;
    case 'dispel_debuff':
      // 被動觸發淨化（與前端一致）
      cleanse_(hero, 1);
      break;
    case 'reflect':
      // 被動觸發反彈效果（與前端一致）
      applyStatus_(hero, {
        type: 'reflect',
        value: effect.multiplier || 0.15,
        duration: 0,
        maxStacks: 1,
        sourceHeroId: hero.uid,
      });
      break;
    default:
      break;
  }
}

function getMaxUsage_(passive) {
  if (passive.skillId === 'PAS_1_4') return 2;
  if (passive.passiveTrigger === 'on_lethal') return 1;
  return 999999;
}

function makeContext_(turn, actor, allHeroes, target, isKill) {
  var allies = allHeroes.filter(function(h) { return h.side === actor.side; });
  var enemies = allHeroes.filter(function(h) { return h.side !== actor.side; });
  return {
    turn: turn,
    attacker: actor,
    target: target || null,
    targets: target ? [target] : [],
    allAllies: allies,
    allEnemies: enemies,
    damageDealt: 0,
    isKill: !!isKill,
    isCrit: false,
    isDodge: false,
  };
}

// ═══════════════════════════════════════════════════════
// POST Handler: run-battle
// ═══════════════════════════════════════════════════════

/**
 * 處理 run-battle 請求
 * body: { players: BattleHero[], enemies: BattleHero[], maxTurns?: number, seed?: number }
 * 回傳: { success: true, winner: string, actions: BattleAction[] }
 */
function handleRunBattle_(body) {
  var players = body.players;
  var enemies = body.enemies;
  var maxTurns = body.maxTurns || 50;
  var seed = body.seed;

  if (!players || !enemies || !Array.isArray(players) || !Array.isArray(enemies)) {
    return { success: false, error: 'players and enemies arrays are required' };
  }
  if (players.length === 0 || enemies.length === 0) {
    return { success: false, error: 'players and enemies cannot be empty' };
  }

  // Deep clone to avoid mutating input（GAS JSON.parse+stringify 即可）
  var clonedPlayers = JSON.parse(JSON.stringify(players));
  var clonedEnemies = JSON.parse(JSON.stringify(enemies));

  // ── 種子式 PRNG：暫時覆蓋 Math.random ──
  var origRandom = Math.random;
  if (seed != null) {
    Math.random = createSeededRng_(seed);
  }

  var result;
  try {
    result = runBattleEngine_(clonedPlayers, clonedEnemies, maxTurns);
  } finally {
    Math.random = origRandom;
  }

  return {
    success: true,
    winner: result.winner,
    actions: result.actions,
  };
}

/**
 * 處理 verify-battle 請求（反作弊校驗）
 * body: { players, enemies, maxTurns?, seed, localWinner }
 * 僅比對 winner，不回傳完整 actions（減少 payload）
 * 回傳: { success: true, verified: boolean, serverWinner: string, localWinner: string }
 */
function handleVerifyBattle_(body) {
  var players = body.players;
  var enemies = body.enemies;
  var maxTurns = body.maxTurns || 50;
  var seed = body.seed;
  var localWinner = body.localWinner;

  if (!players || !enemies || !Array.isArray(players) || !Array.isArray(enemies)) {
    return { success: false, error: 'players and enemies arrays are required' };
  }
  if (players.length === 0 || enemies.length === 0) {
    return { success: false, error: 'players and enemies cannot be empty' };
  }
  if (seed == null) {
    return { success: false, error: 'seed is required for verification' };
  }

  var clonedPlayers = JSON.parse(JSON.stringify(players));
  var clonedEnemies = JSON.parse(JSON.stringify(enemies));

  // 使用相同的 seeded PRNG
  var origRandom = Math.random;
  Math.random = createSeededRng_(seed);

  var result;
  try {
    result = runBattleEngine_(clonedPlayers, clonedEnemies, maxTurns);
  } finally {
    Math.random = origRandom;
  }

  var verified = result.winner === localWinner;

  // ── 作弊偵測記錄 ──
  if (!verified) {
    try {
      var props = PropertiesService.getScriptProperties();
      var log = JSON.parse(props.getProperty('ANTICHEAT_LOG') || '[]');
      log.push({
        ts: new Date().toISOString(),
        seed: seed,
        localWinner: localWinner,
        serverWinner: result.winner,
        playerCount: players.length,
        enemyCount: enemies.length,
      });
      // 只保留最近 100 筆
      if (log.length > 100) log = log.slice(-100);
      props.setProperty('ANTICHEAT_LOG', JSON.stringify(log));
    } catch (e) {
      // 記錄失敗不影響回傳
    }
  }

  return {
    success: true,
    verified: verified,
    serverWinner: result.winner,
    localWinner: localWinner || 'unknown',
  };
}
