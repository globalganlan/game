# 抽卡系統 Spec

> 版本：v1.1 ｜ 狀態：🟢 已實作
> 最後更新：2026-02-27
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

定義英雄招募（抽卡/Gacha）的機率、保底機制、卡池類型與經濟成本。  
核心架構：**伺服器預生成 200 組結果 → 登入時下載到前端 → 抽卡 0ms 本地消耗 → 背景同步伺服器**。

## 依賴

- `specs/hero-schema.md` — Rarity 列舉、HeroTemplate
- `specs/optimistic-queue.md` — 樂觀更新佇列（背景同步使用 `fireOptimistic`）
- `specs/save-system.md` — `load-save` API 在登入時回傳池資料

---

## 1. 介面契約

```typescript
interface GachaBanner {
  id: string;
  name: string;                      // "常駐招募"
  type: 'standard' | 'limited' | 'element';
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

/** 伺服器預生成的池 entry（縮寫 key 節省空間） */
interface PoolEntry {
  h: number;     // heroId
  r: string;     // rarity: 'N' | 'R' | 'SR' | 'SSR'
  f: boolean;    // isFeatured
}

interface LocalPullResult {
  heroId: number;
  rarity: GachaRarity;
  isNew: boolean;
  isFeatured: boolean;
  stardust: number;    // 重複時依稀有度計算（SSR=25, SR=5, R=1, N=0.2），新角色為 0
  fragments: number;   // 重複時依星級計算英雄碎片數，新角色為 0
}

interface LocalPullResponse {
  success: boolean;
  results: LocalPullResult[];
  diamondCost: number;
  newPityState: PityState;
  poolRemaining: number;
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
| 十連 | 1,440 鑽石（九折） |

### 重複角色處理
- 重複獲得 → 轉換為「星塵」+ 角色碎片
- 星塵：SSR → 25 ｜ SR → 5 ｜ R → 1 ｜ N → 1
- 碎片：★4 → 40 ｜ ★3 → 15 ｜ ★2 → 5 ｜ ★1 → 5

---

## 3. 本地池架構（核心機制）

### 設計目標

Google Apps Script 每次 API 呼叫需 10-17 秒，直接即時抽卡 UX 極差。  
解決方案：**伺服器預先生成未來 200 次抽卡的完整結果，登入時一次下載到前端。  
抽卡時 100% 本地消耗，零網路等待，背景非同步通知伺服器。**

### 架構流程圖

```
┌─────────────┐    login (load-save)    ┌──────────────┐
│  GAS 後端   │ ─────────────────────→  │  前端記憶體   │
│  gachaPool  │   200 entries (~12KB)   │  _pool[]     │
│  (Sheets)   │   + ownedHeroIds[]      │  _ownedIds   │
└──────┬──────┘   + pityState           └──────┬───────┘
       │                                       │
       │   ②  背景 gacha-pull                  │ ① 本地消耗 (0ms)
       │   (fireOptimistic)                    │ splice(0, count)
       │ ◄─────────────────────────────────────┤
       │                                       │
       │   ③  背景 refill-pool                 │
       │ ─────────────────────────────────────→ │
       │   回傳補充後的完整池                    │
       └───────────────────────────────────────┘
```

### 3.1 伺服器端：預生成池

**位置**：`gas/程式碼.js`

#### 資料結構（Google Sheets `saves` 表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `gachaPool` | JSON text | `PoolEntry[]`（最多 200 筆） |
| `gachaPoolEndPity` | JSON text | 生成最後一筆 entry 時的保底狀態（用來續生） |
| `gachaPity` | JSON text | 玩家 UI 顯示用的保底狀態 |

#### 核心函數

| 函數 | 說明 |
|------|------|
| `generateGachaPoolEntries_(heroPool, startPity, count)` | 根據機率表 + 保底狀態生成 N 筆 `PoolEntry[]`，回傳 `{entries, endPity}` |
| `ensureGachaPool_(playerId, saveData, sheet, row)` | 讀取現有池，不足則呼叫 `generateGachaPoolEntries_` 補滿到 200，寫回 Sheets |

#### `gachaPoolEndPity` vs `gachaPity` 區別

- `gachaPoolEndPity`：生成池最後一筆 entry 後的保底狀態 → 用來**續生新 entries**
- `gachaPity`：玩家**實際消耗到哪一筆**的保底狀態 → 用於 **UI 顯示**  
  （兩者分離是因為池是預先生成的，玩家可能才抽了 10 筆但池已經算到第 200 筆的保底）

### 3.2 GAS API 端點

#### `load-save`（登入）

回傳值新增：
```json
{
  "gachaPool": [{"h":3,"r":"N","f":false}, ...],   // 完整 200 筆
  "ownedHeroIds": [1, 3, 6],                        // 已擁有英雄 ID（供 isNew 判斷）
  "saveData": { "gachaPity": {...}, ... }            // 含保底狀態
}
```
- `load-save` 內部呼叫 `ensureGachaPool_()` 確保池存在且補滿
- `ownedHeroIds` 從 `hero_instances` 表去重取得

#### `gacha-pull`（伺服器端消耗）

- 前端背景透過 `fireOptimistic('gacha-pull', {bannerId, count})` 呼叫
- 伺服器端：扣鑽石 → 消耗池前 N 筆 → 新英雄建 instance / 重複轉星塵+碎片 → 更新 `gachaPity` → 自動補池
- 使用 `executeWithIdempotency_(opId, ...)` 冪等保護（不會重複扣鑽/重複入帳）

#### `refill-pool`（背景補池）

```json
POST { "action": "refill-pool", "guestToken": "..." }
→ {
    "success": true,
    "newEntries": [...],          // ⚠️ 只有新生成的 entries（非全池）
    "newEntriesCount": 10,        // 新增數量
    "serverPoolTotal": 200,       // 伺服器端池總量
    "ownedHeroIds": [...],        // 最新 owned（可能有新英雄）
    "diamond": 1234               // 最新鑽石
  }
```
- 前端消耗池後背景呼叫，取回**新生成的 entries**（只追加、不覆蓋）
- ⚠️ **不回傳 pityState**：client pity 由本地消耗 entries 維護，server pity 僅用於池生成

### 3.3 前端：本地池服務

**位置**：`src/services/gachaLocalPool.ts`

#### 記憶體狀態

| 變數 | 型別 | 說明 |
|------|------|------|
| `_pool` | `PoolEntry[]` | 預生成池（登入載入 200 筆，消耗後減少） |
| `_pityState` | `PityState` | 保底計數（本地即時更新） |
| `_ownedHeroIds` | `Set<number>` | 已擁有英雄（用於判斷 isNew） |

#### localStorage 備份

| key | 內容 | 用途 |
|-----|------|------|
| `globalganlan_gacha_pool` | `PoolEntry[]` JSON | 頁面 reload 後可恢復 |
| `globalganlan_gacha_pity` | `PityState` JSON | 保底狀態備份 |
| `globalganlan_owned_heroes` | `number[]` JSON | owned hero 備份 |
| `globalganlan_pending_pulls` | `PendingPull[]` JSON | 尚未同步的抽卡操作（離線保護） |

#### 公開 API

| 函數 | 說明 |
|------|------|
| `initLocalPool(pool, pityState, ownedHeroIds)` | 登入時呼叫，載入伺服器資料到記憶體 |
| `localPull(bannerId, count, currentDiamond)` | **同步**（0ms）本地抽卡 → 回傳 `LocalPullResponse` |
| `getPoolRemaining()` | 取得剩餘池數量 |
| `getPityState()` | 取得當前保底狀態 |
| `getOwnedHeroIds()` | 取得已擁有英雄 ID |
| `onPoolChange(fn)` | 訂閱池數量變化（UI 用） |
| `tryRestoreFromStorage()` | 從 localStorage 恢復（離線 fallback） |
| `clearLocalPool()` | 清除所有本地資料（登出時呼叫） |
| `triggerRefill()` | 手動觸發背景補池 |

#### `localPull()` 內部流程

```
1. 檢查 diamond ≥ cost — 不足 → error: 'insufficient_diamond'
2. 檢查 _pool.length ≥ count — 不足 → error: 'pool_empty'
3. consumed = _pool.splice(0, count)  — 同步取出
4. 遍歷 consumed：
   a. isNew = !_ownedHeroIds.has(heroId)
   b. if isNew → _ownedHeroIds.add(heroId)
   c. if SSR → pity 歸零 + 更新 guaranteedFeatured
   d. else → pity++
5. savePoolToStorage() — localStorage 持久化
6. savePendingPull() — 記錄待同步操作（離線保護）
7. fireOptimistic('gacha-pull', {bannerId, count}) — 背景 API 通知伺服器
8. scheduleRefill() — 排程背景補池（debounce 500ms）
9. notifyListeners() — 通知 UI 更新
10. return { success:true, results, diamondCost, newPityState, poolRemaining }
```

#### 背景補池機制

- `scheduleRefill()` — debounce 500ms（連抽時不重複呼叫）
- `doRefill()` — 呼叫 `refill-pool` API → **追加**伺服器新生成的 entries 到本地池（不覆蓋）
- 同步 `ownedHeroIds`（安全）。⚠️ **不同步 pityState**（client pity 由消耗 entries 維護，避免 race condition 跳號）
- `_isRefilling` flag 防止並行補池

### 3.4 前端整合點

| 檔案 | 整合方式 |
|------|---------|
| `saveService.ts` `loadSave()` | 登入時呼叫 `initLocalPool(res.gachaPool, res.saveData.gachaPity, res.ownedHeroIds)` |
| `GachaScreen.tsx` | `doPull()` 呼叫 `localPull()` — 同步回傳，無 async/loading 狀態 |
| `useSave.ts` `doClearCache()` | 登出時呼叫 `clearLocalPool()` 清理 |

---

## 4. 資料一致性保障

### 一致性策略

| 場景 | 處理方式 |
|------|---------|
| 正常抽卡 | 本地消耗 → 背景 `gacha-pull` 同步 → 背景 `refill-pool` 補池 |
| 頁面 reload | localStorage 恢復本地池 → 繼續消耗 |
| API 失敗 | `fireOptimistic` 自動重試 3 次 → `pendingPulls` localStorage 備份 |
| 離線抽卡 | 可用池本地消耗（有 localStorage 備份） → 上線後 `reconcilePendingOps` |
| 補池後本地池替換 | `doRefill()` 以伺服器完整池替換本地 → 確保本地與伺服器一致 |

### isNew 判斷一致性

- 登入時從 `hero_instances` 表取得 `ownedHeroIds` 集合
- 每次本地抽到新英雄 → 立即 `_ownedHeroIds.add(heroId)`
- `refill-pool` 回傳最新 `ownedHeroIds` → 覆蓋本地（以伺服器為準）
- **極端邊界**：兩個分頁同時抽卡可能造成 isNew 顯示不一致，但伺服器端 `gacha-pull` handler 會正確判斷並建立/轉碎片 — **不影響資料正確性，僅影響顯示瞬間**

---

## 5. 效能特徵

| 指標 | 數值 |
|------|------|
| 池大小 | 200 筆 |
| 池資料大小 | ~12 KB（JSON） |
| 登入載入時間增量 | 包含在 `load-save` 回應，幾乎無額外延遲 |
| 抽卡回應時間 | **0ms**（同步本地操作） |
| 背景同步延遲 | `gacha-pull` ~10s + `refill-pool` ~10s（不影響 UX） |
| 連續抽卡上限 | 200 次（極端情況：比背景補池更快抽完 → 顯示「請稍後再試」） |

---

## 6. 擴展點

- [ ] **武器池**：獨立的裝備 gacha
- [ ] **友情抽**：用友情點抽 N/R
- [ ] **選擇券**：週年慶自選 SSR
- [ ] **碎片系統**：累積碎片合成特定角色
- [ ] **限定 banner**：獨立保底計數器 + 專屬池生成
- [ ] **池容量動態調整**：根據玩家活躍度調整（高活躍 → 300 筆）

---

## 7. 關鍵檔案索引

| 檔案 | 職責 |
|------|------|
| `gas/程式碼.js` → `generateGachaPoolEntries_()` | 伺服器端：根據機率+保底生成池 entries |
| `gas/程式碼.js` → `ensureGachaPool_()` | 確保池補滿到 200 |
| `gas/程式碼.js` → `handleGachaPull_()` | 伺服器端消耗池、扣鑽石、入帳英雄 |
| `gas/程式碼.js` → `handleRefillPool_()` | 背景補池 API |
| `gas/程式碼.js` → `handleLoadSave_()` | 登入時回傳完整池+ownedHeroIds |
| `src/domain/gachaSystem.ts` | 前端 Domain：機率表、banner 定義、PityState 型別 |
| `src/services/gachaLocalPool.ts` | 前端核心：本地池管理、同步抽卡、背景補池 |
| `src/components/GachaScreen.tsx` | UI：呼叫 `localPull()` 顯示結果 |
| `src/services/saveService.ts` | 登入時 `initLocalPool()` |

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版草案：機率表、保底機制、成本、重複處理 |
| v1.0 | 2026-02-27 | **重大改版**：新增本地池架構（§3-§5），伺服器預生成 200 組 → 前端 0ms 同步抽卡 → 背景同步。新增 GAS `refill-pool` API、前端 `gachaLocalPool.ts`。升級為已實作狀態 🟢 |
| v1.1 | 2026-02-28 | 新增重複角色獎勵（`stardust` + `fragments` 欄位）、抽卡 UI 顯示「重複」badge + 星塵/碎片數量、重複獎勵透過 `addItemsLocally()` 入帳背包 |
