/**
 * sheetApi — Google Sheets 資料存取層
 *
 * 統一封裝所有對 Google Apps Script API 的呼叫。
 * 含快取機制，同一表只拉取一次。
 */

/* ════════════════════════════════════
   API 端點
   ════════════════════════════════════ */

const GET_URL =
  'https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

/* ════════════════════════════════════
   快取
   ════════════════════════════════════ */

const cache = new Map<string, unknown[]>()

export function clearCache(): void {
  cache.clear()
}

/* ════════════════════════════════════
   通用讀取
   ════════════════════════════════════ */

/**
 * 讀取指定 Sheet（GET API — 預設讀 heroes，需 sheet 參數讀其他）
 * GET URL 預設回傳 heroes 表，讀取其他表需用 POST readSheet
 */
export async function readSheet<T = Record<string, unknown>>(sheetName: string): Promise<T[]> {
  const cacheKey = `sheet:${sheetName}`
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T[]

  // 對 heroes 表使用 GET（相容舊 API），其他表用 POST readSheet
  if (sheetName === 'heroes') {
    const res = await fetch(GET_URL)
    const data = await res.json()
    const rows = Array.isArray(data) ? data : (data.data ?? [])
    cache.set(cacheKey, rows)
    return rows as T[]
  }

  const body = JSON.stringify({ action: 'readSheet', sheet: sheetName })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  const json = await res.json()
  const rows = json.data ?? json.rows ?? []
  cache.set(cacheKey, rows)
  return rows as T[]
}

/**
 * 列出所有 Sheet 名稱
 */
export async function listSheets(): Promise<Array<{ name: string; rows: number; cols: number }>> {
  const body = JSON.stringify({ action: 'listSheets' })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  const json = await res.json()
  return json.sheets ?? []
}
