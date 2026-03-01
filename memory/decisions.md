# 架構決策紀錄 — Architecture Decision Records

> 按編號排列。每個重要的技術/設計決策都記錄在這裡。

---

### ADR-000: AI 團隊全自主執行原則

- **狀態**：✅ 永久生效
- **日期**：2026-02-26
- **決定**：
  - **AI 團隊必須自行完成所有實作，不可要求使用者手動操作**
  - **完成功能後必須執行完整測試，確認遊戲可正常運行再回報完成**：
    - `npx tsc --noEmit`（零 TS 錯誤）
    - `npx vite build`（編譯成功）
    - API 端點測試（若有改 GAS）
    - 確認遊戲流程：登入 → 載入 → 選英雄 → 戰鬥 → 結果 → 重啟
    - 有 bug 就修，不能把壞掉的狀態交給使用者
  - **任務完成時必須播放提示音通知使用者**：
    - 指令：`[console]::beep(800,300); Start-Sleep -ms 100; [console]::beep(1000,300); Start-Sleep -ms 100; [console]::beep(1200,400)`
    - 時機：每次任務全部完成、測試通過、回報結果之前
    - **絕對不可忘記，這是使用者明確要求的**
  - Google Apps Script（GAS）修改 → 直接改 `gas/程式碼.js` → `clasp push` → `clasp deploy -i <ID>`
  - Google Sheets 資料操作 → 用 POST API（createSheet / updateSheet / appendRows / deleteRows）
  - 前端 / 後端 / 部署 / 測試全部自動化
  - 使用者只負責提需求，AI 團隊負責全部實現
- **技術細節**：
  - clasp 設定：`gas/.clasp.json`（scriptId: `1nTjW3rZftAlH3XcbYvg3fP5nrm3TeAkEXFpWDmdcRqbgKEm6HQg7BU5J`）
  - POST deployment: `AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg`
  - GET deployment: `AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw`
  - 部署指令：`cd gas && npx @google/clasp push && npx @google/clasp deploy -i <deploymentId> --description "描述"`
  - clasp 已登入，API 已啟用（`~/.clasprc.json` 存在）

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
- **影響**：建立 `specs/` 目錄結構、所有 Agent 的工作流程改為「先查 spec → 再行動」

---

### ADR-002: Google Sheets 中文亂碼防護與資料格式校驗

- **狀態**：✅ 永久生效
- **日期**：2026-02-27
- **背景**：專案使用 Google Sheets 作為後端資料庫，透過 PowerShell POST API 寫入資料。在 Windows Big5 環境下，若未正確使用 UTF-8 編碼，中文字會變成亂碼（如 `撣賊???`、`?銋?`、`甇餃???`）。Google Sheets 也會自動把 "1-1" 格式的字串轉為日期。
- **受影響的表（已修復）**：progression_config、gacha_banners、stage_configs、daily_dungeons
- **決定**：
  1. **寫入規範**：所有 POST 請求 body 必須用 `[System.Text.Encoding]::UTF8.GetBytes()` 編碼
  2. **寫入後驗證**：每次 createSheet / updateSheet / appendRows 後，立即用 GET API 讀回，抽樣檢查中文欄位
  3. **亂碼修復 SOP**：deleteSheet → createSheet 用正確 UTF-8 資料重建
  4. **日期轉換防護**：GAS `handleCreateSheet` 新增 `textColumns` 參數，指定的欄位會在資料寫入前設為純文字格式（`setNumberFormat('@')`），防止 "1-1" 被自動解讀為日期
  5. **適用範圍**：所有 Google Sheets 的新增、修改、刪除操作
- **技術細節**：
  - GAS `handleCreateSheet(sheetName, headers, data, textColumns)` — textColumns 為字串陣列，對應 headers 中需要純文字格式的欄位名
  - PowerShell 範例：`$bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody); Invoke-WebRequest -Body $bytes -ContentType 'text/plain; charset=utf-8'`
  - 亂碼特徵：`?` 問號、不成詞的方塊字（如 `撣賊`、`銋`、`璉格`、`甇餃`）
  - 日期誤轉特徵：stageId 值變成 ISO 日期字串（如 `2025-12-31T16:00:00.000Z`）

---

### ADR-003: 任務完成提示音

- **狀態**：✅ 永久生效
- **日期**：2026-02-28
- **決定**：
  - **每次完成使用者交代的任務（含 build 驗證通過後），必須播放提示音**
  - 指令：`[Console]::Beep(800, 200); [Console]::Beep(1000, 200); [Console]::Beep(1200, 300)`
  - 此規則跨對話持久生效，新對話啟動時讀取 memory/ 即可恢復
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

- **狀態**：✅ 永久生效
- **日期**：2026-03-01
- **決定**：
  - **任何涉及戰鬥邏輯的修改，必須同時修改前端（`src/domain/battleEngine.ts`）和 GAS 後端（`gas/battleEngine.js`）**
  - 實際戰鬥計算由 GAS 後端執行，前端僅負責 3D 動畫回放（Phase B）
  - 前端 `battleEngine.ts` 僅在後端呼叫失敗時作為 fallback（降級本地計算）
  - 改前端引擎卻漏改 GAS → 線上行為不變，只有降級時才生效 = 等同沒改
  - 修改後必須 `clasp push` + `clasp deploy` 部署 GAS
- **適用範圍**：能量系統、傷害計算、目標選擇、被動觸發、大招中斷、回合流程等所有戰鬥邏輯
- **理由**：v2.6 後戰鬥計算已移到 GAS，前端只是動畫播放器。曾因只改前端未改 GAS 導致「能量滿未立即施放大招」的 bug

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
