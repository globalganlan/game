# 變更日誌 — Changelog

> 按時間倒序排列，最新的在最上面。

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
- `specs/auth-system.md` v1.2→v1.3（綁定獎勵）
- `specs/save-system.md` v1.2→v1.3（pwaRewardClaimed 欄位）
- `specs/tech-architecture.md` v1.5→v1.6（PWA 已實作）

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
- **Spec 更新**：`specs/skill-system.md` v1.2→v1.3

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
- **Spec 更新**：`specs/skill-system.md` v1.1→v1.2

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
- **主動技能倍率調整**（`scripts/skill_data_zh.json` → Google Sheets）：
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
- **規格更新**：`specs/progression.md` v1.2→v1.3, `specs/skill-system.md` v1.0→v1.1

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
- **Spec 更新**：`specs/stage-system.md` v1.1→v1.2
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
  - `scripts/skill_data_zh.json` + `scripts/rebuild_skill_templates.ps1`
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
  - 新增 `specs/ui-flow.md` v1.0 — 完整記錄 GameState（6 值）、MenuScreen（7 值）、所有導航函式、TransitionOverlay 過場幕機制、元件規格、載入流程（Phase 0/1/2）、戰鬥完整流程
  - 更新 `specs/README.md` — ui-flow 狀態改為 🟢 已實作

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
  - `specs/tech-architecture.md` v1.2 → v1.3 — 新增「GAS CacheService 快取層」章節

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
  - `specs/save-system.md` v0.3→v0.4 — 移除 battleSpeed 相關欄位/sanitization/API
  - `specs/core-combat.md` v2.2→v2.3 — 速度持久化改用 localStorage
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
  - `specs/core-combat.md` v2.1→v2.2 — 新增 §10.3~§10.6（SkillToast3D/ElementHint3D、waitForAction collision protection、visibilitychange mixer catch-up、attacker reflect-death）+ battleSpeed 持久化 + 元件樹更新
  - `specs/save-system.md` v0.2→v0.3 — 新增 stageStars/battleSpeed 欄位、陣型自動存讀、sanitization、Optimistic Queue、getSaveState() API
  - `specs/gacha.md` v1.0→v1.1 — LocalPullResult 新增 stardust/fragments
  - `specs/stage-system.md` v0.2→v0.3 — 三星鎖定、模式解鎖 toast、過場遮幕、爬塔勝利顯示
  - `specs/inventory.md` v0.1→v0.2 — Optimistic Queue + localStorage cache + hero fragment thumbnail
  - `specs/progression.md` v0.2→v0.3 — Optimistic Queue + 自動等級算 + EXP bar
  - `specs/tech-architecture.md` v1.1→v1.2 — 三階段 loading + Optimistic Queue 表 + visibilitychange + heroesListRef

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
  - 已寫入 `specs/core-combat.md` 第十一節

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
