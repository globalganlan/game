/**
 * GlobalGanLan Backend — Cloudflare Workers + D1 + Hono
 *
 * 主入口：組裝所有路由群組，掛載 CORS 和 Auth 中介層
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, HonoVars } from './types.js';
import { authMiddleware } from './middleware/auth.js';

// Route modules
import auth from './routes/auth.js';
import save from './routes/save.js';
import inventory from './routes/inventory.js';
import progression from './routes/progression.js';
import battle from './routes/battle.js';
import gacha from './routes/gacha.js';
import mail from './routes/mail.js';
import arena from './routes/arena.js';
import checkin from './routes/checkin.js';
import data from './routes/data.js';
import stage from './routes/stage.js';

import { insertMail } from './routes/mail.js';
import { isoNow } from './utils/helpers.js';

const app = new Hono<{ Bindings: Env; Variables: HonoVars }>();

// ── CORS ──────────────────────────────────
app.use('*', cors({
  origin: (origin) => {
    // 本地開發任意 localhost port
    if (origin.startsWith('http://localhost:')) return origin;
    // 正式環境白名單
    const allowed = [
      'https://globalganlan.pages.dev',
      'https://globalganlan.github.io',
    ];
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// ── Health check ──────────────────────────
app.get('/', (c) => c.json({ status: 'ok', service: 'globalganlan-api' }));

// ── Auth routes (不需要驗證) ───────────────
app.route('/api/auth', auth);

// ── 需要驗證的路由 ────────────────────────
const protectedApi = new Hono<{ Bindings: Env; Variables: HonoVars }>();
protectedApi.use('*', authMiddleware);
protectedApi.route('/', save);
protectedApi.route('/', inventory);
protectedApi.route('/', progression);
protectedApi.route('/', battle);
protectedApi.route('/', gacha);
protectedApi.route('/', mail);
protectedApi.route('/', arena);
protectedApi.route('/', checkin);
protectedApi.route('/', data);
protectedApi.route('/', stage);

app.route('/api', protectedApi);

// ── 404 ───────────────────────────────────
app.notFound((c) => c.json({ success: false, error: 'not_found' }, 404));

// ── Error handler ─────────────────────────
app.onError((err, c) => {
  console.error('[API Error]', err.message, err.stack);
  return c.json({ success: false, error: 'internal_error', message: err.message }, 500);
});

export default app;

// ── Scheduled (Cron) Handler ─────────────
const ARENA_DAILY_REWARDS: Record<string, { diamond: number; gold: number; pvpCoin: number }> = {
  '10': { diamond: 50, gold: 15000, pvpCoin: 30 },
  '50': { diamond: 30, gold: 8000, pvpCoin: 15 },
  '100': { diamond: 20, gold: 5000, pvpCoin: 10 },
  '200': { diamond: 10, gold: 3000, pvpCoin: 5 },
  '500': { diamond: 5, gold: 1000, pvpCoin: 2 },
};

/** 競技場每日排名獎勵 — UTC 16:05 (= UTC+8 00:05) */
async function arenaDailyReward(db: D1Database) {
  const thresholds = [10, 50, 100, 200, 500];
  let mailsSent = 0;

  for (const th of thresholds) {
    const lower = th === 10 ? 1 : thresholds[thresholds.indexOf(th) - 1] + 1;
    const rows = await db.prepare(
      'SELECT rank, playerId, isNPC FROM arena_rankings WHERE rank >= ? AND rank <= ? AND isNPC = 0'
    ).bind(lower, th).all<{ rank: number; playerId: string; isNPC: number }>();

    const rw = ARENA_DAILY_REWARDS[String(th)];
    if (!rw) continue;

    for (const row of (rows.results || [])) {
      const rewards = [
        { itemId: 'diamond', quantity: rw.diamond },
        { itemId: 'gold', quantity: rw.gold },
        { itemId: 'currency_pvp_coin', quantity: rw.pvpCoin },
      ];
      await insertMail(
        db, row.playerId,
        `⚔️ 競技場每日獎勵 (第${row.rank}名)`,
        `恭喜！您的競技場排名為第 ${row.rank} 名，這是今日的排名獎勵。`,
        rewards,
      );
      mailsSent++;
    }
  }
  console.log(`[Cron] arenaDailyReward: sent ${mailsSent} mails`);
}

/** 競技場每週重置 — 每週一 UTC 16:00 (= UTC+8 00:00) */
async function arenaWeeklyReset(db: D1Database) {
  // 重置所有真人玩家回 NPC
  const now = isoNow();
  const humanRows = await db.prepare(
    'SELECT rank, playerId FROM arena_rankings WHERE isNPC = 0'
  ).all<{ rank: number; playerId: string }>();

  const PREFIXES = ['暗影', '末日', '鐵血', '荒野', '幽靈', '狂暴', '冰霜', '烈焰', '鏽蝕', '黎明', '血月', '迷霧'];
  const SUFFIXES = ['獵人', '倖存者', '戰士', '指揮官', '護衛', '遊蕩者', '潛伏者', '收割者', '守望者', '流浪者'];

  for (const row of (humanRows.results || [])) {
    const seed = row.rank * 31337;
    const pi = seed % PREFIXES.length;
    const si = (seed * 7 + 13) % SUFFIXES.length;
    const npcName = PREFIXES[pi] + SUFFIXES[si];
    const power = Math.floor(500 + (500 - row.rank) * 20);
    await db.prepare(
      `UPDATE arena_rankings SET playerId = ?, displayName = ?, isNPC = 1, power = ?, defenseFormation = '[]', lastUpdated = ? WHERE rank = ?`
    ).bind(`npc_${row.rank}`, npcName, power, now, row.rank).run();
  }

  // 重置所有玩家的 arenaHighestRank
  await db.prepare('UPDATE save_data SET arenaHighestRank = 500').run();

  console.log(`[Cron] arenaWeeklyReset: reset ${(humanRows.results || []).length} human ranks`);
}

export const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  const cron = event.cron;
  console.log(`[Cron] triggered: ${cron}`);

  if (cron === '5 16 * * *') {
    // 每日 UTC 16:05 = UTC+8 00:05 → 競技場每日獎勵
    await arenaDailyReward(env.DB);
  } else if (cron === '0 16 * * 1') {
    // 每週一 UTC 16:00 = UTC+8 00:00 → 競技場每週重置
    await arenaWeeklyReset(env.DB);
  }
};
