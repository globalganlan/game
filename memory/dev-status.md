# 開發狀態快照 — Dev Status

> 最後更新：2026-03-05（第五十四次更新 — 裝備暴擊修正+裝備欄完整資訊+關卡選擇佈局修正）

## 截至 2026-03-05 的開發狀態

### 已完成
- [x] 3D 喪屍對戰場景（React 19 + Vite 5 + R3F 9 + Three.js 0.183 + TypeScript 5.9）
- [x] 14 隻 zombie 模型（GLB + Draco 壓縮 + 5 動畫分離）
- [x] GLB 載入器（全域快取 + Suspense）（`src/loaders/glbLoader.ts`）
- [x] RWD 響應式設計（mobile/tablet/desktop）（`src/hooks/useResponsive.ts`）
- [x] AI 團隊調度系統（11 個 Agent，含 🏗️ TECH_LEAD + 📋 SPEC_MAINTAINER）
- [x] 提示詞模板集（`agents/prompt-playbook.md`，P-01~P-07）
- [x] 模組化規格系統（specs/）
- [x] 記憶持久化系統（memory/）
- [x] **裝備暴擊屬性加算修正** — CritRate/CritDmg percent subs 改為加算百分點（+5% = +5），修復乘算 floor 歸零問題
- [x] **裝備欄完整資訊顯示** — 英雄資訊裝備欄顯示稀有度標籤（SSR/SR/R/N）、主屬性、所有副屬性、強化等級
- [x] **關卡選擇佈局修正** — 移除橫向捲軸，章節 tab 自動換行，4×2 網格完整顯示 8 關
- [x] **抽卡前端狀態即時刷新** — 4 Bug 修復：召喚券/鍛造券即時扣除、免費抽狀態持久化、保底計數器持久化、新英雄即時加入列表
  - `removeItemsLocally()` 取代 `addItemsLocally({ quantity: -N })`
  - `updateFreePullLocally()` / `updateGachaPityLocally()` 新增匯出
  - `notify()` 深複製 heroes + save（修復 useMemo reference 偵測）
  - `updateLocal()` 移除 `in` guard（允許寫入 optional fields）
- [x] **裝備圖鑑系統** — 背包「📖 圖鑑」tab，128 種裝備百科（8 套裝 × 4 部位 × 4 稀有度）
  - `src/components/CodexPanel.tsx` — 可擴展 CodexCategory 架構
  - 收集進度條 + 套裝效果展示 + 稀有度篩選 + 擁有/鎖定視覺狀態
- [x] **Cloudflare Workers + D1 後端** — Hono 路由 + D1 SQLite，取代 GAS + Google Sheets
  - `workers/src/index.ts` — 主入口 + CORS + Cron Triggers
  - `workers/src/routes/` — 11 個路由模組（auth / save / battle / inventory / progression / gacha / mail / arena / sheet / checkin / **stage**）
  - `workers/schema.sql` — **15 張** D1 資料表（含新增的 skill_templates / hero_skills / element_matrix）
- [x] **D1 原子批次寫入** — 所有多寫入路由使用 `db.batch()` 包成單一 SQLite 交易
  - 核心 helper：`upsertItemStmt` / `grantRewardsStmts` / `insertMailStmt`
  - 共 22 條路由完成批次化（save/auth/inventory/gacha/progression/mail/checkin/arena）
- [x] **D1 遊戲資料正規化** — heroes/skill_templates/hero_skills/element_matrix 從 game_sheets KV blob 拉出為專屬 D1 表
  - `readSheet` 端點自動從專屬表讀取，前端零改動
  - heroes 表新增 modelId/critRate/critDmg/description 獨立欄位
- [x] **CurrencyIcon 統一 emoji** — 💰💎💚✨⚔️，移除 CSS badge 樣式
- [x] **裝備系統穩定性** — addEquipmentLocally + parseEquipment 正規化、UI 空值防護
- [x] **裝備中文名稱** — HeroListPanel + InventoryPanel 全面使用 `getEquipDisplayName()` 顯示中文
- [x] **升級英雄 UI v2** — 雙按鈕（升1級/升N級）+ 費用預覽，取代 slider
- [x] **經驗資源即時更新** — 信箱/簽到/寶箱/道具使用的 exp 正確回寫 save.exp
- [x] **戰力動畫改進** — 穿脫裝備即時觸發 + 顯示最終戰力值 + 綠增紅減顏色
- [x] **heroes.tsv + D1 heroes 表已同步** — 新增 DEF / CritRate / CritDmg / Element 欄位
- [x] **主線關卡 API 驅動** — D1 stage_configs 存 24 筆關卡配置，Workers `/list-stages` API 提供，前端 StageSelect 動態載入
  - 3 章主題（廢墟之城/暗夜森林/死寂荒原），每章 8 關
  - 章節主題色卡片 UI + 難度骷髏 + 推薦等級 + BOSS 金框
  - `getStoryStageConfig()` 前端死碼已移除
- [x] **Domain 層戰鬥引擎** — 純 TypeScript 函式，零 React 依賴
  - `src/domain/types.ts` — 完整型別定義（BattleHero, BattleAction, SkillTemplate 等）
  - `src/domain/elementSystem.ts` — 7 屬性剋制矩陣
  - `src/domain/buffSystem.ts` — Buff/Debuff 全生命週期管理（DOT/護盾/控制/淨化）
  - `src/domain/damageFormula.ts` — 10 步完整傷害公式（DEF 減傷/暴擊/屬性/閃避/護盾/反彈）
  - `src/domain/energySystem.ts` — 能量管理（每回合/攻擊/被攻擊/擊殺/大招門檻 1000）
  - `src/domain/targetStrategy.ts` — 8+ 種目標選擇策略（嘲諷/前排/後排/隨機/全體/AOE）
  - `src/domain/battleEngine.ts` — 核心引擎 `runBattle()`、普攻/技能執行、被動觸發、BattleHero 工廠
  - `src/domain/index.ts` — 統一匯出
- [x] **資料服務層** — 透過 Workers API 載入遊戲配置
  - `src/services/apiClient.ts` — Workers callApi + callAuthApi
  - `src/services/dataService.ts` — 解析 heroes/skill_templates/hero_skills/element_matrix → domain 型別
  - `src/services/index.ts` — 統一匯出
- [x] **App.tsx 整合** — 戰鬥迴圈已切換至 Domain Engine 驅動
  - `runBattleLoop()` 改用 `runBattle()` + `onAction` callback
  - SlotHero → BattleHero 轉換（保留 _uid 對應）
  - 3D 演出回調完整映射（前進/攻擊/受傷/死亡/DOT/技能施放）- [x] **🐛 Phase B 死亡角色守衛** — NORMAL_ATTACK/SKILL_CAST/DEATH handler 新增 dead-actor guard，已死角色不再播放前進/攻擊動畫
- [x] **✨ Buff/Debuff 3D 圖示** — 英雄模型上方顯示綠底(Buff)/紅底(Debuff) icon，可疊層顯示×N
- [x] **✨ Buff/Debuff 施加漂浮文字** — BUFF_APPLY 觸發時在被施加者頭頂顯示綠/紅色中文狀態名（含 DOT）
- [x] **✨ 致死傷害跳過 HURT** — 普攻/技能/反彈致死時不再播 HURT 動畫，直接進入 DEAD
- [x] **✨ KOF98 大招音效** — skill_cast SFX 重設計為 6 層 KOF98 Super Flash 風格
- [x] **✨ 未解鎖技能預覽** — 英雄列表面板顯示完整技能資訊（灰色 + 🔒 ★N 解鎖徽章）
- [x] **✨ 全域字型放大** — html root font-size: 18px（12.5% 增大）
- [x] **✨ PWA 自動更新** — SW v3 Network First for JS/CSS + 更新提示 UI + auto-reload
- [x] **📝 ADR-008** — 強制全專案 grep 描換規則
- [x] **✨ PWA Safe Area 適配** — iOS 劇海/動態島 padding 修正- [x] **🐛 修復遠端戰鬥動畫卡住** — for-of 無限迴圈（allActions 共用參考）+ `needsHpSync` 旗標 + 反彈傷害 HP 條同步
- [x] **🐛 修復死亡動畫視覺問題** — `playHitOrDeath` killed 分支改 HURT→DEAD 序列（4 路徑全統一）+ GAS turn_end 被動傷害致死時發射 DEATH 事件（POST @64 / GET @65）
- [x] **🐛 修復 on_attack 被動雙倍傷害** — 新增 `damage_mult` / `damage_mult_random` effect type 取代 `damage`，被動不再獨立計算傷害改為乘算加成；新增 `PASSIVE_DAMAGE` action type；6 個被動技能效果已更新（POST @66 / GET @67）
- [x] **✨ 被動觸發浮動文字** — 新增 `PassiveHint3D` 元件，被動觸發時在英雄頭頂顯示紫色浮動文字（☕ + 技能名）
- [x] **🔒 反作弊校驗系統** — Mulberry32 seeded PRNG + GAS `verify-battle` 背景驗證，Phase A 完成後 fire-and-forget、結算前 await 比對 winner（POST @80 / GET @81）
- [x] **🔒 伺服器端獎勵計算 + save-progress 封鎖** — `handleCompleteBattle_` 統一結算（反作弊 + 獎勵計算），`save-progress` 移除 gold/diamond/exp/level/storyProgress/towerFloor（POST @82 / GET @83）
- [x] **🧪 QA 測試完成** — 594 測試全通過
  - Vitest 1.6.1 單元測試（含 battleEffectsIntegration.test.ts 42 項新增）
  - Domain 層：battleEngine、buffSystem、damageFormula、targetStrategy、stageSystem、gachaSystem、progressionSystem、elementSystem、energySystem、boundary
  - Services 層：battleService、saveService、dataService、optimisticQueue
  - 1000 場數值模擬（玩家 ~50% / 敵方 ~50%）
  - 邊界條件 & 安全性測試（24 項）
  - 已修復 3 個 bug（tickStatusDurations 永久 buff 誤判 / runBattle break 誤判平手 / ESLint 配置）
  - 詳見 `memory/qa-report.md`

### 2026-03-02 新增功能（4 項）
- [x] 每日簽到 — Workers `daily-checkin` 路由 + CheckinPanel.tsx + `doDailyCheckin()` saveService + SaveData checkinDay/checkinLastDate + MenuScreen 'checkin'
- [x] 寶箱開啟邏輯 — Workers `use-item` 路由處理 chest bronze/silver/gold 三階 + InventoryPanel 結果顯示 + `updateLocalCurrency()` 同步
- [x] 背包裝/卸裝備 — InventoryPanel equip/unequip 按鈕 + 英雄選擇 popup + equipItem/unequipItem/getHeroEquipment
- [x] 新手引導 — TutorialOverlay.tsx + useTutorial() hook + 5 步引導 + localStorage 追蹤

### 2026-03-02 EXP 資源重構 + 星塵兌換商店 + UI 修復
- [x] EXP 資源重構 — 移除 exp_core_s/m/l 道具，EXP 改為頂層資源（save_data.exp），戰鬥/離線/商店皆直接發放 EXP；英雄升級改滑桿 UI
- [x] 星塵兌換商店 — 6 種商品（exp/gold/職業石/強化石/金寶箱/diamond），以 currency_stardust 扣除
- [x] 移除重洗石 — ShopPanel / Workers SHOP_CATALOG / ItemInfoPopup / constants/rarity.ts
- [x] 裝備 UI Crash Fix — HeroListPanel / InventoryPanel 裝備屬性 null guard
- [x] 背包裝備分頁補回 — InventoryPanel TABS 新增 equipment tab

### 2026-03-02 重構（useLogout hook）
- [x] `src/hooks/useLogout.ts` — auth logout + 9 個服務快取 clear，接收 `onResetState` 回呼
- [x] `SettingsPanel.tsx` 改用 `useLogout(onLogout)` 取代手寫登出邏輯
- [x] `App.tsx` `handleFullLogout` 簡化為 `handleLogoutResetState`（純 React state reset），移除 9 個 cache clearing import

### 2026-03-03 背包 UI 改善 + 裝備稀有度強化 + UI 全面中文化
- [x] **UI 全面中文化** — 掃描 15 個檔案共 ~61 處英文 UI，全翻繁中；新增 `src/constants/statNames.ts`（STAT_ZH + STATUS_ZH 共用映射）
- [x] **「全部」分頁包含裝備** — 背包「全部」tab 同時顯示道具 + 裝備
- [x] **英雄碎片中文名稱修復** — `asc_fragment_X` 一律使用 `resolveFallbackName()`
- [x] **裝備「使用中」稀有度視覺** — 稀有度色 box-shadow + 徽章
- [x] **記憶檔案全面更新** — decisions/dev-status 清理 GAS 引用

### Spec 狀態

| Spec | 版本 | 狀態 |
|------|------|------|
| core-combat.md | v3.3 | 🟢 Phase B 死亡角色守衛 + 致死跳過 HURT |
| hero-schema.md | v2.1 | 🟢 4 層型別 + 14 角色完整數值表 |
| damage-formula.md | v1.0 | 🟢 10 步完整傷害公式 |
| skill-system.md | v1.3 | 🟢 SkillTemplate + 15 PassiveTrigger + extra_turn 機制 + on_ally_death/on_ally_skill |
| progression.md | v2.3 | 🟢 EXP 資源重構（頂層資源 + 滑桿升級 UI） |
| tech-architecture.md | v1.5 | 🟢 CurrencyIcon 統一 icon + constants 層 |
| auth-system.md | v0.1 | 🟡 草案 |
| save-system.md | v2.2 | 🟢 saveService 狀態刷新修復 + updateFreePullLocally/updateGachaPityLocally |
| stage-system.md | v2.2 | 🟢 EXP 資源獎勵（取代 exp_core 掉落） |
| gacha.md | v2.4 | 🟢 前端狀態即時刷新修復（removeItemsLocally + optional fields） |
| element-system.md | v1.0 | 🟢 7 屬性 + 倍率矩陣 |
| inventory.md | v2.5 | 🟢 移除 exp_core / reroll + 星塵兌換商店 + 「全部」分頁含裝備 + 碎片中文名 |
| optimistic-queue.md | v1.0 | 🟢 3 種套用模式 |
| local-storage-migration.md | v2.0 | 🟢 舊版 key 清除器（後端權威模式） |
| buff-debuff-icons.md | v1.0 | 🟢 3D 狀態圖示（綠底/紅底 + 疊層數） |
| buff-apply-toast.md | v1.0 | 🟢 施加漂浮文字（DOT 中文名稱） |

### 現有戰鬥系統已實作功能
- [x] GameState 5 態狀態機（PRE_BATTLE→FETCHING→IDLE→BATTLE→GAMEOVER）
- [x] 6v6 格子陣型（前排 3 + 後排 3，支援拖曳換位）
- [x] 速度排序回合制（SPD DESC → slot ASC → 玩家優先）
- [x] TARGET_NORMAL 目標策略（前排對位優先）
- [x] 3D 演出（前進→攻擊→受擊/死亡→後退 + 閃光 + 飄字）
- [x] 速度控制（x1 / x2 / x4）
- [x] 過場幕（TransitionOverlay）

### 尚未實作（已有 spec 設計）
- [x] ~~傷害公式（DEF 減傷 / 暴擊 / 屬性剋制 / DOT）~~ ✅ `src/domain/damageFormula.ts`
- [x] ~~能量系統 + 大招（1000 門檻）~~ ✅ `src/domain/energySystem.ts`
- [x] ~~4 被動技能 / 星級解鎖~~ ✅ `src/domain/battleEngine.ts`（被動觸發 + 星級限制）
- [x] ~~Buff/Debuff 系統~~ ✅ `src/domain/buffSystem.ts`
- [x] ~~帳號系統~~ ✅ Phase 1 完成（Workers auth API + authService + useAuth + LoginScreen）
- [x] ~~存檔系統~~ ✅ Phase 2 完成（Workers save API 6 端點 + saveService + useSave + 資源計時器 + HUD 資源顯示）
- [x] ~~等級/突破/星級/裝備/套裝~~ ✅ Phase 4 Domain 完成（`src/domain/progressionSystem.ts` + `src/services/progressionService.ts` + `src/services/inventoryService.ts`）
- [x] ~~抽卡系統~~ ✅ Phase 6 Domain 完成（`src/domain/gachaSystem.ts`）
- [x] ~~關卡系統（5 模式）~~ ✅ Phase 5 Domain 完成（`src/domain/stageSystem.ts`）
- [x] ~~item_definitions D1 表~~ ✅ 22+ 道具定義已建立（含 14 英雄碎片）
- [x] ~~Workers 55+ API 端點~~ ✅ 已部署（inventory/progression/stage/gacha/auth/save/battle/mail/arena/checkin/sheet）
- [x] ~~Buff/Debuff 3D 圖標~~ ✅ Phase 7 完成（BattleHUD 2D overlay — buff/debuff icons + energy bar + skill toasts + element hints）
- [x] ~~Phase 3: 主選單 UI~~ ✅ 完成（MainMenu + HeroListPanel + InventoryPanel + GachaScreen + StageSelect）
- [x] ~~Phase 7: 戰鬥 UI 強化~~ ✅ 完成（BattleHUD — Buff 圖標/能量條/技能彈幕/屬性相剋指示）

### 2026-02-28 新增功能（8 項 UI/UX 改善）
- [x] 陣型自動存讀 — 登入後從 save.formation 還原 playerSlots，變更時自動回存（不阻塞 loading）
- [x] 三星通關鎖定 — SaveData + stageStars；3 星關卡 `.stage-maxed` 禁止再戰
- [x] 統一貨幣圖標 — `CurrencyIcon.tsx` 元件（CSS badge: `.icon-coin` / `.icon-dia` / `.icon-exp` / `.icon-stardust`）統一所有介面的金幣/鑽石/經驗/星塵顯示，替代原本各元件散落的 inline CSS icon 和 emoji
- [x] 切換關卡過場遮幕 — `handleStageSelect` 用 curtain 遮蔽敵方切換
- [x] 爬塔勝利結算 + 預設 1F — 勝利面板爬塔模式顯示樓層；towerFloor 預設 1
- [x] 未解鎖玩法鎖定 — 英雄(1-2)/抽卡(1-3)/背包(1-2) 灰階 🔒 + toast
- [x] 放大返回/關閉按鈕 — 7 個按鈕全面放大 + hover/active 回饋

### 2026-02-28 Bug 修復 + 新功能（第二批）
- [x] 陣型還原修復 — `getSaveState()` 取代 `saveHook.playerData` 閉包，解決 race condition
- [x] 關卡模式鎖定 toast — StageSelect mode tab 移除 `disabled`，改用 toast 顯示解鎖條件
- [x] 戰鬥準備隱藏 HUD — 資源列僅在 MAIN_MENU 顯示

### 2026-03-01 新帳號初始英雄擴充
- [x] 初始英雄 1→3 隻 — 無名活屍(N) + 女喪屍(R) + 倖存者(R)
- [x] 自動陣型 — formation 預填 [6,1,9,null,null,null]，新玩家無需手動拖曳即可開戰

### 2026-02-28 登出狀態殘留修復
- [x] `handleFullLogout()` — 8 服務快取 + 20+ React state + 5 ref 守門旗標全重置
- [x] `clearInventoryCache()` — inventoryService 新增導出函式
- [x] 多目標同時受擊 — SKILL_CAST `Promise.all` 取代逐一 `await`
- [x] 背包掉落物修復 — `addItemsLocally` null inventoryState 自動初始化
- [x] 跳過戰鬥按鈕 — `skipBattleRef` + flush resolvers → 已寫入 spec
- [x] 非攻擊技能不前進 — `hasDamageTargets` 判斷

### 2026-02-28 戰鬥卡死修復（第三批）
- [x] 童魘 SKILL_CAST 重複 uid 導致卡死 — merged targets 去重
- [x] waitForAction / waitForMove collision protection — 三層防護（resolve old → create new → deferred timeout）
- [x] 攻擊者反彈致死處理 — attacker reflect-death 後不再執行後續 action

### 2026-02-28 瀏覽器分頁切換動畫修復（第四批）
- [x] ZombieModel visibilitychange mixer catch-up — 切回分頁時 mixer.update(delta) 補上暫停時間
- [x] waitForAction/waitForMove timeout defer — document.hidden 時不觸發超時，改為 defer 重排
- [x] Spec 全面同步 — 7 份 spec 更新至最新版本（core-combat v2.2, save-system v0.3, gacha v1.1, stage-system v0.3, inventory v0.2, progression v0.3, tech-architecture v1.2）
- [x] copilot-instructions 新增強制規則 #5 — 程式碼改動必須同步更新 Spec

### 2026-03-01 extra_turn 額外行動機制
- [x] `_extraTurnQueue` + `processExtraTurns()` — 每回合每位英雄最多 1 次額外行動，安全上限 MAX_EXTRA=10
- [x] `on_ally_death` 觸發點 — 隊友死亡時觸發（普攻/技能擊殺皆觸發）
- [x] `on_ally_skill` 觸發點 — 隊友施放主動技能時觸發（施放者自己不觸發）
- [x] `PassiveTrigger` 新增 `'on_ally_death'` | `'on_ally_skill'`
- [x] `BattleAction` 新增 `EXTRA_TURN` 類型
- [x] App.tsx `onAction` switch 新增 `case 'EXTRA_TURN'` 處理
- [x] 5 項新增測試，總計 594 測試全通過

### 2026-03-01 帳號綁定獎勵 + PWA 支援 + PWA 安裝獎勵
- [x] GAS `handleBindAccount_` — 首次綁定自動寄送 💎200+🪙5000 獎勵信件
- [x] SettingsPanel 綁定區塊 — 新增獎勵預覽（`.settings-reward-preview` 金色閃爍）
- [x] PWA `public/manifest.json` — standalone 模式 + 圖示 192/512/180
- [x] PWA `public/sw.js` — Service Worker（Cache First 靜態/Network First 頁面/排除 GAS API）
- [x] PWA `index.html` meta tags — manifest + theme-color + apple-mobile-web-app
- [x] PWA `src/main.tsx` — SW 註冊
- [x] `src/services/pwaService.ts` — 平台偵測/standalone 偵測/安裝觸發/獎勵領取/操作指引/好處清單
- [x] GAS `handleClaimPwaReward_` — 新 action `claim-pwa-reward`（save_data.pwaRewardClaimed 防重複）
- [x] SettingsPanel「📱 加入主畫面」區塊 — PWA 好處/安裝按鈕或平台操作指引/已安裝 badge
- [x] App.tsx — standalone 模式自動偵測 + 自動領取 PWA 獎勵
- [x] Spec 更新：auth-system v1.3, save-system v1.3, tech-architecture v1.6

### 2026-03-01 被動技能系統 6 項 Bug 修復
- [x] `always` 被動觸發修復 — 戰鬥開始時正確觸發永久效果
- [x] `every_n_turns` 被動觸發修復 — 新增每 N 回合觸發邏輯
- [x] 多目標被動修復 — 新增 `resolvePassiveTargets()` 正確處理 `all_allies`/`all_enemies`/`self`
- [x] `on_dodge` 反擊目標修復 — context.target 改為攻擊者
- [x] `dispel_debuff` / `reflect` 處理修復 — 被動效果中新增處理
- [x] JSON 修正 5 筆 — `damage_reduce`→`dmg_reduce`、`crit_up`→`crit_rate_up`
- [x] 新增 42 項整合測試（`battleEffectsIntegration.test.ts`），總計 589 測試全通過

### 2026-02-28 每日副本中文修復 + 戰鬥回放 + 戰鬥統計（第五批）
- [x] 每日副本 stageId 中文顯示 — `getDailyDungeonConfig()` + `getDailyDungeonDisplayName()` + 過場幕/toast 中文化
- [x] 每日副本敵方配置修正 — `buildEnemySlotsFromStage` daily 分支改用副本自身設定
- [x] 每日副本獎勵修正 — 勝利結算 daily 分支改用 `getDailyDungeonConfig().difficulty.rewards`
- [x] 戰鬥統計面板 — 紀錄 BattleAction[] → 計算每位英雄輸出/治療/承傷 → GAMEOVER 彈出統計面板
- [x] 戰鬥回放 — `battleActionsRef` 紀錄 → `replayBattle()` 恢復陣容 → `runBattleLoop(replayActions)` 重現 3D 動畫（不發放獎勵/不推進進度）
- [x] Spec 同步 — stage-system v0.4, core-combat v2.4

### Workers API（已取代 GAS）

| 用途 | 方法 | 端點 |
|------|------|------|
| 全部遊戲 API | POST | `https://globalganlan-api.s971153.workers.dev/api/*` |
| 認證 API | POST | `https://globalganlan-api.s971153.workers.dev/api/auth/*` |

前端透過 `src/services/apiClient.ts` 的 `callApi()` / `callAuthApi()` 統一呼叫。

### 部署架構
- **前端**：GitHub Pages（`globalganlan.github.io/game/`）
- **後端**：Cloudflare Workers + D1（`globalganlan-api.s971153.workers.dev`）
- **即時通知**：Pusher Channels（app_id 2122152, cluster ap3）
- **CI/CD**：GitHub Actions 雙 job（push main → 前端部署 + Workers 部署）

### 下一步（7 Phase 路線圖）— 全部完成
1. ~~Phase 1: 認證系統~~ ✅ 完成
2. ~~Phase 2: 存檔系統~~ ✅ 完成
3. ~~Phase 3: 主選單 UI~~ ✅ 完成
4. ~~Phase 4: 養成系統~~ ✅ 完成（Workers 路由取代 GAS handlers）
5. ~~Phase 5: 關卡系統~~ ✅ 完成（Workers battle/stage 路由）
6. ~~Phase 6: 抽卡系統~~ ✅ 完成（Workers gacha 路由）
7. ~~Phase 7: 戰鬥 UI 強化~~ ✅ 完成

### 測試
- Vitest 1.6.1: **594 tests pass**
- `tsc --noEmit`: 零錯誤
- `vite build`: 成功（691 modules）

### 技術債
- ~~敵方陣型隨機生成較簡陋（隨機 1~6 隻）— 需串接 stage_configs D1 表~~ ✅ 已修復（v2.0）
- ~~localStorage 遊戲資料快取殘留（GAS→Workers 遷移未清理）~~ ✅ 已修復（2026-03-04）
- heroes 表 Element 用中文（闇/毒/火/冰/雷/光），domain 用英文 — `toElement()` 橋接
- Narrative 劇情系統（specs/narrative.md v0.1）— 已擱置
- ESLint 殘餘 42 問題（28 errors + 14 warnings），多為 unused-vars / prefer-const / Math.random purity
