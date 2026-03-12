# 遊戲規格總索引 — Game Spec Registry

> **本檔案是遊戲所有系統規格的單一入口。每次新對話必須讀取此檔案以取得最新規格狀態。**
> 
> 最後更新：2026-03-12

## 規格架構原則

1. **模組化** — 每個遊戲系統一個獨立 spec 檔，互不耦合
2. **版本化** — 每個 spec 有版本號，每次修改必須 bump version + 記錄到 `.ai/memory/changelog.md`
3. **介面契約** — spec 之間透過明確定義的「依賴」與「輸出」欄位銜接
4. **向下相容** — 新 spec 或修改不可破壞既有系統，除非經過衝突審查流程

## Spec 清單

| 檔案 | 系統 | 版本 | 狀態 |
|------|------|------|------|
| `.ai/specs/core-combat.md` | 回合制戰鬥系統（Domain Engine + Command Pattern） | v3.9 | 🟢 已實作 |
| `.ai/specs/hero-schema.md` | 英雄資料結構（三層型別：RawHeroData → RawHeroInput → BattleHero + HeroInstance.stars） | v2.5 | 🟢 已實作 |
| `.ai/specs/damage-formula.md` | 傷害公式（9 步流程：閃避→DEF→暴擊→~~屬性~~→護盾→反彈） | v1.2 | 🟢 已實作 |
| `.ai/specs/skill-system.md` | 技能系統（SkillTemplate + SkillEffect + Sheets 資料管線） | v1.4 | 🟢 已實作 |
| ~~`.ai/specs/element-system.md`~~ | ~~屬性剋制系統（7 屬性矩陣 + 動態載入 + 中英對照）~~ — 2026-03-11 完整移除 | v1.1 | 🔴 已廢棄 |
| `.ai/specs/tech-architecture.md` | 技術架構（含 Domain + Services 分層 + Audio Engine + CurrencyIcon） | v1.8 | 🟢 定稿 |
| `.ai/specs/progression.md` | 養成系統（等級/突破/星級/裝備模板制 v2/套裝 + UI 全面實作） | v2.0 | 🟢 已實作 |
| `.ai/specs/auth-system.md` | 帳號系統（訪客 + 綁定帳密 + 登出保留 token） | v1.4 | 🟢 已實作 |
| `.ai/specs/save-system.md` | 存檔系統（Google Sheets 存進度 + 資源計時器 + 初始 3 英雄自動陣型 + 登出重置 + equipment JSON） | v1.6 | 🟢 已實作 |
| `.ai/specs/stage-system.md` | 關卡系統（主線/爬塔/每日副本/PvP/Boss + handleCompleteBattle_ 統一結算） | v3.1 | 🟢 已實作 |
| `.ai/specs/gacha.md` | 抽卡系統（本地池架構 + 裝備抽卡 v2） | v1.4 | 🟢 已實作 |
| `.ai/specs/inventory.md` | 背包與道具系統（5 類道具、14 個 service 函式 + UI + CurrencyIcon） | v2.0 | 🟢 已實作 |
| `.ai/specs/mailbox.md` | 信箱系統（預載/樂觀領取/幂等保護/離線補償） | v1.0 | 🟢 已實作 |
| ~~`.ai/specs/optimistic-queue.md`~~ | ~~樂觀更新佇列~~ — 已刪除（遷移至 Workers 後廢棄） | — | 🔴 已廢棄 |
| `.ai/specs/local-storage-migration.md` | localStorage Schema 版本遷移（版本化 + 自動 migration + 安全降級） | v1.0 | 🟢 已實作 |
| `.ai/specs/ui-flow.md` | UI 流程與畫面定義（GameState/MenuScreen 8 值/導航函式/條件式過場幕/CurrencyIcon） | v2.9 | 🟢 已實作 |
| `.ai/specs/audio.md` | 音效與音樂系統（Web Audio API 合成 BGM 6 曲目 + SFX 9 種 + AudioManager） | v0.3 | 🟢 已實作 |
| `.ai/specs/buff-debuff-icons.md` | Buff/Debuff 3D 狀態圖示（綠底/紅底 + 疊層數 + 模型上方顯示） | v1.0 | 🟢 已實作 |
| `.ai/specs/buff-apply-toast.md` | Buff/Debuff 施加漂浮文字（含 DOT 中文名稱 + 綠/紅色區分） | v1.0 | 🟢 已實作 |
| `.ai/specs/combat-power.md` | 戰力系統（六維加權公式 + HUD 顯示 + 敵我對比 + 戰力變化動畫） | v0.1 | ⬜ 未實作 |
| `.ai/specs/arena-pvp.md` | 競技場排名（500 名制 + 防守陣型 + NPC 佔位 + 每週重置 + 4 層獎勵） | v0.1 | ⬜ 未實作 |
| `.ai/specs/item-acquire-toast.md` | 獲得物品動畫提示（5 類物品 + 稀有度光效 + 佇列播放 + 合併列表 + 跳過機制） | v0.1 | ⬜ 未實作 |
| `.ai/specs/narrative.md` | 敘事與世界觀（主線章節/角色背景/劇情系統） | v0.1 | ⬜ 未實作 |

> 狀態：🟢 已實作/定稿 ｜ 🟡 草案 ｜ 🔴 衝突待解 ｜ ⚪ 待建立

### 已實作系統摘要

| 原始碼 | 對應 Spec | 說明 |
|--------|----------|------|
| `src/domain/battleEngine.ts` | core-combat | 戰鬥主迴圈 + BattleHero 工廠 |
| `src/domain/damageFormula.ts` | damage-formula | 傷害/治療/DOT/反彈公式 |
| `src/domain/buffSystem.ts` | core-combat §5 | Buff/Debuff 施加/結算/查詢 |
| `src/domain/energySystem.ts` | core-combat §4 | 能量獲取/消耗/大招判定 |
| `src/domain/targetStrategy.ts` | core-combat §7 | 目標選擇策略 |
| ~~`src/domain/elementSystem.ts`~~ | ~~element-system~~ | ~~屬性剋制矩陣~~（2026-03-11 已刪除） |
| `src/domain/types.ts` | hero-schema, skill-system | 核心型別定義 |
| `src/services/dataService.ts` | skill-system §6-7 | Sheets → domain 轉換 |
| `src/services/sheetApi.ts` | tech-architecture | API 封裝 + 快取 |
| `src/services/optimisticQueue.ts` | optimistic-queue | 樂觀更新佇列核心 |
| `src/services/authService.ts` | auth-system | 登入/註冊/綁定帳號 |
| `src/services/saveService.ts` | save-system | 存檔載入/儲存/資源收集 |
| `src/services/progressionService.ts` | progression | 養成 API（11 個 Optimistic Queue 操作） |
| `src/services/inventoryService.ts` | inventory | 背包管理（18 個函式） |
| `src/services/mailService.ts` | mailbox | 信箱預載/領取/刪除 |
| `src/domain/progressionSystem.ts` | progression | 養成公式/常數/數值計算 |
| `src/components/UIOverlay.tsx` | ui-flow | UI 層條件渲染 |
| `src/services/audioService.ts` | audio | Web Audio API 合成 BGM + SFX 單例管理器 |
| `src/components/CurrencyIcon.tsx` | ui-flow §6.14 | 統一貨幣 icon 元件（CSS badge） |
| `src/constants/rarity.ts` | inventory, ui-flow | 道具 icon/名稱/稀有度共用常數 |
| `src/components/ShopPanel.tsx` | inventory | 商店面板（4 類商品 + 購買流程） |
| `src/components/SettingsPanel.tsx` | audio, ui-flow | 設定面板（音量滑桿 + 靜音 + 帳號） |
| `src/components/SceneWidgets.tsx` | buff-debuff-icons, buff-apply-toast | BuffIcons3D + BuffApplyToast3D 3D 狀態圖示/漂字 |
| `workers/src/routes/*.ts` | auth, save, battle, progression, inventory, mail, gacha, arena, sheet, checkin | Workers 全部 handler |

## Spec 檔案格式規範

每個 spec 檔案必須包含以下結構：

```markdown
# [系統名稱] Spec

> 版本：vX.Y ｜ 狀態：🟡 草案 / 🟢 已實作
> 最後更新：YYYY-MM-DD
> 負責角色：🎯 GAME_DESIGN / 🔧 CODING / ...

## 概述
## 依賴
## 實作對照（若有程式碼）
## 詳細規格
## 擴展點
## 變更歷史
```

## 新增 / 修改 Spec 的流程

```
使用者提出新點子
       ↓
🎯 GAME_DESIGN 分析：
  1. 這是新 spec 還是修改既有 spec？
  2. 影響哪些現有 spec？（依賴掃描）
  3. 有無衝突？
       ↓
  ┌─ 無衝突 → 直接寫入/更新 spec → 更新本索引 → 記錄 changelog
  └─ 有衝突 → 輸出衝突報告 → 提出解決方案 → 修正 → 記錄 changelog + decision
```
