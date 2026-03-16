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
const ARENA_DAILY_REFRESHES = 5;
const ARENA_OPPONENT_COUNT = 10;

const NPC_PREFIXES = ['暗影', '末日', '鐵血', '荒野', '幽靈', '狂暴', '冰霜', '烈焰', '鏽蝕', '黎明', '血月', '迷霧'];
const NPC_SUFFIXES = ['獵人', '倖存者', '戰士', '指揮官', '護衛', '遊蕩者', '潛伏者', '收割者', '守望者', '流浪者'];

const MILESTONES = [
  { rank: 400, diamond: 20,  gold: 5000,   pvpCoin: 10,  exp: 200 },
  { rank: 300, diamond: 30,  gold: 10000,  pvpCoin: 20,  exp: 400 },
  { rank: 200, diamond: 50,  gold: 20000,  pvpCoin: 30,  exp: 600 },
  { rank: 100, diamond: 100, gold: 50000,  pvpCoin: 50,  exp: 1000 },
  { rank: 50,  diamond: 150, gold: 80000,  pvpCoin: 80,  exp: 1500 },
  { rank: 20,  diamond: 200, gold: 100000, pvpCoin: 100, exp: 2000 },
  { rank: 10,  diamond: 300, gold: 150000, pvpCoin: 150, exp: 3000 },
  { rank: 1,   diamond: 500, gold: 300000, pvpCoin: 300, exp: 5000 },
];

/* ════════════════════════════════════════════
   後端權威戰力計算（與前端 domain/ 完全一致）
   ════════════════════════════════════════════ */

// ── 常數（與前端 progressionSystem.ts / combatPower.ts 同步） ──
// ⚠️ 修改前端 RARITY_STAR_MULT / STAR_PASSIVE_SLOTS 時，務必同步更新這裡的 STAR_MUL / STAR_PASSIVE
const CP_W = { HP: 0.5, ATK: 3, DEF: 2.5, SPD: 8, CritRate: 5, CritDmg: 2 } as const;
const RARITY_NUM: Record<string, number> = { N: 1, R: 2, SR: 3, SSR: 4 };
const RARITY_GROWTH: Record<number, number> = { 1: 0.030, 2: 0.035, 3: 0.040, 4: 0.050 };
const ASC_MULT: Record<number, Record<number, number>> = {
  1: { 0: 1, 1: 1.03, 2: 1.06, 3: 1.09, 4: 1.12, 5: 1.18 },
  2: { 0: 1, 1: 1.04, 2: 1.08, 3: 1.12, 4: 1.16, 5: 1.24 },
  3: { 0: 1, 1: 1.05, 2: 1.10, 3: 1.15, 4: 1.20, 5: 1.30 },
  4: { 0: 1, 1: 1.07, 2: 1.14, 3: 1.22, 4: 1.30, 5: 1.42 },
};
const STAR_MUL: Record<number, Record<number, number>> = {
  1: { 0: 0.90, 1: 1, 2: 1.03, 3: 1.06, 4: 1.09, 5: 1.13, 6: 1.18, 7: 1.21, 8: 1.24, 9: 1.27, 10: 1.30 },
  2: { 0: 0.90, 1: 1, 2: 1.04, 3: 1.08, 4: 1.12, 5: 1.17, 6: 1.24, 7: 1.28, 8: 1.32, 9: 1.36, 10: 1.40 },
  3: { 0: 0.90, 1: 1, 2: 1.05, 3: 1.10, 4: 1.15, 5: 1.20, 6: 1.30, 7: 1.35, 8: 1.40, 9: 1.45, 10: 1.50 },
  4: { 0: 0.90, 1: 1, 2: 1.07, 3: 1.14, 4: 1.22, 5: 1.30, 6: 1.42, 7: 1.48, 8: 1.54, 9: 1.60, 10: 1.68 },
};
const STAR_PASSIVE: Record<number, number> = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 };
const ULT_BASE = 100;
const PASSIVE_EACH = 50;
const SET2_POWER = 80;
const SET4_POWER = 200;
const EQ_ENHANCE: Record<string, number> = { N: 0.06, R: 0.08, SR: 0.10, SSR: 0.12 };

const EQ_SETS: { setId: string; req: number; bonusType: string; bonusValue: number }[] = [
  { setId: 'berserker', req: 2, bonusType: 'ATK_percent',     bonusValue: 15 },
  { setId: 'ironwall',  req: 2, bonusType: 'DEF_percent',     bonusValue: 20 },
  { setId: 'gale',      req: 2, bonusType: 'SPD_flat',        bonusValue: 15 },
  { setId: 'vampire',   req: 2, bonusType: 'lifesteal',       bonusValue: 12 },
  { setId: 'critical',  req: 2, bonusType: 'CritRate_percent', bonusValue: 12 },
  { setId: 'lethal',    req: 2, bonusType: 'CritDmg_percent',  bonusValue: 25 },
  { setId: 'vitality',  req: 2, bonusType: 'HP_percent',      bonusValue: 20 },
  { setId: 'counter',   req: 2, bonusType: 'counter',         bonusValue: 20 },
  { setId: 'berserker', req: 4, bonusType: 'CritDmg_percent',  bonusValue: 20 },
  { setId: 'ironwall',  req: 4, bonusType: 'HP_percent',      bonusValue: 15 },
  { setId: 'gale',      req: 4, bonusType: 'ATK_percent',     bonusValue: 10 },
  { setId: 'vampire',   req: 4, bonusType: 'lifesteal',       bonusValue: 8 },
  { setId: 'critical',  req: 4, bonusType: 'CritDmg_percent',  bonusValue: 20 },
  { setId: 'lethal',    req: 4, bonusType: 'ATK_percent',     bonusValue: 15 },
  { setId: 'vitality',  req: 4, bonusType: 'DEF_percent',     bonusValue: 15 },
  { setId: 'counter',   req: 4, bonusType: 'counter',         bonusValue: 15 },
];

interface CpStats { HP: number; ATK: number; DEF: number; SPD: number; CritRate: number; CritDmg: number }

function cpAddFlat(s: CpStats, stat: string, v: number) {
  if (stat === 'HP') s.HP += v;
  else if (stat === 'ATK') s.ATK += v;
  else if (stat === 'DEF') s.DEF += v;
  else if (stat === 'SPD') s.SPD += v;
  else if (stat === 'CritRate') s.CritRate += v;
  else if (stat === 'CritDmg') s.CritDmg += v;
}

function cpApplyPct(s: CpStats, stat: string, pct: number) {
  const m = pct / 100;
  if (stat === 'HP') s.HP = Math.floor(s.HP * (1 + m));
  else if (stat === 'ATK') s.ATK = Math.floor(s.ATK * (1 + m));
  else if (stat === 'DEF') s.DEF = Math.floor(s.DEF * (1 + m));
  else if (stat === 'SPD') s.SPD = Math.floor(s.SPD * (1 + m));
  else if (stat === 'CritRate') s.CritRate = Math.floor(s.CritRate * (1 + m));
  else if (stat === 'CritDmg') s.CritDmg = Math.floor(s.CritDmg * (1 + m));
}

/**
 * 後端權威計算防守陣型戰力
 * 完整考慮：等級×稀有度成長 + 突破 + 星級 + 裝備主副屬性 + 套裝效果 + 技能加成
 */
async function calcDefensePower(db: D1Database, playerId: string, formArr: (string | null)[]): Promise<number> {
  const validIds = formArr.filter((id): id is string => !!id);
  if (validIds.length === 0) return 0;

  const heroIdNums = validIds.map(Number);

  // 1. 查 hero_instances
  const instRows = await db.prepare(
    `SELECT instanceId, heroId, level, ascension, stars FROM hero_instances WHERE playerId = ? AND heroId IN (${heroIdNums.map(() => '?').join(',')})`
  ).bind(playerId, ...heroIdNums).all();
  const instances = (instRows.results || []) as { instanceId: string; heroId: number; level: number; ascension: number; stars: number }[];
  if (instances.length === 0) return 0;

  const instMap = new Map<number, typeof instances[0]>();
  for (const inst of instances) instMap.set(inst.heroId, inst);

  // 2. 查 heroes 基礎數值（含 rarity）
  const hIds = [...instMap.keys()];
  const hRows = await db.prepare(
    `SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, critRate, critDmg, rarity FROM heroes WHERE heroId IN (${hIds.map(() => '?').join(',')})`
  ).bind(...hIds).all();
  const heroMap = new Map<number, any>();
  for (const h of (hRows.results || [])) heroMap.set((h as any).heroId, h);

  // 3. 查所有已裝備的 equipment（equippedBy = instanceId）
  const instanceIds = instances.map(i => i.instanceId);
  let equipRows: any[] = [];
  if (instanceIds.length > 0) {
    const eqResult = await db.prepare(
      `SELECT equipId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy
       FROM equipment_instances WHERE playerId = ? AND equippedBy IN (${instanceIds.map(() => '?').join(',')})`
    ).bind(playerId, ...instanceIds).all();
    equipRows = (eqResult.results || []) as any[];
  }
  const equipByHero = new Map<string, any[]>();
  for (const eq of equipRows) {
    const list = equipByHero.get(eq.equippedBy) || [];
    list.push(eq);
    equipByHero.set(eq.equippedBy, list);
  }

  // 4. 為每個英雄計算完整戰力
  let totalPower = 0;
  for (const heroId of heroIdNums) {
    const inst = instMap.get(heroId);
    if (!inst) continue;
    const base = heroMap.get(heroId);
    if (!base) continue;

    const rarNum = RARITY_NUM[base.rarity] ?? 3;
    const growth = RARITY_GROWTH[rarNum] ?? 0.04;
    const lvMult = 1 + (inst.level - 1) * growth;
    const ascMul = ASC_MULT[rarNum]?.[inst.ascension] ?? 1;
    const starMul = STAR_MUL[rarNum]?.[inst.stars] ?? 1;

    const s: CpStats = {
      HP:       Math.floor((base.baseHP || 100) * lvMult * ascMul * starMul),
      ATK:      Math.floor((base.baseATK || 10) * lvMult * ascMul * starMul),
      DEF:      Math.floor((base.baseDEF || 5) * lvMult * ascMul * starMul),
      SPD:      base.baseSPD || 100,
      CritRate: base.critRate ?? 5,
      CritDmg:  base.critDmg ?? 50,
    };

    const equips = equipByHero.get(inst.instanceId) || [];

    // Step 2: 裝備主屬性 + 副屬性 flat
    for (const eq of equips) {
      const eRate = EQ_ENHANCE[eq.rarity] ?? 0.10;
      const mainVal = Math.floor((eq.mainStatValue || 0) * (1 + (eq.enhanceLevel || 0) * eRate));
      cpAddFlat(s, eq.mainStat, mainVal);
      let subs: { stat: string; value: number; isPercent: boolean }[] = [];
      try { subs = typeof eq.subStats === 'string' ? JSON.parse(eq.subStats) : (eq.subStats || []); } catch { subs = []; }
      for (const sub of subs) { if (!sub.isPercent) cpAddFlat(s, sub.stat, sub.value); }
    }

    // Step 3: 副屬性 percent
    const pctBon: Record<string, number> = {};
    for (const eq of equips) {
      let subs: { stat: string; value: number; isPercent: boolean }[] = [];
      try { subs = typeof eq.subStats === 'string' ? JSON.parse(eq.subStats) : (eq.subStats || []); } catch { subs = []; }
      for (const sub of subs) {
        if (sub.isPercent) {
          if (sub.stat === 'CritRate' || sub.stat === 'CritDmg') cpAddFlat(s, sub.stat, sub.value);
          else pctBon[sub.stat] = (pctBon[sub.stat] || 0) + sub.value;
        }
      }
    }

    // Step 4: 套裝效果
    const setCounts: Record<string, number> = {};
    for (const eq of equips) { if (eq.setId) setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1; }
    const actSets: typeof EQ_SETS = [];
    for (const [sid, cnt] of Object.entries(setCounts)) {
      for (const def of EQ_SETS) { if (def.setId === sid && cnt >= def.req) actSets.push(def); }
    }
    for (const set of actSets) {
      if (set.bonusType.endsWith('_percent')) {
        const st = set.bonusType.replace('_percent', '');
        if (st === 'CritRate' || st === 'CritDmg') cpAddFlat(s, st, set.bonusValue);
        else pctBon[st] = (pctBon[st] || 0) + set.bonusValue;
      } else if (set.bonusType === 'SPD_flat') {
        s.SPD += set.bonusValue;
      }
    }

    for (const [st, pct] of Object.entries(pctBon)) cpApplyPct(s, st, pct);

    // Step 5: CP
    const bp = s.HP * CP_W.HP + s.ATK * CP_W.ATK + s.DEF * CP_W.DEF + s.SPD * CP_W.SPD + s.CritRate * CP_W.CritRate + s.CritDmg * CP_W.CritDmg;
    const skB = ULT_BASE + (STAR_PASSIVE[inst.stars] ?? 0) * PASSIVE_EACH;
    let stB = 0;
    for (const a of actSets) stB += a.req >= 4 ? SET4_POWER : SET2_POWER;

    totalPower += Math.floor(bp + skB + stB);
  }

  return totalPower;
}

/* ════════════════════════════════════════════
   動態挑戰跨度 + 對手清單生成
   ════════════════════════════════════════════ */

function getChallengeRange(myRank: number): number {
  if (myRank <= 5) return 5;
  if (myRank <= 20) return 15;
  if (myRank <= 100) return 50;
  return 200;
}

interface OpponentInfo {
  playerId: string; rank: number; displayName: string;
  isNPC: boolean; power: number;
}

/** 從 DB 取得對手清單的即時資料 */
async function getOpponentData(db: D1Database, opponentIds: string[]): Promise<OpponentInfo[]> {
  if (opponentIds.length === 0) return [];
  const rows = await db.prepare(
    `SELECT playerId, rank, displayName, isNPC, power FROM arena_rankings
     WHERE playerId IN (${opponentIds.map(() => '?').join(',')}) ORDER BY rank`
  ).bind(...opponentIds).all();
  return ((rows.results || []) as any[]).map(r => ({
    playerId: r.playerId, rank: r.rank, displayName: r.displayName,
    power: r.power ?? 0, isNPC: !!r.isNPC,
  }));
}

/** 產生新的對手清單（10 位隨機對手 within range），儲存到 save_data */
async function refreshAndStoreOpponents(
  db: D1Database, playerId: string, myRank: number,
): Promise<OpponentInfo[]> {
  const range = getChallengeRange(myRank);
  const minRank = Math.max(1, myRank - range);
  const maxRank = myRank - 1;
  if (maxRank < minRank) return []; // 已在 #1

  const rows = await db.prepare(
    `SELECT playerId FROM arena_rankings WHERE rank >= ? AND rank <= ? AND playerId != ?
     ORDER BY RANDOM() LIMIT ?`
  ).bind(minRank, maxRank, playerId, ARENA_OPPONENT_COUNT).all();
  const ids = ((rows.results || []) as { playerId: string }[]).map(r => r.playerId);

  await db.prepare('UPDATE save_data SET arenaOpponents = ? WHERE playerId = ?')
    .bind(JSON.stringify(ids), playerId).run();

  return getOpponentData(db, ids);
}

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
// Get Rankings — 回傳 Top 10 + 持久對手清單
// ════════════════════════════════════════════
arena.post('/arena-get-rankings', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  await ensureArenaInit(db);

  // 找到玩家排名 + 戰力
  const myRow = await db.prepare('SELECT rank, power, defenseFormation FROM arena_rankings WHERE playerId = ?')
    .bind(playerId).first<{ rank: number; power: number; defenseFormation?: string }>();
  const myRank = myRow?.rank ?? ARENA_MAX_RANK;
  let myPower = myRow?.power ?? 0;

  // 自動同步戰力：每次進入排行榜時，用當前陣型重新計算戰力，避免養成後戰力不同步
  if (myRow && myRow.rank <= ARENA_MAX_RANK) {
    try {
      let formArr: (string | null)[] = [];
      try { formArr = JSON.parse(myRow.defenseFormation || '[]'); } catch { formArr = []; }
      // 若無防守陣型，用出征陣型
      if (!formArr.some(Boolean)) {
        const saveRow = await db.prepare('SELECT formation FROM save_data WHERE playerId = ?')
          .bind(playerId).first<{ formation?: string }>();
        try { formArr = JSON.parse(saveRow?.formation || '[]'); } catch { formArr = []; }
      }
      if (formArr.some(Boolean)) {
        const recalced = await calcDefensePower(db, playerId, formArr);
        if (recalced > 0 && recalced !== myPower) {
          myPower = recalced;
          await db.prepare('UPDATE arena_rankings SET power = ? WHERE playerId = ?')
            .bind(myPower, playerId).run();
        }
      }
    } catch { /* 戰力同步失敗不影響主流程 */ }
  }

  // Top 10 排行榜
  const topRows = await db.prepare(
    `SELECT rank, playerId, displayName, isNPC, power FROM arena_rankings
     WHERE rank <= 10 ORDER BY rank`
  ).all<ArenaRankingRow>();

  // 挑戰次數 + 對手清單 (daily reset)
  let challengesLeft = 5;
  let highestRank = ARENA_MAX_RANK;
  let refreshesLeft = ARENA_DAILY_REFRESHES;
  let opponentIds: string[] = [];

  const saveData = await db.prepare(
    'SELECT arenaChallengesLeft, arenaHighestRank, arenaLastReset, arenaOpponents, arenaRefreshCount FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'arenaChallengesLeft' | 'arenaHighestRank' | 'arenaLastReset'> & { arenaOpponents?: string; arenaRefreshCount?: number }>();

  if (saveData) {
    const today = todayUTC8();
    const lastReset = (saveData.arenaLastReset || '').split('T')[0];
    if (lastReset !== today) {
      // 每日重置：挑戰次數 + 刷新次數
      challengesLeft = 5;
      refreshesLeft = ARENA_DAILY_REFRESHES;
      await db.prepare(
        'UPDATE save_data SET arenaChallengesLeft = 5, arenaRefreshCount = 0, arenaOpponents = ?, arenaLastReset = ? WHERE playerId = ?'
      ).bind('[]', isoNow(), playerId).run();
      opponentIds = [];
    } else {
      challengesLeft = saveData.arenaChallengesLeft ?? 5;
      refreshesLeft = Math.max(0, ARENA_DAILY_REFRESHES - (saveData.arenaRefreshCount ?? 0));
      try { opponentIds = JSON.parse(saveData.arenaOpponents || '[]'); } catch { opponentIds = []; }
    }
    highestRank = saveData.arenaHighestRank ?? ARENA_MAX_RANK;
  }

  // 若對手清單為空 → 自動生成（首次 / 每日重置後）
  let opponents: OpponentInfo[];
  if (opponentIds.length === 0) {
    opponents = await refreshAndStoreOpponents(db, playerId, myRank);
  } else {
    opponents = await getOpponentData(db, opponentIds);
    // 過濾掉已經排在自己後面的對手
    opponents = opponents.filter(o => o.rank < myRank);
  }

  return c.json({
    success: true,
    rankings: (topRows.results || []).map(r => ({
      rank: r.rank, playerId: r.playerId, displayName: r.displayName,
      isNPC: !!r.isNPC, power: r.power ?? 0,
    })),
    opponents,
    myRank, myPower, challengesLeft, highestRank, refreshesLeft,
  });
});

// ════════════════════════════════════════════
// Challenge Start — 用 targetUserId 查詢，自動偵測排名變動
// ════════════════════════════════════════════
arena.post('/arena-challenge-start', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);

  // 支援新版 targetUserId 及舊版 targetRank（向後相容）
  const targetUserId = body.targetUserId as string | undefined;
  const legacyTargetRank = Number(body.targetRank);

  await ensureArenaInit(db);

  // 查自己的排名
  const myRow = await db.prepare('SELECT rank FROM arena_rankings WHERE playerId = ?')
    .bind(playerId).first<{ rank: number }>();
  const myRank = myRow?.rank ?? ARENA_MAX_RANK;

  let defender: ArenaRankingRow | null = null;
  let targetRank: number;

  if (targetUserId) {
    // 新版：用 playerId 查對手目前排名
    defender = await db.prepare(
      'SELECT rank, playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE playerId = ?'
    ).bind(targetUserId).first<ArenaRankingRow>();
    if (!defender) return c.json({ success: false, error: 'target_not_found' });
    targetRank = defender.rank;

    // 排名變動偵測：對手排名必須小於（前於）自己
    if (targetRank >= myRank) {
      // 免費自動刷新對手清單（不扣次數）
      const newOpponents = await refreshAndStoreOpponents(db, playerId, myRank);
      return c.json({
        success: false,
        error: 'rank_changed',
        message: '對手排名已變動，已自動刷新對手清單',
        opponents: newOpponents,
      });
    }
  } else {
    // 舊版相容：用排名查（掃蕩用）
    if (!legacyTargetRank || legacyTargetRank < 1) return c.json({ success: false, error: 'invalid_rank' });
    defender = await db.prepare(
      'SELECT rank, playerId, displayName, isNPC, power, defenseFormation FROM arena_rankings WHERE rank = ?'
    ).bind(legacyTargetRank).first<ArenaRankingRow>();
    targetRank = legacyTargetRank;
  }

  if (!defender) return c.json({ success: false, error: 'rank_not_found' });

  // 解析防守陣型
  let formation: (string | null)[] = [];
  try { formation = JSON.parse(defender.defenseFormation || '[]'); } catch { formation = []; }

  const heroes: Record<string, unknown>[] = [];

  if (defender.isNPC) {
    const allHeroes = await db.prepare('SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, rarity FROM heroes').all();
    const heroPool = allHeroes.results || [];
    if (heroPool.length > 0) {
      const npcPower = defender.power || 500;
      const scale = Math.max(1, npcPower / 500);
      const npcCount = targetRank <= 50 ? 5 : targetRank <= 150 ? 4 : targetRank <= 300 ? 3 : 2;
      const seed = targetRank * 31337;
      for (let i = 0; i < npcCount; i++) {
        const idx = (seed + i * 7919) % heroPool.length;
        const h = heroPool[idx] as any;
        heroes.push({
          heroId: h.heroId,
          HP: Math.floor((h.baseHP || 100) * scale),
          ATK: Math.floor((h.baseATK || 10) * scale),
          DEF: Math.floor((h.baseDEF || 5) * scale),
          Speed: h.baseSPD || 100,
          CritRate: h.critRate ?? 5,
          CritDmg: h.critDmg ?? 50,
          ModelID: h.modelId || String(h.heroId),
          slot: i,
        });
      }
    }
  } else {
    const validIds = formation.filter((id): id is string => !!id);
    if (validIds.length > 0) {
      const instances = await db.prepare(
        `SELECT instanceId, heroId, level, ascension, stars FROM hero_instances WHERE playerId = ? AND instanceId IN (${validIds.map(() => '?').join(',')})`
      ).bind(defender.playerId, ...validIds).all();
      const instMap = new Map<string, any>();
      for (const inst of (instances.results || [])) instMap.set((inst as any).instanceId, inst);

      const heroIds = [...new Set((instances.results || []).map((r: any) => r.heroId))];
      const heroMap = new Map<number, any>();
      if (heroIds.length > 0) {
        const heroRows = await db.prepare(
          `SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, modelId, critRate, critDmg, rarity FROM heroes WHERE heroId IN (${heroIds.map(() => '?').join(',')})`
        ).bind(...heroIds).all();
        for (const h of (heroRows.results || [])) heroMap.set((h as any).heroId, h);
      }

      // 查裝備（equippedBy = instanceId）
      const instanceIds = (instances.results || []).map((r: any) => r.instanceId);
      let equipRows: any[] = [];
      if (instanceIds.length > 0) {
        const eqResult = await db.prepare(
          `SELECT equipId, setId, slot, rarity, mainStat, mainStatValue, enhanceLevel, subStats, equippedBy
           FROM equipment_instances WHERE playerId = ? AND equippedBy IN (${instanceIds.map(() => '?').join(',')})`
        ).bind(defender.playerId, ...instanceIds).all();
        equipRows = (eqResult.results || []) as any[];
      }
      const equipByInst = new Map<string, any[]>();
      for (const eq of equipRows) {
        const list = equipByInst.get(eq.equippedBy) || [];
        list.push(eq);
        equipByInst.set(eq.equippedBy, list);
      }

      formation.forEach((instId, slot) => {
        if (!instId) return;
        const inst = instMap.get(instId);
        if (!inst) return;
        const base = heroMap.get(inst.heroId);
        if (!base) return;
        const rn = RARITY_NUM[base.rarity] ?? 3;
        const growth = RARITY_GROWTH[rn] ?? 0.04;
        const lvScale = 1 + (inst.level - 1) * growth;
        const ascMult = ASC_MULT[rn]?.[inst.ascension] ?? 1.0;
        const starMult = STAR_MUL[rn]?.[inst.stars ?? 0] ?? 1.0;

        const s: CpStats = {
          HP:       Math.floor((base.baseHP || 100) * lvScale * ascMult * starMult),
          ATK:      Math.floor((base.baseATK || 10) * lvScale * ascMult * starMult),
          DEF:      Math.floor((base.baseDEF || 5) * lvScale * ascMult * starMult),
          SPD:      base.baseSPD || 100,
          CritRate: base.critRate ?? 5,
          CritDmg:  base.critDmg ?? 50,
        };

        // 裝備主屬性 + 副屬性 flat
        const equips = equipByInst.get(inst.instanceId) || [];
        for (const eq of equips) {
          const eRate = EQ_ENHANCE[eq.rarity] ?? 0.10;
          const mainVal = Math.floor((eq.mainStatValue || 0) * (1 + (eq.enhanceLevel || 0) * eRate));
          cpAddFlat(s, eq.mainStat, mainVal);
          let subs: { stat: string; value: number; isPercent: boolean }[] = [];
          try { subs = typeof eq.subStats === 'string' ? JSON.parse(eq.subStats) : (eq.subStats || []); } catch { subs = []; }
          for (const sub of subs) { if (!sub.isPercent) cpAddFlat(s, sub.stat, sub.value); }
        }

        // 副屬性 percent
        const pctBon: Record<string, number> = {};
        for (const eq of equips) {
          let subs: { stat: string; value: number; isPercent: boolean }[] = [];
          try { subs = typeof eq.subStats === 'string' ? JSON.parse(eq.subStats) : (eq.subStats || []); } catch { subs = []; }
          for (const sub of subs) {
            if (sub.isPercent) {
              if (sub.stat === 'CritRate' || sub.stat === 'CritDmg') cpAddFlat(s, sub.stat, sub.value);
              else pctBon[sub.stat] = (pctBon[sub.stat] || 0) + sub.value;
            }
          }
        }

        // 套裝效果
        const setCounts: Record<string, number> = {};
        for (const eq of equips) { if (eq.setId) setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1; }
        const actSets: typeof EQ_SETS = [];
        for (const [sid, cnt] of Object.entries(setCounts)) {
          for (const def of EQ_SETS) { if (def.setId === sid && cnt >= def.req) actSets.push(def); }
        }
        for (const set of actSets) {
          if (set.bonusType.endsWith('_percent')) {
            const st = set.bonusType.replace('_percent', '');
            if (st === 'CritRate' || st === 'CritDmg') cpAddFlat(s, st, set.bonusValue);
            else pctBon[st] = (pctBon[st] || 0) + set.bonusValue;
          } else if (set.bonusType === 'SPD_flat') {
            s.SPD += set.bonusValue;
          }
        }
        for (const [st, pct] of Object.entries(pctBon)) cpApplyPct(s, st, pct);

        heroes.push({
          heroId: inst.heroId,
          HP: s.HP,
          ATK: s.ATK,
          DEF: s.DEF,
          Speed: s.SPD,
          CritRate: s.CritRate,
          CritDmg: s.CritDmg,
          ModelID: base.modelId || String(inst.heroId),
          slot,
          level: inst.level,
          stars: inst.stars || 0,
        });
      });
    }
  }

  return c.json({
    success: true,
    targetRank,
    defenderData: {
      displayName: defender.displayName,
      power: defender.power || 0,
      isNPC: !!defender.isNPC,
      heroes,
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
      // 計算玩家目前陣型戰力
      let playerPower = 0;
      try {
        const sd = await db.prepare('SELECT formation FROM save_data WHERE playerId = ?').bind(playerId).first<{ formation: string }>();
        const form: (string | null)[] = sd?.formation ? JSON.parse(sd.formation) : [];
        const validIds = form.filter((id): id is string => !!id);
        if (validIds.length > 0) {
          const insts = await db.prepare(
            `SELECT heroId, level FROM hero_instances WHERE playerId = ? AND instanceId IN (${validIds.map(() => '?').join(',')})`
          ).bind(playerId, ...validIds).all();
          const hIds = [...new Set((insts.results || []).map((r: any) => r.heroId))];
          if (hIds.length > 0) {
            const hRows = await db.prepare(
              `SELECT heroId, baseHP, baseATK, baseDEF, baseSPD, critRate, critDmg FROM heroes WHERE heroId IN (${hIds.map(() => '?').join(',')})`
            ).bind(...hIds).all();
            const hMap = new Map<number, any>();
            for (const h of (hRows.results || [])) hMap.set((h as any).heroId, h);
            for (const inst of (insts.results || [])) {
              const i = inst as any;
              const base = hMap.get(i.heroId);
              if (!base) continue;
              const lvScale = 1 + (i.level - 1) * 0.03;
              playerPower += Math.floor((base.baseHP||100)*lvScale*0.5 + (base.baseATK||10)*lvScale*3 + (base.baseDEF||5)*lvScale*2.5 + (base.baseSPD||100)*8 + (base.critRate||5)*5 + (base.critDmg||50)*2 + 100);
            }
          }
        }
      } catch { /* power 計算失敗用 0 */ }
      await db.prepare(
        'UPDATE arena_rankings SET playerId = ?, displayName = ?, isNPC = 0, power = ?, lastUpdated = ? WHERE rank = ?'
      ).bind(playerId, displayName, playerPower, isoNow(), lastNpc.rank).run();
      challengerRow = { rank: lastNpc.rank };
    }
  }

  const challengerRank = challengerRow?.rank ?? ARENA_MAX_RANK;

  const saveData = await db.prepare(
    'SELECT arenaChallengesLeft, arenaHighestRank FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'arenaChallengesLeft' | 'arenaHighestRank'>>();

  const challengesLeft = Math.max(0, (saveData?.arenaChallengesLeft ?? 5) - 1);

  const rewards = won
    ? { diamond: 0, gold: 2000, pvpCoin: 5, exp: 150 }
    : { diamond: 0, gold: 500, pvpCoin: 1, exp: 50 };

  let milestoneReward: { diamond: number; gold: number; pvpCoin: number; exp: number } | null = null;
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

    // 里程碑 — 累計所有跨過的門檻（修復：舊版只取第一個就 break，跳多級時漏發獎勵）
    const prevHighest = saveData?.arenaHighestRank ?? ARENA_MAX_RANK;
    if (newRank < prevHighest) {
      const acc = { diamond: 0, gold: 0, pvpCoin: 0, exp: 0 };
      let hit = false;
      for (const m of MILESTONES) {
        if (newRank <= m.rank && prevHighest > m.rank) {
          acc.diamond += m.diamond;
          acc.gold += m.gold;
          acc.pvpCoin += m.pvpCoin;
          acc.exp += m.exp;
          hit = true;
        }
      }
      if (hit) milestoneReward = acc;
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
  const totalExp = rewards.exp + (milestoneReward?.exp || 0);
  if (totalGold > 0) { setParts.push('gold = gold + ?'); bindVals.push(totalGold); }
  if (totalDiamond > 0) { setParts.push('diamond = diamond + ?'); bindVals.push(totalDiamond); }
  if (totalExp > 0) { setParts.push('exp = exp + ?'); bindVals.push(totalExp); }

  setParts.push('lastSaved = ?');
  bindVals.push(now);
  bindVals.push(playerId);

  writeStmts.push(
    db.prepare(`UPDATE save_data SET ${setParts.join(', ')} WHERE playerId = ?`).bind(...bindVals)
  );

  // pvpCoin → inventory（使用 upsertItemStmt 取代手動 SELECT+INSERT/UPDATE）
  const pvpCoinTotal = rewards.pvpCoin + (milestoneReward?.pvpCoin || 0);
  if (pvpCoinTotal > 0) {
    writeStmts.push(upsertItemStmt(db, playerId, 'pvp_coin', pvpCoinTotal));
  }

  // 原子批次寫入
  await db.batch(writeStmts);
  const currencies = await getCurrencies(db, playerId);

  // 勝利且排名變動 → 自動刷新對手清單（排名改變了，舊清單無效）
  let opponents: OpponentInfo[] | undefined;
  if (won && newRank < challengerRank) {
    opponents = await refreshAndStoreOpponents(db, playerId, newRank);
  }

  return c.json({ success: true, won, newRank, challengesLeft, rewards, milestoneReward, currencies, opponents });
});

// ════════════════════════════════════════════
// Set Defense
// ════════════════════════════════════════════
arena.post('/arena-set-defense', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  // body.defenseFormation 已經是 JSON 字串（前端已 stringify），直接使用
  const defenseFormation = typeof body.defenseFormation === 'string'
    ? body.defenseFormation
    : JSON.stringify(body.defenseFormation || []);

  const now = isoNow();

  // 後端權威計算防守陣型戰力
  let formArr: (string | null)[] = [];
  try { formArr = JSON.parse(defenseFormation); } catch { formArr = []; }
  const power = await calcDefensePower(c.env.DB, playerId, formArr);

  // 先嘗試 UPDATE
  const result = await c.env.DB.prepare(
    'UPDATE arena_rankings SET defenseFormation = ?, power = ?, lastUpdated = ? WHERE playerId = ?'
  ).bind(defenseFormation, power, now, playerId).run();

  // 如果玩家尚未在 arena_rankings，INSERT 一筆預設資料（排在最後）
  if (result.meta.changes === 0) {
    // 查詢玩家顯示名稱
    const playerRow = await c.env.DB.prepare(
      'SELECT displayName FROM players WHERE playerId = ?'
    ).bind(playerId).first<{ displayName: string }>();
    const dName = playerRow?.displayName || '';

    // 找到最大 rank + 1 作為新排名
    const maxRow = await c.env.DB.prepare(
      'SELECT MAX(rank) as maxRank FROM arena_rankings'
    ).first<{ maxRank: number }>();
    const newRank = (maxRow?.maxRank ?? 500) + 1;

    await c.env.DB.prepare(
      `INSERT INTO arena_rankings (rank, playerId, displayName, isNPC, power, defenseFormation, lastUpdated)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    ).bind(newRank, playerId, dName, power, defenseFormation, now).run();
  }

  return c.json({ success: true, power });
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

// ════════════════════════════════════════════
// Refresh Opponents — 手動刷新對手清單
// ════════════════════════════════════════════
arena.post('/arena-refresh-opponents', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  await ensureArenaInit(db);

  const myRow = await db.prepare('SELECT rank FROM arena_rankings WHERE playerId = ?')
    .bind(playerId).first<{ rank: number }>();
  const myRank = myRow?.rank ?? ARENA_MAX_RANK;

  // 檢查每日刷新次數
  const saveRow = await db.prepare(
    'SELECT arenaRefreshCount, arenaLastReset FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<{ arenaRefreshCount?: number; arenaLastReset?: string }>();

  let refreshCount = saveRow?.arenaRefreshCount ?? 0;
  const today = todayUTC8();
  const lastReset = (saveRow?.arenaLastReset || '').split('T')[0];
  if (lastReset !== today) refreshCount = 0; // 跨日歸零

  if (refreshCount >= ARENA_DAILY_REFRESHES) {
    return c.json({ success: false, error: 'no_refreshes_left', message: '今日免費刷新次數已用完' });
  }

  // 刷新
  const opponents = await refreshAndStoreOpponents(db, playerId, myRank);
  refreshCount += 1;
  await db.prepare('UPDATE save_data SET arenaRefreshCount = ? WHERE playerId = ?')
    .bind(refreshCount, playerId).run();

  return c.json({
    success: true,
    opponents,
    refreshesLeft: Math.max(0, ARENA_DAILY_REFRESHES - refreshCount),
  });
});

export default arena;
