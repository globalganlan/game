# Copilot 專案指引 — GlobalGanLan

> 本檔案在每次新對話時自動載入，確保 AI 助手保有專案知識。
> 詳細知識點請參閱 `.ai/docs/Three.js場景與模型整合筆記.md`。

## ❗ 強制規則（每次任務必讀）

0. **一律使用繁體中文回覆**，不得用英文回覆使用者。程式碼變數名/commit message 可保留英文，但解說說明一律繁中。
1. **使用者只提需求，AI 團隊負責全部實現**（前端/後端/部署/測試）。絕對不要要求使用者手動操作。
2. **完成功能後必須執行完整測試**，確認遊戲可正常運行再回報完成：
   - `npx tsc --noEmit`（零錯誤）
   - `npx vite build`（編譯成功）
   - `cd workers && npx tsc --noEmit`（Workers 零錯誤）
   - 確認遊戲流程不會壞：登入 → 載入 → 選英雄 → 戰鬥 → 結果 → 重啟
   - **⚠️ 必須使用 Playwright MCP 進行瀏覽器自動化測試**：啟動 `npx vite --host`，透過 Playwright MCP 工具打開遊戲頁面，自動走一遍完整流程（登入→大廳→點擊相關功能→確認無白屏/報錯），不能只靠 tsc 和 vite build 就宣稱測試通過。Playwright MCP 已配置於 `.vscode/mcp.json`。
   - 有 bug 就修，不能把壞掉的狀態交給使用者
   - **測試通過後、回報完成前，必須播放提示音**：`[console]::beep(800,300); Start-Sleep -ms 100; [console]::beep(1000,300); Start-Sleep -ms 100; [console]::beep(1200,400)`
   - **需要使用者參與才能繼續時，也必須播放提示音**（例如：詢問需求細節、等待確認選項、需要使用者手動測試回報結果等）
3. **Workers 修改後自行部署**：改 `workers/src/` → `cd workers && npx wrangler deploy`
4. **程式碼改動必須同步更新 Spec**：每次完成使用者任務後，若有改動程式碼，必須將功能變更同步到對應的 `.ai/specs/` 文件上（含版本號遞增、變更歷史更新），以確保 spec 始終與實際程式碼一致。不可遺漏任何功能變更未被記錄。
5. **貨幣 & 物品 Icon 必須使用統一元件**（ADR-007）：
   - **四種貨幣**必須用 `<CurrencyIcon type="..." />`（來自 `src/components/CurrencyIcon.tsx`）：
     - 金幣 → `type="gold"`（金色圓形 G）
     - 鑽石 → `type="diamond"`（藍色菱形 D）
     - 經驗 → `type="exp"`（綠色方塊 E）
     - 星塵 → `type="stardust"`（黃色光暈圓形 S）
   - **其他道具**用 `<ItemIcon itemId="..." />`（自動判斷貨幣→CurrencyIcon、其餘→emoji）
   - **絕對禁止**在 UI 中硬寫 💎🪙💰✨ 等 emoji 代替貨幣 icon
   - CSS 定義在 `src/App.css` 第 357~436 行

## 專案概覽

- **名稱**：全球感染 (GlobalGanLan) — 3D 喪屍對戰競技場
- **技術棧**：React 19 + Vite 5 + @react-three/fiber + @react-three/drei + Three.js + TypeScript
- **後端**：Cloudflare Workers + Hono + D1 SQLite（`workers/` 目錄）
- **主程式**：`src/App.tsx`（遊戲邏輯）+ `src/components/`（3D 元件拆分）
- **樣式**：`src/App.css`（HUD、按鈕、RWD media queries）
- **模型**：`public/models/zombie_1/` ~ `zombie_6/`（FBX 原始 + GLB 壓縮）

## 架構重點

1. **模型格式**：GLB（Draco 壓縮 + JPEG 貼圖），由 FBX 透過 Blender 批次轉換而來
   - `zombie_X.glb` — Mesh + 骨架（Draco 壓縮）
   - `zombie_X_{idle|attack|hurt|dying}.glb` — 只含動畫（無幾何體，~100 KB）
   - 前端使用 `GLTFLoader` + `DRACOLoader`（本地 WASM 解碼器在 `public/draco/`）
   - 載入器：`src/loaders/glbLoader.ts`（全域快取 + Suspense 整合）
2. **克隆**：`SkeletonUtils.clone()`（不可用 `.clone()`，SkinnedMesh 必用前者）
2. **動畫**：切換用 `crossFadeTo()`，不可用 `stop()→play()`（會 bind-pose 閃現）
3. **場景要素**（五者連動，改一個必全調）：
   - Ground: `PlaneGeometry(60, 60, 64, 64)`
   - Debris: 80 個, spread 35, 12 面牆
   - Rain: 1200 條 `LineSegments`, area 30
   - Sparkles: 80 個, scale 20
   - Fog: `['#1a0e06', 8, 35]`
4. **RWD**：`useResponsive()` hook 偵測 mobile/tablet/desktop + 直式/橫式，動態調整 FOV、鏡頭位置、DPR
5. **過場幕**：`TransitionOverlay` — 初載 + 重啟時遮蔽不合理畫面
6. **CSS**：**`import './App.css'` 絕對不可省略**，否則全部 HUD/按鈕樣式消失

## 關鍵陷阱（每次修改前請回顧）

- `idle.clone()` ≠ `SkeletonUtils.clone(idle)`（SkinnedMesh 必用後者）
- GLB Armature 保留 Blender Z-up 座標系 — `Box3` 站立高度在 **Z 軸** 而非 Y 軸
- GLB 匯入需 `global_scale=100.0` 抵消 FBX 的 cm→m 0.01 縮放
- Draco WASM 解碼器必須本地（`public/draco/`），不可用 CDN
- `PointsMaterial` 只渲染方塊，雨用 `LineSegments` + `LineBasicMaterial`
- PlaneGeometry X/Y → 世界 X/Z，Z → 世界 Y（高度）
- Debris Y 要 `scale.y * 0.5`，否則漂浮
- resetGame 必須先拉過場幕 → 等不透明 → 重置狀態 → 收幕
- **修改場景大小時，ground / debris / rain / sparkles / fog 五者必須連動**
- fog 遠端 ≤ 地面半徑，否則露出邊緣
- `import './App.css'` 漏掉 → 整個 UI 消失
- async 函數中用 `useRef` 讀即時值，避免閉包陷阱
- `orientationchange` 事件需 `setTimeout(150ms)` 才能拿到正確尺寸
- **⚠️ PWA Service Worker — iOS 全面禁用 + Standalone 禁用（ADR-009）** — 修過四次，絕對不可再改壞：
  - `index.html` head preflight：iOS 或 standalone 先 unregister SW + 清除 caches，防止舊 SW 抢先接管
  - `src/main.tsx` 偵測 iOS（`/iPhone|iPad|iPod/`）→ **無條件** unregister 所有 SW + 清除快取
  - `src/main.tsx` 偵測 `display-mode: standalone` → 同上，完全禁用 SW
  - **僅非 iOS + 非 Standalone 的 browser 模式**才註冊 `/game/sw.js`
  - 禁止監聽 `controllerchange` 自動 reload
  - `public/sw.js` install 可呼叫 `skipWaiting()`，但禁止 `clients.claim()` / 預快取 HTML
  - iOS Chrome「加入主畫面」不會觸發 `display-mode: standalone`，故必須靠 UA 偵測
  - 詳見 `.ai/memory/decisions.md` ADR-009

## 後端架構（Cloudflare Workers + D1）

- **Workers 入口**：`workers/src/index.ts`（Hono 路由 + CORS + Cron Triggers）
- **路由模組**：`workers/src/routes/`（10 個：auth / save / battle / inventory / progression / gacha / mail / arena / sheet / checkin）
- **D1 Schema**：`workers/schema.sql`（12 張表）
- **部署**：`cd workers && npx wrangler deploy`
- **前端 API 客戶端**：`src/services/apiClient.ts`（`callApi` + `callAuthApi`）
- **即時通知**：Pusher Channels（app_id 2122152, cluster ap3）
- **CI/CD**：`.github/workflows/deploy.yml`（雙 job：前端 GitHub Pages + 後端 Workers）

### 重要原則

- **使用者只負責提需求，AI 團隊負責全部實現（前端、後端、Workers、部署、測試）**
- 需要新增 API → 直接改 `workers/src/routes/` + `wrangler deploy`
- 需要改 D1 表結構 → 修改 `workers/schema.sql` + 遠端執行 `ALTER TABLE`
- **絕對不要要求使用者手動貼程式碼、手動部署、或手動操作**

## 效能原則

- 只渲染鏡頭可視範圍（fog 外的幾何體是浪費）
- 修改場景時先決定 fog far → 其他元素 spread/area ≤ fog far
- mobile DPR 限 `[1, 1.5]`，desktop `[1, 2]`

## AI 團隊調度

- **調度中心**：`.ai/agents/README.md` — 自動分析需求、分配角色、各司其職
- **規格系統**：`.ai/specs/README.md` — 模組化遊戲規格，可擴展、有版本、有衝突偵測
- **記憶系統**：`.ai/memory/` — 跨對話持久化（changelog / decisions / dev-status / backlog）
- **提示詞模板**：`.ai/agents/prompt-playbook.md` — 7 套常用提示詞（P-01~P-07），已標注對應角色
- 收到需求時先讀取 `.ai/agents/README.md` 的調度規則，自動判斷要啟動哪些角色
- 新對話啟動時先讀取 `.ai/memory/dev-status.md` + `.ai/specs/README.md` 恢復記憶
- 各角色的專業提示詞：`.ai/agents/01~11-*.md`（11 位角色）

## 文件索引

| 文件 | 內容 |
|------|------|
| `.ai/agents/README.md` | AI 團隊自動調度系統（11 位角色的路由與協作規則） |
| `.ai/specs/README.md` | 遊戲規格總索引（模組化 spec 清單、格式規範、衝突處理流程） |
| `.ai/memory/README.md` | 記憶持久化機制說明 |
| `.ai/docs/FBX轉GLB壓縮指南.md` | FBX→GLB 批次轉換流程、Draco/Decimate/JPEG 壓縮、前端載入架構 |
| `.ai/docs/大頭照生成指南.md` | Puppeteer + Three.js 離線渲染角色大頭照 |
| `.ai/docs/2D-to-3D-Model-Generation-Guide.md` | TripoSR 模型生成流程 |
| `.ai/docs/Mixamo使用指南.md` | Mixamo 動畫下載與整合 |

## 工具腳本索引

| 腳本 | 用途 | 使用方式 |
|------|------|----------|
| `.ai/scripts/fbx_to_glb.py` | FBX→GLB 批次轉換（Blender Python） | `blender --background --python .ai/scripts/fbx_to_glb.py` |
| `.ai/scripts/convert_models.ps1` | 上述腳本的 PowerShell 包裝器 | `.\.ai\scripts\convert_models.ps1` |
| `.ai/scripts/generate_thumbnails.js` | 角色大頭照生成（Puppeteer） | `node .ai/scripts/generate_thumbnails.js` |

