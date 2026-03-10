/**
 * Data Routes — 靜態遊戲資料讀取
 *
 * 前端 sheetApi.ts 的 readSheet 對應端點。
 * heroes / skill_templates / hero_skills
 * 從專屬 D1 表讀取。
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
           description AS Description
    FROM heroes ORDER BY heroId
  `).all();
  return rows.results ?? [];
}

async function readSkillTemplates(db: D1Database) {
  const rows = await db.prepare(`
    SELECT skillId, name, type, target, description,
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

/** 正規化表對照 */
const DEDICATED_READERS: Record<string, (db: D1Database) => Promise<unknown[]>> = {
  heroes: readHeroes,
  skill_templates: readSkillTemplates,
  hero_skills: readHeroSkills,
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

  // 從專屬 Table 讀取
  const reader = DEDICATED_READERS[sheet];
  if (reader) {
    const rows = await reader(db);
    return c.json({ success: true, data: rows });
  }

  // 未知的 sheetName 回傳空陣列
  return c.json({ success: true, data: [] });
});


export default data;
