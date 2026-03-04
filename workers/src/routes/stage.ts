/**
 * Stage Routes — 關卡配置 API
 *
 * 從 D1 stage_configs 表讀取所有主線關卡的敵方陣容、獎勵、章節資訊等。
 * 前端 StageSelect 不再前端 hardcode，改從此 API 取得。
 */
import { Hono } from 'hono';
import type { Env, HonoVars } from '../types.js';
import { getBody } from '../middleware/auth.js';

const stage = new Hono<{ Bindings: Env; Variables: HonoVars }>();

export interface StageConfigRow {
  stageId: string;
  chapter: number;
  stage: number;
  enemies: string;  // JSON
  rewards: string;  // JSON
  extra: string;    // JSON
}

/**
 * POST /list-stages
 * Body: { chapter?: number } （可選篩選）
 * Returns: { success: true, stages: StageConfigRow[] }
 */
stage.post('/list-stages', async (c) => {
  const db = c.env.DB;

  const rows = await db.prepare(
    'SELECT stageId, chapter, stage, enemies, rewards, extra FROM stage_configs ORDER BY chapter, stage'
  ).all<StageConfigRow>();

  const safeParse = (val: string | null | undefined, fallback: string): unknown => {
    try {
      return JSON.parse(val || fallback);
    } catch (e) {
      console.error('[list-stages] JSON.parse failed for value:', val, e);
      return JSON.parse(fallback);
    }
  };

  const stages = (rows.results ?? []).map(r => ({
    stageId: r.stageId,
    chapter: r.chapter,
    stage: r.stage,
    enemies: safeParse(r.enemies, '[]'),
    rewards: safeParse(r.rewards, '{}'),
    extra: safeParse(r.extra, '{}'),
  }));

  return c.json({ success: true, stages });
});

/**
 * POST /stage-config
 * Body: { stageId: string }
 * Returns: { success: true, config: parsed StageConfig }
 */
stage.post('/stage-config', async (c) => {
  const db = c.env.DB;
  const body = getBody(c) as { stageId?: string };
  const stageId = body.stageId;
  if (!stageId) return c.json({ success: false, error: 'missing stageId' });

  const row = await db.prepare(
    'SELECT stageId, chapter, stage, enemies, rewards, extra FROM stage_configs WHERE stageId = ?'
  ).bind(stageId).first<StageConfigRow>();

  if (!row) return c.json({ success: false, error: 'stage_not_found' });

  const safeParse = (val: string | null | undefined, fb: string): unknown => {
    try { return JSON.parse(val || fb); } catch { return JSON.parse(fb); }
  };

  return c.json({
    success: true,
    config: {
      stageId: row.stageId,
      chapter: row.chapter,
      stage: row.stage,
      enemies: safeParse(row.enemies, '[]'),
      rewards: safeParse(row.rewards, '{}'),
      extra: safeParse(row.extra, '{}'),
    },
  });
});

export default stage;
