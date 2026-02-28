/**
 * PWA 服務 — 安裝偵測 + 平台辨識 + 獎勵領取
 *
 * 提供 beforeinstallprompt 事件管理、standalone 模式偵測、
 * 平台特定安裝指引及 PWA 安裝獎勵 API。
 */

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

/* ════════════════════════════════════
   平台偵測
   ════════════════════════════════════ */

export type PwaPlatform = 'android' | 'ios' | 'desktop' | 'unknown'

export function detectPlatform(): PwaPlatform {
  const ua = navigator.userAgent.toLowerCase()
  if (/android/.test(ua)) return 'android'
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/windows|macintosh|linux/.test(ua) && !/android/.test(ua)) return 'desktop'
  return 'unknown'
}

/* ════════════════════════════════════
   Standalone 模式偵測
   ════════════════════════════════════ */

/** 是否已以 PWA（standalone）模式運行 */
export function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari standalone
  if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true
  return false
}

/* ════════════════════════════════════
   beforeinstallprompt 事件管理
   ════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any = null

type PromptListener = (available: boolean) => void
type InstallListener = () => void
const promptListeners: PromptListener[] = []
const installListeners: InstallListener[] = []

/** 取得 deferred install prompt（若有） */
export function getDeferredPrompt() { return deferredPrompt }

/** 清除 deferred prompt */
export function clearDeferredPrompt() { deferredPrompt = null }

/** 是否有 install prompt 可用 */
export function hasInstallPrompt(): boolean { return deferredPrompt !== null }

// 自動監聽事件
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    for (const fn of promptListeners) fn(true)
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    for (const fn of installListeners) fn()
  })
}

/** 訂閱 install prompt 可用事件 */
export function onInstallPromptAvailable(fn: PromptListener): () => void {
  promptListeners.push(fn)
  if (deferredPrompt) fn(true)
  return () => {
    const i = promptListeners.indexOf(fn)
    if (i >= 0) promptListeners.splice(i, 1)
  }
}

/** 訂閱 app 已安裝事件 */
export function onAppInstalled(fn: InstallListener): () => void {
  installListeners.push(fn)
  return () => {
    const i = installListeners.indexOf(fn)
    if (i >= 0) installListeners.splice(i, 1)
  }
}

/** 觸發原生安裝提示（Android / Desktop Chrome） */
export async function triggerInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  try {
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    deferredPrompt = null
    return result.outcome === 'accepted'
  } catch {
    return false
  }
}

/* ════════════════════════════════════
   PWA 安裝獎勵 API
   ════════════════════════════════════ */

/** 領取 PWA 安裝獎勵（每帳號僅一次） */
export async function claimPwaReward(
  guestToken: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const res = await fetch(POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify({ action: 'claim-pwa-reward', guestToken }),
    })
    return res.json()
  } catch {
    return { success: false, error: 'network_error' }
  }
}

/* ════════════════════════════════════
   平台安裝指引
   ════════════════════════════════════ */

/** 取得平台特定的安裝步驟說明 */
export function getInstallInstructions(platform: PwaPlatform): string[] {
  switch (platform) {
    case 'ios':
      return [
        '① 點擊 Safari 底部的「分享」按鈕 ⬆️',
        '② 向下滑動，找到「加入主畫面」',
        '③ 點擊「新增」確認',
      ]
    case 'android':
      return [
        '① 點擊瀏覽器右上角「⋮」選單',
        '② 選擇「加入主畫面」或「安裝應用程式」',
        '③ 點擊「安裝」確認',
      ]
    case 'desktop':
      return [
        '① 點擊網址列右側的「安裝」圖示 ⬇️',
        '② 或點擊瀏覽器選單 →「安裝全球感染...」',
        '③ 確認安裝即完成',
      ]
    default:
      return ['在瀏覽器選單中尋找「加入主畫面」或「安裝」選項']
  }
}

/** 取得 PWA 的好處清單 */
export function getPwaBenefits(): string[] {
  return [
    '⚡ 更快的載入速度（資源離線快取）',
    '📱 從主畫面一鍵啟動，如同原生 App',
    '🔒 更穩定的遊戲體驗（不受瀏覽器分頁限制）',
    '🎁 首次安裝可獲得 💎100 + 🪙3,000 獎勵！',
  ]
}
