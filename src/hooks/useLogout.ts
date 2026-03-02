/**
 * useLogout — 完整登出 hook
 *
 * 職責：
 *   1. 呼叫 authService.logout()（清除登入狀態）
 *   2. 清除所有服務層快取（9 個 clear 函式）
 *   3. 呼叫 onResetState() 讓呼叫端重設 React state
 *
 * 設計：服務層快取清除寫死在此；React state 重設由外部透過 onResetState 傳入，
 * 避免 hook 直接依賴 App 層級的 state setter。
 */

import { useCallback } from 'react'
import { logout } from '../services/authService'
import { clearLocalSaveCache } from '../services/saveService'
import { clearGameDataCache } from '../services'
import { clearCache as clearSheetCache } from '../services/sheetApi'
import { invalidateMailCache } from '../services/mailService'
import { clearInventoryCache } from '../services/inventoryService'
import { clearArenaCache } from '../services/arenaService'

/**
 * @param onResetState 登出後的 React state / hook 重設回呼（由 App 提供）
 * @returns handleFullLogout 完整登出函式（供 SettingsPanel 使用）
 */
export function useLogout(onResetState: () => void) {
  const handleFullLogout = useCallback(() => {
    // 1. Auth
    logout()

    // 2. 服務層快取全清
    clearLocalSaveCache()
    clearGameDataCache()
    clearSheetCache()
    invalidateMailCache()
    clearInventoryCache()
    clearArenaCache()

    // 3. React state / hook 重設（委託給呼叫端）
    onResetState()
  }, [onResetState])

  return handleFullLogout
}
