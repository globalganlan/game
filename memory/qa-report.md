# 🧪 QA 測試報告 — Domain Engine v1.0

> 測試日期：2025-01-XX
> 測試角色：🧪 QA 品管測試師
> 測試框架：Vitest 1.6.1

---

## 📊 測試總覽

| 檢查項目 | 結果 | 說明 |
|----------|------|------|
| TypeScript 編譯 | ✅ PASS | `tsc -b --noEmit` — 零型別錯誤 |
| ESLint 靜態分析 | ✅ FIXED | 原有 22 個解析錯誤（缺 TS parser）→ 已修復，剩 28 errors + 14 warnings |
| Vite 生產建置 | ✅ PASS | 618 modules, 12s, 1,324KB JS (382KB gzip) |
| 單元測試 | ✅ 133/133 PASS | 7 test files, 0 failures |
| 數值模擬 (1000 場) | ✅ PASS | 玩家 50.8% / 敵方 49.2% / 平手 0% |
| 邊界條件測試 | ✅ 24/24 PASS | HP/能量/空陣列/極端值/NaN 保護 |

---

## 🐛 發現的 Bug

### Bug #001 — ESLint 缺少 TypeScript Parser ✅ 已修復

- **嚴重度**：Minor（不影響 runtime）
- **問題**：`eslint.config.js` 只有 `@eslint/js` recommended，無 `typescript-eslint`，導致所有 `.ts/.tsx` 解析失敗
- **修復**：安裝 `typescript-eslint` + `@typescript-eslint/parser`，更新 `eslint.config.js` 添加 TS parser

### Bug #002 — ATK Buff 雙重套用 ✅ 已修復

- **嚴重度**：Medium（數值偏差）
- **問題**：`calculateDamage()` 中，ATK buff 被套用兩次：
  1. `getBuffedStats(attacker)` — 將 `atk_up` 計入最終 ATK
  2. `getAttackerDamageModifier(attacker)` — 再次讀取 `atk_up` 作為傷害乘數
  - 同理 `def_down` 也在 `getBuffedStats` 和 `getTargetDamageModifier` 雙重計算
- **影響**：30% ATK buff 實際效果為 ~69%（1.3 × 1.3），削弱了 buff 平衡性
- **修復**：`getAttackerDamageModifier` 移除 `atk_up`/`atk_down` 讀取（已在 `getBuffedStats` 處理）；`getTargetDamageModifier` 移除 `def_down`（已透過 DEF 減傷公式反映）
- **狀態**：✅ 已修復

### Bug #003 — tickStatusDurations 永久 buff 誤判 ✅ 已修復

- **嚴重度**：High（影響戰鬥核心邏輯）
- **問題**：`tickStatusDurations()` 中，duration 從 1→0 後，`isPermaBuff()` 誤判為永久效果（因 duration===0），導致已到期 buff 不被移除
- **影響**：所有 1 回合 buff（暈眩、冰凍等控制效果尤其嚴重）永遠不會消失
- **修復**：在倒數前先標記原本就是永久的效果（`permaBefore` Set），過濾時只保留「原本永久」或「duration>0」的效果

### Bug #004 — runBattle break 後誤判平手 ✅ 已修復

- **嚴重度**：High（影響勝負結果）
- **問題**：`runBattle()` 回合開始時的 early-break（`alivePlayers.length === 0 || aliveEnemies.length === 0`）跳出迴圈後，直接到 `return 'draw'`，忽略了哪一方被全滅
- **影響**：battle_start 被動或上一回合末尾擊殺造成的全滅 → 勝方被判定為平手
- **修復**：迴圈結束後增加一次勝負判定（先檢查兩方 HP），再 fallback 到 draw

---

## ⚠️ 警告事項

### Warning #001 — Bundle Size > 500KB

- `index-*.js` 為 1,324KB (gzip 382KB)
- 主因：Three.js (~1MB) 佔大宗
- 建議：未來可用 `manualChunks` 拆分 Three.js

### Warning #002 — ESLint 殘餘問題 (42 problems)

修復 TS parser 後，ESLint 發現 42 個真實問題：
- 28 errors: `no-unused-vars` (2), `prefer-const` (多處), `react-hooks/purity` (Arena.tsx Math.random), `@typescript-eslint/no-unused-vars` (多處)
- 14 warnings: `@typescript-eslint/no-explicit-any`, unused eslint-disable directives
- 非阻塞性，建議後續逐步清理

---

## 🧪 測試覆蓋範圍

### 已測試模組

| 模組 | 測試數 | 覆蓋函式 |
|------|--------|----------|
| elementSystem | 12 | getElementMultiplier, isWeakness, isResist, loadElementMatrix |
| buffSystem | 33 | applyStatus, removeStatus, cleanse, processDotEffects, processRegen, tickStatusDurations, tickShieldDurations, getStatusValue, hasStatus, isControlled, isSilenced, isFeared, hasTaunt, isDebuff, getBuffedStats, absorbDamageByShields |
| energySystem | 14 | addEnergy, turnStartEnergy, onAttackEnergy, onBeAttackedEnergy, onKillEnergy, consumeEnergy, canCastUltimate, getEnergyConfig |
| damageFormula | 19 | calculateDamage, calculateHeal, calculateDot, calculateReflect |
| targetStrategy | 18 | selectTargets (8 types + regex), selectNormalAttackTarget (嘲諷/前排/後排/全滅) |
| battleEngine | 13 | createBattleHero (星級被動), checkLethalPassive, runBattle (整合+1000場模擬) |
| 邊界條件 | 24 | HP 上下限, 能量 overflow, 空陣列, ATK=0/DEF=0, 極端數值, 1v1, 6v6 |

### 未測試項目

- services 層 (sheetApi, dataService) — 需 mock HTTP
- React 元件 (App.tsx, UIOverlay, Arena, Hero, ZombieModel) — 需 React Testing Library
- 3D 渲染 / 動畫 / RWD — 需 E2E 測試框架
- Google Sheets 實際讀寫 — 需 integration test 環境

---

## 📈 數值模擬詳情

### 1v1 對稱對戰 (1000 場)

- 雙方屬性完全相同：HP=1000, ATK=150, DEF=50, SPD=100, CritRate=15, CritDmg=50
- SPD 微調（±10）模擬隨機性
- 結果：**Player 50.8% / Enemy 49.2% / Draw 0%**
- 評估：✅ 公平對戰下勝率均衡，無明顯先手優勢

### HP 差異測試 (10 場)

- 玩家 HP=5000 vs 敵方 HP=100
- 結果：玩家勝率 > 80%
- 評估：✅ HP 差距正確反映在勝率上
