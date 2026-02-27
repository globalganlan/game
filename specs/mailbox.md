# 信箱系統 — Mailbox System

> **版本**：v0.1（草案）
> **最後更新**：2025-07-23
> **依賴**：`save-system.md`（playerId 驗證）、`inventory.md`（道具發放）
> **輸出**：信件 CRUD + 獎勵領取 API

---

## 1. 系統概述

信箱是遊戲中用來向玩家推送通知與獎勵的核心系統。支援：
- **系統信件**：全服公告、維護補償、活動獎勵
- **個人信件**：成就獎勵、排行結算、客服回覆
- **批量發送**：對所有玩家或特定玩家群組發送

## 2. 資料結構

### 2.1 Google Sheet — `mailbox`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `mailId` | string | 唯一ID（UUID） |
| `playerId` | string | 收件玩家 ID（`*` = 全服廣播） |
| `title` | string | 信件標題（限 50 字元） |
| `body` | string | 信件內容（限 500 字元） |
| `rewards` | string (JSON) | 獎勵列表 `[{itemId, quantity}]`，空陣列 `[]` = 無獎勵 |
| `claimed` | boolean | 是否已領取獎勵 |
| `read` | boolean | 是否已讀 |
| `createdAt` | string (ISO) | 建立時間 |
| `expiresAt` | string (ISO) | 過期時間（空 = 永不過期） |
| `deletedAt` | string (ISO) | 軟刪除時間（空 = 未刪除） |

### 2.2 TypeScript Types

```typescript
interface MailReward {
  itemId: string
  quantity: number
}

interface MailItem {
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

## 3. API 端點

### 3.1 load-mail（POST）

載入玩家所有未刪除、未過期的信件。

```json
{
  "action": "load-mail",
  "guestToken": "..."
}
```

**回傳**：
```json
{
  "success": true,
  "mails": [
    {
      "mailId": "uuid",
      "title": "維護補償",
      "body": "感謝您的耐心等候...",
      "rewards": [{"itemId": "diamond", "quantity": 100}],
      "claimed": false,
      "read": false,
      "createdAt": "2025-07-23T00:00:00Z",
      "expiresAt": "2025-08-23T00:00:00Z"
    }
  ],
  "unreadCount": 3
}
```

**邏輯**：
1. 用 `guestToken` 查出 `playerId`
2. 過濾 `mailbox` Sheet：`playerId` 匹配（或 `*`）+ `deletedAt` 為空 + 未過期
3. 回傳排序：未讀在前，按 `createdAt` 降序

### 3.2 read-mail（POST）

標記信件為已讀。

```json
{
  "action": "read-mail",
  "guestToken": "...",
  "mailId": "uuid"
}
```

**回傳**：`{ "success": true }`

### 3.3 claim-mail-reward（POST）

領取信件內的獎勵。

```json
{
  "action": "claim-mail-reward",
  "guestToken": "...",
  "mailId": "uuid"
}
```

**回傳**：
```json
{
  "success": true,
  "rewards": [{"itemId": "diamond", "quantity": 100}]
}
```

**邏輯**：
1. 驗證信件屬於該玩家
2. 檢查是否已領取（`claimed === true` → 回傳 `already_claimed` 錯誤）
3. 檢查是否過期
4. 寫入獎勵到玩家背包/資源（鑽石→`save_data.diamond`，物品→`inventory`）
5. 標記 `claimed = true`

### 3.4 claim-all-mail（POST）

一鍵領取所有未領取的信件獎勵。

```json
{
  "action": "claim-all-mail",
  "guestToken": "..."
}
```

**回傳**：
```json
{
  "success": true,
  "claimedCount": 5,
  "totalRewards": [{"itemId": "diamond", "quantity": 500}, {"itemId": "gold", "quantity": 10000}]
}
```

### 3.5 delete-mail（POST）

軟刪除信件（設定 `deletedAt`）。

```json
{
  "action": "delete-mail",
  "guestToken": "...",
  "mailId": "uuid"
}
```

**回傳**：`{ "success": true }`

**限制**：含未領取獎勵的信件不可刪除（回傳 `has_unclaimed_rewards` 錯誤）。

### 3.6 delete-all-read（POST）

刪除所有已讀且已領取（或無獎勵）的信件。

```json
{
  "action": "delete-all-read",
  "guestToken": "..."
}
```

**回傳**：`{ "success": true, "deletedCount": 8 }`

### 3.7 send-mail（POST，管理用）

發送信件（供管理後台或活動系統使用）。

```json
{
  "action": "send-mail",
  "adminKey": "...",
  "targetPlayerIds": ["*"],
  "title": "維護補償",
  "body": "...",
  "rewards": [{"itemId": "diamond", "quantity": 100}],
  "expiresAt": "2025-08-23T00:00:00Z"
}
```

**保護**：需 `adminKey` 驗證（防止一般玩家呼叫）。

## 4. 前端架構

### 4.1 Service — `mailService.ts`

```typescript
loadMail(): Promise<{ mails: MailItem[]; unreadCount: number }>
readMail(mailId: string): Promise<{ success: boolean }>
claimMailReward(mailId: string): Promise<{ success: boolean; rewards: MailReward[] }>
claimAllMail(): Promise<{ success: boolean; claimedCount: number; totalRewards: MailReward[] }>
deleteMail(mailId: string): Promise<{ success: boolean }>
deleteAllRead(): Promise<{ success: boolean; deletedCount: number }>
```

### 4.2 UI — `MailboxPanel.tsx`

| 元素 | 說明 |
|------|------|
| 信件列表 | 左側：未讀粗體 + 黃點指示器，已讀灰色；顯示標題 + 日期 |
| 信件詳情 | 右側（mobile 全屏）：標題、內容、附件獎勵區 |
| 領取按鈕 | 有獎勵 + 未領取 → 顯示橘色「領取」按鈕 |
| 一鍵領取 | 頂部右側「📦 全部領取」按鈕 |
| 刪除按鈕 | 已領取/無獎勵的信件顯示灰色「刪除」按鈕 |
| 清空已讀 | 底部「🗑️ 清空已讀」按鈕 |
| 空狀態 | 無信件時顯示「📭 目前沒有信件」 |

### 4.3 Menu 整合

- 在 `MainMenu` 新增 `mailbox` 項目（📬 信箱）
- `MenuScreen` type 新增 `'mailbox'`
- 未讀數 > 0 時在主選單圖示上顯示紅色小圓點

## 5. 信件清理

- 過期信件在 `load-mail` 時自動過濾（不回傳給前端）
- 定期清理：可透過 GAS Trigger（每日凌晨）硬刪除 `deletedAt` 超過 30 天的行

## 6. 容量限制

- 每個玩家最多 100 封未刪除信件
- 超過上限時新信件無法入庫，需先清理

## 7. 常見獎勵 itemId 對照

| itemId | 說明 | 寫入目標 |
|--------|------|----------|
| `diamond` | 鑽石 | `save_data.diamond += quantity` |
| `gold` | 金幣 | `save_data.gold += quantity` |
| 其他 | 道具 | `inventory` 背包系統 `add-items` |
