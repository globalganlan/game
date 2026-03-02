/**
 * 入口點 — 全球感染 (GlobalGanLan)
 *
 * suppressWarnings 必須是第一個 import，
 * 確保 console.warn patch 在所有 three.js 模組載入前生效。
 */

// 最先 import — patch console.warn（ES module import 會依序執行）
import './suppressWarnings'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { runMigrations } from './services/localStorageMigration'
import './index.css'
import App from './App'

// localStorage schema 遷移 — 必須在 React 渲染前同步執行
runMigrations()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Service Worker 管理（PWA） ──
if ('serviceWorker' in navigator) {
  // ★ iOS 偵測（所有 iOS 瀏覽器都用 WKWebView，SW 生命週期有已知問題）
  const _isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)

  // 偵測 standalone 模式（從主畫面開啟）
  const _isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true

  // ★ iOS 或 Standalone → 完全不使用 SW
  // 理由：
  //   1. iOS Safari standalone：SW 生命週期在 WKWebView 中會造成 reload 迴圈
  //   2. iOS Chrome「加入主畫面」：display-mode 不是 standalone，但 Chrome iOS 的
  //      WKWebView 對 SW skipWaiting/controllerchange 處理有 bug，導致連續 crash
  //   3. 遊戲需要網路（auth/save/battle），SW 離線快取無實質幫助
  //   4. iOS 原生已有 HTTP 快取，額外 SW 快取效益低、風險高
  if (_isStandalone || _isIOS) {
    // 移除所有已註冊的 SW
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        reg.unregister().then(() => console.log('[SW] unregistered:', reg.scope))
      }
    })
    // 清除所有 SW 快取
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) caches.delete(name)
      })
    }
    console.log(`[SW] disabled — iOS=${_isIOS}, standalone=${_isStandalone}`)
  } else {
    // ★ 非 iOS Browser 模式：正常註冊 SW（快取加速 + 更新提示）
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/game/sw.js')
        .then((reg) => {
          console.log('[SW] registered, scope:', reg.scope)

          // 每 5 分鐘檢查更新
          setInterval(() => reg.update(), 5 * 60_000)

          // 偵測新版本 waiting
          const promptUpdate = (sw: ServiceWorker) => {
            if (document.getElementById('sw-update-bar')) return
            const bar = document.createElement('div')
            bar.id = 'sw-update-bar'
            bar.setAttribute('style', [
              'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:99999',
              'background:#ff6600', 'color:#fff', 'text-align:center',
              'padding:12px 16px', 'font-size:15px', 'font-family:sans-serif',
              'cursor:pointer', 'box-shadow:0 -2px 8px rgba(0,0,0,0.3)',
            ].join(';'))
            bar.textContent = '🔄 有新版本可用，點擊此處更新'
            bar.onclick = () => {
              const lastReload = Number(sessionStorage.getItem('_sw_reload_ts') || 0)
              if (Date.now() - lastReload < 3000) {
                bar.textContent = '更新準備中，請稍候...'
                return
              }
              sessionStorage.setItem('_sw_reload_ts', String(Date.now()))
              sw.postMessage('SKIP_WAITING')
              bar.textContent = '更新中...'
              setTimeout(() => window.location.reload(), 800)
            }
            document.body.appendChild(bar)
          }

          if (reg.waiting) promptUpdate(reg.waiting)

          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing
            if (!newSW) return
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                promptUpdate(newSW)
              }
            })
          })
        })
        .catch((err) => console.warn('[SW] registration failed:', err))
    })
    // 不監聽 controllerchange — 避免 reload 迴圈
  }
}
