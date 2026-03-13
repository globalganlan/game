# 帳號系統 Spec

> 版本：v1.6 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-15
> 最後更新：2026-03-01
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

以 Google Sheets 為後端的輕量帳號系統。
首次進入自動建立訪客帳號（token 存 localStorage），可選擇綁定 email + 密碼以跨裝置登入。

## 依賴

- `.ai/specs/tech-architecture.md` — Google Sheets API 基礎設施
- `.ai/specs/save-system.md` — 玩家存檔結構

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/hooks/useAuth.ts` | React Hook — 封裝 authService，提供 `doAutoLogin / doLogin / doBind / doChangeName / doLogout` |
| `src/services/authService.ts` | 核心服務 — `autoLogin / registerGuest / loginWithEmail / bindAccount / changeName / changePassword / logout / getAuthState / onAuthChange` |
| `src/components/LoginScreen.tsx` | 登入畫面 — 自動登入 + 帳密登入 + 離線模式 |
| `src/components/SettingsPanel.tsx` | 設定面板 — 綁定帳號 / 修改暱稱 / 修改密碼 / 登出 |
| `gas/程式碼.js` | GAS 後端 Handler — `handleRegisterGuest_  / handleLoginGuest_ / handleLogin_ / handleBindAccount_ / handleChangeName_ / handleChangePassword_` |

### v1.2 新增：新用戶歡迎禮包

`register-guest` 在建立新玩家後（`alreadyExists: false`），自動寄送歡迎信件：

| 獎勵 | 數量 |
|------|------|
| 💎 鑽石 | 300 |
| 🪙 金幣 | 10,000 |
| 🟢 經驗 (EXP) | 6,500 |
| 🎟️ 英雄召喚券 | 10 |
| 🔧 裝備召喚券 | 10 |

- 信件標題：`🎉 歡迎來到全球感染！`
- 永不過期，玩家開信箱即可領取
- 錯誤以 try-catch 包裝，不影響註冊成功

### v1.3 新增：帳號綁定獎勵

`handleBindAccount_` 在首次綁定成功時（`wasBound === false → isBound = true`），自動呼叫 `handleSendMail_` 寄送綁定獎勵信件：

| 獎勵 | 數量 |
|------|------|
| 💎 鑽石 | 200 |
| 🪙 金幣 | 5,000 |

- 信件標題：`🔗 帳號綁定獎勵`
- 僅首次綁定觸發（檢查 `wasBound` 狀態）
- 每帳號一次，二次綁定（改 email）不重複發送
- 前端在 SettingsPanel 綁定區塊顯示獎勵預覽

---

## 登入流程

### 1. 自動登入（mount 時）

```
LoginScreen useEffect → doAutoLogin()
    ↓
authService.autoLogin():
  ├── localStorage 有 globalganlan_logged_out === '1'?
  │   └── ✅ → 直接回傳 isLoggedIn = false（不嘗試登入）
  ├── localStorage 有 guestToken?
  │   ├── ✅ → POST login-guest { guestToken }
  │   │       ├── 成功 → AuthState.isLoggedIn = true
  │   │       └── 失敗 → isLoggedIn = false（不自動註冊）
  │   └── ❌ → isLoggedIn = false（不自動註冊）
    ↓
isLoggedIn === true → setTimeout(onEnterGame, 600) 自動進場
isLoggedIn === false → 顯示登入畫面（訪客模式進入 / 離線體驗 / 帳號登入）
```

> **冪等保護**：`register-guest` 若 token 已存在 Sheet，直接回傳 `alreadyExists: true` 而非報錯。

### 2. 自動登入失敗 UI（mode='auto'）

| 按鈕 | 動作 |
|------|------|
| 「訪客模式進入」 | 呼叫 `doRegisterGuest()`（`registerGuest()` — 優先複用本地 token，無則生成新 UUID） |
| 「離線體驗」 | 直接 `onEnterGame()`（無伺服器存檔） |
| 「帳號登入」 | 切換至 `mode='login'` 帳密登入表單 |

### 3. 帳密登入（mode='login'）

```
輸入 email + password → handleEmailLogin()
    ↓
驗證：email.trim() && password.trim() 不為空（依賴 <input type="email"> 瀏覽器原生格式驗證）
    ↓
authService.loginWithEmail(email, password)
  → POST login { email, password }
  → 成功 → 儲存回傳的 guestToken 到 localStorage → onEnterGame()
  → 失敗 → 顯示 error
```

### 4. 綁定帳號（SettingsPanel，僅未綁定時）

```
輸入 email + password + confirmPassword
    ↓
前端驗證：
  - email.includes('@')，否則「Email 格式不正確」
  - password.length >= 6，否則「密碼至少 6 個字元」
  - password === confirmPw，否則「兩次密碼不一致」
    ↓
authService.bindAccount(email, password)
  → POST bind-account { guestToken, email, password }
  → GAS: email 正規化(trim + toLowerCase) → 檢查唯一性 → sha256(password) → 寫 Sheet
    ↓
成功 → Toast「帳號綁定成功！」→ isBound = true
失敗 → 錯誤碼映射：email_taken / not_logged_in / invalid_token
```

### 5. 修改暱稱（SettingsPanel）

| 項目 | 規則 |
|------|------|
| 前端驗證 | `1-16 字元`（maxLength=16，trim 後長度 ≥ 1） |
| GAS 驗證 | `1-20 字元`（前端更嚴格，以前端為準） |
| API | POST `change-name { guestToken, newName }` |

### 6. 修改密碼（SettingsPanel，僅已綁定時）

| 項目 | 規則 |
|------|------|
| 目前密碼 | 必填 |
| 新密碼 | ≥ 6 字元 |
| 確認密碼 | === 新密碼 |
| GAS 錯誤碼 | `wrong_password` / `account_not_bound` |

### 7. 登出

`authService.logout()` → 設定 `localStorage.globalganlan_logged_out = '1'`（保留 guestToken 不刪除）→ 重設 AuthState → 回呼 `onLogout()`

---

## Google Sheet「players」結構

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 自動遞增 `P0001`, `P0002`...（`'P' + ('0000' + lastRow).slice(-4)`） |
| `guestToken` | string | UUID v4，訪客登入用 |
| `email` | string \| '' | 綁定後才有值，trim + toLowerCase 正規化 |
| `passwordHash` | string \| '' | SHA-256 hex，綁定後才有值 |
| `displayName` | string | 預設 `倖存者#0001`（`'倖存者#' + playerId.replace('P', '')`） |
| `createdAt` | string | ISO 8601 |
| `lastLogin` | string | ISO 8601（每次 login-guest / login 更新） |
| `isBound` | boolean | 是否已綁定帳密 |

---

## API 端點（Apps Script doPost switch-case）

| action | 參數 | 回傳 | GAS Handler |
|--------|------|------|-------------|
| `register-guest` | `{ guestToken }` | `{ playerId, displayName, alreadyExists }` | `handleRegisterGuest_` |
| `login-guest` | `{ guestToken }` | `{ playerId, displayName, isBound }` | `handleLoginGuest_` |
| `login` | `{ email, password }` | `{ playerId, guestToken, displayName }` | `handleLogin_` |
| `bind-account` | `{ guestToken, email, password }` | `{ success, message }` | `handleBindAccount_` |
| `change-name` | `{ guestToken, newName }` | `{ success, diamond?, nameChangeCount?, cost? }` 或 `{ error: 'insufficient_diamond', cost, diamond }` | Workers `auth.ts` — 首次免費，之後每次 200💎；同步更新 players + save_data + arena_rankings |
| `change-password` | `{ guestToken, oldPassword, newPassword }` | `{ success }` | `handleChangePassword_` |

### Token 快取（resolvePlayerId_）

所有需要身份驗證的 API 均呼叫 `resolvePlayerId_(guestToken)` 解析 playerId：

| 項目 | 值 |
|------|-----|
| 快取層 | GAS ScriptCache（全進程共享） |
| 快取 key | `'pid:' + guestToken` |
| TTL | 21,600 秒（6 小時） |
| 未命中 | 查 players Sheet → 寫入快取 → 回傳 |

---

## 安全考量

| 項目 | 做法 |
|------|------|
| 密碼儲存 | SHA-256 hash（`Utilities.computeDigest`），**不存明文** |
| 密碼傳輸 | POST body 明文傳送（HTTPS 加密 in transit） |
| Token 儲存 | 僅 `localStorage`，不送到 URL query |
| 暴力破解 | Apps Script 自然速率限制（~30 req/s） |
| Email 唯一 | `bind-account` 先查重，同一 email 不可綁定多帳號 |
| 註冊冪等 | `register-guest` 若 token 已存在回傳 `alreadyExists: true` |

### ⚠️ 已知限制

- SHA-256 **無鹽值**（非專業密碼 hash，但 GAS 環境不支援 bcrypt/scrypt）
- Google Sheets 無行鎖定，高併發寫入可能衝突（單人遊戲影響低）
- localStorage 清除 = 訪客帳號遺失（需提示綁定）

---

## 前端狀態

```typescript
interface AuthState {
  isLoggedIn: boolean
  playerId: string | null
  displayName: string       // 未登入時預設 '倖存者'
  isBound: boolean          // 是否已綁定帳密
  guestToken: string | null
}

// localStorage key
const STORAGE_KEY_TOKEN = 'globalganlan_guest_token'
const STORAGE_KEY_LOGGED_OUT = 'globalganlan_logged_out'  // '1' = 使用者已登出，阻止自動登入
```

### useAuth Hook（`src/hooks/useAuth.ts`）

```typescript
interface UseAuthReturn {
  auth: AuthState
  loading: boolean
  error: string | null
  doAutoLogin: () => Promise<void>
  doRegisterGuest: () => Promise<void>
  doLogin: (email: string, password: string) => Promise<boolean>
  doBind: (email: string, password: string) => Promise<boolean>
  doChangeName: (name: string) => Promise<boolean>
  doLogout: () => void
}
```

---

## UI 流程

```
LoginScreen（mount 時自動執行 doAutoLogin）
    │
    ├── 有 token → login-guest 成功 → 自動進場（600ms 延遲）
    ├── 無 token → isLoggedIn = false → 顯示按鈕
    └── 失敗 → 錯誤畫面
            ├── 「訪客模式進入」→ doRegisterGuest（registerGuest()）
            ├── 「離線體驗」→ 直接進場（無伺服器存檔）
            └── 「帳號登入」→ 帳密表單 → login → 成功進場

遊戲內「設定」（SettingsPanel）：
  ├── 帳號資訊（playerId + 綁定狀態）
  ├── 修改暱稱（1-16 字元）
  ├── 綁定帳號（僅未綁定顯示：email + password + confirm）
  ├── 已綁定 Badge（僅已綁定顯示）
  ├── 修改密碼（僅已綁定顯示：舊密碼 + 新密碼 + 確認）
  └── 登出
```

---

## 擴展點

- [ ] **Google 一鍵登入**：OAuth2，Apps Script 原生支援
- [ ] **Line 登入**：需 Line Login SDK + redirect
- [ ] **雙因素驗證**：Email OTP
- [ ] **帳號刪除**：GDPR 合規
- [ ] **密碼加鹽**：若 GAS 支援自定義 hash
- [ ] **暱稱長度一致化**：前端 16 vs GAS 20，應統一

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版：訪客 token + 綁定帳密流程 |
| v1.0 | 2026-03-01 | 全面同步實作：自動登入冪等保護、LoginScreen UI 三模式（auto/login/離線）、SettingsPanel 綁定/改名/改密/登出、預設暱稱「倖存者#XXXX」、resolvePlayerId_ ScriptCache 6h TTL、詳列 6 個 GAS Handler 邏輯、useAuth Hook 介面、前端驗證規則對照 |
| v1.1 | 2026-02-28 | **Bug Fix**：`autoLogin()` 無 token 時不再自動 `register-guest`，改為回傳未登入狀態；新增 `registerGuest()` 給 UI 按鈕觸發，優先複用本地 token；useAuth 新增 `doRegisterGuest` 方法；LoginScreen 「訪客模式進入」按鈕改用 `doRegisterGuest` |
| v1.2 | 2026-03-01 | 新用戶歡迎禮包：`handleRegisterGuest_` 註冊後自動寄送歡迎信件（鑽石 300 / 金幣 10,000 / 中經驗石 5 / 大經驗石 2） |
| v1.3 | 2026-03-01 | 帳號綁定獎勵：`handleBindAccount_` 首次綁定成功寄送獎勵信件（鑽石 200 / 金幣 5,000） |
| v1.4 | 2026-03-01 | Spec 修正：自動登入流程修正為 no-token/login-fail 回傳 `isLoggedIn:false`（不自動註冊）；「訪客模式進入」改呼叫 `registerGuest()`；`logout()` 保留 guestToken 改設 `globalganlan_logged_out` flag；新增 `registerGuest()` / `onAuthChange()` 至導出函式；新增 `globalganlan_logged_out` localStorage key 文件 |
| v1.5 | 2026-03-02 | 改名費用系統：`save_data.nameChangeCount` 欄位；`/change-name` API 首次免費、之後每次 200💎（`NAME_CHANGE_COST`）；後端驗證鑽石餘額、batch 更新 players + save_data + arena_rankings；前端 SettingsPanel 顯示費用規則與已改次數；`authService.ts` 新增 `NAME_CHANGE_COST` 常數 |
| v1.6 | 2026-03-15 | **Spec 校正**：歡迎禮包更新為 Workers 實際內容（鑽石 300 / 金幣 10,000 / EXP 6,500 / 英雄召喚券 10 / 裝備召喚券 10）；移除已廢棄的經驗石道具；函式名更新為 Workers API |