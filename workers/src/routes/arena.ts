/**
 * Arena Routes — 競技場排行榜、挑戰、防守陣型
 */
import { Hono } from 'hono';
import type { Env, HonoVars, ArenaRankingRow, SaveDataRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, todayUTC8 } from '../utils/helpers.js';
import { upsertItemStmt, getCurrencies } from './save.js';

const arena = new Hono<{ Bindings: Env; Variables: HonoVars }>();

const ARENA_MAX_RANK = 500;

const NPC_PREFIXES = ['暗影', '末日', '鐵血', '荒野', '幽靈', '狂暴', '冰霜', '烈焰', '鏽蝕', '黎明', '血月', '迷霧'];
const NPC_SUFFIXES = ['獵人', '倖存者', '戰士', '指揮官', '護衛', '遊蕩者', '潛伏者', '收割者', '守望者', '流浪者'];

const MILESTONES = [
  { rank: 400, diamond: 20, gold: 5000, pvpCoin: 10 },
  { rank: 300, diamond: 30, gold: 10000, pvpCoin: 20 },
  { rank: 200, diamond: 50, gold: 20000, pvpCoin: 30 },
  { rank: 100, diamond: 100, gold: 50000, pvpCoin: 50 },
  { rank: 50, diamond: 150, gold: 80000, pvpCoin: 80 },
  { rank: 20, diamond: 200, gold: 100000, pvpCoin: 100 },
  { rank: 10, diamond: 300, gold: 150000, pvpCoin: 150 },
  { rank: 1, diamond: 500, gold: 300000, pvpCoin: 300 },
];

// ── 確保 arena 表有 500 NPC ────────────
async function ensureArenaInit(db: D1Database) {
  const count = await db.prepare('SELECT COUNT(*) as c FROM arena_rankings').first<{ c: number }>();
  if (count && count.c >= ARENA_MAX_RANK) return;

  const now = isoNow();
  const stmts: D1PreparedStatement[] = [];
  for (let r = 1; r <= ARENA_MAX_RANK; r++) {
    const seed = r * 31337;
    const pi = seed % NPC_PREFIXES.length;
    const si = (seed * 7 + 13) % NPC_SUFFIXES.length;
    const name = NPC_PREFIXES[pi] + NPC_SUFFIXES[si];
    const power = Math.floor(500 + (ARENA_MAX_RANK - r) * 20);
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO arena_rankings (rank, playerId, displayName, isNPC, power, defenseFormation, lastUpdated)
         VALUES (?, ?, ?, 1, ?, '[]', ?)`
      ).bind(r, `npc_${r}`, name, power, now)
    );
  }
  // D1 batch max 100 statements at a time
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
}

// ════════════════════════════════════════════
// Get Rankings
// ════════════════════════════════════════════
arena.post('/arena-get-rankings', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  await ensureArenaInit(db);

  // 找到玩家排名
  const myRow = await db.prepare('SELECT rank FROM arena_rankings WHERE playerId = ?')
    .bind(playerId).first<{ rank: number }>();
  const myRank = myRow?.rank ?? ARENA_MAX_RANK;

  // top 20 + 自己前後 5
  const lo = Math.max(1, myRank - 5);
  const hi = myRank + 5;
  const rows = await db.prepare(
    `SELECT rank, playerId, displayName, isNPC, power FROM arena_rankings
     WHERE rank <= 20 OR (rank >= ? AND rank <= ?) ORDER BY rank`
  ).bind(lo, hi).all<ArenaRankingRow>();

  // 挑戰次數 (daily reset)
  let challengesLeft = 5;
  let highestRank = ARENA_MAX_RANK;

  const saveData = await db.prepare(
    'SELECT arenaChallengesLeft, arenaHighestRank, arenaLastReset FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'arenaChallengesLeft' | 'arenaHighestRank' | 'arenaLastReset'>>();

  if (saveData) {
    const today = todayUTC8();
    const lastReset = (saveData.arenaLastReset || '').split('T')[0];
    if (lastReset !== today) {
      challengesLeft = 5;
      await db.prepare('UPDATE save_data SET arenaChallengesLeft = 5, arenaLastReset = ? WHERE playerId = ?')
        .bind(isoNow(), playerId).run();
    } else {
      challengesLeft = saveData.arenaChallengesLeft ?? 5;
    }
    highestRank = saveData.arenaHighestRank ?? ARENA_MAX_RANK;
  }

  return c.json({
    success: true,
    rankings: (rows.results || []).map(r => ({
      rank: r.rank, playerId: r.playerId, displayName: r.displayName,
      isNPC: !!r.isNPC, power: r.power || 0,
    })),
    myRank, challengesLeft, highestRank,
  });
});

// ════════════════════════════════════════════
// Challenge Start
// ════════════════════════════════════════════
arena.post('/arena-challenge-start', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const targetRank = Number(body.targetRank);
  if (!targetRank || targetRank < 1) return c.json({ success: false, error: 'invalid_rank' });

  await ensureArenaInit(db);
  const defender = await db.prepare(
    'SELECT playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE rank = ?'
  ).bind(targetRank).first<ArenaRankingRow>();

  if (!defender) return c.json({ success: false, error: 'rank_not_found' });

  return c.json({
    success: true,
    defenderData: {
      displayName: defender.displayName,
      power: defender.power || 0,
      isNPC: !!defender.isNPC,
      heroes: [],
    },
  });
});

// ════════════════════════════════════════════
// Challenge Complete — 排名交換 + 獎勵
// ════════════════════════════════════════════
arena.post('/arena-challenge-complete', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const targetRank = Number(body.targetRank);
  const won = body.won === true || body.won === 'true';
  const displayName = (body.displayName as string) || '倖存者';

  await ensureArenaInit(db);

  // ── 讀取階段 ─────────────────────────────
  let challengerRow = await db.prepare('SELECT rank FROM arena_rankings WHERE playerId = ?')
    .bind(playerId).first<{ rank: number }>();

  // 玩家不在排行榜 → 佔據最後一個 NPC（前置設定，不影響主批次）
  if (!challengerRow) {
    const lastNpc = await db.prepare(
      'SELECT rank, playerId FROM arena_rankings WHERE isNPC = 1 ORDER BY rank DESC LIMIT 1'
    ).first<{ rank: number; playerId: string }>();
    if (lastNpc) {
      await db.prepare(
        'UPDATE arena_rankings SET playerId = ?, displayName = ?, isNPC = 0, lastUpdated = ? WHERE rank = ?'
      ).bind(playerId, displayName, isoNow(), lastNpc.rank).run();
      challengerRow = { rank: lastNpc.rank };
    }
  }

  const challengerRank = challengerRow?.rank ?? ARENA_MAX_RANK;

  const saveData = await db.prepare(
    'SELECT arenaChallengesLeft, arenaHighestRank FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'arenaChallengesLeft' | 'arenaHighestRank'>>();

  const challengesLeft = Math.max(0, (saveData?.arenaChallengesLeft ?? 5) - 1);

  const rewards = won
    ? { diamond: 0, gold: 2000, pvpCoin: 5 }
    : { diamond: 0, gold: 500, pvpCoin: 1 };

  let milestoneReward: { diamond: number; gold: number; pvpCoin: number } | null = null;
  let newRank = challengerRank;

  // ── 寫入階段 — 收集所有 stmts ──────────────
  const writeStmts: D1PreparedStatement[] = [];
  const now = isoNow();

  // 排名交換（勝利 + 排名上升）
  if (won && targetRank < challengerRank) {
    newRank = targetRank;

    const defenderRow = await db.prepare(
      'SELECT playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE rank = ?'
    ).bind(targetRank).first<ArenaRankingRow>();
    const challengerRow2 = await db.prepare(
      'SELECT playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE rank = ?'
    ).bind(challengerRank).first<ArenaRankingRow>();

    if (defenderRow && challengerRow2) {
      writeStmts.push(
        db.prepare(
          'UPDATE arena_rankings SET playerId=?, displayName=?, isNPC=?, power=?, defenseFormation=?, lastUpdated=? WHERE rank=?'
        ).bind(
          challengerRow2.playerId, challengerRow2.displayName, challengerRow2.isNPC,
          challengerRow2.power, challengerRow2.defenseFormation, now, targetRank
        ),
        db.prepare(
          'UPDATE arena_rankings SET playerId=?, displayName=?, isNPC=?, power=?, defenseFormation=?, lastUpdated=? WHERE rank=?'
        ).bind(
          defenderRow.playerId, defenderRow.displayName, defenderRow.isNPC,
          defenderRow.power, defenderRow.defenseFormation, now, challengerRank
        ),
      );
    }

    // 里程碑
    const prevHighest = saveData?.arenaHighestRank ?? ARENA_MAX_RANK;
    if (newRank < prevHighest) {
      for (const m of MILESTONES) {
        if (newRank <= m.rank && prevHighest > m.rank) {
          milestoneReward = { diamond: m.diamond, gold: m.gold, pvpCoin: m.pvpCoin };
          break;
        }
      }
    }
  }

  // 合併 save_data 寫入（挑戰次數 + 最高排名 + 金幣鑽石）→ 單一 UPDATE
  const setParts: string[] = ['arenaChallengesLeft = ?'];
  const bindVals: (string | number)[] = [challengesLeft];

  const prevHighest = saveData?.arenaHighestRank ?? ARENA_MAX_RANK;
  if (newRank < prevHighest) {
    setParts.push('arenaHighestRank = ?');
    bindVals.push(newRank);
  }

  const totalGold = rewards.gold + (milestoneReward?.gold || 0);
  const totalDiamond = rewards.diamond + (milestoneReward?.diamond || 0);
  if (totalGold > 0) { setParts.push('gold = gold + ?'); bindVals.push(totalGold); }
  if (totalDiamond > 0) { setParts.push('diamond = diamond + ?'); bindVals.push(totalDiamond); }

  setParts.push('lastSaved = ?');
  bindVals.push(now);
  bindVals.push(playerId);

  writeStmts.push(
    db.prepare(`UPDATE save_data SET ${setParts.join(', ')} WHERE playerId = ?`).bind(...bindVals)
  );

  // pvpCoin → inventory（使用 upsertItemStmt 取代手動 SELECT+INSERT/UPDATE）
  const pvpCoinTotal = rewards.pvpCoin + (milestoneReward?.pvpCoin || 0);
  if (pvpCoinTotal > 0) {
    writeStmts.push(upsertItemStmt(db, playerId, 'currency_pvp_coin', pvpCoinTotal));
  }

  // 原子批次寫入
  await db.batch(writeStmts);
  const currencies = await getCurrencies(db, playerId);

  return c.json({ success: true, won, newRank, challengesLeft, rewards, milestoneReward, currencies });
});

// ════════════════════════════════════════════
// Set Defense
// ════════════════════════════════════════════
arena.post('/arena-set-defense', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const defenseFormation = JSON.stringify(body.defenseFormation || []);

  const result = await c.env.DB.prepare(
    'UPDATE arena_rankings SET defenseFormation = ?, lastUpdated = ? WHERE playerId = ?'
  ).bind(defenseFormation, isoNow(), playerId).run();

  if (result.meta.changes === 0) return c.json({ success: false, error: 'player_not_in_arena' });
  return c.json({ success: true });
});

// ════════════════════════════════════════════
// Get Defense
// ════════════════════════════════════════════
arena.post('/arena-get-defense', async (c) => {
  const playerId = c.get('playerId');
  const row = await c.env.DB.prepare('SELECT defenseFormation FROM arena_rankings WHERE playerId = ?')
    .bind(playerId).first<{ defenseFormation: string }>();
  return c.json({ success: true, defenseFormation: row?.defenseFormation || '[]' });
});

export default arena;
