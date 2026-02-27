# 🧪 QA 知識庫 — 測試規範與驗收標準

> 建立日期：2026-02-27
> 角色：06-QA Testing Agent
> 目的：確保每次 RD 交付的版本不只「零紅字」，而是**真正可用、正確呈現、符合 Spec**

---

## 🔴 核心原則

> **「沒有紅字 ≠ 沒有 Bug」**
>
> QA 的職責不只是跑 `tsc --noEmit` 和 `vite build`。
> 每次 RD 改完後，QA 必須**親自驗證改動有沒有正確呈現在畫面上**，
> 包括：資料是否正確顯示、動畫是否正常播放、戰鬥流程有無邏輯錯誤、是否符合 Spec。

### ⛔ 強制規則：RD 完成功能後 QA 必須實際進遊戲驗證

> **此規則跨對話永久生效。新對話看到此處必須遵守。**

1. **RD 寫完功能不等於完成** — 必須啟動遊戲（`npx vite --port 5174`），用 Puppeteer 或手動進入對應畫面實際操作
2. **能用自動化就用自動化** — 優先使用 `scripts/qa_test_*.mjs` 腳本進行 E2E 測試
3. **確認功能可用後才能回覆使用者「完成」** — 不可以只報告 `tsc` + `vite build` 通過就結束
4. **測試流程必須覆蓋使用者會走的路徑** — 登入 → 到達功能畫面 → 操作 → 驗證結果
5. **截圖存證** — 將關鍵畫面截圖存入 `qa_screenshots/` 以供查閱
6. **必須測試真實帳號的既有資料狀態** — 不能只用乾淨環境（Case 5 教訓），要模擬/使用有歷史資料的帳號
7. **Puppeteer E2E 通過不等於使用者沒問題** — headless 乾淨環境會遺漏邊界情況，要用 `page.evaluate` 注入既有 localStorage 或用真實 token 測試

---

## 📋 驗收 Checklist（每次 RD 交付必做）

### 一、編譯與建置（基本門檻）

- [ ] `npx tsc --noEmit` — 零型別錯誤
- [ ] `npx vite build` — 編譯成功
- [ ] 單元測試全過 — `npx vitest run`

### 二、視覺驗證（必須親眼看）

> 不能只靠編譯結果，必須啟動 dev server 實際查看。

- [ ] 開啟 `http://localhost:5174/game/` 確認遊戲可正常載入
- [ ] 開啟 QA 驗證頁面（如 `qa-skills.html`）確認資料正確呈現
- [ ] 確認修改的 UI 元素有正確顯示（文字、icon、排版、顏色）
- [ ] 確認中文顯示無亂碼（不含 `?`、方塊字、`撠`、`璉`、`銋` 等）
- [ ] 確認 emoji icon 正確渲染，不是文字 key（如 `flame_burst`）
- [ ] 確認 RWD 響應式佈局在 mobile / tablet / desktop 皆正常

### 三、戰鬥流程測試

> 每次涉及戰鬥、技能、數值的改動，必須完整跑一輪。

- [ ] 登入 → 載入 → 選英雄 → 編隊 → 開始戰鬥
- [ ] 戰鬥中角色依速度排序行動
- [ ] 普通攻擊：走到目標 → 播放攻擊動畫 → 扣血 → 退回原位
- [ ] 技能釋放：能量滿後觸發大招，傷害/治療數值正確
- [ ] 被動觸發：on_attack / on_kill / hp_below_pct 等被動正確生效
- [ ] Buff/Debuff：圖標顯示、持續回合數、過期移除
- [ ] DOT（灼燒/中毒）：每回合正確結算傷害
- [ ] 屬性剋制：fire vs water 等倍率正確（參照 `specs/element-system.md`）
- [ ] 死亡處理：HP ≤ 0 播放死亡動畫、從行動序列移除
- [ ] 致命被動（殘存意志）：觸發後以 1 HP 存活
- [ ] 戰鬥結束 → GAMEOVER 畫面 → 重啟不會壞

### 四、動畫播放驗證

- [ ] idle → attack → hurt → dying 四種動畫切換流暢
- [ ] `crossFadeTo()` 過渡無 bind-pose 閃現
- [ ] 角色走位到目標位置無穿模、不漂浮
- [ ] 死亡動畫播完後角色不再行動
- [ ] 過場幕：初載 + 重啟 → 先拉遮幕 → 等不透明 → 重置 → 收幕

### 五、遊戲邏輯 & Spec 合規

> 以 `specs/` 目錄下的各 spec 文件為基準驗證。

- [ ] 傷害公式符合 `specs/damage-formula.md`
- [ ] 技能效果符合 `specs/skill-system.md`
- [ ] 被動觸發機制符合 `specs/core-combat.md` §6
- [ ] 能量系統符合 `specs/core-combat.md` §4（滿 1000 可放大招）
- [ ] 屬性剋制倍率符合 `specs/element-system.md`
- [ ] 被動解鎖星級符合 `specs/progression.md`（1★→1被動, 2★→2, 4★→3, 6★→4）
- [ ] 養成數值（升級、突破、裝備）計算正確

### 六、資料抽查（Google Sheet ↔ 前端）

> 每次涉及 Sheet 資料的改動，必須讀回驗證。

- [ ] 用 API 讀回 Sheet 資料，抽查中文欄位正確
- [ ] 確認 Icon 欄位是 emoji 而非文字 key
- [ ] 確認所有描述含中文（不是純英文）
- [ ] 確認無亂碼字元（`\ufffd`、Big5 殘碼）
- [ ] 確認 stageId "1-1" 等格式未被 Sheets 自動轉為日期
- [ ] 確認 hero_skills 每個 heroId 恰好 1 筆（無重複、無遺漏）

### 七、邊界條件與異常處理

- [ ] 空資料：無技能 / 無裝備 / 無英雄時，UI 不崩潰
- [ ] 重複資料：hero_skills 重複 heroId 不會渲染雙份
- [ ] 缺失資料：skillId 找不到對應 template 時，顯示 fallback 而非空白
- [ ] 數值邊界：HP=0 / 能量溢出 / ATK=0 / DEF=0 不會 NaN
- [ ] 快速連點：按鈕不會重複觸發
- [ ] 網路異常：API 超時或失敗時有錯誤提示

---

## 🛠️ QA 工具與驗證頁面

| 工具 | 路徑 | 用途 |
|------|------|------|
| QA 技能驗證頁 | `public/qa-skills.html` | 從 API 載入技能資料，自動化檢查 + 模擬 HeroDetail 渲染 |
| QA 抽卡 E2E | `scripts/qa_test_gacha.mjs` | Puppeteer 自動：登入 → 召喚畫面 → 單抽/十連 → 驗證結果+鑽石 |
| 單元測試 | `npx vitest run` | Domain Engine 133+ 測試案例 |
| TypeScript | `npx tsc --noEmit` | 型別檢查 |
| Vite build | `npx vite build` | 生產環境建置 |

### QA 驗證頁自動化檢查項目（`qa-skills.html`）

| 項目 | 說明 |
|------|------|
| skill_templates 筆數 | 63 筆（7 主動 + 56 被動） |
| hero_skills 筆數 | ≥14 筆 |
| 技能名稱全中文 | 名稱不含純英文 |
| Icon 是 emoji | 不是 `flame_burst` 之類的文字 key |
| 描述含中文 | 無純英文描述 |
| 無亂碼 | 不含 `\ufffd` 或 Big5 殘碼 |
| Hero 14 存在且唯一 | hero_skills 中恰 1 筆 |
| hero_skills 無重複 | 每個 heroId 恰好出現 1 次 |
| SKL_ICE_PRISON 冰獄 | 新技能存在且正確 |

---

## 📐 Spec 對照清單

> QA 驗證邏輯時，必須參照以下 spec 文件。

| Spec 文件 | 關鍵驗證點 |
|-----------|-----------|
| `specs/core-combat.md` | 戰鬥迴圈 / 能量系統 / Buff 持續 / 被動觸發 |
| `specs/damage-formula.md` | 傷害 = ATK × 技能倍率 × 剋制 × 暴擊 ÷ 防禦係數 |
| `specs/skill-system.md` | 主動技 1 個 / 被動技 4 個 / 星級解鎖 |
| `specs/element-system.md` | 6 屬性剋制表 / 剋制 +30% / 被剋 -30% |
| `specs/hero-schema.md` | 角色屬性欄位 / 稀有度 / 類型 |
| `specs/progression.md` | 升級 / 突破 / 裝備 / 星級被動解鎖 |
| `specs/gacha.md` | 抽卡機率 / 保底機制 |
| `specs/stage-system.md` | 關卡配置 / 敵方編成 |
| `specs/inventory.md` | 背包 / 物品 / 裝備穿脫 |

---

## 📝 歷史經驗教訓

### Case 1：技能 Icon 顯示文字 key（2026-02-27）

- **問題**：英雄詳情的技能欄位顯示 `flame_burst` 而非 🔥，名稱是英文 `Flame Burst`
- **根因**：skill_templates Google Sheet 的 icon 欄是英文 key、name 是英文
- **修復**：(1) 前端加 `resolveSkillIcon()` fallback (2) Sheet 全面中文化 63 筆 (3) hero 14 補齊
- **教訓**：RD 交付後 QA 應打開英雄詳情頁實際查看，不能只看 tsc 通過

### Case 2：Hero 14 在 hero_skills 重複（2026-02-27）

- **問題**：deleteRows + appendRows 操作順序問題導致 hero 14 出現 2 筆
- **根因**：第一次 appendRows 的結果被誤判為失敗，又 append 了一次
- **修復**：deleteRows 清掉所有 heroId=14 → 重新 append 1 筆 → 驗證恰好 1 筆
- **教訓**：Sheet 寫入後必須立即讀回驗證 count，不能只看 API 回傳 success

### Case 3：3 筆描述純英文（2026-02-27）

- **問題**：`SPD +10%`、`DEF +10%`、`SPD +15%` 不含中文字元
- **修復**：updateSheet 補上中文前綴「速度提升」「防禦提升」
- **教訓**：QA 驗證頁的正則要能抓到邊界 case

### Case 4：PowerShell Big5 編碼破壞中文（ADR-002）

- **問題**：PowerShell `.ps1` 檔案內嵌中文 → `ConvertFrom-Json` 亂碼
- **解法**：(1) JSON 用 `create_file` 寫入 UTF-8 檔案 (2) PowerShell 用 `[System.IO.File]::ReadAllBytes` + `UTF8.GetString` 讀取 (3) 或改用 Node.js `fetch` 發送
- **教訓**：Windows PowerShell 5.1 預設編碼不是 UTF-8，含中文的 API 呼叫必須特別處理

### Case 5：抽卡系統 QA 測試（2026-02-27）

- **測試方式**：Puppeteer E2E（`scripts/qa_test_gacha.mjs`）
- **測試流程**：啟動遊戲 → 自動登入 → 進入主選單 → 點「召喚」→ 單抽 → 驗證結果 → 十連抽 → 驗證鑽石扣除
- **測試結果**：~~✅ 通過~~ → ❌ **假陽性**（QA 誤判）
- **QA 失職**：
  - QA 報告「通過」，但使用者實際操作立即 crash
  - `TypeError: Cannot create property 'pullsSinceLastSSR' on string`
  - `_pityState` 是 JSON 字串而非物件
- **根因**：
  - GAS Sheets 中 `gachaPity` 欄被雙重序列化 → `JSON.parse` 只解了一層，回傳仍是字串
  - Puppeteer 用乾淨 headless Chrome（無 localStorage、無歷史資料），環境太乾淨
  - **沒有用使用者的真實帳號、真實瀏覽器狀態測試**
- **修復**：`initLocalPool` + `doRefill` 加入 `typeof === 'string'` 檢查自動 `JSON.parse`
- **教訓（重要！必須記住！）**：
  1. **QA 測試必須使用真實帳號資料**，不能只用乾淨環境
  2. **GAS 回傳的欄位不能假設已解析** — JSON 欄位任何時候都可能是字串或物件，前端必須 defensive 處理
  3. **Puppeteer E2E 通過 ≠ 使用者端沒問題** — headless 環境太乾淨，缺少既有資料的邊界情況
  4. **QA 的最高標準是「使用者不會撞到 Bug」**，不是「自動化測試通過」

### ⛔ QA 新增規則：GAS JSON 欄位 Defensive Parsing

> **此規則跨對話永久生效。**

- GAS Sheets 中所有 JSON 欄位（`gachaPity`、`storyProgress`、`formation`、`equippedItems` 等）前端接收後**一律做 defensive parsing**：
  ```typescript
  // 正確做法
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  // 錯誤做法（會炸）
  const parsed = value  // 假設已經是物件
  ```
- QA 測試時必須**注入既有的 localStorage 資料**模擬舊帳號狀態
- 新增功能涉及 GAS 資料傳遞時，QA 必須同時測「全新帳號」和「有歷史資料的舊帳號」

### ⛔ QA 新增規則：抽卡保底大量測試

> **此規則跨對話永久生效。任何抽卡邏輯修改後必須執行。**

- 使用 `scripts/qa_gacha_stress.mjs` 執行 200 抽壓力測試
- 驗證項目：
  1. 保底計數器**永遠不超過 90**（硬保底上限）
  2. 保底計數器**不會亂跳**（單抽：+1 或歸零；不可跳躍 >3）
  3. SSR 出現時保底**歸零**
  4. SSR 出現率在合理範圍（≥1%，期望 ~3.5%）
- **refill race condition 防護**：
  - `doRefill()` 必須用 **append** 新 entries（不可 replace 全池）
  - `doRefill()` 不可覆蓋 client `_pityState`（client pity 僅由 `initLocalPool` 和 `localPull` 維護）
  - 測試工具：`scripts/qa_gacha_stress.mjs`

### ⛔ QA 新增規則：localStorage 版本遷移

> **此規則跨對話永久生效。**

- 任何 localStorage 結構變更必須 bump `CURRENT_SCHEMA_VERSION` 並撰寫 migration 函式
- 測試方法：DevTools 手動設 `globalganlan_schema_version = N-1`，塞舊結構 → 重整頁面 → 確認遷移正確
- 遷移引擎：`src/services/localStorageMigration.ts`，在 `main.tsx` 中 `createRoot()` 前同步執行

---

## 🔁 持續改進

- 每次發現新的 QA 盲點，補入本文件
- 新增功能時，對應新增 QA 驗證頁面或自動化測試
- 定期檢查 spec 文件與實際行為是否一致
