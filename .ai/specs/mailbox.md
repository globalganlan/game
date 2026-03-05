# 信箱系統 Spec

> 版本：v1.2 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-02
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

信箱是遊戲中向玩家推送通知與獎勵的核心系統。支援：
- **系統信件**：全服公告、維護補償、活動獎勵
- **個人信件**：成就獎勵、排行結算、客服回覆
- **批量發送**：對所有玩家（`playerId: "*"`）或特定玩家群組發送
- **自動觸發信件**：新用戶註冊時自動寄送歡迎禮包（見 `.ai/specs/auth-system.md` v1.2）

## 依賴

- `.ai/specs/save-system.md` — playerId 驗證、`save_data.diamond` / `save_data.gold`
- `.ai/specs/inventory.md` — 非貨幣道具發放（`addItemsLocally`）
- `.ai/specs/optimistic-queue.md` — `fireOptimisticAsync` + `executeWithIdempotency_`

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/services/mailService.ts` | Service 層 — 8 個匯出函式 + 2 個匯出介面 |
| `src/components/MailboxPanel.tsx` | UI — 信件列表 ↔ 詳情切換、領取/刪除操作 |
| `src/App.tsx` | 整合 — preloadMail + state + MailboxPanel props |
| `gas/程式碼.js` | GAS Handler — 7 個 mail 端點（含 2 個幂等保護） |

---

## 一、資料結構

### 1.1 Google Sheet — `mailbox`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `mailId` | string | 唯一 ID（UUID） |
| `playerId` | string | 收件玩家 ID（`*` = 全服廣播） |
| `title` | string | 信件標題（限 50 字元） |
| `body` | string | 信件內容（限 500 字元） |
| `rewards` | string (JSON) | 獎勵列表 `[{itemId, quantity}]`，空陣列 `[]` = 無獎勵 |
| `claimed` | boolean | 是否已領取獎勵 |
| `read` | boolean | 是否已讀 |
| `createdAt` | string (ISO) | 建立時間 |
| `expiresAt` | string (ISO) | 過期時間（空 = 永不過期） |
| `deletedAt` | string (ISO) | 軟刪除時間（空 = 未刪除） |

### 1.2 TypeScript Types（定義於 `mailService.ts`）

```typescript
export interface MailReward {
  itemId: string
  quantity: number
}

export interface MailItem {
  mailId: string
  title: string
  body: string
  rewards: MailReward[]
  claimed: boolean
  read: boolean
  createdAt: string
  expiresAt: string | null
}
```

---

## 二、Service 層（mailService）

### 8 個匯出函式

| # | 函式 | 說明 | 呼叫方式 |
|---|------|------|----------|
| 1 | `preloadMail(): Promise<{mails, unreadCount}>` | 預載信箱（有快取 + dedup） | API `load-mail` |
| 2 | `invalidateMailCache(): void` | 清除快取，強制下次重拉 | 純前端 |
| 3 | `loadMail(): Promise<{mails, unreadCount}>` | 優先消費 preload 快取（用完即棄），否則 fresh API | API `load-mail` |
| 4 | `readMail(mailId): Promise<{success}>` | 標記已讀 | 直接 callApi（fire-and-forget） |
| 5 | `claimMailReward(mailId): Promise<{success, rewards}>` | 領取單封獎勵 | **Optimistic Queue**（零等待 + opId 幂等） |
| 6 | `claimAllMail(): Promise<{success, claimedCount, totalRewards}>` | 一鍵全部領取 | **Optimistic Queue**（零等待 + opId 幂等） |
| 7 | `deleteMail(mailId): Promise<{success, error?}>` | 軟刪除信件 | Optimistic Queue（await 伺服器，失敗回滾） |
| 8 | `deleteAllRead(): Promise<{success, deletedCount}>` | 清空已領取/已讀信件 | Optimistic Queue（await 伺服器，失敗回滾） |

### 預載機制（preloadMail）

```
認證完成（Phase 1，早於 showGame）
  └─ preloadMail()
       ├─ _preloadedMail 快取命中 → 直接回傳
       ├─ _preloadPromise dedup → 只發一次請求
       └─ 快取未命中 → callApi("load-mail") → 存 _preloadedMail → 回傳
```

- `loadMail()` 優先消費 `_preloadedMail`（用後即清 `null`），否則發新請求
- `invalidateMailCache()` 清空 `_preloadedMail` + `_preloadPromise`
- 呼叫時機：`claimMailReward` / `claimAllMail` 的 `onLocal` callback 中會自動 `invalidateMailCache()`

### 樂觀更新策略

| 操作 | 前端行為 | 伺服器行為 |
|------|---------|-----------|
| **claimMailReward** | 立即回傳 `{ success: true, rewards: [] }`，不等伺服器 | `executeWithIdempotency_` 幂等執行 |
| **claimAllMail** | 立即回傳 `{ success: true, claimedCount: 0, totalRewards: [] }` | `executeWithIdempotency_` 幂等執行 |
| **deleteMail** | 樂觀從 UI 移除 → await 伺服器 → 失敗則回滾（加回列表） | 直接 `setDeletedAt` |
| **deleteAllRead** | 樂觀移除符合條件的信件 → await 伺服器 → 失敗則回滾 | 批量 `setDeletedAt` |

---

## 三、GAS 端點

### 7 個 handler

| action | handler | 幂等 | reconcile-pending | 說明 |
|--------|---------|------|-------------------|------|
| `load-mail` | `handleLoadMail_` | ❌ | ❌ | 過濾 playerId + 未刪除 + 未過期，排序：未讀在前 → createdAt 降序 |
| `read-mail` | `handleReadMail_` | ❌ | ❌ | 設定 `read = true` |
| `claim-mail-reward` | `handleClaimMailReward_` | ✅ opId | ✅ | 驗證→未領取→未過期→發放獎勵→標記 claimed |
| `claim-all-mail` | `handleClaimAllMail_` | ✅ opId | ✅ | 批量領取所有未領取信件 |
| `delete-mail` | `handleDeleteMail_` | ❌ | ❌ | 含未領取獎勵則拒絕（`has_unclaimed_rewards`） |
| `delete-all-read` | `handleDeleteAllRead_` | ❌ | ❌ | 刪除：`(有獎勵+已領取) || (無獎勵+已讀)` |
| `send-mail` | `handleSendMail_` | ❌ | ❌ | 建立新信件（允許內部呼叫，無 adminKey 驗證） |

### 獎勵發放邏輯（grantRewards_）

```javascript
function grantRewards_(playerId, rewards) {
  rewards.forEach(r => {
    if (r.itemId === 'diamond') saveData.diamond += r.quantity
    else if (r.itemId === 'gold') saveData.gold += r.quantity
    else upsertItem_(playerId, r.itemId, r.quantity)  // inventory Sheet
  })
}
```

### GAS 輔助函式

| 函式 | 說明 |
|------|------|
| `getMailSheet_()` | 取 `mailbox` sheet，不存在則自動建立含 headers |
| `getPlayerMails_(sheet, playerId)` | 過濾 + 排序：未讀在前 → createdAt 降序 |
| `grantRewards_(playerId, rewards)` | diamond/gold → save_data，其他 → inventory |
| `executeWithIdempotency_(opId, fn)` | opId 幂等保護（檢查已處理 → 回快取，否則執行 → 記錄） |

---

## 四、MailboxPanel UI

### Props

```typescript
interface MailboxPanelProps {
  onBack: () => void
  onRewardsClaimed?: (rewards: MailReward[]) => void
  mailItems: MailItem[]
  mailLoaded: boolean
  onMailItemsChange: (items: MailItem[]) => void
  onRefreshMail: () => Promise<void>
}
```

### App 傳入

```tsx
<MailboxPanel
  onBack={handleBackToMenu}
  onRewardsClaimed={(rewards) => {
    // diamond/gold → 直接更新 App state
    // 其他 → addItemsLocally() 入帳背包
  }}
  mailItems={mailItems}
  mailLoaded={mailLoaded}
  onMailItemsChange={setMailItems}
  onRefreshMail={refreshMailData}
/>
```

### UI 功能

| 功能 | 說明 |
|------|------|
| 載入中 | `mailLoaded=false` → 顯示「載入中...」spinner |
| 空狀態 | 無信件 → 「📭 目前沒有信件」 |
| 信件列表 | 未讀：黃色圓點 + 粗體；已讀：淡色。右側：未領取 🎁 + 日期 |
| 信件詳情 | 切換顯示（非左右並排）：標題、日期、內文、附件獎勵區 |
| 獎勵標籤 | `diamond` → 💎鑽石、`gold` → 🪙金幣、其他 → itemId |
| 領取單封 | 有獎勵+未領取 → 「🎁 領取獎勵」按鈕（零等待樂觀更新，用已知 rewards 顯示結果） |
| 全部領取 | 頂部「📦 全部領取」按鈕（零等待樂觀匯總） |
| 刪除單封 | 已領取/無獎勵 → 「🗑️ 刪除信件」（樂觀移除 + await 伺服器，失敗回滾） |
| 清空已領取 | 底部「🗑️ 清空已領取」按鈕（樂觀移除 + await，失敗回滾） |
| 已讀標記 | 選取信件時樂觀標記 `read: true`，背景 fire-and-forget `readMail()` |
| 操作訊息 | `actionMsg` toast 顯示操作結果 |

### MainMenu 整合

- `MenuScreen` type 包含 `'mailbox'`
- 主選單顯示 📬 信箱按鈕
- Badge：顯示 `mailUnclaimedCount`（**未領取**數量，非未讀數）

---

## 五、信件清理

| 機制 | 說明 |
|------|------|
| 過期過濾 | `load-mail` 時自動過濾未過期信件（不回傳過期的） |
| 軟刪除 | `delete-mail` 設定 `deletedAt`，不實際移除行 |
| 定期硬刪 | 可透過 GAS Trigger 每日清除 `deletedAt` 超過 30 天的行 |

---

## 六、容量限制

| 項目 | 上限 | 說明 |
|------|------|------|
| 每玩家未刪信件 | 100 封 | 超過上限新信件無法入庫 |
| 信件標題 | 50 字元 | |
| 信件內容 | 500 字元 | |

---

## 七、常見獎勵 itemId 對照

| itemId | 說明 | 寫入目標 |
|--------|------|----------|
| `diamond` | 鑽石 | `save_data.diamond += quantity` |
| `gold` | 金幣 | `save_data.gold += quantity` |
| 其他 | 道具 | GAS: `upsertItem_()` → inventory Sheet；前端: `addItemsLocally()` |

---

## 擴展點

- [ ] **adminKey 驗證**：`send-mail` 加入管理員身份驗證
- [ ] **信件模板**：預設模板（活動獎勵/維護補償/成就）快速建立
- [ ] **定時發信**：GAS Trigger 排程發送（如每日登入獎勵）
- [ ] **附件預覽**：信件列表直接顯示獎勵圖示而非 🎁
- [ ] **多語言支援**：信件標題/內容支援 i18n key

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2025-07-23 | 初版草案：資料結構、7 個 API 端點、前端 Service + UI 設計 |
| v1.0 | 2026-03-01 | 全面同步實作：preloadMail/invalidateMailCache 預載機制、Optimistic Queue（claim 系列零等待 + delete 系列 await 回滾）、executeWithIdempotency_ 幂等保護、reconcile-pending 離線補償、MailboxPanel 6 props 完整文件、UI 列表↔詳情切換模式、onRewardsClaimed App 側即時加算、mailUnclaimedCount badge、send-mail 無 adminKey 現狀標注 |
| v1.2 | 2026-03-02 | **Bug Fix: deletedAt/expiresAt 查詢修復** — Schema 定義 `NOT NULL DEFAULT ''` 但查詢用 `IS NULL` 導致所有信件不可見；修正 4 個查詢條件為 `(deletedAt IS NULL OR deletedAt = '')`；`insertMail` 的 `expiresAt || null` 改為 `expiresAt || ''` 避免 NOT NULL 違規 |
