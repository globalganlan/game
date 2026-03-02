/**
 * Pusher HTTP API 觸發器（伺服器端推送）
 * 使用 Pusher REST API 發送事件，無需 SDK
 */

interface PusherConfig {
  appId: string;
  key: string;
  secret: string;
  cluster: string;
}

interface PusherEvent {
  channel: string;
  name: string;
  data: unknown;
}

/**
 * 透過 Pusher HTTP API 觸發事件
 * POST https://api-{cluster}.pusher.com/apps/{app_id}/events
 */
export async function triggerPusherEvent(
  config: PusherConfig,
  event: PusherEvent
): Promise<void> {
  if (!config.appId || !config.key || !config.secret) {
    // Pusher 未配置，靜默跳過
    return;
  }

  const body = JSON.stringify({
    name: event.name,
    channel: event.channel,
    data: JSON.stringify(event.data),
  });

  const path = `/apps/${config.appId}/events`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const md5Hash = await md5(body);

  const params: Record<string, string> = {
    auth_key: config.key,
    auth_timestamp: timestamp,
    auth_version: '1.0',
    body_md5: md5Hash,
  };

  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');

  const sigString = `POST\n${path}\n${sortedQuery}`;
  const authSig = await hmacSHA256(config.secret, sigString);

  const url = `https://api-${config.cluster}.pusher.com${path}?${sortedQuery}&auth_signature=${authSig}`;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/** HMAC-SHA256 hex */
async function hmacSHA256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** MD5 hex — 用 Web Crypto (Workers 環境支援 MD5 for non-security use) */
async function md5(message: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('MD5', enc.encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 便利函式：推送到玩家私人頻道
 */
export async function pushToPlayer(
  config: PusherConfig,
  playerId: string,
  eventName: string,
  data: unknown
): Promise<void> {
  return triggerPusherEvent(config, {
    channel: `private-player-${playerId}`,
    name: eventName,
    data,
  });
}
