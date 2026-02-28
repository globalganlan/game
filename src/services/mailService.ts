/**
 * mailService — 信箱系統前端服務
 *
 * 負責：信件載入、已讀標記、獎勵領取、信件刪除
 *
 * 對應 Spec: specs/mailbox.md v0.1
 */

import { getAuthState } from './authService'
import { fireOptimisticAsync } from './optimisticQueue'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface MailReward {
  itemId: string
  quantity: number
}

export interface MailItem {
  mailId: string
  title: string
  body: string
  rewards: MailReward[]
  claimed: boolean
  read: boolean
  createdAt: string
  expiresAt: string | null
}

/* ════════════════════════════════════
   通用 API 呼叫
   ════════════════════════════════════ */

async function callApi<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T & { success: boolean; error?: string }> {
  const token = getAuthState().guestToken
  if (!token) throw new Error('not_logged_in')
  const body = JSON.stringify({ action, guestToken: token, ...params })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  return res.json()
}

/* ════════════════════════════════════
   API 函數
   ════════════════════════════════════ */

/** 預載快取 */
let _preloadedMail: { mails: MailItem[]; unreadCount: number } | null = null
let _preloadPromise: Promise<{ mails: MailItem[]; unreadCount: number }> | null = null

/** 預載信箱資料（loading 時呼叫，後續 loadMail 會直接用快取） */
export function preloadMail(): Promise<{ mails: MailItem[]; unreadCount: number }> {
  if (_preloadedMail) return Promise.resolve(_preloadedMail)
  if (!_preloadPromise) {
    _preloadPromise = callApi<{ mails: MailItem[]; unreadCount: number }>('load-mail')
      .then(res => {
        if (!res.success) throw new Error(res.error || 'load-mail failed')
        const data = { mails: res.mails || [], unreadCount: res.unreadCount || 0 }
        _preloadedMail = data
        return data
      })
      .catch(e => { _preloadPromise = null; throw e })
  }
  return _preloadPromise
}

/** 清除預載快取（領取/刪除後呼叫強制重新載入） */
export function invalidateMailCache(): void {
  _preloadedMail = null
  _preloadPromise = null
}

/** 載入所有信件 */
export async function loadMail(): Promise<{ mails: MailItem[]; unreadCount: number }> {
  // 優先使用預載快取
  if (_preloadedMail) {
    const cached = _preloadedMail
    _preloadedMail = null // 用完即棄，下次重新拉取
    return cached
  }
  if (_preloadPromise) {
    try {
      const cached = await _preloadPromise
      _preloadPromise = null
      _preloadedMail = null
      return cached
    } catch { /* fall through to fresh load */ }
  }
  const res = await callApi<{ mails: MailItem[]; unreadCount: number }>('load-mail')
  if (!res.success) throw new Error(res.error || 'load-mail failed')
  return { mails: res.mails || [], unreadCount: res.unreadCount || 0 }
}

/** 標記信件已讀 */
export async function readMail(mailId: string): Promise<{ success: boolean }> {
  const res = await callApi('read-mail', { mailId })
  return { success: res.success }
}

/** 領取單封信件獎勵（樂觀更新 — 立即回傳成功，背景同步伺服器） */
export async function claimMailReward(mailId: string): Promise<{ success: boolean; rewards: MailReward[] }> {
  // 透過樂觀佇列發送，帶 opId 做幂等保護
  const { serverResult } = fireOptimisticAsync<{ rewards: MailReward[] }>(
    'claim-mail-reward',
    { mailId },
    () => { invalidateMailCache() },
  )
  // 背景追蹤伺服器結果（不阻塞呼叫者）
  serverResult.catch(e => console.warn('[mail] claim-mail-reward background error:', e))
  // 立即回傳成功（呼叫端會用已知的 mail.rewards 顯示結果）
  return { success: true, rewards: [] }
}

/** 一鍵領取全部信件獎勵（樂觀更新） */
export async function claimAllMail(): Promise<{
  success: boolean
  claimedCount: number
  totalRewards: MailReward[]
}> {
  const { serverResult } = fireOptimisticAsync<{ claimedCount: number; totalRewards: MailReward[] }>(
    'claim-all-mail',
    {},
    () => { invalidateMailCache() },
  )
  serverResult.catch(e => console.warn('[mail] claim-all-mail background error:', e))
  return { success: true, claimedCount: 0, totalRewards: [] }
}

/** 刪除信件（樂觀佇列 — 背景同步 + localStorage 備份） */
export async function deleteMail(mailId: string): Promise<{ success: boolean; error?: string }> {
  const { serverResult } = fireOptimisticAsync<{ error?: string }>('delete-mail', { mailId })
  const res = await serverResult
  return { success: res.success, error: res.error }
}

/** 刪除所有已讀（已領取/無獎勵）信件 — 樂觀佇列保護 */
export async function deleteAllRead(): Promise<{ success: boolean; deletedCount: number }> {
  const { serverResult } = fireOptimisticAsync<{ deletedCount: number }>('delete-all-read', {})
  const res = await serverResult
  return { success: res.success, deletedCount: res.deletedCount || 0 }
}
