/**
 * 工具函式
 */

/** SHA-256 雜湊（Web Crypto API） */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 生成 UUID v4 */
export function uuid(): string {
  return crypto.randomUUID();
}

/** 取得 UTC+8 今日日期字串 (yyyy-MM-dd) */
export function todayUTC8(): string {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().split('T')[0];
}

/** ISO 時間戳 */
export function isoNow(): string {
  return new Date().toISOString();
}

/** 安全 JSON parse，失敗回傳 fallback */
export function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/** 生成玩家 ID（P + 6 碼隨機英數） */
export function generatePlayerId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'P';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Mulberry32 確定性 PRNG（與前端 battleEngine 相同）
 * 用於確定性戰鬥 seed 重播
 */
export function createSeededRng(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
