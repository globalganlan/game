# 存檔系統 Spec

> 版本：v0.2 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

以 Google Sheets 為持久化後端，儲存玩家的養成進度、陣型、關卡進度、貨幣等。
每次狀態變更（過關、升級、抽卡等）時寫入 Sheet，進入遊戲時拉取還原。

## 依賴

- `specs/auth-system.md` — playerId / guestToken
- `specs/hero-schema.md` — 英雄資料結構
- `specs/stage-system.md` — 關卡進度結構
- `specs/progression.md` — 養成結構

---

## Google Sheet 結構

### Sheet: `save_data`（主存檔，一人一行）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 主鍵，對應 players Sheet |
| `displayName` | string | 暱稱 |
| `level` | number | 玩家等級（帳號等級） |
| `exp` | number | 當前經驗值 |
| `diamond` | number | 鑽石（premium 貨幣） |
| `gold` | number | 金幣（一般貨幣） |
| `resourceTimerStage` | string | 資源產出器掛載的最高通關關卡 ID（如 `"2-5"`） |
| `resourceTimerLastCollect` | string | 上次領取資源時間（ISO 8601） |
| `towerFloor` | number | 爬塔最高樓層 |
| `storyProgress` | string | 章節進度 JSON `{"chapter":1,"stage":5}` |
| `formation` | string | 當前陣型 JSON `[heroInstanceId, null, ...]` (6 slots) |
| `lastSaved` | string | 最後存檔時間（ISO 8601） |

### Sheet: `hero_instances`（玩家擁有的英雄，一人多行）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵 |
| `instanceId` | string | 唯一 `{playerId}_{heroId}_{timestamp}` |
| `heroId` | number | 對應 heroes 表的 HeroID |
| `level` | number | 英雄等級 |
| `exp` | number | 當前經驗值 |
| `ascension` | number | 突破階段 (0-6) |
| `equippedItems` | string | 裝備 JSON `{"weapon":"item_01",...}` |
| `obtainedAt` | string | 獲得時間 |

### Sheet: `inventory`（玩家道具，一人多行）

> 完整道具系統、裝備實例、商店定義見 `specs/inventory.md`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵 |
| `itemId` | string | 道具 ID（命名規則見 inventory.md §1.2） |
| `quantity` | number | 數量 |

---

## API 端點

| 端點 | 方法 | 參數 | 回傳 | 說明 |
|------|------|------|------|------|
| `/load-save` | POST | `{ guestToken }` | `{ saveData, heroes, inventory }` | 拉取完整存檔 |
| `/save-progress` | POST | `{ guestToken, changes }` | `{ success, lastSaved }` | 增量寫入變更 |
| `/save-formation` | POST | `{ guestToken, formation }` | `{ success }` | 儲存陣型 |
| `/add-hero` | POST | `{ guestToken, heroId }` | `{ instanceId }` | 新增英雄（抽卡/獎勵） |
| `/upgrade-hero` | POST | `{ guestToken, instanceId, newLevel, newExp }` | `{ success }` | 升級英雄 |

---

## 存檔策略

### 何時寫入

| 觸發點 | 寫入內容 |
|--------|---------|
| 過關 | storyProgress / towerFloor + 獎勵（gold, exp, items） |
| 英雄升級 | hero_instances 該行 level, exp |
| 陣型調整 | save_data.formation |
| 抽卡 | hero_instances + inventory + diamond 扣除 |
| 每日副本 | 掉落物寫入 inventory |
| 自動存檔 | 每 5 分鐘檢查是否有未同步變更 |

### 寫入方式

```
前端狀態變更
    ↓
更新本地 state（即時反映 UI）
    ↓
加入寫入佇列（debounce 2 秒）
    ↓
批次呼叫 /save-progress（合併多次變更為一次 API call）
    ↓
成功 → 清佇列
失敗 → 重試 3 次 → Toast 提示「存檔失敗，請檢查網路」
```

### 本地快取

- 存檔副本同步複寫到 `localStorage`
- 離線時可繼續遊玩，重新上線後同步
- 衝突解決：**伺服器端 lastSaved 較新者優先**，但本地有未同步變更時提示使用者選擇

---

## 前端狀態

```typescript
interface SaveData {
  playerId: string
  displayName: string
  level: number
  exp: number
  diamond: number
  gold: number
  resourceTimerStage: string
  resourceTimerLastCollect: string
  towerFloor: number
  storyProgress: { chapter: number; stage: number }
  formation: (string | null)[]  // 6 slots, heroInstanceId or null
  lastSaved: string
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
  isDirty: boolean          // 有未同步變更
}
```

---

## 新玩家初始存檔

```typescript
const DEFAULT_SAVE: Partial<SaveData> = {
  level: 1,
  exp: 0,
  diamond: 500,        // 新手禮包
  gold: 10000,
  resourceTimerStage: '1-1',  // 通關 1-1 後啟動
  resourceTimerLastCollect: new Date().toISOString(),
  towerFloor: 0,
  storyProgress: { chapter: 1, stage: 1 },
  formation: [null, null, null, null, null, null],
}

// 初始英雄：贈送「無名活屍」（HeroID=6, ★1, 均衡型）
const STARTER_HERO = { heroId: 6, level: 1, exp: 0, ascension: 0 }
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

### 產出公式

```typescript
interface ResourceTimerYield {
  goldPerHour: number
  expItemsPerHour: number   // 小型經驗核心 / 小時
}

/** 根據已通關最高關卡計算每小時產出 */
function getTimerYield(stageId: string): ResourceTimerYield {
  const [ch, st] = stageId.split('-').map(Number)  // "2-5" → ch=2, st=5
  const progress = (ch - 1) * 8 + st               // 線性進度 1~24
  return {
    goldPerHour: 100 + progress * 50,               // 150 ~ 1300
    expItemsPerHour: Math.max(1, Math.floor(progress / 3)),  // 1 ~ 8
  }
}

/** 計算可領取的累積資源 */
function getAccumulatedResources(
  stageId: string,
  lastCollect: string,
  maxHours = 24,           // 最多累積 24 小時（避免無限囤積）
): { gold: number; expItems: number } {
  const elapsed = Date.now() - new Date(lastCollect).getTime()
  const hours = Math.min(maxHours, elapsed / (3600 * 1000))
  const { goldPerHour, expItemsPerHour } = getTimerYield(stageId)
  return {
    gold: Math.floor(goldPerHour * hours),
    expItems: Math.floor(expItemsPerHour * hours),
  }
}
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
