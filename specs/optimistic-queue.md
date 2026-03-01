# 樂觀更新佇列 (Optimistic Update Queue) Spec

> 版本：v1.1 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 負責角色：🔧 CODING

## 概述

本系統為所有需要修改 Google Sheets 的 API 操作提供 **零等待** 的使用者體驗。核心概念：

1. **即時**：UI 操作後立刻更新本地 state — 使用者看到結果無延遲
2. **背景同步**：非同步呼叫 GAS API，成功後移除備份
3. **斷線保護**：操作寫入 localStorage 備份，API 失敗時保留
4. **登入補償**：下次登入時批次補償未完成操作
5. **冪等保護**：每筆操作帶唯一 `opId`，伺服器保證同一 `opId` 只處理一次

## 依賴

| 依賴項 | 說明 |
|--------|------|
| `specs/auth-system.md` | 需要 `guestToken` 識別玩家 |
| `specs/save-system.md` | `loadSave()` 完成後觸發 reconcile |
| GAS `op_log` sheet | 伺服器端冪等紀錄表 |

## 架構總覽

```
使用者操作
    ↓
┌──────────────────────────────┐
│  前端 optimisticQueue.ts     │
│  1. generateOpId()           │
│  2. onLocal() — 本地更新     │
│  3. localStorage 備份        │
│  4. callApi() with opId      │
│     ├── success → 移除備份   │
│     └── fail → 保留備份      │
└──────────────────────────────┘
    ↓ (背景)
┌──────────────────────────────┐
│  GAS 程式碼.js               │
│  executeWithIdempotency_()   │
│  1. 檢查 op_log 有無 opId   │
│     ├── 有 → 回傳快取結果   │
│     └── 無 → 執行 handler   │
│           → 記錄到 op_log   │
└──────────────────────────────┘
```

## 詳細規格

### 1. opId（冪等鍵）

- 格式：`op_{timestamp}_{random6}_{counter}`
- 範例：`op_1740652800000_a3f7x2_1`
- 前端用 `generateOpId()` 產生，隨 API 請求送出
- 全域唯一，24 小時後自動過期

### 2. 前端流程（optimisticQueue.ts）

#### `fireOptimistic(action, params, onLocal?, onServerResult?)`

> 不阻塞版本，適用於不需等待伺服器結果的操作。

| 步驟 | 動作 | 時間 |
|------|------|------|
| 1 | 產生 `opId` | 同步 |
| 2 | 呼叫 `onLocal()` — 更新本地 state | 同步，~0ms |
| 3 | 寫入 localStorage 備份 | 同步，~1ms |
| 4 | 背景 `callApi(action, {...params, opId})` | 非同步 |
| 5a | 成功 → `removePendingOp(opId)` | 非同步 |
| 5b | 失敗 → 保留備份，下次登入 reconcile | 非同步 |

#### `fireOptimisticAsync(action, params, onLocal?)`

> 回傳 `{ opId, serverResult: Promise }` — 本地更新仍是同步的，但呼叫者可選擇 await 伺服器結果。

#### `reconcilePendingOps()`

> 登入後自動呼叫，處理 localStorage 殘留的未完成操作。

1. 讀取 `localStorage` 的 pending ops（過濾 24 小時過期的）
2. 批次送到 GAS `reconcile-pending` endpoint
3. 伺服器逐筆檢查：
   - `already_processed` → 直接移除備份
   - `executed` → 執行成功，移除備份
   - `error` → 記錄錯誤，保留備份

### 3. 伺服器端冪等機制（GAS）

#### `op_log` Sheet 結構

| 欄位 | 類型 | 說明 |
|------|------|------|
| `opId` | string | 唯一操作 ID |
| `playerId` | string | 玩家 ID |
| `action` | string | API action 名稱 |
| `result` | JSON string | 操作結果快取 |
| `createdAt` | ISO string | 紀錄時間 |

#### `executeWithIdempotency_(opId, playerId, action, handler)`

```javascript
function executeWithIdempotency_(opId, playerId, action, handler) {
  if (opId) {
    var cached = checkOpProcessed_(opId);  // 查 op_log
    if (cached) return cached;              // 重複 → 回傳快取
  }
  var result = handler();                   // 首次 → 執行
  if (opId && result && result.success) {
    recordOpProcessed_(opId, playerId, action, result);  // 記錄
  }
  return result;
}
```

#### `handleReconcilePending_(params)`

- 接受 `{ ops: [{ opId, action, params }] }` 批次請求
- 逐筆：檢查 op_log → 已處理回傳快取 / 未處理則執行
- 支援的 action（19 種）：`collect-resources`、`claim-mail-reward`、`claim-all-mail`、`gacha-pull`、`complete-battle`、`complete-stage`、`complete-tower`、`complete-daily`、`upgrade-hero`、`ascend-hero`、`star-up-hero`、`use-item`、`enhance-equipment`、`dismantle-equipment`、`expand-inventory`、`shop-buy`、`equip-item`、`unequip-item`、`lock-equipment`

### 4. localStorage 備份格式

```typescript
// key: 'globalganlan_pending_ops'
interface PendingOp {
  opId: string                           // 唯一操作 ID
  action: string                         // API action 名稱
  params: Record<string, unknown>        // API 參數
  createdAt: string                      // ISO 時間戳
  optimisticResult?: Record<string, unknown>  // 本地預測結果
}
// value: PendingOp[]（JSON 陣列）
```

## 已套用此機制的操作

| 操作 | API Action | 前端服務 | 樂觀策略 |
|------|-----------|---------|----------|
| **saveService**（2 項） | | | |
| 儲存陣容 | `save-formation` | `saveService.saveFormation()` | 本地 localStorage + 背景 API |
| 領取計時器資源 | `collect-resources` | `saveService.collectResources()` | 本地公式計算金幣/經驗 → 伺服器校正 |
| **gachaLocalPool**（1 項） | | | |
| 抽卡（本地池） | `gacha-pull` | `gachaLocalPool.localPull()` | 預生成池 0ms 本地消耗 → 背景通知伺服器 |
| **mailService**（4 項） | | | |
| 領取單封信件 | `claim-mail-reward` | `mailService.claimMailReward()` | 已知 rewards 立即顯示 → 標記 claimed |
| 一鍵領取信件 | `claim-all-mail` | `mailService.claimAllMail()` | 本地匯總所有 unclaimed rewards |
| 刪除信件 | `delete-mail` | `mailService.deleteMail()` | 背景同步 + localStorage 備份 |
| 刪除所有已讀 | `delete-all-read` | `mailService.deleteAllRead()` | 背景同步 + localStorage 備份 |
| **inventoryService**（5 項） | | | |
| 裝備穿戴 | `equip-item` | `inventoryService.equipItem()` | 本地更新 equippedBy → 背景同步 |
| 卸下裝備 | `unequip-item` | `inventoryService.unequipItem()` | 本地清空 equippedBy → 背景同步 |
| 使用道具 | `use-item` | `inventoryService.useItem()` | 本地扣減數量 → 背景同步 |
| 鎖定裝備 | `lock-equipment` | `inventoryService.lockEquipment()` | 本地更新 locked → 背景同步 |
| 擴容背包 | `expand-inventory` | `inventoryService.expandInventory()` | 本地 +50 容量 → 背景扣鑽同步 |
| **progressionService**（9 項） | | | |
| 英雄升級 | `upgrade-hero` | `progressionService.upgradeHero()` | 帶 opId，await 伺服器結果 |
| 英雄突破 | `ascend-hero` | `progressionService.ascendHero()` | 帶 opId，await 伺服器結果 |
| 英雄升星 | `star-up-hero` | `progressionService.starUpHero()` | 帶 opId，await 伺服器結果 |
| 裝備強化 | `enhance-equipment` | `progressionService.enhanceEquipment()` | 帶 opId，await 伺服器結果 |
| 裝備拆解 | `dismantle-equipment` | `progressionService.dismantleEquipment()` | 帶 opId，await 伺服器結果 |
| 裝備鍛造 | `forge-equipment` | `progressionService.forgeEquipment()` | 帶 opId，await 伺服器結果 |
| 戰鬥結算 | `complete-battle` | `progressionService.completeBattle()` | 帶 opId + seed 反作弊校驗 |
| 通關結算（主線） | `complete-stage` | `progressionService.completeStage()` | 帶 opId 防重複提交（legacy） |
| 通關結算（爬塔） | `complete-tower` | `progressionService.completeTower()` | 帶 opId 防重複提交（legacy） |
| 副本結算 | `complete-daily` | `progressionService.completeDaily()` | 帶 opId 防重複提交（legacy） |
| **ShopPanel**（1 項） | | | |
| 商店購買 | `shop-buy` | `ShopPanel.tsx` (直接呼叫) | 本地扣幣+入帳道具 → 背景同步 |

## 套用新操作的步驟指南

> 當新功能需要修改 Google Sheets 時，按以下步驟套用此機制：

### Step 1：GAS 端 — 包裝 handler

```javascript
// 在 handler 內部用 executeWithIdempotency_ 包裝
function handleMyAction_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  return executeWithIdempotency_(params.opId, playerId, 'my-action', function() {
    // === 原本的業務邏輯 ===
    // ... 讀寫 Sheet ...
    return { success: true, /* 結果欄位 */ };
  }); // end executeWithIdempotency_
}
```

### Step 2：GAS 端 — 註冊到 reconcile

在 `handleReconcilePending_()` 的 switch-case 加入新的 action：

```javascript
case 'my-action':
  opResult = handleMyAction_(fullParams);
  break;
```

### Step 3：前端 — 選擇適當的呼叫模式

**模式 A：完全不等待（零延遲）**
> 適用於結果可本地預測的操作（如領取資源、領信件、消耗道具）

```typescript
import { fireOptimistic } from './optimisticQueue'

export function myAction(params: MyParams): MyResult {
  // 本地計算預測結果
  const localResult = computeLocally(params)

  fireOptimistic('my-action', params,
    () => { /* 立即更新 local state */ },
    (serverResult) => { /* 伺服器回傳後校正（可選） */ },
  )

  return localResult  // 同步回傳，0ms
}
```

**模式 B：本地更新 + 可 await 伺服器結果**
> 適用於結果部分可預測、但可能需要伺服器資料的操作

```typescript
import { fireOptimisticAsync } from './optimisticQueue'

export async function myAction(params: MyParams) {
  const { opId, serverResult } = fireOptimisticAsync('my-action', params,
    () => { /* 立即更新 local state（可選） */ },
  )
  // 可選擇 await 或忽略
  serverResult.catch(() => { /* localStorage 會保留備份 */ })
  return { success: true }
}
```

**模式 C：僅帶 opId 保護（不做樂觀更新）**
> 適用於結果無法本地預測、但需防重複提交的操作（如抽卡、合成）

```typescript
import { generateOpId } from './optimisticQueue'

export async function myAction(params: MyParams) {
  const opId = generateOpId()
  const res = await callApi('my-action', { ...params, opId })
  return res
}
```

### Step 4：更新本文件

在「已套用此機制的操作」表格新增一行。

### Step 5：部署 & 測試

```powershell
# TypeScript 檢查
npx tsc --noEmit

# Vite 建置
npx vite build

# 部署 GAS
Push-Location d:\GlobalGanLan\gas
npx @google/clasp push
npx @google/clasp deploy -i "AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg" --description "描述"
npx @google/clasp deploy -i "AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw" --description "描述"
Pop-Location

# API 測試（帶 opId）
$body = '{"action":"my-action","guestToken":"TOKEN","opId":"test_001","param1":"value"}'
Invoke-RestMethod -Uri $url -Method Post -ContentType "text/plain; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

# 冪等測試：同一 opId 再送一次 → 應回傳相同結果
```

## 實作對照

| 原始碼 | 角色 | 說明 |
|--------|------|------|
| `src/services/optimisticQueue.ts` | 前端佇列核心 | `fireOptimistic` / `fireOptimisticAsync` / `reconcilePendingOps` |
| `src/services/saveService.ts` | 陣容/資源 | `saveFormation()` — 模式 A ｜ `collectResources()` — 模式 A |
| `src/services/gachaLocalPool.ts` | 抽卡 | `localPull()` → `fireOptimistic('gacha-pull')` — 模式 A |
| `src/services/mailService.ts` | 信件 | `claimMailReward()` / `claimAllMail()` / `deleteMail()` / `deleteAllRead()` — 模式 B |
| `src/services/inventoryService.ts` | 裝備/道具 | `equipItem()` / `unequipItem()` / `useItem()` / `lockEquipment()` / `expandInventory()` — 模式 B |
| `src/services/progressionService.ts` | 養成/戰鬥 | `upgradeHero()` / `enhanceEquipment()` / `completeBattle()` 等 9 操作 — 模式 B |
| `src/components/ShopPanel.tsx` | 商店 | `fireOptimisticAsync('shop-buy')` — 模式 B |
| `gas/程式碼.js` | 伺服器冪等 | `executeWithIdempotency_()` + `op_log` sheet + `handleReconcilePending_()`（19 種 action） |

## 邊界條件 & 注意事項

1. **op_log 清理**：目前無自動清理機制，長期運行需定期清除過期紀錄（建議每週一次 > 7 天的）
2. **localStorage 容量**：pending ops 佔用空間極小（~200 bytes/op），不會溢出
3. **並行操作**：`_inflightOps` Set 防止同一 opId 重複發送
4. **24 小時過期**：超過 24 小時未 reconcile 的操作會被自動丟棄
5. **伺服器回傳校正**：樂觀更新若與伺服器結果不同，應在 `onServerResult` 中修正本地 state
6. **不可逆操作**：對於重要操作（如消耗鑽石），樂觀更新應保守估計

## 變更歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| v1.0 | 2026-02-27 | 初版 — 含前端佇列 + GAS 冪等 + reconcile + 7 個已套用操作 |
| v1.1 | 2026-03-01 | **Spec 同步**：reconcile 支援 action 7→19（新增 complete-battle / upgrade-hero / ascend-hero / star-up-hero / use-item / enhance-equipment / dismantle-equipment / expand-inventory / shop-buy / equip-item / unequip-item / lock-equipment）；已套用操作表擴充至 22 項（含 saveService / gachaLocalPool / mailService / inventoryService / progressionService / ShopPanel）；實作對照表新增 inventoryService / gachaLocalPool / ShopPanel |
