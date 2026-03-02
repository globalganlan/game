/**
 * Checkin Routes — 每日簽到（7 天循環）
 */
import { Hono } from 'hono';
import type { Env, HonoVars, SaveDataRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, todayUTC8 } from '../utils/helpers.js';
import { upsertItemStmt } from './save.js';

const checkin = new Hono<{ Bindings: Env; Variables: HonoVars }>();

interface CheckinReward {
  gold?: number;
  diamond?: number;
  items?: { itemId: string; quantity: number }[];
}

const CHECKIN_REWARDS: CheckinReward[] = [
  /* Day 1 */ { gold: 5000 },
  /* Day 2 */ { gold: 8000, items: [{ itemId: 'exp', quantity: 500 }] },
  /* Day 3 */ { diamond: 50 },
  /* Day 4 */ { gold: 12000, items: [{ itemId: 'chest_bronze', quantity: 1 }] },
  /* Day 5 */ { diamond: 80, items: [{ itemId: 'exp', quantity: 1500 }] },
  /* Day 6 */ { gold: 20000, items: [{ itemId: 'chest_silver', quantity: 1 }] },
  /* Day 7 */ { diamond: 200, items: [{ itemId: 'chest_gold', quantity: 1 }] },
];

checkin.post('/daily-checkin', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const saveData = await db.prepare(
    'SELECT checkinDay, checkinLastDate, gold, diamond FROM save_data WHERE playerId = ?'
  ).bind(playerId).first<Pick<SaveDataRow, 'checkinDay' | 'checkinLastDate' | 'gold' | 'diamond'>>();
  if (!saveData) return c.json({ success: false, error: 'save_not_found' });

  const today = todayUTC8();
  const checkinDay = saveData.checkinDay || 0;
  const lastDate = saveData.checkinLastDate || '';

  if (lastDate === today) {
    return c.json({ success: false, error: 'already_checked_in', checkinDay, checkinLastDate: lastDate });
  }

  // 連續簽到判斷
  const yesterdayDate = new Date(Date.now() - 86400000);
  // UTC+8 yesterday
  const utc8offset = 8 * 60 * 60 * 1000;
  const yd = new Date(Date.now() - 86400000 + utc8offset);
  const yesterdayStr = `${yd.getUTCFullYear()}-${String(yd.getUTCMonth() + 1).padStart(2, '0')}-${String(yd.getUTCDate()).padStart(2, '0')}`;

  let newDay: number;
  if (lastDate === yesterdayStr && checkinDay < 7) {
    newDay = checkinDay + 1;
  } else if (checkinDay >= 7) {
    newDay = 1;
  } else {
    newDay = 1;
  }

  const reward = CHECKIN_REWARDS[newDay - 1];
  const goldGain = reward.gold || 0;
  const diamondGain = reward.diamond || 0;
  const rewardItems = reward.items || [];

  // 原子交易：更新貨幣 + 簽到狀態 + 道具
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE save_data SET
        gold = gold + ?, diamond = diamond + ?,
        checkinDay = ?, checkinLastDate = ?, lastSaved = ?
       WHERE playerId = ?`
    ).bind(goldGain, diamondGain, newDay, today, isoNow(), playerId),
  ];

  // 道具
  for (const item of rewardItems) {
    stmts.push(upsertItemStmt(db, playerId, item.itemId, item.quantity));
  }

  await db.batch(stmts);

  return c.json({
    success: true,
    checkinDay: newDay, checkinLastDate: today,
    reward: { gold: goldGain, diamond: diamondGain, items: rewardItems },
  });
});

export default checkin;
