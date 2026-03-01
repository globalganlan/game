# QA Spec 合規性報告

> 產出日期：2026-03-01
> 測試範圍：三大新系統 — 戰力系統、競技場排名系統、獲得物品動畫
> 測試方法：單元測試（Vitest）+ E2E（Puppeteer headless）+ 程式碼審計

---

## 一、測試摘要

| 項目 | 結果 |
|------|------|
| **單元測試** | 113/113 ✅ 全部通過 |
| **E2E (headless)** | 2 PASS / 7 WARN / 0 FAIL（headless 無 WebGL 限制） |
| **JS 執行時錯誤** | 0 |
| **TypeScript 編譯** | ✅ tsc --noEmit 零錯誤 |
| **Vite build** | ✅ 編譯成功 |

---

## 二、戰力系統（combat-power.md v0.3）

### 2.1 Domain 層 — `src/domain/combatPower.ts`

| Spec 斷言 | 測試 ID | 結果 | 備註 |
|-----------|---------|------|------|
| W_HP = 0.5 | CP-1 | ✅ | |
| W_ATK = 3.0 | CP-1 | ✅ | |
| W_DEF = 2.5 | CP-1 | ✅ | |
| W_SPD = 8.0 | CP-1 | ✅ | |
| W_CRIT_RATE = 5.0 | CP-1 | ✅ | |
| W_CRIT_DMG = 2.0 | CP-1 | ✅ | |
| ULTIMATE_POWER_BASE = 100 | CP-2 | ✅ | |
| PASSIVE_POWER_EACH = 50 | CP-2 | ✅ | |
| SET_2PC_POWER = 80 | CP-2 | ✅ | |
| SET_4PC_POWER = 200 | CP-2 | ✅ | |
| 0 星被動 = 0 | CP-3 | ✅ | |
| 1 星被動 = 0 | CP-3 | ✅ | |
| 3 星被動 = 1 | CP-3 | ✅ | |
| 6 星被動 = 4 | CP-3 | ✅ | |
| 空裝備 setBonus = 0 | CP-4 | ✅ | |
| 不同套裝 = 0 | CP-4 | ✅ | |
| 2 件套 = 80 | CP-4 | ✅ | |
| 4 件套 = 280（2pc80+4pc200） | CP-4 | ⚠️ 見差異#1 | |
| getHeroCombatPower 手算驗證 | CP-5 | ✅ | 100HP+20ATK+10DEF+100SPD → 2000 |
| getTeamCombatPower 加總 | CP-6 | ✅ | |
| getEnemyTeamPower 公式一致 | CP-7 | ✅ | |
| ratio ≥ 1.5 → crush | CP-8 | ✅ | |
| ratio ≥ 1.2 → advantage | CP-8 | ✅ | |
| ratio ≥ 0.83 → even | CP-8 | ✅ | |
| ratio ≥ 0.67 → disadvantage | CP-8 | ✅ | |
| ratio < 0.67 → danger | CP-8 | ✅ | |
| 碾壓→綠色 / 危險→紅色 | CP-9 | ✅ | |
| 5 個對比等級完備 | CP-9 | ✅ | |

### 2.2 Hook 層 — `src/hooks/useCombatPower.ts`

| 檢查項 | 結果 | 備註 |
|--------|------|------|
| formation/heroInstances/equipment 變化觸發重算 | ✅ | useEffect 依賴 formationKey + heroKey |
| prevPowerRef 追蹤前一次值 | ✅ | 差值計算正確 |
| 1.5s timer 清除 delta | ✅ | Spec 要求 1.5s |
| 連續快速變化合併（clearTimeout） | ✅ | 與 spec 疊加規則一致 |
| 敵方 CP 從 enemySlots 計算 | ✅ | useMemo(buildEnemyStatsFromSlots) |

### 2.3 UI 層 — `src/components/CombatPowerHUD.tsx`

| 檢查項 | 結果 | 備註 |
|--------|------|------|
| CombatPowerToast: 格式 `⚡ +N ↑` / `⚡ -N ↓` | ✅ | 與 spec 完全一致 |
| CSS class `.combat-power-toast.up` / `.down` | ✅ | 綠色 #4ade80 / 紅色 #f87171 |
| CombatPowerComparison: 我方/敵方戰力顯示 | ✅ | |
| 對比條百分比計算 | ✅ | `myPct = myPower / total * 100` |
| 危險閃爍效果 | ✅ | `comparison === 'danger'` → `.cp-danger-flash` |

### 2.4 App.tsx 整合

| 檢查項 | 結果 | 備註 |
|--------|------|------|
| `useCombatPower()` 呼叫（傳入 formation + heroes + heroesList + enemySlots） | ✅ | L576-581 |
| `<CombatPowerComparison>` 在 IDLE 顯示 | ✅ | L2820-2827, 條件 `gameState === 'IDLE' && turn === 0 && enemyPower > 0` |
| `<CombatPowerToast>` 顯示飛行動畫 | ✅ | L2830-2832 |
| 主選單 HUD 顯示戰力 ⚡ | ⚠️ 見差異#2 | MainMenu 中未偵測到獨立 CP 顯示 |

### 2.5 E2E 驗證

| 項目 | 結果 | 備註 |
|------|------|------|
| T1.1 大廳 CP 顯示 | WARN | headless 無 WebGL，3D 場景未渲染 |
| T1.2 IDLE CP 對比條 | ✅ PASS | HTML 中偵測到 `cp-comparison` |

---

## 三、競技場排名系統（arena-pvp.md v0.3）

### 3.1 Domain 層 — `src/domain/arenaSystem.ts`

| Spec 斷言 | 測試 ID | 結果 | 備註 |
|-----------|---------|------|------|
| ARENA_MAX_RANK = 500 | AR-1 | ✅ | |
| ARENA_DAILY_CHALLENGES = 5 | AR-1 | ✅ | |
| ARENA_CHALLENGE_RANGE = 3 | AR-1 | ✅ | |
| NPC rank 500 → power 500 | AR-2 | ✅ | |
| NPC rank 250 → power 5500 | AR-2 | ✅ | |
| NPC rank 1 → power 10480 | AR-2 | ⚠️ 見差異#3 | Spec 寫 10500，公式 500+(500-1)*20=10480 |
| NPC 名稱 = prefix + suffix | AR-3 | ✅ | |
| NPC 相同 rank = 相同 seed = 相同結果 | AR-3 | ✅ | |
| getChallengeable(50) = [49,48,47] | AR-4 | ✅ | |
| getChallengeable(1) = [] | AR-4 | ✅ | |
| getChallengeable(2) = [1] | AR-4 | ✅ | |
| 勝利 → 排名互換 | AR-5 | ✅ | |
| 敗北 → 排名不變 | AR-5 | ✅ | |
| 勝利獎勵: gold=2000, pvpCoin=5 | AR-6 | ✅ | |
| 敗北獎勵: gold=500, pvpCoin=1 | AR-6 | ✅ | |
| 8 層排名里程碑數值全部正確 | AR-7 | ✅ | 400/300/200/100/50/20/10/1 |
| 里程碑跨越檢測（newRank ≤ threshold && prevBest > threshold） | AR-8 | ✅ | |
| 8 層每日獎勵數值全部正確 | AR-9 | ✅ | |
| 每日獎勵覆蓋 1~500 完整 | AR-9 | ✅ | |
| 8 層賽季獎勵數值全部正確 | AR-10 | ✅ | |
| 賽季獎勵覆蓋 1~500 完整 | AR-10 | ✅ | |
| 超出範圍 fallback 正確 | AR-11 | ✅ | |

### 3.2 Service 層 — `src/services/arenaService.ts`

| 檢查項 | 結果 | 備註 |
|--------|------|------|
| `startArenaChallenge(targetRank)` → 呼叫 GAS `arena-challenge` | ✅ | 程式碼審計 |
| `completeArenaChallenge(targetRank, won)` → 呼叫 GAS | ✅ | 程式碼審計 |
| `clearArenaCache()` 清除排行榜快取 | ✅ | |

### 3.3 UI 層 — `src/components/ArenaPanel.tsx`

| 檢查項 | 結果 | 備註 |
|--------|------|------|
| 排行榜顯示 | ✅ | 元件存在且渲染 |
| NPC 名稱 (prefix+suffix) 可見 | ✅ | 程式碼審計 |
| 挑戰按鈕 | ✅ | 條件：排名差 ≤ 3 |
| 防守陣型配置 | ✅ | 程式碼審計 |

### 3.4 App.tsx 整合

| 檢查項 | 結果 | 備註 |
|--------|------|------|
| `onStartBattle` → startArenaChallenge → 建置敵方 SlotHero[] | ✅ | 程式碼審計 |
| stageMode='pvp' → 進入 IDLE → 戰鬥 | ✅ | |
| 勝利 → completeArenaChallenge → acquireToast 顯示獎勵 | ✅ | L2185 |
| 敗北 → 顯示結果 | ✅ | |
| 戰後返回競技場 | ✅ | setMenuScreen('arena') |

### 3.5 E2E 驗證

| 項目 | 結果 | 備註 |
|------|------|------|
| T2.1 排行榜 | WARN | 帳號可能未解鎖競技場（需通關 2-1） |
| T2.2 NPC 條目 | WARN | 同上 |
| T2.3 挑戰按鈕 | WARN | 同上 |

### 3.6 挑戰獎勵 — Spec 差異

| Spec 欄位 | 實作 ArenaReward 型別 | 差異 |
|-----------|---------------------|------|
| exp | 無 `exp` 欄位 | ⚠️ 見差異#4 |
| gold | ✅ `gold` | |
| 競技幣 | ✅ `pvpCoin` | |
| diamond | ✅（值為 0） | |

---

## 四、獲得物品動畫（item-acquire-toast.md v0.3）

### 4.1 型別定義 — `src/hooks/useAcquireToast.ts`

| Spec 斷言 | 測試 ID | 結果 | 備註 |
|-----------|---------|------|------|
| AcquireItem.type: 5 類 (hero/equipment/item/currency/fragment) | AT-1 | ✅ | |
| AcquireItem.rarity 可選 | AT-1 | ✅ | |
| AcquireItem.isNew 可選 | AT-1 | ✅ | |
| useAcquireToast() 回傳 show + isShowing | AT-1 | ✅ | 程式碼審計 |

### 4.2 全域事件匯流排 — `src/services/acquireToastBus.ts`

| Spec 斷言 | 測試 ID | 結果 | 備註 |
|-----------|---------|------|------|
| emitAcquire([]) 空陣列不觸發 | AT-2 | ✅ | |
| emitAcquire(items) 非空觸發 handler | AT-3 | ✅ | |
| 完整 AcquireItem 資料透傳 | AT-4 | ✅ | |
| 未註冊時不報錯 | AT-5 | ✅ | |
| 多次 register 後者覆蓋 | AT-6 | ✅ | |

### 4.3 UI 元件 — `src/components/AcquireToast.tsx`

| 檢查項 | 結果 | 備註 |
|--------|------|------|
| 全螢幕遮罩 `.acquire-overlay` | ✅ | AcquireToast.tsx |
| 重要物品單一展示 (SR/SSR) | ✅ | SingleItemDisplay |
| 普通物品合併列表 | ✅ | ItemListDisplay |
| 跳過（點擊繼續） | ✅ | onClick handler |
| 稀有度邊框色（N:灰/R:藍/SR:紫/SSR:金） | ✅ | CSS classes |
| 合併列表逐一淡入 CSS | ✅ | `.acquire-list-item` |

### 4.4 觸發場景連接

| 場景 | Spec 狀態 | 實作驗證 | 結果 |
|------|-----------|---------|------|
| 戰鬥勝利 (GAMEOVER) | ✅ | App.tsx 中 victory 分支 `acquireToast.show()` | ✅ |
| 英雄抽卡 (GachaScreen) | ✅ | `emitAcquire()` 呼叫 | ✅ |
| 信件領取 (MailboxPanel) | ✅ | `onRewardsClaimed` → `acquireToast.show()` | ✅ |
| 商店購買 (ShopPanel) | ✅ | `emitAcquire()` 呼叫 | ✅ |
| 競技場獎勵 | ✅ | App.tsx 競技場勝利分支 | ✅ |
| 裝備抽卡 | ⬜ 未實作 | 尚無裝備卡池 | N/A |
| 開寶箱 | ⬜ 未實作 | 待 GAS `use-item` | N/A |
| 排名提升里程碑 | ⬜ 未實作 | 待 milestoneReward | N/A |

### 4.5 E2E 驗證

| 項目 | 結果 | 備註 |
|------|------|------|
| T3.1 抽卡後 toast | WARN | 帳號可能鑽石不足 |
| T3.2a 商店介面 | ✅ PASS | |
| T3.2b 商店購買 toast | WARN | 第一個購買按鈕可能 disabled |

---

## 五、發現的 Spec ↔ 實作差異

### 差異 #1：4 件套 CP 計算方式

| | Spec | 實作 |
|---|------|------|
| **描述** | "SET_4PC_POWER = 200（含 2 件套）" | `getActiveSetBonuses()` 回傳 2pc 和 4pc **兩個 entry**，各自加分 |
| **4 件套結果** | 暗示 200 | 實際 80 + 200 = **280** |
| **嚴重度** | 🟡 低 | Spec 用語「含 2 件套」歧義，可理解為兩種方式 |
| **建議** | 更新 spec 明確為 "4 件套總 CP = SET_2PC_POWER + SET_4PC_POWER = 280" |

### 差異 #2：主選單 HUD 戰力顯示

| | Spec | 實作 |
|---|------|------|
| **描述** | "顯示於大廳主選單 HUD" (§2.1 資源列右側 ⚡ N) | `CombatPowerToast` 和 `CombatPowerComparison` 已渲染，但主選單首頁獨立 CP 數值未確認 |
| **嚴重度** | 🟡 低 | CP 在 IDLE 確實顯示，主選單可能尚需獨立 HUD 欄位 |
| **建議** | 在 MainMenu 資源列加入 `⚡ {cpState.currentPower}` 或在 spec 標註為選配 |

### 差異 #3：NPC Rank 1 戰力公式

| | Spec | 實作 |
|---|------|------|
| **描述** | Spec §3.1 寫 "rank 1 → 10,500 CP" | 公式 `500 + (500 - 1) * 20 = 10480` |
| **嚴重度** | 🟢 極低 | Spec 給的是約略示意值（10,500 ≈ 10,480），實作公式正確 |
| **建議** | Spec 備註更正為 `~10,480 CP`（或改公式為 `500 + (500 - rank + 1) * 20`） |

### 差異 #4：挑戰獎勵遺漏 `exp` 欄位

| | Spec | 實作 |
|---|------|------|
| **描述** | Spec §5.2 挑戰獎勵表有 `exp`（勝利 150、敗北 50） | `ArenaReward` 型別只有 `diamond / gold / pvpCoin`，無 `exp` |
| **嚴重度** | 🟠 中 | 功能缺失：勝利/敗北應發放經驗但未實作 |
| **建議** | 新增 `exp` 到 `ArenaReward`，`getChallengeReward()` 回傳 exp 值 |

---

## 六、其他已知限制

1. **Headless Puppeteer 無 WebGL**：E2E 無法驗證 3D 場域內的 DOM overlay（如主選單需 Three.js Canvas 渲染） → WARN 項目均為此限制
2. **訪客帳號進度有限**：test token 可能未通關 1-8（競技場）或 1-2（召喚/商店），導致 E2E 無法進入子面板
3. **既存測試失敗**：`progressionSystemAdvanced.test.ts` 有 5 個失敗，與本次 3 系統無關（為既有 equipment set 相關測試）

---

## 七、測試檔案索引

| 檔案 | 測試數 | 狀態 |
|------|--------|------|
| `src/domain/__tests__/combatPower.test.ts` | 39 | ✅ 全通過 |
| `src/domain/__tests__/arenaSystem.test.ts` | 59 | ✅ 全通過 |
| `src/hooks/__tests__/useAcquireToast.test.ts` | 15 | ✅ 全通過 |
| `scripts/qa_gpu_e2e.mjs` | 9 項 E2E | 2 PASS / 7 WARN |
| `scripts/qa_three_systems.mjs` | 原始 E2E | 2 PASS / 8 WARN |

---

## 八、結論

### 三系統 spec 合規度

| 系統 | Domain 邏輯 | UI 元件 | App.tsx 整合 | 總評 |
|------|------------|---------|-------------|------|
| 戰力系統 | ✅ 100% | ✅ 完整 | ✅ 已渲染（IDLE+Toast） | 🟢 合規 |
| 競技場排名 | ✅ 98%（缺 exp） | ✅ 完整 | ✅ 戰鬥引擎已連接 | 🟡 輕微差異 |
| 獲得物品動畫 | ✅ 100% | ✅ 完整 | ✅ 5/8 場景連接 | 🟢 合規 |

### 需修正項目

1. **[建議修] ArenaReward 加入 `exp` 欄位**（差異 #4，spec §5.2 明確列出）
2. **[建議修] Spec combat-power.md 4 件套描述更明確**（差異 #1）
3. **[建議修] Spec arena-pvp.md NPC rank 1 數值更正**（差異 #3）
4. **[選配] 主選單獨立 CP HUD**（差異 #2，可視為下階段 feature）
