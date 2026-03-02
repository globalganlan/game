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
  // 偵測 standalone 模式（從主畫面開啟）
  const _isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true

  if (_isStandalone) {
    // ★ Standalone 模式：完全不使用 SW
    // 遊戲需要網路（auth/save/battle），SW 的離線快取無實質幫助，
    // 但 SW 的生命週期在 iOS/Android standalone webview 中會造成
    // controllerchange → 重載、預快取 HTML 版本不一致等問題。
    // 直接 unregister 所有 SW，確保乾淨環境。
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        reg.unregister().then(() => console.log('[SW] unregistered for standalone mode'))
      }
    })
    // 清除所有 SW 快取
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) caches.delete(name)
      })
    }
    console.log('[SW] standalone mode — SW disabled')
  } else {
    // ★ Browser 模式：正常註冊 SW（快取加速 + 更新提示）
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
