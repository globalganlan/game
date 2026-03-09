/**
 * Auth Routes — 帳號註冊/登入/綁定/改名/改密碼
 * 不套用 authMiddleware（註冊/登入時還沒有 token）
 */
import { Hono } from 'hono';
import type { Env, HonoVars, PlayerRow } from '../types.js';
import { sha256, generatePlayerId, isoNow, uuid } from '../utils/helpers.js';
import { pushToPlayer } from '../utils/pusher.js';
import { insertMailStmt } from './mail.js';

const auth = new Hono<{ Bindings: Env; Variables: HonoVars }>();

// ── 訪客註冊 ──────────────────────────────────
auth.post('/register-guest', async (c) => {
  const { guestToken } = await c.req.json<{ guestToken?: string }>();
  if (!guestToken) return c.json({ success: false, error: 'missing guestToken' });

  // 檢查是否已存在
  const existing = await c.env.DB.prepare(
    'SELECT playerId, displayName FROM players WHERE guestToken = ?'
  ).bind(guestToken).first<Pick<PlayerRow, 'playerId' | 'displayName'>>();

  if (existing) {
    return c.json({
      success: true,
      playerId: existing.playerId,
      displayName: existing.displayName,
      alreadyExists: true,
    });
  }

  // 生成唯一 playerId
  let playerId: string;
  for (let attempt = 0; attempt < 10; attempt++) {
    playerId = generatePlayerId();
    const dup = await c.env.DB.prepare(
      'SELECT 1 FROM players WHERE playerId = ?'
    ).bind(playerId).first();
    if (!dup) break;
  }
  playerId = playerId!;

  const now = isoNow();
  const displayName = '倖存者#' + playerId.replace('P', '');

  // 建立玩家 + 歡迎信 — 原子批次
  const mailId = uuid();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO players (playerId, guestToken, email, passwordHash, displayName, createdAt, lastLogin, isBound)
       VALUES (?, ?, '', '', ?, ?, ?, 0)`
    ).bind(playerId, guestToken, displayName, now, now),
    insertMailStmt(
      c.env.DB, mailId, playerId,
      '🎉 歡迎來到全球感染！',
      '感謝加入末日生存之旅！這是你的新手禮包，祝你在感染的世界中存活下來！',
      [
        { itemId: 'diamond', quantity: 300 },
        { itemId: 'gold', quantity: 10000 },
        { itemId: 'exp', quantity: 6500 },
        { itemId: 'gacha_ticket_hero', quantity: 10 },
        { itemId: 'gacha_ticket_equip', quantity: 10 },
      ],
    ),
  ]);

  return c.json({
    success: true,
    playerId,
    displayName,
    alreadyExists: false,
  });
});

// ── 訪客登入 ──────────────────────────────────
auth.post('/login-guest', async (c) => {
  const { guestToken } = await c.req.json<{ guestToken?: string }>();
  if (!guestToken) return c.json({ success: false, error: 'missing guestToken' });

  const row = await c.env.DB.prepare(
    'SELECT playerId, displayName, isBound FROM players WHERE guestToken = ?'
  ).bind(guestToken).first<Pick<PlayerRow, 'playerId' | 'displayName' | 'isBound'>>();

  if (!row) return c.json({ success: false, error: 'token_not_found' });

  await c.env.DB.prepare(
    'UPDATE players SET lastLogin = ? WHERE guestToken = ?'
  ).bind(isoNow(), guestToken).run();

  return c.json({
    success: true,
    playerId: row.playerId,
    displayName: row.displayName,
    isBound: row.isBound === 1,
  });
});

// ── 帳密登入 ──────────────────────────────────
auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email) return c.json({ success: false, error: 'missing email' });
  if (!password) return c.json({ success: false, error: 'missing password' });

  const row = await c.env.DB.prepare(
    'SELECT playerId, guestToken, displayName, passwordHash FROM players WHERE email = ?'
  ).bind(email).first<Pick<PlayerRow, 'playerId' | 'guestToken' | 'displayName' | 'passwordHash'>>();

  if (!row) return c.json({ success: false, error: 'email_not_found' });

  const hash = await sha256(password);
  if (hash !== row.passwordHash) return c.json({ success: false, error: 'wrong_password' });

  await c.env.DB.prepare(
    'UPDATE players SET lastLogin = ? WHERE playerId = ?'
  ).bind(isoNow(), row.playerId).run();

  return c.json({
    success: true,
    playerId: row.playerId,
    guestToken: row.guestToken,
    displayName: row.displayName,
  });
});

// ── 綁定帳密 ──────────────────────────────────
auth.post('/bind-account', async (c) => {
  const body = await c.req.json<{ guestToken?: string; email?: string; password?: string }>();
  const token = body.guestToken;
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!token) return c.json({ success: false, error: 'missing guestToken' });
  if (!email) return c.json({ success: false, error: 'missing email' });
  if (!password || password.length < 6) return c.json({ success: false, error: 'password must be >= 6 chars' });

  const player = await c.env.DB.prepare(
    'SELECT playerId, isBound FROM players WHERE guestToken = ?'
  ).bind(token).first<Pick<PlayerRow, 'playerId' | 'isBound'>>();

  if (!player) return c.json({ success: false, error: 'token_not_found' });

  // 檢查 email 是否已被其他人使用
  const emailOwner = await c.env.DB.prepare(
    'SELECT playerId FROM players WHERE email = ?'
  ).bind(email).first<Pick<PlayerRow, 'playerId'>>();

  if (emailOwner && emailOwner.playerId !== player.playerId) {
    return c.json({ success: false, error: 'email_taken' });
  }

  const hash = await sha256(password);

  // 首次綁定 → 更新帳密 + 寄獎勵信，原子批次
  if (player.isBound === 0) {
    const mailId = uuid();
    const now = isoNow();
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE players SET email = ?, passwordHash = ?, isBound = 1 WHERE guestToken = ?'
      ).bind(email, hash, token),
      insertMailStmt(
        c.env.DB, mailId, player.playerId,
        '🔗 帳號綁定獎勵',
        '恭喜完成帳號綁定！您的帳號現在更安全了，可以跨裝置登入保留所有進度。這是您的綁定獎勵！',
        [
          { itemId: 'diamond', quantity: 200 },
          { itemId: 'gold', quantity: 5000 },
        ],
      ),
    ]);

    // Pusher 推播新信件
    await pushToPlayer(
      {
        appId: c.env.PUSHER_APP_ID,
        key: c.env.PUSHER_KEY,
        secret: c.env.PUSHER_SECRET,
        cluster: c.env.PUSHER_CLUSTER,
      },
      player.playerId,
      'new-mail',
      { title: '🔗 帳號綁定獎勵' }
    );
  } else {
    // 已綁定過 → 僅更新帳密
    await c.env.DB.prepare(
      'UPDATE players SET email = ?, passwordHash = ?, isBound = 1 WHERE guestToken = ?'
    ).bind(email, hash, token).run();
  }

  return c.json({ success: true, message: '帳號綁定成功' });
});

// ── 修改暱稱 ──────────────────────────────────
auth.post('/change-name', async (c) => {
  const body = await c.req.json<{ guestToken?: string; newName?: string }>();
  const token = body.guestToken;
  const newName = (body.newName || '').trim();
  if (!token) return c.json({ success: false, error: 'missing guestToken' });
  if (!newName || newName.length < 1 || newName.length > 20)
    return c.json({ success: false, error: 'name must be 1-20 chars' });

  // 先查 playerId，再批次更新 players + arena_rankings
  const player = await c.env.DB.prepare(
    'SELECT playerId FROM players WHERE guestToken = ?'
  ).bind(token).first<{ playerId: string }>();
  if (!player) return c.json({ success: false, error: 'token_not_found' });

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE players SET displayName = ? WHERE playerId = ?').bind(newName, player.playerId),
    c.env.DB.prepare('UPDATE arena_rankings SET displayName = ? WHERE playerId = ?').bind(newName, player.playerId),
  ]);

  return c.json({ success: true });
});

// ── 修改密碼 ──────────────────────────────────
auth.post('/change-password', async (c) => {
  const body = await c.req.json<{
    guestToken?: string;
    oldPassword?: string;
    newPassword?: string;
  }>();
  const token = body.guestToken;
  if (!token) return c.json({ success: false, error: 'missing guestToken' });
  if (!body.oldPassword) return c.json({ success: false, error: 'missing oldPassword' });
  if (!body.newPassword || body.newPassword.length < 6)
    return c.json({ success: false, error: 'new password must be >= 6 chars' });

  const player = await c.env.DB.prepare(
    'SELECT passwordHash, isBound FROM players WHERE guestToken = ?'
  ).bind(token).first<Pick<PlayerRow, 'passwordHash' | 'isBound'>>();

  if (!player) return c.json({ success: false, error: 'token_not_found' });
  if (player.isBound === 0) return c.json({ success: false, error: 'account_not_bound' });

  const oldHash = await sha256(body.oldPassword);
  if (oldHash !== player.passwordHash) return c.json({ success: false, error: 'wrong_password' });

  const newHash = await sha256(body.newPassword);
  await c.env.DB.prepare(
    'UPDATE players SET passwordHash = ? WHERE guestToken = ?'
  ).bind(newHash, token).run();

  return c.json({ success: true, message: '密碼已更新' });
});

export default auth;
