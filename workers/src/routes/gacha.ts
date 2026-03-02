/**
 * Gacha Routes — 英雄抽卡、裝備抽卡
 *
 * v2: 移除預生成 pool 機制，每次抽卡即時生成結果
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, safeJsonParse } from '../utils/helpers.js';
import { upsertItemStmt } from './save.js';

const gacha = new Hono<{ Bindings: Env; Variables: HonoVars }>();

// 抽卡機率
const RATE_SSR = 0.015;
const RATE_SR = 0.10;
const RATE_R = 0.35;

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
  if (count !== 1 && count !== 10) return c.json({ success: false, error: 'invalid_count' });

  const saveData = await db.prepare('SELECT diamond, gachaPity FROM save_data WHERE playerId = ?')
    .bind(playerId).first<Pick<SaveDataRow, 'diamond' | 'gachaPity'>>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  const cost = count === 10 ? 1440 : 160;
  if ((saveData.diamond || 0) < cost) return c.json({ success: false, error: 'insufficient_diamond' });

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
  writeStmts.push(db.prepare(
    `UPDATE save_data SET diamond = diamond - ?, gachaPity = ?, lastSaved = ? WHERE playerId = ?`
  ).bind(cost, JSON.stringify(newPityState), isoNow(), playerId));

  await db.batch(writeStmts);

  return c.json({
    success: true, results, diamondCost: cost, newPityState,
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
  if (count !== 1 && count !== 10) return c.json({ success: false, error: 'invalid_count' });
  const poolType = body.poolType as string;
  if (poolType !== 'gold' && poolType !== 'diamond') return c.json({ success: false, error: 'invalid_pool_type' });

  const saveData = await db.prepare('SELECT gold, diamond FROM save_data WHERE playerId = ?')
    .bind(playerId).first<Pick<SaveDataRow, 'gold' | 'diamond'>>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  let cost: number;
  let currencyField: 'gold' | 'diamond';
  if (poolType === 'gold') {
    cost = count === 10 ? 90000 : 10000;
    currencyField = 'gold';
    if ((saveData.gold || 0) < cost) return c.json({ success: false, error: 'insufficient_gold' });
  } else {
    cost = count === 10 ? 1800 : 200;
    currencyField = 'diamond';
    if ((saveData.diamond || 0) < cost) return c.json({ success: false, error: 'insufficient_diamond' });
  }

  // 扣款 + 持久化裝備（原子交易）
  const eqStmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE save_data SET ${currencyField} = ${currencyField} - ?, lastSaved = ? WHERE playerId = ?`
    ).bind(cost, isoNow(), playerId),
  ];

  // 持久化 client 給的裝備
  const rawEquip = body.equipment;
  const newEquips: any[] = Array.isArray(rawEquip) ? rawEquip
    : typeof rawEquip === 'string' ? (() => { try { return JSON.parse(rawEquip); } catch { return []; } })()
    : [];
  for (const eq of newEquips) {
    eqStmts.push(db.prepare(
      `INSERT INTO equipment_instances
       (playerId, equipId, templateId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy, locked, obtainedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      playerId, eq.equipId || `eq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      eq.templateId || '', eq.setId || '', eq.slot || '', eq.rarity || 'N',
      eq.mainStat || '', eq.mainStatValue ?? eq.mainValue ?? 0,
      eq.enhanceLevel ?? eq.level ?? 0, JSON.stringify(eq.subStats || []),
      '', eq.locked ? 1 : 0, isoNow(),
    ));
  }

  await db.batch(eqStmts);

  return c.json({
    success: true, poolType, count: newEquips.length,
    currencyCost: cost,
  });
});

export default gacha;
