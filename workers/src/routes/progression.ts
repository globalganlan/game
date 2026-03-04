/**
 * Progression Routes — 英雄升級/突破/升星、裝備強化/拆解
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow, HeroInstanceRow, HeroRow, EquipmentInstanceRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { upsertItem, upsertItemStmt, getCurrencies } from './save.js';
import { isoNow } from '../utils/helpers.js';

const progression = new Hono<{ Bindings: Env; Variables: HonoVars }>();

/** 解析前端暫時 local_ ID → 查找真正的 server instanceId */
async function resolveInstanceId(db: D1Database, playerId: string, instanceId: string): Promise<string | null> {
  if (!instanceId.startsWith('local_')) return instanceId;
  const parts = instanceId.split('_');
  const heroId = Number(parts[1]);
  if (!heroId || heroId <= 0) return null;
  const row = await db.prepare(
    'SELECT instanceId FROM hero_instances WHERE playerId = ? AND heroId = ? LIMIT 1'
  ).bind(playerId, heroId).first<{ instanceId: string }>();
  return row?.instanceId ?? null;
}

// 每級所需經驗（簡化公式：level * 100）
function expForLevel(level: number): number {
  return level * 100;
}

// 突破階段 → 最大等級
const ASCENSION_LEVEL_CAP: Record<number, number> = {
  0: 20, 1: 40, 2: 60, 3: 80, 4: 90, 5: 100,
};

// 升星碎片消耗
const STAR_FRAGMENT_COST = [5, 10, 20, 40, 80, 160];

// ── 英雄升級（使用 EXP 資源） ──────────────────────────────────
progression.post('/upgrade-hero', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const rawInstanceId = body.instanceId as string;
  const expAmount = Number(body.expAmount) || 0;
  // 舊版 materials 格式已廢棄（exp_core 已移除），僅保留參數解析以防舊版客戶端
  const materials = body.materials as Array<{ itemId: string; quantity: number }> | undefined;
  let totalExpInput = expAmount;
  if ((!totalExpInput || totalExpInput <= 0) && materials?.length) {
    // legacy: exp_core_s/m/l 已於 v2.4 移除，此映射僅供極舊客戶端相容
    const EXP_MATERIALS: Record<string, number> = { exp_core_s: 100, exp_core_m: 500, exp_core_l: 2000 };
    for (const mat of materials) {
      totalExpInput += (EXP_MATERIALS[mat.itemId] || 0) * (Number(mat.quantity) || 0);
    }
  }
  if (!rawInstanceId || totalExpInput <= 0) return c.json({ success: false, error: 'missing params' });

  // 解析 local_ 暫時 ID
  const instanceId = await resolveInstanceId(db, playerId, rawInstanceId);
  if (!instanceId) return c.json({ success: false, error: 'hero_not_found' });

  const hero = await db.prepare(
    'SELECT * FROM hero_instances WHERE instanceId = ? AND playerId = ?'
  ).bind(instanceId, playerId).first<HeroInstanceRow>();
  if (!hero) return c.json({ success: false, error: 'hero_not_found' });

  // 檢查玩家 EXP 資源
  const saveData = await db.prepare(
    'SELECT exp FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<{ exp: number }>();
  const playerExp = saveData?.exp ?? 0;
  const usableExp = Math.min(totalExpInput, playerExp);
  if (usableExp <= 0) return c.json({ success: false, error: 'insufficient_exp' });

  // 逐級升級
  const levelCap = ASCENSION_LEVEL_CAP[hero.ascension] ?? 20;
  let level = hero.level;
  let exp = hero.exp + usableExp;

  while (level < levelCap) {
    const needed = expForLevel(level);
    if (exp >= needed) {
      exp -= needed;
      level++;
    } else {
      break;
    }
  }
  if (level >= levelCap) {
    level = levelCap;
    exp = 0;
  }

  // 原子交易：扣 EXP + 升等
  await db.batch([
    db.prepare(
      'UPDATE save_data SET exp = exp - ? WHERE playerId = ?'
    ).bind(usableExp, playerId),
    db.prepare(
      'UPDATE hero_instances SET level = ?, exp = ? WHERE instanceId = ?'
    ).bind(level, exp, instanceId),
  ]);

  return c.json({
    success: true,
    newLevel: level,
    newExp: exp,
    expConsumed: usableExp,
    currencies: await getCurrencies(db, playerId),
  });
});

// ── 英雄突破 ──────────────────────────────────
progression.post('/ascend-hero', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const rawInstanceId = body.instanceId as string;
  if (!rawInstanceId) return c.json({ success: false, error: 'missing instanceId' });

  const instanceId = await resolveInstanceId(db, playerId, rawInstanceId);
  if (!instanceId) return c.json({ success: false, error: 'hero_not_found' });

  const hero = await db.prepare(
    'SELECT * FROM hero_instances WHERE instanceId = ? AND playerId = ?'
  ).bind(instanceId, playerId).first<HeroInstanceRow>();
  if (!hero) return c.json({ success: false, error: 'hero_not_found' });

  if (hero.ascension >= 5) return c.json({ success: false, error: 'max_ascension' });
  const levelCap = ASCENSION_LEVEL_CAP[hero.ascension] ?? 20;
  if (hero.level < levelCap) return c.json({ success: false, error: 'level_not_at_cap' });

  // 碎片消耗（asc_fragment_{heroId}）
  const fragId = `asc_fragment_${hero.heroId}`;
  const fragCost = [10, 20, 30, 50, 80][hero.ascension] ?? 30;
  const fragRow = await db.prepare(
    'SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?'
  ).bind(playerId, fragId).first<{ quantity: number }>();
  if ((fragRow?.quantity ?? 0) < fragCost) return c.json({ success: false, error: 'insufficient_fragments' });

  // 職業石消耗
  const heroData = await db.prepare(
    'SELECT type FROM heroes WHERE heroId = ?'
  ).bind(hero.heroId).first<Pick<HeroRow, 'type'>>();
  const classStoneMap: Record<string, string> = {
    Power: 'asc_class_power', Agility: 'asc_class_agility', Defense: 'asc_class_defense',
  };
  const classStoneId = classStoneMap[heroData?.type || ''] || 'asc_class_universal';
  const classCost = [5, 10, 15, 20, 30][hero.ascension] ?? 10;
  const classRow = await db.prepare(
    'SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?'
  ).bind(playerId, classStoneId).first<{ quantity: number }>();
  if ((classRow?.quantity ?? 0) < classCost) return c.json({ success: false, error: 'insufficient_class_stones' });

  // 金幣消耗
  const goldCost = [5000, 10000, 20000, 40000, 80000][hero.ascension] ?? 10000;
  const saveData = await db.prepare(
    'SELECT gold FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'gold'>>();
  if ((saveData?.gold ?? 0) < goldCost) return c.json({ success: false, error: 'insufficient_gold' });

  const newAscension = hero.ascension + 1;

  // 原子交易：扣碎片 + 扣職業石 + 扣金幣 + 突破
  await db.batch([
    upsertItemStmt(db, playerId, fragId, -fragCost),
    upsertItemStmt(db, playerId, classStoneId, -classCost),
    db.prepare(
      'UPDATE save_data SET gold = gold - ? WHERE playerId = ?'
    ).bind(goldCost, playerId),
    db.prepare(
      'UPDATE hero_instances SET ascension = ? WHERE instanceId = ?'
    ).bind(newAscension, instanceId),
  ]);

  return c.json({
    success: true,
    newAscension,
    newLevelCap: ASCENSION_LEVEL_CAP[newAscension] ?? 20,
    currencies: await getCurrencies(db, playerId),
  });
});

// ── 英雄升星 ──────────────────────────────────
progression.post('/star-up-hero', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const rawInstanceId = body.instanceId as string;
  if (!rawInstanceId) return c.json({ success: false, error: 'missing instanceId' });

  const instanceId = await resolveInstanceId(db, playerId, rawInstanceId);
  if (!instanceId) return c.json({ success: false, error: 'hero_not_found' });

  const hero = await db.prepare(
    'SELECT * FROM hero_instances WHERE instanceId = ? AND playerId = ?'
  ).bind(instanceId, playerId).first<HeroInstanceRow>();
  if (!hero) return c.json({ success: false, error: 'hero_not_found' });
  if (hero.stars >= 6) return c.json({ success: false, error: 'max_stars' });

  const fragId = `asc_fragment_${hero.heroId}`;
  const cost = STAR_FRAGMENT_COST[hero.stars] ?? 999;
  const fragRow = await db.prepare(
    'SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?'
  ).bind(playerId, fragId).first<{ quantity: number }>();
  if ((fragRow?.quantity ?? 0) < cost) return c.json({ success: false, error: 'insufficient_fragments' });

  const newStars = hero.stars + 1;

  // 原子交易：扣碎片 + 升星
  await db.batch([
    upsertItemStmt(db, playerId, fragId, -cost),
    db.prepare(
      'UPDATE hero_instances SET stars = ? WHERE instanceId = ?'
    ).bind(newStars, instanceId),
  ]);

  return c.json({ success: true, newStars, fragmentsConsumed: cost });
});

// ── 裝備強化 ──────────────────────────────────
progression.post('/enhance-equipment', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const equipId = body.equipId as string;
  if (!equipId) return c.json({ success: false, error: 'missing equipId' });

  const equip = await db.prepare(
    'SELECT * FROM equipment_instances WHERE equipId = ? AND playerId = ?'
  ).bind(equipId, playerId).first<EquipmentInstanceRow>();
  if (!equip) return c.json({ success: false, error: 'equip_not_found' });

  // 金幣消耗（依稀有度）
  const baseGoldMap: Record<string, number> = { N: 200, R: 500, SR: 1000, SSR: 2000 };
  const baseGold = baseGoldMap[equip.rarity] || 500;
  const goldCost = Math.floor(baseGold * (1 + equip.enhanceLevel * 0.3));

  const saveData = await db.prepare(
    'SELECT gold FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'gold'>>();
  if ((saveData?.gold ?? 0) < goldCost) return c.json({ success: false, error: 'insufficient_gold' });

  const newLevel = equip.enhanceLevel + 1;
  // 主屬性由前端根據 base + enhanceLevel 計算顯示值
  // 不再更新 mainStatValue，避免 compound growth 與前端 linear 公式不一致

  // 原子交易：扣金幣 + 強化
  await db.batch([
    db.prepare(
      'UPDATE save_data SET gold = gold - ? WHERE playerId = ?'
    ).bind(goldCost, playerId),
    db.prepare(
      'UPDATE equipment_instances SET enhanceLevel = ? WHERE equipId = ?'
    ).bind(newLevel, equipId),
  ]);

  return c.json({
    success: true,
    newLevel,
    newMainStatValue: equip.mainStatValue,  // 回傳 base 值，前端自行計算
    goldConsumed: goldCost,
    currencies: await getCurrencies(db, playerId),
  });
});

export default progression;
