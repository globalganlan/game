# 抽卡系統 Spec

> 版本：v2.4 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-04
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

定義英雄招募（抽卡/Gacha）的機率、保底機制、卡池類型與經濟成本。  
核心架構：**前端呼叫 `gacha-pull` API → 後端即時生成結果 → 回傳前端顯示**。  
v2.0 移除了舊版 GAS 時代的 400 筆預生成池機制，改為每次抽卡即時產生結果。
v2.1 新增每日免費單抽 + 抽卡券系統，降低新手門檻。
v2.2 十連折扣移除、免費單抽合併至單抽按鈕、裝備鍛造免費單抽、後端貨幣唯一權威。

## 依賴

- `.ai/specs/hero-schema.md` — Rarity 列舉、HeroTemplate
- `.ai/specs/optimistic-queue.md` — 樂觀更新佇列（背景同步使用 `fireOptimistic`）
- `.ai/specs/save-system.md` — `load-save` API 在登入時回傳池資料

---

## 1. 介面契約

```typescript
interface GachaBanner {
  id: string;
  name: string;                      // "常駐招募"
  type: 'standard' | 'limited';
  featuredHeroes: string[];          // hero_id[]（UP 角色）
  startDate: string;                 // ISO date
  endDate?: string;                  // 常駐池無結束
  rateTable: RateTable;
  pityCounter: PityConfig;
}

interface RateTable {
  SSR: number;    // 0.015 = 1.5%
  SR: number;     // 0.10  = 10%
  R: number;      // 0.35  = 35%
  N: number;      // 0.535 = 53.5%
}

interface PityConfig {
  softPity: number;     // 75（從第 75 抽起 SSR 機率遞增）
  hardPity: number;     // 90（第 90 抽保底 SSR）
  softPityBoost: number; // 每抽增加的 SSR 機率（+5%）
  featured5050: number;  // UP 角色的機率（0.5 = 50/50）
  guaranteedFeatured: boolean; // 歪一次後下次保底 UP
}

/** 抽卡結果（API 回傳） */
interface GachaPullResult {
  heroId: number;
  rarity: GachaRarity;
  isNew: boolean;
  isFeatured: boolean;
  stardust: number;    // 重複時依稀有度計算（SSR=25, SR=5, R=1, N=1），新角色為 0
  fragments: number;   // 重複時依星級計算英雄碎片數，新角色為 0
}

interface GachaPullResponse {
  success: boolean;
  results: GachaPullResult[];
  diamondCost: number;
  ticketsUsed: number;
  freePullUsed: boolean;
  newPityState: PityState;
  currencies: { gold?: number; diamond?: number; exp?: number };
  error?: string;
}

interface PityState {
  pullsSinceLastSSR: number;
  guaranteedFeatured: boolean;
}
```

---

## 2. 機率與保底

### 基礎機率
| 稀有度 | 機率 |
|--------|------|
| SSR | 1.5% |
| SR | 10% |
| R | 35% |
| N | 53.5% |

### 保底機制
- **軟保底**：第 75 抽起，每抽 SSR 機率 +5%（第 75 抽 = 6.5%, 第 76 = 11.5%...）
- **硬保底**：第 90 抽必出 SSR（effectiveSSR = 100%）
- **UP 保底**：SSR 有 50% 機率為 UP 角色；若本次不是 UP，下次 SSR 必為 UP
- **保底計數器跨 banner 繼承**（限定池獨立計算）

### 抽卡成本
| 操作 | 消耗 |
|------|------|
| 單抽 | 160 鑽石 |
| 十連 | 1,600 鑽石（無折扣 = 10 × 160） |

### 免費每日抽卡（v2.1 新增，v2.2 改版）

每位玩家每日可免費單抽一次英雄召喚及一次裝備鍛造（鑽石池），重置時間為 UTC+8 午夜 00:00。
免費單抽已合併至單抽按鈕：可用時顯示「🎁 免費」，使用後顯示倒數計時至下次免費。

| 項目 | 英雄召喚 | 裝備鍛造 |
|------|---------|---------|
| 免費次數 | 每日 1 次 | 每日 1 次（限鑽石池） |
| 適用卡池 | 英雄常駐池 | 鑽石裝備池 |
| 保底計數 | 正常累計 | N/A（無 pity） |
| D1 欄位 | `save_data.lastHeroFreePull` | `save_data.lastEquipFreePull` |
| 重置時區 | UTC+8 | UTC+8 |

### 抽卡券系統（v2.1 新增）

抽卡券為背包道具，使用時等同一次單抽（不消耗鑽石）。

| 抽卡券 itemId | 適用卡池 | 來源 |
|-----------------|---------|------|
| `gacha_ticket_hero` | 英雄抽卡 | 簽到獎勵（Day 3, 5, 6, 7）、特殊商店（50 鑽/張，每日限購 3 張）、活動信件 |
| `gacha_ticket_equip` | 裝備抽卡 | 簽到獎勵（Day 3, 5, 6, 7）、特殊商店（50 鑽/張，每日限購 3 張）、活動信件 |

- 使用抽卡券時保底計數正常累計
- 十連抽也支援抽卡券（券不足以鑽石補差）
- 前端透過 `callApi('gacha-pull', { count, isFree })` 呼叫

### 重複角色處理
- 重複獲得 → 轉換為「星塵」+ 角色碎片
- 星塵：SSR → 25 ｜ SR → 5 ｜ R → 1 ｜ N → 1
- 碎片：★4 → 40 ｜ ★3 → 15 ｜ ★2 → 5 ｜ ★1 → 5

---

## 3. 抽卡架構（v2.0 即時生成）

### 設計目標

後端已從 GAS 遷移至 Cloudflare Workers + D1，API 延遲降至 ~100ms。  
不再需要預生成 400 筆池的複雜同步機制。  
改為**每次抽卡直接呼叫後端 API，即時生成結果**。

### 架構流程圖

```
┌─────────────┐     gacha-pull API       ┌──────────────┐
│  Workers    │ ◄────────────────────────│  前端         │
│  D1 (pity)  │   { count: 1|10 }       │  GachaScreen  │
│             │ ────────────────────────→│              │
│             │   results + pity         │  顯示結果     │
└─────────────┘                          └──────────────┘
```

### 3.1 後端：即時生成

**位置**：`workers/src/routes/gacha.ts`

#### D1 相關欄位（`save_data`）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `gachaPity` | JSON text | 保底狀態 `PityState` |
| `diamond` | INTEGER | 鑽石餘額 |
| `lastHeroFreePull` | TEXT | 英雄免費單抽最後使用日期 (YYYY-MM-DD, UTC+8) |
| `lastEquipFreePull` | TEXT | 裝備免費單抽最後使用日期 (YYYY-MM-DD, UTC+8) |

> ⚠️ `gachaPool`、`gachaPoolEndPity` 欄位仍存在於 D1 但不再使用（僅歷史資料）

#### 核心函數

| 函數 | 說明 |
|------|------|
| `generateGachaEntries(heroPool, startPity, count)` | 根據機率表 + 保底狀態即時生成 N 筆結果 |

#### `gacha-pull` API 流程

```
POST /api/gacha-pull  { guestToken, count: 1|10, isFree? }
1. 免費抽：驗證 lastHeroFreePull ≠ 今日 UTC+8
   付費抽：驗證鑽石（券優先，不足以鑽石補差）
2. 讀取 gachaPity（保底狀態）
3. 載入 heroes 表取得英雄池
4. generateGachaEntries(heroPool, pity, count)  — 即時生成
5. 遍歷結果：
   a. isNew → INSERT hero_instances
   b. 重複 → INSERT stardust + fragments 到 inventory
6. UPDATE save_data: diamond - cost, gachaPity = newPity, lastHeroFreePull
7. 回傳 { results, diamondCost, ticketsUsed, freePullUsed, newPityState, currencies }
```

### 3.2 前端整合

**位置**：`src/components/GachaScreen.tsx`

#### `doPull()` 流程

```typescript
async function doPull(count: 1 | 10, isFree = false) {
  // 1. 前端預檢鑽石（免費抽跳過）
  // 2. 開始動畫 (setIsPulling)
  // 3. const res = await callApi('gacha-pull', { count, isFree })
  // 4. applyCurrenciesFromServer(res.currencies) — 後端唯一權威
  // 5. 更新保底計數、扣券
  // 6. 動畫完成後顯示結果卡片
  // 7. 本地同步：addItemsLocally(重複碎片+星塵)
  // 8. emitAcquire(toast 動畫)
}
```

#### 已移除的檔案/函數

| 已刪除 | 說明 |
|--------|------|
| `src/services/gachaLocalPool.ts` | 本地池管理（400 筆預生成池、localStorage 備份、背景同步） |
| `src/services/gachaPreloadService.ts` | 預載快取服務 |
| `initLocalPool()` 呼叫 | saveService.ts 中移除 |
| `clearLocalPool()` 呼叫 | useLogout.ts、useSave.ts 中移除 |
| `refill-pool` API | Workers 端已移除 |
| `gacha-pool-status` API | Workers 端已移除 |

---

## 4. 效能特徵

| 指標 | v1.x（本地池） | v2.0（即時 API） |
|------|----------------|------------------|
| 抽卡回應時間 | 0ms（同步本地） | ~100-300ms（API 往返） |
| 登入載入量 | +24KB（400 筆池） | 無額外載入 |
| 離線抽卡 | 可（有 localStorage 備份） | 不可（需要網路） |
| 程式碼複雜度 | 高（池管理+同步+補池+localStorage） | 低（單一 API 呼叫） |
| 資料一致性 | 需要多層同步保障 | 100% 伺服器端（唯一來源） |

---

## 5. 裝備抽卡

> 裝備抽卡與英雄抽卡獨立，使用**前端生成 + 背景同步**模式。

### 兩種裝備池

| 池 | 貨幣 | 單抽成本 | 十連成本 | SSR | SR | R | N |
|----|------|---------|---------|-----|----|----|---|
| 金幣裝備池 | 金幣 | 10,000 | 90,000 | 2% | 13% | 35% | 50% |
| 鑽石裝備池 | 鑽石 | 200 | 2,000 | 8% | 20% | 40% | 32% |

### 規則

- 從 128 種模板中隨機抽 1 件（8 套裝 × 4 部位 × 4 稀有度）
- **可重複取得**
- **十連保底**：至少 1 件 SR+
- **無 pity 保底**

### 流程

```typescript
// 前端生成裝備（Domain pure logic）
equipSinglePull(pool) / equipTenPull(pool)
// 本地入帳
addEquipmentLocally(equipment)
// 等待後端扣款 + 取得權威 currencies
const res = await callApi('equip-gacha-pull', { poolType, count, isFree, equipment })
applyCurrenciesFromServer(res.currencies)
```

---

## 6. 擴展點

- [x] **裝備池**：金幣池 + 鑽石池（✅ v2.0）
- [ ] **友情抽**：用友情點抽 N/R
- [ ] **選擇券**：週年慶自選 SSR
- [ ] **碎片系統**：累積碎片合成特定角色
- [ ] **限定 banner**：獨立保底計數器

---

## 7. 關鍵檔案索引

| 檔案 | 職責 |
|------|------|
| `workers/src/routes/gacha.ts` | 後端：`gacha-pull`（即時生成）、`equip-gacha-pull`、`reset-gacha-pool`（QA） |
| `src/domain/gachaSystem.ts` | 前端 Domain：機率表、banner 定義、PityState 型別、成本常數 |
| `src/domain/equipmentGacha.ts` | 前端 Domain：裝備抽卡機率表、生成邏輯、費用計算 |
| `src/components/GachaScreen.tsx` | UI：英雄/裝備雙頁籤、`doPull()` async API 呼叫 |
| `src/services/progressionService.ts` | `gachaPull()` API wrapper |
| `src/services/inventoryService.ts` | `addEquipmentLocally()` 裝備本地入帳 |

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版草案：機率表、保底機制、成本、重複處理 |
| v1.0 | 2026-02-27 | 本地池架構：伺服器預生成 400 組 → 前端 0ms 同步抽卡 → 背景同步 |
| v1.1 | 2026-02-28 | 新增重複角色獎勵（stardust + fragments） |
| v1.2 | 2026-02-28 | N卡重複星塵從 0.2 改為 1（整數） |
| v1.3 | 2026-03-01 | 池大小 200→400；新增 gachaPreloadService |
| v1.4 | 2026-06-15 | 新增裝備抽卡章節（金幣池 + 鑽石池） |
| v1.5 | 2026-06-15 | 裝備抽卡完整實作：equipmentGacha.ts Domain 層 |
| v1.6 | 2026-03-01 | 抽卡動畫 + 結果卡片入場；裝備寶箱 |
| **v2.0** | **2026-06-16** | **重大改版**：移除 400 筆預生成池機制，改為即時 API 生成。刪除 `gachaLocalPool.ts`、`gachaPreloadService.ts`。移除 `refill-pool`、`gacha-pool-status` 端點。前端 `doPull()` 改為 async API 呼叫。後端 `gacha-pull` 回傳 stardust/fragments 欄位。 |
| v2.1 | 2026-03-03 | **免費抽卡 + 抽卡券**：新增每日免費單抽（`lastFreeGachaDate` D1 欄位）；新增抽卡券系統（`gacha_ticket_hero`、`gacha_ticket_equip` 背包道具）；GachaScreen UI 改為三按鈕布局（免費/券抽、單抽、十連） |
| **v2.2** | **2026-06-17** | **十連折扣移除 + 免費抽合併 + 裝備免費抽 + 後端貨幣權威**：十連抽不再折扣（英雄 1600、裝備鑽石池 2000）；免費單抽合併至單抽按鈕（可用時顯示「🎁 免費」，用完顯示倒數）；新增裝備鍛造鑽石池每日免費單抽（`lastEquipFreePull`）；所有抽卡 API 回傳 `currencies`，前端用 `applyCurrenciesFromServer` 覆蓋本地、移除 `onDiamondChange`/`onGoldChange` 前端預扣模式。 |
| v2.3 | 2026-06-19 | **抽卡券取得管道擴充**：英雄召喚券（`gacha_ticket_hero`）與裝備鍛造券（`gacha_ticket_equip`）新增取得途徑——簽到獎勵（Day 3, 5, 6, 7）及特殊商店（50 鑽石/張，每日限購 3 張）。 |
| v2.4 | 2026-03-04 | **前端狀態即時刷新修復**：召喚券/鍛造券扣除改用 `removeItemsLocally()`；新增 `updateFreePullLocally()` / `updateGachaPityLocally()` 本地同步函式；`saveService.notify()` 深複製 heroes 陣列修復 useMemo 偵測；`updateLocal()` 移除 `in` guard 允許寫入 optional fields。 |