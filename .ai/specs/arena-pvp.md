# 競技場排名系統 Spec

> 版本：v2.3 ｜ 狀態：🟢 已實作（動態挑戰範圍 + 對手清單 + 排名變動偵測 + safe-area + pvp_coin 即時同步 + 戰力顯示一致性 + 對手裝備加成）
> 最後更新：2026-03-06
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

全新可對戰其他玩家的排名制競技場。每位玩家可配置**防守陣型**供其他玩家挑戰，挑戰成功後取代對方排名。
尚未被玩家佔據的排名位放置 **NPC** 供挑戰。排名每週一重置，重置後排名提升可再次獲得獎勵。
每日根據排名發放**排名獎勵**，鼓勵玩家持續參與和提升實力。

> **與現有 PvP 的差異**：現有 `stage-system.md` §四 PvP 競技場是**每日 seeded 隨機 AI 對手**，無排名、無防守陣型、無玩家對戰。本 spec 是全新的**排名制多人競技場**，兩者共存但分開入口。

## 依賴

- `.ai/specs/combat-power.md` — 戰力計算（排行榜顯示、匹配參考）
- `.ai/specs/core-combat.md` — 戰鬥引擎（挑戰戰鬥）
- `.ai/specs/hero-schema.md` — 英雄數值
- `.ai/specs/save-system.md` — 防守陣型存檔
- `.ai/specs/stage-system.md` — 現有 PvP 場景主題可復用
- `.ai/specs/auth-system.md` — 玩家身份
- `.ai/specs/inventory.md` — 競技幣道具

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/domain/arenaSystem.ts` | Domain 層 — 動態挑戰範圍 `getChallengeRange()`、NPC 生成、獎勵公式 |
| `src/services/arenaService.ts` | Service 層 — Workers API 呼叫（含 `refreshArenaOpponents`）、`ArenaOpponent` 型別 |
| `src/components/ArenaPanel.tsx` | UI — Top 10 排行榜 + 10 名挑戰對手 + 刷新按鈕 + 防守陣型 + 掃蕩 |
| `src/hooks/useStageHandlers.ts` | 挑戰開始（`targetUserId`）+ 排名變動偵測處理 |
| `workers/src/routes/arena.ts` | Workers 後端 — 對手清單生成/儲存/刷新 + 排名變動偵測 + 戰力計算 |

---

## 一、核心機制

### 1.1 排名規則

| 項目 | 值 |
|------|-----|
| 排名總數 | **500 名**（固定排名槽） |
| 初始狀態 | 全部為 NPC（玩家首次挑戰從第 500 名開始） |
| 解鎖條件 | 通關 **2-1**（與現有 PvP 相同） |
| 挑戰次數 | 每日 **5 次**（每日 00:00 UTC 重置） |
| 重置週期 | **每週一 00:00 UTC** 重置排名 |

### 1.2 挑戰流程

```
[排行榜] → 選擇對手（可向上挑戰 3 個排名以內）
   │
   ▼
[戰鬥準備] → 顯示敵我戰力對比（combat-power.md）
   │
   ▼
[戰鬥] → 使用 core-combat.md 戰鬥引擎
   │
   ├─ 勝利 → 與對手交換排名 + 發放挑戰獎勵 + 判定排名提升獎勵
   └─ 敗北 → 排名不變，仍消耗 1 次挑戰次數
```

### 1.3 挑戰對象選取（v2.0 動態範圍 + 對手清單）

#### 動態挑戰範圍

```typescript
function getChallengeRange(myRank: number): number {
  if (myRank > 100) return 200   // rank 101~500 → 可向上跨 200 名
  if (myRank > 20)  return 50    // rank 21~100  → 可向上跨 50 名
  if (myRank > 5)   return 15    // rank 6~20   → 可向上跨 15 名
  return 5                        // rank 1~5    → 可向上跨 5 名
}
// 例：排名 500 → 範圍 200 → 可挑 300~499
// 例：排名 50  → 範圍 50  → 可挑 1~49
```

> 設計理念：讓低排名玩家能快速攀爬（rank 500→300→100→50→1 最少 4 勝即可登頂），高排名則競爭更激烈。

#### 持久化對手清單

- 後端在 `save_data.arenaOpponents` 儲存 JSON 陣列（10 名對手的 playerId）
- 首次進入競技場或每日重置後自動生成
- 對手從 `[max(1, myRank - range), myRank - 1]` 範圍內 `ORDER BY RANDOM() LIMIT 10` 隨機抽取
- 挑戰勝利後自動重新生成（因排名交換後對手池已變）

#### 手動刷新

| 項目 | 值 |
|------|----|
| 每日免費刷新次數 | **5 次**（`ARENA_DAILY_REFRESHES`） |
| 計數器 | `save_data.arenaRefreshCount`（每日 00:00 UTC 重置） |
| API | `arena-refresh-opponents` |

#### 排名變動偵測

當玩家點擊「挑戰」時，後端檢查目標的**當前排名**：
- 若 `targetRank >= myRank`（對手已被其他人打下來，不再比自己前面）→ 回傳 `{ error: 'rank_changed' }` + **免費自動刷新對手清單**（不扣刷新次數）
- 前端收到後顯示 toast「對手排名已變動，已自動刷新對手清單」並返回競技場

> 首次參加的玩家先安排到最末空位（第 500 名或最近的空位），可立即向上挑戰。

---

## 二、防守陣型

### 2.1 配置

- 玩家在競技場面板中設定**防守陣型**（最多 6 位英雄，同 formation 格式）
- 防守陣型**獨立於**出征陣型（`save_data.formation` 是出征用，防守陣型另存）
- 若未配置防守陣型，預設使用出征陣型

### 2.2 存檔結構

在 `save_data` 新增欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `arenaDefenseFormation` | string | 防守陣型 JSON `[heroInstanceId, null, ...]`（6 slots） |
| `arenaHighestRank` | number | 本週最高排名（用於排名提升獎勵判定） |
| `arenaOpponents` | string | 對手清單 JSON `[playerId, ...]`（最多 10 名，v2.0 新增） |
| `arenaRefreshCount` | number | 今日已刷新次數（每日 00:00 UTC 歸零，v2.0 新增） |

### 2.3 防守戰鬥

- 被挑戰時，防守方由 **AI 控制**（使用其防守陣型的英雄數值）
- 防守方英雄的等級/裝備/技能以**挑戰時的即時數據**為準（從 GAS 讀取對手存檔）
- 防守方不消耗任何資源

---

## 三、NPC 佔位

### 3.1 NPC 生成規則

```typescript
function generateNPCForRank(rank: number): ArenaEntry {
  const seed = rank * 31337
  const rng = seededRandom(seed)

  // NPC 強度隨排名遞增
  const power = Math.floor(500 + (500 - rank) * 20)  // rank 500 → 500 CP, rank 1 → 10,480 CP
  const heroCount = Math.min(6, 2 + Math.floor((500 - rank) / 100))  // 排名越前越多英雄

  return {
    rank,
    playerId: `npc_${rank}`,
    displayName: getRandomNPCName(rng),
    isNPC: true,
    power,
    defenseFormation: generateNPCFormation(heroCount, power, rng),
  }
}
```

### 3.2 NPC 名稱池

```typescript
const NPC_NAME_PREFIXES = ['暗影', '末日', '鐵血', '荒野', '幽靈', '狂暴', '冰霜', '烈焰']
const NPC_NAME_SUFFIXES = ['獵人', '倖存者', '戰士', '指揮官', '護衛', '遊蕩者', '潛伏者']
// 組合：prefix + suffix，如「暗影獵人」、「末日戰士」
```

---

## 四、排名與交換

### 4.1 排名交換

```typescript
function processArenaResult(
  challengerRank: number,
  defenderRank: number,
  challengerWon: boolean
): { newChallengerRank: number; newDefenderRank: number } {
  if (!challengerWon) {
    return { newChallengerRank: challengerRank, newDefenderRank: defenderRank }
  }
  // 勝利：挑戰者取代防守者的排名，防守者下移到挑戰者原排名
  return {
    newChallengerRank: defenderRank,
    newDefenderRank: challengerRank,
  }
}
```

### 4.2 排名提升獎勵

每次排名**提升到歷史新高**時，依突破的里程碑發放一次性獎勵：

| 首次達到排名 | 鑽石 | 金幣 | 競技幣 | 說明 |
|-------------|------|------|--------|------|
| 前 400 名 | 20 | 5,000 | 10 | 初入排行 |
| 前 300 名 | 30 | 10,000 | 20 | |
| 前 200 名 | 50 | 20,000 | 30 | |
| 前 100 名 | 100 | 50,000 | 50 | |
| 前 50 名 | 150 | 80,000 | 80 | |
| 前 20 名 | 200 | 100,000 | 100 | |
| 前 10 名 | 300 | 150,000 | 150 | |
| 第 1 名 | 500 | 300,000 | 300 | 霸主 |

> 每週重置後，`arenaHighestRank` 重設為 500，排名重新提升時可再次領取。

---

## 五、獎勵系統

### 5.1 每日排名獎勵

每日 **21:00 UTC** 自動結算，依當前排名發放至信箱：

| 排名區間 | 鑽石 | 金幣 | 競技幣 |
|---------|------|------|--------|
| 1 | 100 | 30,000 | 50 |
| 2~5 | 80 | 25,000 | 40 |
| 6~10 | 60 | 20,000 | 35 |
| 11~30 | 40 | 15,000 | 25 |
| 31~50 | 30 | 10,000 | 20 |
| 51~100 | 20 | 8,000 | 15 |
| 101~200 | 15 | 5,000 | 10 |
| 201~500 | 10 | 3,000 | 5 |

### 5.2 挑戰獎勵（每場戰鬥）

| 結果 | gold | 競技幣 |
|------|------|--------|
| 勝利 | 2,000 | 5 |
| 敗北 | 500 | 1 |

> **備註**：v0.2 實作中 `ArenaReward` 型別未包含 exp 欄位。exp 獎勵為擴展點，待後續版本加入。

### 5.3 每週重置

| 項目 | 說明 |
|------|------|
| 時間 | 每週一 00:00 UTC |
| 排名重置 | 所有玩家從排行榜移除，恢復 NPC 佔位 |
| 進入方式 | 重置後首次進入競技場自動分配到末位空位 |
| `arenaHighestRank` | 重設為 500 |
| 每日挑戰次數 | 同時重置為 5 |

> **重置獎勵**：重置前會發放**賽季結算信件**，依最終排名發放一次大獎。

### 5.4 賽季結算獎勵（每週一結算）

| 最終排名 | 鑽石 | 金幣 | 競技幣 |
|---------|------|------|--------|
| 1 | 500 | 100,000 | 200 |
| 2~5 | 300 | 60,000 | 150 |
| 6~10 | 200 | 40,000 | 100 |
| 11~30 | 100 | 20,000 | 60 |
| 31~50 | 60 | 10,000 | 40 |
| 51~100 | 40 | 5,000 | 25 |
| 101~200 | 25 | 3,000 | 15 |
| 201~500 | 15 | 2,000 | 10 |

---

## 六、Google Sheet 結構

### Sheet: `arena_rankings`（排行榜，500 行固定）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `rank` | number | 排名（1~500，主鍵） |
| `playerId` | string | 玩家 ID 或 `npc_{rank}`（NPC） |
| `displayName` | string | 顯示名稱 |
| `isNPC` | boolean | 是否為 NPC |
| `power` | number | 最新戰力（快取，定期更新） |
| `defenseFormation` | string | 防守陣型 JSON |
| `lastUpdated` | string | 最後更新時間 |

### Sheet: `arena_logs`（挑戰紀錄）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `logId` | string | 唯一 ID |
| `challengerId` | string | 挑戰者 playerId |
| `defenderId` | string | 防守者 playerId |
| `challengerRankBefore` | number | 挑戰前排名 |
| `defenderRankBefore` | number | 防守者挑戰前排名 |
| `result` | string | `'win'` / `'lose'` |
| `timestamp` | string | ISO 8601 |

---

## 七、GAS 端點

### Workers API 端點

| action | 說明 |
|--------|------|
| `arena-get-rankings` | 取得 Top 10 排行榜 + 10 名持久化對手 + 我的排名/次數/刷新次數 |
| `arena-challenge-start` | 發起挑戰（`targetUserId`）— 排名變動偵測 + 回傳防守陣容 |
| `arena-challenge-complete` | 結算（勝利→排名交換+獎勵+自動重新生成對手） |
| `arena-set-defense` | 設定防守陣型（以 CP_WEIGHTS 計算並更新 power） |
| `arena-refresh-opponents` | 手動刷新對手清單（每日 5 次上限） |
| `arena-daily-reward` | 每日排名獎勵結算（CronTrigger） |
| `arena-weekly-reset` | 每週重置排名（CronTrigger） |
| `arena-season-reward` | 賽季結算獎勵（重置前呼叫） |

### 挑戰流程（handleArenaChallenge_）

```
1. 驗證 guestToken → resolvePlayerId_
2. 檢查剩餘挑戰次數 ≥ 1
3. 讀取挑戰者排名、目標排名（差距 ≤ 3）
4. 讀取防守方陣型數據（NPC → 生成 / 玩家 → 讀 save_data）
5. 回傳防守方英雄數據 → 前端進行戰鬥
6. 前端上報結果（complete-arena-battle）
7. GAS 驗證 + 排名交換 + 發放獎勵 + 更新 arenaHighestRank
```

> **防守方英雄數據由 GAS 回傳給前端**，前端用 `buildEnemySlotsFromArena()` 建立敵方 `StageEnemy[]`，再走正常戰鬥引擎。

---

## 八、UI 設計

### 8.1 ArenaPanel 結構（v2.0）

```
┌───────────────────────────────────────────┐
│  ← 返回        ⚔️ 競技場排名              │  ← safe-area-inset-top
│  ─────────────────────────────────────── │
│  我的排名: #48 ⚔️ 3,280  挑戰範圍: 50     │
│  今日剩餘: 3/5 次                          │
│  ─────────────────────────────────────── │
│  [🛡️ 防守陣型]  [🏆 排行榜]  [📦 獎勵]     │
│  ═══════════════════════════════════════ │
│  🏆 排行榜 Top 10                         │
│  🥇 #1  暗影獵人(NPC)     ⚔️ 10,200       │
│  🥈 #2  末日戰士(NPC)     ⚔️ 9,800        │
│  ...（僅展示，不可直接挑戰）               │
│  ═══════════════════════════════════════ │
│  ⚔️ 挑戰對手          [🔄 刷新 (4/5)]     │
│  #27  鐵血護衛(NPC)     ⚔️ 5,500  [挑戰]  │
│  #31  末日指揮官(NPC)   ⚔️ 4,800  [挑戰]  │
│  #38  玩家A             ⚔️ 3,900  [挑戰]  │
│  ...（共 10 名隨機對手）                    │
│  ═══════════════════════════════════════ │
│  [⚡ 掃蕩]                                 │
└───────────────────────────────────────────┘
```

> Top 10 為唯讀排行榜；挑戰對手為持久化的 10 名隨機對手（從動態範圍內抽取）。

### 8.2 防守陣型配置

- 3×2 網格顯示 6 格防守槽位
- 已放置英雄的槽位顯示 **卡片風格**（稀有度邊框 + Thumbnail3D 縮圖 + 名稱 + Lv + 星級）
  - 與戰鬥準備下方英雄列表的卡片風格一致
- 空槽位顯示虛線邊框 + 「空位」文字
- 「🎮 前往配置防守陣型」按鈕跳轉配置介面
- 儲存走 `arena-set-defense` API

### 8.2.1 掃蕩功能（v1.0 新增）

- 條件：`challengesLeft > 0` 且 `myRank < 500`
- 按鈕顯示在排行榜頂部：「⚡ 掃蕩 #N（自動勝利）」
- 點擊後對後一名玩家自動獲勝，直接發放勝利獎勵並消耗挑戰次數
- 不會改變排名（目標排名 > 自己排名，不觸發交換）

### 8.3 挑戰按鈕規則

- 只可挑戰**對手清單中的 10 名對手**（由後端從動態範圍內隨機生成）
- 挑戰使用 `targetUserId`（非 `targetRank`），後端驗證目標仍比自己排名前
- 排名變動時：自動免費刷新對手清單 + toast 提示（不扣次數/刷新數）
- 剩餘次數 = 0 → 按鈕 disabled + 顯示「明日重置」
- NPC 名稱旁顯示 `(NPC)` 標籤
- 點擊挑戰 → 進入 `IDLE`（戰鬥準備），顯示敵我戰力對比

### 8.4 獎勵分頁

- 顯示排名提升里程碑（已領取打勾 ✅、未達灰色 ⬜、可領綠色 🟢）
- 每日獎勵領取紀錄
- 賽季結算歷史

---

## 九、與現有 PvP 的共存

| 項目 | 現有 PvP（stage-system §四） | 新排名競技場（本 spec） |
|------|---------------------------|----------------------|
| 入口 | StageSelect → 競技場 Tab | MainMenu → 新增「⚔️ 競技場」按鈕 |
| 對手 | 每日 seeded AI × 3 | 其他玩家 / NPC |
| 排名 | 無 | 1~500 排名制 |
| 防守 | 無 | 可配置防守陣型 |
| 次數 | 無限 | 每日 5 次 |
| 獎勵 | 即時（exp/gold/diamond/pvp_coin） | 即時 + 每日 + 每週 |
| 重置 | 每日刷新 | 每週重置 |
| 場景 | pvpTheme | 可復用 pvpTheme |

> **建議**：未來可將現有 PvP 改名為「練習場」或「日常挑戰」，新排名競技場作為「正式競技場」。

### MenuScreen 擴展

```typescript
export type MenuScreen = 'none' | 'heroes' | 'inventory' | 'gacha' | 'stages' | 'settings' | 'mailbox' | 'shop' | 'arena'
```

新增 `arena` 值，對應 `ArenaPanel` 元件。

---

## 十、PVP 兑換商店（v0.6 新增）

使用 PvP 競技（`stage-system.md` §四）戰鬥獲得的 `pvp_coin` 在商店中兑換道具。

> `pvp_coin` 使用 `CurrencyIcon` 統一元件渲染（`type="pvp_coin"`，顯示為 🏅）。

### 商店目錄（6 項商品）

| 商品 ID | 名稱 | pvp_coin 價格 | 產出 |
|----------|------|------------|------|
| `arena_exp_3000` | EXP ×3,000 | 10 | 直接加 save_data.exp |
| `arena_gold_20k` | 金幣 ×20,000 | 15 | 直接加 save_data.gold |
| `arena_diamond_30` | 鑽石 ×30 | 25 | 直接加 save_data.diamond |
| `arena_class_universal` | 通用職業石 ×2 | 20 | asc_class_universal 加入背包 |
| `arena_chest_equip` | 裝備寶箱 ×1 | 30 | chest_equipment 加入背包 |
| `arena_ticket_hero` | 英雄召喚券 ×1 | 40 | gacha_ticket_hero 加入背包 |

### 後端實作

`workers/src/routes/inventory.ts` 中 SHOP_CATALOG 新增 `arena` 分類，購買時扣除 inventory 表中 `pvp_coin` 行的 quantity。

### 前端入口

`ShopPanel.tsx` 新增「競技商店」分頁（`arena` category），價格使用 `<CurrencyIcon type="pvp_coin" />` 顯示。

### ArenaPanel CSS 修復（v0.6）

修復 `ArenaPanel.tsx` 中 10+ 個 CSS class 名稱與 `App.css` 定義不匹配的問題，確保所有樣式正確套用。

---

## 擴展點

- [ ] **即時對戰**：WebSocket 真人對戰（非異步 AI 防守）
- [ ] **賽季主題**：不同賽季有不同 buff/debuff 規則
- [ ] **段位系統**：銅/銀/金/鑽石/傳說段位（取代純排名）
- [ ] **挑戰次數購買**：鑽石購買額外挑戰次數
- [ ] **戰報回放**：被挑戰時可觀看防守戰報
- [ ] **公會戰**：公會 vs 公會的大型競技場

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v2.3 | 2026-03-06 | **對手方裝備加成修復**：後端 `/arena-challenge-start` 真人防守方補上 `equipment_instances` 查詢，完整計算裝備主屬性（含強化）+ 副屬性 flat/percent + 套裝效果（2pc/4pc），與 `calcDefensePower` 戰力計算邏輯一致 |
| v2.2 | 2026-03-07 | **戰力顯示一致性修復**：戰鬥準備畫面改用伺服器權威戰力值（`arenaEnemyPowerRef` from `defenderData.power`），不再使用前端 `getEnemyTeamPower()` 簡易加權值，確保與對手清單顯示一致 |
| v2.1 | 2026-03-07 | **pvp_coin 背包即時同步**：①勝利/敗北回報後呼叫 `addItemsLocally` 寫入 pvp_coin（含里程碑）②ArenaPanel 掃蕩後同步呼叫 `addItemsLocally`，不再僅依賴 `loadData()` 延遲同步 |
| v2.0 | 2026-03-06 | **動態挑戰範圍 + 對手清單系統重構**：①固定 -3 範圍改為動態 4 階（rank>100→200, 21-100→50, 6-20→15, 1-5→5）②新增持久化對手清單（10 名，存 `save_data.arenaOpponents`）③新增手動刷新（每日 5 次，`arena-refresh-opponents` 端點）④挑戰改用 `targetUserId`，排名變動偵測後免費自動刷新⑤勝利後自動重生對手清單⑥UI 改為 Top 10 排行榜（唯讀）+ 10 名挑戰對手 + 刷新按鈕⑦全專案 safe-area-inset-top 補齊（`.arena-panel` `.battle-prep-top-banner` `.battle-result-banner` `.boss-dmg-bar-wrap` `.bhud-skill-toasts` 共 5 處） |
| v1.1 | 2026-03-05 | **全員戰力即時重算 + 掃蕩結算面板** |
| v1.0 | 2026-03-05 | **掃蕩+模型修復+防守卡片風格**：①新增掃蕩按鈕（自動勝利後一名玩家，獲取勝利獎勵）②修復挑戰時敵方英雄模型不顯示（_modelId 正規化為 zombie_N 格式 + DEF/CritRate/CritDmg 傳遞）③防守陣型改用卡片風格（稀有度邊框 + 縮圖 + Lv + 星級）④新玩家加入競技場時計算實際防守戰力 |
| v0.9 | 2026-03-06 | **防守陣型縮圖 UI**：槽位以 Thumbnail3D 縮圖+英雄名稱取代舊版「位置 N」文字，新增 getHeroModelId helper，更新 CSS 樣式 |
| v0.8 | 2026-03-06 | **獎勵一致性審計修復**：①pvp_coin ID 統一（`currency_pvp_coin`→`pvp_coin`），D1 遷移合併數據②後端挑戰獎勵/里程碑/每日排名全部補上 exp③每日排名從 5 階擴展為 8 階，與前端 DAILY_REWARD_TIERS 完全對齊④敵方 NPC 補 CritRate/CritDmg⑤真人玩家改用 RARITY_LEVEL_GROWTH × ascMult × starMult⑥stardust 統一寫入 inventory.currency_stardust |
| v0.5 | 2026-03-01 | ArenaReward 新增 exp 欄位（勝:150/敗:50）、所有獎勵表補上 exp 數值、Spec 差異修復驗證替換原過時差異測試 |
| v0.7 | 2026-03-06 | **敵方模型修復 + 防守載入 + 戰力對齊 + 紅點**：①`arena-challenge-start` 重寫：NPC 以確定性種子生成 2~5 隻英雄（依排名分層），真實玩家從 hero_instances+heroes 查詢 defenseFormation 角色資料②ArenaPanel `useEffect` 掛載時呼叫 `getDefenseFormation()` 回顯已存陣容③`arena-set-defense` 儲存後以 CP_WEIGHTS 計算並更新 power 欄位④戰力圖示 ⚡→⚔️⑤MainMenu 新增 `arenaChallengesLeft` 紅點⑥PanelInfoTip 移入 `.arena-title` span 修復間距 |
| v0.6 | 2026-03-05 | **PVP 兑換商店 + CSS 修復**：①新增 §十 PVP 兑換商店（6 項商品，以 pvp_coin 兑換 EXP/金幣/鑽石/職業石/裝備寶箱/英雄券）②`pvp_coin` 統一使用 `CurrencyIcon` 元件（type="pvp_coin"，🏅）③`ArenaPanel.tsx` 修復 10+ CSS class 名稱不匹配④`ShopPanel.tsx` 新增 `arena` 分類 Tab⑤後端 `inventory.ts` SHOP_CATALOG 新增 arena 商店 |
| v0.4 | 2026-03-01 | QA 審計修正：NPC rank 1 數值更正為 10,480、挑戰獎勵移除 exp 欄位（待擴展）、113 單元測試全通過 |
| v0.3 | 2026-03-01 | 戰鬥引擎連接：App.tsx onStartBattle 實作完整挑戰流程（startArenaChallenge → 建置敵方 SlotHero[] → stageMode='pvp' → IDLE → 戰鬥 → completeArenaChallenge）、勝利/敗北報告、獎勵 acquireToast、戰後自動返回競技場 || v0.2 | 2026-03-01 | 完成全部實作：domain/arenaSystem.ts + services/arenaService.ts + ArenaPanel + GAS 5 端點 + CSS + MainMenu 按鈕 + App.tsx 整合 |
| v0.1 | 2026-03-01 | 初版草案：500 名排名制、防守陣型、NPC 佔位、排名交換、每日 5 次挑戰、挑戰/排名提升/每日/賽季四層獎勵、每週重置、GAS 7 個端點、ArenaPanel UI、與現有 PvP 共存方案、MenuScreen 擴展 |
