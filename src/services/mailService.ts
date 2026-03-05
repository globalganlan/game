/**
 * mailService  信箱系統前端服務
 *
 * 負責：信件載入、已讀標記、獎勵領取、信件刪除
 *
 * 對應 Spec: .ai/specs/mailbox.md v0.1
 */

import { callApi } from './apiClient'

/* 
   型別
    */

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

/* 
   API 函數
    */

let _preloadedMail: { mails: MailItem[]; unreadCount: number } | null = null
let _preloadPromise: Promise<{ mails: MailItem[]; unreadCount: number }> | null = null

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

export function invalidateMailCache(): void {
  _preloadedMail = null
  _preloadPromise = null
}

export async function loadMail(): Promise<{ mails: MailItem[]; unreadCount: number }> {
  if (_preloadedMail) {
    const cached = _preloadedMail
    _preloadedMail = null
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

export function readMail(mailId: string): { success: boolean } {
  callApi('read-mail', { mailId }).catch(e =>
    console.warn('[mail] read-mail error:', e),
  )
  return { success: true }
}

export async function claimMailReward(mailId: string): Promise<{ success: boolean; rewards: MailReward[]; currencies?: { gold?: number; diamond?: number; exp?: number } }> {
  invalidateMailCache()
  try {
    const res = await callApi<{ rewards: MailReward[]; currencies?: { gold?: number; diamond?: number; exp?: number } }>('claim-mail-reward', { mailId })
    return { success: res.success, rewards: res.rewards ?? [], currencies: res.currencies }
  } catch (e) {
    console.warn('[mail] claim-mail-reward error:', e)
    return { success: false, rewards: [] }
  }
}

export async function claimAllMail(): Promise<{
  success: boolean
  claimedCount: number
  totalRewards: MailReward[]
  currencies?: { gold?: number; diamond?: number; exp?: number }
}> {
  invalidateMailCache()
  try {
    const res = await callApi<{ claimedCount: number; totalRewards: MailReward[]; currencies?: { gold?: number; diamond?: number; exp?: number } }>('claim-all-mail', {})
    return { success: res.success, claimedCount: res.claimedCount ?? 0, totalRewards: res.totalRewards ?? [], currencies: res.currencies }
  } catch (e) {
    console.warn('[mail] claim-all-mail error:', e)
    return { success: false, claimedCount: 0, totalRewards: [] }
  }
}

export async function deleteMail(mailId: string): Promise<{ success: boolean; error?: string }> {
  const res = await callApi<{ error?: string }>('delete-mail', { mailId })
  return { success: res.success, error: res.error }
}

export async function deleteAllRead(): Promise<{ success: boolean; deletedCount: number }> {
  const res = await callApi<{ deletedCount: number }>('delete-all-read', {})
  return { success: res.success, deletedCount: res.deletedCount || 0 }
}
