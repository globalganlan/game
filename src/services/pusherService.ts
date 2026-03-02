/**
 * pusherService — Pusher 即時推播前端客戶端
 *
 * 玩家登入後連線 Pusher，訂閱 `player-{playerId}` 頻道，
 * 收到 `new-mail` 事件時通知 UI 刷新信箱。
 */

import Pusher from 'pusher-js'

// ── Pusher 設定 ──────────────────────────────
const PUSHER_KEY = '9f709147d9aaf1df1517'
const PUSHER_CLUSTER = 'ap3'

// ── 內部狀態 ──────────────────────────────────
let pusherInstance: Pusher | null = null
let currentChannel: string | null = null

type MailCallback = (data: { title?: string; mailId?: string }) => void
const mailListeners: MailCallback[] = []

/**
 * 連線 Pusher 並訂閱玩家頻道
 * 應在登入成功取得 playerId 後呼叫
 */
export function connectPusher(playerId: string): void {
  // 已連線同一頻道 → 跳過
  const channelName = `player-${playerId}`
  if (pusherInstance && currentChannel === channelName) return

  // 先斷開舊連線
  disconnectPusher()

  pusherInstance = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    // Sandbox plan 不支援加密頻道，用一般頻道
    forceTLS: true,
  })

  const channel = pusherInstance.subscribe(channelName)
  currentChannel = channelName

  channel.bind('new-mail', (data: { title?: string; mailId?: string }) => {
    console.log('[Pusher] new-mail event:', data)
    for (const fn of mailListeners) {
      try { fn(data) } catch { /* silent */ }
    }
  })

  console.log(`[Pusher] connected, subscribed to ${channelName}`)
}

/**
 * 斷開 Pusher 連線（登出時呼叫）
 */
export function disconnectPusher(): void {
  if (pusherInstance) {
    if (currentChannel) {
      pusherInstance.unsubscribe(currentChannel)
    }
    pusherInstance.disconnect()
    pusherInstance = null
    currentChannel = null
    console.log('[Pusher] disconnected')
  }
}

/**
 * 訂閱信箱通知事件
 * @returns 取消訂閱函式
 */
export function onNewMail(fn: MailCallback): () => void {
  mailListeners.push(fn)
  return () => {
    const idx = mailListeners.indexOf(fn)
    if (idx >= 0) mailListeners.splice(idx, 1)
  }
}
