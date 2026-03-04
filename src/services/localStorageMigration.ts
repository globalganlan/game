/**
 * localStorageMigration — 舊版 localStorage 遊戲資料清除
 *
 * v2.0 — 後端已遷移至 Cloudflare Workers + D1，遊戲資料不再存 localStorage。
 * 此模組僅負責清除舊版殘留的 localStorage key，確保不會與後端權威資料衝突。
 *
 * 保留的 key（純前端偏好/認證）：
 *   - globalganlan_guest_token（登入 token）
 *   - globalganlan_logged_out（登出旗標）
 *   - globalganlan_tutorial_step（教學進度）
 *   - battleSpeed（戰鬥速度偏好）
 *   - gg_audio_settings（音效設定）
 */

/** @deprecated 僅為向後相容保留匯出，無實際意義 */
export const CURRENT_SCHEMA_VERSION = 2

/** 所有應清除的舊版 localStorage key */
const LEGACY_KEYS = [
  'globalganlan_save_cache',
  'globalganlan_inventory_cache',
  'globalganlan_pending_ops',
  'globalganlan_gacha_pool',
  'globalganlan_gacha_pity',
  'globalganlan_owned_heroes',
  'globalganlan_pending_pulls',
  'globalganlan_schema_version',
  'gg_equipment_cache',
  'gg_checkin_date',
]

/**
 * 清除所有舊版 localStorage 遊戲資料。
 * 在 React 渲染前同步執行，僅跑一次（清完即止）。
 */
export function runMigrations(): void {
  try {
    let cleaned = 0
    for (const key of LEGACY_KEYS) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log(`[migration] 已清除 ${cleaned} 個舊版 localStorage key（後端權威模式）`)
    }
  } catch {
    // localStorage 不可用 → 忽略
  }
}
