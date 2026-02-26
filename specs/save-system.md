# 存檔系統 Spec

> 版本：v0.1 ｜ 狀態：🟡 草案
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
| `stamina` | number | 體力值 |
| `staminaLastRefill` | string | 上次體力恢復時間（ISO 8601） |
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

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵 |
| `itemId` | string | 道具 ID |
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
| 每日副本 | stamina 扣除 + 掉落物 |
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
  stamina: number
  staminaLastRefill: string
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
  stamina: 120,
  towerFloor: 0,
  storyProgress: { chapter: 1, stage: 1 },
  formation: [null, null, null, null, null, null],
}

// 初始英雄：贈送「無名活屍」（HeroID=6, ★1, 均衡型）
const STARTER_HERO = { heroId: 6, level: 1, exp: 0, ascension: 0 }
```

---

## 體力系統

| 項目 | 值 |
|------|-----|
| 上限 | 120 |
| 恢復速率 | 1 點 / 5 分鐘 |
| 章節關卡消耗 | 8 體力 |
| 爬塔消耗 | 0（免費） |
| 每日副本消耗 | 15 體力 |

```typescript
function getCurrentStamina(stamina: number, lastRefill: string, max = 120): number {
  const elapsed = Date.now() - new Date(lastRefill).getTime()
  const recovered = Math.floor(elapsed / (5 * 60 * 1000))
  return Math.min(max, stamina + recovered)
}
```

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
