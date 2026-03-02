/**
 * Data Routes — 靜態遊戲資料讀取
 *
 * 前端 sheetApi.ts 的 readSheet / listSheets 對應端點。
 * 正規化後，heroes / skill_templates / hero_skills / element_matrix
 * 改從專屬 D1 表讀取；其餘仍從 game_sheets KV blob 讀取。
 */
import { Hono } from 'hono';
import type { Env, HonoVars } from '../types.js';
import { getBody } from '../middleware/auth.js';

const data = new Hono<{ Bindings: Env; Variables: HonoVars }>();

/* ═══════════════════════════════
   Helper: 從專屬 Table 讀取
   ═══════════════════════════════ */

async function readHeroes(db: D1Database) {
  const rows = await db.prepare(`
    SELECT heroId AS HeroID, modelId AS ModelID, name AS Name, type AS Type,
           rarity AS Rarity, baseHP AS HP, baseATK AS ATK, baseDEF AS DEF,
           baseSPD AS Speed, critRate AS CritRate, critDmg AS CritDmg,
           element AS Element, description AS Description
    FROM heroes ORDER BY heroId
  `).all();
  return rows.results ?? [];
}

async function readSkillTemplates(db: D1Database) {
  const rows = await db.prepare(`
    SELECT skillId, name, type, element, target, description,
           effects, passive_trigger, icon
    FROM skill_templates ORDER BY skillId
  `).all();
  return rows.results ?? [];
}

async function readHeroSkills(db: D1Database) {
  const rows = await db.prepare(`
    SELECT heroId, activeSkillId, passive1_skillId, passive2_skillId,
           passive3_skillId, passive4_skillId
    FROM hero_skills ORDER BY heroId
  `).all();
  return rows.results ?? [];
}

async function readElementMatrix(db: D1Database) {
  const rows = await db.prepare(`
    SELECT attacker, defender, multiplier
    FROM element_matrix ORDER BY id
  `).all();
  return rows.results ?? [];
}

/** 正規化表對照 */
const DEDICATED_READERS: Record<string, (db: D1Database) => Promise<unknown[]>> = {
  heroes: readHeroes,
  skill_templates: readSkillTemplates,
  hero_skills: readHeroSkills,
  element_matrix: readElementMatrix,
};

/**
 * POST /readSheet
 * Body: { sheet: string }
 * Returns: { success: true, data: row[] }
 */
data.post('/readSheet', async (c) => {
  const { sheet } = getBody(c) as { sheet?: string };
  if (!sheet) {
    return c.json({ success: false, error: 'missing_sheet_name' }, 400);
  }

  const db = c.env.DB;

  // 優先從專屬 Table 讀取
  const reader = DEDICATED_READERS[sheet];
  if (reader) {
    const rows = await reader(db);
    return c.json({ success: true, data: rows });
  }

  // 其餘仍從 game_sheets 讀取
  const row = await db.prepare(
    'SELECT data FROM game_sheets WHERE sheetName = ?'
  ).bind(sheet).first<{ data: string }>();

  if (!row) {
    return c.json({ success: true, data: [] });
  }

  try {
    const parsed = JSON.parse(row.data);
    return c.json({ success: true, data: parsed });
  } catch {
    return c.json({ success: true, data: [] });
  }
});

/**
 * POST /listSheets
 * Returns: { success: true, sheets: [{ name, rows, cols }] }
 */
data.post('/listSheets', async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare(
    'SELECT sheetName, data FROM game_sheets'
  ).all<{ sheetName: string; data: string }>();

  const sheets = (rows.results ?? []).map((r) => {
    try {
      const arr = JSON.parse(r.data) as Record<string, unknown>[];
      const cols = arr.length > 0 ? Object.keys(arr[0]).length : 0;
      return { name: r.sheetName, rows: arr.length, cols };
    } catch {
      return { name: r.sheetName, rows: 0, cols: 0 };
    }
  });

  return c.json({ success: true, sheets });
});

export default data;
