# 帳號系統 Spec

> 版本：v0.1 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

以 Google Sheets 為後端的輕量帳號系統。
首次進入自動建立訪客帳號（token 存 localStorage），可選擇綁定 email + 密碼以跨裝置登入。

## 依賴

- `specs/tech-architecture.md` — Google Sheets API 基礎設施
- `specs/save-system.md` — 玩家存檔結構

---

## 登入流程

### 1. 訪客自動登入（首次）

```
首次進入遊戲
    ↓
前端生成 guestToken（UUID v4）
    ↓
呼叫 API: POST /register-guest { guestToken }
    ↓
Google Sheet「players」新增一行：
  | playerId | guestToken | email | passwordHash | createdAt | lastLogin |
    ↓
前端 localStorage.setItem('guestToken', token)
    ↓
進入遊戲
```

### 2. 訪客自動登入（回訪）

```
進入遊戲
    ↓
讀取 localStorage.getItem('guestToken')
    ↓
有 token → 呼叫 API: POST /login-guest { guestToken }
    ↓
Sheet 查詢 guestToken → 找到 → 回傳 playerId + 更新 lastLogin
    ↓
進入遊戲，拉取存檔
```

### 3. 綁定帳號密碼

```
訪客進入「設定」→「綁定帳號」
    ↓
輸入 email + 密碼
    ↓
前端驗證格式（email 格式 + 密碼 ≥ 6 字元）
    ↓
呼叫 API: POST /bind-account { guestToken, email, password }
    ↓
Apps Script 端：
  1. 檢查 email 是否已被使用
  2. 密碼做 SHA-256 hash（Apps Script 內建 Utilities.computeDigest）
  3. 更新 Sheet: 寫入 email + passwordHash
    ↓
回傳成功 → 前端 Toast「帳號綁定成功！」
```

### 4. 帳密登入（換裝置）

```
進入遊戲
    ↓
localStorage 無 token → 顯示登入畫面
    ↓
使用者輸入 email + 密碼
    ↓
呼叫 API: POST /login { email, password }
    ↓
Apps Script 端：
  1. 查 Sheet 中 email 對應行
  2. SHA-256(password) 比對 passwordHash
  3. 匹配 → 回傳 playerId + guestToken
    ↓
前端 localStorage.setItem('guestToken', token)
    ↓
進入遊戲，拉取存檔
```

---

## Google Sheet「players」結構

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 自動遞增 `P0001`, `P0002`... |
| `guestToken` | string | UUID v4，訪客登入用 |
| `email` | string \| null | 綁定後才有 |
| `passwordHash` | string \| null | SHA-256 hex，綁定後才有 |
| `displayName` | string | 預設「訪客#XXXX」，可改名 |
| `createdAt` | string | ISO 8601 |
| `lastLogin` | string | ISO 8601 |
| `isBound` | boolean | 是否已綁定帳密 |

---

## API 端點（Apps Script Web App）

| 端點 | 方法 | 參數 | 回傳 |
|------|------|------|------|
| `/register-guest` | POST | `{ guestToken }` | `{ playerId, displayName }` |
| `/login-guest` | POST | `{ guestToken }` | `{ playerId, displayName, isBound }` |
| `/bind-account` | POST | `{ guestToken, email, password }` | `{ success, message }` |
| `/login` | POST | `{ email, password }` | `{ playerId, guestToken, displayName }` |
| `/change-password` | POST | `{ guestToken, oldPassword, newPassword }` | `{ success }` |
| `/change-name` | POST | `{ guestToken, newName }` | `{ success }` |

---

## 安全考量

| 項目 | 做法 |
|------|------|
| 密碼儲存 | SHA-256 hash，**不存明文** |
| Token 外洩 | Token 只存 localStorage，不送到 URL query |
| API 保護 | Apps Script Web App 設為「僅限自己」執行，用 API Key 或 token 驗證 |
| 暴力破解 | Apps Script 有自然的速率限制（~30 req/s），可在 script 端加計數器 |
| Email 重複 | 綁定前先檢查 email 唯一性 |

### ⚠️ 已知限制

- SHA-256 **不是** 專業的密碼 hash（應用 bcrypt/scrypt），但 Apps Script 環境不支援，SHA-256 是可用的最佳選項
- Google Sheets 無行鎖定，高併發寫入可能衝突（單人遊戲問題不大）
- localStorage 清除 = 訪客帳號遺失（所以要提示綁定）

---

## 前端狀態

```typescript
interface AuthState {
  isLoggedIn: boolean
  playerId: string | null
  displayName: string
  isBound: boolean          // 是否已綁定帳密
  guestToken: string | null
}

// localStorage keys
const STORAGE_KEY_TOKEN = 'globalganlan_guest_token'
```

---

## UI 流程

```
                    ┌─ 有 token ─→ 自動登入 ─→ 進入遊戲
進入遊戲 → 檢查     │
localStorage        │                     ┌─ 訪客登入 → 自動建帳 → 進入遊戲
                    └─ 無 token ─→ 登入畫面 ┤
                                          └─ 帳密登入 → 驗證 → 進入遊戲

遊戲內「設定」：
  ├── 綁定帳號（僅訪客顯示）
  ├── 修改密碼（僅已綁定顯示）
  └── 修改暱稱
```

### 未綁定提示

- 首次進入後 Toast：「建議綁定帳號以避免遺失進度」
- 每次登入若未綁定，設定按鈕顯示紅點提示

---

## 擴展點

- [ ] **Google 一鍵登入**：OAuth2，Apps Script 原生支援
- [ ] **Line 登入**：需 Line Login SDK + redirect
- [ ] **雙因素驗證**：Email OTP
- [ ] **帳號刪除**：GDPR 合規

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版：訪客 token + 綁定帳密流程 |
