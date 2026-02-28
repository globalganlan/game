/**
 * errorMessages — API 錯誤 key → 繁體中文對照表
 *
 * 集中管理所有 GAS API 與前端 authService 回傳的錯誤 key，
 * 確保 UI 永遠向使用者顯示友善的中文訊息。
 */

const ERROR_MAP: Record<string, string> = {
  // ── Auth 相關 ──
  missing_guestToken:       '缺少身份驗證資訊，請重新登入',
  'missing guestToken':     '缺少身份驗證資訊，請重新登入',
  token_not_found:          '帳號不存在或已過期，請重新登入',
  invalid_token:            '登入狀態異常，請重新登入',
  not_logged_in:            '尚未登入',
  missing_email:            '請輸入電子郵件',
  'missing email':          '請輸入電子郵件',
  missing_password:         '請輸入密碼',
  'missing password':       '請輸入密碼',
  'password must be >= 6 chars': '密碼至少 6 個字元',
  email_taken:              '此 Email 已被使用',
  email_not_found:          '找不到此 Email 帳號',
  wrong_password:           '密碼錯誤',
  'name must be 1-20 chars': '暱稱長度需 1-20 個字元',
  missing_oldPassword:      '請輸入目前密碼',
  'missing oldPassword':    '請輸入目前密碼',
  'new password must be >= 6 chars': '新密碼至少 6 個字元',
  account_not_bound:        '帳號尚未綁定 Email',

  // ── 存檔相關 ──
  save_not_found:           '找不到存檔資料',
  missing_changes:          '缺少變更內容',
  'missing changes':        '缺少變更內容',
  missing_formation:        '缺少隊伍編成',
  'missing formation':      '缺少隊伍編成',
  missing_heroId:           '缺少英雄 ID',
  'missing heroId':         '缺少英雄 ID',

  // ── 掛機收益 ──
  timer_not_started:        '掛機計時器尚未啟動',

  // ── 信箱 ──
  has_unclaimed_rewards:    '請先領取獎勵再刪除',
  missing_items:            '缺少物品資料',
  'missing items':          '缺少物品資料',

  // ── 抽卡 ──
  pool_empty:               '卡池已空，請稍後再試',
  not_enough_diamond:       '鑽石不足',
}

/**
 * 將 API 錯誤 key 翻譯為中文訊息。
 * 若找不到對應翻譯，回傳 fallback（預設「操作失敗，請稍後再試」）。
 */
export function translateError(key: string | undefined | null, fallback?: string): string {
  if (!key) return fallback ?? '操作失敗，請稍後再試'

  // 精確匹配
  if (ERROR_MAP[key]) return ERROR_MAP[key]

  // 模糊匹配：Unknown action
  if (key.startsWith('Unknown action')) return '伺服器不支援此操作'

  // 已經是中文 → 直接回傳（避免二次翻譯）
  if (/[\u4e00-\u9fff]/.test(key)) return key

  return fallback ?? '操作失敗，請稍後再試'
}
