# 變更日誌 — Changelog

> 按時間倒序排列，最新的在最上面。

---
### [2026-02-28] 抽卡保底深層修正 + 500 抽壓力測試通過

- **觸發者**：10,000 抽壓力測試發現保底仍偶爾超過 90（8,710 抽中 7 次溢出）
- **執行角色**：🔧 CODING + 🧪 QA
- **主要變更**：
  1. **GAS `handleGachaPull_`**：移除兩處 `ensureGachaPool_()` 呼叫（行 ~2080 + ~2157），防止 phantom entries 汙染 `poolEndPity`
  2. **GAS `handleRefillPool_`**：接受 `clientPoolRemaining` 參數截斷 server pool，接受 `clientPity` 重新校正 `poolEndPity`
  3. **GAS `handleResetGachaPool_`**（新增）：清空 pool + 重置 `poolEndPity` + `gachaPity`，供 QA 測試用
  4. **GAS `handleResetGachaPool_` bug fix**：`saveData` 未定義 → 加入 `readRow_()` 讀取
  5. **前端 `gachaLocalPool.ts`**：`doRefill()` 送出 `clientPoolRemaining` + `clientPity`；`localPull()` 在 pool_empty 時也觸發 `scheduleRefill()`
  6. **QA 500 抽壓力測試**：保底超過90=NO ✅ | 保底亂跳=NO ✅ | 最高保底=74 | SSR率=2.40% | maxGap=80
  7. GAS 部署 POST @44 / GET @45

---
### [2026-02-27] localStorage Schema Migration + 抽卡保底修正

- **觸發者**：使用者回報保底超過最大值、保底數值亂跳；要求建立 localStorage 版本遷移機制
- **執行角色**：🔧 CODING + 🧪 QA
- **主要變更**：
  **A. localStorage Schema Migration System**
  1. `specs/local-storage-migration.md` — v1.0 完整 spec（版本化 + 遷移鏈 + 安全降級）
  2. `src/services/localStorageMigration.ts` — 遷移引擎（CURRENT_SCHEMA_VERSION=1, migrate_0_to_1 defensive parse）
  3. `src/main.tsx` — `createRoot()` 前呼叫 `runMigrations()` 同步遷移
  4. `src/services/index.ts` — barrel export `runMigrations` + `CURRENT_SCHEMA_VERSION`

  **B. 抽卡保底 Bug 修正（2 個 root cause）**
  1. **保底亂跳**：`doRefill()` 覆蓋 client pityState 為 server 的值（server 尚未處理 client 最近的 pull）→ 刪除 refill 中的 pity 同步，pity 只在 `initLocalPool`（登入時）設定一次
  2. **保底超過 90**：`doRefill()` 用 server 全池 REPLACE client pool，導致已消費 entries 重複消費、SSR 位置錯位 → GAS `handleRefillPool_` 改為只回傳 `newEntries`（新生成的），client `doRefill()` 改為 append（追加）不 replace（覆蓋）
  3. **NaN 保底**：`doRefill()` 中 `Number(ps.pullsSinceLastSSR) ?? fallback` 使用 `??` 無法捕捉 NaN → 改為 `||`
  4. GAS 部署 v@31 POST / v@32 GET
  5. QA Puppeteer 200 抽 × 2 輪：保底超過90=NO ✅ | 保底亂跳=NO ✅ | SSR 正常歸零 ✅

---
### [2026-02-28] GAS JSON 欄位 Defensive Parsing 修正

- **觸發者**：使用者回報大廳「關卡進度：undefined-undefined」，先前已發現 pityState TypeError
- **執行角色**：🔧 CODING + 🧪 QA
- **根因**：GAS Sheets 回傳的 JSON 欄位（storyProgress / formation / gachaPity）是 **字串** 而非物件
- **主要變更**：
  1. `src/services/saveService.ts` — 新增 `sanitizeSaveData()` 函式，對 storyProgress（→ object）、formation（→ array）、gachaPity（→ object）做防禦性 JSON.parse + 預設值 fallback
  2. `src/services/saveService.ts` — `loadSave()` 兩條路徑（新玩家 reload、正常載入）均套用 `sanitizeSaveData()`
  3. `src/services/gachaLocalPool.ts` — `initLocalPool()` + `doRefill()` 接受 `PityState | string`，自動 parse
  4. `tsc --noEmit` 零錯誤 | `vite build` 成功 | Puppeteer QA 驗證：關卡進度 **1-1**（非 undefined）✅ | 抽卡正常 ✅
- **影響範圍**：所有從 GAS load-save 取得的 JSON 欄位，前端統一防禦

---
### [2026-02-28] 本地抽卡池 (Local Gacha Pool) v1.0

- **觸發者**：使用者提出「登入預載 200 組池，抽卡 0ms 零等待」架構
- **執行角色**：🔧 CODING
- **主要變更**：
  1. `gas/程式碼.js` — `handleLoadSave_()` 回傳完整 `gachaPool[]` + `ownedHeroIds[]`
  2. `gas/程式碼.js` — 新增 `refill-pool` API（補充池到 200 並回傳最新資料）
  3. `src/services/gachaLocalPool.ts` — 全新前端本地池服務（~370 行）
     - `initLocalPool()` 登入初始化、`localPull()` 同步抽卡 0ms
     - `scheduleRefill()` 背景補充、`onPoolChange()` UI 訂閱
     - localStorage 備份 + `fireOptimistic` 背景同步
  4. `src/components/GachaScreen.tsx` — 改用 `localPull()` 同步抽卡，移除 loading 狀態
  5. `src/services/saveService.ts` — `loadSave()` 改呼叫 `initLocalPool()` 初始化池
  6. `src/hooks/useSave.ts` — 登出時呼叫 `clearLocalPool()` 清理
  7. `src/services/index.ts` — 加入 gachaLocalPool barrel exports
  8. GAS 部署 v@29 POST / v@30 GET
  9. `tsc --noEmit` 零錯誤 | `vite build` 成功 | load-save 回傳 200 池 ✅ | refill-pool 200 池 ✅
- **架構改變**：抽卡從「每次 API 呼叫 10-17s」→「登入一次載入，抽卡 0ms 本地處理」

---
### [2026-02-27] 樂觀更新佇列 (Optimistic Update Queue) v1.0

- **觸發者**：使用者要求降低 API 等待時間，改用本地先更新模式
- **執行角色**：🔧 CODING
- **主要變更**：
  1. `src/services/optimisticQueue.ts` — 前端樂觀佇列核心（325 行）
  2. `gas/程式碼.js` — 新增 `op_log` sheet 冪等機制 + `executeWithIdempotency_()` + `reconcile-pending` / `check-op` API
  3. `src/services/saveService.ts` — `collectResources()` 改為本地公式計算零等待 + 登入自動 reconcile
  4. `src/services/mailService.ts` — `claimMailReward()` / `claimAllMail()` 改為樂觀更新
  5. `src/services/progressionService.ts` — `gachaPull()` / `completeStage()` / `completeTower()` / `completeDaily()` 帶 opId 冪等保護
  6. `specs/optimistic-queue.md` — 完整 spec 文件（含 3 種套用模式 + step-by-step 指南）
  7. GAS 部署 v@27 POST / v@28 GET
  8. `tsc --noEmit` 零錯誤 | `vite build` 成功 | API 冪等測試通過 | reconcile 測試通過
- **新增 Spec**：`specs/optimistic-queue.md` v1.0 🟢

---
### [2026-02-27] Phase 4/5/6 Domain + Backend 完成

- **觸發者**：使用者指示「一口氣完成全部 Phase」
- **執行角色**：🏗️ TECH_LEAD + ⚙️ BACKEND_DEV + 🧪 QA_TESTER
- **主要變更**：
  1. `src/domain/progressionSystem.ts` — 等級/突破/星級/裝備/套裝 Domain（478 行）
  2. `src/domain/stageSystem.ts` — 主線/爬塔/每日副本 Domain（417 行）
  3. `src/domain/gachaSystem.ts` — 抽卡保底系統 Domain（290 行）
  4. `src/services/inventoryService.ts` — 背包前端服務（280 行）
  5. `src/services/progressionService.ts` — 養成/關卡/抽卡前端服務（220 行）
  6. `gas/程式碼.js` — 新增 20+ API handlers（inventory/progression/stage/gacha），1913 行
  7. `item_definitions` Google Sheet — 22 道具定義（經驗核心/職業石/強化石/鍛造材料/寶箱/貨幣/消耗品）
  8. GAS 部署 v@13 POST / v@14 GET
  9. 三套新測試：progressionSystem(45) + stageSystem(25) + gachaSystem(21) = 91 新測試
  10. 全專案：`tsc --noEmit` 零錯誤 | `vite build` 成功 | 224/224 tests pass

---
### [2026-02-27] � 新增 Spec：背包與道具系統（inventory.md）

- **觸發者**：使用者詢問背包系統
- **執行角色**：🎯 GAME_DESIGN
- **影響範圍**：specs/
- **新增檔案**：
  - `specs/inventory.md` v0.1 — 8 類道具分類、ID 命名規則、item_definitions + inventory + equipment_instances 三表結構、背包 UI 設計、容量機制（200→500）、11 個 API 端點、5 種商店、與養成/關卡/抽卡的交互定義
- **修改檔案**：
  - `specs/README.md` — Spec 清單新增 inventory.md
  - `specs/progression.md` — 依賴新增 `specs/inventory.md`
  - `specs/save-system.md` — inventory Sheet 說明加入交叉引用

---

### [2026-02-27] �🔧 Google Sheets 中文亂碼全面修復 + 防護規則

- **觸發者**：使用者回報 Google Sheet 中文欄位出現亂碼
- **執行角色**：🔧 CODING + 🏗️ TECH_LEAD
- **影響範圍**：GAS 後端、Google Sheets 資料表、專案規則文件
- **根因**：PowerShell `ConvertTo-Json` 在 Windows Big5 環境下產生編碼錯誤 + Google Sheets 自動將 "1-1" 格式轉為日期
- **修復的表**：
  - `progression_config`（23 筆）— 中文獎勵名稱亂碼 → 重建
  - `gacha_banners`（3 筆）— 常駐招募/烈焰之心/暗影降臨
  - `stage_configs`（24 筆）— 廢墟之城/暗夜森林/死寂荒原 + stageId 日期轉換修復
  - `daily_dungeons`（9 筆）— 力量試煉/敏捷試煉/防禦試煉
- **GAS 修改**：
  - `handleCreateSheet` 新增 `textColumns` 參數 — 指定的欄位在資料寫入前設為純文字格式（`setNumberFormat('@')`），防止 "1-1" 被自動轉為日期
- **規則更新**：
  - `.github/copilot-instructions.md` — 強制規則新增第 4 條「Google Sheets 中文亂碼防護」
  - `memory/decisions.md` — 新增 ADR-002「Google Sheets 中文亂碼防護與資料格式校驗」
- **GAS 部署**：clasp push + deploy（POST @11）
- **驗證**：所有 4 張修復的表已用 GET API 讀回確認中文正確、stageId 格式正確

---

### [2026-02-26] 💾 Phase 2: 存檔系統完成

- **觸發者**：使用者指令 — 進行 Phase 2 開發
- **執行角色**：🔧 CODING + 🏗️ TECH_LEAD
- **影響範圍**：GAS 後端、前端服務層、App.tsx、App.css
- **新增檔案**：
  - `src/services/saveService.ts` — 存檔服務（載入/寫入/資源計時器/本地快取/寫入佇列）
  - `src/hooks/useSave.ts` — 存檔 React Hook
- **修改檔案**：
  - `gas/程式碼.js` — 新增 6 個存檔 API（load-save, init-save, save-progress, save-formation, add-hero, collect-resources）+ 輔助函式（getSaveSheet_, getHeroInstSheet_, resolvePlayerId_, readHeroInstances_）+ 修復 Google Sheets "1-1" 自動轉日期問題
  - `src/App.tsx` — 整合 useSave hook，登入後並行載入存檔，HUD 顯示金幣/鑽石/等級
  - `src/App.css` — 新增 .hud-resources / .hud-gold / .hud-diamond / .hud-level 樣式
  - `src/services/index.ts` — 匯出存檔服務
- **GAS 部署**：clasp push + deploy（POST @9, GET @10）
- **API 測試結果**：6/6 全部通過
  - init-save ✅（自動建表 + 初始英雄 HeroID=6）
  - load-save ✅（resourceTimerStage 正確為 "1-1"）
  - save-progress ✅（增量更新 gold/diamond/level/exp/storyProgress）
  - save-formation ✅（陣型存取）
  - add-hero ✅（新增英雄實例）
  - collect-resources ✅（計時器資源領取）
- **QA**：`npx tsc --noEmit` 零錯誤 + `npx vite build` 編譯成功
- **功能特點**：
  - 新玩家自動初始化（500 鑽 + 10000 金 + 初始英雄）
  - 寫入佇列（debounce 2s 合併，失敗重試 3 次）
  - 本地 localStorage 快取（離線可讀）
  - 資源產出計時器（goldPerHour = 100 + progress×50, expItemsPerHour = max(1, floor(progress/3)), 最大 24h 累積）
  - HUD 即時顯示金幣/鑽石/等級

---

### [2025-02-26] 🧪 QA 全面測試 — 133 測試通過 + 3 Bug 修復

- **觸發者**：使用者指令 — 分派人手自行進行測試
- **執行角色**：🧪 QA 品管測試師
- **影響範圍**：`src/domain/buffSystem.ts`、`src/domain/battleEngine.ts`、`eslint.config.js`、`src/domain/__tests__/`（新建 7 個測試檔）
- **新增檔案**：
  - `src/domain/__tests__/testHelper.ts` — 測試用 mock 工廠（makeHero, makeSkill, makeStatus, makeShield 等）
  - `src/domain/__tests__/elementSystem.test.ts` — 12 tests
  - `src/domain/__tests__/buffSystem.test.ts` — 33 tests
  - `src/domain/__tests__/energySystem.test.ts` — 14 tests
  - `src/domain/__tests__/damageFormula.test.ts` — 19 tests
  - `src/domain/__tests__/targetStrategy.test.ts` — 18 tests
  - `src/domain/__tests__/battleEngine.test.ts` — 13 tests（含 1000 場數值模擬）
  - `src/domain/__tests__/boundary.test.ts` — 24 tests（邊界/安全性）
  - `memory/qa-report.md` — 完整測試報告
- **Bug 修復**：
  - **Bug #001 ESLint 缺 TS parser** ✅ — 安裝 `typescript-eslint`，更新 `eslint.config.js`
  - **Bug #003 tickStatusDurations 永久 buff 誤判** ✅ — duration 1→0 後被 `isPermaBuff` 誤判，改用 `permaBefore` Set 追蹤原本永久的效果
  - **Bug #004 runBattle break 誤判平手** ✅ — 迴圈 break 後直接返回 draw，缺少最終勝負判定，已補上
- **已知未修 Bug**：
  - **Bug #002 ATK buff 雙重套用** — `getBuffedStats` 和 `getAttackerDamageModifier` 都讀取 `atk_up`，30% buff 實效 ~69%
- **數值模擬結果**：1000 場公平 1v1 → 玩家 50.8% / 敵方 49.2% / 平手 0%
- **安裝新依賴**：`vitest@1.6.1`、`typescript-eslint`、`@typescript-eslint/parser`

---

### [2025-02-26] 全面對齊 specs ↔ 實作：6 份 spec 重寫至 🟢 已實作

- **觸發者**：使用者要求 — 所有 spec 必須完整反映已實作的程式碼
- **影響範圍**：`specs/core-combat.md`、`specs/damage-formula.md`、`specs/skill-system.md`、`specs/element-system.md`、`specs/tech-architecture.md`、`specs/hero-schema.md`、`specs/README.md`
- **變更內容**：
  - `core-combat.md` v2.0→v2.1 🟢 — **全面重寫**：Domain Engine 架構（Command Pattern）、BattleAction 11 型別、runBattle() 完整流程、能量系統 4 途徑、Buff/Debuff 25 種 StatusType、被動觸發 13 時機、目標策略 8 種、actor 狀態機、3D 演出流程、介面契約（BattleHero 23 欄位）、元件架構樹
  - `damage-formula.md` v0.1→v1.0 🟢 — **全面重寫**：10 步傷害公式（閃避→基底→DEF→暴擊→屬性→浮動→atkBuff→tgtBuff→取整→護盾→反彈）、治療公式（暴擊×1.5）、DOT 三種公式、反彈公式、DamageResult/HealResult 結構、damageType 飄字分類
  - `skill-system.md` v0.2→v1.0 🟢 — **全面重寫**：SkillTemplate/SkillEffect/HeroSkillConfig 介面、8 TargetType、9 SkillEffect 類型實作狀態、13 PassiveTrigger、星級解鎖規則、Google Sheets schema（skill_templates + hero_skills）、effects JSON 格式、資料載入流程、快取策略
  - `element-system.md` v0.1→v1.0 🟢 — **全面重寫**：7 屬性定義、中英對照表（冰=water, 毒=wind, 闇=dark）、7×7 倍率矩陣、剋制鏈（五行循環 + 光↔闇）、動態載入 loadElementMatrix()、3 個查詢 API
  - `tech-architecture.md` v1.0→v1.1 🟢 — 新增 `src/domain/` + `src/services/` 分層架構、3 層架構圖、更新資料流圖（完整 Sheets→sheetApi→dataService→App→battleEngine→onAction→3D）
  - `hero-schema.md` v2.0→v2.1 🟢 — **全面重寫**：4 層型別（RawHeroData→SlotHero→RawHeroInput→BattleHero）、轉換流程圖、toRawHeroInput/slotToInput 函式、FinalStats 用 SPD（不是 Speed）、14 角色完整數值表含稀有度星級、HeroInstance 養成層佔位
  - `specs/README.md` — 更新所有版本號與狀態（6 個升為 🟢 已實作/定稿）、新增「已實作系統摘要」表（9 筆原始碼↔spec 對照）
- **關鍵原則**：
  - 所有 spec 內容 100% 從 `src/domain/` + `src/services/` 原始碼逆向對齊，不含未實作的假想
  - 未實作部分標記為 ⬜ 待做 或列入擴展點

---

### [2026-02-26] 大批更新：技能/養成/傷害公式/英雄/戰鬥 specs

- **觸發者**：使用者要求 — 完整設計技能系統、裝備系統、傷害公式、能量大招
- **影響範圍**：`specs/skill-system.md`、`specs/progression.md`、`specs/damage-formula.md`、`specs/hero-schema.md`、`specs/core-combat.md`、`specs/README.md`
- **變更內容**：
  - `skill-system.md` v0.1→v0.2 — **重寫**：能量型主動技能（1000 門檻）、4 被動/星級解鎖（★1/★2/★4/★6）、模組化 skill_templates Google Sheet、14 英雄×4 被動完整設計、SkillEffect 介面、StatusType 列舉、Buff/Debuff 圖標規則
  - `progression.md` v0.1→v0.2 — **重寫**：等級 1~60、突破 0~5、星級 ★1~★6（重複抽碎片）、4 裝備欄位（武器/護甲/戒指/鞋子）、8 套裝效果、打造合成、**完整重置返還 100% 素材**
  - `damage-formula.md` v0.1 — **新建**：完整傷害/治療/暴擊/閃避/DOT/護盾/反彈公式、DEF 減傷曲線 `DEF/(100+DEF)`、暴擊系統、飄字顏色
  - `hero-schema.md` v1.0→v2.0 — 新增 DEF/CritRate/CritDmg/Element 欄位、14 隻角色新數值、HeroInstance + FinalStats 介面、星級系統、廢棄舊 Passive/PassiveDesc 欄位
  - `core-combat.md` v1.0→v2.0 — 新增能量系統（1000 門檻、獲取途徑）、Buff/Debuff 系統（3D 圖標顯示）、被動觸發點（10 種時機）、大招演出流程、新增 CASTING 狀態、BattleHero 擴展型別、多種目標策略
  - `specs/README.md` — 更新所有版本號與狀態
- **關鍵決策**：
  - heroes.tsv 舊 Passive/PassiveDesc 欄位**不再參考**，技能改為模組化技能表
  - 裝備重置返還 100% 素材（玩家友善設計）
  - 能量獲取：普攻+200、被攻擊+150、擊殺+100、回合+50
  - DEF 公式：`受到傷害 = 100/(100+DEF)`（收益遞減曲線）
  - CritRate/CritDmg 以裝備和 Buff 為主要培養途徑

---

### [2026-02-26] 新增 auth-system / save-system / stage-system specs

- **觸發者**：使用者要求 — 登入系統 + 存檔 + 關卡設計
- **影響範圍**：`specs/auth-system.md`、`specs/save-system.md`、`specs/stage-system.md`、`specs/README.md`
- **變更內容**：
  - `auth-system.md` v0.1 — 訪客 token + 綁定 email/密碼、Google Sheets players 表、SHA-256 hash、API 端點
  - `save-system.md` v0.1 — save_data / hero_instances / inventory 三表、寫入策略（debounce + 佇列）、體力系統、新手初始存檔
  - `stage-system.md` v0.1 — 5 種模式（主線章節 / 無盡爬塔 / 每日副本 / PvP 競技場 / Boss 戰）、解鎖條件、難度曲線、獎勵公式
  - 更新 specs/README.md 加入 3 個新規格
- **決策**：
  - 後端繼續用 Google Sheets（使用者偏好）
  - 登入方式：訪客 token + 綁定 email/密碼
  - 關卡：5 種模式全都要

---

### [2026-02-26] 新增 tech-architecture spec

- **觸發者**：使用者要求 — 將技術架構填入規格
- **影響範圍**：`specs/tech-architecture.md`、`specs/README.md`
- **變更內容**：
  - 新增 `tech-architecture.md` v1.0 — 完整記錄技術棧（React 19 + Three.js 0.183 + R3F 9 + drei 10 + Vite 5 + TypeScript 5.9）、3D 資產管線、載入器架構、元件樹、RWD 策略、效能策略、場景五要素連動規則、建構部署指令
  - 更新 `specs/README.md` 加入 tech-architecture 條目，core-combat / hero-schema 升為 v1.0 🟢 定稿

---

### [2026-02-26] 從現有程式碼逆向重寫 core-combat + hero-schema specs

- **觸發者**：使用者要求 — 規格必須反映實際程式碼，不可空想
- **影響範圍**：`specs/core-combat.md`、`specs/hero-schema.md`
- **變更內容**：
  - 刪除舊版假想 spec，從 App.tsx / types.ts / Hero.tsx / ZombieModel.tsx / heroes.tsv 逆向分析
  - `core-combat.md` v1.0 — 完整記錄 GameState 狀態機、ActorState 狀態機、6v6 格子座標、速度排序、TARGET_NORMAL 策略、傷害公式（純 ATK）、3D 演出流程、被動技能尚未實作清單
  - `hero-schema.md` v1.0 — 記錄 RawHeroData/SlotHero 介面、14 隻角色數值、模型/動畫資產結構、職業與稀有度分佈

---

### [2026-02-26] 建立 AI 團隊調度系統 + 規格驅動開發架構

- **觸發者**：使用者需求 — 建立可擴展、有記憶的 AI 開發團隊
- **影響範圍**：`agents/`、`specs/`、`memory/`、`.github/copilot-instructions.md`
- **變更內容**：
  - 建立 9 個 AI Agent 提示詞（`agents/01~09-*.md`）
  - 建立自動調度系統（`agents/README.md`）
  - 建立模組化規格系統（`specs/`），含 6 個初版 spec：
    - `core-combat.md` — 回合制戰鬥
    - `hero-schema.md` — 英雄資料結構
    - `skill-system.md` — 技能系統
    - `progression.md` — 養成系統
    - `gacha.md` — 抽卡系統
    - `element-system.md` — 屬性剋制
  - 建立記憶持久化系統（`memory/`）
  - 建立衝突偵測與解決協議
- **相關決策**：ADR-001
