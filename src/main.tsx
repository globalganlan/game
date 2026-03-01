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

// ── Service Worker 註冊 + 自動更新偵測（PWA） ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/game/sw.js')
      .then((reg) => {
        console.log('[SW] registered, scope:', reg.scope)

        // 定期檢查更新（每 60 秒）
        setInterval(() => reg.update(), 60_000)

        // 偵測新版本 waiting
        const promptUpdate = (sw: ServiceWorker) => {
          // 建立更新提示 UI
          const bar = document.createElement('div')
          bar.setAttribute('style', [
            'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:99999',
            'background:#ff6600', 'color:#fff', 'text-align:center',
            'padding:12px 16px', 'font-size:15px', 'font-family:sans-serif',
            'cursor:pointer', 'box-shadow:0 -2px 8px rgba(0,0,0,0.3)',
          ].join(';'))
          bar.textContent = '🔄 有新版本可用，點擊此處更新'
          bar.onclick = () => {
            sw.postMessage('SKIP_WAITING')
            bar.textContent = '更新中...'
            // 等 SW 接管後直接 reload（不依賴 controllerchange 事件）
            setTimeout(() => window.location.reload(), 600)
          }
          document.body.appendChild(bar)
        }

        // 如果已有 waiting 的 SW
        if (reg.waiting) {
          promptUpdate(reg.waiting)
        }

        // 監聽後續安裝的新 SW
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

  // 不再監聽 controllerchange 自動 reload。
  // iOS standalone（PWA 從主畫面開啟）的 SW 生命週期會在冷啟動時
  // 重複觸發 controllerchange，造成 reload 無限迴圈 → 白屏「重複發生問題」。
  // 改為：使用者點擊更新 banner 時直接 reload（見上方 bar.onclick）。
}
