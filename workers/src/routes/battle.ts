/**
 * Battle / Stage Routes — 戰鬥由後端完整執行，結算後發放獎勵
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, safeJsonParse } from '../utils/helpers.js';
import { runBattle } from '../domain/battleEngine.js';
import type { BattleHero } from '../domain/battleEngine.js';
import { getCurrencies } from './save.js';

const battle = new Hono<{ Bindings: Env; Variables: HonoVars }>();

// ── 統一戰鬥結算（後端完整執行） ───────────────
battle.post('/complete-battle', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);

  const stageMode = body.stageMode as string;
  const stageId = (body.stageId as string) || '';
  const starsEarned = Math.max(1, Math.min(3, Number(body.starsEarned) || 1));
  const players = body.players as BattleHero[];
  const enemies = body.enemies as BattleHero[];
  const maxTurns = Number(body.maxTurns) || 50;
  const seed = body.seed as number | undefined;

  if (!stageMode) return c.json({ success: false, error: 'missing stageMode' });
  if (!players || !enemies) return c.json({ success: false, error: 'missing battle data' });

  // 1. 後端執行完整戰鬥
  const battleResult = runBattle(players, enemies, maxTurns, seed);
  const winner = battleResult.winner;

  // 若玩家敗北 → 不發獎勵
  if (winner !== 'player') {
    return c.json({
      success: true, winner,
      rewards: { gold: 0, exp: 0, diamond: 0, items: [] },
      isFirstClear: false, starsEarned: 0,
      actions: battleResult.actions,
    });
  }

  // 2. 載入存檔
  const saveData = await db.prepare('SELECT * FROM save_data WHERE playerId = ?')
    .bind(playerId).first<SaveDataRow>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  // 3. 模式分流
  const rewards = { gold: 0, exp: 0, diamond: 0, items: [] as string[] };
  let isFirstClear = false;
  let newStoryProgress: { chapter: number; stage: number } | undefined;
  let newFloor: number | undefined;

  if (stageMode === 'story') {
    const parts = stageId.split('-');
    const ch = parseInt(parts[0]) || 1;
    const st = parseInt(parts[1]) || 1;

    const stageStars = safeJsonParse<Record<string, number>>(saveData.stageStars, {});
    const prevBest = stageStars[stageId] || 0;
    if (prevBest === 0) isFirstClear = true;
    if (starsEarned > prevBest) stageStars[stageId] = starsEarned;

    // 從 stage_configs 讀取獎勵（優先），fallback 到公式
    const cfgRow = await db.prepare('SELECT rewards FROM stage_configs WHERE stageId = ?')
      .bind(stageId).first<{ rewards: string }>();
    if (cfgRow) {
      const cfgRewards = safeJsonParse<{ gold?: number; exp?: number; diamond?: number }>(cfgRow.rewards, {});
      const baseGold = cfgRewards.gold ?? 0;
      const baseExp = cfgRewards.exp ?? 0;
      const baseDiamond = cfgRewards.diamond ?? 0;
      // 首次通關：獎勵翻倍 + 固定鑽石
      rewards.gold = isFirstClear ? baseGold * 2 : baseGold;
      rewards.exp = isFirstClear ? baseExp * 2 : baseExp;
      rewards.diamond = isFirstClear ? Math.max(baseDiamond, 30) : baseDiamond;
    } else {
      // fallback 公式（stage_configs 缺失時）
      rewards.gold = 100 + ch * 50 + st * 20 + (isFirstClear ? 200 : 0);
      rewards.exp = 50 + ch * 30 + st * 10 + (isFirstClear ? 100 : 0);
      rewards.diamond = isFirstClear ? 30 : 0;
    }

    const currentProgress = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
    const newProg = (ch - 1) * 8 + st;
    const curProg = (currentProgress.chapter - 1) * 8 + currentProgress.stage;
    if (newProg >= curProg) {
      let nextSt = st + 1, nextCh = ch;
      if (nextSt > 8) { nextCh = ch + 1; nextSt = 1; }
      newStoryProgress = { chapter: nextCh, stage: nextSt };
    }

    await db.prepare(
      `UPDATE save_data SET
        gold = gold + ?, diamond = diamond + ?, exp = exp + ?, stageStars = ?,
        storyProgress = COALESCE(?, storyProgress),
        resourceTimerStage = COALESCE(?, resourceTimerStage),
        lastSaved = ?
       WHERE playerId = ?`
    ).bind(
      rewards.gold, rewards.diamond, rewards.exp,
      JSON.stringify(stageStars),
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
    newFloor = floor;
    await db.prepare(
      'UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?, towerFloor = ?, lastSaved = ? WHERE playerId = ?'
    ).bind(rewards.gold, rewards.diamond, rewards.exp, floor, isoNow(), playerId).run();

  } else if (stageMode === 'pvp') {
    const sp = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
    const linear = (sp.chapter - 1) * 8 + sp.stage;
    rewards.gold = 200 + linear * 30;
    rewards.exp = 100 + linear * 15;
    rewards.diamond = 10;
    await db.prepare(
      'UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?, lastSaved = ? WHERE playerId = ?'
    ).bind(rewards.gold, rewards.diamond, rewards.exp, isoNow(), playerId).run();

  } else if (stageMode === 'boss') {
    rewards.gold = 2000;
    rewards.exp = 500;
    rewards.diamond = 50;
    await db.prepare(
      'UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?, lastSaved = ? WHERE playerId = ?'
    ).bind(rewards.gold, rewards.diamond, rewards.exp, isoNow(), playerId).run();

  } else if (stageMode === 'daily') {
    const tier = (body.dungeonTier as string) || 'normal';
    const tierMult: Record<string, number> = { easy: 1, normal: 1.5, hard: 2 };
    const mult = tierMult[tier] ?? 1;
    rewards.gold = Math.floor(500 * mult);
    rewards.exp = Math.floor(200 * mult);
    await db.prepare(
      'UPDATE save_data SET gold = gold + ?, exp = exp + ?, lastSaved = ? WHERE playerId = ?'
    ).bind(rewards.gold, rewards.exp, isoNow(), playerId).run();
  }

  const currencies = await getCurrencies(db, playerId);

  return c.json({
    success: true, winner, rewards,
    isFirstClear, starsEarned,
    newStoryProgress, newFloor,
    actions: battleResult.actions,
    currencies,
  });
});

// ── 主線通關（舊版相容） ──────────────────
battle.post('/complete-stage', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const stageId = body.stageId as string;
  const starsEarned = Math.max(1, Math.min(3, Number(body.starsEarned) || 1));
  if (!stageId) return c.json({ success: false, error: 'missing stageId' });

  const saveData = await db.prepare('SELECT * FROM save_data WHERE playerId = ?')
    .bind(playerId).first<SaveDataRow>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  const parts = stageId.split('-');
  const ch = parseInt(parts[0]) || 1;
  const st = parseInt(parts[1]) || 1;

  const stageStars = safeJsonParse<Record<string, number>>(saveData.stageStars, {});
  const prevBest = stageStars[stageId] || 0;
  const isFirstClear = prevBest === 0;
  if (starsEarned > prevBest) stageStars[stageId] = starsEarned;

  const rewards = { gold: 0, exp: 0, diamond: 0 };

  // 從 stage_configs 讀取獎勵（優先），fallback 到公式
  const cfgRow = await db.prepare('SELECT rewards FROM stage_configs WHERE stageId = ?')
    .bind(stageId).first<{ rewards: string }>();
  if (cfgRow) {
    const cfgRewards = safeJsonParse<{ gold?: number; exp?: number; diamond?: number }>(cfgRow.rewards, {});
    const baseGold = cfgRewards.gold ?? 0;
    const baseExp = cfgRewards.exp ?? 0;
    const baseDiamond = cfgRewards.diamond ?? 0;
    rewards.gold = isFirstClear ? baseGold * 2 : baseGold;
    rewards.exp = isFirstClear ? baseExp * 2 : baseExp;
    rewards.diamond = isFirstClear ? Math.max(baseDiamond, 30) : baseDiamond;
  } else {
    rewards.gold = 100 + ch * 50 + st * 20 + (isFirstClear ? 200 : 0);
    rewards.exp = 50 + ch * 30 + st * 10 + (isFirstClear ? 100 : 0);
    rewards.diamond = isFirstClear ? 30 : 0;
  }

  const currentProgress = safeJsonParse<{ chapter: number; stage: number }>(saveData.storyProgress, { chapter: 1, stage: 1 });
  let newStoryProgress2: { chapter: number; stage: number } | undefined;
  const newProg = (ch - 1) * 8 + st;
  const curProg = (currentProgress.chapter - 1) * 8 + currentProgress.stage;
  if (newProg >= curProg) {
    let nextSt = st + 1, nextCh = ch;
    if (nextSt > 8) { nextCh++; nextSt = 1; }
    newStoryProgress2 = { chapter: nextCh, stage: nextSt };
  }

  await db.prepare(
    `UPDATE save_data SET gold = gold + ?, diamond = diamond + ?, exp = exp + ?, stageStars = ?,
     storyProgress = COALESCE(?, storyProgress), resourceTimerStage = COALESCE(?, resourceTimerStage),
     lastSaved = ? WHERE playerId = ?`
  ).bind(
    rewards.gold, rewards.diamond, rewards.exp ?? 0, JSON.stringify(stageStars),
    newStoryProgress2 ? JSON.stringify(newStoryProgress2) : null,
    newStoryProgress2 ? stageId : null, isoNow(), playerId
  ).run();

  return c.json({ success: true, rewards, isFirstClear, starsEarned, newStoryProgress: newStoryProgress2 });
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
  ).bind(rewards.gold, rewards.diamond, rewards.exp, floor, isoNow(), playerId).run();

  return c.json({ success: true, rewards, newFloor: floor });
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
