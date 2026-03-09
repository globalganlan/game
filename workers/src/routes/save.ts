/**
 * Save Routes — 存檔載入/初始化/增量存檔/陣型/英雄新增/離線資源
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow, HeroInstanceRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, safeJsonParse, uuid } from '../utils/helpers.js';

const save = new Hono<{ Bindings: Env; Variables: HonoVars }>();

// ── 共用：upsertItem（單條 SQL，支援 batch） ──
export function upsertItemStmt(db: D1Database, playerId: string, itemId: string, delta: number): D1PreparedStatement {
  const now = isoNow();
  return db.prepare(
    `INSERT INTO inventory (playerId, itemId, quantity, updatedAt)
     VALUES (?1, ?2, MAX(0, ?3), ?4)
     ON CONFLICT(playerId, itemId) DO UPDATE SET
       quantity = MAX(0, inventory.quantity + ?3),
       updatedAt = ?4`
  ).bind(playerId, itemId, delta, now);
}

/** 向下相容：直接執行 upsertItem */
export async function upsertItem(db: D1Database, playerId: string, itemId: string, delta: number) {
  await upsertItemStmt(db, playerId, itemId, delta).run();
}

/** 共用：發放獎勵 — 回傳 D1PreparedStatement[]（可丟入 batch） */
export function grantRewardsStmts(
  db: D1Database,
  playerId: string,
  rewards: Array<{ itemId: string; quantity: number }>
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  // 合併同類資源，避免重複 UPDATE 同一欄位
  const resourceDeltas: Record<string, number> = {};
  const itemDeltas: Array<{ itemId: string; quantity: number }> = [];

  for (const r of rewards) {
    if (!r.itemId || (r.quantity || 0) <= 0) continue;
    if (r.itemId === 'gold' || r.itemId === 'diamond' || r.itemId === 'exp') {
      resourceDeltas[r.itemId] = (resourceDeltas[r.itemId] || 0) + r.quantity;
    } else if (r.itemId === 'stardust' || r.itemId === 'currency_stardust') {
      // stardust 統一寫入 inventory.currency_stardust（與 gacha 一致，前端從 inventory 讀取）
      itemDeltas.push({ itemId: 'currency_stardust', quantity: r.quantity });
    } else {
      itemDeltas.push(r);
    }
  }

  // save_data 資源更新（合併為單條）
  const resCols = Object.keys(resourceDeltas);
  if (resCols.length > 0) {
    const sets = resCols.map(col => `${col} = ${col} + ?`).join(', ');
    const vals = resCols.map(col => resourceDeltas[col]);
    stmts.push(
      db.prepare(`UPDATE save_data SET ${sets} WHERE playerId = ?`).bind(...vals, playerId)
    );
  }

  // inventory 道具
  for (const r of itemDeltas) {
    stmts.push(upsertItemStmt(db, playerId, r.itemId, r.quantity));
  }

  return stmts;
}

/** 向下相容：直接執行 grantRewards */
export async function grantRewards(
  db: D1Database,
  playerId: string,
  rewards: Array<{ itemId: string; quantity: number }>
) {
  const stmts = grantRewardsStmts(db, playerId, rewards);
  if (stmts.length > 0) await db.batch(stmts);
}

/** 共用：讀取玩家當前貨幣（後端唯一權威，所有資源變更 API 必須回傳） */
export async function getCurrencies(db: D1Database, playerId: string): Promise<{ gold: number; diamond: number; exp: number }> {
  const row = await db.prepare('SELECT gold, diamond, exp FROM save_data WHERE playerId = ?')
    .bind(playerId).first<{ gold: number; diamond: number; exp: number }>();
  return row ?? { gold: 0, diamond: 0, exp: 0 };
}

// ── 載入存檔 ──────────────────────────────────
save.post('/load-save', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const saveData = await db.prepare(
    'SELECT * FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<SaveDataRow>();

  if (!saveData) {
    return c.json({ success: true, isNew: true, saveData: null, heroes: [] });
  }

  const heroes = await db.prepare(
    'SELECT * FROM hero_instances WHERE playerId = ?'
  ).bind(playerId).all<HeroInstanceRow>();

  // 解析 JSON 欄位
  const parsedSave = {
    ...saveData,
    storyProgress: safeJsonParse(saveData.storyProgress, { chapter: 1, stage: 1 }),
    formation: safeJsonParse(saveData.formation, [null, null, null, null, null, null]),
    gachaPity: safeJsonParse(saveData.gachaPity, { pullsSinceLastSSR: 0, guaranteedFeatured: false }),
  };

  const parsedHeroes = heroes.results.map((h) => ({
    ...h,
    equippedItems: safeJsonParse(h.equippedItems, {}),
  }));

  // 已擁有英雄 ID 清單
  const ownedHeroIds = [...new Set(parsedHeroes.map((h) => h.heroId))];

  return c.json({
    success: true,
    saveData: parsedSave,
    heroes: parsedHeroes,
    isNew: false,
    ownedHeroIds,
  });
});

// ── 初始化存檔（新玩家） ──────────────────────
save.post('/init-save', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  // 檢查是否已存在
  const existing = await db.prepare(
    'SELECT 1 FROM save_data WHERE playerId = ?'
  ).bind(playerId).first();
  if (existing) {
    return c.json({ success: true, alreadyExists: true });
  }

  const now = isoNow();

  // 贈送初始英雄（3 隻）：無名活屍(6/N) + 女喪屍(1/R) + 倖存者(9/R)
  const starterHeroIds = [6, 1, 9];
  const starterInstanceIds: string[] = [];
  const autoFormation = [String(starterHeroIds[0]), String(starterHeroIds[1]), String(starterHeroIds[2]), null, null, null];

  const stmts: D1PreparedStatement[] = [];

  // 建立存檔
  stmts.push(db.prepare(
    `INSERT INTO save_data (
      playerId, displayName, diamond, gold, stardust,
      resourceTimerStage, resourceTimerLastCollect,
      towerFloor, storyProgress, formation, lastSaved,
      gachaPity,
      checkinDay, checkinLastDate,
      arenaChallengesLeft, arenaHighestRank, arenaLastReset,
      pwaRewardClaimed
    ) VALUES (
      ?, ?, 500, 10000, 0,
      '1-1', ?,
      0, '{"chapter":1,"stage":1}', ?, ?,
      '{"pullsSinceLastSSR":0,"guaranteedFeatured":false}',
      0, '',
      5, 500, '',
      0
    )`
  ).bind(
    playerId,
    '倖存者#' + playerId.replace('P', ''),
    now,
    JSON.stringify(autoFormation),
    now
  ));

  // 初始英雄
  for (let i = 0; i < starterHeroIds.length; i++) {
    const hid = starterHeroIds[i];
    const instId = `${playerId}_${hid}_${Date.now() + i}`;
    starterInstanceIds.push(instId);

    stmts.push(db.prepare(
      `INSERT INTO hero_instances (instanceId, playerId, heroId, level, exp, ascension, equippedItems, obtainedAt, stars)
       VALUES (?, ?, ?, 1, 0, 0, '{}', ?, 0)`
    ).bind(instId, playerId, hid, now));
  }

  // 原子批次寫入（含建存檔 + 英雄 + 陣型）
  await db.batch(stmts);

  return c.json({
    success: true,
    alreadyExists: false,
    starterHeroInstanceId: starterInstanceIds[0],
  });
});

// ── 儲存陣型 ──────────────────────────────────
save.post('/save-formation', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  if (!body.formation) return c.json({ success: false, error: 'missing formation' });

  const now = isoNow();
  await c.env.DB.prepare(
    'UPDATE save_data SET formation = ?, lastSaved = ? WHERE playerId = ?'
  ).bind(JSON.stringify(body.formation), now, playerId).run();

  return c.json({ success: true });
});

// ── 新增英雄 ──────────────────────────────────
save.post('/add-hero', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const heroId = body.heroId as number | undefined;
  if (!heroId) return c.json({ success: false, error: 'missing heroId' });

  const instanceId = `${playerId}_${heroId}_${Date.now()}`;
  const now = isoNow();

  await c.env.DB.prepare(
    `INSERT INTO hero_instances (instanceId, playerId, heroId, level, exp, ascension, equippedItems, obtainedAt, stars)
     VALUES (?, ?, ?, 1, 0, 0, '{}', ?, 0)`
  ).bind(instanceId, playerId, heroId, now).run();

  return c.json({ success: true, instanceId });
});

// ── 離線資源領取 ──────────────────────────────
save.post('/collect-resources', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const saveData = await db.prepare(
    'SELECT * FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<SaveDataRow>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  const stageId = saveData.resourceTimerStage || '1-1';
  const lastCollect = saveData.resourceTimerLastCollect;
  if (!lastCollect) return c.json({ success: false, error: 'timer_not_started' });

  // 尚未通關 1-1 → 離線獎勵未解鎖
  const sp = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
  if (sp.chapter === 1 && sp.stage === 1) {
    return c.json({ success: true, gold: 0, exp: 0, message: 'not_unlocked' });
  }

  const elapsed = (Date.now() - new Date(lastCollect).getTime()) / (3600 * 1000);
  const hours = Math.min(24, Math.max(0, elapsed));

  const parts = stageId.split('-');
  const ch = parseInt(parts[0]) || 1;
  const st = parseInt(parts[1]) || 1;
  const progress = (ch - 1) * 8 + st;
  const goldPerHour = 100 + progress * 50;
  const expPerHour = Math.max(100, progress * 50);

  const goldGain = Math.floor(goldPerHour * hours);
  const expGain = Math.floor(expPerHour * hours);

  if (goldGain <= 0 && expGain <= 0) {
    return c.json({ success: true, gold: 0, exp: 0, message: 'nothing_to_collect' });
  }

  const now = isoNow();
  const newGold = saveData.gold + goldGain;
  const newExp = (saveData.exp ?? 0) + expGain;

  await db.prepare(
    'UPDATE save_data SET gold = ?, exp = ?, resourceTimerLastCollect = ?, lastSaved = ? WHERE playerId = ?'
  ).bind(newGold, newExp, now, now, playerId).run();

  return c.json({
    success: true,
    gold: goldGain,
    exp: expGain,
    newGoldTotal: newGold,
    newExpTotal: newExp,
    hoursElapsed: Math.round(hours * 10) / 10,
    currencies: { gold: newGold, diamond: saveData.diamond ?? 0, exp: newExp },
    resourceTimerLastCollect: now,
  });
});

export default save;
