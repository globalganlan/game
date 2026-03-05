# 變更日誌 — Changelog

> 按時間倒序排列，最新的在最上面。

---
### [2026-03-06] 大規模修正 — 競技場修復 + 紅點系統 + ClickableItemIcon 統一 + Boss 條修正

- **觸發者**：使用者（批次需求一步到位）
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN + 🧪 QA
- **變更摘要**：

  **競技場（4 項修復）**：
  1. **敵方模型/動畫卡住修復（根本原因）**：`arena-challenge-start` 端點原本回傳 `heroes: []`，導致前端無敵方資料。重寫為：NPC 透過確定性種子生成 2~5 隻英雄（依排名分層），真實玩家從 `hero_instances + heroes` 表查詢 `defenseFormation` 角色
  2. **防守陣容載入修復**：ArenaPanel 掛載時 `useEffect` 呼叫 `getDefenseFormation()`，已存陣容即時回顯
  3. **排行榜戰力對齊**：`arena-set-defense` 儲存後以 CP_WEIGHTS 公式計算並寫入 `power`
  4. **戰力圖示修正**：ArenaPanel 排行榜 ⚡ → ⚔️
  5. **InfoTip 間距修正**：PanelInfoTip 移入 `.arena-title` span 內

  **紅點系統（3 項新增）**：
  6. **抽卡免費抽紅點**：App.tsx `gachaHasFreePull` useMemo（UTC+8 日期比較）→ MainMenu + GachaScreen 雙分頁紅點
  7. **競技場挑戰紅點**：App.tsx `arenaChallengesLeft` 狀態（cachePriority + API fetch）→ MainMenu 紅點
  8. **解鎖條件審核**：所有紅點已加 `!locked &&` / `unlocked &&` 守衛，鎖定按鈕不會出現紅點

  **ClickableItemIcon 統一（5 檔案 10 處）**：
  9. **App.tsx**：戰鬥準備獎勵（L749, L790）`getItemIcon` → `<ClickableItemIcon>`
  10. **StageSelect.tsx**：爬塔/每日/Boss 獎勵（L342, L416, L585）→ `<ClickableItemIcon>`
  11. **CheckinPanel.tsx**：簽到獎勵 → `<ClickableItemIcon>`，移除手動 `previewItemId` 狀態 + `ItemInfoPopup`
  12. **ShopPanel.tsx**：商品 icon → `<ClickableItemIcon>`，移除手動 `previewItemId` + `ItemInfoPopup`
  13. **HeroListPanel.tsx**：突破/升星素材（L799, L806, L843）→ `<ClickableItemIcon>`

  **其他修復**：
  14. **Boss 傷害條 emoji 修復**：BattleHUD 獎勵階段 💰💎✨ → `<CurrencyIcon>` 元件（ADR-007）
  15. **PanelInfoTip children 支援**：新增 `children?: ReactNode` prop，允許內嵌 ClickableItemIcon
  16. **每日副本經驗移除**：前端 stageSystem.ts 9 處 + 後端 battle.ts 3 處，exp 全歸零；移除 exp 掉落物
  17. **arenaService 匯出**：新增 `getCachedChallengesLeft()` 函式

- **影響檔案**：
  - `workers/src/routes/arena.ts`（arena-challenge-start 重寫 + arena-set-defense 戰力計算）
  - `workers/src/routes/battle.ts`（每日副本 exp 歸零）
  - `src/App.tsx`（gachaHasFreePull + arenaChallengesLeft + ClickableItemIcon 替換）
  - `src/components/ArenaPanel.tsx`（useEffect 載入防守陣容 + InfoTip 間距 + ⚔️ 圖示）
  - `src/components/MainMenu.tsx`（gachaHasFreePull / arenaChallengesLeft props + 紅點）
  - `src/components/GachaScreen.tsx`（雙分頁紅點）
  - `src/components/BattleHUD.tsx`（CurrencyIcon 替換 emoji）
  - `src/components/PanelInfoTip.tsx`（children ReactNode prop）
  - `src/components/StageSelect.tsx`（ClickableItemIcon 替換）
  - `src/components/CheckinPanel.tsx`（ClickableItemIcon 替換，移除 ItemInfoPopup）
  - `src/components/ShopPanel.tsx`（ClickableItemIcon 替換，移除 ItemInfoPopup）
  - `src/components/HeroListPanel.tsx`（ClickableItemIcon 替換）
  - `src/domain/stageSystem.ts`（每日副本 exp 歸零）
  - `src/services/arenaService.ts`（getCachedChallengesLeft 匯出）
- **Workers 部署**：已部署
- **Spec 更新**：
  - `ui-flow.md` v2.4 → v2.5
  - `tech-architecture.md` v1.5 → v1.6
  - `arena-pvp.md` v1.0 → v1.1

---
### [2026-03-05] 面板說明 InfoTip + 紅點閃現修正 + 爬塔樓層同步 + BOSS 次數重置

- **觸發者**：使用者（4 項需求）
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **面板說明 InfoTip（全 9 面板）**：新增 `PanelInfoTip.tsx` 元件（ℹ️ 按鈕 + Portal popup），所有大廳子面板的標題欄旁新增說明按鈕。`PANEL_DESCRIPTIONS` 常數集中管理 9 面板的多行說明文字。CSS 使用暗色毛玻璃風格 + `panelInfoFadeIn` 動畫。
  2. **紅點閃現修正**：StageSelect `hasRemaining()` 在 `dailyCounts` 尚未載入時改為 `return false`（原為 `return true`），消除進入關卡選擇時紅點一閃而逝的問題
  3. **爬塔樓層即時同步**：`runBattleLoop.ts` 爬塔勝利後新增 `doUpdateProgress({ towerFloor: nextFloor })`，修復 `serverResult.newFloor` 已返回但未寫入本地狀態的問題
  4. **BOSS 挑戰次數重置**：D1 SQL 手動重置玩家 #RFNAHZ（playerId=PRFNAHZ）的 dailyCounts
- **影響檔案**：
  - `src/components/PanelInfoTip.tsx`（新增）
  - `src/components/StageSelect.tsx`（import PanelInfoTip + 標題 JSX + hasRemaining 修正）
  - `src/components/ArenaPanel.tsx`（import + 標題 JSX）
  - `src/components/CheckinPanel.tsx`（import + 標題 JSX）
  - `src/components/GachaScreen.tsx`（import + 標題 JSX）
  - `src/components/HeroListPanel.tsx`（import + 標題 JSX）
  - `src/components/InventoryPanel.tsx`（import + 標題 JSX）
  - `src/components/ShopPanel.tsx`（import + 標題 JSX）
  - `src/components/SettingsPanel.tsx`（import + 標題 JSX）
  - `src/components/MailboxPanel.tsx`（import + 標題 JSX）
  - `src/game/runBattleLoop.ts`（爬塔樓層更新邏輯）
  - `src/App.css`（panel-infotip-btn / panel-infotip-popup / panelInfoFadeIn）
- **Spec 更新**：
  - `ui-flow.md` v2.3 → v2.4

---
### [2026-03-04] 4 項 UI 優化 — 碎片外觀統一 + 裝備編輯介面 + 章節網格 + 戰鬥準備資訊

- **觸發者**：使用者（4 項 UI 改善需求）
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **統一裝備碎片外觀與名稱（Task 1）**：商店碎片兌換分頁 icon 從 🔧 改為 🔩（與分解流程一致），Header InfoTip 標籤從「碎片」改為「裝備碎片」，價格圖示統一使用 🔩，分解 toast 文字也統一為「裝備碎片」
  2. **裝備穿脫改為部位編輯介面（Task 2）**：點擊任何裝備欄位（無論空/已裝備）→ 開啟編輯 Modal。已裝備槽位顯示「目前裝備」區塊（黃色邊框 + 卸下按鈕）+ 「可更換裝備」列表（排除已裝備品，移除 useMemo 快取失效 bug）。穿上裝備後 Modal 立即關閉（先關 Modal 再 await API，消除閃爍）
  3. **主線章節兩行排版優化（Task 3）**：章節標籤從 `flex + flex-wrap: wrap` 改為 `grid-template-columns: repeat(4, 1fr)` 兩行四列網格排列
  4. **戰鬥準備顯示關卡與獎勵（Task 4）**：戰鬥準備頂部新增 `battle-prep-top-banner`，整合 CombatPowerComparison + 關卡資訊區塊（關卡 ID badge + 名稱 + 通關獎勵列：經驗/金幣/鑽石/掉落物）
- **影響檔案**：
  - `src/components/ShopPanel.tsx`（碎片 icon 🔧→🔩 × 3 處）
  - `src/components/InventoryPanel.tsx`（分解 toast「碎片」→「裝備碎片」）
  - `src/components/HeroListPanel.tsx`（裝備編輯 Modal 重寫 + availableForSlot 移除 useMemo + handleEquipSelect 先關 Modal + 新增 handleUnequipFromModal）
  - `src/App.tsx`（battle-prep-top-banner + 關卡資訊區塊 + getCachedStageConfig / getItemIcon / getItemName import）
  - `src/App.css`（章節 grid 排版 + battle-prep-top-banner CSS）
- **Spec 更新**：
  - `ui-flow.md` v2.1 → v2.2

---
### [2026-03-05] 裝備暴擊屬性修正 + 裝備欄完整資訊 + 關卡選擇佈局修正

- **觸發者**：使用者回報 3 項問題（裝備暴擊無反映、裝備欄缺稀有度/副屬、關卡選擇橫向捲軸）
- **執行角色**：🔧 CODING

**1. 裝備暴擊屬性修正（progressionSystem.ts）**
- **根因**：CritRate/CritDmg 副屬性皆為 `isPercent: true`，`getFinalStats()` 以乘算處理（`Math.floor(5 * 1.05) = 5`），floor 消除小數導致加成歸零
- **修正**：CritRate/CritDmg 的「%」副屬性改為 **加算百分點**（`addStatFlat()`），例：CritRate=5 + 5% → CritRate=10
- Step 3（裝備百分比副屬收集）：CritRate/CritDmg percent subs → `addStatFlat()`
- Step 4（套裝效果）：CritRate_percent/CritDmg_percent set bonuses → `addStatFlat()`
- 加註設計註解說明加算 vs 乘算原因

**2. 裝備欄顯示完整資訊（HeroListPanel.tsx + App.css）**
- 舊版：僅顯示裝備名稱 + 主屬性 + 強化等級
- 新版：
  - 稀有度標籤（SSR/SR/R/N，帶對應顏色）
  - 裝備名稱 + 強化等級（+N 徽章）
  - 主屬性（含強化加成數值）
  - 所有副屬性列表（名稱 + 數值 + %標記）
- 新增 CSS：`hd2-equip-header` / `hd2-equip-rarity-tag` / `hd2-equip-main-stat` / `hd2-equip-sub-list` / `hd2-equip-sub-item`

**3. 關卡選擇佈局修正（App.css）**
- **根因 1**：`sc-stage-grid` 使用 `repeat(4, 1fr)`，1fr 的隱含最小寬度為 `min-content`，第 4 欄溢出容器
- **根因 2**：`sc-chapter-tabs` 使用 `flex-wrap: nowrap` + `overflow-x: auto`，8 章節在窄面板產生橫向捲軸
- **修正**：
  - `sc-stage-grid`：改為 `repeat(4, minmax(0, 1fr))` 強制列寬收縮
  - `sc-chapter-tabs`：改為 `flex-wrap: wrap`，移除 `overflow-x: auto` 及所有捲軸隱藏 CSS
  - `sc-chapter-tab`：`flex: 0 1 auto`（允許收縮），`min-width: 0`
  - `stage-content`：加 `overflow-x: hidden` 防溢出
  - `sc-stage-card`：加 `overflow: hidden; min-width: 0`
  - `sc-card-name`：加 `text-overflow: ellipsis` 防名稱溢位
  - `sc-card-rewards`：加 `flex-wrap: wrap` 防獎勵溢位
  - 移動端 RWD：移除已不需要的捲軸隱藏 CSS

- **Playwright MCP 測試**：
  - 關卡選擇畫面：8 章節 tab 自動換行（2 行 × 4 個），8 關在 4×2 網格完整顯示，無橫向捲軸 ✅

- **影響檔案**：
  - `src/domain/progressionSystem.ts`
  - `src/components/HeroListPanel.tsx`
  - `src/App.css`

---
### [2026-03-04] 抽卡前端狀態刷新修復（4 Bug 修復）

- **觸發者**：使用者回報 4 個 Bug（召喚券不消失、免費抽狀態不更新、新英雄不在上陣列表、套裝效果確認）
- **執行角色**：🔧 CODING
- **根本原因**：抽卡後前端 in-memory state 未即時更新，需重整頁面才反映正確值
- **變更摘要**：

  **1. GachaScreen.tsx — 即時本地狀態同步**
  - 召喚券扣除：改用 `removeItemsLocally()` 取代 `addItemsLocally({ quantity: -N })`（後者 `if (quantity <= 0) continue` 會靜默跳過負數）
  - 免費抽狀態：抽卡成功後呼叫 `updateFreePullLocally('lastHeroFreePull' | 'lastEquipFreePull', dateStr)`
  - 保底計數器：抽卡成功後呼叫 `updateGachaPityLocally(res.newPityState)`
  - 英雄抽卡 + 裝備鍛造皆已修復

  **2. saveService.ts — 5 項修復**
  - `notify()` 改為深複製 heroes 陣列：`{ ...currentData, heroes: [...currentData.heroes], save: { ...currentData.save } }`（修復 `useMemo` 偵測 reference 不變而不重算 `ownedHeroesList`）
  - `updateLocal()` 移除 `if (key in currentData.save)` 防護（修復 optional fields 如 `lastHeroFreePull` / `gachaPity` 因不在物件上而被靜默跳過）
  - `sanitizeSaveData()` 新增 optional fields 初始化（`lastHeroFreePull` / `lastEquipFreePull` 預設 `''`）
  - 新增 `updateFreePullLocally(field, dateStr)` 匯出函式
  - 新增 `updateGachaPityLocally(pity)` 匯出函式

- **Bug 修復清單**：
  - ✅ Bug 2：新抽到英雄不在上陣列表（heroes array reference mutation → useMemo 不更新）
  - ✅ Bug 3：召喚券使用後不消失（addItemsLocally 負數靜默跳過）
  - ✅ Bug 4：免費抽使用後狀態不更新（optional field 寫入被 `in` 檢查跳過）
  - ✅ Bonus：保底計數器重返抽卡畫面歸零（同 Bug 4 根因）
  - ✅ Bug 1：套裝效果顯示正常（已驗證 2 件套觸發 UI）

- **Playwright MCP 測試**：
  - 英雄召喚：免費抽 → 十連抽（券扣除）→ 返回大廳 → 重入抽卡 → 狀態持久化確認
  - 裝備鍛造：免費鍛造 → 十連鍛造（券扣除）→ 返回大廳 → 重入抽卡 → 狀態持久化確認
  - 英雄面板：新英雄出現在列表 + 裝備穿戴 + 套裝效果顯示

- **影響檔案**：
  - `src/components/GachaScreen.tsx`
  - `src/services/saveService.ts`

---
### [2026-03-04] localStorage 技術債清理 — 後端權威模式全面落實

- **觸發者**：使用者（「為什麼前端還有存 localStorage？後端換架構後應該全部改成後端權威」）
- **執行角色**：🔧 CODING + 🏗️ TECH_LEAD
- **背景**：GAS → Workers 遷移是功能導向（逐路由搬移），未回頭清理前端 localStorage 快取邏輯，導致大量技術債殘留（88 處 localStorage 引用）
- **變更摘要**：

  **1. saveService.ts 全面重構**
  - 移除 `STORAGE_KEY_SAVE` 常數、`saveToLocal()` / `loadFromLocal()` 函式
  - `loadSave()` 改為純 server-only（無本地 fallback、無本地 hero 合併）
  - `updateLocal()` 僅更新內存 state，不寫 localStorage
  - `clearLocalSaveCache()` 改為清除所有舊版 key 的一次性清理
  - 新增 `clearLegacyLocalStorage()` helper，在首次 `loadSave()` 時清除 10 個舊版 key
  - 移除所有 11 處 `saveToLocal(currentData)` 呼叫
  - 移除簽到 `gg_checkin_date` localStorage 防重複邏輯

  **2. inventoryService.ts 全面重構**
  - 移除 `STORAGE_KEY_INVENTORY` 常數、`saveInventoryToLocal()` / `loadInventoryFromLocal()` 函式
  - `loadInventory()` 移除本地合併邏輯（不再 merge localStorage items 與 server items）
  - 移除 6 處 `saveInventoryToLocal()` 呼叫（addItems/removeItems/sellItems/useItem/addItemsLocally/removeItemsLocally）
  - `addItemsLocally/removeItemsLocally/addEquipmentLocally` 不再 fallback 到 `loadInventoryFromLocal()`，改為空 state 初始化
  - 移除 `gg_equipment_cache` localStorage 寫入
  - `clearInventoryCache()` 移除 `localStorage.removeItem` 呼叫

  **3. localStorageMigration.ts 全面重寫**
  - 從 216 行 GAS 時代遷移引擎 → 55 行清除器
  - `runMigrations()` 改為一次性清除 10 個舊版 localStorage key
  - 不再寫入 `globalganlan_schema_version`（版本追蹤已無意義）
  - 保留匯出介面（`CURRENT_SCHEMA_VERSION` / `runMigrations`）確保 main.tsx / index.ts 不需改動

- **保留的 localStorage key**（純前端偏好/認證）：
  - `globalganlan_guest_token`（登入 token）
  - `globalganlan_logged_out`（登出旗標）
  - `globalganlan_tutorial_step`（教學進度）
  - `battleSpeed`（戰鬥速度偏好）
  - `gg_audio_settings`（音效設定）

- **影響檔案**：
  - `src/services/saveService.ts`（重構 v0.3）
  - `src/services/inventoryService.ts`（重構）
  - `src/services/localStorageMigration.ts`（重寫 v2.0）

- **Spec 更新**：
  - `.ai/specs/local-storage-migration.md` v1.0 → v2.0（已廢棄遷移引擎，改為清除器）

- **驗證**：
  - `tsc --noEmit`：零錯誤
  - `vite build`：成功（691 modules）
  - Playwright 測試：登入→1-1 戰鬥→勝利→回大廳→資源正確更新→localStorage 零遊戲資料

---
### [2026-06-20] 前後端公式一致性對齊 + UI 強化 12 項

- **觸發者**：使用者（綜合 UI/數值/公式修正需求）
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN + 🎨 UI_DESIGN
- **變更摘要**：
  1. **英雄面板裝備屬性顯示**：HeroListPanel 改用 `getFinalStats` 顯示含裝備+套裝的最終數值（綠色 +bonus）
  2. **升級 UI 重做**：左右按鈕（升1級/升N級）+ HP/ATK/DEF 預覽 + 關閉後保持模態
  3. **難度圖示改星星**：StageSelect DifficultyStars 💀→⭐ + 難度等級 tooltip
  4. **降低 1-1/1-2 關難度**：D1 stage_configs hpMult/atkMult 減半、speedMult 降至 0.6
  5. **移除強化石**：ShopPanel 移除所有強化石商品（小/中/大型）
  6. **分解確認面板**：InventoryPanel 分解增加二階段確認 UI（顯示金幣+碎片預估返還）
  7. **統一券類圖示**：ShopPanel 英雄券 🎫→🎟️、裝備券 🔨→🔧（對齊 rarity.ts）
  8. **關卡獎勵預覽**：StageSelect 關卡卡片新增 EXP/金幣/鑽石獎勵標籤
  9. **強化費用對齊**：前端 getEnhanceCost 倍率 0.5→0.3（對齊後端）
  10. **經驗公式對齊**：前端 expToNextLevel 改為 `level * 100`（對齊後端）
  11. **突破數值對齊**：等級上限 {20,40,60,80,90,100}、碎片/職業石/金幣消耗全面對齊後端
  12. **裝備主屬性修正**：後端 enhance 不再修改 mainStatValue（消除 compound vs linear 衝突）
- **影響檔案**：
  - `src/components/HeroListPanel.tsx`（getFinalStats 整合 + 升級 UI）
  - `src/components/StageSelect.tsx`（⭐星星 + 獎勵預覽 + CurrencyIcon import）
  - `src/components/InventoryPanel.tsx`（分解確認面板）
  - `src/components/ShopPanel.tsx`（移除強化石 + 券圖示統一）
  - `src/domain/progressionSystem.ts`（4 項公式/常數對齊）
  - `workers/src/routes/progression.ts`（enhance 不再修改 mainStatValue）
  - `src/App.css`（升級 UI + 分解確認 CSS）
  - `.ai/scripts/seed_stage_configs.sql`（1-1/1-2 敵方數值降低）
  - `.ai/specs/progression.md`（v2.4→v2.5 全面更新）

---
### [2026-06-19] 9 項系統簡化 — 星級/鎖定/容量移除 + 分解/碎片兌換/背包強化 新增

- **觸發者**：使用者（9 項系統簡化與功能新增需求）
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN + 🎨 UI_DESIGN
- **變更摘要**：
  1. **簽到/商店加召喚券鍛造券（Task 1）**：簽到 Day 3/5/6/7 發放英雄召喚券/裝備鍛造券；特殊商店販售（💎50/張，每日限購 3）
  2. **圖鑑全顯示移除蒐集進度（Task 2）**：CodexPanel 顯示所有 8 套裝 × 4 部位 × 4 稀有度，無收藏進度條
  3. **英雄資訊顯示套裝效果（Task 3）**：HeroListPanel 裝備區下方顯示已激活套裝 bonus
  4. **移除背包數量限制（Task 4）**：InventoryPanel 不再顯示 X/Y 容量；`equipmentCapacity` 與 `/expand-inventory` 棄用
  5. **分解功能＋碎片兌換商店（Task 5）**：背包可分解裝備得金幣+碎片（N→100金+1片 ～ SSR→2000金+8片）；商店新增碎片兌換分頁（4 種商品）
  6. **移除裝備鎖定（Task 6）**：UI/API 完全移除 `locked` 欄位與 `/lock-equipment` 端點
  7. **背包直接強化裝備（Task 7）**：InventoryPanel 裝備詳情彈窗新增強化按鈕（需花金幣）
  8. **簡化關卡星級系統（Task 8）**：移除 1/2/3 星評價，改為二元通關制（cleared=1），移除 `calculateStarRating`、`starsEarned`、勝利面板星級/首通標記
  9. **移除關卡金幣顯示（Task 9）**：爬塔面板不再顯示金幣/經驗/鑽石獎勵行（後端仍照常發放）
- **影響檔案**：
  - `src/components/VictoryPanel.tsx`（移除 stars/isFirst）
  - `src/components/StageSelect.tsx`（移除 stageStars prop、星級顯示、塔獎勵行、CurrencyIcon import）
  - `src/components/MenuScreenRouter.tsx`（移除 stageStars prop）
  - `src/components/InventoryPanel.tsx`（新增分解/強化按鈕、移除容量顯示/鎖定按鈕）
  - `src/components/CodexPanel.tsx`（全裝備顯示、無收藏進度）
  - `src/components/HeroListPanel.tsx`（套裝效果顯示）
  - `src/components/ShopPanel.tsx`（碎片兌換分頁+特殊商店召喚券）
  - `src/components/CheckinPanel.tsx`（Day 3/5/6/7 發券）
  - `src/App.tsx`（移除 stageStars prop 傳遞）
  - `src/hooks/useSave.ts`（移除 doUpdateStageStars）
  - `src/hooks/useBattleFlow.ts`（移除 doUpdateStageStars）
  - `src/game/runBattleLoop.ts`（移除星級計算、starsEarned、doUpdateStageStars）
  - `src/services/progressionService.ts`（移除 starsEarned 參數）
  - `src/services/inventoryService.ts`（新增 decomposeEquipment）
  - `workers/src/routes/battle.ts`（簡化獎勵，移除星級）
  - `workers/src/routes/inventory.ts`（新增 /decompose-equipment）
  - `workers/src/routes/save.ts`（碎片兌換商店路由）
- **Spec 更新**：
  - `stage-system.md` v2.7 → v2.8
  - `progression.md` v2.3 → v2.4
  - `inventory.md` v2.6 → v2.7
  - `gacha.md` v2.2 → v2.3
  - `ui-flow.md` v2.0 → v2.1
  - `save-system.md` v2.0 → v2.1
- **Workers 部署**：`npx wrangler deploy` ✅

---
### [2026-06-18] 場景道具品質升級 + 英雄裝備 2×2 佈局 + 背包容量 + 召喚券描述

- **觸發者**：使用者（4 項 UI/3D 品質需求）
- **執行角色**：🔧 CODING + 🎨 3D_ASSET
- **變更摘要**：
  1. **場景道具品質全面升級**：SceneProps.tsx 20+ 道具全部增加末日風化細節 — 鏽斑(RustMark)、血漬(BloodStain)、碎石堆(RubblePile)、垃圾散落(ScatteredLitter) 4 種共用氛圍元件；每個主題道具加入碎玻璃/油漬/裂縫等微型裝飾；`generateSceneElements` 為全 8 主題加入獨立散佈的氛圍元素
  2. **英雄裝備 2×2 佈局**：HeroListPanel 裝備區改為 `grid 1fr 1fr` 兩行兩列；每格 `flex-direction: row; align-items: flex-start`（icon 左上、裝備名居中、強化按鈕右上同行）
  3. **背包容量顯示**：InventoryPanel 改為 `{items+equipment}/{capacity} 背包`（含所有道具+裝備總數）
  4. **召喚券描述**：D1 新增 gacha_ticket_hero / gacha_ticket_equip 道具定義（含描述文字）
- **影響檔案**：
  - `src/components/SceneProps.tsx`（20+ 道具元件增強 + 8 主題 generator 加氛圍元素）
  - `src/components/HeroListPanel.tsx`（裝備區塊 JSX 結構調整）
  - `src/components/InventoryPanel.tsx`（背包容量顯示）
  - `src/App.css`（`.hd2-equip-row/slot/detail/enhance-btn` 樣式重構）
  - D1 database（item_definitions 表新增 2 筆記錄）
- **Spec 更新**：`stage-system.md` v2.7、`ui-flow.md` v2.0

---
### [2026-06-17] 後端貨幣唯一權威 + 抽卡系統 v2.2 改版

- **觸發者**：使用者（要求消除所有前端自行更新數值的情形）
- **執行角色**：🔧 CODING
- **變更摘要**：
  1. **後端貨幣唯一權威**：所有資源修改 API（battle, inventory, progression, checkin, gacha, mail, arena）統一回傳 `currencies`，前端用 `applyCurrenciesFromServer()` 覆蓋本地，消除 20 處前端自行更新數值的情形
  2. **十連折扣移除**：英雄十連 1440→1600、裝備鑽石十連 1800→2000（= 10 × 單抽）
  3. **免費單抽合併至單抽按鈕**：可用時顯示「🎁 免費」，使用後顯示倒數計時至 UTC+8 午夜
  4. **裝備鍛造免費單抽**：鑽石池每日免費單抽一次（新增 `lastEquipFreePull` D1 欄位）
  5. **InfoTip 改版**：不透明背景 + 金色邊框 + 窄寬度 + 邊緣防裁切
- **影響檔案**：
  - 後端 9 個路由（save, battle, inventory, progression, checkin, gacha, mail, arena）
  - 前端 12 個檔案（GachaScreen, ShopPanel, HeroListPanel, InventoryPanel, MailboxPanel, MenuScreenRouter, runBattleLoop, saveService, inventoryService, mailService, arenaService, progressionService）
  - Domain: gachaSystem.ts, equipmentGacha.ts（成本常數）
  - 類型: workers/types.ts, SaveData interface
  - CSS: InfoTip 樣式 + gacha-free-countdown
- **Spec 更新**：`.ai/specs/gacha.md` v2.1 → v2.2

---
### [2026-03-04] 修復雙重獎勵 Bug — 關卡通關後重新整理資源再增一次

- **觸發者**：使用者回報（通關→資源+1次→重新整理→資源+第2次）
- **執行角色**：🔧 CODING
- **根因**：
  - 後端 `complete-battle` 用 hardcoded 公式（`gold = 100+ch*50+st*20`）寫入 DB（incremental `gold = gold + ?`）
  - 前端獨立用 `stage_configs` 算出不同數字寫入 localStorage
  - 兩邊公式不同 → localStorage ≠ DB
  - 重新整理時 `loadSave()` 拉 DB 值覆蓋 localStorage → 資源二度跳變
- **修復**：
  1. **前端（`runBattleLoop.ts`）**：不再獨立計算獎勵；改為 `await completeBattle` 回應，使用 `serverResult.rewards` → localStorage 數值與 DB 完全一致
  2. **後端（`battle.ts`）**：Story 模式改從 D1 `stage_configs` 表讀取 rewards（取代 hardcoded 公式）；首通：基礎×2, diamond≥30；fallback 保留舊公式
  3. **前端離線 fallback**：伺服器不可用時才使用本地 `getCachedStageConfig` 計算
  4. **舊版相容**：`complete-stage` 路由同步改用 stage_configs
- **影響檔案**：
  - `src/game/runBattleLoop.ts` — 獎勵來源改為 await 後端回應
  - `workers/src/routes/battle.ts` — Story 模式改讀 stage_configs
- **Spec 更新**：`.ai/specs/stage-system.md` v2.3 → v2.4

---
### [2026-03-03] PWA Standalone Reload 迴圈修復

- **觸發者**：使用者（PWA 加入主畫面後遊戲一直 reload）
- **執行角色**：🔧 CODING
- **變更摘要**：
  1. **導航請求不攔截** — SW fetch handler 遇到 `mode: 'navigate'` 直接 return，讓瀏覽器原生處理 HTML 載入（根因修復）
  2. **跨域請求不攔截** — 排除非同源請求（Workers API 等），避免快取過期 token/資料
  3. **移除 HTML 預快取** — 不再預快取 `/game/` 和 `/game/index.html`，避免陳舊 HTML 引用錯誤 hash 資源
  4. **降低更新輪詢頻率** — 從 60 秒改為 5 分鐘，減少 iOS standalone 生命週期 churn
  5. **Reload 防護** — 3 秒內不允許連續 reload（sessionStorage 計時）
  6. **更新 bar 防重複** — 加入 `id` 檢查，避免多個 update bar 疊加
  7. **SW 版號升級** — v5 → v6，自動清除舊快取
  8. **fallback 修復** — fetch 失敗 + cache miss 時回傳 `503 Response`（而非 `undefined`）
- **影響檔案**：
  - `public/sw.js` — 全面重寫 fetch handler + 移除預快取
  - `src/main.tsx` — reload 防護 + 降頻 + 防重複 bar

---
### [2026-03-03] 裝備圖鑑系統（Codex）

- **觸發者**：使用者
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **新增圖鑑面板** — 背包新增「📖 圖鑑」tab，展示 8 套裝 × 4 部位 × 4 稀有度 = 128 種裝備百科
  2. **可擴展架構** — `CodexCategory` 聯合型別設計，未來可加英雄圖鑑、怪物圖鑑、成就圖鑑等
  3. **收集進度** — 頂部進度條顯示「已擁有 / 128」收集率
  4. **套裝瀏覽** — 8 個套裝 tab 按鈕 + 套裝效果卡（2 件 / 4 件套裝獎勵展示）
  5. **稀有度篩選** — 全部 / N / R / SR / SSR 一鍵切換
  6. **裝備卡片** — 每張卡片顯示：部位 emoji、中文名稱、稀有度標籤、主屬性數值、副屬性數 × 強化上限
  7. **擁有/未擁有** — 已擁有卡片亮色 + 金光 hover；未擁有灰階 + 🔒 遮罩
  8. **RWD 適配** — 手機端格子自動縮小（min 100px）
- **影響檔案**：
  - `src/components/CodexPanel.tsx`（新增）— 圖鑑主元件 + EquipmentCodex 子元件
  - `src/components/InventoryPanel.tsx` — 新增 codex tab + 條件渲染 + ownedEquipTemplateIds memo
  - `src/domain/equipmentGacha.ts` — 匯出 SET_IDS / SLOTS / SLOT_MAIN_STAT / MAIN_STAT_BASE
  - `src/App.css` — 新增 `.codex-*` 全套樣式（~200 行）

---
### [2026-03-03] UI 全面中文化 + 背包 UI 改善 + 裝備稀有度強化

- **觸發者**：使用者
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **UI 全面中文化** — 掃描全專案 15 個檔案共 ~61 處英文 UI 文字，全部翻譯為繁體中文：
     - 新增 `src/constants/statNames.ts` — 共用屬性名稱映射（STAT_ZH + STATUS_ZH）
     - 屬性標籤 HP→生命 / ATK→攻擊 / DEF→防禦 / SPD→速度（GachaScreen / HeroListPanel / StageSelect）
     - 裝備主副屬性 key 全部走 `statZh()` 中文映射（HeroListPanel / InventoryPanel / GachaScreen）
     - 裝備套裝 ID 使用 `SET_NAMES` 中文映射（HeroListPanel / InventoryPanel）
     - 戰鬥文字：ROUND→回合 / VICTORY→勝利 / DEFEAT→敗北 / MISS→閃避
     - Buff tooltip 使用 `statusZh()` 中文映射（BattleHUD）
     - Boss 標籤 BOSS→首領、Boss 層→首領層（StageSelect）
     - 簽到 Day→第N天（CheckinPanel）
     - 設定 BGM→背景音樂 / SFX→音效 / Email→電子信箱（SettingsPanel）
     - 抽卡 NEW!→新！（GachaScreen）
     - 排序 A-Z→名稱排序（InventoryPanel）
  2. **「全部」分頁包含裝備** — 背包「全部」tab 同時顯示道具 + 裝備
  3. **英雄碎片中文名稱修復** — `asc_fragment_X` 一律使用 `resolveFallbackName()`
  4. **裝備「使用中」稀有度視覺** — 稀有度色 box-shadow + 徽章
- **影響檔案**：
  - `src/constants/statNames.ts`（新增）— STAT_ZH / STATUS_ZH 共用映射
  - `src/components/GachaScreen.tsx` — 屬性標籤中文化 + 引用共用 STAT_ZH + NEW!→新！
  - `src/components/HeroListPanel.tsx` — 屬性/裝備屬性中文化 + statZh() + SET_NAMES
  - `src/components/InventoryPanel.tsx` — 裝備屬性中文化 + statZh() + SET_NAMES + 排序選項
  - `src/components/StageSelect.tsx` — Boss→首領 + 屬性標籤中文化
  - `src/App.tsx` — ROUND→第N回合
  - `src/components/VictoryPanel.tsx` — VICTORY→勝利 / DEFEAT→敗北
  - `src/components/SceneWidgets.tsx` — MISS→閃避
  - `src/components/BattleHUD.tsx` — Buff tooltip 中文化
  - `src/components/CheckinPanel.tsx` — Day→第N天
  - `src/components/SettingsPanel.tsx` — BGM→背景音樂 / SFX→音效 / Email→電子信箱

---
### [2025-07-16] 背包清理 — 移除過時道具 + 裝備排序 + 已裝備標記

- **觸發者**：使用者
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **移除過時道具定義** — DB 刪除 `exp_core_*`（經驗核心大中小）、`forge_*`（鍛造材料 4 種）、`potion_*`（藥水 2 種），共 9 筆；同步清理 inventory 殘留
  2. **移除「經驗」分頁** — 背包 TABS 移除 `exp_material` tab；「通用」改名為「素材」
  3. **ItemCategory 型別精簡** — 移除 `exp_material`、`equipment_material`、`forge_material`
  4. **裝備列表排序** — 已裝備的裝備排最前面，同組內依稀有度高→低排序
  5. **已裝備視覺區別** — 裝備格子加上綠色半透明背景 + 右上角「使用中」badge
- **影響檔案**：
  - `src/components/InventoryPanel.tsx` — TABS、equipmentList sort、equip-in-use badge
  - `src/services/inventoryService.ts` — ItemCategory 精簡
  - `src/App.css` — `.inv-equip-in-use` + `.inv-equip-badge` 樣式
  - DB: item_definitions 刪 9 筆、inventory 清理

---
### [2025-07-16] 背包分頁分類修正 — DB category 對齊前端 tab

- **觸發者**：使用者（背包分頁都是空的）
- **執行角色**：🔧 CODING
- **變更摘要**：
  1. **DB item_definitions category 修正** — `extra.category` 原本所有素材都是 `material`，前端 tab 期望 `exp_material` / `ascension_material` / `general_material`，導致經驗/突破/通用三個分頁全空
     - `exp_core_*` → `exp_material`
     - `asc_class_*` → `ascension_material`
     - `eqm_enhance_*` / `forge_*` / `potion_*` → `general_material`
  2. **新增 14 個英雄碎片定義** — `asc_fragment_1`~`asc_fragment_14` 加入 `item_definitions`，category = `ascension_material`，前端用 `resolveFallbackName()` 顯示中文名
- **影響**：純 DB 修改，無前端程式碼變更
- **驗證**：tsc 零錯誤、vite build 成功

---
### [2025-07-16] 召喚結果 UI 改進 — 金框 + 統一尺寸 + 資訊彈窗

- **觸發者**：使用者
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **SSR 金框取代彩框** — `.gacha-card-ssr` 從 rainbow border-image 改為純金色邊框 + 金色光暈動畫；彩框（rainbow）保留給未來更稀有角色
  2. **召喚結果卡片統一尺寸** — grid 改為固定 90px 欄位、每張卡片 86px 寬 + 110px 最小高度，不再隨內容彈性變化
  3. **英雄資訊彈窗** — 點擊召喚結果中的英雄卡片彈出 `HeroInfoPopup`：3D 頭像、名稱、稀有度、元素/類型標籤、描述、Lv.1 六維屬性（HP/ATK/DEF/SPD/暴擊率/暴擊傷害），無操作按鈕
  4. **裝備資訊彈窗** — 點擊裝備卡片彈出 `EquipInfoPopup`：部位 emoji、名稱、稀有度、套裝/部位標籤、主屬性、副屬性列表，無操作按鈕
  5. **裝備卡片簡化** — 結果頁中的裝備卡片不再顯示主屬性與副屬性，點擊查看詳情
- **影響檔案**：
  - `src/components/GachaScreen.tsx` — ResultCard/EquipResultCard 加 onClick、新增 HeroInfoPopup/EquipInfoPopup 元件、新增 popup state
  - `src/App.css` — SSR 金框 CSS、統一卡片尺寸、gacha-info-* 彈窗樣式

---
### [2025-07-16] DB 正規化 & 裝備名稱 & 戰力動畫改進

- **觸發者**：使用者（4 項合併需求）
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **game_sheets DB 正規化** — 新增 3 個專屬 D1 表（`skill_templates`、`hero_skills`、`element_matrix`），heroes 表增加 `modelId/critRate/critDmg/description` 欄位。`readSheet` 端點改從專屬表查詢，不再依賴 game_sheets KV blob。
  2. **裝備中文名稱修正** — HeroListPanel（6 處）+ InventoryPanel（2 處）將 `eq.templateId` 改用 `getEquipDisplayName()` 顯示中文（如「狂戰士武器」）
  3. **戰力動畫即時觸發** — useCombatPower hook 新增 `onInventoryChange` 訂閱，穿脫裝備/強化時立即顯示 CP 變化動畫
  4. **戰力動畫格式改進** — Toast 格式改為「⚔️ 戰力 12,345 +500 ↑」，增加量綠色、減少量紅色
- **影響檔案**：
  - `workers/schema.sql` — 新增 3 表 + heroes 新欄位
  - `workers/src/routes/data.ts` — readSheet 改從專屬表查詢
  - `src/components/HeroListPanel.tsx` — 裝備名稱 6 處
  - `src/components/InventoryPanel.tsx` — 裝備名稱 2 處
  - `src/hooks/useCombatPower.ts` — invTick 訂閱
  - `src/App.tsx` — CP toast 格式 + 顏色
  - `src/components/CombatPowerHUD.tsx` — CombatPowerToast 組件更新

---
### [2025-07-15] UI 修正 & 經驗更新 Bug 修復

- **觸發者**：使用者（6 項合併需求）
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN
- **變更摘要**：
  1. **ShopPanel 錯字修正** — 5 處 `兆換` → `兌換`
  2. **CurrencyIcon 改用 emoji** — 金幣💰、鑽石💎、經驗💚、星塵✨、戰力⚔️
     - `CurrencyIcon.tsx` 全面重寫：CSS badge → emoji `<span>`
     - `App.css` 移除 `.icon-coin` / `.icon-dia` / `.icon-exp` / `.icon-stardust` / `.icon-cp` 共 ~80 行 CSS
     - 新增 `.currency-emoji` 極簡樣式
  3. **裝備崩潰修復**：
     - `inventoryService.ts` `addEquipmentLocally()` — 新裝備通過 `parseEquipment()` 正規化
     - `HeroListPanel.tsx` — 裝備選擇/強化 Modal 加入 `rarity` / `subStats` 空值防護
  4. **升級英雄 UI 改版** — 拋棄 slider，改為「升 1 級」「升 N 級」雙按鈕（含費用預覽）
  5. **經驗資源 UI 即時更新修復**：
     - `MenuScreenRouter.tsx` 信箱獎勵 — exp 改走 `updateProgress()` 而非 `addItemsLocally()`
     - `saveService.ts` 每日簽到 — exp 直接加到 `save.exp` 而非 inventory
     - `InventoryPanel.tsx` 寶箱 & 道具使用 — 新增 exp 即時回寫 `save.exp`
- **驗證**：tsc 零錯誤、vite build 成功

---
### [2025-07-14] D1 原子批次寫入（db.batch）重構

- **觸發者**：使用者：後端 `db.prepare().run()` 不是原子操作，中途 crash 會部分寫入
- **執行角色**：🔧 CODING
- **變更摘要**：
  - **核心函式**（`workers/src/routes/save.ts`）：
    - 新增 `upsertItemStmt()` — 單 SQL `INSERT...ON CONFLICT` 物品 upsert，回傳 `D1PreparedStatement`
    - 新增 `grantRewardsStmts()` — 合併同欄資源增減為單一 UPDATE，回傳 `D1PreparedStatement[]`
    - 保留向後相容 `upsertItem()` / `grantRewards()` 包裝
  - **核心函式**（`workers/src/routes/mail.ts`）：
    - 新增 `insertMailStmt()` — 信件 INSERT 語句，回傳 `D1PreparedStatement`
  - **save.ts** — `init-save` 批次化（INSERT save_data + 3× INSERT hero_instances，陣型內建）
  - **auth.ts** — `register-guest` 批次化（INSERT players + INSERT mailbox 歡迎信）
  - **auth.ts** — `bind-account` 批次化（UPDATE players + INSERT mailbox 獎勵信）
  - **inventory.ts** — 7 個路由批次化（add-items / remove-items / sell-items / shop-buy / use-item / equip-item）
  - **gacha.ts** — `gacha-pull` + `equip-gacha-pull` 批次化
  - **progression.ts** — 4 個路由批次化（upgrade-hero / ascend-hero / star-up-hero / enhance-equipment）
  - **mail.ts** — 5 個路由批次化（claim-mail-reward / claim-all-mail / delete-all-read / send-mail / claim-pwa-reward）
  - **checkin.ts** — `daily-checkin` 批次化
  - **arena.ts** — `arena-challenge-complete` 全面重構：合併散落的 5~6 次寫入為單一 batch
  - **Spec 更新**：`.ai/specs/tech-architecture.md` v1.8 → v1.9（新增「D1 原子批次寫入」章節）
- **驗證**：
  - Workers `tsc --noEmit` 零錯誤
  - 前端 `tsc --noEmit` 零錯誤
  - `vite build` 成功
  - Workers 部署成功
  - API 測試：register-guest → init-save → load-save 完整流程正常（3 英雄 + 陣型 + 歡迎信）

---
### [2026-03-02] 移除 save-progress 路由

- **觸發者**：架構審查 — 發現 save-progress 4 個 allowedFields 全部已有專用路由負責
- **執行角色**：🔧 CODING
- **變更摘要**：
  - **Workers**：刪除 `save-progress` 路由（`workers/src/routes/save.ts`）
  - **前端**：移除 debounce 2s 寫入佇列機制（`flushChanges` / `enqueueSave` / `pendingChanges` / `scheduleRetry`）
  - `enqueueSave()` 簡化為 `updateLocal()`（僅更新本地 state + localStorage，不打 API）
  - `flushPendingChanges()` 改為 no-op 空殼（保留 export 避免呼叫端報錯）
  - 欄位存入改由專用路由負責：`displayName` → `change-name`、`formation` → `save-formation`、`resourceTimerStage` → `complete-battle`、`resourceTimerLastCollect` → `collect-resources`
  - **Spec 更新**：`.ai/specs/save-system.md` v1.9 → v2.0

---
### [2026-03-02] EXP 資源重構 + 星塵兌換商店 + UI 修復

- **觸發者**：使用者回饋多項改善需求
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN + 🛡️ QA
- **變更摘要**：

  **1. Hero Equipment UI Crash Fix**
  - `src/components/HeroListPanel.tsx` — 新增裝備屬性防禦性 null guard（mainStat / mainStatValue / enhanceLevel / rarity）
  - `src/components/InventoryPanel.tsx` — 同步新增裝備屬性 null guard

  **2. Inventory Equipment Tab**
  - `src/components/InventoryPanel.tsx` — TABS 陣列補回缺失的 equipment 分頁

  **3. 移除重洗石（eqm_reroll）**
  - `src/components/ShopPanel.tsx` — 移除重洗石商品
  - `workers/src/routes/inventory.ts` — SHOP_CATALOG 移除 eqm_reroll
  - `src/components/ItemInfoPopup.tsx` — 移除重洗石相關顯示
  - `src/constants/rarity.ts` — 移除重洗石常數

  **4. EXP 資源重構（重大變更）**
  - **概念**：移除 exp_core_s / exp_core_m / exp_core_l 道具，EXP 改為頂層資源（與 gold / diamond 同級），存於 `save_data.exp`
  - `workers/schema.sql` — save_data 新增 `exp` 欄位
  - 戰鬥獎勵（story / tower / pvp / boss / daily）直接發放 exp 到 save_data
  - 離線計時器產出 EXP 資源（公式：`expPerHour = Math.max(100, progress * 50)`）
  - 英雄升級改用 EXP 資源 + 滑桿 UI（取代舊版素材選擇）
  - 商店直接販售 EXP 資源
  - 主選單頂欄新增 EXP 顯示（與 gold / diamond 並列）
  - 勝利面板顯示 EXP 獎勵

  **5. 星塵兌換商店**
  - 新增商店分類：星塵兌換（6 種商品）
  - 商品：exp×5000（10☆）、gold×50k（15☆）、通用職業石×2（20☆）、大型強化石×3（25☆）、金寶箱（50☆）、diamond×100（80☆）
  - 後端以 inventory 表 `currency_stardust` 作為星塵貨幣扣除來源

- **Spec 更新**：`.ai/specs/progression.md` v2.2→v2.3、`.ai/specs/inventory.md` v2.3→v2.4、`.ai/specs/stage-system.md` v2.1→v2.2
- **Workers 部署**：已部署

---
### [2026-03-02] 抽卡系統重構：移除預生成池機制

- **觸發者**：使用者回饋「英雄召喚有問題——GAS 時代的 400 筆預加載已不需要」
- **執行角色**：🔧 CODING + 🛡️ QA
- **變更摘要**：

  **後端（Workers）**
  - `workers/src/routes/gacha.ts` — 重寫 `gacha-pull` 端點，移除預生成池 splice 機制，改為即時呼叫 `generateGachaEntries()` 產生結果
  - 移除 3 個端點：`refill-pool`、`gacha-pool-status` 完全移除；`reset-gacha-pool` 簡化為僅重設 pity
  - 移除 `ensureGachaPool()` 函數、`GACHA_REFILL_COUNT` 常數
  - `gacha-pull` 回傳新增 `stardust`/`fragments` 欄位（前端不再需要自行計算）
  - 修復 `hero_instances` INSERT 欄位名：`equipment` → `equippedItems`、`createdAt` → `obtainedAt`
  - `workers/src/routes/save.ts` — `load-save` 不再回傳 `gachaPool`/`gachaPoolRemaining`

  **前端**
  - **刪除** `src/services/gachaLocalPool.ts`（384 行）— 本地池管理、localStorage 備份、背景同步/補池
  - **刪除** `src/services/gachaPreloadService.ts`（134 行）— 預載快取服務
  - `src/components/GachaScreen.tsx` — `doPull()` 從同步 `localPull()` 改為 `async callApi('gacha-pull')` 直接呼叫後端
  - 移除狀態：`_poolRemaining`、`onPoolChange` 訂閱
  - `src/services/saveService.ts` — 移除 `initLocalPool()` 呼叫和 `PoolEntry` import
  - `src/services/progressionService.ts` — 移除 `getGachaPoolStatus()`，更新 `gachaPull()` 回傳型別
  - `src/services/index.ts` — 移除所有 gachaLocalPool 重新匯出
  - `src/hooks/useLogout.ts` — 移除 `clearLocalPool()` + `clearGachaPreload()` 呼叫
  - `src/hooks/useSave.ts` — 移除 `clearLocalPool()` 呼叫

- **Spec 更新**：`.ai/specs/gacha.md` v1.6 → v2.0
- **QA 驗證**：tsc 零錯誤、vite build 成功、API 測試 gacha-pull 回傳正確結果
- **Workers 部署**：Version 7af96a95

---
### [2026-03-02] 商店/寶箱/道具詳情優化

- **觸發者**：使用者回饋三項優化建議
- **執行角色**：🎯 GAME_DESIGN + 🔧 CODING + 🛡️ QA
- **變更摘要**：

  **1. 移除裝備商店分頁**
  - `src/components/ShopPanel.tsx` — 商店分頁從 4 個縮為 3 個（每日/素材/特殊），移除 `equipment` 分類和 `equip_chest` 商品
  - `workers/src/routes/inventory.ts` — 同步移除後端 `equip_chest` 商品目錄
  - 原因：裝備商店僅一個商品（裝備寶箱），與裝備銻造/抽取功能重複

  **2. 修復寶箱無法開啟問題**
  - 根因：D1 `item_definitions` 表的 `useAction` 存在 `extra` JSON 內，但後端 `load-item-definitions` API 只回傳原始 row，未解析 `extra`
  - 前端 `definition?.useAction` 永遠為 undefined → 「開啟」按鈕不顯示
  - 修復：`workers/src/routes/inventory.ts` 的 `load-item-definitions` 現在解析 `extra` JSON，合併 `useAction`/`category`/`name`/`description` 等欄位到回傳結果
  - API 驗證：4 種寶箱都回傳 `useAction: "open"`

  **3. 簽到/商店道具點擊查看詳情**
  - 新增 `src/components/ItemInfoPopup.tsx` 共用元件（唯讀道具詳情彈窗）
  - 簽到面板：道具行可點擊，顯示名稱/稀有度/說明
  - 商店面板：商品 icon 可點擊，顯示獎勵道具詳情
  - CSS 新增 `.item-info-popup`/`.checkin-item-clickable`/`.shop-item-icon-clickable`

- **QA 驗證**：24 PASS / 0 FAIL / 0 WARN
- **Workers 部署**：Version e5890616

---
### [2026-03-02] 信箱系統修復 — deletedAt/expiresAt 查詢條件修正

- **觸發者**：使用者回報「新辦帳號獎勵信件消失了」
- **執行角色**：🔧 CODING + 🛡️ QA
- **根因分析**：
  - `workers/schema.sql` 定義 `deletedAt TEXT NOT NULL DEFAULT ''`
  - 所有信件的 `deletedAt` 值為空字串 `''`（NOT NULL 約束不允許 NULL）
  - 但 `mail.ts` 所有查詢條件都用 `deletedAt IS NULL`（SQLite 中 `'' IS NULL` = false）
  - **結果：整個信箱系統無法顯示任何信件**（歡迎信、競技場獎勵、定時信件全部隱形）
- **修正內容**：
  - `workers/src/routes/mail.ts` — 4 個查詢條件從 `deletedAt IS NULL` 改為 `(deletedAt IS NULL OR deletedAt = '')`
  - `insertMail` 函式 — `expiresAt || null` 改為 `expiresAt || ''`（避免 NOT NULL 約束違規）
  - `workers/src/routes/auth.ts` — 確認歡迎信件使用 `'', ''`（與 schema 一致）
- **QA 驗證**：20 PASS / 0 FAIL / 3 WARN（信箱 badge 顯示 1 封未讀歡迎信件）
- **Workers 部署**：Version 7e571088

---
### [2026-03-02] 遊戲平衡修正 — Chapter 1 難度曲線重新平衡

- **觸發者**：QA 全功能測試發現 1-2 對新帳號形成死鎖（3 敵 vs 3 隻 Lv.1 英雄必敗→無法解鎖召喚/商店）
- **執行角色**：🎯 GAME_DESIGN + 🔧 CODING + 🛡️ QA
- **變更摘要**：

  **新機制：敵方 defMultiplier**
  - `src/domain/stageSystem.ts` — `StageEnemy` 介面新增 `defMultiplier?: number`（預設 1.0）
  - `src/game/helpers.ts` — `buildEnemySlotsFromStage` 支援 defMultiplier 縮放敵人 DEF
  - 修正早期敵人 HP/ATK 被縮放但 DEF 維持原值的比例失衡問題

  **Chapter 1 關卡重新平衡**
  - `.ai/scripts/seed_stage_configs.sql` — 全 8 關加入 defMultiplier
  - **1-2**：3 敵→2 敵（移除 heroId 1，保留 7+14）+ 保底掉落 exp_core_s（100%）
  - 1-1~1-7：defMultiplier = atkMultiplier（DEF 與 ATK 同步縮放）
  - 1-8（Boss）：defMultiplier = 1.0（Boss DEF 維持基礎值）
  - D1 遠端已重新 seed

  **QA 驗證結果**：24 PASS / 0 FAIL / 0 WARN（瀏覽器實測通過）

---
### [2025-07-14] saveService storyProgress notify 時序修復

- **觸發者**：QA 全功能 E2E 測試發現 1-2 通關後進度未推進到 1-3
- **執行角色**：🛡️ QA + 🔧 CODING
- **變更摘要**：

  **Bug 修復：**
  - `src/services/saveService.ts` — `updateStoryProgress()` 修復 notify 時序
    - 根因：`enqueueSave({ storyProgress: JSON_STRING })` 先設字串再 notify，
      導致 React 端收到 `storyProgress` 為字串而非物件，
      `isFirstClear()` 計算 `progress.chapter` 得到 undefined → NaN → first=false，
      後續關卡勝利永遠不推進劇情進度
    - 修復：在 `enqueueSave` 後覆寫為正確物件型態再呼叫 `notify()`

  **QA 測試基礎建設：**
  - `.ai/scripts/qa_full_playtest.mjs` — 全功能 E2E 測試腳本
    - 修正關卡卡片點擊選擇器（避免點到父容器 div）
    - 修正戰鬥結果偵測（.battle-result-banner / VICTORY / DEFEAT）
    - 修正 1-2 敗北/勝利判定邏輯

---
### [2025-07-14] stage_configs 技術債修復 — 主線關卡改 API 驅動

- **觸發者**：使用者要求「把技術債修一修吧 從worker拿關卡資料 然後前端生成對應的UI」
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN
- **變更摘要**：

  **Workers 後端：**
  - 新增 `workers/src/routes/stage.ts`（~80 行）— `/list-stages`（全部）+ `/stage-config`（單筆）
  - `workers/src/index.ts` — 註冊 stage 路由（protectedApi 第 11 個模組）
  - D1 `stage_configs` 表 seed 24 筆關卡配置（`.ai/scripts/seed_stage_configs.sql`）

  **前端服務層：**
  - 新增 `src/services/stageService.ts`（~100 行）— fetchStageConfigs / getStageConfig / getCachedStageConfig / clearStageCache
  - 型別：StageExtra（chapterName/stageName/description/bgTheme/difficulty/recommendedLevel/isBoss/chapterIcon）

  **StageSelect 重寫：**
  - `src/components/StageSelect.tsx` — 全面重寫（~340 行），主線改用 API 動態載入
  - 章節主題選擇器（🏙️ 廢墟之城 / 🌲 暗夜森林 / 🏜️ 死寂荒原），每章獨立主題色
  - 關卡卡片顯示：名稱、難度骷髏（1-5）、推薦等級、敵人數量、獎勵預覽、星級
  - Boss 關金框 + BOSS 徽章、當前關卡脈衝動畫

  **遊戲流程串接：**
  - `src/game/helpers.ts` — `buildEnemySlotsFromStage` 新增 `injectedEnemies` 參數，story 模式從 API 取得
  - `src/hooks/useStageHandlers.ts` — `handleStageSelect` 改為先 await `getStageConfig()` 再生成敵方
  - `src/hooks/useBattleFlow.ts` — retryBattle / replayBattle / goNextStage 改為 async，story 模式注入 API 敵方
  - `src/game/runBattleLoop.ts` — 結算改用 `getCachedStageConfig()` 取得獎勵（含 fallback 公式）

  **死碼清理：**
  - `src/domain/stageSystem.ts` — 移除 `getStoryStageConfig()` + `CHAPTER1_ZOMBIE_IDS`（~60 行）
  - `src/domain/__tests__/stageSystemAdvanced.test.ts` — 移除 getStoryStageConfig 測試區段

  **CSS：**
  - `src/App.css` — 新增 ~180 行 `sc-*` 前綴樣式類別（章節選擇器/關卡卡片/難度骷髏/BOSS 徽章/RWD）

  **Spec / 文件：**
  - `.ai/specs/stage-system.md` v1.4 → v2.0（D1 驅動架構、章節主題表、前端流程圖）
  - `.ai/memory/dev-status.md` 第 41 次更新
  - `.ai/memory/changelog.md` 同步記錄

- **Workers 部署**：Version 55841f88（11 個路由模組）
- **驗證**：tsc 零錯誤 + Workers tsc 零錯誤 + vite build 成功（687 modules）

---
### [2026-03-02] handleFullLogout 移至 SettingsPanel — useLogout hook

- **觸發者**：使用者要求「handleFullLogout 移到 SettingPanel.tsx Component」
- **執行角色**：🔧 CODING
- **變更摘要**：
  - 新增 `src/hooks/useLogout.ts`（~50 行）：auth logout + 9 個服務快取 clear，接收 `onResetState` 回呼
  - `SettingsPanel.tsx`：改用 `useLogout(onLogout)` 取代手寫 `logout() + onLogout()`，移除 `logout` import
  - `App.tsx`：`handleFullLogout` 簡化為 `handleLogoutResetState`（純 React state / hook reset），移除 5 個 cache clearing import（invalidateMailCache/clearSheetCache/clearGachaPreload/clearLocalPool/clearPendingOps）+ 4 個額外 unused import（clearGameDataCache/clearLocalSaveCache/clearInventoryCache/clearArenaCache）
  - 淨減 App.tsx ~10 行（685 → ~675 行）
  - tsc 零錯誤 + vite build 成功
- **GAS 部署**：無（純前端重構）

---
### [2026-03-02] App.tsx 方法拆分 Phase 4 — 3 個 hooks + import 清理

- **觸發者**：使用者要求「App.tsx 方法也都拆出去到各自的 component」（延續 Phase 3）
- **執行角色**：🔧 CODING → 🏗️ ARCHITECT
- **變更摘要**：
  - App.tsx **696 行 → 685 行**（淨減 11 行 import；邏輯面更大的改善是 3 塊 state/effect 抽入 hooks）
  - 新增 `src/hooks/useMail.ts`（~44 行）：mailItems / mailLoaded / mailUnclaimedCount / refreshMailData / resetMail
  - 新增 `src/hooks/useBattleState.ts`（~107 行）：所有戰鬥中介狀態（turn/speed/battleResult/victoryRewards/battleStats/actorStates/domain refs/setActorState/resetBattleRefs）
  - 新增 `src/hooks/useBgm.ts`（~35 行）：BGM 自動切換 effect（login/lobby/battle/gacha/victory/defeat）
  - `handleFullLogout` 簡化：inline state reset 改為 `mail.resetMail()` + `resetBattleRefs()`
  - 移除 15 條 unused import（loadMail / MailItem / ActorState / Vector3Tuple / BattleHero / BattleAction / SkillTemplate / HeroSkillConfig / BattleFlowValidator / RawHeroInput / VerifyResult / CompleteBattleResult / audioManager / VictoryRewards / BattleStatEntry）
  - tsc 零錯誤 + vite build 成功
- **GAS 部署**：無（純前端重構）

---
### [2026-03-02] App.tsx 方法拆分 Phase 3 — 4 個 hooks 完全抽出

- **觸發者**：使用者要求「App.tsx 方法也都拆出去到各自的 component」（延續 Phase 2）
- **執行角色**：🔧 CODING → 🏗️ ARCHITECT
- **變更摘要**：
  - App.tsx **1294 行 → 696 行**（淨減 598 行，再減幅 46%；累計從 2652 行降到 696 行，總減幅 74%）
  - 新增 `src/hooks/useSlots.ts`（104 行）：槽位狀態管理（6 格 × 雙方）+ ref 同步 + 陣型恢復
  - 新增 `src/hooks/useGameInit.ts`（283 行）：fetchData + 模型/縮圖預載 + Phase 0/1/2 Effects + PWA 獎勵 + 載入超時
  - 新增 `src/hooks/useBattleFlow.ts`（298 行）：resetBattleState / buildBattleCtx / retryBattle / replayBattle / backToLobby / goNextStage / runBattleLoop / startAutoBattle
  - 新增 `src/hooks/useStageHandlers.ts`（159 行）：handleStageSelect / handleArenaStartBattle / handleCheckin / handleMenuNavigate / handleBackToMenu
  - `handleFullLogout` 簡化：slot 重設用 `resetSlots()`，init ref 重設用 `gameInit.resetInitRefs()`
  - 清理 unused imports（normalizeModelId, RawHeroInput 等已移至 hooks）
  - 修正 `useBattleFlow.ts` 遺漏的 `setStageId` 呼叫（goNextStage 推進時需更新關卡 ID）
  - BattleFlowDeps 型別修正：useState setter 改用 `Dispatch<SetStateAction<T>>`、addDamage/waitForAction 簽名對齊
  - tsc 零錯誤 + vite build 成功
- **GAS 部署**：無（純前端重構）

---
### [2026-03-02] App.tsx 方法拆分 Phase 2 — hooks + game module

- **觸發者**：使用者要求「App.tsx 方法也都拆出去到各自的 component」
- **執行角色**：🔧 CODING → 🏗️ ARCHITECT
- **變更摘要**：
  - App.tsx **2652 行 → 1293 行**（淨減 1359 行，減幅 51%）
  - 新增 `src/hooks/useCurtain.ts`（48 行）：過場幕狀態 + closeCurtain + resetCurtain
  - 新增 `src/hooks/useBattleHUD.ts`（63 行）：戰鬥 HUD 狀態（buffs/energy/toasts/hints）+ reset 方法
  - 新增 `src/hooks/useAnimationPromises.ts`（109 行）：動畫 Promise 系統 + 傷害彈窗 + 閃光
  - 新增 `src/hooks/useDragFormation.ts`（127 行）：拖曳陣型 + 英雄上下陣邏輯
  - 新增 `src/game/runBattleLoop.ts`（~750 行）：完整戰鬥迴圈（BattleLoopContext 50 欄位）
  - App.tsx：retryBattle/replayBattle/backToLobby/goNextStage 簡化為各 ~15 行（共用 resetBattleState）
  - App.tsx：runBattleLoop 本體替換為 `executeBattleLoop(buildBattleCtx())` 委託呼叫
  - App.tsx：拖曳邏輯替換為 `useDragFormation()` hook 呼叫
  - 清理 unused imports（ATTACK_DELAY_MS, BUFF_TYPE_SET, REPLAY_SCENE_SETTLE_MS 等）
  - tsc 零錯誤 + vite build 成功
- **GAS 部署**：無（純前端重構）

---
### [2026-03-02] App.tsx 結構化拆分

- **觸發者**：使用者要求「把 App.tsx 結構化 分資料夾分檔案 他現在太大包了」
- **執行角色**：🔧 CODING → 🏗️ ARCHITECT
- **變更摘要**：
  - App.tsx 3105 行 → 2651 行（淨減 454 行）
  - 新增 `src/game/constants.ts`：戰鬥時序常數、格子佈局、API 端點、waitFrames
  - 新增 `src/game/helpers.ts`：normalizeModelId、getHeroSpeed、clamp01、buildEnemySlotsFromStage、TargetStrategy type
  - 新增 `src/components/DragPlane.tsx`：R3F 拖曳平面元件
  - 新增 `src/components/MenuScreenRouter.tsx`：9 個主選單子畫面的路由元件
  - 新增 `src/components/VictoryPanel.tsx`：勝負標語 + 獎勵面板
  - 新增 `src/components/GameOverButtons.tsx`：GAMEOVER 按鈕群組
  - 新增 `src/components/BattleStatsPanel.tsx`：戰鬥統計面板
  - 新增 `src/components/BattleSpeedControls.tsx`：倍速 + 跳過按鈕
  - `saveService.ts`：匯出 `DailyCheckinResult` interface
  - App.tsx：移除 inline 常數/工具函式/DragPlane/選單子畫面/勝負標語/統計面板/倍速按鈕 JSX，改用 import
  - .ai/specs/tech-architecture.md v1.7→v1.8
- **GAS 部署**：無（純前端重構）

---
### [2026-03-02] 移除帳號等級/經驗系統

- **觸發者**：使用者觀察「帳號等級無實質功能，所有解鎖以通關進度驅動」
- **執行角色**：🔧 CODING
- **變更摘要**：
  - 移除 `SaveData.level` / `SaveData.exp` 欄位（前端型別 + GAS SAVE_HEADERS_）
  - 移除 MainMenu Lv 標籤 + EXP 進度條 + 相關 CSS 樣式
  - 移除 App.tsx 戰鬥結算帳號升等邏輯（expToNextLevel 迴圈 + leveledUp toast）
  - 移除勝利獎勵面板的經驗顯示行 + 競技場經驗 acquireToast
  - 移除 `updateProgress` 中的 `'level' | 'exp'` 欄位
  - GAS `handleCompleteBattle_`：移除 exp/level 寫入 + 升等迴圈，回傳不再含 newLevel/leveledUp
  - GAS `handleInitSave_`：初始值移除 level=1、exp=0；resourceTimerStage 欄位位移修正 (col 7→5)
  - `expToNextLevel` 函式保留（英雄升級仍需使用）
  - .ai/specs/save-system.md v1.7→v1.8
- **GAS 部署**：POST @104、GET @105

---
### [2026-03-02] Optimistic Queue v2 — Polling Retry + Operation Group + 全專案套用

- **觸發者**：使用者需求（合併樂觀更新機制 + 全專案掃描套用）
- **執行角色**：🔧 CODING

#### 核心升級（optimisticQueue.ts）
1. **Polling Retry Loop**：每 30 秒自動重送失敗操作，不再被動等下次登入
2. **Operation Group**：`fireOptimisticGroup()` — 原子批次操作 + onLocal 回傳 undo 做 rollback
3. **PendingOp** 新增 `retryCount`（最多 10 次）+ `groupId`（群組歸屬）
4. **`ensureRetryLoop()` / `stopRetryLoop()`**：自動管理輪詢生命週期
5. 登入後 reconcile → 失敗自動啟動 retry loop

#### 新轉換的操作（3 項 → 總計 25 項）
1. **`doDailyCheckin()`**：本地已知 7 天獎勵表 → 即時 +金幣/鑽石/道具 → 背景同步（修復簽到延遲問題）
2. **`sellItems()`**：本地已知售價 → 即時扣背包+加金幣 → 背景同步（從 async 改為 sync）
3. **`readMail()`**：fire-and-forget → 背景同步（從 async 改為 sync）

#### GAS 端
- `daily-checkin` + `sell-items` 加入 `executeWithIdempotency_()` 冪等保護
- Reconcile 支援 action 19→21 種（新增 `daily-checkin`、`sell-items`）

#### Spec 更新
- `.ai/specs/optimistic-queue.md` v1.1 → v2.0

---
### [2026-03-02] 每日簽到 + 寶箱開啟 + 背包裝備穿脫 + 新手引導

- **觸發者**：使用者需求（4 項新功能）
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN + 🎨 UI_DESIGN

#### 1. 每日簽到 (Daily Check-in)
1. **GAS `handleDailyCheckin_()`**：UTC+8 日期邏輯，7 天獎勵循環
2. **SaveData 新增欄位**：`checkinDay`（number, 1~7）、`checkinLastDate`（string, UTC+8 日期）
3. **`CheckinPanel.tsx`**：簽到面板元件，顯示 7 天獎勵 + 當日簽到按鈕
4. **`saveService.ts`**：新增 `doDailyCheckin()` 呼叫 GAS `daily-checkin` action
5. **MainMenu**：新增 `'checkin'` 選項按鈕
6. **MenuScreen 型別**：新增 `'checkin'`（9 值）

#### 2. 寶箱開啟邏輯 (Chest Opening)
1. **GAS `generateChestRewards_(chestId, qty)`**：bronze/silver/gold 三階寶箱獎勵生成
2. **GAS `handleUseItem_()`**：偵測 chest 類道具 → 呼叫 `generateChestRewards_()` → 分配貨幣/道具
3. **InventoryPanel**：寶箱使用後顯示開啟結果，`updateLocalCurrency()` 同步金幣/鑽石
4. **`ITEM_ICONS` / `ITEM_NAMES`**：新增 chest_bronze、chest_silver、chest_gold

#### 3. 背包裝/卸裝備 (Equip/Unequip from Inventory)
1. **InventoryPanel**：EquipmentDetail 新增 equip/unequip 按鈕
2. **英雄選擇 popup**：裝備時彈出英雄列表，顯示實際英雄名稱
3. **依賴服務**：`equipItem` / `unequipItem` / `getHeroEquipment`（progressionService）

#### 4. 新手引導 (Tutorial System)
1. **`TutorialOverlay.tsx`** + **`useTutorial()` hook**
2. **5 步引導**：Welcome → Start-battle → Victory-congrats → Explore → Complete
3. **localStorage 追蹤**：`globalganlan_tutorial_step`（步驟編號 / `done`）
4. **觸發條件**：首次造訪自動啟動、首次勝利推進、返回主選單推進

#### Spec 更新
- `.ai/specs/ui-flow.md` v1.4 → v1.5（CheckinPanel + TutorialOverlay + 背包裝備穿脫）
- `.ai/specs/inventory.md` v2.1 → v2.2（寶箱三階開啟 + 背包裝備穿脫）
- `.ai/specs/progression.md` v2.1 → v2.2（每日簽到系統 §八）
- `.ai/specs/save-system.md` v1.6 → v1.7（checkinDay / checkinLastDate 欄位 + daily-checkin API）

#### 驗證
- `npx tsc --noEmit` → 0 errors
- `npx vite build` → 成功
- GAS clasp push + deploy 完成

---
### [2026-03-02] QA 報告缺口修補 — exp 欄位 + CP HUD + toast 場景連接

- **觸發者**：使用者針對 QA 報告提出 4 個問題，要求補齊缺口
- **執行角色**：🧑‍💻 CODING_AGENT + 📋 SPEC_MAINTAINER

#### ArenaReward 新增 exp 欄位
1. `ArenaReward` interface 加入 `exp: number`
2. `getChallengeReward()`: 勝利 exp:150 / 敗北 exp:50
3. 全部 24 筆獎勵資料（RANK_MILESTONES×8 + DAILY_REWARD_TIERS×8 + SEASON_REWARD_TIERS×8）補上 exp
4. getDailyReward / getSeasonReward fallback 補上 exp
5. 單元測試 59 項全更新並通過

#### 主選單 CP HUD
1. `MainMenuProps` 新增 `combatPower?: number`
2. MainMenu header 資源列加入 ⚡戰力 顯示（橙色）
3. App.tsx `<MainMenu>` 傳入 `cpState.currentPower`
4. CSS `.menu-cp { color: #ffa94d; }`

#### 獲得物品動畫場景連接（5/8 → 7/8）
1. **競技場里程碑獎勵**：App.tsx 消費 `arenaRes.milestoneReward`，延遲 1.5s 顯示 acquireToast（含 exp）
2. **寶箱開啟**：InventoryPanel `handleUse` 解析 `result.result`，觸發 `emitAcquire()`
3. 競技場挑戰獎勵新增 exp 項目顯示

#### 驗證
- `npx tsc --noEmit` → 0 errors
- 113/113 相關單元測試通過
- `npx vite build` → 成功
- Specs 更新至 v0.5（arena-pvp, item-acquire-toast, combat-power）

---
### [2026-03-01] QA 自動化測試 + Spec 合規性審計

- **觸發者**：使用者要求「QA寫測試 自動化測試 然後要實際進遊戲玩玩看 看跟spec定義的有沒有出入」
- **執行角色**：🧪 QA_TESTING

#### 單元測試（Vitest）— 113 項全部通過
1. **combatPower.test.ts**：39 tests — 權重常數、技能加成、套裝加成、單英雄/隊伍/敵方 CP、對比等級邊界值
2. **arenaSystem.test.ts**：59 tests — NPC 生成、挑戰對象、排名交換、挑戰/里程碑/每日/賽季獎勵數值
3. **useAcquireToast.test.ts**：15 tests — AcquireItem 型別、acquireToastBus 事件匯流排

#### E2E 測試（Puppeteer）— 2 PASS / 7 WARN / 0 FAIL
1. **qa_gpu_e2e.mjs**：headless Chrome 測試（T1 戰力、T2 競技場、T3 獲得動畫）
2. **headless 限制**：無 WebGL → 3D 場景不渲染 → 多數 UI 偵測為 WARN
3. **T1.2 PASS**：IDLE 狀態 cp-comparison 對比條偵測成功
4. **T3.2a PASS**：商店介面文字偵測成功

#### Spec 差異發現 & 修正（v0.3 → v0.4）
1. **combat-power.md**：4 件套 CP 描述更明確（SET_2PC + SET_4PC = 280 疊加）
2. **arena-pvp.md**：NPC rank 1 數值從 10,500 更正為 10,480
3. **arena-pvp.md**：挑戰獎勵移除 exp 欄位（`ArenaReward` 型別無此欄位，標為擴展點）
4. **item-acquire-toast.md**：QA 通過確認，5/8 場景連接正常

#### QA 報告
- 完整報告：`.ai/memory/qa-report.md`
- 截圖：`.ai/qa_screenshots/e2e_*.png`

---
### [2026-06-15] 四大系統整合完成 — 戰力 HUD + 競技場戰鬥 + 獲得物品動畫全場景 + 裝備強化

- **觸發者**：使用者問「戰力系統 排行榜系統 物品獲得戰力提升動畫通知 裝備系統 都好了嗎」
- **執行角色**：🔧 CODING

#### 戰力系統（combat-power v0.3）
1. **App.tsx**: `useCombatPower()` hook 正式呼叫（傳入 formation/heroInstances/heroesList/enemySlots）
2. **CombatPowerComparison**: IDLE 狀態顯示我方 vs 敵方戰力對比條
3. **CombatPowerToast**: 戰力變動時顯示 ⚡+N↑ / ⚡-N↓ 飛行動畫

#### 競技場（arena-pvp v0.3）
1. **App.tsx onStartBattle**: 替換原本 toast-only → 完整戰鬥流程（startArenaChallenge → 建置敵方 SlotHero[] → stageMode='pvp' → IDLE → 戰鬥引擎）
2. **勝利/敗北報告**: GAMEOVER 分支呼叫 completeArenaChallenge(rank, won)
3. **勝利獎勵**: diamond/gold/pvpCoin acquireToast 動畫
4. **backToLobby**: pvp 模式戰後自動返回競技場畫面
5. **NPC 保底**: defender 無 heroes 時用 power 生成縮放 NPC 敵人

#### 獲得物品動畫（item-acquire-toast v0.3）
1. **acquireToastBus.ts**: 全域事件匯流排（registerAcquireHandler + emitAcquire）
2. **GachaScreen**: 抽卡結果 → emitAcquire（英雄 + 重複轉換星塵/碎片）
3. **ShopPanel**: 購買完成 → emitAcquire（購買獎勵）
4. **MailboxPanel**: 信件領取 → acquireToast.show（鑽石/金幣/道具）
5. **ArenaPanel**: 競技場勝利 → acquireToast.show（diamond/gold/pvpCoin）
6. **戰鬥勝利**: 原有整合保留

#### 裝備系統
- 強化 Modal 已有 before → after 主屬性預覽（currentMain → nextMain）
- 費用 / 最大等級 / 不足警告 完整

---
### [2026-06-15] 裝備系統 v2 接通 — 裝備數值正式影響戰鬥與戰力

- **觸發者**：使用者問「裝備系統有改好了嗎」→ 發現 equipment:[] 嚴重 bug
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN

#### 關鍵修復

1. **App.tsx**: `equipment: []` → `getHeroEquipment(inst.instanceId)` — 裝備數值正式影響戰鬥
2. **useCombatPower.ts**: 同上修復 + heroKey 加入裝備 hash，換裝即時反映戰力變化
3. **progressionSystem.ts**:
   - `enhancedMainStat` 依稀有度差異化: N:6%/lv, R:8%, SR:10%, SSR:12%
   - `getEnhanceCost` 基礎費用調升: N:200, R:500, SR:1000, SSR:2000
   - `EQUIPMENT_SETS` 新增 8 套 4pc 效果（狂戰士→暴傷20%, 鐵壁→HP15% 等）
   - `getActiveSetBonuses` 改為同 setId + 同 rarity 才計件
   - `getFinalStats` 步驟 2-3 防護 subStats nullable
4. **inventoryService.ts**: 新增 `enhanceEquipment()` — 樂觀更新 + GAS 同步
5. **HeroListPanel.tsx**: 新增 ⚒️ 強化按鈕 + 強化 Modal（費用顯示、等級預覽、金幣不足提示）
6. **GAS handleEnhanceEquipment_**: 移除素材消耗，改為僅扣金幣 + v2 成長率計算
7. **InventoryPanel.tsx**: 移除 `equipment_material` / `forge_material` / `equipment` 三個廢棄分頁

#### Spec 更新
- `.ai/specs/progression.md` v2.0 → v2.1

---
### [2026-03-02] Buff/Debuff Icon 改用 Html DOM overlay — 原生彩色 emoji

- **觸發者**：使用者提議「用 html 原生 emoji 就好」
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN

#### 重構

1. **`STATUS_ICONS_3D`**：中文短代號（攻↑/防↓/燒/毒/暈）→ 原生 emoji（⚔️/🛡️/🔥/☠️/💫），與 BattleHUD 的 `STATUS_ICONS` 統一
2. **`BuffIcons3D`**：troika `<Billboard>` + `<Text>` → `<Html center distanceFactor={8}>`
   - 每個 icon 用 CSS flex 排列的 DOM 元素，底框用 `background` + `borderRadius`
   - emoji 由瀏覽器原生渲染（彩色、跨平台一致）
   - 溢出 `+N` 卡片維持灰底白字
3. **`BuffApplyToast3D`**：troika `<Billboard>` + `<Text>` → `<Html center distanceFactor={8}>`
   - emoji + 中文 label（如「🔥 灼燒」）用 DOM 渲染
   - 淡出動畫改用 `useFrame` 直接操作 `ref.current.style.opacity`（無 re-render）
   - `fontFamily: 'Noto Sans SC', sans-serif`
- **Spec 更新**：`.ai/specs/buff-debuff-icons.md` v1.1 → v1.2

---
### [2026-03-01] pendingRetreats 等待擴展 + DOT UI 修復

- **觸發者**：使用者回報「上一位英雄還沒行動完，下一位的被動文字就出現」+「白面鬼灰燒傷害無 UI 顯示」
- **執行角色**：🔧 CODING

#### 修正

1. **pendingRetreats 等待擴展**：從只限 `NORMAL_ATTACK | SKILL_CAST` 前 await，擴展到所有非 `TURN_START/TURN_END/BATTLE_END` 的 action 都會先等待前一位英雄的後退動畫完成
   - 修復被動文字提前顯示
   - 修復 DOT 傷害數字被前一位動畫過渡蓋過
2. **Validator DEATH 降級**：DOT/被動致死後引擎仍發 DEATH action，表現層因 `actorState===DEAD` 跳過，非真正錯誤 → error 降為 warn
- **Spec 更新**：`.ai/specs/core-combat.md` v3.5 → v3.6

---
### [2026-03-01] Dead-Actor Guard 修正 — 移除 `currentHP <= 0` 判斷

- **觸發者**：使用者回報「我方無名活屍還有血條站在那，別的英雄被打死就跟著一起消失」
- **執行角色**：🔧 CODING

#### 根因

`applyHpFromAction()` 在 `onAction()` **之前**執行，對擊殺 action 的目標 HP 已被扣為 0。
NORMAL_ATTACK / SKILL_CAST 的 dead-actor guard 原本使用 `actorStatesRef === 'DEAD' || currentHP <= 0`，
導致**當前 action** 的擊殺目標誤觸 early-exit → 跳過死亡動畫 + HP 條不同步。

#### 修正

- **3 處 guard 移除 `|| currentHP <= 0`**（僅保留 `actorStatesRef === 'DEAD'`）：
  - NORMAL_ATTACK 攻擊者 guard（L1488）
  - NORMAL_ATTACK 目標 guard（L1493）
  - SKILL_CAST 攻擊者 guard（L1582）
- **安全性**：`playHitOrDeath()` 中 `setActorState('DEAD')` 是同步呼叫，backgroundAnims 的後續 action 可正確偵測
- **Spec 更新**：`.ai/specs/core-combat.md` v3.4 → v3.5

---
### [2026-03-01] Buff/Debuff Icon 改良 — 中文短代號 + 溢出處理

- **觸發者**：使用者提問（>8 個怎麼辦 + emoji 不顯示）
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN

#### 修復 & 改良

**1. Emoji → 中文短代號**：
- `STATUS_ICONS_3D` 映射表全面改為中文短代號（攻↑/防↓/毒/焚/暈 等）
- 原因：troika-three-text 使用 NotoSansSC.ttf 字型，不含 emoji glyph → 顯示方塊/空白
- `BuffApplyToast3D` 的 emoji 前綴同步改為中文短代號
- icon fontSize 從 0.16 調整為 0.11（中文兩字寬度需小一點才不溢出底框）
- 2D HUD（`BattleHUD.tsx`）仍用 emoji（HTML 原生渲染無問題）

**2. 超過 8 個 Buff/Debuff 溢出處理**：
- 原：`effects.slice(0, 8)` 直接截斷，多出不顯示
- 改：超過 8 個時顯示前 7 個 + 灰色 `+N` 溢出卡片（`#6b7280`, 70% 透明）

#### 影響檔案
- `src/components/SceneWidgets.tsx`：STATUS_ICONS_3D + BuffIcons3D + BuffApplyToast3D
- `.ai/specs/buff-debuff-icons.md`：v1.0 → v1.1
- `.ai/specs/buff-apply-toast.md`：v1.0 → v1.1

---
### [2026-03-02] 屬性提示修復 + DOT/被動致死動畫修復

- **觸發者**：使用者回報 bug（屬性剋制/抵抗文字消失 + DOT 致死無死亡動畫）
- **執行角色**：🔧 CODING + 🐛 QA_TESTING

#### Bug 修復

**1. 屬性相剋提示修復**：
- NORMAL_ATTACK 的 `elementHint` 新增 `setTimeout(2000)` 自動清理（先前無 cleanup 導致累積）
- SKILL_CAST handler 新增屬性相剋指示（取第一個非閃避傷害目標的 `elementMult`）
- 修復技能攻擊時不顯示「屬性剋制！」/「屬性抵抗」的問題

**2. DOT/被動傷害致死動畫修復**：
- DOT_TICK handler：若 `hero.currentHP <= 0`，直接播放死亡動畫（音效 + `waitForAction('DEAD')` + `removeSlot`）
- PASSIVE_DAMAGE handler：同上，被動傷害致死也直接播放死亡動畫
- 後續 DEATH action 因 `actorStatesRef === 'DEAD'` 自動跳過（防重複）

#### 影響檔案
- `src/App.tsx`：NORMAL_ATTACK / SKILL_CAST / DOT_TICK / PASSIVE_DAMAGE handler
- `.ai/specs/core-combat.md`：v3.3 → v3.4

---
### [2026-03-01] Buff/Debuff 3D 圖示 + 施加漂浮文字

- **觸發者**：使用者需求（戰鬥中顯示 Buff/Debuff 狀態）
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN + 🎨 UI_DESIGN

#### 新增功能

**1. Buff/Debuff 3D Icon 列（`src/components/SceneWidgets.tsx` — `BuffIcons3D`）**：
- 英雄模型上方（Y=3.2）顯示當前身上的 Buff/Debuff 圖示列
- Buff：綠色底框（`#22c55e`），Debuff：紅色底框（`#ef4444`）
- 可疊層效果顯示 `×N` 層數數字（stacks > 1 時）
- 最多顯示 8 個 icon，用 `Billboard` + `Text` + 矩形底框
- Emoji icon 複用 BattleHUD.tsx `STATUS_ICONS` 映射表

**2. Buff/Debuff 施加漂浮文字（`src/components/SceneWidgets.tsx` — `BuffApplyToast3D`）**：
- BUFF_APPLY action 觸發時在被施加者頭頂顯示漂浮文字
- 格式：`{emoji} {中文狀態名}`（如 `🔥 灼燒`、`⚔️ 攻擊提升`）
- Buff 綠色文字（`#4ade80`），Debuff 紅色文字（`#f87171`）
- 行為：微彈進場 → 前 0.3s 不透明 → 上浮淡出 → 2s 後自動清除
- 完整中文狀態名映射（25 種 StatusType → 中文名稱）

**3. 整合修改**：
- `Hero.tsx`：新增 `battleBuffs`、`buffApplyHints` props，渲染 `BuffIcons3D` + `BuffApplyToast3D`
- `BattleHUD.tsx`：新增 `BuffApplyHint` 介面
- `App.tsx`：新增 `buffApplyHints` state + `buffApplyHintIdRef`，BUFF_APPLY handler 增加漂浮文字觸發，7 處重置點同步 `setBuffApplyHints([])`

#### 新增 Spec
- `.ai/specs/buff-debuff-icons.md` v1.0 — 3D 狀態圖示規格
- `.ai/specs/buff-apply-toast.md` v1.0 — 施加漂浮文字規格

---
### [2026-03-02] Phase B 死亡角色守衛 + 致死跳過 HURT + PWA 自動更新 + UI 優化

- **觸發者**：使用者回報多項問題
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN + 🌵 SOUND_MUSIC

#### 修正內容

**1. Phase B 死亡角色守衛（`src/App.tsx`）**：
- 問題：DOT/反彈致死後，後續英雄仍衝向已死角色的空位置播放前進→攻擊動畫
- 根因：Phase A 引擎正確過濾死亡目標，但 Phase B 動畫層 `onAction` 未檢查 `actorStatesRef`
- 解法：NORMAL_ATTACK、SKILL_CAST、DEATH handler 開頭新增 dead-actor guard（檢查 `actorStatesRef` + `currentHP`）

**2. 致死傷害跳過 HURT（`src/App.tsx`）**：
- 普攻/技能/反彈致死時不再播 HURT 動畫，直接進入 DEAD 分支（三處統一）

**3. KOF98 大招音效（`src/services/audioService.ts`）**：
- `skill_cast` SFX 從 3 層重設計為 6 層 KOF98 Super Flash 風格

**4. 未解鎖技能預覽（`src/components/HeroListPanel.tsx` + `src/App.css`）**：
- 英雄列表對未解鎖被動顯示完整技能資訊（icon/名稱/描述）+ 灰色 🔒 ★N 解鎖徽章

**5. 全域字型放大（`src/index.css`）**：
- html root font-size: 18px（12.5% 增大）

**6. PWA 自動更新（`public/sw.js` + `src/main.tsx`）**：
- SW v3：JS/CSS 改 Network First（防止強制快取），GLB/圖片仍 Cache First
- 新增更新偵測 + 橙色提示框 + auto-reload

**7. ADR-008（`.ai/memory/decisions.md`）**：
- 強制全專案 grep 描換規則 — 每次修改必須先搜索同模式之所有出現處

#### 影響 Spec
- `.ai/specs/core-combat.md` v3.2 → v3.3
- `.ai/specs/audio.md` v0.4（已更新）
- `.ai/specs/ui-flow.md` v1.3（已更新）

---
### [2026-03-02] 第一回合死亡 Bug 修復 + PWA Safe Area + SFX 重設計

- **觸發者**：使用者回報 4 項問題
- **執行角色**：🔧 CODING + 🎵 SOUND_MUSIC + 🎨 UI_DESIGN

#### 修正內容

**1. Phase B HP 狀態 Bug（`src/App.tsx`）**：
- `runBattleCollect()` Phase A 完成後，engine 會 mutate heroMap BattleHero 到最終狀態（死亡英雄 currentHP=0）
- 先前 `needsHpSync = false`→ Phase B 回放時 retreat handler 讀取 `heroMap.get(uid).currentHP` 已為 0 → 英雄第一回合即判定死亡
- 修正：Phase A 後重置所有 BattleHero `currentHP = maxHP`、`energy = 0`，設 `needsHpSync = true`，讓 `applyHpFromAction()` 逐步更新

**2. PWA Safe Area 適配（`src/App.css`）**：
- `.main-menu-overlay`：新增 `padding-top: max(Npx, env(safe-area-inset-top, 0px))`
- `.panel-overlay`：新增 `padding-top: max(Npx, env(safe-area-inset-top, 0px))`
- `.login-screen`：新增 `padding-top: env(safe-area-inset-top, 0px)`
- 補充既有 `.game-hud` safe-area padding，確保 iOS PWA 劉海/動態島不遮蔽 UI

**3. SFX 殭屍主題重設計（`src/services/audioService.ts`）**：
- `hit_normal`：2 層→3 層合成（sawtooth 65Hz + square 120Hz + sawtooth 320Hz + low-pass 濾波），模擬腐肉撞擊
- `hit_critical`：3 層→4 層合成（深沉濕裂聲 + 地面震動）
- `death`：2 層→4 層合成（sawtooth 45Hz + square 90Hz + sawtooth 70Hz + sine 30Hz），模擬殭屍倒地

#### 影響 Spec
- `.ai/specs/core-combat.md` v3.1 → v3.2
- `.ai/specs/audio.md` v0.3 → v0.4
- `.ai/specs/ui-flow.md` v1.2 → v1.3

---
### [2026-03-01] 伺服器端獎勵計算 + save-progress 敏感欄位封鎖

- **觸發者**：安全性審計 — 發現前端可直接竄改 gold/diamond/exp/level 透過 save-progress
- **執行角色**：🔧 CODING + 🛡️ SECURITY

#### 漏洞描述
- `save-progress` 的 `allowedFields` 包含 `gold, diamond, exp, level, storyProgress, towerFloor`
- 前端結算時自行計算獎勵 → 直接寫入伺服器 → 攻擊者可偽造任意值
- `completeStage / completeTower / completeDaily` 的 GAS handler 存在但從未被前端呼叫

#### 修正內容

**GAS `handleCompleteBattle_`（新增）**：
- 統一戰鬥結算入口，涵蓋 story / tower / daily / pvp / boss 五種模式
- 整合反作弊校驗：用相同 seed 重跑戰鬥 → 比對 winner
- 伺服器端計算獎勵（gold / exp / diamond）→ 寫入 save_data
- 伺服器端處理升等（expToNextLevel_）
- 驗證進度（tower 只能打 currentFloor + 1）
- 不一致時記錄 ANTICHEAT_LOG

**GAS `handleSaveProgress_`（封鎖）**：
- `allowedFields` 移除 `gold, diamond, exp, level, storyProgress, towerFloor`
- 只保留 `displayName, resourceTimerStage, resourceTimerLastCollect, formation`
- 敏感欄位只能透過 `complete-battle / shop-buy / gacha-pull` 等受驗證操作修改

**前端 `progressionService.ts`（新增）**：
- `completeBattle()` 函式 — 透過 `fireOptimisticAsync` 呼叫 GAS `complete-battle`
- 包含完整型別定義 `CompleteBattleParams` / `CompleteBattleResult`

**前端 `App.tsx`（重構結算流程）**：
- Phase A：計算完成後立即背景呼叫 `completeBattle()`（含 seed + hero 快照）
- 結算前：await `completeBattle` 結果 → 使用伺服器判定的 winner
- 本地獎勵計算保留作為 UI 即時顯示 + localStorage 快取
- 伺服器為最終權威（gold/diamond/exp/level 已寫入 save_data）

#### GAS 部署
- POST endpoint @82、GET endpoint @83
- `complete-battle` action 加入 `doPost` switch-case + reconcile switch

---
### [2026-03-01] 反作弊校驗系統（Seeded PRNG + 背景驗證）

- **觸發者**：安全性強化 — 防止前端引擎被竄改偽造勝利
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN

#### 核心機制
- **Seeded PRNG（Mulberry32）**：`src/domain/seededRng.ts` — 前端與 GAS 共用同一演算法
  - `createSeededRng(seed)` → 回傳確定性 `[0,1)` 浮點數
  - `generateBattleSeed()` → 產生 32-bit 隨機種子
- **前端 `runBattleCollect()`**：新增 `seed` 參數，戰鬥期間暫時覆蓋 `Math.random`
- **GAS `handleVerifyBattle_`**：新 POST action `verify-battle`
  - 接收 `{players, enemies, seed, localWinner, maxTurns}`
  - 以相同 seed 重跑戰鬥 → 比對 winner
  - 不一致時記錄到 `ANTICHEAT_LOG`（ScriptProperties，保留最近 100 筆）
- **`antiCheatService.ts`**：`startBattleVerification()` fire-and-forget
  - Phase A 計算完成後立即發射（不阻塞動畫播放）
  - 內建 15 秒超時 + AbortController 取消機制
  - 網路失敗 / 超時 → 靜默通過（不影響正常遊戲體驗）

#### 遊戲流程整合（App.tsx）
- Phase A：`generateBattleSeed()` → 深拷貝 BattleHero 快照 → `runBattleCollect({seed})` → `startBattleVerification()`
- Phase B：動畫照常播放（背景校驗同步進行）
- 結算前：`await antiCheatRef.current.promise` → 如不一致 → 覆寫 winner + toast 警告

#### GAS 部署
- POST endpoint @80、GET endpoint @81
- `verify-battle` action 加入 `doPost` switch-case

#### 規格更新
- `.ai/specs/core-combat.md` → v2.8

---
### [2026-03-01] 帳號綁定獎勵 + PWA 支援 + 安裝獎勵

- **觸發者**：鼓勵綁定帳號 + 導入 PWA 鼓勵加入主畫面
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN

#### 帳號綁定獎勵
- **GAS `handleBindAccount_`**：首次綁定（`wasBound === false`）自動寄送獎勵信件
  - 💎200 + 🪙5,000
  - 二次綁定（改 email）不重複發送
- **SettingsPanel**：綁定區塊新增獎勵預覽（🎁 綁定獎勵：💎 200 + 🪙 5,000）
- **綁定成功後自動刷新信箱**

#### PWA 基礎設施
- **`public/manifest.json`**：name/short_name/icons/start_url/scope/display:standalone/theme_color
- **`public/sw.js`**：Service Worker（靜態資源 Cache First + 頁面 Network First + 排除 GAS API）
- **`public/icons/`**：icon-192.png, icon-512.png, apple-touch-icon.png（從 zombie_1 thumbnail 生成）
- **`index.html`**：manifest link + theme-color + apple-mobile-web-app meta tags
- **`src/main.tsx`**：SW 註冊

#### PWA 安裝獎勵
- **`src/services/pwaService.ts`**：新增服務
  - `detectPlatform()` — Android/iOS/Desktop 偵測
  - `isStandalone()` — PWA 模式偵測（含 iOS `navigator.standalone`）
  - `beforeinstallprompt` 事件管理 + `triggerInstall()`
  - `claimPwaReward()` — 呼叫 GAS API
  - `getInstallInstructions()` — 平台特定安裝指引
  - `getPwaBenefits()` — PWA 好處清單
- **GAS `handleClaimPwaReward_`**：新 action `claim-pwa-reward`
  - 檢查 `save_data.pwaRewardClaimed` 欄位
  - 首次：標記 + 寄送 💎100 + 🪙3,000 獎勵信件
  - 重複呼叫：回傳 `already_claimed`
- **`save_data` 新增欄位**：`pwaRewardClaimed`（boolean）
- **App.tsx**：standalone 模式自動偵測 + 自動領取 PWA 獎勵

#### UI 整合
- **SettingsPanel**「📱 加入主畫面」區塊：
  - PWA 好處清單（快取/一鍵啟動/穩定性/獎勵）
  - Android/Desktop：「📲 安裝全球感染」按鈕（觸發原生 prompt）
  - iOS：Safari 分享→加入主畫面步驟說明
  - 已安裝：✅ 已安裝為 App
- **CSS**：`.settings-reward-preview`（漸層金色閃爍）+ `.settings-pwa-*`（好處/步驟）

#### Spec 更新
- `.ai/specs/auth-system.md` v1.2→v1.3（綁定獎勵）
- `.ai/specs/save-system.md` v1.2→v1.3（pwaRewardClaimed 欄位）
- `.ai/specs/tech-architecture.md` v1.5→v1.6（PWA 已實作）

#### 測試結果
- `npx tsc --noEmit` ✅ 零錯誤
- `npx vite build` ✅ 編譯成功
- `npx vitest run` ✅ 594/594 測試通過
- GAS deploy ✅ POST @70, GET @71

---
### [2026-03-01] extra_turn 額外行動機制實作 + on_ally_death / on_ally_skill 觸發點

- **觸發者**：技能系統擴展需求
- **執行角色**：🔧 CODING + 🧪 QA
- **battleEngine.ts**：
  1. **`_extraTurnQueue` 佇列** — 新增至 `BattleEngineConfig`（可選內部欄位）
  2. **`processExtraTurns()` 函式** — 從佇列取出英雄 UID 執行額外行動；每回合每位英雄最多 1 次（防無限連鎖）；跳過 DOT/Regen/turn_start 結算；控制效果仍然生效；安全上限 MAX_EXTRA=10
  3. **`executePassiveEffect` case `'extra_turn'`** — 推入 `cfg._extraTurnQueue`
  4. **主迴圈** — 每位角色行動後呼叫 `processExtraTurns()`
- **新增觸發點**：
  - `on_ally_death` — 隊友死亡時觸發（普攻和技能擊殺都會觸發）
  - `on_ally_skill` — 隊友施放主動技能時觸發（施放者自己不觸發）
- **型別更新**（`types.ts`）：
  - `PassiveTrigger` 新增 `'on_ally_death'` | `'on_ally_skill'`
  - `BattleAction` 新增 `{ type: 'EXTRA_TURN'; heroUid: string; reason: string }`
- **表現層**（`App.tsx`）：`onAction` switch 新增 `case 'EXTRA_TURN'` 處理
- **測試**：5 項新增（47→594 全通過）
  - PAS_11_3 安可（on_kill → extra_turn）— 擊殺後再行動一次
  - extra_turn 每回合最多 1 次（防無限連鎖）
  - on_ally_death 觸發被動
  - on_ally_skill 觸發被動
  - extra_turn 被控制時跳過
- **適用技能**：PAS_11_3 安可（on_kill → extra_turn）已有 JSON 定義
- **Spec 更新**：`.ai/specs/skill-system.md` v1.2→v1.3

---
### [2026-03-01] 被動技能系統 6 項 Bug 修復 + 42 項整合測試

- **觸發者**：QA 測試發現被動技能大量失效
- **執行角色**：🔧 CODING + 🧪 QA
- **battleEngine.ts 修復**：
  1. **`always` 被動觸發修復** — 戰鬥開始時 `always` 觸發類型的被動技現在會正確觸發（之前只有 `battle_start` 會觸發）
  2. **`every_n_turns` 被動觸發修復** — 新增明確的每 N 回合被動觸發邏輯
  3. **多目標被動修復** — 新增 `resolvePassiveTargets()` 函式，根據被動技的 `target` 欄位（`all_allies`/`all_enemies`/`self`）正確選擇目標。之前所有 buff 只作用於自己，所有 debuff 只作用於單一目標或自己
  4. **`on_dodge` 反擊目標修復** — 修復閃避反擊的 context.target 指向：反擊應該打攻擊者而非閃避者
  5. **`dispel_debuff` 處理修復** — 被動效果中新增 `dispel_debuff` 處理（之前只有技能效果中有）
  6. **`reflect` 效果類型修復** — 被動效果中新增 `reflect` 狀態施加處理
- **JSON 修正**（`skill_data_zh.json`）：
  - PAS_3_1 厚皮: `damage_reduce` → `dmg_reduce`
  - PAS_3_4 鐵壁: `damage_reduce` → `dmg_reduce`
  - PAS_4_2 殺意: `crit_up` → `crit_rate_up`
  - PAS_12_1 壕溝戰術: `damage_reduce` → `dmg_reduce`
  - PAS_12_4 要塞化: `damage_reduce` → `dmg_reduce`
- **影響範圍**：~15+ 個被動技能從完全無效變為正確運作；所有光環類被動（target: `all_allies`/`all_enemies`）現在能正確影響全隊/全敵
- **測試**：新增 42 項整合測試（`battleEffectsIntegration.test.ts`），總測試數 589 全通過
- **Spec 更新**：`.ai/specs/skill-system.md` v1.1→v1.2

---
### [2026-06-14] 技能與成長系統全面平衡重設計

- **觸發者**：使用者 4 項平衡原則要求
- **執行角色**：🎯 GAME_DESIGN + 🔧 CODING
- **設計原則**：
  1. 主動技能作用單位越多 → 係數越低
  2. 英雄稀有度越高 → 成長係數越高
  3. 稀有度越高 → 被動技能越 OP
  4. 低稀有度英雄 → 光環被動技（加全隊/削敵方）
- **成長系統修改**（`src/domain/progressionSystem.ts`）：
  - 新增 `RARITY_LEVEL_GROWTH`: ★1=3%/lv, ★2=3.5%, ★3=4%(不變), ★4=5%
  - 新增 `RARITY_ASC_MULT`: 突破乘數依稀有度差異化（★4 最高 ×1.42）
  - 新增 `RARITY_STAR_MULT`: 星級乘數依稀有度差異化（★4 最高 ×1.42）
  - `getStatAtLevel` / `getAscensionMultiplier` / `getStarMultiplier` / `getFinalStats` 新增可選 rarity 參數
- **主動技能倍率調整**（`.ai/scripts/skill_data_zh.json` → Google Sheets）：
  - single_enemy: 280% → 350%（+25%）
  - back_row: 250% → 220%（-12%）
  - front_row: 220% → 180%（-18%）
  - random_3: 120%×3 → 140%×3（+17%）
  - all_enemies: 180% → 120%（-33%）
  - single_ally heal: 300% → 350%（+17%）
  - all_allies heal: 25% → 20%（-20%）
- **被動技能重設計**：
  - ★4（#3,#4,#10,#12,#13）：數值全面提升（+20~55%）
  - ★3（#2,#5,#7,#8,#11）：保持原設計
  - ★2（#1,#9,#14）：新增光環被動（全隊 SPD/DEF +5~8%）
  - ★1（#6 無名活屍）：全面改為光環型（群聚嘶吼/腐臭領域/群聚本能/求生號令）
- **其他修改**：
  - `battleEngine.ts`：`createBattleHero` 新增 rarity 參數
  - `App.tsx`：傳遞英雄稀有度至戰鬥系統
  - `HeroListPanel.tsx`：數值顯示使用稀有度
  - `rebuild_skill_sheet.mjs`：修正 verify action (`read` → `readSheet`)
- **測試**：537→547 (新增 10 個稀有度成長測試)
- **規格更新**：`.ai/specs/progression.md` v1.2→v1.3, `.ai/specs/skill-system.md` v1.0→v1.1

---
### [2026-03-01] 主線 1-1 難度平衡修正

- **觸發者**：使用者回報（新玩家 3 隻 Lv1 初始英雄打不贏 1-1）
- **執行角色**：🎯 GAME_DESIGN + 🔧 CODING
- **根本原因**：
  1. 敵方倍率 ×1.0 起始 — 等於與初始英雄同戰力，但敵方多（2-4 隻）
  2. 敵方從全 14 隻殭屍池抽選 — 可能出 4 星高攻角色（屠宰者 ATK=60）
  3. `maxCount = minCount + 2` — 1-1 最多出 4 隻敵人，壓倒性數量劣勢
- **修正**（`src/domain/stageSystem.ts`）：
  - HP 倍率起始 0.5（原 1.0）→ 1-1 敵人 HP 只有一半
  - ATK 倍率起始 0.4（原 1.0）→ 1-1 敵人攻擊力僅四成
  - 早期敵方數量公式改緩：1-1~1-4 固定 2 隻，1-5 開始 3 隻
  - 章節 1 專用弱殭屍池 `[1,5,6,7,9,11,14]`（排除 4 星力量型高攻角色）
  - 章節 2+ 恢復完整殭屍池
- **數值對比（1-1）**：修正前 hpMult=1.0/atkMult=1.0/2~4隻/全池 → 修正後 hpMult=0.5/atkMult=0.4/固定2隻/弱池
- **Spec 更新**：`.ai/specs/stage-system.md` v1.1→v1.2
- **測試**：`tsc --noEmit` 零錯誤、`vite build` 成功、537 測試全通過

---
### [2026-03-01] 修復 AudioContext 警告 + BGM 無法播放

- **觸發者**：使用者回報（console 13 次 "AudioContext was not allowed to start" 警告，BGM 完全沒有聲音）
- **執行角色**：🔧 CODING
- **根本原因**：
  1. `playSfx()` 每次呼叫都執行 `ensureContext()` → 在無使用者手勢時建立 `new AudioContext()` 導致大量警告
  2. `playBgm()` 在 `ctx` 存在但仍為 `suspended` 時不會 resume，振盪器排程後無聲音
  3. `ensureContext()` 只在 LoginScreen 的 `onEnterGame` 回呼中呼叫，其他使用者互動不觸發
- **修復**：
  - `playSfx()` 不再主動建立 AudioContext — 若 `ctx` 不存在或 suspended 直接 return
  - `playBgm()` 加入 `ctx.state === 'suspended'` 時自動 `resume()`
  - 新增**全域使用者手勢偵測**：constructor 中綁定 `click`/`touchstart`/`keydown`（capture phase），任何互動自動 `ensureContext()` + 播放暫存 BGM，啟動後自動解綁
- **測試**：`tsc --noEmit` 零錯誤、`vite build` 成功、537 測試全通過

---
### [2026-03-01] 錯誤訊息全面中文化

- **觸發者**：使用者回報（登入失敗顯示 key 如 `wrong_password` 而非中文訊息）
- **執行角色**：🔧 CODING
- **變更摘要**：
  - 新增 `src/utils/errorMessages.ts` — 集中管理 API 錯誤 key → 繁中對照表（`translateError()` 函式）
  - 涵蓋所有 GAS 回傳 key：`token_not_found`、`email_taken`、`wrong_password`、`account_not_bound` 等 25+ 組
  - 修改 `src/hooks/useAuth.ts`：所有 `setError()` 改用 `translateError()`
  - 修改 `src/hooks/useSave.ts`：loadSave 錯誤改用 `translateError()`
  - 修改 `src/components/SettingsPanel.tsx`：移除 local errMap，統一用 `translateError()`
  - 修改 `src/components/GachaScreen.tsx`：抽卡錯誤改用 `translateError()`
  - 修改 `src/components/MailboxPanel.tsx`：刪除錯誤 fallback 改用 `translateError()`
  - 已包含中文偵測：若訊息已是中文則直接顯示，避免二次翻譯
- **測試**：`tsc --noEmit` 零錯誤、`vite build` 成功、537 測試全通過

---
### [2026-03-01] 被動觸發浮動文字顯示

- **觸發者**：使用者需求（被動效果觸發時想看到像大招/屬性克制那樣的浮動文字）
- **執行角色**：🔧 CODING
- **變更摘要**：
  - 新增 `PassiveHint3D` 3D 浮動文字元件（`src/components/SceneWidgets.tsx`）— 紫色帶☕ 前綴，微彈動畫 + 上浮淡出
  - 新增 `PassiveHint` 型別定義（`src/components/BattleHUD.tsx`）
  - `src/components/Hero.tsx`：新增 `passiveHints` prop，在英雄頭頂 Y=4.5 位置渲染 `PassiveHint3D`
  - `src/App.tsx`：新增 `passiveHints` state + `passiveHintIdRef`，`PASSIVE_TRIGGER` case 推入浮動文字（2 秒後自動移除），所有重置點已同步清空
- **測試**：`tsc --noEmit` 零錯誤、492 測試全通過

---
### [2026-02-28] 修復 on_attack 被動 damage 效果造成雙倍傷害 — 新增 damage_mult 機制

- **觸發者**：使用者回報（無名活屍 zombie_6 HP=100 只受 32+34 傷害就死了）
- **執行角色**：🔧 CODING + 🧪 QA
- **根本原因**：`executePassiveEffect_` 的 `damage` 類效果在 `on_attack` 觸發時，會呼叫完整的 `calculateDamage_()` 對目標造成一次獨立的額外攻擊（不發射 action，前端看不到），等於每次攻擊實際造成 **雙倍傷害**。zombie_11 的「瘋狂演出」PAS_11_1 每次普攻都隱形打一次目標
- **設計意圖 vs 實際**：
  - 原意：「傷害在 ×0.5~×1.8 間隨機浮動」→ 應修改攻擊倍率
  - 實際：發射一次完整獨立攻擊（倍率 1.0）→ 每次攻擊造成 2× 傷害
- **修復**：
  1. **新增 `damage_mult` effect type**：在 `context.damageMult` 上乘算固定倍率（多被動可疊加）
  2. **新增 `damage_mult_random` effect type**：在 `context.damageMult` 上乘算 [min, max] 隨機倍率
  3. 在 `executeNormalAttack_` / `executeSkill_` 中，`triggerPassives_` 後將 `context.damageMult` 套用到 `calculateDamage_` 結果
  4. 原 `damage` effect type 保留給非 on_attack 觸發（如 on_dodge 反擊），並加上 `PASSIVE_DAMAGE` action 發射 + DEATH 檢查
  5. 更新 6 個被動技能效果類型：
     - PAS_2_3「力量爆發」→ `damage_mult`（×1.5, 15% 機率）
     - PAS_4_4「處決」→ `damage_mult`（×1.5）
     - PAS_11_1「瘋狂演出」→ `damage_mult_random`（0.5~1.8）
     - PAS_11_4「謝幕演出」→ `damage_mult_random`（0.8~2.5）
     - PAS_13_1「巨人踐踏」→ `damage_mult`（×1.5, 30% 機率）
     - PAS_13_4「災厄領主」→ `damage_mult`（×1.8, 45% 機率）
- **影響範圍**：
  - `src/domain/types.ts`（BattleContext + SkillEffect + BattleAction）
  - `src/domain/battleEngine.ts`（executePassiveEffect + executeNormalAttack + executeSkill）
  - `gas/battleEngine.js`（同上 GAS 版）
  - `src/App.tsx`（PASSIVE_DAMAGE handler + applyHpFromAction + battleStats）
  - `.ai/scripts/skill_data_zh.json` + `.ai/scripts/rebuild_skill_templates.ps1`
  - Google Sheet `skill_templates`（6 筆 effects 已更新）
- **GAS 部署**：POST @66、GET @67
- **測試結果**：tsc --noEmit 0 錯誤、21 test files / 492 tests 全部通過

---
### [2026-02-28] 修復死亡動畫視覺問題 — HURT→DEAD 序列 + GAS 被動傷害 DEATH 事件

- **觸發者**：使用者回報（血條還沒扣完就死掉了 / 最後存活的英雄被攻擊沒有播放受傷扣血與死亡動畫）
- **執行角色**：🔧 CODING + 🧪 QA
- **Bug #1 — 血條同時跳零**：`playHitOrDeath` killed 分支直接設定 `DEAD` + `syncHpToSlot(HP=0)`，HP 條與死亡動畫同時發生，視覺上看不到扣血
- **Bug #1 修復**：killed 分支改為 **HURT + syncHpToSlot → await hurtDone → DEAD + death SFX → await deadDone → removeSlot**，四個死亡路徑全部統一：
  1. `playHitOrDeath` killed 分支
  2. `DEATH` action handler
  3. `NORMAL_ATTACK` 反彈致死分支
  4. `SKILL_CAST` 反彈致死分支
- **Bug #2 — turn_end 被動傷害無 DEATH 事件**：GAS `executePassiveEffect_` 的 `damage` 類被動在 `turn_end` 觸發時可直接扣血致死，但不會發射任何 action（無 DOT_TICK 也無 DEATH）→ 前端無法播放死亡動畫 → 英雄直接消失
- **Bug #2 修復**：在 `gas/battleEngine.js` turn_end buff 持續時間迴圈中，`triggerPassives_` 執行前記錄 `hpBeforePassive`，執行後若 HP 從 >0 降至 ≤0 則 `emit({ type: 'DEATH', targetUid })`
- **影響範圍**：`src/App.tsx`（playHitOrDeath + DEATH handler + NORMAL_ATTACK + SKILL_CAST）、`gas/battleEngine.js`（turn_end 被動迴圈）
- **GAS 部署**：POST @64、GET @65
- **測試結果**：tsc --noEmit 0 錯誤、21 test files / 492 tests 全部通過

---
### [2026-02-28] 修復遠端戰鬥動畫卡住 — for-of 無限迴圈 + HP 未同步

- **觸發者**：使用者回報（戰鬥過程動畫卡住 + waitForAction/waitForMove timeout）
- **執行角色**：🔧 CODING + 🧪 QA
- **根本原因（主要）**：`battleActionsRef.current = allActions` 與 `for (const act of allActions)` 共用同一陣列參考，而 `onAction` 內部 `battleActionsRef.current.push(action)` 不斷把 action 推回同一陣列 → `for...of` 迭代器讀 `length` 發現陣列持續增長 → **無限迴圈**（已死亡的英雄被再次攻擊 → Hero 已卸載 → 動畫回呼永不觸發 → 5 秒 timeout）
- **根本原因（次要）**：`applyHpFromAction` 只在 `isReplay` 時執行，遠端戰鬥未同步 heroMap HP
- **修復內容**：
  1. 移除 for 迴圈前的 `battleActionsRef.current = allActions`（消除共用參考）
  2. 移除 `onAction` 內的 `battleActionsRef.current.push(action)`（action 已由 allActions 完整持有）
  3. 在 for 迴圈結束後指派 `if (!isReplay) battleActionsRef.current = allActions`（供回放/統計）
  4. 新增 `needsHpSync` 旗標：遠端/回放 = true、本地 = false
  5. NORMAL_ATTACK / SKILL_CAST 存活分支加入反彈傷害 HP 條同步
- **影響範圍**：`src/App.tsx`（Phase A/B + onAction）、`src/components/ZombieModel.tsx`（移除除錯日誌）
- **測試結果**：tsc --noEmit 0 錯誤、vite build 成功、21 test files / 492 tests 全部通過

---
### [2026-02-28] 全功能自動化測試擴充 — 224→492 測試

- **觸發者**：使用者需求（所有功能都要寫自動化測試，尤其戰鬥流程）
- **執行角色**：🔧 CODING + 🧪 QA
- **目標**：大幅提升測試覆蓋率，從 224 個測試擴充到 492 個（+268 個新測試）
- **新增測試檔案**：
  - `src/domain/__tests__/battleEngineAdvanced.test.ts` — 39 tests（runBattleCollect、技能施放、被動觸發、中斷大招、DOT/Buff、大型模擬、createBattleHero）
  - `src/domain/__tests__/buffSystemAdvanced.test.ts` — 33 tests（免疫、永久效果、控制效果交互、多重DOT、護盾吸收、getBuffedStats、淨化）
  - `src/domain/__tests__/damageFormulaAdvanced.test.ts` — 18 tests（技能倍率、暴擊、閃避上限、反彈、DOT計算、恐懼加傷、減傷）
  - `src/domain/__tests__/targetStrategyAdvanced.test.ts` — 19 tests（random_enemies_N、前後排、鄰近、嘲諷、友方目標）
  - `src/domain/__tests__/stageSystemAdvanced.test.ts` — 47 tests（關卡配置、每日副本、Boss系統、PvP對手、星級評價）
  - `src/domain/__tests__/gachaSystemAdvanced.test.ts` — 17 tests（軟硬保底、featured 50/50、池子耗盡、十連保底）
  - `src/domain/__tests__/progressionSystemAdvanced.test.ts` — 34 tests（套裝激活、getFinalStats 組合、百分比副屬、經驗消耗邊界）
  - `src/services/__tests__/battleService.test.ts` — 15 tests（遠端 API 成功/錯誤、序列化邊界）
  - `src/services/__tests__/saveServiceAdvanced.test.ts` — 12 tests（getTimerYield、getAccumulatedResources 純函式）
  - `src/services/__tests__/dataServiceAdvanced.test.ts` — 22 tests（toElement 中英文轉換、getHeroSkillSet）
  - `src/services/__tests__/optimisticQueueAdvanced.test.ts` — 12 tests（generateOpId、pending ops 過期過濾、localStorage mock）
- **測試結果**：21 test files / 492 tests 全部通過、tsc --noEmit 0 錯誤

---
### [2026-02-28] 後端戰鬥引擎 — GAS 伺服器權威計算

- **觸發者**：使用者需求（戰鬥計算移至後端）
- **執行角色**：🔧 CODING
- **目標**：戰鬥邏輯由後端 GAS 計算，前端只負責播放動畫和音效，徹底消除跳過戰鬥時的 lag/SFX 問題
- **主要變更**：
  - `gas/battleEngine.js` — **新建** ~650 行 JavaScript，完整移植 domain 層 6 個模組（battleEngine + damageFormula + buffSystem + energySystem + targetStrategy + elementSystem）
    - `runBattleEngine_(players, enemies, maxTurns)` — 伺服器端戰鬥引擎主入口
    - `handleRunBattle_(body)` — POST handler，接收前端序列化的 BattleHero[] 並回傳 `{ winner, actions[] }`
  - `gas/程式碼.js` — doPost switch-case 新增 `run-battle` action
  - `src/services/battleService.ts` — **新建** `runBattleRemote()` — POST 到 GAS `run-battle`，序列化 BattleHero[]，回傳 `{ winner, actions[] }`
  - `src/services/index.ts` — 匯出 `runBattleRemote` + `RemoteBattleResult`
  - `src/App.tsx` Phase A — 改呼叫 `runBattleRemote()`，失敗時自動降級為本地 `runBattleCollect()`
- **測試**：
  - GAS API 手動測試 1v1 戰鬥 → success=true, winner=player, actions=30
  - `tsc --noEmit` 0 錯
  - `vite build` 成功
  - `vitest run` 224/224 通過
- **部署**：GAS v@62 (POST) + v@63 (GET)
- **Spec 更新**：core-combat v2.5→v2.6

---
### [2026-02-28] 戰鬥跳過重構 — 三階段架構（計算→回放→同步）

- **觸發者**：使用者回報（跳過後敗方英雄殘留 + 音效一瞬間爆發）
- **執行角色**：🔧 CODING
- **問題**：
  1. 跳過戰鬥後打輸了，我方英雄仍留在戰場上
  2. 跳過戰鬥時 lag + 所有音效瞬間播完
- **根因**：舊架構 `runBattle()` 用 async `onAction` callback，跳過時所有 action 毫秒內觸發 → SFX 同時建立數十個 OscillatorNode；`removeSlot()` 只在 onAction 動畫中執行，跳過時可能遺漏死亡英雄
- **主要變更**：
  - `src/domain/battleEngine.ts` — 新增 `BattleResult` interface + `runBattleCollect()` 同步收集模式（毫秒級完成整場戰鬥，回傳 `{ winner, actions }`)
  - `src/domain/index.ts` — 匯出 `runBattleCollect` + `BattleResult`
  - `src/App.tsx` — `runBattleLoop` 完全重寫為三階段：
    - Phase A：`runBattleCollect()` 同步計算所有 BattleAction
    - Phase B：逐筆回放，`skipBattleRef.current` 時直接 `continue`（不呼叫 onAction、不播 SFX）
    - Phase C：遍歷 heroMap 最終狀態，同步所有 HP 到 React state，死亡者確實 removeSlot
  - `src/App.tsx` — 所有 `playSfx()` 加 `!skipBattleRef.current` 守衛
  - `src/App.tsx` — 跳過按鈕增加 `audioManager.stopAllSfx()` 呼叫
  - `src/services/audioService.ts` — 新增 `activeSfxGains: GainNode[]` 追蹤 + `stopAllSfx()` 方法（靜音+斷開所有活躍音效）
- **測試**：`tsc --noEmit` 0 錯、`vite build` 成功、`vitest run` 224/224 通過
- **Spec 更新**：core-combat v2.4→v2.5

---
### [2026-02-28] 登出狀態殘留修復 — 完整重置所有快取與狀態

- **觸發者**：使用者回報
- **執行角色**：🔧 CODING
- **問題**：登出再登入時 UI 顯示舊帳號資料（英雄、資源、陣型、信箱、背包全殘留）
- **根因**：登出只清 token + auth state + showGame，未清除 8 個服務層快取、多個 localStorage key、20+ React state/ref、5 個守門旗標阻止重新載入
- **主要變更**：
  - `src/App.tsx` — 新增 `handleFullLogout()` callback，替換原本簡單的 `doLogout() + setShowGame(false)`
    - 清除 8 個服務快取：clearLocalSaveCache / clearLocalPool / clearGachaPreload / clearGameDataCache / clearSheetCache / invalidateMailCache / clearInventoryCache / clearPendingOps
    - 重置 20+ React state（gameState/playerSlots/enemySlots/mailItems/battleResult/battleBuffs 等）
    - 重置 5 個 ref 守門旗標（didInitFetch/earlySaveStarted/earlyHeroesRef/earlySaveRef/formationRestoredRef）
    - 重置過場幕狀態（curtain visible/fading/text + initialReady + curtainClosePromiseRef）
  - `src/services/inventoryService.ts` — 新增 `clearInventoryCache()` 導出函式
- **Spec 更新**：save-system v1.1→v1.2

---
### [2026-02-28] 新帳號初始英雄擴充 — 修復 1-1 卡關

- **觸發者**：使用者回報
- **執行角色**：🔧 CODING + 🎯 GAME_DESIGN
- **問題**：新帳號只有 1 隻 N 級「無名活屍」（HP=100, ATK=30），1-1 關卡 2~4 隻敵人完全打不贏
- **主要變更**：
  - `gas/程式碼.js` — `handleInitSave_()` 初始英雄從 1 隻改為 3 隻：
    - HeroID 6 — 無名活屍（N, 均衡, 闇）← 原有
    - HeroID 1 — 女喪屍（R, 敏捷, 闇）← 新增
    - HeroID 9 — 倖存者（R, 均衡, 光）← 新增
  - `gas/程式碼.js` — formation 自動填入 `[6, 1, 9, null, null, null]`，新玩家無需手動拖曳即可開戰
- **Spec 更新**：save-system v1.0→v1.1
- **部署**：GAS v@60 (POST) + v@61 (GET)

---
### [2026-02-28] CurrencyIcon 統一貨幣 icon 系統

- **觸發者**：使用者需求
- **執行角色**：🔧 CODING
- **主要變更**：
  - `src/components/CurrencyIcon.tsx` — **新建** 統一貨幣 icon 元件（`CurrencyIcon` 4 種 CSS badge + `ItemIcon` 通用元件）
  - `src/App.css` — 新增 `.icon-stardust` 樣式
  - `App.tsx` — HUD + 勝利獎勵：inline CSS icon → `<CurrencyIcon>` + `<ItemIcon>`
  - `MainMenu.tsx` — 資源列 + 產速 + 待領取：inline CSS icon → `<CurrencyIcon>`
  - `GachaScreen.tsx` — 鑽石顯示 + 抽卡費用 + 星塵：inline CSS icon / ✨ emoji → `<CurrencyIcon>`
  - `StageSelect.tsx` — 爬塔獎勵：inline CSS icon → `<CurrencyIcon>`
  - `ShopPanel.tsx` — 貨幣列 + 價格：💰💎 emoji → `<CurrencyIcon>`，移除 CURRENCY_ICON map
  - `InventoryPanel.tsx` — 貨幣列 + 出售 + 貨幣 Tab：💰💎 emoji → `<CurrencyIcon>`
  - `MailboxPanel.tsx` — 獎勵 icon：`getItemIcon()` → `<ItemIcon>`
  - `HeroListPanel.tsx` — 突破金幣 icon：`_getItemIcon('gold')` → `<CurrencyIcon type="gold">`
- **Spec 更新**：ui-flow v1.0→v1.1、inventory v1.1→v1.2、tech-architecture v1.4→v1.5

---
### [2026-02-28] 物品外觀全面統一化

- **觸發者**：使用者需求
- **執行角色**：🔧 CODING
- **主要變更**：
  - `src/constants/rarity.ts` — 新增共用 `ITEM_NAMES` 映射 + `getItemName()` 函式；擴充 `ITEM_ICONS` 覆蓋所有 itemId（含 exp_core/currency_/eqm_/forge_）；修正 N 稀有度 border 不一致
  - `MailboxPanel` — 移除本地 `names` 映射，改用共用 `getItemName()`
  - `InventoryPanel` — 移除 `KNOWN_ITEM_NAMES` + `resolveFallbackName` 獨立邏輯，統一使用共用 `getItemIcon()` / `getItemName()`、碎片 icon 🔮→🧩
  - `App.tsx` — 勝利獎勵移除本地 `itemNames`，改用 `getItemName()`
  - `ShopPanel` — 購買成功訊息改用 `getItemName()`（不再顯示 raw itemId）、金幣 icon 💰→🪙、力量職業石 icon 💪→🗡️、稀有鍛造礦 icon 💎→💠
  - `GachaScreen` — 機率顯示色彩改用 `RARITY_CONFIG` 常數
  - `UIOverlay` — 移除本地 `RARITY_CONFIG` 重複定義，改用共用版本
  - `HeroListPanel` — EXP_MATERIALS icon/name 改用共用常數、突破职業石 icon 💎→🗡️
  - `gas/程式碼.js` — 歡迎信 itemId `exp_stone_m/l` → `exp_core_m/l`
- **統一結果**：所有 itemId 的名稱、icon、稀有度色彩均從 `rarity.ts` 單一來源管理

---
### [2026-02-28] 新用戶歡迎禮包信件

- **觸發者**：使用者需求
- **執行角色**：🔧 CODING
- **主要變更**：
  - `gas/程式碼.js` — `handleRegisterGuest_` 新增 `handleSendMail_` 呼叫，新玩家自動獲得歡迎信（💎300 + 🪙10000 + 📘×5 + 📙×2）
  - try-catch 包裝確保不影響註冊流程
  - 前端無需修改（信箱系統自動載入新信件）
- **測試**：新 token 註冊 → load-mail → 歡迎信存在 → 獎勵正確 → 領取成功 ✅
- **Spec 更新**：auth-system v1.1→v1.2、mailbox v1.0→v1.1

---
### [2026-02-28] 七項 Bug 修復 + 物品外觀統一

- **觸發者**：使用者回報 7 項 Bug
- **執行角色**：🔧 CODING
- **主要變更**：

  **Bug Fix 1：戰鬥 HP 條前幾次被攻擊不扣血**
  - `src/App.tsx` — `heroInstanceData.stars` 從硬編碼 `1` 改為讀取存檔實際星級 `inst.stars ?? 1`
  - `src/App.tsx` — BattleHUD `maxHP` 從讀取原始 `s.HP`（基礎值）改為讀取 `battleHeroesRef` 的 `battleHero.maxHP`（含等級/突破/星級加成的實際最大血量）

  **Bug Fix 2：升級/突破/升星不扣素材**
  - `src/services/inventoryService.ts` — 新增 `removeItemsLocally()` 函式，樂觀扣除本地背包道具
  - `src/components/HeroListPanel.tsx` — `handleConfirmUpgrade` 升級後呼叫 `removeItemsLocally(materials)` 扣除經驗素材
  - `src/components/HeroListPanel.tsx` — `handleConfirmAscend` 突破後扣除碎片 + 職業石
  - `src/components/HeroListPanel.tsx` — `handleConfirmStarUp` 升星後扣除碎片

  **Bug Fix 3：AudioContext not allowed to start**
  - `src/services/audioService.ts` — `playBgm()` 若 AudioContext 尚未建立（無使用者手勢），不再自動建立，改為暫存曲目
  - `src/services/audioService.ts` — `ensureContext()` 建立 ctx 後自動播放暫存 BGM

  **Bug Fix 4：N 卡星塵有小數 0.2**
  - `src/domain/gachaSystem.ts` — `DUPLICATE_STARDUST.N` 從 `0.2` 改為 `1`

  **Bug Fix 5：清除快取後碎片/經驗核心顯示 0**
  - `src/App.tsx` — Phase 1 認證後立即呼叫 `loadInventory()` 提前載入背包，避免其他畫面讀到 null 狀態

  **Bug Fix 6：登出後自動建立新訪客帳號**
  - `src/services/authService.ts` — `autoLogin()` 無 token 時不再自動 `register-guest`，改為回傳未登入狀態
  - `src/services/authService.ts` — 新增 `registerGuest()` 函式，由 UI 按鈕觸發；優先嘗試複用本地 token

  **Bug Fix 7：訪客登入優先複用 token**
  - `src/hooks/useAuth.ts` — 新增 `doRegisterGuest` 方法
  - `src/components/LoginScreen.tsx` — 「訪客模式進入」「返回訪客模式」按鈕改為呼叫 `doRegisterGuest`

  **物品外觀統一**
  - `src/constants/rarity.ts` — 新增共用稀有度常數（`RARITY_COLORS`、`RARITY_CONFIG`、`ITEM_ICONS`、`getItemIcon()`）
  - `src/components/InventoryPanel.tsx` — 移除本地 `RARITY_COLORS`，改從共用常數匯入
  - `src/components/GachaScreen.tsx` — 移除本地 `RARITY_CONFIG`，改從共用常數匯入
  - `src/components/HeroListPanel.tsx` — 移除本地 `RARITY_CONFIG`，改從共用常數匯入
  - `src/components/MailboxPanel.tsx` — 信件獎勵改用 `getItemIcon()` 顯示對應 icon
  - `src/App.tsx` — 戰鬥掉落獎勵改用 `getItemIcon()` 顯示對應 icon

---
### [2026-02-28] 建立 UI 流程 Spec（ui-flow.md v1.0）

- **觸發者**：使用者要求建立 UI flow spec
- **執行角色**：📋 SPEC_MAINTAINER
- **主要變更**：
  - 新增 `.ai/specs/ui-flow.md` v1.0 — 完整記錄 GameState（6 值）、MenuScreen（7 值）、所有導航函式、TransitionOverlay 過場幕機制、元件規格、載入流程（Phase 0/1/2）、戰鬥完整流程
  - 更新 `.ai/specs/README.md` — ui-flow 狀態改為 🟢 已實作

---
### [2026-02-28] GAS CacheService 快取層

- **觸發者**：使用者詢問 GAS 快取功能
- **執行角色**：🔧 CODING + 📋 SPEC_MAINTAINER
- **主要變更**：

  **GAS 伺服端快取**
  - `gas/程式碼.js` — 新增 CacheService 快取層（`cacheGet_` / `cacheSet_` / `cacheRemove_`）
  - 支援自動分片（單 key 超過 90KB 時自動拆成 chunk）
  - **全域配表快取**：heroes, skill_templates, hero_skills, element_matrix, item_definitions — TTL 6h
  - **衍生結果快取**：`loadHeroPool_()` — TTL 6h
  - **用戶映射快取**：`resolvePlayerId_(guestToken)` — TTL 6h
  - **道具定義快取**：`handleLoadItemDefinitions_()` — TTL 6h
  - 所有寫入 handler 自動清除對應 sheet 快取（`invalidateSheetCache_`）
  - 新增 `invalidate-cache` POST action 供手動清除全部快取
  - 快取命中時回應附加 `_cached: true` 欄位

  **Spec 更新**
  - `.ai/specs/tech-architecture.md` v1.2 → v1.3 — 新增「GAS CacheService 快取層」章節

---
### [2026-02-28] 每日副本中文修復 + 戰鬥回放 + 戰鬥統計

- **觸發者**：使用者要求修復每日副本 key 缺中文、新增回放與統計
- **執行角色**：🔧 CODING + 📋 SPEC_MAINTAINER
- **主要變更**：

  **任務 1：每日副本中文修復**
  - `src/domain/stageSystem.ts` — 新增 `getDailyDungeonConfig()`、`getDailyDungeonDisplayName()` 輔助函式
  - `src/App.tsx` — `handleStageSelect` 對 daily 模式顯示中文名（如「力量試煉 - 簡單」）
  - `src/App.tsx` — `buildEnemySlotsFromStage` 對 daily 模式改用 `getDailyDungeonConfig()` 取得敵方設定
  - `src/App.tsx` — 勝利獎勵結算 daily 分支改用 `getDailyDungeonConfig()` 取得副本獎勵

  **任務 2：戰鬥統計面板**
  - `src/App.tsx` — 新增 `battleStats` state + `showBattleStats` 控制，從 BattleAction[] 計算每位英雄輸出/治療/承傷
  - `src/App.tsx` — GAMEOVER 新增「戰鬥資訊 📊」按鈕 → 彈出統計面板（敵我分區、按輸出排序）
  - `src/App.css` — 新增 `.battle-stats-*` 系列樣式

  **任務 3：戰鬥回放**
  - `src/App.tsx` — 新增 `battleActionsRef` 紀錄所有 BattleAction
  - `src/App.tsx` — `runBattleLoop(replayActions?)` 支援回放模式：手動更新 BattleHero HP → 呼叫 onAction 重現 3D 動畫
  - `src/App.tsx` — 新增 `replayBattle()` 函式：過場幕 → 恢復戰前陣容 → 重建敵方 → 執行回放
  - `src/App.tsx` — GAMEOVER 新增「回放 ⏪」按鈕
  - `src/App.css` — 新增 `.btn-replay`、`.btn-stats` 樣式
  - 回放模式不發放獎勵、不推進進度

  **QA 修復**
  - `src/domain/buffSystem.ts` — `DotTickResult` 新增 `sourceUid` 欄位
  - `src/domain/types.ts` — `DOT_TICK` action 新增 `sourceUid?` 欄位
  - `src/domain/battleEngine.ts` — 發送 DOT_TICK 時攜帶 `sourceUid`
  - `src/App.tsx` — 統計計算 DOT 傷害歸屬施放者 `damageDealt`
  - `src/App.tsx` — 統計計算 SKILL_CAST `reflectDamage`
  - `src/App.tsx` — 回放 HP 更新 SKILL_CAST `reflectDamage` 對攻擊者扣血

- **Spec 更新**：`stage-system.md` v0.2→v0.4、`core-combat.md` v2.3→v2.4

---
### [2026-02-28] battleSpeed 改用 localStorage + 英雄列表已獲得數量修正

- **觸發者**：使用者要求戰鬥倍速不再存 Google Sheet
- **執行角色**：🔧 CODING + 📋 SPEC_MAINTAINER
- **主要變更**：

  **任務 1：戰鬥倍速改存 localStorage**
  - `src/App.tsx` — 切換速度改用 `localStorage.setItem('battleSpeed', nv)`；進入戰鬥讀 `localStorage.getItem('battleSpeed')`
  - `src/services/saveService.ts` — 移除 `SaveData.battleSpeed` 欄位 + sanitization + `updateProgress` 可更新欄位
  - `src/hooks/useSave.ts` — 移除 `battleSpeed` 型別
  - `gas/程式碼.js` — 新增 `delete-column` handler（通用），部署 POST @50
  - Google Sheet save_data 表實際已無 battleSpeed 欄，無需刪除

  **任務 2：英雄列表已獲得數量修正**
  - `src/components/HeroListPanel.tsx` — 「已獲得」數量改用 `new Set(heroInstances.map(h => h.heroId)).size`（去重後的唯一英雄數），不再顯示包含重複實例的原始陣列長度

- **Spec 更新**：
  - `.ai/specs/save-system.md` v0.3→v0.4 — 移除 battleSpeed 相關欄位/sanitization/API
  - `.ai/specs/core-combat.md` v2.2→v2.3 — 速度持久化改用 localStorage
- **驗證**：`tsc --noEmit` 零錯誤 | `vite build` 成功

---
### [2026-02-28] 瀏覽器分頁切換動畫修復 + Spec 全面同步

- **觸發者**：使用者回報切換分頁導致動畫 timeout warning
- **執行角色**：🔧 CODING + 📋 SPEC_MAINTAINER
- **主要變更**：

  **Bug：瀏覽器分頁切換導致動畫 5 秒 timeout 誤觸發**
  - 根因：瀏覽器隱藏分頁時 `requestAnimationFrame` 停止 → Three.js mixer 不推進 → 動畫 finished 回呼不觸發 → 但 `setTimeout` 持續計時 → 5 秒超時誤判
  - `src/components/ZombieModel.tsx` — 新增 `visibilitychange` useEffect：切回分頁時 `mixer.update(Math.min(deltaSec, 30))` 補上暫停時間，讓 LoopOnce 動畫自然 finish
  - `src/App.tsx` — `waitForAction` / `waitForMove` timeout callback 新增 `document.hidden` 判斷：隱藏時不觸發超時，改為 defer 重排 5 秒

  **Spec 全面同步（7 份文件）**
  - `.ai/specs/core-combat.md` v2.1→v2.2 — 新增 §10.3~§10.6（SkillToast3D/ElementHint3D、waitForAction collision protection、visibilitychange mixer catch-up、attacker reflect-death）+ battleSpeed 持久化 + 元件樹更新
  - `.ai/specs/save-system.md` v0.2→v0.3 — 新增 stageStars/battleSpeed 欄位、陣型自動存讀、sanitization、Optimistic Queue、getSaveState() API
  - `.ai/specs/gacha.md` v1.0→v1.1 — LocalPullResult 新增 stardust/fragments
  - `.ai/specs/stage-system.md` v0.2→v0.3 — 三星鎖定、模式解鎖 toast、過場遮幕、爬塔勝利顯示
  - `.ai/specs/inventory.md` v0.1→v0.2 — Optimistic Queue + localStorage cache + hero fragment thumbnail
  - `.ai/specs/progression.md` v0.2→v0.3 — Optimistic Queue + 自動等級算 + EXP bar
  - `.ai/specs/tech-architecture.md` v1.1→v1.2 — 三階段 loading + Optimistic Queue 表 + visibilitychange + heroesListRef

  **流程規則**
  - `.github/copilot-instructions.md` — 強制規則新增 #5「程式碼改動必須同步更新 Spec」

- **驗證**：`tsc --noEmit` 零錯誤 | `vite build` 成功

---
### [2026-02-28] 戰鬥卡死修復（童魘重複 uid + waitFor collision + 反彈致死）

- **觸發者**：使用者回報童魘場次戰鬥永遠無法結束
- **執行角色**：🔧 CODING + 🧪 QA
- **主要變更**：
  - SKILL_CAST handler merged targets 去重（同 uid 多次出現導致卡死）
  - waitForAction / waitForMove 三層防護（resolve old → create new → deferred timeout）
  - 攻擊者反彈致死處理：reflect-death 後不再執行後續 action

- **驗證**：`tsc --noEmit` 零錯誤 | `vite build` 成功

---
### [2026-02-28] 7 項 Bug 修復 + 新功能（陣型/toast/HUD/AOE/背包/跳過/技能動畫）

- **觸發者**：使用者回報 7 項問題
- **執行角色**：🔧 CODING + 🧪 QA
- **主要變更**：

  **Bug 1：陣型還原失敗**
  - 根因：`fetchData` 閉包讀取 `saveHook.playerData`（React state），Phase 1 的 `doLoadSave` 雖完成但 state 尚未更新
  - 修復：改用 `getSaveState()` 直接從 service 層讀取，避免 React state 閉包延遲

  **Bug 2：關卡模式鎖定無 toast**
  - 根因：StageSelect 的 mode tab 用 `disabled` 屬性，阻止了 click 事件
  - 修復：移除 `disabled`，改用 `handleTabClick` 內判斷，鎖定時 `setLockToast()` 顯示解鎖條件
  - 同時修復 MainMenu toast `position: fixed` → `position: absolute`（避免 stacking context 吞掉）

  **功能 3：戰鬥準備隱藏 HUD 資源**
  - HUD 資源列只在 `gameState === 'MAIN_MENU'` 時顯示（IDLE/BATTLE/GAMEOVER 均隱藏）

  **功能 4：多目標受擊同時播放**
  - SKILL_CAST handler 中 `for...of await` 改為 `Promise.all(hitPromises)`，AOE 技能所有目標同時彈出受擊動畫

  **Bug 5：戰鬥掉落物未進背包**
  - 根因：`addItemsLocally()` 在 `inventoryState` 為 null 時直接 return（玩家未開過背包）
  - 修復：null 時自動建立最小 inventoryState（從 localStorage 讀取 + 空 equipment），確保掉落物寫入

  **功能 6：跳過戰鬥按鈕**
  - 新增 `skipBattleRef`：跳過時 `delay()` / `waitForAction()` / `waitForMove()` 全部立即 resolve
  - 點擊「跳過 ⏭」按鈕 → flush 所有 pending resolvers → 引擎跑完後直接顯示戰果
  - 已寫入 `.ai/specs/core-combat.md` 第十一節

  **功能 7：非攻擊技能不前進**
  - SKILL_CAST handler 新增 `hasDamageTargets` 判斷：治療/buff 技能施法者原地播放攻擊動畫，不前進也不後退

- **驗證**：`tsc --noEmit` 零錯誤 | `vite build` 成功 | `get_errors` 全部 0

---
### [2026-02-28] 8 項 UI/UX 改善（陣型記憶 / 三星鎖定 / 圖標統一 / 過場 / 爬塔 / 鎖定模式 / 按鈕放大）

- **觸發者**：使用者提出 8 項改善需求
- **執行角色**：🔧 CODING + 🎨 UI_DESIGN + 🧪 QA
- **主要變更**：

  **任務 1：陣型自動存讀**
  - `src/App.tsx` — 新增 `formationRestoredRef`；`fetchData` 中從 save.formation 還原 playerSlots；新增 auto-save useEffect 監聽 playerSlots 變化，於 IDLE/MAIN_MENU 時自動呼叫 `doSaveFormation`
  - 不阻塞 loading 動畫，於 Phase 2 fetchData 末尾靜默還原

  **任務 2：敵方終結技名稱提示**
  - 調查確認已正常運作（battleEngine 的 SKILL_CAST 對敵我雙方都會觸發、App.tsx onAction 會分發到敵方 Hero 元件的 SkillToast3D），**無需修改**

  **任務 3：三星通關關卡不可再挑戰**
  - `src/services/saveService.ts` — `SaveData` 新增 `stageStars: Record<string, number>`；`sanitizeSaveData` 防禦性 JSON.parse；新增 `updateStageStars(stageId, stars)` 保存最佳星數 + 樂觀同步
  - `src/hooks/useSave.ts` — 新增 `doUpdateStageStars` callback
  - `src/App.tsx` — 勝利流程中呼叫 `doUpdateStageStars`；傳 `stageStars` prop 給 StageSelect
  - `src/components/StageSelect.tsx` — 接收 `stageStars` prop；顯示 1~3 星圖示（active/empty）；3 星關卡加上 `stage-maxed` class（半透明 + 禁止點擊 + ✅ 徽章）
  - `src/App.css` — 新增 `.stage-maxed`、`.stage-btn-stars`、`.star-active`、`.star-empty` 樣式

  **任務 4：統一金幣/鑽石/經驗圖標**
  - `src/App.css` — 新增 `.icon-coin`（金色漸層圓形 "G"）、`.icon-dia`（青色旋轉方塊 "D"）、`.icon-exp`（綠色圓角方塊 "E"）三個 CSS icon class
  - `src/components/GachaScreen.tsx` — 4 處 💎 emoji 替換為 `<i className="icon-dia">D</i>`
  - `src/components/StageSelect.tsx` — 爬塔獎勵 📗/💎 emoji 替換為 CSS icon class
  - `src/App.tsx` — 勝利獎勵的 ⚡ emoji 替換為 `<i className="icon-exp">E</i>`

  **任務 5：切換關卡過場遮幕**
  - `src/App.tsx` — `handleStageSelect` 加入 curtain 動畫：顯示過場幕 → 400ms 等待 → 切換敵方陣營/狀態 → closeCurtain

  **任務 6：爬塔勝利結算 + 預設 1F**
  - `src/App.tsx` — 勝利面板：爬塔模式顯示 `🗼 第 N 層通關！` 取代星數
  - `src/services/saveService.ts` — `sanitizeSaveData` towerFloor 預設值修正為 1（原本 0/undefined 會 fallback）
  - `src/components/StageSelect.tsx` — 修正 tower stageId bug：`tower-${currentFloor}` 改為 `String(currentFloor)`

  **任務 7：未解鎖玩法鎖定樣式 + 提示**
  - `src/components/MainMenu.tsx` — MenuItem 新增 `unlock?: { chapter, stage, hint }` 屬性；英雄（1-2）/抽卡（1-3）/背包（1-2）設定解鎖條件；`isItemLocked()` 比對玩家進度；鎖定卡片顯示 🔒 + 灰階半透明；點擊鎖定卡彈出 toast 顯示解鎖條件（2.5s 後消失）
  - `src/App.css` — 新增 `.menu-card-locked`（opacity 0.45 + grayscale 0.8）、`.menu-lock-toast`（置中浮層 + 金色邊框 + 動畫）

  **任務 8：放大返回/關閉按鈕**
  - `src/App.css` — 7 個按鈕類別大幅放大：`.panel-back-btn`、`.hd2-close`、`.inv-detail-close`、`.gacha-results-close`、`.btn-back-lobby`、`.btn-back-menu`、`.mail-detail-back`（padding/font-size/border-radius 全面增大 + hover/active 回饋）

- **驗證**：`tsc --noEmit` 零錯誤 | `vite build` 成功 | `get_errors` 全部 0

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
  1. `.ai/specs/local-storage-migration.md` — v1.0 完整 spec（版本化 + 遷移鏈 + 安全降級）
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
  6. `.ai/specs/optimistic-queue.md` — 完整 spec 文件（含 3 種套用模式 + step-by-step 指南）
  7. GAS 部署 v@27 POST / v@28 GET
  8. `tsc --noEmit` 零錯誤 | `vite build` 成功 | API 冪等測試通過 | reconcile 測試通過
- **新增 Spec**：`.ai/specs/optimistic-queue.md` v1.0 🟢

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
- **影響範圍**：.ai/specs/
- **新增檔案**：
  - `.ai/specs/inventory.md` v0.1 — 8 類道具分類、ID 命名規則、item_definitions + inventory + equipment_instances 三表結構、背包 UI 設計、容量機制（200→500）、11 個 API 端點、5 種商店、與養成/關卡/抽卡的交互定義
- **修改檔案**：
  - `.ai/specs/README.md` — Spec 清單新增 inventory.md
  - `.ai/specs/progression.md` — 依賴新增 `.ai/specs/inventory.md`
  - `.ai/specs/save-system.md` — inventory Sheet 說明加入交叉引用

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
  - `.ai/memory/decisions.md` — 新增 ADR-002「Google Sheets 中文亂碼防護與資料格式校驗」
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
  - `.ai/memory/qa-report.md` — 完整測試報告
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
- **影響範圍**：`.ai/specs/core-combat.md`、`.ai/specs/damage-formula.md`、`.ai/specs/skill-system.md`、`.ai/specs/element-system.md`、`.ai/specs/tech-architecture.md`、`.ai/specs/hero-schema.md`、`.ai/specs/README.md`
- **變更內容**：
  - `core-combat.md` v2.0→v2.1 🟢 — **全面重寫**：Domain Engine 架構（Command Pattern）、BattleAction 11 型別、runBattle() 完整流程、能量系統 4 途徑、Buff/Debuff 25 種 StatusType、被動觸發 13 時機、目標策略 8 種、actor 狀態機、3D 演出流程、介面契約（BattleHero 23 欄位）、元件架構樹
  - `damage-formula.md` v0.1→v1.0 🟢 — **全面重寫**：10 步傷害公式（閃避→基底→DEF→暴擊→屬性→浮動→atkBuff→tgtBuff→取整→護盾→反彈）、治療公式（暴擊×1.5）、DOT 三種公式、反彈公式、DamageResult/HealResult 結構、damageType 飄字分類
  - `skill-system.md` v0.2→v1.0 🟢 — **全面重寫**：SkillTemplate/SkillEffect/HeroSkillConfig 介面、8 TargetType、9 SkillEffect 類型實作狀態、13 PassiveTrigger、星級解鎖規則、Google Sheets schema（skill_templates + hero_skills）、effects JSON 格式、資料載入流程、快取策略
  - `element-system.md` v0.1→v1.0 🟢 — **全面重寫**：7 屬性定義、中英對照表（冰=water, 毒=wind, 闇=dark）、7×7 倍率矩陣、剋制鏈（五行循環 + 光↔闇）、動態載入 loadElementMatrix()、3 個查詢 API
  - `tech-architecture.md` v1.0→v1.1 🟢 — 新增 `src/domain/` + `src/services/` 分層架構、3 層架構圖、更新資料流圖（完整 Sheets→sheetApi→dataService→App→battleEngine→onAction→3D）
  - `hero-schema.md` v2.0→v2.1 🟢 — **全面重寫**：4 層型別（RawHeroData→SlotHero→RawHeroInput→BattleHero）、轉換流程圖、toRawHeroInput/slotToInput 函式、FinalStats 用 SPD（不是 Speed）、14 角色完整數值表含稀有度星級、HeroInstance 養成層佔位
  - `.ai/specs/README.md` — 更新所有版本號與狀態（6 個升為 🟢 已實作/定稿）、新增「已實作系統摘要」表（9 筆原始碼↔spec 對照）
- **關鍵原則**：
  - 所有 spec 內容 100% 從 `src/domain/` + `src/services/` 原始碼逆向對齊，不含未實作的假想
  - 未實作部分標記為 ⬜ 待做 或列入擴展點

---

### [2026-02-26] 大批更新：技能/養成/傷害公式/英雄/戰鬥 specs

- **觸發者**：使用者要求 — 完整設計技能系統、裝備系統、傷害公式、能量大招
- **影響範圍**：`.ai/specs/skill-system.md`、`.ai/specs/progression.md`、`.ai/specs/damage-formula.md`、`.ai/specs/hero-schema.md`、`.ai/specs/core-combat.md`、`.ai/specs/README.md`
- **變更內容**：
  - `skill-system.md` v0.1→v0.2 — **重寫**：能量型主動技能（1000 門檻）、4 被動/星級解鎖（★1/★2/★4/★6）、模組化 skill_templates Google Sheet、14 英雄×4 被動完整設計、SkillEffect 介面、StatusType 列舉、Buff/Debuff 圖標規則
  - `progression.md` v0.1→v0.2 — **重寫**：等級 1~60、突破 0~5、星級 ★1~★6（重複抽碎片）、4 裝備欄位（武器/護甲/戒指/鞋子）、8 套裝效果、打造合成、**完整重置返還 100% 素材**
  - `damage-formula.md` v0.1 — **新建**：完整傷害/治療/暴擊/閃避/DOT/護盾/反彈公式、DEF 減傷曲線 `DEF/(100+DEF)`、暴擊系統、飄字顏色
  - `hero-schema.md` v1.0→v2.0 — 新增 DEF/CritRate/CritDmg/Element 欄位、14 隻角色新數值、HeroInstance + FinalStats 介面、星級系統、廢棄舊 Passive/PassiveDesc 欄位
  - `core-combat.md` v1.0→v2.0 — 新增能量系統（1000 門檻、獲取途徑）、Buff/Debuff 系統（3D 圖標顯示）、被動觸發點（10 種時機）、大招演出流程、新增 CASTING 狀態、BattleHero 擴展型別、多種目標策略
  - `.ai/specs/README.md` — 更新所有版本號與狀態
- **關鍵決策**：
  - heroes.tsv 舊 Passive/PassiveDesc 欄位**不再參考**，技能改為模組化技能表
  - 裝備重置返還 100% 素材（玩家友善設計）
  - 能量獲取：普攻+200、被攻擊+150、擊殺+100、回合+50
  - DEF 公式：`受到傷害 = 100/(100+DEF)`（收益遞減曲線）
  - CritRate/CritDmg 以裝備和 Buff 為主要培養途徑

---

### [2026-02-26] 新增 auth-system / save-system / stage-system specs

- **觸發者**：使用者要求 — 登入系統 + 存檔 + 關卡設計
- **影響範圍**：`.ai/specs/auth-system.md`、`.ai/specs/save-system.md`、`.ai/specs/stage-system.md`、`.ai/specs/README.md`
- **變更內容**：
  - `auth-system.md` v0.1 — 訪客 token + 綁定 email/密碼、Google Sheets players 表、SHA-256 hash、API 端點
  - `save-system.md` v0.1 — save_data / hero_instances / inventory 三表、寫入策略（debounce + 佇列）、體力系統、新手初始存檔
  - `stage-system.md` v0.1 — 5 種模式（主線章節 / 無盡爬塔 / 每日副本 / PvP 競技場 / Boss 戰）、解鎖條件、難度曲線、獎勵公式
  - 更新 .ai/specs/README.md 加入 3 個新規格
- **決策**：
  - 後端繼續用 Google Sheets（使用者偏好）
  - 登入方式：訪客 token + 綁定 email/密碼
  - 關卡：5 種模式全都要

---

### [2026-02-26] 新增 tech-architecture spec

- **觸發者**：使用者要求 — 將技術架構填入規格
- **影響範圍**：`.ai/specs/tech-architecture.md`、`.ai/specs/README.md`
- **變更內容**：
  - 新增 `tech-architecture.md` v1.0 — 完整記錄技術棧（React 19 + Three.js 0.183 + R3F 9 + drei 10 + Vite 5 + TypeScript 5.9）、3D 資產管線、載入器架構、元件樹、RWD 策略、效能策略、場景五要素連動規則、建構部署指令
  - 更新 `.ai/specs/README.md` 加入 tech-architecture 條目，core-combat / hero-schema 升為 v1.0 🟢 定稿

---

### [2026-02-26] 從現有程式碼逆向重寫 core-combat + hero-schema specs

- **觸發者**：使用者要求 — 規格必須反映實際程式碼，不可空想
- **影響範圍**：`.ai/specs/core-combat.md`、`.ai/specs/hero-schema.md`
- **變更內容**：
  - 刪除舊版假想 spec，從 App.tsx / types.ts / Hero.tsx / ZombieModel.tsx / heroes.tsv 逆向分析
  - `core-combat.md` v1.0 — 完整記錄 GameState 狀態機、ActorState 狀態機、6v6 格子座標、速度排序、TARGET_NORMAL 策略、傷害公式（純 ATK）、3D 演出流程、被動技能尚未實作清單
  - `hero-schema.md` v1.0 — 記錄 RawHeroData/SlotHero 介面、14 隻角色數值、模型/動畫資產結構、職業與稀有度分佈

---

### [2026-02-26] 建立 AI 團隊調度系統 + 規格驅動開發架構

- **觸發者**：使用者需求 — 建立可擴展、有記憶的 AI 開發團隊
- **影響範圍**：`.ai/agents/`、`.ai/specs/`、`.ai/memory/`、`.github/copilot-instructions.md`
- **變更內容**：
  - 建立 9 個 AI Agent 提示詞（`.ai/agents/01~09-*.md`）
  - 建立自動調度系統（`.ai/agents/README.md`）
  - 建立模組化規格系統（`.ai/specs/`），含 6 個初版 spec：
    - `core-combat.md` — 回合制戰鬥
    - `hero-schema.md` — 英雄資料結構
    - `skill-system.md` — 技能系統
    - `progression.md` — 養成系統
    - `gacha.md` — 抽卡系統
    - `element-system.md` — 屬性剋制
  - 建立記憶持久化系統（`.ai/memory/`）
  - 建立衝突偵測與解決協議
- **相關決策**：ADR-001
