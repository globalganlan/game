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
