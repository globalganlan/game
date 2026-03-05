# 事後檢討：Phase B HP 狀態汙染 — 第一回合英雄死亡 Bug

> 嚴重度：**P0（遊戲功能完全損壞）**
> 引入日期：2026-03-01（反作弊校驗系統實作）
> 發現日期：2026-03-02（使用者回報）
> 修復日期：2026-03-02
> 影響範圍：所有正常戰鬥（首次 & 非回放），每場必 100% 復現

---

## 一、Bug 描述

開始戰鬥後，**第一回合英雄發動攻擊時立刻播放死亡動畫**，直接從場上移除。
但使用戰鬥回放功能重播同一場戰鬥，英雄表現完全正常。

表現症狀：
- 英雄衝上前攻擊 → 攻擊動畫完成 → **不後退而是直接播受傷→死亡動畫**
- 所有英雄依序在第一次出手後就「死掉」
- HP 條未正確更新（有些英雄死亡時 HP 條仍滿）
- 回放模式完全正常

---

## 二、根因分析（5 Whys）

### Why 1：為什麼英雄第一回合就死了？
攻擊者後退邏輯（[App.tsx L1476](../src/App.tsx#L1476)）檢查 `heroMap.get(action.attackerUid)?.currentHP`，
讀到的值是 **0**，走進了「被反彈傷害致死」的分支 → 播放 HURT→DEAD 動畫。

### Why 2：為什麼 `heroMap` 的 `currentHP` 在第一筆 action 時就已經是 0？
因為 Phase A 呼叫 `runBattleCollect()` 時，引擎**直接修改（mutate）**了傳入的 BattleHero 物件。
戰鬥跑完後，所有在戰鬥中陣亡的英雄 `currentHP` 已被引擎改為 0。

### Why 3：為什麼 Phase B 播放時沒有先重置這些 HP？
因為 `needsHpSync` 被設為 `false`。  
> 原始註解：`needsHpSync = false // 本地引擎已直接修改 heroMap`

開發者的意圖是：「引擎已經更新了 HP，Phase B 不需要再同步」。
但這個認知**忽略了一個關鍵事實**：Phase B 是**逐筆 action 回放動畫**，
每筆 action 播放時需要的是**該時刻**的 HP 狀態，而不是最終狀態。

### Why 4：為什麼回放模式沒有這個問題？
回放模式（`replayActions` 分支）設定 `needsHpSync = true`，
Phase B 迴圈在每筆 action 前呼叫 `applyHpFromAction()` **漸進式更新** HP。
此時 `heroMap.get(uid).currentHP` 反映的是該回合當下的 HP → 判斷正確。

### Why 5：為什麼開發時沒有注意到？
反作弊系統（seeded PRNG + `completeBattle`）是在同一天大量重構中加入的，
引入 `needsHpSync` 機制時只考慮了「回放模式需要同步」，
卻沒考慮到 **正常模式的 Phase B 同樣需要逐步 HP 狀態**。

---

## 三、時間線

| 時間 | 事件 |
|------|------|
| 03-01 AM | 實作反作弊校驗系統 → 加入 seed、快照、`needsHpSync` 機制 |
| 03-01 AM | 實作伺服器端獎勵計算 → 重構 Phase A（加入 `completeBattle` 背景呼叫） |
| 03-01 AM | 此時 `needsHpSync = false` 被寫入正常模式分支 ← **Bug 引入點** |
| 03-01 PM | 部署 GAS @80~@87，進行多輪反作弊 + 獎勵計算整合測試 |
| 03-01 PM | 測試重點在**反作弊校驗結果是否正確**、**獎勵金額是否對齊** |
| 03-01 PM | **未測試戰鬥動畫是否正常播放** ← 測試覆蓋缺口 |
| 03-02 | 使用者回報「第一回合英雄直接死掉」 |
| 03-02 | 定位根因 → 修復（重置 heroMap + `needsHpSync = true`） |

---

## 四、修復方案

```diff
  // Phase A: runBattleCollect 完成後
  const result = await runBattleCollect(playerBH, enemyBH, { maxTurns: 50, seed: battleSeed })
  allActions = result.actions
  winner = result.winner
- needsHpSync = false  // 本地引擎已直接修改 heroMap

  // 星級計算（需要最終狀態，必須在重置前做）
  const survivingCount = playerBH.filter(h => h.currentHP > 0).length
  const localStars = calculateStarRating(totalHeroCount, survivingCount)

+ // ★ 引擎已將 heroMap 修改為戰鬥結束狀態（currentHP 可能為 0），
+ //   必須重置為初始值，否則 Phase B 播放期間讀到最終 HP
+ //   → 攻擊者後退檢查 currentHP===0 以為被反彈致死 → 第一回合即播死亡動畫
+ //   改用 applyHpFromAction 在每筆 action 時漸進更新（與回放模式相同）
+ for (const bh of [...playerBH, ...enemyBH]) {
+   bh.currentHP = bh.maxHP
+   bh.energy = 0
+ }
+ needsHpSync = true
```

**核心思路**：正常模式和回放模式現在走**完全相同的 Phase B 路徑** —— 
都透過 `applyHpFromAction()` 在每筆 action 前漸進更新 HP。

---

## 五、影響的程式碼位置

| 檔案 | 行號 | 說明 |
|------|------|------|
| `src/App.tsx` | L1476 | `NORMAL_ATTACK` 後退：`heroMap.get(attackerUid)?.currentHP` → 讀到最終 HP 0 |
| `src/App.tsx` | L1614 | `SKILL_CAST` 後退：同上 |
| `src/App.tsx` | L1790 | 修復點：重置 heroMap + 設 `needsHpSync = true` |
| `src/App.tsx` | L1821 | `applyHpFromAction()`：逐步更新 HP 的函式 |
| `src/App.tsx` | L1855,1859 | Phase B 迴圈：呼叫 `applyHpFromAction()` |

---

## 六、檢討：為什麼會出這種紕漏？

### A. 共享可變物件（Shared Mutable State）

`runBattleCollect()` 直接修改傳入的 BattleHero 物件是根本問題。
引擎和 UI 層共用同一批物件引用，引擎跑完後物件狀態已被污染，
但 UI 層（Phase B）仍在讀取這些物件，期望它們是「初始狀態」。

> **架構缺陷**：引擎應回傳結果而非原地修改，或至少文件化此 side-effect。

### B. 開發者心智模型錯誤

寫 `needsHpSync = false` 的推理是：
> 「引擎已經更新 heroMap → Phase B 不需要再同步」

但實際上 Phase B 是**回放**，需要的是**每個時間點的 HP**，不是最終值。
這是因為 `onAction` callback 和 `runBattleCollect` 不在同一個 loop 裡——
引擎是一次跑完所有回合，然後 Phase B 逐筆播放。

### C. 測試覆蓋缺口

反作弊系統帶來大量程式碼重構，但測試集中在：
- ✅ seed 確定性（前後端結果一致性）
- ✅ 獎勵金額計算正確性
- ✅ 網路失敗韌性
- ❌ **戰鬥動畫播放是否正常**（未測）
- ❌ **Phase B 期間 heroMap 狀態是否正確**（未測）

戰鬥引擎和 3D 演出是兩個不同的關注點，重構引擎輸入時**必須驗證演出層是否受影響**。

### D. 回放模式的「倖存者偏差」

回放模式因為 heroMap 是重新建立的物件 → `needsHpSync = true` → 
漸進式 HP 更新 → 一切正常。  
這讓開發者在手動測試回放時以為「戰鬥都沒問題」，忽略了正常模式的差異。

---

## 七、防護措施（Action Items）

### 短期（已執行）
1. ✅ 修復 Bug：重置 heroMap + `needsHpSync = true`
2. ✅ 加入詳細註解說明為什麼必須重置
3. ✅ 更新 `.ai/specs/core-combat.md` v3.2

### 中期（建議）
4. ⬜ **加入 Phase B 斷言**：在 Phase B 迴圈開始前，斷言所有 BattleHero `currentHP === maxHP`
   — 防止未來再次出現 heroMap 被提前修改的情況
5. ⬜ **引擎不可變化設計**：讓 `runBattleCollect` 深拷貝輸入物件後再運算，
   不修改呼叫端傳入的物件 → 消除 shared mutable state
6. ⬜ **E2E 動畫驗證**：在 `qa_e2e_test.mjs` 加入戰鬥動畫播放驗證
   — 檢查英雄存活/死亡時機是否與 action 序列一致

### 長期
7. ⬜ **Phase A/B 解耦**：Phase A 產出純資料（immutable action list + hero snapshots），
   Phase B 從純資料重建動畫狀態 → 兩個 phase 完全無共享狀態

---

## 八、教訓總結

| # | 教訓 | 原則 |
|---|------|------|
| 1 | **引擎跑完後 heroMap 已非初始狀態** — 任何在引擎後讀取 heroMap 的程式碼都必須考慮這點 | 共享可變狀態是 bug 溫床 |
| 2 | **回放正常 ≠ 正常模式正常** — 兩個模式的 HP 同步路徑不同 | 不同 code path 必須各自測試 |
| 3 | **重構輸入層時必須驗證輸出層** — 改 Phase A（引擎）必須測 Phase B（演出） | 上下游連動測試 |
| 4 | **「引擎已更新」不等於「狀態適合播放」** — 最終值 ≠ 每步的當前值 | 區分 final state vs per-step state |
| 5 | **大規模重構要有 checklist** — 反作弊系統涉及 seed/快照/HP同步/結算全鏈路，光測反作弊不夠 | 重構 checklist 必含全鏈路煙測 |
