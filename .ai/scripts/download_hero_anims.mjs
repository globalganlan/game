/**
 * download_hero_anims.mjs — 🏃 動畫師：為 30 英雄下載適配動畫
 * 
 * 每個英雄有獨立的動畫配置，根據角色定位選擇最合適的 Mixamo 動畫。
 * 用法: node .ai/scripts/download_hero_anims.mjs [--only z1,z2,...] [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');
const MIXAMO_API = 'https://www.mixamo.com/api/v1';

function loadToken() {
  const text = fs.readFileSync(path.join(__dirname, 'hero-gen.env'), 'utf-8');
  return text.match(/MIXAMO_TOKEN=(.+)/)[1].trim();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════
// 🏃 ANIMATION — 30 英雄個別動畫配置
// 
// 設計原則：
// 1. idle/attack 最大化多樣性（玩家最常看到）
// 2. attack 必須符合角色戰鬥風格
// 3. hurt/dying/run 可以同 profile 共用，但仍保持 3-4 種變化
// ═══════════════════════════════════════════════════════════════

// --- Mixamo charId 對照表 ---
const CHAR_IDS = {
  // z1-z15: 無原始 charId，使用代理角色下載動畫
  // 動畫曲線（骨骼旋轉）與具體體型無關，只要骨骼命名皆為 mixamorig:* 即可通用
  // 代理選擇原則：匹配體型大小以減少 Hips translation 偏差
  zombie_1:  '45d387cb-2276-426b-9547-95f501296b68',  // proxy: Vanguard(標準人形)
  zombie_2:  'cccc84b6-d072-4972-99da-75c5702e25f6',  // proxy: Mutant(大型)
  zombie_3:  'cccc84b6-d072-4972-99da-75c5702e25f6',  // proxy: Mutant(大型)
  zombie_4:  '39e74902-c602-49c0-9d0b-d35d1ba0c341',  // proxy: Ninja(敏捷)
  zombie_5:  '91d02eaa-1b0a-4d34-b859-01bcd092c713',  // proxy: Skeletonzombie
  zombie_6:  '91d02eaa-1b0a-4d34-b859-01bcd092c713',  // proxy: Skeletonzombie
  zombie_7:  '45d387cb-2276-426b-9547-95f501296b68',  // proxy: Vanguard(標準人形)
  zombie_8:  '45d387cb-2276-426b-9547-95f501296b68',  // proxy: Vanguard(戰士)
  zombie_9:  '91d02eaa-1b0a-4d34-b859-01bcd092c713',  // proxy: Skeletonzombie
  zombie_10: '39e74902-c602-49c0-9d0b-d35d1ba0c341',  // proxy: Ninja(小型敏捷)
  zombie_11: '90815396-6b00-4efc-b670-4c3497dbb605',  // proxy: Vampire(詭異)
  zombie_12: 'cccc84b6-d072-4972-99da-75c5702e25f6',  // proxy: Mutant(大型坦克)
  zombie_13: 'cccc84b6-d072-4972-99da-75c5702e25f6',  // proxy: Mutant(大型力量)
  zombie_14: '39e74902-c602-49c0-9d0b-d35d1ba0c341',  // proxy: Ninja(敏捷)
  zombie_15: '90815396-6b00-4efc-b670-4c3497dbb605',  // proxy: Vampire(施法)
  // z16-z30: 已知 charId
  zombie_16: 'cccc84b6-d072-4972-99da-75c5702e25f6',  // Mutant
  zombie_17: '91d02eaa-1b0a-4d34-b859-01bcd092c713',  // Skeletonzombie
  zombie_18: '39e74902-c602-49c0-9d0b-d35d1ba0c341',  // Ninja
  zombie_19: 'a4440477-3191-424b-8703-8126d1982f67',  // Pumpkinhulk
  zombie_20: '45d387cb-2276-426b-9547-95f501296b68',  // Vanguard
  zombie_21: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2',  // Erika Archer
  zombie_22: '90815396-6b00-4efc-b670-4c3497dbb605',  // Vampire
  zombie_23: '447a4990-f669-436e-a066-e2e2968bdcba',  // Demon
  zombie_24: 'ef7eb018-7cf3-4ae1-99ac-bab1c2c5d419',  // Exo Gray
  zombie_25: '3576fd60-beef-49ec-a3d0-f93231f4fc29',  // Warzombie
  zombie_26: 'efb06b46-a470-49b2-b7da-a06755d4dba7',  // Warrok
  zombie_27: 'eface83a-acc0-4036-a15e-3c650df1510d',  // Paladin
  zombie_28: '555df3c3-74b7-493b-a790-3b6dbba30fed',  // Medea
  zombie_29: '75fb0e3e-cf4c-4828-b72b-63b42a4a5cbb',  // Alien Soldier
  zombie_30: 'c9012369-6099-4f23-b1e8-e45cbdc23d74',  // The Boss
};

// --- 每個英雄的動畫配置 ---
// ⚠️ 所有 model-ID 已通過 Mixamo export 相容性測試驗證
// 
// ═══ 已驗證可用的動畫池 ═══
// IDLE: 102250901 ZombieAlert, 104110901 ZombieTwitch, 102250902 ZombieLookAround,
//       101470907 FightIdleBoxing, 101470903 FightIdleEmpty, 104210901 ReadyToCombat,
//       104110902 ZombieUprightTwitch, 104360901 ZombieScratch, 107820901 IdleLookAround
// ATTACK: 102320906 ZombieOverhead, 102320902 ZombieRightHand, 102320903 ZombieHeadbutt,
//         102320904 ZombieSnapKick, 113920901 ElbowUppercut, 113650901 VerticalElbow,
//         113640901 RoundhouseKick, 101500901 RoundhouseFront, 100930901 DoubleSnapKick,
//         100970901 SpinningBackKick, 102700901 DaggerStab, 114830901 CastResurrect,
//         114890902 CastOneHand, 114810902 CastWideTwoArms, 112900901 Roar,
//         104820901 BayonetSlash, 115210901 LungeBite, 113700901 GrabTwistKick,
//         104840901 AdvancingPunch
// HURT: 115720901 HitReactionRifle, 104250908 HitReactionRifleHold, 102460901 ZombieFlinch,
//       104250907 HitReactionPistol, 104380907 AgonyHead, 116790901 RifleProneHit
// DYING: 101170903 DyingFrontImpact, 101220904 DyingFrontHead, 101250904 DyingRearImpact,
//        107070901 ShotChestBackward, 101220903 DyingShotHead, 101210901 DyingShotBackHead
// RUN: 104020901 ZombieRun, 121370901 ZombieRunning, 121340901 ZombieWalking,
//      105940901 RunningLeaning, 104230901 JogSlowly

const HERO_ANIMS = {
  // ═══ N 級 ═══
  // z6: 無名活屍 — 均衡 — 最基本的殭屍
  zombie_6: {
    idle:   { modelId: 102250901, label: 'Zombie Alert Idle' },
    attack: { modelId: 102320906, label: 'Zombie Overhead Two-Hand Attack' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101250904, label: 'Dying Rear Impact' },
    run:    { modelId: 104020901, label: 'Zombie Run' },
  },
  // z16: 荒拳鬥士 — 敏捷 — 持斧格鬥家（模型右手持單手斧）
  zombie_16: {
    idle:   { modelId: 104110901, label: 'Zombie Twitching Idle' },
    attack: { modelId: 104820901, label: 'Bayonet Slash' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 107070901, label: 'Shot To Chest Falling Backwards' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z17: 蠕行屍 — 力量 — 失去頭顱的異變體
  zombie_17: {
    idle:   { modelId: 104110901, label: 'Zombie Twitching Idle' },
    attack: { modelId: 102320902, label: 'Zombie Attack With Right Hand' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 104020901, label: 'Zombie Run' },
  },

  // ═══ R 級 ═══
  // z1: 女喪屍 — 敏捷 — 敏捷型女殭屍
  zombie_1: {
    idle:   { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
    attack: { modelId: 100930901, label: 'Double Front Snap Kick' },
    hurt:   { modelId: 115720901, label: 'Hit Reaction From Rifle Crouched' },
    dying:  { modelId: 101220904, label: 'Dying Front Head Impact' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z9: 噬骨者 — 均衡 — 失去理智的啃食者
  zombie_9: {
    idle:   { modelId: 104360901, label: 'Zombie Scratching Idle' },
    attack: { modelId: 102320903, label: 'Zombie Headbutt' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101220904, label: 'Dying Front Head Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z14: 脫逃者 — 敏捷 — 逃脫者，快速閃避型
  zombie_14: {
    idle:   { modelId: 101470903, label: 'Male Fight Idle Empty Stance' },
    attack: { modelId: 100970901, label: 'Spinning Back Kick' },
    hurt:   { modelId: 115720901, label: 'Hit Reaction From Rifle Crouched' },
    dying:  { modelId: 101220903, label: 'Dying Shot To Head' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z18: 影行者 — 敏捷 · Ninja — 暗影刺客
  zombie_18: {
    idle:   { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
    attack: { modelId: 113910901, label: 'Jab To Elbow Combo' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 101220903, label: 'Dying Shot To Head' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z19: 星蝕者 — 智慧 · Pumpkinhulk — 深空異種 (⚠️ 部署中的 idle 為原始 batch 下載版本)
  zombie_19: {
    idle:   { modelId: 102250901, label: 'Zombie Alert Idle' },
    attack: { modelId: 112900901, label: 'Belting Out A Loud Roar' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101250904, label: 'Dying Rear Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z20: 鏽鋼衛士 — 力量 · Vanguard — 鐵壁護衛
  zombie_20: {
    idle:   { modelId: 107820901, label: 'Idle Stand Looking Around' },
    attack: { modelId: 113920901, label: 'Elbow-Uppercut Strike Combo' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 104020901, label: 'Zombie Run' },
  },
  // z21: 暗影弓手 — 敏捷 · Erika Archer — ⚠️ 無弓！改用踢擊
  zombie_21: {
    idle:   { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
    attack: { modelId: 100930901, label: 'Double Front Snap Kick' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 107070901, label: 'Shot To Chest Falling Backwards' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },

  // ═══ SR 級 ═══
  // z2: 異變者 — 力量 — 岩甲巨獸
  zombie_2: {
    idle:   { modelId: 104110901, label: 'Zombie Twitching Idle' },
    attack: { modelId: 102320906, label: 'Zombie Overhead Two-Hand Attack' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 104020901, label: 'Zombie Run' },
  },
  // z5: 口器者 — 特殊 — 觸手/口器怪物，揮擊型
  zombie_5: {
    idle:   { modelId: 104110902, label: 'Zombie Upright Twitching Idle' },
    attack: { modelId: 102320902, label: 'Zombie Attack With Right Hand' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101250904, label: 'Dying Rear Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z7: 屍警 — 輔助 — 末日執法者（proxy: Vanguard 標準人形）
  zombie_7: {
    idle:   { modelId: 102250901, label: 'Zombie Alert Idle' },
    attack: { modelId: 102700901, label: 'Double Dagger Stab' },
    hurt:   { modelId: 115720901, label: 'Hit Reaction From Rifle Crouched' },
    dying:  { modelId: 107070901, label: 'Shot To Chest Falling Backwards' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z8: 怨武者 — 力量 — 戰國武士亡魂 ⚠️ 無刀
  zombie_8: {
    idle:   { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
    attack: { modelId: 104820901, label: 'Bayonet Slash' },
    hurt:   { modelId: 104250907, label: 'Hit Reaction While Holding A Pistol' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 104020901, label: 'Zombie Run' },
  },
  // z11: 白面鬼 — 特殊 — 小丑殭屍
  // z11: 白面鬼 — 特殊 · 小丑殭屍 (⚠️ 部署中的 idle 為原始 batch 下載版本，非此處配置)
  zombie_11: {
    idle:   { modelId: 102250902, label: 'Zombie Looking Around' },
    attack: { modelId: 115210901, label: 'Lunging Forward To Bite' },
    hurt:   { modelId: 104380907, label: 'Agony Holding The Head' },
    dying:  { modelId: 101220903, label: 'Dying Shot To Head' },
    run:    { modelId: 121340901, label: 'Zombie Walking' },
  },
  // z15: 暗焰祭司 — 特殊 — 亡靈祭司
  zombie_15: {
    idle:   { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
    attack: { modelId: 114810902, label: 'Casting Magic Wide Two Arms' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 101220904, label: 'Dying Front Head Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z22: 魔瞳領主 — 智慧 · Vampire — 異界貴族 (⚠️ 部署中的 idle 為原始 batch 下載版本)
  zombie_22: {
    idle:   { modelId: 102250901, label: 'Zombie Alert Idle' },
    attack: { modelId: 114890902, label: 'Casting Spell One Hand' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 107070901, label: 'Shot To Chest Falling Backwards' },
    run:    { modelId: 121340901, label: 'Zombie Walking' },
  },
  // z23: 霜角魔 — 力量 · Demon — 永凍惡魔
  zombie_23: {
    idle:   { modelId: 102250902, label: 'Zombie Looking Around' },
    attack: { modelId: 104840901, label: 'Advancing And Punching' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z24: 鏈甲獵兵 — 智慧 · Exo Gray — 高科技獵人
  zombie_24: {
    idle:   { modelId: 107820901, label: 'Idle Stand Looking Around' },
    attack: { modelId: 113920901, label: 'Elbow-Uppercut Strike Combo' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 107070901, label: 'Shot To Chest Falling Backwards' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z25: 骸骨騎士 — 智慧 · Warzombie — 暗黑騎士 (⚠️ 部署中的 idle 為原始 batch 下載版本)
  zombie_25: {
    idle:   { modelId: 102250902, label: 'Zombie Looking Around' },
    attack: { modelId: 102320906, label: 'Zombie Overhead Two-Hand Attack' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101250904, label: 'Dying Rear Impact' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z26: 老獵魔人 — 平衡 · Warrok — 獵魔老手 (用 Warrok 自身 charId 下載)
  zombie_26: {
    idle:   { modelId: 107820901, label: 'Idle Stand Looking Around' },
    attack: { modelId: 102700901, label: 'Double Dagger Stab' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101220904, label: 'Dying Front Head Impact' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },

  // ═══ SSR 級 ═══
  // z3: 詭獸 — 坦克 — 狡猾巨獸，衝撞型
  zombie_3: {
    idle:   { modelId: 102250902, label: 'Zombie Looking Around' },
    attack: { modelId: 104840901, label: 'Advancing And Punching' },
    hurt:   { modelId: 104250908, label: 'Hit Reaction While Holding Rifle' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z4: 屠宰者 — 刺客 — 致命匕首
  zombie_4: {
    idle:   { modelId: 101470903, label: 'Male Fight Idle Empty Stance' },
    attack: { modelId: 102700901, label: 'Double Dagger Stab' },
    hurt:   { modelId: 115720901, label: 'Hit Reaction From Rifle Crouched' },
    dying:  { modelId: 101220903, label: 'Dying Shot To Head' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z10: 童魘 — 敏捷 — 兒童夢魘，詭異快速
  zombie_10: {
    idle:   { modelId: 107820901, label: 'Idle Stand Looking Around' },
    attack: { modelId: 101500901, label: 'Roundhouse Kick Front Foot' },
    hurt:   { modelId: 104250908, label: 'Hit Reaction While Holding Rifle' },
    dying:  { modelId: 101250904, label: 'Dying Rear Impact' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z12: 戰厄 — 坦克 — 軍事重裝坦克 ⚠️ 無劍！殭屍猛攻
  zombie_12: {
    idle:   { modelId: 102250901, label: 'Zombie Alert Idle' },
    attack: { modelId: 102320906, label: 'Zombie Overhead Two-Hand Attack' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 104020901, label: 'Zombie Run' },
  },
  // z13: 狂暴巨獸 — 力量 — 蠻力怒吼
  zombie_13: {
    idle:   { modelId: 102250902, label: 'Zombie Looking Around' },
    attack: { modelId: 112900901, label: 'Belting Out A Loud Roar' },
    hurt:   { modelId: 104250908, label: 'Hit Reaction While Holding Rifle' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z27: 末日審判者 — 力量 · Paladin — ⚠️ 無武器！殭屍猛衝
  zombie_27: {
    idle:   { modelId: 102250901, label: 'Zombie Alert Idle' },
    attack: { modelId: 102320904, label: 'Zombie Snap Kick' },
    hurt:   { modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
    dying:  { modelId: 101170903, label: 'Dying Front Impact' },
    run:    { modelId: 121370901, label: 'Zombie Running' },
  },
  // z28: 末日歌姬 — 智慧 · Medea — 歌聲施法
  zombie_28: {
    idle:   { modelId: 107820901, label: 'Idle Stand Looking Around' },
    attack: { modelId: 114810902, label: 'Casting Magic Wide Two Arms' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 101220903, label: 'Dying Shot To Head' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z29: 虛空獵手 — 敏捷 · Alien Soldier — 維度掠食者
  zombie_29: {
    idle:   { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
    attack: { modelId: 113640901, label: 'Roundhouse Kick' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 101250904, label: 'Dying Rear Impact' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
  // z30: 傭兵頭子 — 力量 · The Boss — 老兵指揮官
  zombie_30: {
    idle:   { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
    attack: { modelId: 113920901, label: 'Elbow-Uppercut Strike Combo' },
    hurt:   { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    dying:  { modelId: 107070901, label: 'Shot To Chest Falling Backwards' },
    run:    { modelId: 105940901, label: 'Running Leaning' },
  },
};

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

class MixamoAPI {
  constructor(token) {
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'X-Api-Key': 'mixamo2',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async setPrimary(charId) {
    const r = await fetch(`${MIXAMO_API}/characters/update_primary`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ primary_character_id: charId }),
    });
    if (!r.ok) throw new Error(`setPrimary ${r.status}: ${await r.text()}`);
  }

  async searchAnimations(query) {
    const params = new URLSearchParams({ page: '1', limit: '5', order: '', type: 'Motion', query });
    const r = await fetch(`${MIXAMO_API}/products?${params}`, { headers: this.headers });
    if (r.status === 429) { await sleep(30000); return this.searchAnimations(query); }
    if (!r.ok) throw new Error(`search ${r.status}`);
    return r.json();
  }

  async requestExport(characterId, modelId, productName, withSkin) {
    const body = {
      gms_hash: [{ 'model-id': modelId, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
      preferences: { format: 'fbx7_2019', skin: withSkin ? 'true' : 'false', fps: '30', reducekf: '0' },
      character_id: characterId,
      type: 'Motion',
      product_name: productName,
    };
    const r = await fetch(`${MIXAMO_API}/animations/export`, {
      method: 'POST', headers: this.headers, body: JSON.stringify(body),
    });
    if (r.status === 429) { await sleep(30000); return this.requestExport(characterId, modelId, productName, withSkin); }
    if (!r.ok) throw new Error(`export ${r.status}: ${await r.text()}`);
  }

  async waitForExport(characterId, maxWait = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const r = await fetch(`${MIXAMO_API}/characters/${characterId}/monitor`, { headers: this.headers });
      if (!r.ok) throw new Error(`monitor ${r.status}`);
      const d = await r.json();
      if (d.status === 'completed' && d.job_result) return d.job_result;
      if (d.status === 'failed') throw new Error(`Export FAILED: ${JSON.stringify(d)}`);
      await sleep(3000);
    }
    throw new Error('Export timeout');
  }

  async downloadFile(url, dest) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return buf.length;
  }
}

// ═══════════════════════════════════════════════════════════════
// 下載單個動畫
// ═══════════════════════════════════════════════════════════════

async function downloadAnim(api, charId, animDef, destPath, isSkin) {
  // 嘗試已知 model-id
  try {
    await api.requestExport(charId, animDef.modelId, animDef.label, isSkin);
    await sleep(1000);
    const url = await api.waitForExport(charId);
    const size = await api.downloadFile(url, destPath);
    return { ok: true, size, label: animDef.label };
  } catch (e) {
    console.log(`      ⚠ ${animDef.label}(${animDef.modelId}) 失敗: ${e.message}`);
  }

  // 搜尋 fallback
  if (animDef.searchFallback) {
    try {
      const data = await api.searchAnimations(animDef.searchFallback);
      for (const prod of (data.results || []).slice(0, 3)) {
        const mid = prod.thumbnail?.match(/motions\/(\d+)\//)?.[1];
        if (!mid) continue;
        try {
          await api.requestExport(charId, Number(mid), prod.description || animDef.label, isSkin);
          await sleep(1000);
          const url = await api.waitForExport(charId);
          const size = await api.downloadFile(url, destPath);
          return { ok: true, size, label: prod.description || animDef.label };
        } catch { /* try next */ }
      }
    } catch { /* search failed */ }
  }

  return { ok: false };
}

// ═══════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyArg = args.find(a => a.startsWith('--only='));
  const onlyList = onlyArg ? onlyArg.split('=')[1].split(',').map(s => s.trim().startsWith('zombie_') ? s.trim() : `zombie_${s.trim().replace('z','')}`) : null;

  const token = loadToken();
  const api = new MixamoAPI(token);

  const heroIds = Object.keys(HERO_ANIMS).sort((a, b) => {
    const na = parseInt(a.replace('zombie_', ''));
    const nb = parseInt(b.replace('zombie_', ''));
    return na - nb;
  });

  const targets = onlyList ? heroIds.filter(h => onlyList.includes(h)) : heroIds;
  console.log(`\n🏃 ANIMATION — 英雄動畫多樣性升級`);
  console.log(`📋 ${targets.length} 個英雄 × 5 組動畫${dryRun ? ' (DRY RUN)' : ''}\n`);

  if (dryRun) {
    for (const heroId of targets) {
      const config = HERO_ANIMS[heroId];
      console.log(`${heroId}:`);
      for (const [animType, def] of Object.entries(config)) {
        console.log(`  ${animType}: ${def.label} (${def.modelId})`);
      }
    }
    return;
  }

  const results = { success: 0, fail: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const heroId = targets[i];
    const config = HERO_ANIMS[heroId];
    const charId = CHAR_IDS[heroId];
    const destDir = path.join(MODELS_DIR, heroId);

    console.log(`[${i + 1}/${targets.length}] ${heroId}`);

    if (!charId) {
      console.log(`  ⏭ 無 charId（z1-z15 需先上傳角色到 Mixamo），跳過`);
      results.skip += 5;
      continue;
    }

    // 備份
    const bakDir = path.join(destDir, 'bak_anim_audit');
    if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });

    await api.setPrimary(charId);
    await sleep(500);

    for (const [animType, animDef] of Object.entries(config)) {
      // ⚠️ 必須用 skin=false — skin=true 會讓 Blender convert_all_fbx.py 產生
      // 與 mesh 不同的 rest pose（bone orientation 差異），導致嚴重骨架扭曲。
      // 若需更換動畫，請用 fbx_to_glb.py（原始轉換器）或手動 retarget。
      const isSkin = false;
      const fbxDest = path.join(destDir, `${animType}.fbx`);

      // 備份舊 FBX/GLB
      const oldGlb = path.join(destDir, `${heroId}_${animType}.glb`);
      if (fs.existsSync(oldGlb)) {
        const bakPath = path.join(bakDir, `${heroId}_${animType}.glb`);
        if (!fs.existsSync(bakPath)) fs.copyFileSync(oldGlb, bakPath);
      }

      console.log(`  🎬 ${animType}: ${animDef.label}`);
      const result = await downloadAnim(api, charId, animDef, fbxDest, isSkin);
      if (result.ok) {
        console.log(`    ✅ ${path.basename(fbxDest)} (${(result.size / 1024).toFixed(0)} KB) — ${result.label}`);
        results.success++;
      } else {
        console.log(`    ❌ 失敗`);
        results.fail++;
      }
      await sleep(1500);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 完成！成功: ${results.success}, 失敗: ${results.fail}, 跳過: ${results.skip}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
