/**
 * Auth 中介層 — 從 guestToken 解析 playerId 並注入 c.set('playerId', ...)
 * 放在所有需要認證的 route group 前面
 */
import { createMiddleware } from 'hono/factory';
import type { Env, HonoVars, PlayerRow } from '../types.js';

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: HonoVars;
}>(async (c, next) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  // 把 body 存到 c.set 讓後續 handler 使用
  c.set('playerId', '');
  (c as any)._body = body;

  const guestToken = body.guestToken as string | undefined;
  if (!guestToken) {
    return c.json({ success: false, error: 'missing guestToken' }, 401);
  }

  const row = await c.env.DB.prepare(
    'SELECT playerId FROM players WHERE guestToken = ?'
  ).bind(guestToken).first<Pick<PlayerRow, 'playerId'>>();

  if (!row) {
    return c.json({ success: false, error: 'invalid_token' }, 401);
  }

  c.set('playerId', row.playerId);
  await next();
});

/** 取得請求體（已在 authMiddleware 中快取） */
export function getBody(c: any): Record<string, unknown> {
  return (c as any)._body || {};
}
