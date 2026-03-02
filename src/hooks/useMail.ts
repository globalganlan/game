/**
 * useMail — 信箱狀態管理 + Pusher 即時通知
 *
 * 從 App.tsx 抽出：mailItems / mailLoaded / mailUnclaimedCount / refreshMailData
 * Pusher `new-mail` 事件觸發時自動刷新信箱
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { MailItem } from '../services/mailService'
import { invalidateMailCache, loadMail } from '../services/mailService'
import { connectPusher, disconnectPusher, onNewMail } from '../services/pusherService'

export function useMail(playerId: string | null) {
  const [mailItems, setMailItems] = useState<MailItem[]>([])
  const [mailLoaded, setMailLoaded] = useState(false)
  /** 有新信件進來時閃爍提示（前端可用來做動畫） */
  const [hasNewMail, setHasNewMail] = useState(false)

  const mailUnclaimedCount = useMemo(
    () => mailItems.filter(m => m.rewards.length > 0 && !m.claimed).length,
    [mailItems],
  )

  /** 刷新信箱資料（從 API 重新載入） */
  const refreshMailData = useCallback(async () => {
    try {
      invalidateMailCache()
      const { mails } = await loadMail()
      setMailItems(mails)
      setMailLoaded(true)
    } catch { /* silent */ }
  }, [])

  /** 重置信箱狀態（登出時使用） */
  const resetMail = useCallback(() => {
    setMailItems([])
    setMailLoaded(false)
    setHasNewMail(false)
    disconnectPusher()
  }, [])

  /** 清除新信件提示 */
  const clearNewMailFlag = useCallback(() => setHasNewMail(false), [])

  // ── Pusher 連線管理 ──
  const playerIdRef = useRef(playerId)
  playerIdRef.current = playerId

  useEffect(() => {
    if (!playerId) {
      disconnectPusher()
      return
    }

    // 登入後連線 Pusher
    connectPusher(playerId)

    // 訂閱 new-mail 事件 → 自動刷新信箱
    const unsub = onNewMail(() => {
      setHasNewMail(true)
      // 延遲 500ms 再刷新，確保後端已完成寫入
      setTimeout(async () => {
        try {
          invalidateMailCache()
          const { mails } = await loadMail()
          setMailItems(mails)
          setMailLoaded(true)
        } catch { /* silent */ }
      }, 500)
    })

    return () => {
      unsub()
    }
  }, [playerId])

  return {
    mailItems, setMailItems,
    mailLoaded, setMailLoaded,
    mailUnclaimedCount,
    refreshMailData,
    resetMail,
    hasNewMail,
    clearNewMailFlag,
  }
}
