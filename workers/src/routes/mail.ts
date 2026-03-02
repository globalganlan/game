/**
 * Mail Routes — 信箱系統（讀取、標記已讀、領取獎勵、刪除、發信、PWA 獎勵）
 */
import { Hono } from 'hono';
import type { Env, HonoVars, MailboxRow } from '../types.js';
import { getBody } from '../middleware/auth.js';
import { isoNow, uuid, safeJsonParse } from '../utils/helpers.js';
import { pushToPlayer } from '../utils/pusher.js';
import { grantRewardsStmts } from './save.js';

const mail = new Hono<{ Bindings: Env; Variables: HonoVars }>();

interface RewardItem { itemId: string; quantity: number }

// ── 共用：grantRewards(D1 版) — 回傳 statements 供 batch ──
function grantRewardsMailStmts(db: D1Database, playerId: string, rewards: RewardItem[]): D1PreparedStatement[] {
  return grantRewardsStmts(db, playerId, rewards);
}

// ── 共用：查詢玩家有效信件 ───────────────
async function getPlayerMails(db: D1Database, playerId: string): Promise<MailboxRow[]> {
  const now = isoNow();
  const rows = await db.prepare(
    `SELECT * FROM mailbox
     WHERE (playerId = ? OR playerId = '*') AND (deletedAt IS NULL OR deletedAt = '') AND (expiresAt IS NULL OR expiresAt = '' OR expiresAt > ?)
     ORDER BY
       CASE WHEN read = 0 THEN 0 ELSE 1 END,
       createdAt DESC`
  ).bind(playerId, now).all<MailboxRow>();
  return rows.results || [];
}

// ── 共用：寫入信件 ──────────────────────
/** 回傳 D1PreparedStatement（不執行），可收入 db.batch() */
function insertMailStmt(
  db: D1Database, mailId: string, playerId: string, title: string, body: string,
  rewards: RewardItem[], expiresAt?: string,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO mailbox (mailId, playerId, title, body, rewards, claimed, read, createdAt, expiresAt)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).bind(mailId, playerId, title.slice(0, 50), body.slice(0, 500), JSON.stringify(rewards), isoNow(), expiresAt || '');
}

/** 向後相容包裝：直接執行 INSERT 並回傳 mailId */
async function insertMail(
  db: D1Database, playerId: string, title: string, body: string,
  rewards: RewardItem[], expiresAt?: string,
): Promise<string> {
  const mailId = uuid();
  await insertMailStmt(db, mailId, playerId, title, body, rewards, expiresAt).run();
  return mailId;
}

// ════════════════════════════════════════════
// Load Mail
// ════════════════════════════════════════════
mail.post('/load-mail', async (c) => {
  const playerId = c.get('playerId');
  const mails = await getPlayerMails(c.env.DB, playerId);

  let unreadCount = 0;
  const result = mails.map(m => {
    if (!m.read) unreadCount++;
    return {
      mailId: m.mailId,
      title: m.title || '',
      body: m.body || '',
      rewards: safeJsonParse<RewardItem[]>(m.rewards, []),
      claimed: !!m.claimed,
      read: !!m.read,
      createdAt: m.createdAt || '',
      expiresAt: m.expiresAt || null,
    };
  });

  return c.json({ success: true, mails: result, unreadCount });
});

// ════════════════════════════════════════════
// Read Mail (標記已讀)
// ════════════════════════════════════════════
mail.post('/read-mail', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const mailId = body.mailId as string;
  if (!mailId) return c.json({ success: false, error: 'missing mailId' });

  const row = await c.env.DB.prepare(`SELECT mailId FROM mailbox WHERE mailId = ? AND playerId = ? AND (deletedAt IS NULL OR deletedAt = '')`) .bind(mailId, playerId).first();
  if (!row) return c.json({ success: false, error: 'mail_not_found' });

  await c.env.DB.prepare('UPDATE mailbox SET read = 1 WHERE mailId = ?').bind(mailId).run();
  return c.json({ success: true });
});

// ════════════════════════════════════════════
// Claim Mail Reward
// ════════════════════════════════════════════
mail.post('/claim-mail-reward', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;
  const body = getBody(c);
  const mailId = body.mailId as string;
  if (!mailId) return c.json({ success: false, error: 'missing mailId' });

  const m = await db.prepare(`SELECT * FROM mailbox WHERE mailId = ? AND playerId = ? AND (deletedAt IS NULL OR deletedAt = '')`) .bind(mailId, playerId).first<MailboxRow>();
  if (!m) return c.json({ success: false, error: 'mail_not_found' });
  if (m.claimed) return c.json({ success: false, error: 'already_claimed' });

  const rewards = safeJsonParse<RewardItem[]>(m.rewards, []);
  if (rewards.length === 0) return c.json({ success: false, error: 'no_rewards' });

  // 原子交易：發獎勵 + 標記已領
  const stmts = grantRewardsMailStmts(db, playerId, rewards);
  stmts.push(db.prepare('UPDATE mailbox SET claimed = 1, read = 1 WHERE mailId = ?').bind(mailId));
  await db.batch(stmts);

  return c.json({ success: true, rewards });
});

// ════════════════════════════════════════════
// Claim All Mail
// ════════════════════════════════════════════
mail.post('/claim-all-mail', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const mails = await getPlayerMails(db, playerId);
  let claimedCount = 0;
  const totalMap: Record<string, number> = {};
  const allStmts: D1PreparedStatement[] = [];

  for (const m of mails) {
    if (m.claimed) continue;
    const rewards = safeJsonParse<RewardItem[]>(m.rewards, []);
    if (rewards.length === 0) continue;

    allStmts.push(...grantRewardsMailStmts(db, playerId, rewards));
    allStmts.push(db.prepare('UPDATE mailbox SET claimed = 1, read = 1 WHERE mailId = ?').bind(m.mailId));
    claimedCount++;

    for (const r of rewards) {
      totalMap[r.itemId] = (totalMap[r.itemId] || 0) + (r.quantity || 0);
    }
  }

  if (allStmts.length > 0) await db.batch(allStmts);

  const totalRewards = Object.entries(totalMap).map(([itemId, quantity]) => ({ itemId, quantity }));
  return c.json({ success: true, claimedCount, totalRewards });
});

// ════════════════════════════════════════════
// Delete Mail (soft delete)
// ════════════════════════════════════════════
mail.post('/delete-mail', async (c) => {
  const playerId = c.get('playerId');
  const body = getBody(c);
  const mailId = body.mailId as string;
  if (!mailId) return c.json({ success: false, error: 'missing mailId' });

  const m = await c.env.DB.prepare(`SELECT * FROM mailbox WHERE mailId = ? AND playerId = ? AND (deletedAt IS NULL OR deletedAt = '')`) .bind(mailId, playerId).first<MailboxRow>();
  if (!m) return c.json({ success: false, error: 'mail_not_found' });

  const rewards = safeJsonParse<RewardItem[]>(m.rewards, []);
  if (rewards.length > 0 && !m.claimed) return c.json({ success: false, error: 'has_unclaimed_rewards' });

  await c.env.DB.prepare('UPDATE mailbox SET deletedAt = ? WHERE mailId = ?').bind(isoNow(), mailId).run();
  return c.json({ success: true });
});

// ════════════════════════════════════════════
// Delete All Read
// ════════════════════════════════════════════
mail.post('/delete-all-read', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const mails = await getPlayerMails(db, playerId);
  const now = isoNow();
  const stmts: D1PreparedStatement[] = [];

  for (const m of mails) {
    if (!m.read) continue;
    const rewards = safeJsonParse<RewardItem[]>(m.rewards, []);
    if (rewards.length > 0 && !m.claimed) continue;
    stmts.push(db.prepare('UPDATE mailbox SET deletedAt = ? WHERE mailId = ?').bind(now, m.mailId));
  }

  if (stmts.length > 0) await db.batch(stmts);

  return c.json({ success: true, deletedCount: stmts.length });
});

// ════════════════════════════════════════════
// Send Mail (管理用)
// ════════════════════════════════════════════
mail.post('/send-mail', async (c) => {
  const body = getBody(c);
  const targetIds = (body.targetPlayerIds as string[]) || [];
  const title = (body.title as string || '').slice(0, 50);
  const mailBody = (body.body as string || '').slice(0, 500);
  const rewards = (body.rewards as RewardItem[]) || [];
  const expiresAt = (body.expiresAt as string) || '';

  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [];
  const mailInfos: { pid: string; mailId: string }[] = [];

  for (const pid of targetIds) {
    const mailId = uuid();
    const upperPid = pid.toUpperCase();
    stmts.push(insertMailStmt(db, mailId, upperPid, title, mailBody, rewards, expiresAt || undefined));
    mailInfos.push({ pid: upperPid, mailId });
  }

  if (stmts.length > 0) await db.batch(stmts);

  // Pusher 推播（非關鍵，失敗不影響結果）
  for (const { pid, mailId } of mailInfos) {
    try {
      await pushToPlayer(
        { appId: c.env.PUSHER_APP_ID, key: c.env.PUSHER_KEY, secret: c.env.PUSHER_SECRET, cluster: c.env.PUSHER_CLUSTER },
        pid, 'new-mail', { mailId, title }
      );
    } catch { /* ignore push failure */ }
  }

  return c.json({ success: true, sentCount: stmts.length });
});

// ════════════════════════════════════════════
// Claim PWA Reward
// ════════════════════════════════════════════
mail.post('/claim-pwa-reward', async (c) => {
  const playerId = c.get('playerId');
  const db = c.env.DB;

  const saveData = await db.prepare('SELECT pwaRewardClaimed FROM save_data WHERE playerId = ?')
    .bind(playerId).first<{ pwaRewardClaimed: number }>();
  if (!saveData) return c.json({ success: false, error: 'no_save_data' });
  if (saveData.pwaRewardClaimed) return c.json({ success: false, error: 'already_claimed' });

  // 標記已領取 + 寄信 — 原子批次
  const pwaMailId = uuid();
  await db.batch([
    db.prepare('UPDATE save_data SET pwaRewardClaimed = 1 WHERE playerId = ?').bind(playerId),
    insertMailStmt(db, pwaMailId, playerId, '📱 加入主畫面獎勵',
      '感謝將全球感染加入主畫面！享受更快的載入速度與更穩定的遊戲體驗。這是您的安裝獎勵！',
      [{ itemId: 'diamond', quantity: 100 }, { itemId: 'gold', quantity: 3000 }]),
  ]);

  try {
    await pushToPlayer(
      { appId: c.env.PUSHER_APP_ID, key: c.env.PUSHER_KEY, secret: c.env.PUSHER_SECRET, cluster: c.env.PUSHER_CLUSTER },
      playerId, 'new-mail', { title: '📱 加入主畫面獎勵' }
    );
  } catch { /* ignore */ }

  return c.json({ success: true, message: 'PWA 安裝獎勵已發送' });
});

// Export insertMail for use by other modules (e.g. auth welcome mail)
export { insertMail, insertMailStmt, grantRewardsMailStmts as grantMailRewards };
export default mail;
