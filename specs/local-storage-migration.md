# LocalStorage Schema Migration Spec

> 版本：v1.0 ｜ 狀態：🟢 已實作
> 最後更新：2026-02-27
> 負責角色：🔧 CODING

## 概述

前端透過 localStorage 儲存 7 組資料（guest token、存檔快取、樂觀佇列、抽卡池、保底狀態、擁有英雄、待同步抽卡）。當功能迭代導致資料結構變更時，舊用戶的 localStorage 與新程式碼不匹配，會引發 runtime 錯誤（例如 `Cannot create property on string`、`undefined-undefined` 顯示異常）。

本 spec 定義一套 **版本化 + 自動遷移** 機制，確保任何 localStorage schema 變更都能平滑處理。

## 依賴

| Spec | 說明 |
|------|------|
| `save-system.md` | SaveData / PlayerData 結構 |
| `gacha.md` | PoolEntry / PityState 結構 |
| `optimistic-queue.md` | PendingOp 結構 |
| `auth-system.md` | guest token 格式 |

## §1 設計原則

1. **應用啟動時一次性檢查**：在 React 渲染前（`main.tsx`）同步執行 migration
2. **版本單調遞增**：`CURRENT_SCHEMA_VERSION` 為正整數，每次 breaking change +1
3. **遷移函式鏈**：`migrate_N_to_N+1()` 逐版跑完，不跳版
4. **安全降級**：遷移失敗 → 清除所有 localStorage（使用者重新登入即可從伺服器重載）
5. **不遷移 guest token**：token 是純 UUID 字串，不受結構變更影響

## §2 localStorage Key 清單

| Key | 型別 | 來源 | 備註 |
|-----|------|------|------|
| `globalganlan_schema_version` | `number` | migration | **新增**：儲存當前 schema 版本 |
| `globalganlan_guest_token` | `string` | authService | UUID，結構永不變，不參與遷移 |
| `globalganlan_save_cache` | `PlayerData` | saveService | 本地存檔快取 |
| `globalganlan_pending_ops` | `PendingOp[]` | optimisticQueue | 待同步操作佇列 |
| `globalganlan_gacha_pool` | `PoolEntry[]` | gachaLocalPool | 預載抽卡池 |
| `globalganlan_gacha_pity` | `PityState` | gachaLocalPool | 保底計數器 |
| `globalganlan_owned_heroes` | `number[]` | gachaLocalPool | 已擁有英雄 ID |
| `globalganlan_pending_pulls` | `PendingPull[]` | gachaLocalPool | 待同步抽卡操作 |

## §3 Schema Version 定義

### Version 1（基線 — 2026-02-27）

```typescript
// globalganlan_save_cache
interface PlayerData_V1 {
  save: {
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
    formation: (string | null)[]  // 6 slots
    lastSaved: string
    gachaPity?: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
  }
  heroes: HeroInstance[]
  inventory: InventoryItem[]
  isDirty: boolean
}

// globalganlan_gacha_pity
interface PityState_V1 {
  pullsSinceLastSSR: number
  guaranteedFeatured: boolean
}

// globalganlan_gacha_pool
interface PoolEntry_V1 {
  h: number    // heroId
  r: string    // rarity: 'N' | 'R' | 'SR' | 'SSR'
  f: boolean   // isFeatured
}

// globalganlan_pending_ops
interface PendingOp_V1 {
  opId: string
  action: string
  params: Record<string, unknown>
  createdAt: string
  optimisticResult?: Record<string, unknown>
}

// globalganlan_pending_pulls
interface PendingPull_V1 {
  opId: string
  count: 1 | 10
  bannerId: string
  consumedEntries: PoolEntry_V1[]
  timestamp: string
}
```

### Version 0（隱含 — 無版本標記的舊資料）

- 沒有 `globalganlan_schema_version` key
- `storyProgress` / `formation` / `gachaPity` 可能是 JSON 字串而非物件
- 需要 migration 0→1 做 defensive parse

## §4 Migration 執行流程

```
App Boot (main.tsx, 同步)
        ↓
runMigrations()
        ↓
讀取 localStorage['globalganlan_schema_version']
        ↓ (null → storedVersion = 0)
        ↓
storedVersion < CURRENT_SCHEMA_VERSION ?
        ├── YES → 逐版執行 migrate_N_to_N+1()
        │         成功 → 寫入新 version
        │         失敗 → nukeMigratableKeys() 清除 + 寫入新 version
        └── NO → 什麼都不做
```

### §4.1 `nukeMigratableKeys()`

清除所有可遷移的 key（排除 `guest_token` 和 `schema_version`）：

```typescript
const MIGRATABLE_KEYS = [
  'globalganlan_save_cache',
  'globalganlan_pending_ops',
  'globalganlan_gacha_pool',
  'globalganlan_gacha_pity',
  'globalganlan_owned_heroes',
  'globalganlan_pending_pulls',
]
```

清除後使用者下次登入會從伺服器重新載入所有資料。

### §4.2 Migration 函式規範

```typescript
type MigrationFn = () => void  // 同步、可拋例外

const MIGRATIONS: Record<number, MigrationFn> = {
  // key = fromVersion, value = function to migrate to fromVersion+1
  0: migrate_0_to_1,
  // 未來：1: migrate_1_to_2, ...
}
```

每個 migration 函式：
1. 讀取受影響的 localStorage key
2. 轉換結構
3. 寫回
4. 不可有 async 操作（blocking boot path）

## §5 新增 Breaking Change 的 SOP

當任何 localStorage 結構需要變更時：

1. **bump `CURRENT_SCHEMA_VERSION`**（+1）
2. **在 spec §3 新增 Version N 章節**，記錄新結構
3. **撰寫 `migrate_(N-1)_to_N()` 函式**
4. **測試**：手動在 DevTools 設 `globalganlan_schema_version = N-1`、塞舊結構資料、重新整理頁面，確認遷移正確
5. **更新 changelog**

## §6 效能考量

- 遷移在 `main.tsx` 同步執行，阻塞首次渲染
- 正常情況遷移函式只做 JSON.parse → transform → JSON.stringify，<5ms
- 最壞情況 `nukeMigratableKeys()` 清除 6 個 key，<1ms
- guest token 不受影響，使用者不需重新登入

## §7 實作對照

| 檔案 | 說明 |
|------|------|
| `src/services/localStorageMigration.ts` | 遷移引擎 + 所有 migration 函式 |
| `src/main.tsx` | 在 `createRoot()` 前呼叫 `runMigrations()` |

## §8 變更歷史

| 版本 | 日期 | 說明 |
|------|------|------|
| v1.0 | 2026-02-27 | 初版：定義版本化機制 + migration 0→1（defensive parse） |
