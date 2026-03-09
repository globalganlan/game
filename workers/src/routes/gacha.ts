/**
 * Gacha Routes — 英雄抽卡、裝備抽卡
 *
 * v4: 召喚券 + 每日免費單抽（英雄 & 裝備） + 鍛造券 + 十連無折扣
 *   - gacha_ticket_hero: 英雄召喚券，可抵扣鑽石
 *   - gacha_ticket_equip: 裝備鍛造券，可抵扣鑽石池費用
 *   - 每日免費英雄單抽一次（lastHeroFreePull 追蹤）
 *   - 每日免費裝備鑽石池單抽一次（lastEquipFreePull 追蹤）
 *   - 十連：券不足時剩餘以鑽石補差（無折扣，= 10 × 單抽）
 *   - 所有回應返回 currencies（後端唯一權威）
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, safeJsonParse } from '../utils/helpers.js';
import { upsertItemStmt, getCurrencies } from './save.js';

const gacha = new Hono<{ Bindings: Env; Variables: HonoVars }>();

// 抽卡機率
const RATE_SSR = 0.015;
const RATE_SR = 0.10;
const RATE_R = 0.35;

// 費用常數（十連無折扣，= 10 × 單抽）
const HERO_SINGLE_DIAMOND = 160;
const HERO_TEN_DIAMOND = 1600;
const EQUIP_DIAMOND_SINGLE = 200;
const EQUIP_DIAMOND_TEN = 2000;

/** 取得 UTC+8 日期字串（YYYY-MM-DD） */
function getTaipeiDateStr(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const taipei = new Date(utc + 8 * 3600000);
  const y = taipei.getFullYear();
  const m = String(taipei.getMonth() + 1).padStart(2, '0');
  const d = String(taipei.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 讀取玩家某道具數量 */
async function getItemQuantity(db: D1Database, playerId: string, itemId: string): Promise<number> {
  const row = await db.prepare('SELECT quantity FROM inventory WHERE playerId = ? AND itemId = ?')
    .bind(playerId, itemId).first<{ quantity: number }>();
  return row?.quantity ?? 0;
}

interface GachaEntry { h: number; r: string; f: boolean }
interface PityState { pullsSinceLastSSR: number; guaranteedFeatured: boolean }

// ── 即時產出抽卡結果 ────────────────
function generateGachaEntries(
  heroPool: { heroId: number; rarity: string }[],
  startPity: PityState,
  count: number,
): { entries: GachaEntry[]; endPity: PityState } {
  const entries: GachaEntry[] = [];
  let pullsSinceSSR = startPity.pullsSinceLastSSR || 0;
  let guaranteedFeatured = startPity.guaranteedFeatured || false;

  for (let i = 0; i < count; i++) {
    let effectiveSSR = RATE_SSR;
    if (pullsSinceSSR + 1 >= 90) effectiveSSR = 1.0;
    else if (pullsSinceSSR + 1 >= 75) effectiveSSR = RATE_SSR + (pullsSinceSSR + 1 - 75) * 0.05;

    const roll = Math.random();
    let rarity: string;
    if (roll < effectiveSSR) rarity = 'SSR';
    else if (roll < effectiveSSR + RATE_SR) rarity = 'SR';
    else if (roll < effectiveSSR + RATE_SR + RATE_R) rarity = 'R';
    else rarity = 'N';

    const candidates = heroPool.filter(hp => hp.rarity === rarity);
    const pool = candidates.length > 0 ? candidates : heroPool;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    const isFeatured = false;

    if (rarity === 'SSR') { pullsSinceSSR = 0; guaranteedFeatured = !isFeatured; }
    else { pullsSinceSSR++; }

    entries.push({ h: selected.heroId, r: rarity, f: isFeatured });
  }
  return { entries, endPity: { pullsSinceLastSSR: pullsSinceSSR, guaranteedFeatured } };
}

// ── upsertItem (此模組內用) ──────────────
// 已移至 save.ts 的 upsertItemStmt，此處保留向下相容別名
const upsertItemInternal = upsertItemStmt;

// ════════════════════════════════════════════
// Gacha Pull (英雄) — 即時生成，不依賴預生成池
// ════════════════════════════════════════════
gacha.post('/gacha-pull', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);

  const count = Number(body.count) || 1;
  if (![1, 10, 100].includes(count)) return c.json({ success: false, error: 'invalid_count' });
  const isFree = body.isFree === true;  // 每日免費單抽

  const saveData = await db.prepare('SELECT diamond, gachaPity, lastHeroFreePull FROM save_data WHERE playerId = ?')
    .bind(playerId).first<Pick<SaveDataRow, 'diamond' | 'gachaPity'> & { lastHeroFreePull?: string }>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  // ── 計算費用：免費 / 召喚券 / 鑽石混合 ──
  let diamondCost = 0;
  let ticketsUsed = 0;
  let freePullUsed = false;

  if (isFree && count === 1) {
    // 每日免費單抽
    const today = getTaipeiDateStr();
    const lastFree = (saveData as any).lastHeroFreePull || '';
    if (lastFree === today) return c.json({ success: false, error: 'free_pull_already_used' });
    freePullUsed = true;
    // 免費不消耗任何資源
  } else {
    // 查詢召喚券數量
    const tickets = await getItemQuantity(db, playerId, 'gacha_ticket_hero');

    if (count === 1) {
      if (tickets >= 1) {
        ticketsUsed = 1;
      } else {
        diamondCost = HERO_SINGLE_DIAMOND;
      }
    } else {
      // 多連：券不足以鑽石補（每張券抵 160 鑽）
      const use = Math.min(tickets, count);
      ticketsUsed = use;
      const remaining = count - use;
      const bulkCost = count * HERO_SINGLE_DIAMOND; // 無折扣
      diamondCost = remaining > 0 ? (remaining === count ? bulkCost : remaining * HERO_SINGLE_DIAMOND) : 0;
    }

    if (diamondCost > 0 && (saveData.diamond || 0) < diamondCost) {
      return c.json({ success: false, error: 'insufficient_diamond' });
    }
  }

  // 讀取保底狀態
  const pityState = safeJsonParse<PityState>(saveData.gachaPity, { pullsSinceLastSSR: 0, guaranteedFeatured: false });

  // 載入英雄池
  const heroPoolRows = await db.prepare('SELECT heroId, rarity FROM heroes').all<{ heroId: number; rarity: string }>();
  const heroPool = heroPoolRows.results || [];
  if (heroPool.length === 0) return c.json({ success: false, error: 'no_heroes_in_pool' });

  // 即時生成抽卡結果
  const gen = generateGachaEntries(heroPool, pityState, count);

  // 載入已有英雄
  const heroInstRows = await db.prepare('SELECT heroId FROM hero_instances WHERE playerId = ?')
    .bind(playerId).all<{ heroId: number }>();
  const ownedSet = new Set((heroInstRows.results || []).map(h => h.heroId));

  // rarity lookup map
  const heroRarityMap = new Map(heroPool.map(h => [h.heroId, h.rarity]));

  const results: { heroId: number; rarity: string; isNew: boolean; isFeatured: boolean; stardust: number; fragments: number }[] = [];
  const newHeroes: { heroId: number; instanceId: string }[] = [];
  const writeStmts: D1PreparedStatement[] = [];

  for (let p = 0; p < gen.entries.length; p++) {
    const entry = gen.entries[p];
    const heroId = entry.h;
    const rarity = entry.r;
    const isFeatured = entry.f || false;
    const isNew = !ownedSet.has(heroId);

    let stardust = 0;
    let fragments = 0;

    if (isNew) {
      const instId = `${playerId}_${heroId}_${Date.now()}_${p}`;
      writeStmts.push(db.prepare(
        `INSERT INTO hero_instances (playerId, instanceId, heroId, level, exp, ascension, equippedItems, obtainedAt, stars)
         VALUES (?, ?, ?, 1, 0, 0, '{}', ?, 0)`
      ).bind(playerId, instId, heroId, isoNow()));
      ownedSet.add(heroId);
      newHeroes.push({ heroId, instanceId: instId });
    } else {
      const dustMap: Record<string, number> = { SSR: 25, SR: 5, R: 1, N: 1 };
      const fragMap: Record<string, number> = { N: 5, R: 5, SR: 15, SSR: 40 };
      const heroRar = heroRarityMap.get(heroId) || 'N';
      stardust = dustMap[rarity] || 0;
      fragments = fragMap[heroRar] || 5;
      if (stardust > 0) writeStmts.push(upsertItemInternal(db, playerId, 'currency_stardust', stardust));
      if (fragments > 0) writeStmts.push(upsertItemInternal(db, playerId, `asc_fragment_${heroId}`, fragments));
    }

    results.push({ heroId, rarity, isNew, isFeatured, stardust, fragments });
  }

  const newPityState = gen.endPity;

  // 扣款：鑽石 + 券 + 免費標記
  if (diamondCost > 0) {
    writeStmts.push(db.prepare(
      `UPDATE save_data SET diamond = diamond - ?, gachaPity = ?, lastSaved = ? WHERE playerId = ?`
    ).bind(diamondCost, JSON.stringify(newPityState), isoNow(), playerId));
  } else {
    writeStmts.push(db.prepare(
      `UPDATE save_data SET gachaPity = ?, lastSaved = ? WHERE playerId = ?`
    ).bind(JSON.stringify(newPityState), isoNow(), playerId));
  }
  if (ticketsUsed > 0) {
    writeStmts.push(upsertItemInternal(db, playerId, 'gacha_ticket_hero', -ticketsUsed));
  }
  if (freePullUsed) {
    writeStmts.push(db.prepare(
      `UPDATE save_data SET lastHeroFreePull = ? WHERE playerId = ?`
    ).bind(getTaipeiDateStr(), playerId));
  }

  await db.batch(writeStmts);
  const currencies = await getCurrencies(db, playerId);

  return c.json({
    success: true, results, diamondCost, ticketsUsed, freePullUsed, newPityState, currencies, newHeroes,
  });
});

// ════════════════════════════════════════════
// Reset Gacha Pity (QA 用)
// ════════════════════════════════════════════
gacha.post('/reset-gacha-pool', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const cleanPity: PityState = { pullsSinceLastSSR: 0, guaranteedFeatured: false };
  await db.prepare(
    `UPDATE save_data SET gachaPity = ?, lastSaved = ? WHERE playerId = ?`
  ).bind(JSON.stringify(cleanPity), isoNow(), playerId).run();

  return c.json({ success: true, pityReset: true, startPity: cleanPity });
});

// ════════════════════════════════════════════
// Equipment Gacha Pull (裝備抽卡 — client 生成裝備, server 扣款+持久化)
// ════════════════════════════════════════════
gacha.post('/equip-gacha-pull', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);

  const count = Number(body.count) || 1;
  if (![1, 10, 100].includes(count)) return c.json({ success: false, error: 'invalid_count' });
  const poolType = body.poolType as string;
  if (poolType !== 'gold' && poolType !== 'diamond') return c.json({ success: false, error: 'invalid_pool_type' });
  const isFree = body.isFree === true;  // 每日免費單抽

  const saveData = await db.prepare('SELECT gold, diamond, lastEquipFreePull FROM save_data WHERE playerId = ?')
    .bind(playerId).first<Pick<SaveDataRow, 'gold' | 'diamond'> & { lastEquipFreePull?: string }>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  let cost: number;
  let currencyField: 'gold' | 'diamond';
  let ticketsUsed = 0;
  let freePullUsed = false;

  if (isFree && count === 1 && poolType === 'diamond') {
    // 每日免費裝備單抽（限鑽石池）
    const today = getTaipeiDateStr();
    const lastFree = (saveData as any).lastEquipFreePull || '';
    if (lastFree === today) return c.json({ success: false, error: 'free_pull_already_used' });
    freePullUsed = true;
    cost = 0;
    currencyField = 'diamond';
  } else if (poolType === 'gold') {
    // 金幣池：不用券，直接扣金幣
    cost = count === 100 ? 900000 : count === 10 ? 90000 : 10000;
    currencyField = 'gold';
    if ((saveData.gold || 0) < cost) return c.json({ success: false, error: 'insufficient_gold' });
  } else {
    // 鑽石池：優先使用鍛造券
    const tickets = await getItemQuantity(db, playerId, 'gacha_ticket_equip');
    currencyField = 'diamond';

    if (count === 1) {
      if (tickets >= 1) {
        ticketsUsed = 1;
        cost = 0;
      } else {
        cost = EQUIP_DIAMOND_SINGLE;
      }
    } else {
      const use = Math.min(tickets, count);
      ticketsUsed = use;
      const remaining = count - use;
      const bulkCost = count === 100 ? 20000 : EQUIP_DIAMOND_TEN;
      cost = remaining > 0 ? (remaining === count ? bulkCost : remaining * EQUIP_DIAMOND_SINGLE) : 0;
    }

    if (cost > 0 && (saveData.diamond || 0) < cost) {
      return c.json({ success: false, error: 'insufficient_diamond' });
    }
  }

  // 扣款 + 持久化裝備（原子交易）
  const eqStmts: D1PreparedStatement[] = [];

  if (cost > 0) {
    eqStmts.push(db.prepare(
      `UPDATE save_data SET ${currencyField} = ${currencyField} - ?, lastSaved = ? WHERE playerId = ?`
    ).bind(cost, isoNow(), playerId));
  } else {
    eqStmts.push(db.prepare(
      `UPDATE save_data SET lastSaved = ? WHERE playerId = ?`
    ).bind(isoNow(), playerId));
  }
  if (ticketsUsed > 0) {
    eqStmts.push(upsertItemStmt(db, playerId, 'gacha_ticket_equip', -ticketsUsed));
  }
  if (freePullUsed) {
    eqStmts.push(db.prepare(
      `UPDATE save_data SET lastEquipFreePull = ? WHERE playerId = ?`
    ).bind(getTaipeiDateStr(), playerId));
  }

  // 持久化 client 給的裝備
  const rawEquip = body.equipment;
  const newEquips: any[] = Array.isArray(rawEquip) ? rawEquip
    : typeof rawEquip === 'string' ? (() => { try { return JSON.parse(rawEquip); } catch { return []; } })()
    : [];
  for (const eq of newEquips) {
    eqStmts.push(db.prepare(
      `INSERT OR IGNORE INTO equipment_instances
       (playerId, equipId, templateId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy, locked, obtainedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      playerId, eq.equipId || `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eq.templateId || '', eq.setId || '', eq.slot || '', eq.rarity || 'N',
      eq.mainStat || '', eq.mainStatValue ?? eq.mainValue ?? 0,
      eq.enhanceLevel ?? eq.level ?? 0, JSON.stringify(eq.subStats || []),
      '', eq.locked ? 1 : 0, isoNow(),
    ));
  }

  await db.batch(eqStmts);
  const currencies = await getCurrencies(db, playerId);

  return c.json({
    success: true, poolType, count: newEquips.length,
    currencyCost: cost, ticketsUsed, freePullUsed, currencies,
  });
});

export default gacha;
