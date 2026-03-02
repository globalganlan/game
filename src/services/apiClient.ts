/**
 * apiClient — 統一 HTTP 客戶端，連接 Cloudflare Workers API
 *
 * 所有前端服務層透過此模組呼叫後端 API。
 * - Auth 端點走 /api/auth/*（不帶 token）
 * - 其他端點走 /api/*（自動注入 guestToken）
 */

/* ════════════════════════════════════
   Base URL（開發 / 正式由 import.meta.env 控制）
   ════════════════════════════════════ */

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8787'

/* ════════════════════════════════════
   Token 管理（與 authService 共用 localStorage key）
   ════════════════════════════════════ */

const STORAGE_KEY_TOKEN = 'globalganlan_guest_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY_TOKEN)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(STORAGE_KEY_TOKEN, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(STORAGE_KEY_TOKEN)
}

/* ════════════════════════════════════
   API Response 型別
   ════════════════════════════════════ */

export interface ApiResponse<T = Record<string, unknown>> {
  success: boolean
  error?: string
  [key: string]: unknown
}

/* ════════════════════════════════════
   通用呼叫
   ════════════════════════════════════ */

/**
 * 呼叫 Auth 端點（不自動注入 token）
 */
export async function callAuthApi<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<T & { success: boolean; error?: string }> {
  const url = `${API_BASE}/api/auth/${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  return res.json()
}

/**
 * 呼叫受保護端點（自動注入 guestToken）
 */
export async function callApi<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<T & { success: boolean; error?: string }> {
  const token = getStoredToken()
  const url = `${API_BASE}/api/${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, guestToken: token }),
  })
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  return res.json()
}

/**
 * 讀取靜態資料（GET）
 */
export async function callGet<T = unknown>(endpoint: string): Promise<T> {
  const url = `${API_BASE}/api/${endpoint}`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  return res.json()
}
