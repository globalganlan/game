/**
 * sheetApi  靜態資料存取層
 *
 * 統一封裝所有對 Workers API 的靜態資料讀取。
 * 含快取機制，同一表只拉取一次。
 */

import { callApi, callGet } from './apiClient'

/* 
   快取
    */

const cache = new Map<string, unknown[]>()

export function clearCache(): void {
  cache.clear()
}

/* 
   通用讀取
    */

/**
 * 讀取指定 Sheet（透過 Workers API）
 */
export async function readSheet<T = Record<string, unknown>>(sheetName: string): Promise<T[]> {
  const cacheKey = `sheet:${sheetName}`
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T[]

  const res = await callApi<{ data?: T[]; rows?: T[] }>('readSheet', { sheet: sheetName })
  const rows = res.data ?? res.rows ?? []
  cache.set(cacheKey, rows as unknown[])
  return rows as T[]
}

