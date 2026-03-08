# 架構決策紀錄 — Architecture Decision Records

> 按編號排列。每個重要的技術/設計決策都記錄在這裡。

---

### ADR-000: AI 團隊全自主執行原則

- **狀態**：✅ 永久生效
- **日期**：2026-02-26（2026-03-03 更新：GAS → Workers）
- **決定**：
  - **AI 團隊必須自行完成所有實作，不可要求使用者手動操作**
  - **完成功能後必須執行完整測試，確認遊戲可正常運行再回報完成**：
    - `npx tsc --noEmit`（零 TS 錯誤）
    - `npx vite build`（編譯成功）
    - `cd workers && npx tsc --noEmit`（Workers 零錯誤）
    - 確認遊戲流程：登入 → 載入 → 選英雄 → 戰鬥 → 結果 → 重啟
    - 有 bug 就修，不能把壞掉的狀態交給使用者
  - **任務完成時必須播放提示音通知使用者**：
    - 指令：`[console]::beep(800,300); Start-Sleep -ms 100; [console]::beep(1000,300); Start-Sleep -ms 100; [console]::beep(1200,400)`
    - 時機：每次任務全部完成、測試通過、回報結果之前
    - **絕對不可忘記，這是使用者明確要求的**
  - Workers 後端修改 → 直接改 `workers/src/` → `cd workers && npx wrangler deploy`
  - D1 資料庫操作 → Workers 路由（CRUD）或 `wrangler d1 execute` 直接操作
  - 前端 / 後端 / 部署 / 測試全部自動化
  - 使用者只負責提需求，AI 團隊負責全部實現
- **技術細節**：
  - Workers 入口：`workers/src/index.ts`（Hono 路由 + CORS + Cron Triggers）
  - API 基底：`https://globalganlan-api.s971153.workers.dev/api/`
  - D1 資料庫：15+ 張表（schema 見 `workers/schema.sql`）
  - 部署指令：`cd workers && npx wrangler deploy`
  - ~~GAS / clasp 已廢棄，`gas/` 目錄僅供歷史參考~~

---

### ADR-001: 採用規格驅動開發（Spec-Driven Development）

- **狀態**：✅ 已定案
- **日期**：2026-02-26
- **背景**：製作人（使用者）希望能隨時丟入新點子，系統要能自動偵測與既有規格的衝突並給出解決方案。需要一個結構化的方式管理遊戲設計。
- **選項**：
  - A) 隨寫隨做，靠程式碼就是文件
  - B) 先寫完整 GDD（Game Design Document）再開發
  - C) 模組化 Spec（每個系統獨立一個檔案，有版本、有依賴、有擴展點）
- **決定**：選 C — 模組化 Spec
- **理由**：
  - 可漸進式設計，不需要一次寫完
  - 每個 spec 獨立，改一個不怕牽連全部
  - 明確的依賴關係讓衝突偵測可自動化
  - 擴展點預留了未來新功能的接入口
- **影響**：建立 `.ai/specs/` 目錄結構、所有 Agent 的工作流程改為「先查 spec → 再行動」

---

### ADR-002: ~~Google Sheets 中文亂碼防護~~ （已廢棄）

- **狀態**：🗄️ 已廢棄（2026-03-03）
- **日期**：2026-02-27
- **廢棄原因**：後端已完全從 GAS + Google Sheets 遷移至 Cloudflare Workers + D1 SQLite。D1 原生支援 UTF-8，不存在 Big5 亂碼和日期自動轉換問題。此 ADR 僅供歷史參考。

---

### ADR-003: 任務完成提示音

- **狀態**：✅ 永久生效
- **日期**：2026-02-28
- **決定**：
  - **每次完成使用者交代的任務（含 build 驗證通過後），必須播放提示音**
  - 指令：`[Console]::Beep(800, 200); [Console]::Beep(1000, 200); [Console]::Beep(1200, 300)`
  - 此規則跨對話持久生效，新對話啟動時讀取 .ai/memory/ 即可恢復
- **理由**：使用者希望不必盯著螢幕，靠聲音知道 AI 已完成工作

---

### ADR-004: AI 回覆一律使用繁體中文

- **狀態**：✅ 永久生效
- **日期**：2026-02-28
- **決定**：
  - **所有對話回覆必須使用繁體中文**，不得用英文回覆
  - 程式碼中的變數名、註解仍保持原專案慣例（可混用中英文）
  - commit message、技術術語等可保留英文，但解說說明一律繁中
  - 此規則跨對話持久生效
- **理由**：使用者母語為繁體中文，英文回覆增加溝通成本

---

### ADR-006: 戰鬥引擎前後端同步修改原則

- **狀態**：✅ 永久生效（2026-03-03 更新：GAS → Workers）
- **日期**：2026-03-01
- **決定**：
  - **任何涉及戰鬥邏輯的修改，必須同時修改前端（`src/domain/battleEngine.ts`）和 Workers 後端（`workers/src/routes/battle.ts`）**
  - 實際戰鬥計算由 Workers 後端執行，前端僅負責 3D 動畫回放（Phase B）
  - 前端 `battleEngine.ts` 僅在後端呼叫失敗時作為 fallback（降級本地計算）
  - 改前端引擎卻漏改 Workers → 線上行為不變，只有降級時才生效 = 等同沒改
  - 修改後必須 `cd workers && npx wrangler deploy` 部署 Workers
- **適用範圍**：能量系統、傷害計算、目標選擇、被動觸發、大招中斷、回合流程等所有戰鬥邏輯
- **理由**：戰鬥計算已移到後端（Workers），前端只是動畫播放器。曾因只改前端未改後端導致「能量滿未立即施放大招」的 bug

---

### ADR-007: 貨幣 & 物品 Icon 統一使用 CurrencyIcon / ItemIcon 元件

- **狀態**：✅ 永久生效
- **日期**：2026-03-01
- **決定**：
  - **四種貨幣資源必須使用 `<CurrencyIcon type="..." />` CSS Badge 元件**，禁止用 emoji（💎🪙💰✨）
  - **其他道具使用 `<ItemIcon itemId="..." />`**，會自動判斷：貨幣→CurrencyIcon、其他→emoji
  - **任何新增 UI 顯示貨幣/道具的地方，必須使用這兩個元件**
- **元件位置**：`src/components/CurrencyIcon.tsx`
- **貨幣 Icon 對照表**：

  | 資源 | type | CSS class | 外觀 |
  |------|------|-----------|------|
  | 金幣 | `gold` | `.icon-coin` | 金色圓形 + `G` |
  | 鑽石 | `diamond` | `.icon-dia` | 藍色菱形 + `D` |
  | 經驗 | `exp` | `.icon-exp` | 綠色方塊 + `E` |
  | 星塵 | `stardust` | `.icon-stardust` | 黃色光暈圓形 + `S` |

- **ItemIcon 自動映射**（`CURRENCY_TYPE_MAP`）：
  - `gold` / `currency_gold` → `<CurrencyIcon type="gold" />`
  - `diamond` / `currency_diamond` → `<CurrencyIcon type="diamond" />`
  - `stardust` / `currency_stardust` → `<CurrencyIcon type="stardust" />`
  - 其他 itemId → `getItemIcon(itemId)` emoji（見 `src/constants/rarity.ts`）

- **CSS 定義位置**：`src/App.css` 第 357~436 行
- **已統一使用的畫面**：HUD、主選單、商店、關卡選擇、勝利結算、抽卡、背包、信箱、設定（綁定獎勵/PWA 獎勵）
- **理由**：emoji 在不同平台渲染不一致（Android/iOS/Windows 顯示不同），CSS Badge 保證跨平台統一風格
- **歷史教訓**：2026-03-01 開發 PWA 安裝獎勵 & 帳號綁定獎勵時，SettingsPanel 中的獎勵預覽文字使用了 💎🪙 emoji 而非 CurrencyIcon 元件，事後才發現不一致並修正

---

### ADR-008: 改一處必須全域掃描同步

- **狀態**：✅ 永久生效
- **日期**：2026-03-02
- **決定**：
  - **任何程式碼修改，必須先搜尋整個專案中所有相同模式 / 相似邏輯的位置**，確認是否需要同步調整
  - 修改前：用 `grep_search` 搜尋相關關鍵字，列出所有命中位置
  - 修改時：一次性修正**所有**需要同步的位置，不可只改一處就交差
  - 修改後：再次搜尋確認沒有遺漏
- **理由**：
  - Phase B HURT→DEAD 改動時，`playHitOrDeath` 已改為直接 DEAD，但反彈致死（2 處）和 DEATH action（1 處）仍是 HURT→DEAD，如果只改一處會造成行為不一致
  - `needsHpSync = false` Bug 也是因為只考慮了回放模式的 HP 同步，忽略正常模式也需要
- **檢查清單**（每次修改前執行）：
  1. 確定修改的「模式」是什麼（如：致死播放流程、HP 同步、safe-area padding）
  2. `grep_search` 搜尋該模式在專案中的所有出現位置
  3. 逐一檢視每個命中點是否需要相同修改
  4. 統一修正，不遺漏
  5. 完成後再搜一次確認全部同步

---

### ADR-009: PWA — iOS 全面禁用 + Standalone 禁用 Service Worker

- **狀態**：✅ 已定案 — **修過四次，絕對不可再改壞**
- **日期**：2026-03-03（第四次修正）
- **背景**：PWA 加入主畫面後遊戲反覆 reload 直至白屏。前三次只處理 standalone 模式，但忽略了 **iOS Chrome「加入主畫面」不觸發 `display-mode: standalone`** 的情況。iOS Chrome 在非 standalone 狀態下註冊 SW，WKWebView 對 SW skipWaiting/controllerchange 生命週期有 bug，導致連續 crash。Safari 因走 standalone 分支故正常。
- **根因（第四次）**：iOS Chrome「加入主畫面」在 Chrome 內開啟（非 standalone webview），`display-mode: standalone` = false、`navigator.standalone` = false → 掉進 browser 分支 → 註冊 SW → Chrome iOS WKWebView SW bug → reload 迴圈 → 白屏「重複發生問題」。
- **最終方案（v8）**：
  1. **iOS 全面禁用 SW** — `main.tsx` 偵測 `/iPhone|iPad|iPod/` → 不論 Safari/Chrome/任何 browser，一律 unregister SW + 清除 caches
  2. **非 iOS Standalone 模式也禁用 SW** — `display-mode: standalone` 或 `navigator.standalone` 為 true 時同理
  3. **僅非 iOS + 非 Standalone 的 browser 模式才註冊 SW** — 提供快取加速 + 版本更新通知
  4. **SW install 呼叫 `skipWaiting()`** — 強制取代有 bug 的舊版 SW
  5. **index.html preflight** — 在載入主程式前即 unregister SW + 清除 caches，避免舊 SW 抢先接管
- **`public/sw.js` 規則**：
  - ✅ install 可呼叫 `self.skipWaiting()`
  - ❌ **禁止** activate 呼叫 `clients.claim()`
  - ❌ **禁止**預快取 HTML
  - ❌ 導航請求（`mode: 'navigate'`）→ 直接 `return`
  - ❌ 跨域請求 → 直接 `return`
- **`src/main.tsx` 規則**：
  - **iOS（所有瀏覽器）**：`getRegistrations()` → `unregister()` + `caches.keys()` → `delete()`
  - **非 iOS Standalone**：同上，完全禁用
  - **非 iOS Browser**：正常註冊 + 5 分鐘輪詢 + sessionStorage 3 秒 reload 冷卻 + 更新 bar 去重
  - ❌ **絕對禁止**監聽 `controllerchange` 事件
- **`index.html` 規則**：head 內 preflight script，iOS 或 standalone 一律 unregister SW + 刪除 caches，確保第一時間清乾淨
- **理由**：iOS 的所有瀏覽器底層都是 WKWebView，SW 生命週期在其中行為異常。遊戲需要網路（auth/save/battle），iOS 原生已有 HTTP 快取，額外 SW 快取效益低但風險極高。Android 正常、Desktop 正常，僅 iOS 有此問題。

---

### ADR-010: 測試一律使用 Chrome DevTools MCP

- **狀態**：✅ 永久生效
- **日期**：2026-03-04
- **決定**：
  - **所有功能測試、UI 測試、流程測試一律使用 Chrome DevTools MCP 工具在實際瀏覽器中操作**
  - 不能只靠 `tsc --noEmit` + `vite build` 就宣稱測試通過
  - 測試流程：啟動 `npx vite --host` → 用 MCP 開啟頁面 → 實際操作 UI（點擊、輸入、截圖驗證）
  - MCP 設定檔：`.vscode/mcp.json`（已 portable 化，不含硬編碼路徑）
  - 可用工具：`navigate_page` / `click` / `take_screenshot` / `take_snapshot` / `list_console_messages` / `evaluate_script` 等 30 個工具
- **QA 測試帳號**：
  - playerId: `PQA_001`
  - guestToken: `qa-test-token-001`
  - displayName: `QA測試官`
  - localStorage key: `globalganlan_guest_token` = `qa-test-token-001`
  - 資源：💎 ~996K / 💰 ~9.9M / stardust 99,999 / exp 999,999
  - 進度：chapter 9, stage 1（全 8 章通關）
  - 英雄：3 隻（heroId 6, 1, 9）Lv60 / 突破 5 / 星級 5
- **理由**：tsc 和 vite build 只能驗證靜態型別和打包，無法發現 API 通訊問題（如缺少 DB 欄位導致 500）、UI 排版問題（如大數字溢出）、或互動邏輯 bug。實際瀏覽器測試是唯一可靠的驗收方式。

---

### ADR-010: 套裝效果向上兼容（不限稀有度）

- **狀態**：✅ 已定案
- **日期**：2026-03-04
- **背景**：原本套裝觸發條件為「同 setId + 同 rarity」才算一組，導致混搭不同稀有度的同套裝裝備無法觸發套裝效果，玩家體驗不佳。
- **決定**：套裝觸發僅看 `setId`，不限 `rarity`。不同稀有度的同套裝裝備可混搭觸發 2 件套 / 4 件套效果。
- **範例**：
  - 1 件 N 級狂戰士 + 1 件 SR 級狂戰士 → 觸發 2 件套 ✅
  - 2 件 N + 2 件 SSR 同套裝 → 觸發 4 件套 ✅
- **影響檔案**：`src/domain/progressionSystem.ts` — `getActiveSetBonuses()` 移除 rarity 分組

---

### ADR-011: 紅點 useEffect 必須依賴 menuScreen

- **狀態**：✅ 永久生效
- **日期**：2026-03-05
- **背景**：MainMenu 紅點（arena、stages 等）的 `useEffect` 只依賴 `[gameState, playerId]`，但進入子面板再返回大廳時 `gameState` 始終是 `'MAIN_MENU'` 不變，導致資料不重抓、紅點不更新。
- **決定**：**所有** MainMenu 紅點的 `useEffect` 必須在依賴陣列中包含 `menuScreen`，確保從子面板返回大廳時能即時刷新狀態。
- **已修正**：
  - `arenaChallengesLeft`（競技場次數）— 依賴加入 `menuScreen`
  - `cachedDailyCounts`（每日探索次數）— 依賴加入 `menuScreen`
- **無需修正**：
  - `mailUnclaimedCount` — 基於 `useMemo(mailItems)`，領取時直接更新 `mailItems` state ✅
  - `gachaHasFreePull` — 基於 `useMemo(saveHook.playerData)`，抽卡後 playerData 自動重抓 ✅
  - `checkinNeeded` — 基於 `saveData.checkinLastDate`，簽到後 saveData 自動更新 ✅
- **未來規則**：新增紅點時，若數據來自 API 呼叫 / 快取（非 React state 直接衍生），`useEffect` 必須依賴 `menuScreen`。

---

### ADR-012: 任何獲得物品/英雄都必須觸發獲得動畫

- **狀態**：✅ 永久生效
- **日期**：2026-03-05
- **決定**：凡是玩家獲得物品（貨幣、道具、碎片、裝備）或英雄的場景，**一律**必須呼叫 `acquireToast.show(items)` 觸發浮動獲得動畫。
- **適用場景（非窮舉）**：
  - 關卡勝利獎勵 ✅（useBattleFlow）
  - 抽卡獲得 ✅（GachaScreen）
  - 信箱領取 ✅（MailboxPanel → showAcquire）
  - 簽到獎勵 ✅（CheckinPanel）
  - 離線資源收取 ✅（MainMenu onCollectResources）
  - **競技場掃蕩 ✅**（ArenaPanel → showAcquire，本次修正）
  - 商店購買
  - 任何未來新增的物品獲得途徑
- **技術實現**：
  - `useAcquireToast` hook（`src/hooks/useAcquireToast.ts`）提供 `show(items: AcquireItem[])` 方法
  - 頂層 `App.tsx` 持有 hook 實例，透過 props / bus 傳遞到子元件
  - `acquireToastBus.ts` 提供全域 `registerAcquireHandler` 供非 React 上下文使用
- **絕對禁止**：獲得物品後只顯示靜態面板而不觸發動畫 toast
---

### ADR-013: 戰力（Combat Power）計算前後端必須同步

- **狀態**：✅ 永久生效
- **日期**：2026-03-05
- **背景**：後端 `calcDefensePower()` 與前端 `getTeamCombatPower()` 各自實作了完整的戰力公式。曾因後端使用簡化公式（缺少稀有度成長、覺醒倍率、星級倍率、裝備屬性、套裝加成、技能加成）導致競技場排名戰力顯示（2677）與前端實際計算（4298）嚴重不一致。
- **決定**：
  - **任何影響戰力的新元素（新屬性、新加成機制、新套裝效果、新被動技能、新覺醒階段、新裝備詞條等），必須同時更新前端和後端的戰力計算邏輯**
  - **前端計算位置**：`src/domain/combatPower.ts`（`getTeamCombatPower` / `getHeroCombatPower`）+ `src/domain/progressionSystem.ts`（`getFinalStats`）
  - **後端計算位置**：`workers/src/routes/arena.ts`（`calcDefensePower()`）
  - **公式定義（CP_WEIGHTS）**：`HP×0.5 + ATK×3 + DEF×2.5 + SPD×8 + CritRate×5 + CritDmg×2`
  - **計算步驟（兩端必須一致）**：
    1. 基礎屬性 × 等級成長（依稀有度）
    2. × 覺醒倍率（`ASC_MULT`）
    3. × 星級倍率（`STAR_MUL`）+ 星級被動加成
    4. + 裝備主屬性（含強化等級加成）
    5. + 裝備副屬性（flat / percent 分開處理）
    6. + 套裝效果加成
    7. 加權求和 → 基礎戰力
    8. + 技能加成（100 + 被動數×50）
    9. + 套裝 CP 加成（2件=80, 4件=200）
  - 修改任一端後，必須確認另一端也同步更新
  - 修改後用同一組英雄數據驗證前後端計算結果一致
- **適用場景**：
  - 新增屬性類型（如暴擊抵抗、治療加成等）
  - 修改 CP_WEIGHTS 權重
  - 新增/修改裝備套裝效果
  - 新增/修改覺醒階段或星級倍率
  - 新增/修改技能被動效果對戰力的影響
  - 新增任何會改變 `getFinalStats` 輸出的機制
- **絕對禁止**：只改一端的戰力計算而遺漏另一端

---

### ADR-014: 全介面 safe-area-inset-top 強制規則

- **狀態**：✅ 永久生效
- **日期**：2026-03-06
- **背景**：iPhone 的瀏海/動態島會遮蔽畫面頂部內容。專案已在 `index.html` 設定 `viewport-fit=cover`，但多個介面缺少 `env(safe-area-inset-top)` 處理。
- **決定**：
  - **任何 `position: fixed/absolute` 且 `top: 0`（或接近頂部）的全屏/頂部元素，必須使用 `env(safe-area-inset-top)` 留出導航列空間**
  - 推薦模式：`padding-top: max(原始值, env(safe-area-inset-top, 0px))` 或 `top: max(原始值, env(safe-area-inset-top, 0px))`
  - 居中彈窗（`top: 50%` / `inset: 0` + `align-items: center`）不需要額外處理
- **已覆蓋的 10 個介面**（截至 v2.0）：
  1. `.game-hud` — `padding-top: max(4px, env(safe-area-inset-top))`
  2. `.login-screen` — `padding-top: env(safe-area-inset-top, 0px)`
  3. `.main-menu-overlay` — `padding-top: max(16px, env(safe-area-inset-top, 0px))`
  4. `.panel-overlay`（含 8 個子面板）— `padding-top: max(12px, env(safe-area-inset-top, 0px))`
  5. `.hero-detail-backdrop` — `padding-top: max(40px, env(safe-area-inset-top, 0px))`
  6. `.arena-panel` — `padding-top: env(safe-area-inset-top, 0px)`
  7. `.battle-prep-top-banner` — `padding: max(8px, env(...)) 12px 6px`
  8. `.battle-result-banner` — `top: max(5%, env(...))`
  9. `.boss-dmg-bar-wrap` — `top: max(clamp(...), env(...))`
  10. `.bhud-skill-toasts` — `margin-top: max(60px, calc(env(...) + 30px))`
- **未來規則**：新增任何頂部定位的 UI 元素時，必須檢查是否需要 safe-area-inset-top
- **驗證方式**：Puppeteer 模擬 iPhone 14 Pro（393×852）掃描所有 CSS 規則確認含 safe-area

---

### ADR-015: 競技場對手清單系統設計

- **狀態**：✅ 已定案
- **日期**：2026-03-06
- **背景**：原本競技場固定只能挑戰前方 3 名（`ARENA_CHALLENGE_RANGE = 3`），低排名玩家需打數百場才能攀到前列。使用者要求維持每日 5 場但大幅擴大挑戰跨度。
- **決定**：
  - **動態挑戰範圍**：依排名分 4 階（>100→200, 21-100→50, 6-20→15, 1-5→5）
  - **持久化對手清單**：10 名隨機對手存入 `save_data.arenaOpponents`（JSON array of playerId）
  - **手動刷新**：每日 5 次免費，`save_data.arenaRefreshCount` 計數
  - **排名變動偵測**：`arena-challenge-start` 檢查目標排名是否仍比自己前面，否則拒絕 + 免費自動刷新（不扣刷新次數）
  - **勝利後自動重生**：排名交換後對手池已變，自動重新生成清單
  - **每日重置**：00:00 UTC 清空 arenaOpponents + arenaRefreshCount
  - **挑戰改用 `targetUserId`**（非 `targetRank`），避免排名漂移問題
- **影響範圍**：
  - `workers/src/routes/arena.ts` — `getChallengeRange()`、`refreshAndStoreOpponents()`、排名變動檢查
  - `src/domain/arenaSystem.ts` — `getChallengeRange()`、`ARENA_DAILY_REFRESHES`
  - `src/services/arenaService.ts` — `ArenaOpponent` 型別、`refreshArenaOpponents()`
  - `src/components/ArenaPanel.tsx` — Top 10 + 10 Opponents + Refresh UI
  - `src/hooks/useStageHandlers.ts` — `targetUserId` + `rankChanged` 處理
  - `workers/schema.sql` — `arenaOpponents TEXT`、`arenaRefreshCount INTEGER`

### ADR-016: ~~Canvas 不使用 visibility:hidden~~ → **已被 ADR-018 取代**

- **狀態**：🚫 已廢棄（由 ADR-018 取代）
- **日期**：2026-03-06
- **原決策**：Canvas style 從 `visibility: hidden` 改為 `pointerEvents: none`，保持 Canvas 始終 visible
- **廢棄原因**：ADR-018 採用更根本的解法——大廳不掛載 Canvas，戰鬥時才動態掛載——完全消除 GPU 紋理保活問題

---

### ADR-018: 大廳/戰鬥場景分離 — Canvas 延遲掛載

- **日期**：2026-03-06
- **決策**：大廳（MAIN_MENU）不掛載 `<Canvas>`，僅在進入戰鬥準備（IDLE/BATTLE/GAMEOVER）時才動態掛載
- **根因**：iOS WKWebView 在 Canvas hidden/遮蓋期間回收 GPU 紋理 → 英雄模型變黑。與其用 CSS 技巧保活 GPU context，不如根本不在大廳建立 WebGL context。
- **實作**：
  1. `App.tsx` 新增 `showBattleScene` state，用 `{showBattleScene && <Canvas>}` 條件渲染
  2. `useStageHandlers.ts` — 進入關卡/競技場/防守設定時 `setShowBattleScene(true)` + 顯示過場幕
  3. `useBattleFlow.ts` — `backToLobby` 時 `setShowBattleScene(false)`
  4. GLB loader cache 在 module 層級（`Map<string, GLTF>`），Canvas 卸載不影響快取，再次掛載不需重新下載
- **注意**：Canvas 卸載時 console 會出現 `THREE.WebGLRenderer: Context Lost` 警告，屬正常行為
- **效果**：大廳零 GPU 負擔、3D 資源隨戰鬥結束自動釋放、iOS 紋理問題根絕
- **影響範圍**：`src/App.tsx`、`src/hooks/useStageHandlers.ts`、`src/hooks/useBattleFlow.ts`
- **Spec 更新**：tech-architecture v2.4 → v2.5

---

### ADR-019: iOS Canvas gl 配置 — 禁止自訂 gl factory，僅用 object config

- **狀態**：✅ 已定案
- **日期**：2026-03-08
- **決策**：R3F `<Canvas gl={...}>` 在 iOS 上**禁止使用 factory function**，只能用 object config
- **根因**：
  1. 自訂 `gl` factory 中呼叫 `canvas.getContext('webgl', opts)` 會**鎖定 canvas 為 WebGL1**
  2. R3F/Three.js 內部嘗試 `getContext('webgl2')` 時因 canvas 已被鎖定而失敗
  3. 即使 WebGL1 context 成功取得，傳給 `THREE.WebGLRenderer({ canvas, context })` 的渲染器也可能無法正常整合 R3F 的 animation loop
  4. 結果：整個 3D 區域全黑，只有 2D HUD overlay 可見
- **正確做法**：
  ```tsx
  // ✅ Object config — R3F 自行建立 renderer
  <Canvas gl={{ antialias: !isIOS, powerPreference: isIOS ? 'default' : 'high-performance' }}>
  
  // ✅ onCreated callback — iOS 專屬微調
  onCreated={({ gl }) => {
    if (isIOS) {
      gl.outputColorSpace = THREE.SRGBColorSpace
      gl.toneMapping = THREE.NoToneMapping
    }
  }}
  ```
- **禁止做法**：
  ```tsx
  // ❌ 絕對禁止：自訂 gl factory 強制 WebGL1
  gl={(defaultProps) => {
    const cvs = defaultProps.canvas
    const context = cvs.getContext('webgl', { ... })
    return new THREE.WebGLRenderer({ canvas: cvs, context })
  }}
  
  // ❌ 禁止：flat prop（會停用 ColorManagement → 材質全黑）
  <Canvas flat={true}>
  ```
- **修復歷程**：
  - 第一次嘗試（e69a17f）：移除 `flat` + Sky→background + setTimeout — 不夠
  - 第二次修復（2b71836）：**移除 gl factory** → 根治
- **影響範圍**：`src/App.tsx`、`src/components/HeroListPanel.tsx`
- **教訓**：不要試圖在 R3F 外部搶先取得 WebGL context，讓框架自行管理 GPU 初始化

---

### ADR-017: 英雄名稱改用 drei Html Overlay（取代 3D Text）

- **日期**：2026-03-06
- **決策**：Hero.tsx 中英雄頭上名稱從 drei `<Billboard><Text>` 改為 `<Html>` DOM overlay
- **根因**：
  1. drei `<Text>`（troika SDF）渲染中文字型品質不佳，筆畫模糊
  2. 3D 世界空間文字受透視縮放，遠處英雄名稱變小、難以辨識
- **修復**：`<Html position={[0, 3.5, 0]} center sprite>` + CSS `.hero-name-label`（系統字型、14px 固定大小、白字黑影描邊）
- **效果**：名稱文字清晰銳利、不隨距離縮放、支援 CSS 字型與樣式
- **影響範圍**：`src/components/Hero.tsx`、`src/App.css`