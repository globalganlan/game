/**
 * Battle / Stage Routes — 戰鬥由後端完整執行，結算後發放獎勵
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, safeJsonParse } from '../utils/helpers.js';
import { runBattle } from '../domain/battleEngine.js';
import type { BattleHero } from '../domain/battleEngine.js';
import { getCurrencies, grantRewardsStmts } from './save.js';

const battle = new Hono<{ Bindings: Env; Variables: HonoVars }>();

/* ════════════════════════════════════
   每日次數限制
   ════════════════════════════════════ */

const DAILY_LIMITS: Record<string, number> = {
  daily: 3,
  pvp: 5,
  boss: 3,
};

interface DailyCounts {
  daily: number;
  pvp: number;
  boss: number;
  date: string; // "YYYY-MM-DD"
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDailyCounts(raw: string | null | undefined): DailyCounts {
  const fallback: DailyCounts = { daily: 0, pvp: 0, boss: 0, date: todayStr() };
  if (!raw) return fallback;
  const parsed = safeJsonParse<Partial<DailyCounts>>(raw, {});
  const today = todayStr();
  // 日期不同 → 重置
  if (parsed.date !== today) return { daily: 0, pvp: 0, boss: 0, date: today };
  return {
    daily: parsed.daily ?? 0,
    pvp: parsed.pvp ?? 0,
    boss: parsed.boss ?? 0,
    date: today,
  };
}

/** 檢查是否超過每日上限，回傳 remaining（-1 = 無限制） */
function checkDailyLimit(counts: DailyCounts, mode: string): { ok: boolean; used: number; limit: number } {
  const limit = DAILY_LIMITS[mode];
  if (!limit) return { ok: true, used: 0, limit: 0 }; // 無限制
  const used = (counts as unknown as Record<string, number>)[mode] ?? 0;
  return { ok: used < limit, used, limit };
}

/* ════════════════════════════════════
   每日副本獎勵配置（與前端 stageSystem.ts 同步）
   ════════════════════════════════════ */

interface DungeonRewardConfig {
  exp: number;
  gold: number;
  items: { itemId: string; quantity: number; dropRate: number }[];
}

const DUNGEON_CLASS_ITEM: Record<string, string> = {
  power_trial: 'asc_class_power',
  agility_trial: 'asc_class_agility',
  defense_trial: 'asc_class_defense',
};

function getDailyDungeonReward(stageId: string, tier: string): DungeonRewardConfig {
  // stageId 格式: "power_trial_easy" or "agility_trial_hard"
  // 嘗試解析 dungeonId
  const parts = stageId.split('_');
  const tierPart = parts.pop()!;
  const dungeonId = parts.join('_');
  const actualTier = tier || tierPart;
  const classItem = DUNGEON_CLASS_ITEM[dungeonId] ?? 'asc_class_power';

  const configs: Record<string, DungeonRewardConfig> = {
    easy: {
      exp: 0, gold: 500,
      items: [
        { itemId: classItem, quantity: 3, dropRate: 1.0 },
      ],
    },
    normal: {
      exp: 0, gold: 1000,
      items: [
        { itemId: classItem, quantity: 6, dropRate: 1.0 },
      ],
    },
    hard: {
      exp: 0, gold: 2000,
      items: [
        { itemId: classItem, quantity: 12, dropRate: 1.0 },
      ],
    },
  };
  return configs[actualTier] ?? configs['normal'];
}

/* ════════════════════════════════════
   Boss 獎勵配置（與前端 stageSystem.ts 同步）
   ════════════════════════════════════ */

interface BossThresholds { S: number; A: number; B: number; C: number }

const BOSS_THRESHOLDS: Record<string, BossThresholds> = {
  boss_1: { S: 15000, A: 10000, B: 5000, C: 2000 },
  boss_2: { S: 25000, A: 18000, B: 10000, C: 4000 },
  boss_3: { S: 40000, A: 28000, B: 15000, C: 6000 },
};

function getBossRewardByRank(bossId: string, rank: string): { exp: number; gold: number; diamond: number; items: { itemId: string; quantity: number }[] } {
  // Boss 倍率：boss_1=1.0, boss_2=1.5, boss_3=2.0
  const bossIdx = ['boss_1', 'boss_2', 'boss_3'].indexOf(bossId);
  const bossMult = [1.0, 1.5, 2.0][bossIdx] ?? 1.0;
  const table: Record<string, { exp: number; gold: number; diamond: number; items: { itemId: string; quantity: number }[] }> = {
    S: { exp: 600, gold: 3000, diamond: 100, items: [{ itemId: 'chest_equipment', quantity: 2 }] },
    A: { exp: 400, gold: 2000, diamond: 50, items: [{ itemId: 'chest_equipment', quantity: 1 }] },
    B: { exp: 200, gold: 1000, diamond: 20, items: [] },
    C: { exp: 100, gold: 500, diamond: 0, items: [] },
  };
  const base = table[rank] ?? table['C'];
  return {
    exp: Math.floor(base.exp * bossMult),
    gold: Math.floor(base.gold * bossMult),
    diamond: Math.floor(base.diamond * bossMult),
    items: base.items.map(it => ({ ...it, quantity: Math.floor(it.quantity * bossMult) || 1 })),
  };
}

// ── 統一戰鬥結算（後端完整執行） ───────────────
battle.post('/complete-battle', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);

  const stageMode = body.stageMode as string;
  const stageId = (body.stageId as string) || '';
  const players = body.players as BattleHero[];
  const enemies = body.enemies as BattleHero[];
  const maxTurns = Number(body.maxTurns) || 50;
  const seed = body.seed as number | undefined;

  if (!stageMode) return c.json({ success: false, error: 'missing stageMode' });
  if (!players || !enemies) return c.json({ success: false, error: 'missing battle data' });

  // 0. 載入存檔
  const saveData = await db.prepare('SELECT * FROM save_data WHERE playerId = ?')
    .bind(playerId).first<SaveDataRow>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  // 0b. 每日次數檢查（daily / pvp / boss）
  // 競技場挑戰（stageId = 'arena-N'）不消耗 pvp 每日次數，由 arena-challenge-complete 管理
  const isArena = stageMode === 'pvp' && stageId.startsWith('arena-');
  const dailyCounts = parseDailyCounts(saveData.dailyCounts);
  if (DAILY_LIMITS[stageMode] && !isArena) {
    const chk = checkDailyLimit(dailyCounts, stageMode);
    if (!chk.ok) {
      return c.json({
        success: false,
        error: 'daily_limit_exceeded',
        dailyCounts,
        used: chk.used,
        limit: chk.limit,
      });
    }
  }

  // 1. 後端執行完整戰鬥
  const battleResult = runBattle(players, enemies, maxTurns, seed);
  const winner = battleResult.winner;

  // 若玩家敗北 → 不發獎勵（Boss 例外：無論勝敗都依傷害量發放）
  if (winner !== 'player' && stageMode !== 'boss') {
    return c.json({
      success: true, winner,
      rewards: { gold: 0, exp: 0, diamond: 0, items: [] },
      isFirstClear: false,
      actions: battleResult.actions,
      dailyCounts,
    });
  }

  // 2. 模式分流 — 計算獎勵
  const rewardItems: { itemId: string; quantity: number }[] = [];
  let rewards = { gold: 0, exp: 0, diamond: 0, items: rewardItems };
  let isFirstClear = false;
  let newStoryProgress: { chapter: number; stage: number } | undefined;
  let newFloor: number | undefined;
  let bossRank: string | undefined;

  if (stageMode === 'story') {
    const parts = stageId.split('-');
    const ch = parseInt(parts[0]) || 1;
    const st = parseInt(parts[1]) || 1;

    const currentProgress = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
    const newProg = (ch - 1) * 8 + st;
    const curProg = (currentProgress.chapter - 1) * 8 + currentProgress.stage;
    isFirstClear = newProg >= curProg;

    // 從 stage_configs 讀取獎勵（優先），fallback 到公式
    const cfgRow = await db.prepare('SELECT rewards FROM stage_configs WHERE stageId = ?')
      .bind(stageId).first<{ rewards: string }>();
    if (cfgRow) {
      const cfgRewards = safeJsonParse<{ gold?: number; exp?: number; diamond?: number }>(cfgRow.rewards, {});
      rewards.gold = cfgRewards.gold ?? 0;
      rewards.exp = cfgRewards.exp ?? 0;
      rewards.diamond = cfgRewards.diamond ?? 0;
    } else {
      rewards.gold = 100 + ch * 50 + st * 20;
      rewards.exp = 50 + ch * 30 + st * 10;
      rewards.diamond = st === 8 ? 20 : 0;
    }

    if (newProg >= curProg) {
      let nextSt = st + 1, nextCh = ch;
      if (nextSt > 8) { nextCh = ch + 1; nextSt = 1; }
      newStoryProgress = { chapter: nextCh, stage: nextSt };
    }

    await db.prepare(
      `UPDATE save_data SET
        gold = gold + ?, diamond = diamond + ?, exp = exp + ?,
        storyProgress = COALESCE(?, storyProgress),
        resourceTimerStage = COALESCE(?, resourceTimerStage),
        lastSaved = ?
       WHERE playerId = ?`
    ).bind(
      rewards.gold, rewards.diamond, rewards.exp,
      newStoryProgress ? JSON.stringify(newStoryProgress) : null,
      newStoryProgress ? stageId : null,
      isoNow(), playerId
    ).run();

  } else if (stageMode === 'tower') {
    const floor = Number(stageId) || 1;
    const currentFloor = saveData.towerFloor || 0;
    if (floor > currentFloor + 1) {
      return c.json({ success: false, error: `wrong_floor: expected ${currentFloor + 1} got ${floor}` });
    }
    const isBoss = floor % 10 === 0;
    rewards.gold = 100 + floor * 20;
    rewards.exp = 50 + floor * 10;
    rewards.diamond = isBoss ? 50 : 0;
    // tower items
    if (isBoss) {
      rewards.items.push({ itemId: 'chest_equipment', quantity: 1 });
    } else if (floor % 5 === 0) {
      if (Math.random() < 0.5) rewards.items.push({ itemId: 'exp', quantity: 500 });
    }
    newFloor = floor + 1;  // 下一層（已通關 floor，下次從 floor+1 開始）

    // 發放獎勵（含道具）
    const grantList: { itemId: string; quantity: number }[] = [
      { itemId: 'gold', quantity: rewards.gold },
      { itemId: 'diamond', quantity: rewards.diamond },
      { itemId: 'exp', quantity: rewards.exp },
      ...rewards.items,
    ];
    const stmts = grantRewardsStmts(db, playerId, grantList);
    stmts.push(
      db.prepare('UPDATE save_data SET towerFloor = ?, lastSaved = ? WHERE playerId = ?')
        .bind(floor + 1, isoNow(), playerId)
    );
    await db.batch(stmts);

  } else if (stageMode === 'pvp') {
    // 競技場挑戰（stageId 為 'arena-N'）由 arena-challenge-complete 處理獎勵
    // battle-complete 不應重複發放，只需記錄次數
    const isArena = stageId.startsWith('arena-');

    if (!isArena) {
      const sp = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
      const progress = (sp.chapter - 1) * 8 + sp.stage;
      // 難度倍率：stageId 格式 "pvp_0" / "pvp_1" / "pvp_2"
      const diffIdx = parseInt(stageId.split('_').pop() ?? '0') || 0;
      const diffMult = [1.0, 1.5, 2.0][diffIdx] ?? 1.0;
      rewards.gold = Math.floor((200 + progress * 40) * diffMult);
      rewards.exp = Math.floor((80 + progress * 10) * diffMult);
      rewards.diamond = Math.floor(10 * diffMult);
      // pvp_coin — 與前端 getPvPReward 同步
      const pvpCoinQty = Math.floor((3 + Math.floor(progress / 4)) * diffMult);
      rewards.items.push({ itemId: 'pvp_coin', quantity: pvpCoinQty });

      const grantList: { itemId: string; quantity: number }[] = [
        { itemId: 'gold', quantity: rewards.gold },
        { itemId: 'diamond', quantity: rewards.diamond },
        { itemId: 'exp', quantity: rewards.exp },
        { itemId: 'pvp_coin', quantity: pvpCoinQty },
      ];
      const stmts = grantRewardsStmts(db, playerId, grantList);
      // 消耗次數
      dailyCounts.pvp += 1;
      stmts.push(
        db.prepare('UPDATE save_data SET dailyCounts = ?, lastSaved = ? WHERE playerId = ?')
          .bind(JSON.stringify(dailyCounts), isoNow(), playerId)
      );
      await db.batch(stmts);
    } else {
      // 競技場：不發獎勵（由 arena-challenge-complete 處理），也不消耗 pvp 次數
      // rewards 保持全零，前端不顯示 battle-complete 的獎勵
    }

  } else if (stageMode === 'boss') {
    // 計算 totalDamage（從 finalPlayers.totalDamageDealt 加總）
    const totalDamage = (battleResult.finalPlayers ?? [])
      .reduce((sum: number, h: BattleHero) => sum + (h.totalDamageDealt ?? 0), 0);

    const thresholds = BOSS_THRESHOLDS[stageId];
    let rank = 'C';
    if (thresholds) {
      if (totalDamage >= thresholds.S) rank = 'S';
      else if (totalDamage >= thresholds.A) rank = 'A';
      else if (totalDamage >= thresholds.B) rank = 'B';
    }
    bossRank = rank;
    const bossReward = getBossRewardByRank(stageId, rank);
    rewards.gold = bossReward.gold;
    rewards.exp = bossReward.exp;
    rewards.diamond = bossReward.diamond;
    rewards.items = bossReward.items;

    // 消耗次數
    dailyCounts.boss += 1;

    const grantList: { itemId: string; quantity: number }[] = [
      { itemId: 'gold', quantity: rewards.gold },
      { itemId: 'diamond', quantity: rewards.diamond },
      { itemId: 'exp', quantity: rewards.exp },
      ...bossReward.items,
    ];
    const stmts = grantRewardsStmts(db, playerId, grantList);
    stmts.push(
      db.prepare('UPDATE save_data SET dailyCounts = ?, lastSaved = ? WHERE playerId = ?')
        .bind(JSON.stringify(dailyCounts), isoNow(), playerId)
    );
    await db.batch(stmts);

  } else if (stageMode === 'daily') {
    const tier = (body.dungeonTier as string) || 'normal';
    const dungeonReward = getDailyDungeonReward(stageId, tier);
    rewards.gold = dungeonReward.gold;
    rewards.exp = dungeonReward.exp;

    // 處理掉落（含機率掉落）
    for (const item of dungeonReward.items) {
      if (item.dropRate >= 1.0 || Math.random() < item.dropRate) {
        rewards.items.push({ itemId: item.itemId, quantity: item.quantity });
      }
    }

    // 消耗次數
    dailyCounts.daily += 1;

    const grantList: { itemId: string; quantity: number }[] = [
      { itemId: 'gold', quantity: rewards.gold },
      { itemId: 'exp', quantity: rewards.exp },
      ...rewards.items,
    ];
    const stmts = grantRewardsStmts(db, playerId, grantList);
    stmts.push(
      db.prepare('UPDATE save_data SET dailyCounts = ?, lastSaved = ? WHERE playerId = ?')
        .bind(JSON.stringify(dailyCounts), isoNow(), playerId)
    );
    await db.batch(stmts);
  }

  const currencies = await getCurrencies(db, playerId);

  return c.json({
    success: true, winner, rewards,
    isFirstClear,
    newStoryProgress, newFloor,
    bossRank,
    actions: battleResult.actions,
    currencies,
    dailyCounts,
  });
});

// ── 主線通關（舊版相容） ──────────────────
battle.post('/complete-stage', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const stageId = body.stageId as string;
  if (!stageId) return c.json({ success: false, error: 'missing stageId' });

  const saveData = await db.prepare('SELECT * FROM save_data WHERE playerId = ?')
    .bind(playerId).first<SaveDataRow>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  const parts = stageId.split('-');
  const ch = parseInt(parts[0]) || 1;
  const st = parseInt(parts[1]) || 1;

  const currentProgress = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
  const newProg = (ch - 1) * 8 + st;
  const curProg = (currentProgress.chapter - 1) * 8 + currentProgress.stage;
  const isFirstClear = newProg >= curProg;

  const rewards = { gold: 0, exp: 0, diamond: 0 };

  // 從 stage_configs 讀取獎勵（優先），fallback 到公式
  const cfgRow = await db.prepare('SELECT rewards FROM stage_configs WHERE stageId = ?')
    .bind(stageId).first<{ rewards: string }>();
  if (cfgRow) {
    const cfgRewards = safeJsonParse<{ gold?: number; exp?: number; diamond?: number }>(cfgRow.rewards, {});
    rewards.gold = cfgRewards.gold ?? 0;
    rewards.exp = cfgRewards.exp ?? 0;
    rewards.diamond = cfgRewards.diamond ?? 0;
  } else {
    rewards.gold = 100 + ch * 50 + st * 20;
    rewards.exp = 50 + ch * 30 + st * 10;
    rewards.diamond = st === 8 ? 20 : 0;
  }

  let newStoryProgress2: { chapter: number; stage: number } | undefined;
  if (newProg >= curProg) {
    let nextSt = st + 1, nextCh = ch;
    if (nextSt > 8) { nextCh++; nextSt = 1; }
    newStoryProgress2 = { chapter: nextCh, stage: nextSt };
  }

  await db.prepare(
    `UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?,
     storyProgress = COALESCE(?, storyProgress), resourceTimerStage = COALESCE(?, resourceTimerStage),
     lastSaved = ? WHERE playerId = ?`
  ).bind(
    rewards.gold, rewards.diamond, rewards.exp ?? 0,
    newStoryProgress2 ? JSON.stringify(newStoryProgress2) : null,
    newStoryProgress2 ? stageId : null, isoNow(), playerId
  ).run();

  return c.json({ success: true, rewards, isFirstClear, newStoryProgress: newStoryProgress2 });
});

// ── 爬塔通關（舊版相容） ──────────────────
battle.post('/complete-tower', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const floor = Number(body.floor);
  if (!floor || floor < 1) return c.json({ success: false, error: 'invalid floor' });

  const saveData = await c.env.DB.prepare('SELECT towerFloor FROM save_data WHERE playerId = ?')
    .bind(playerId).first<Pick<SaveDataRow, 'towerFloor'>>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  if (floor > (saveData.towerFloor || 0) + 1) {
    return c.json({ success: false, error: 'wrong_floor' });
  }

  const isBoss = floor % 10 === 0;
  const rewards = {
    gold: 100 + floor * 20,
    diamond: isBoss ? 50 : 0,
    exp: 50 + floor * 10,
  };

  await c.env.DB.prepare(
    'UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?, towerFloor = ?, lastSaved = ? WHERE playerId = ?'
  ).bind(rewards.gold, rewards.diamond, rewards.exp, floor + 1, isoNow(), playerId).run();

  return c.json({ success: true, rewards, newFloor: floor + 1 });
});

// ── 每日副本（舊版相容） ──────────────────
battle.post('/complete-daily', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const tier = (body.tier as string) || 'normal';

  const tierMult: Record<string, number> = { easy: 1, normal: 1.5, hard: 2 };
  const mult = tierMult[tier] ?? 1;
  const rewards = { gold: Math.floor(500 * mult), exp: Math.floor(200 * mult) };

  await c.env.DB.prepare(
    'UPDATE save_data SET gold = gold + ?, exp = exp + ?, lastSaved = ? WHERE playerId = ?'
  ).bind(rewards.gold, rewards.exp, isoNow(), playerId).run();

  return c.json({ success: true, rewards });
});

// ── 試煉場對手列表（後端權威生成） ──────────
const ZOMBIE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

battle.post('/pvp-opponents', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const saveData = await db.prepare('SELECT storyProgress FROM save_data WHERE playerId = ?')
    .bind(playerId).first<{ storyProgress: string }>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  const sp = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
  const progress = (sp.chapter - 1) * 8 + sp.stage;

  const today = new Date();
  const daySeed = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
  const rng = seededRandom(daySeed + progress * 7);

  const names = ['暗影獵人', '末日行者', '腐蝕之王', '殭屍領主', '瘟疫使者', '深淵守望者'];
  const opponents = [];

  for (let i = 0; i < 3; i++) {
    const enemyCount = Math.min(6, 3 + Math.floor(progress / 6) + i);
    const hpMult = 1.0 + progress * 0.10 + i * 0.3;
    const atkMult = 1.0 + progress * 0.06 + i * 0.2;
    const spdMult = 1.0 + progress * 0.01;
    const enemies = [];
    for (let j = 0; j < enemyCount; j++) {
      enemies.push({
        heroId: ZOMBIE_IDS[Math.floor(rng() * ZOMBIE_IDS.length)],
        slot: j,
        levelMultiplier: 1,
        hpMultiplier: hpMult,
        atkMultiplier: atkMult,
        speedMultiplier: spdMult,
      });
    }
    const nameIdx = Math.floor(rng() * names.length);
    const power = Math.floor((hpMult + atkMult) * 1000 + enemyCount * 500);
    opponents.push({
      opponentId: `pvp_${i}`,
      name: names[nameIdx],
      power,
      enemies,
    });
  }

  return c.json({ success: true, opponents });
});

// ── 查詢每日剩餘次數 ──────────────────────
battle.post('/daily-counts', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const row = await db.prepare('SELECT dailyCounts FROM save_data WHERE playerId = ?')
    .bind(playerId).first<{ dailyCounts: string }>();
  if (!row) return c.json({ success: false, error: 'save_not_found' });
  const counts = parseDailyCounts(row.dailyCounts);
  return c.json({ success: true, dailyCounts: counts, limits: DAILY_LIMITS });
});

// ── 純戰鬥模擬 ──────────────────────────
battle.post('/run-battle', async (c) => {
  const body = await c.req.json<{
    players: BattleHero[]; enemies: BattleHero[];
    maxTurns?: number; seed?: number;
  }>();
  if (!body.players?.length || !body.enemies?.length) {
    return c.json({ success: false, error: 'players and enemies arrays are required' });
  }
  const result = runBattle(body.players, body.enemies, body.maxTurns, body.seed);
  return c.json({ success: true, winner: result.winner, actions: result.actions });
});

export default battle;
