/**
 * gachaPreloadService — 召喚預加載池管理
 *
 * 改版：後端預生成 200 組抽卡結果並持久化存儲。
 * 每次抽卡從預生成池消耗（單抽 1 組，十連 10 組）。
 * 消耗後後端自動補充到 200 組。
 * 每次連線載入的都是同一份池——結果不會因重連而改變。
 *
 * 前端職責：
 * - 追蹤剩餘池數量（從 load-save / gacha-pull 回傳值更新）
 * - 預載一組 API 呼叫以消除等待時間
 * - 提供池剩餘數量給 UI 顯示
 */

import { gachaPull } from './progressionService'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface GachaPreloadResult {
  success: boolean
  results: { heroId: number; rarity: string; isNew: boolean; isFeatured: boolean }[]
  diamondCost: number
  newPityState: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
  gachaPoolRemaining: number
}

/* ════════════════════════════════════
   Pool 狀態追蹤
   ════════════════════════════════════ */

let _poolRemaining = 200

/** 設定池剩餘數量（從 load-save 或 gacha-pull 回傳值更新） */
export function setPoolRemaining(count: number): void {
  _poolRemaining = count
}

/** 取得池剩餘數量 */
export function getPoolRemaining(): number {
  return _poolRemaining
}

/* ════════════════════════════════════
   預載快取（消除 API 等待時間）
   ════════════════════════════════════ */

/** 預載快取：bannerId+count → result promise */
const _cache = new Map<string, {
  promise: Promise<GachaPreloadResult>
  count: 1 | 10
}>()

function cacheKey(bannerId: string, count: 1 | 10): string {
  return `${bannerId}:${count}`
}

/* ════════════════════════════════════
   API
   ════════════════════════════════════ */

/**
 * 開始預載（背景呼叫 API，不阻塞 UI）
 * @param bannerId 卡池 ID
 * @param count 預載抽數（1 或 10）
 * @param currentDiamond 目前鑽石，不足就不預載
 */
export function startGachaPreload(
  bannerId: string,
  count: 1 | 10,
  currentDiamond: number,
): void {
  const cost = count === 10 ? 1440 : 160
  if (currentDiamond < cost) return // 鑽石不足，不預載
  if (_poolRemaining < count) return // 池不夠，不預載

  const key = cacheKey(bannerId, count)
  if (_cache.has(key)) return // 已有預載中

  const promise = gachaPull(bannerId, count).then(res => {
    // 同步更新池剩餘數量
    if (res.gachaPoolRemaining !== undefined) {
      _poolRemaining = res.gachaPoolRemaining
    }
    return res
  }).catch(err => {
    // 預載失敗，清除快取讓正常流程接手
    _cache.delete(key)
    throw err
  })
  _cache.set(key, { promise, count })
}

/**
 * 嘗試取用預載結果。若有快取且 count 相符，回傳 promise；否則回傳 null。
 */
export function consumePreloadedGacha(
  bannerId: string,
  count: 1 | 10,
): Promise<GachaPreloadResult> | null {
  const key = cacheKey(bannerId, count)
  const cached = _cache.get(key)
  if (!cached) return null
  _cache.delete(key)
  return cached.promise
}

/**
 * 清除所有預載（離開召喚畫面時呼叫）。
 * 注意：已發出的 API 請求無法取消，但結果會被丟棄。
 * 因為 API 會實際扣鑽石，所以如果預載已發出但尚未使用，
 * 鑽石已被扣除 —— 這是可接受的（英雄/碎片已歸入帳號）。
 *
 * 更安全的做法：只在使用者有足夠鑽石時才預載，
 * 並且離開時不清除（讓下次進入直接用）。
 */
export function clearGachaPreload(): void {
  _cache.clear()
}

/**
 * 計算建議預載次數。
 * 目前策略：有鑽石就預載一組 10 連抽（最常用），
 * 若不足 10 連但夠單抽，則預載單抽。
 * 同時檢查池剩餘是否足夠。
 */
export function getRecommendedPreload(diamond: number): 1 | 10 | null {
  if (diamond >= 1440 && _poolRemaining >= 10) return 10
  if (diamond >= 160 && _poolRemaining >= 1) return 1
  return null
}

