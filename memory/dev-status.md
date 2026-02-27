# 開發狀態快照 — Dev Status

> 最後更新：2026-02-27（第八次更新 — Phase 3 + Phase 7 UI 完成）

## 截至 2026-02-26 的開發狀態

### 已完成
- [x] 3D 喪屍對戰場景（React 19 + Vite 5 + R3F 9 + Three.js 0.183 + TypeScript 5.9）
- [x] 14 隻 zombie 模型（GLB + Draco 壓縮 + 5 動畫分離）
- [x] GLB 載入器（全域快取 + Suspense）（`src/loaders/glbLoader.ts`）
- [x] RWD 響應式設計（mobile/tablet/desktop）（`src/hooks/useResponsive.ts`）
- [x] AI 團隊調度系統（11 個 Agent，含 🏗️ TECH_LEAD + 📋 SPEC_MAINTAINER）
- [x] 提示詞模板集（`agents/prompt-playbook.md`，P-01~P-07）
- [x] 模組化規格系統（specs/）
- [x] 記憶持久化系統（memory/）
- [x] **Google Sheets 讀寫能力** — GET 讀取 + POST 寫入（doPost API 已部署）
- [x] **heroes.tsv + Google Sheet 已同步更新** — 新增 DEF / CritRate / CritDmg / Element 欄位
- [x] **全 12 張 Google Sheet 資料表已建立** — heroes, skill_templates, hero_skills, element_matrix, stage_configs, daily_dungeons, boss_configs, equipment_templates, equipment_sets, gacha_banners, progression_config, tower_configs
- [x] **Domain 層戰鬥引擎** — 純 TypeScript 函式，零 React 依賴
  - `src/domain/types.ts` — 完整型別定義（BattleHero, BattleAction, SkillTemplate 等）
  - `src/domain/elementSystem.ts` — 7 屬性剋制矩陣
  - `src/domain/buffSystem.ts` — Buff/Debuff 全生命週期管理（DOT/護盾/控制/淨化）
  - `src/domain/damageFormula.ts` — 10 步完整傷害公式（DEF 減傷/暴擊/屬性/閃避/護盾/反彈）
  - `src/domain/energySystem.ts` — 能量管理（每回合/攻擊/被攻擊/擊殺/大招門檻 1000）
  - `src/domain/targetStrategy.ts` — 8+ 種目標選擇策略（嘲諷/前排/後排/隨機/全體/AOE）
  - `src/domain/battleEngine.ts` — 核心引擎 `runBattle()`、普攻/技能執行、被動觸發、BattleHero 工廠
  - `src/domain/index.ts` — 統一匯出
- [x] **資料服務層** — 從 Google Sheets 載入遊戲配置
  - `src/services/sheetApi.ts` — Sheet 讀寫 + 快取
  - `src/services/dataService.ts` — 解析 heroes/skill_templates/hero_skills/element_matrix → domain 型別
  - `src/services/index.ts` — 統一匯出
- [x] **App.tsx 整合** — 戰鬥迴圈已切換至 Domain Engine 驅動
  - `runBattleLoop()` 改用 `runBattle()` + `onAction` callback
  - SlotHero → BattleHero 轉換（保留 _uid 對應）
  - 3D 演出回調完整映射（前進/攻擊/受傷/死亡/DOT/技能施放）
- [x] **🧪 QA 測試完成** — 133 測試全通過
  - Vitest 1.6.1 單元測試（7 test files / 133 tests）
  - 1000 場數值模擬（玩家 50.8% / 敵方 49.2%）
  - 邊界條件 & 安全性測試（24 項）
  - ESLint TypeScript parser 修復
  - 已修復 3 個 bug（tickStatusDurations 永久 buff 誤判 / runBattle break 誤判平手 / ESLint 配置）
  - 詳見 `memory/qa-report.md`

### Spec 狀態

| Spec | 版本 | 狀態 |
|------|------|------|
| core-combat.md | v2.0 | 🟡 新增能量/Buff/被動觸發 |
| hero-schema.md | v2.0 | 🟡 新增 DEF/Crit/星級 |
| damage-formula.md | v0.1 | 🟡 完整傷害公式 |
| skill-system.md | v0.2 | 🟡 能量大招 + 4被動/星級解鎖 |
| progression.md | v0.2 | 🟡 等級/突破/星級/裝備/套裝 |
| tech-architecture.md | v1.0 | 🟢 定稿 |
| auth-system.md | v0.1 | 🟡 草案 |
| save-system.md | v0.2 | 🟢 Phase 2 完成 |
| stage-system.md | v0.1 | 🟡 草案 |
| gacha.md | v0.1 | 🟡 草案 |
| element-system.md | v0.1 | 🟡 草案 |

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
- [x] ~~帳號系統~~ ✅ Phase 1 完成（GAS auth API + authService + useAuth + LoginScreen）
- [x] ~~存檔系統~~ ✅ Phase 2 完成（GAS save API 6 端點 + saveService + useSave + 資源計時器 + HUD 資源顯示）
- [x] ~~等級/突破/星級/裝備/套裝~~ ✅ Phase 4 Domain 完成（`src/domain/progressionSystem.ts` + `src/services/progressionService.ts` + `src/services/inventoryService.ts`）
- [x] ~~抽卡系統~~ ✅ Phase 6 Domain 完成（`src/domain/gachaSystem.ts`）
- [x] ~~關卡系統（5 模式）~~ ✅ Phase 5 Domain 完成（`src/domain/stageSystem.ts`）
- [x] ~~item_definitions Google Sheet~~ ✅ 22 道具定義已建立
- [x] ~~GAS 20+ 新 API~~ ✅ 已部署 v@13（inventory/progression/stage/gacha handlers）
- [x] ~~Buff/Debuff 3D 圖標~~ ✅ Phase 7 完成（BattleHUD 2D overlay — buff/debuff icons + energy bar + skill toasts + element hints）
- [x] ~~Phase 3: 主選單 UI~~ ✅ 完成（MainMenu + HeroListPanel + InventoryPanel + GachaScreen + StageSelect）
- [x] ~~Phase 7: 戰鬥 UI 強化~~ ✅ 完成（BattleHUD — Buff 圖標/能量條/技能彈幕/屬性相剋指示）

### Google Sheets API

| 用途 | 方法 | 端點 |
|------|------|------|
| 讀取英雄資料 | GET | `AKfycbxXdy3QCv...exec` |
| 寫入/更新資料 | POST | `AKfycbzy3EHTCy...exec` |

POST 格式：`{ action: "updateHeroes", newColumns: [...], data: [{HeroID:N, ...}] }`
回傳：`{ success: true, updated: N }`

### 下一步（7 Phase 路線圖）
1. ~~Phase 1: 認證系統~~ ✅ 完成
2. ~~Phase 2: 存檔系統~~ ✅ 完成（save-system.md v0.2 + 資源計時器 + HUD 資源顯示）
3. ~~Phase 3: 主選單 UI~~ ✅ 完成（MainMenu + HeroListPanel + InventoryPanel + GachaScreen + StageSelect）
4. ~~Phase 4: 養成系統~~ ✅ Domain 完成（progressionSystem.ts + inventoryService.ts + progressionService.ts + GAS 20+ handlers）
5. ~~Phase 5: 關卡系統~~ ✅ Domain 完成（stageSystem.ts + GAS complete-stage/tower/daily）
6. ~~Phase 6: 抽卡系統~~ ✅ Domain 完成（gachaSystem.ts + GAS gacha-pull）
7. ~~Phase 7: 戰鬥 UI 強化~~ ✅ 完成（BattleHUD — Buff/Debuff icons + Energy bar + Skill toast + Element hints）

### 測試
- Vitest 1.6.1: **224 tests pass** (10 test files)
  - damageFormula: 19 | buffSystem: 33 | boundary: 24 | targetStrategy: 18 | energySystem: 14 | battleEngine: 13 | elementSystem: 12
  - **NEW** progressionSystem: 45 | stageSystem: 25 | gachaSystem: 21
- `tsc --noEmit`: 零錯誤
- `vite build`: 成功（634 modules）

### Phase 3 + Phase 7 新增檔案清單
| 檔案 | 用途 |
|------|------|
| `src/components/MainMenu.tsx` | 主選單導航中心（~130 行） |
| `src/components/HeroListPanel.tsx` | 英雄列表面板（~241 行） |
| `src/components/InventoryPanel.tsx` | 背包面板（~175 行） |
| `src/components/GachaScreen.tsx` | 召喚/抽卡畫面（~203 行） |
| `src/components/StageSelect.tsx` | 關卡選擇面板（~294 行） |
| `src/components/BattleHUD.tsx` | 戰鬥增強 HUD（~302 行） |
| `src/App.css` | +600 行新 CSS（主選單/面板/抽卡/關卡/BattleHUD） |
| `src/App.tsx` | 整合全部新元件 + MAIN_MENU GameState |
| `src/types.ts` | +MAIN_MENU GameState + MenuScreen type |

### 技術債
- App.tsx 仍有舊版 target strategy 程式碼（dead code，可清除）
- `getHeroSpeed()` 多重 fallback 欄位名 — 已透過 domain 層 FinalStats 統一
- 敵方陣型隨機生成較簡陋（隨機 1~6 隻）— 需串接 stage_configs
- heroes 表 Element 用中文（闇/毒/火/冰/雷/光），domain 用英文 — `toElement()` 橋接
- **Bug #002 已修復**: `calculateDamage()` 中 ATK buff 雙重套用 — `getAttackerDamageModifier` 移除 atk_up/atk_down，`getTargetDamageModifier` 移除 def_down
- ESLint 殘餘 42 問題（28 errors + 14 warnings），多為 unused-vars / prefer-const / Math.random purity
