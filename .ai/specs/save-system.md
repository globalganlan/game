# 存檔系統 Spec

> 版本：v2.2 ｜ 狀態：🟢 已實作
> 最後更新：2026-06-19
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

以 Google Sheets 為持久化後端，儲存玩家的養成進度、陣型、關卡進度、貨幣等。
每次狀態變更（過關、升級、抽卡等）時寫入 Sheet，進入遊戲時拉取還原。

## 依賴

- `.ai/specs/auth-system.md` — playerId / guestToken / resolvePlayerId_
- `.ai/specs/hero-schema.md` — 英雄資料結構
- `.ai/specs/stage-system.md` — 關卡進度結構
- `.ai/specs/progression.md` — 養成結構
- `.ai/specs/gacha.md` — 抽卡池預生成

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/services/saveService.ts` | 核心服務 — loadSave / updateLocal / collectResources / saveFormation |
| `src/hooks/useSave.ts` | React Hook — 封裝 saveService |
| `gas/程式碼.js` | GAS Handler — `handleLoadSave_ / handleInitSave_ / handleSaveProgress_ / handleSaveFormation_ / handleCollectResources_` |

---

## Google Sheet 結構

### Sheet: `save_data`（主存檔，一人一行）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 主鍵，對應 players Sheet |
| `displayName` | string | 暱稱 |
| `diamond` | number | 鑽石（premium 貨幣） |
| `gold` | number | 金幣（一般貨幣） |
| `resourceTimerStage` | string | 資源產出器掛載的最高通關關卡 ID（如 `"2-5"`，純文字格式 `@` 防 Sheets 日期轉換） |
| `resourceTimerLastCollect` | string | 上次領取資源時間（ISO 8601） |
| `towerFloor` | number | 爬塔最高樓層 |
| `storyProgress` | string | 章節進度 JSON `{"chapter":1,"stage":5}` |
| `formation` | string | 當前陣型 JSON `[heroInstanceId, null, ...]` (6 slots) |
| `stageStars` | string | 每關通關狀態 JSON `{"1-1": 1, "1-2": 1}`（值為 `1` 表已通關，不再使用 1~3 星級） |
| `gachaPity` | string | 保底計數 JSON `{"pullsSinceLastSSR":0,"guaranteedFeatured":false}` |
| `gachaPool` | string | 預生成抽卡池 JSON（200 組 pull results） |
| `pwaRewardClaimed` | boolean | PWA 安裝獎勵是否已領取（`true` = 已領） |
| `equipment` | string | **v2.0 新增** — 裝備 JSON `OwnedEquipment[]`（見 `progression.md` §四） |
| `equipmentCapacity` | ~~number~~ | **v2.1 廢棄** — 不再限制裝備容量，欄位保留但不再使用 |
| `checkinDay` | number | **v1.7 新增** — 每日簽到天數（1~7 循環） |
| `checkinLastDate` | string | **v1.7 新增** — 上次簽到日期（UTC+8 格式 `YYYY-MM-DD`） |
| `lastSaved` | string | 最後存檔時間（ISO 8601） |

> **注意**：`stageStars` 欄位不在 GAS `SAVE_HEADERS_` 初始定義中，由 `handleCompleteBattle_` 在首次寫入星級時動態新增。

### Sheet: `hero_instances`（玩家擁有的英雄，一人多行）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵 |
| `instanceId` | string | 唯一 `{playerId}_{heroId}_{timestamp}` |
| `heroId` | number | 對應 heroes 表的 HeroID |
| `level` | number | 英雄等級 |
| `exp` | number | 當前經驗值 |
| `ascension` | number | 突破階段 (0-5)，最大 5（覺醒） |
| `stars` | number | 星級 (0-6)，新英雄預設 0 |
| `equippedItems` | string | 裝備 JSON `{"weapon":"equipId",...}`（equipId 對應 `save_data.equipment` 中的 `OwnedEquipment.id`） |
| `obtainedAt` | string | 獲得時間 |

### Sheet: `inventory`（玩家道具，一人多行）

> 完整道具系統、裝備實例、商店定義見 `.ai/specs/inventory.md`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵 |
| `itemId` | string | 道具 ID（命名規則見 inventory.md §1.2） |
| `quantity` | number | 數量 |

> **v2.1 新增道具**：`equip_scrap`（裝備碎片）— 裝備分解產出的可堆疊素材，用於裝備強化等用途。

---

## API 端點

| action | 參數 | 回傳 | GAS Handler |
|--------|------|------|-------------|
| `load-save` | `{ guestToken }` | `{ saveData, heroes, isNew, gachaPool, ownedHeroIds }` | `handleLoadSave_` |
| `init-save` | `{ guestToken }` | `{ success, alreadyExists, starterHeroInstanceId }` | `handleInitSave_` |
| `save-formation` | `{ guestToken, formation }` | `{ success }` | `handleSaveFormation_` |
| `collect-resources` | `{ guestToken, opId? }` | `{ success, gold, expItems, newGoldTotal }` | `handleCollectResources_` |
| `daily-checkin` | `{ guestToken }` | `{ success, day, rewards }` 或 `{ success: false, reason }` | `handleDailyCheckin_` |

> **v2.0**：`save-progress` 已移除。原本 4 個允許欄位均已由專用路由負責：
> - `displayName` → `change-name`
> - `formation` → `save-formation`
> - `resourceTimerStage` → `complete-battle`
> - `resourceTimerLastCollect` → `collect-resources`

---

## 載入流程（loadSave）

```
POST load-save { guestToken }
    ↓
handleLoadSave_:
  1. resolvePlayerId_(guestToken) → playerId
  2. 查 save_data 表 → 找不到 → { isNew: true }
  3. 解析 JSON 欄位（storyProgress / formation / gachaPity）
  4. readHeroInstances_(playerId) → 解析 equippedItems JSON
  5. ensureGachaPool_(playerId) → 確保池 >= 200 組
  6. 收集 ownedHeroIds（去重）
  7. 回傳完整資料
    ↓
前端 saveService.loadSave():
  1. 若 isNew → POST init-save → POST load-save（二次載入）
  2. sanitizeSaveData() — 防禦性解析雙重序列化 JSON
  3. initLocalPool() — 初始化本地抽卡池
  4. 存入 currentData → 寫 localStorage → notify()
  5. 背景 reconcilePendingOps()（補償上次未完成操作）
  6. 失敗時 fallback 讀 localStorage 快取
```

### sanitizeSaveData 防護

| 欄位 | 防護 |
|------|------|
| `storyProgress` | 字串 → JSON.parse → 非物件重置為 `{chapter:1, stage:1}` |
| `towerFloor` | < 1 → 1 |
| `formation` | 字串 → JSON.parse → 非陣列重置為 6 個 null |
| `stageStars` | 字串 → JSON.parse → 非物件重置為 `{}` |
| `gachaPity` | 字串 → JSON.parse → 預設 `{pullsSinceLastSSR:0, guaranteedFeatured:false}` |

---

## 存檔策略

### 何時寫入

| 觸發點 | 寫入內容 |
|--------|---------|
| 過關 | storyProgress / towerFloor / stageStars + 獎勵（gold, items） |
| 英雄升級 | hero_instances 該行 level, exp |
| 陣型調整 | save_data.formation（戰鬥開始時存檔，非即時） |
| 抽卡 | hero_instances + inventory + diamond 扣除 |
| 每日副本 | 掉落物寫入 inventory |

### 寫入方式（本地即時 + 專用路由同步）

```
前端狀態變更
    ↓
updateLocal(changes):
  1. 即時更新 currentData.save + 寫 localStorage + notify()
    ↓
專用路由負責寫入伺服器：
  - 金幣/鑽石/經驗 → complete-battle / shop-buy / collect-resources
  - 陣型 → save-formation
  - 暱稱 → change-name
  - 關卡進度 → complete-battle
  - 資源計時器 → complete-battle / collect-resources
```

> **v2.0 架構簡化**：移除 debounce 2s + retry 機制，不再使用 `save-progress` 統一寫入。
> 所有存檔欄位皆由專用 API 路由在對應操作時直接寫入伺服器，前端僅做本地樂觀更新。
> 所有寫入操作均採用 Optimistic Queue（`fireOptimistic` / `fireOptimisticAsync`）。

### 本地快取

- localStorage key: `globalganlan_save_cache`
- 存檔副本同步複寫到 localStorage
- 離線時可讀取快取繼續遊玩
- 重新上線後 `reconcilePendingOps()` 補償

---

## 陣型存讀

### 還原流程

```
登入完成 → fetchData → 讀取 save.formation
    ↓
對照 ownedHeroIds 驗證（不再擁有的英雄跳過）
    ↓
對照 heroesList 取得完整資料（name/HP/modelId...）
    ↓
updatePlayerSlots() 還原上次陣型
```

### 保存時機

- **戰鬥開始時**才呼叫 `saveFormation()`（在 `runBattleLoop` 中，非 replay 模式）
- 不再使用 `useEffect` 監聽 `playerSlots` 變化自動存
- `saveFormation()` 為同步函式：寫 localStorage + `fireOptimistic('save-formation', { formation })`

---

## 前端介面

```typescript
interface SaveData {
  playerId: string
  displayName: string
  diamond: number
  gold: number
  resourceTimerStage: string
  resourceTimerLastCollect: string
  towerFloor: number
  storyProgress: { chapter: number; stage: number }
  formation: (string | null)[]       // 6 slots, heroInstanceId or null
  stageStars: Record<string, number> // stageId → 1（已通關），不再使用 1~3 星級
  lastSaved: string
  gachaPity?: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
  equipment?: OwnedEquipment[]   // v2.0 新增：裝備模板制
  checkinDay?: number             // v1.7 新增：簽到天數 (1~7)
  checkinLastDate?: string        // v1.7 新增：上次簽到日期
}

/** v2.0 裝備模板制（詳見 progression.md §四） */
interface OwnedEquipment {
  id: string            // "EQ_{timestamp}_{random}"
  templateId: string    // "eq_{setId}_{slot}_{rarity}"
  enhanceLevel: number  // 0 ~ maxLevel
  equippedBy: string    // heroInstanceId 或 ''
  locked?: boolean      // **v2.1 廢棄** — 不再使用鎖定功能，欄位保留但前端忽略
}

interface HeroInstance {
  instanceId: string
  heroId: number
  level: number
  exp: number
  ascension: number
  equippedItems: Record<string, string>
  obtainedAt: string
}

interface InventoryItem {
  itemId: string
  quantity: number
}

interface PlayerData {
  save: SaveData
  heroes: HeroInstance[]
  inventory: InventoryItem[]
  isDirty: boolean           // 有未同步變更
}
```

### 導出函式

| 函式 | 簽名 | 說明 |
|------|------|------|
| `loadSave` | `() => Promise<PlayerData>` | 完整載入存檔（含 fallback） |
| `getSaveState` | `() => PlayerData \| null` | 同步讀取（避免閉包延遲） |
| `updateProgress` | `(changes: Partial<SaveData>) => void` | 增量更新（走 debounce） |
| `updateStoryProgress` | `(chapter, stage) => void` | 更新章節進度 |
| `updateStageStars` | `(stageId, stars) => void` | 只升不降更新星級 |
| `saveFormation` | `(formation) => boolean` | 同步存陣型（Optimistic） |
| `collectResources` | `() => Promise<AccumulatedResources \| null>` | 領取離線產出（幂等保護） |
| `addHero` | `(heroId) => Promise<HeroInstance \| null>` | 新增英雄 |
| `addHeroesLocally` | `(heroIds) => void` | 本地樂觀新增英雄 |
| `flushPendingChanges` | `() => Promise<void>` | 強制送出待同步變更 |
| `onSaveChange` | `(fn) => () => void` | 訂閱存檔變化 |
| `clearLocalSaveCache` | `() => void` | 清除 localStorage 快取 |

---

## 新玩家初始存檔

```typescript
// GAS handleInitSave_ 寫入的初始值
const INITIAL_SAVE = {
  displayName: '倖存者#0001',        // '倖存者#' + playerId.replace('P','')
  diamond: 500,                       // 新手禮包
  gold: 10000,
  resourceTimerStage: '1-1',          // 通關 1-1 後啟動
  resourceTimerLastCollect: now,       // ISO 8601
  towerFloor: 0,                          // GAS 初始值 0；前端 sanitizeSaveData 會將 <1 的值修正為 1
  storyProgress: '{"chapter":1,"stage":1}',
  formation: '[6,1,9,null,null,null]',   // 自動上陣 3 隻初始英雄（注意：此處為 heroId 數字，非 heroInstanceId 字串；前端 sanitize 時會處理）
  lastSaved: now,
}

// 初始英雄（3 隻）：
//  HeroID=6  無名活屍（N, 均衡, 闇）
//  HeroID=1  女喪屍（R, 敏捷, 闇）
//  HeroID=9  倖存者（R, 均衡, 光）
// instanceId = playerId + '_{heroId}_' + (Date.now() + index)
// formation 自動填入前 3 格：[6, 1, 9, null, null, null]
```

---

## 資源產出計時器

> 取代傳統體力系統。玩家**無限制闖關**，成長限制來自資源的時間產出。

### 機制

```
玩家通關關卡 → 資源計時器掛載到「已通關最高關卡」
    ↓
計時器持續累積資源（離線也算）
    ↓
玩家進入遊戲 → 按「領取」→ 一次收取累積的金幣 + 經驗素材
    ↓
通關更高關卡 → 計時器產出量自動升級
```

### 產出公式（前端 = GAS 相同）

```typescript
interface ResourceTimerYield { goldPerHour: number; expItemsPerHour: number }
interface AccumulatedResources { gold: number; expItems: number; hoursElapsed: number }

function getTimerYield(stageId: string): ResourceTimerYield {
  const [ch, st] = stageId.split('-').map(Number)
  const progress = (ch - 1) * 8 + st               // 線性進度 1~24
  return {
    goldPerHour: 100 + progress * 50,               // 150 ~ 1300
    expItemsPerHour: Math.max(1, Math.floor(progress / 3)),  // 1 ~ 8
  }
}

function getAccumulatedResources(stageId, lastCollect, maxHours = 24) {
  const elapsed = Date.now() - new Date(lastCollect).getTime()
  const hours = Math.min(maxHours, elapsed / 3_600_000)
  const { goldPerHour, expItemsPerHour } = getTimerYield(stageId)
  return {
    gold: Math.floor(goldPerHour * hours),
    expItems: Math.floor(expItemsPerHour * hours),
    hoursElapsed: hours,
  }
}
```

### collectResources 流程

```
前端 collectResources():
  1. storyProgress.chapter===1 && stage===1 → 未解鎖，return null
  2. 本地計算 getAccumulatedResources()
  3. gold<=0 && expItems<=0 → return null
  4. 樂觀更新 currentData.save.gold + resourceTimerLastCollect=now
  5. fireOptimistic('collect-resources', {})  ← 幂等保護 opId
  6. 伺服器 callback 校正 newGoldTotal（若不一致）
  7. 回傳本地計算結果

GAS handleCollectResources_:（包在 executeWithIdempotency_ 中）
  1. 驗證 token → playerId
  2. 讀 resourceTimerStage / resourceTimerLastCollect
  3. 計算相同公式 → goldGain / expItemsGain
  4. writeCell_(gold: currentGold + goldGain)
  5. 更新 resourceTimerLastCollect + lastSaved
  6. 回傳 { gold, expItems, newGoldTotal, hoursElapsed }
```

### 參數

| 項目 | 值 |
|------|-----|
| 最大累積時間 | 24 小時 |
| 產出週期 | 持續（離線也計算） |
| 領取方式 | 主畫面「領取」按鈕，一次全收 |
| 起始條件 | 通關 1-1 後啟動 |
| 產出隨進度提升 | 通關越後面的關卡，金幣/經驗產量越高 |

---

## 擴展點

- [ ] **多陣型預設**：儲存多組陣型（PvP 用 / Boss 用 / 章節用）
- [ ] **戰鬥回放**：儲存戰鬥 seed 做重播
- [ ] **雲端備份**：匯出/匯入 JSON 存檔
- [ ] **公會系統**：共享存檔資料（公會倉庫）

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版：Google Sheets 存檔結構 + 讀寫策略 |
| v0.2 | 2026-02-26 | 移除體力系統，新增「資源產出計時器」取代（resourceTimerStage + resourceTimerLastCollect） |
| v0.3 | 2026-02-28 | 新增 `stageStars` / `battleSpeed` 欄位、陣型自動存讀、sanitization 防護、`saveFormation` 改 sync + Optimistic、全面採用 Optimistic Queue、`getSaveState()` 新 API |
| v0.4 | 2026-02-28 | 移除 `battleSpeed` 欄位（改存 localStorage，不再同步到 Google Sheet）、GAS 新增 `delete-column` handler |
| v1.0 | 2026-03-01 | 全面同步實作：新增 gachaPity/gachaPool 欄位至 Sheet 結構、補齊 loadSave 完整流程（含 isNew/initSave/sanitize/reconcile/fallback）、enqueueSave debounce 2s + retry 3x 機制、collectResources 幂等保護 + 樂觀更新、陣型改為戰鬥開始時才保存、完整列出所有導出函式簽名、init-save 初始值詳列 |
| v1.1 | 2026-02-28 | 初始英雄從 1 隻（無名活屍 N）改為 3 隻（+女喪屍 R、倖存者 R），formation 自動填入前 3 格，修復新帳號卡關 1-1 問題 |
| v1.2 | 2026-02-28 | 新增完整登出狀態重置（`handleFullLogout`→v1.8 改為 `useLogout` hook）：清除 9 個服務層快取 + 20+ 個 React state + 5 個 ref 守門旗標，修復登出再登入殘留舊帳號資料問題 |
| v1.5 | 2026-03-01 | Spec 修正：hero_instances 新增 `stars` 欄位（第 9 欄，預設 0）；`ascension` 範圍修正 0-5（非 0-6）；`save-progress` 白名單阻擋加入 `stageStars`；標注 `stageStars` 非 SAVE_HEADERS_ 初始欄位（由 complete-battle 動態新增）；初始 formation 標注為 heroId 數字（非 heroInstanceId）；towerFloor 初始 0 / 前端 sanitize 修正為 1 |
| v1.6 | 2026-06-15 | **配合裝備模板制 v2**：`save_data` 新增 `equipment` JSON 欄位（`OwnedEquipment[]`）；`hero_instances.equippedItems` 說明更新（equipId 對應 save_data.equipment 中的 OwnedEquipment.id）；前端 SaveData 介面新增 `equipment?: OwnedEquipment[]` |
| v1.7 | 2026-03-02 | **每日簽到欄位**：`save_data` 新增 `checkinDay`（number, 1~7 循環）、`checkinLastDate`（string, UTC+8 日期）；新增 `daily-checkin` API 端點 → `handleDailyCheckin_` handler；前端 SaveData 介面新增 `checkinDay?` / `checkinLastDate?` |
| v1.8 | 2025-07-14 | **Bug Fix: `updateStoryProgress` notify 時序**：`enqueueSave` 先設 JSON 字串再 notify，導致 React 端 `storyProgress` 為字串、`isFirstClear` 得到 `NaN`、後續關卡勝利不推進進度。修復：覆寫物件型態後再 `notify()` |
| v2.0 | 2026-03-02 | **移除 `save-progress` 路由**：原本的 debounce 2s + retry 寫入佇列已經完全無用—— 4 個 allowedFields 均已有專用路由（change-name / save-formation / complete-battle / collect-resources）。前端 `enqueueSave` 簡化為 `updateLocal()`（僅更新本地 state + localStorage），不再發送 API 請求 |
| v2.1 | 2026-06-19 | **欄位調整**：`stageStars` 值改為 `1`（已通關）取代舊版 `1~3` 星級；`equipmentCapacity` 欄位廢棄（不再限制裝備容量）；裝備實例 `locked` 欄位廢棄；新增 `equip_scrap` 可堆疊背包道具（裝備分解產出） |
| v2.2 | 2026-03-04 | **saveService 狀態刷新修復**：`notify()` 深複製 heroes + save 物件修復 useMemo 偵測；`updateLocal()` 移除 `if (key in currentData.save)` guard 允許寫入 optional fields（lastHeroFreePull/lastEquipFreePull/gachaPity）；`sanitizeSaveData()` 初始化 optional 日期欄位；新增 `updateFreePullLocally()` / `updateGachaPityLocally()` 匯出函式 |
