# UI 流程與畫面定義 Spec

> 版本：v2.7 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-06
> 負責角色：🎨 UI_DESIGN → 🔧 CODING

## 概述

全球感染的 UI 由兩個核心狀態軸控制：

1. **`GameState`** — 遊戲大階段（6 值），控制整體遊戲流程
2. **`MenuScreen`** — 主選單子畫面（8 值），控制 MAIN_MENU 下的面板切換

另有頂層 `showGame` boolean 控制登入畫面與遊戲主體的切換。
部分畫面過渡透過 **TransitionOverlay 過場幕** 實現無縫銜接（初始載入、場景主題變更時的關卡切換）。

---

## 依賴

| Spec | 關係 |
|------|------|
| `tech-architecture.md` | UI 層架構基礎 |
| `auth-system.md` | 登入流程 → `showGame` 控制 |
| `save-system.md` | 存檔載入影響 FETCHING → MAIN_MENU |
| `stage-system.md` | 關卡選擇 → 戰鬥準備 |
| `core-combat.md` | 戰鬥迴圈驅動 BATTLE → GAMEOVER |
| `gacha.md` | 召喚畫面流程 |
| `inventory.md` | 背包面板 |
| `progression.md` | 英雄養成面板 |

---

## 實作對照

| 原始碼 | 內容 |
|--------|------|
| `src/types.ts` | `GameState`、`MenuScreen` 型別定義 |
| `src/App.tsx` | 狀態管理 + 條件渲染 + 導航函式 + 過場幕 |
| `src/components/UIOverlay.tsx` | `TransitionOverlay`、`ThumbnailList`、`useToast` |
| `src/components/LoginScreen.tsx` | 登入畫面 |
| `src/components/MainMenu.tsx` | 主選單導航中心 |
| `src/components/HeroListPanel.tsx` | 英雄列表面板 |
| `src/components/InventoryPanel.tsx` | 背包面板 |
| `src/components/GachaScreen.tsx` | 召喚（抽卡）畫面 |
| `src/components/StageSelect.tsx` | 關卡選擇面板 |
| `src/components/SettingsPanel.tsx` | 設定面板 |
| `src/components/MailboxPanel.tsx` | 信箱面板 |
| `src/components/CheckinPanel.tsx` | 每日簽到面板 |
| `src/components/TutorialOverlay.tsx` | 新手引導 overlay + `useTutorial()` hook |
| `src/components/CurrencyIcon.tsx` | 統一貨幣 icon 元件（CSS badge） |
| `src/constants/rarity.ts` | 道具 icon/名稱/稀有度共用常數（含 chest_bronze/silver/gold） |
| `src/components/BattleHUD.tsx` | 戰鬥增強 HUD |
| `src/components/SceneWidgets.tsx` | 3D 場景內嵌 UI（格子標記、相機） |
| `src/components/InfoTip.tsx` | 資源說明浮窗（React Portal 渲染至 body，position: fixed） |
| `src/components/PanelInfoTip.tsx` | 面板說明浮窗（ℹ️ 按鈕 + Portal popup，9 面板各附說明文字） |
| `src/components/RedDot.tsx` | 通知紅點 badge 元件 |

---

## §1 GameState — 遊戲大階段

定義於 `src/types.ts`：

```typescript
export type GameState =
  | 'PRE_BATTLE'   // 初始狀態（尚未載入資料）
  | 'FETCHING'     // 正在從 API 載入英雄列表 / 遊戲資料
  | 'MAIN_MENU'    // 主選單（大廳）
  | 'IDLE'         // 戰鬥準備（選英雄、調陣型）
  | 'BATTLE'       // 戰鬥進行中
  | 'GAMEOVER'     // 戰鬥結束（勝利/敗北）
```

| 狀態 | 說明 | 可見 UI |
|------|------|---------|
| `PRE_BATTLE` | App 掛載後的初始值。過場幕不透明遮蔽全螢幕。 | 過場幕 + 底部面板（隱藏） |
| `FETCHING` | fetchData 執行中，載入英雄列表、技能資料、存檔等。 | 過場幕（含進度條 + 載入文字） |
| `MAIN_MENU` | 主選單大廳。依 `menuScreen` 決定顯示主選單或子面板。 | MainMenu 或子面板 + 3D Canvas（子面板時隱藏） + HUD 資源列 |
| `IDLE` | 戰鬥準備階段。可拖曳調整陣型、選擇上陣英雄。 | 3D 戰場 + 底部英雄選擇欄 + 「開始戰鬥」/「← 返回」按鈕 |
| `BATTLE` | 戰鬥動畫播放中。Domain Engine 驅動回合制迴圈。 | 3D 戰場 + BattleHUD + ROUND 標示 + 倍速/跳過按鈕 |
| `GAMEOVER` | 戰鬥結束。顯示勝敗標語、獎勵面板、操作按鈕。 | 勝敗 Banner + 獎勵面板（勝利時） + 按鈕列 |

---

## §2 MenuScreen — 主選單子畫面

定義於 `src/types.ts`：

```typescript
export type MenuScreen = 'none' | 'heroes' | 'inventory' | 'gacha' | 'stages' | 'settings' | 'mailbox' | 'shop' | 'checkin'
```

| 值 | 對應元件 | 說明 | 解鎖條件 |
|----|---------|------|--------|
| `none` | `MainMenu` | 主選單首頁（功能卡片列表） | 無 |
| `heroes` | `HeroListPanel` | 英雄列表與詳細面板（等級/突破/星級/技能/裝備） | 通關 1-1 後 |
| `inventory` | `InventoryPanel` | 背包面板（道具分類、詳情、出售） | 通關 1-1 後 |
| `gacha` | `GachaScreen` | 召喚/抽卡畫面（卡池資訊、保底進度、單抽/十連、結果動畫） | 通關 1-2 後 |
| `stages` | `StageSelect` | 關卡選擇面板（主線 / 爬塔 / 每日副本 / PvP / Boss 五分頁，含獎勵預覽 + 剩餘次數 + 紅點） | 無 |
| `settings` | `SettingsPanel` | 設定面板（帳號綁定、改名、改密碼、登出） | 無 |
| `mailbox` | `MailboxPanel` | 信箱面板（信件列表、詳情、領取獎勵、刪除） | 無 |
| `shop` | `ShopPanel` | 商店面板（每日/素材/裝備/特殊 四類商品） | 通關 1-2 後 |
| `checkin` | `CheckinPanel` | 每日簽到面板（7 日循環獎勵） | 無 |

> **3D Canvas 可見性規則**：當 `gameState === 'MAIN_MENU' && menuScreen !== 'none'` 時，3D Canvas 設為 `visibility: hidden`，節省 GPU 渲染。

---

## §3 頂層控制：showGame

```
showGame = false  →  顯示 LoginScreen
showGame = true   →  顯示遊戲主體（3D Canvas + HUD + 所有面板）
```

- `showGame` 初始值 `false`
- 登入成功後 `LoginScreen` 回呼 `onEnterGame` → `setShowGame(true)`
- 登出時 `setShowGame(false)` 返回登入畫面

---

## §4 完整導航地圖

```
┌─────────────────────────────────────────────────────────┐
│                      showGame=false                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                  LoginScreen                       │  │
│  │                                                    │  │
│  │  mode='auto'                                       │  │
│  │   ├─ loading      → 「連線中...」                   │  │
│  │   ├─ isLoggedIn   → 「歡迎回來」→ 自動 onEnterGame │  │
│  │   └─ failed       → 訪客重試 / 離線體驗 / 帳號登入  │  │
│  │                                                    │  │
│  │  mode='login'                                      │  │
│  │   └─ Email + 密碼表單 → doLogin → onEnterGame      │  │
│  └────────────────────────────────────────────────────┘  │
│              │ onEnterGame()                              │
│              ▼                                            │
│        setShowGame(true)                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                      showGame=true                       │
│                                                          │
│  PRE_BATTLE ──→ FETCHING ──→ MAIN_MENU ──→ IDLE         │
│       │              │           │    ↑        │         │
│       │              │           │    │        ▼         │
│       │              │           │    └── BATTLE         │
│       │              │           │    ↑      │           │
│       │              │           │    │      ▼           │
│       │              │           │    └── GAMEOVER       │
│       └──────────────┘           │                       │
│    (過場幕遮蔽，顯示進度)          │                       │
│                                  │                       │
│              ┌───── menuScreen ──┤                       │
│              │                   │                       │
│         'none' → MainMenu        │                       │
│         'heroes' → HeroListPanel │                       │
│         'inventory' → Inventory  │                       │
│         'gacha' → GachaScreen    │                       │
│         'stages' → StageSelect   │                       │
│         'settings' → Settings    │                       │
│         'mailbox' → MailboxPanel │                       │         'shop' → ShopPanel       │                       │
│         'checkin' → CheckinPanel  │                       │└─────────────────────────────────────────────────────────┘
```

### §4.1 狀態轉移表

| 起始 | 目標 | 觸發條件 | 導航函式 |
|------|------|---------|---------|
| `PRE_BATTLE` | `FETCHING` | `fetchData()` 開始執行 | 自動（`useEffect`） |
| `FETCHING` | `MAIN_MENU` | 所有資料載入完成 | `fetchData()` 結尾 |
| `MAIN_MENU` + `menuScreen='none'` | `MAIN_MENU` + `menuScreen=X` | 點擊主選單功能按鈕 | `handleMenuNavigate(screen)` |
| `MAIN_MENU` + `menuScreen=X` | `MAIN_MENU` + `menuScreen='none'` | 點擊子面板「← 返回」 | `handleBackToMenu()` |
| `MAIN_MENU` + `menuScreen='stages'` | `IDLE` | 在 StageSelect 選擇關卡 | `handleStageSelect(mode, sid)` |
| `IDLE` | `MAIN_MENU` | 點擊「← 返回」按鈕 | `setGameState('MAIN_MENU')` |
| `IDLE` | `BATTLE` | 點擊「開始戰鬥」 | `startAutoBattle()` → `runBattleLoop()` |
| `BATTLE` | `GAMEOVER` | 一方全滅或回合數超限 | `runBattleLoop()` 結尾 |
| `GAMEOVER` | `IDLE`（同關） | 點擊「重試」 | `retryBattle()` |
| `GAMEOVER` | `IDLE`（下一關） | 點擊「下一關 ▶」/「下一層 ▶」 | `goNextStage()` |
| `GAMEOVER` | `MAIN_MENU` | 點擊「回大廳」 | `backToLobby()` |
| `GAMEOVER` | `BATTLE`（回放） | 點擊「回放 ⏪」 | `replayBattle()` |
| `MAIN_MENU` + `settings` | `showGame=false` | 點擊「登出」 | `useLogout(onLogout)` hook → `handleFullLogout()` |

---

## §5 TransitionOverlay 過場幕機制

### §5.1 概述

`TransitionOverlay` 是全螢幕遮罩元件，用於：
- **初始載入**：遮蔽場景尚未就緒的畫面
- **關卡切換**（場景主題變更時）：遮蔽敵方陣型 / 場景重建過程

### §5.2 視覺效果

- 暗色徑向漸層背景（`#1a0505 → #050000 → #000`）
- CRT 掃描線（紅色半透明水平條紋）
- 移動掃描光條（3 秒迴圈動畫 `scanDown`）
- 暗角效果（徑向漸層遮罩）
- 載入文字 + 進度條（確定進度顯示百分比，不確定進度顯示來回滑動條）

### §5.3 狀態變數

```typescript
const [curtainVisible, setCurtainVisible] = useState(true)   // 是否顯示
const [curtainFading, setCurtainFading] = useState(false)     // 是否正在淡出
const [curtainText, setCurtainText] = useState('載入資源中...') // 顯示文字
```

### §5.4 時序常數

```typescript
const CURTAIN_FADE_MS          = 1000  // CSS curtainFadeOut 動畫持續時間
const SCENE_RENDER_GRACE_MS    = 300   // closeCurtain delay：場景渲染餘裕
const INITIAL_CURTAIN_GRACE_MS = 350   // 初始載入收幕前的額外等待
const REPLAY_SCENE_SETTLE_MS   = 400   // 回放：收幕後等場景更新再啟動 loop
```

### §5.5 過場流程（6 步管線）

```
1. setCurtainVisible(true) → React commit DOM（遮罩出現）
2. waitFrames(2)           → 等 2 rAF（≈33ms）確保幕已不透明
3. 在幕後切換狀態           → 切換敵方陣型 / gameState / 清除戰鬥資料
4. closeCurtain(delay)     → 排程收幕
   4a. setTimeout(delay)   → 場景渲染餘裕（SCENE_RENDER_GRACE_MS=300ms）
   4b. setCurtainFading(true) → 觸發 CSS fade-out 動畫
   4c. setTimeout(CURTAIN_FADE_MS=1000ms) → 動畫結束
5. setCurtainVisible(false) → 完全隱藏遮罩
6. resolve Promise          → 呼叫端繼續
```

### §5.6 各場景的過場文字

| 場景 | curtainText |
|------|-------------|
| 初始載入 | `載入資源中...` → `初始化戰場...` |
| 選擇關卡 | `準備{displayName}...`（例：`準備關卡 1-1...`、`準備挑戰第 5 層...`） |

| 下一關（主線） | `前往下一關...` |
| 下一層（爬塔） | `前往下一層...` |
| 長載入（>12s） | `載入資源中...`（逾時重新設定） |

---

## §6 元件詳細規格

### §6.1 LoginScreen（登入畫面）

**檔案**：`src/components/LoginScreen.tsx`

兩種模式：

| mode | 子狀態 | 顯示內容 |
|------|--------|---------|
| `auto` | loading | 「連線中...」+ 點點動畫 |
| `auto` | isLoggedIn | 「歡迎回來，{displayName}」→ 600ms 後自動 onEnterGame |
| `auto` | failed | 三個按鈕：①「訪客模式進入」②「離線體驗」③「帳號登入」（切到 login mode） |
| `login` | — | Email + 密碼表單 + 「登入」按鈕 + 「返回訪客模式」按鈕 |

**視覺**：末日 CRT 風格（掃描線 + 掃描光條 + 暗角），標題「全球感染 / GLOBAL GANLAN」，底部 `v0.1 — 末日從此開始`。

**流程**：
```
元件掛載 → doAutoLogin()
├─ 成功 → 顯示歡迎 → 600ms 後 onEnterGame → setShowGame(true)
└─ 失敗 → 顯示按鈕列
   ├─ 「訪客模式進入」→ doAutoLogin() 重試
   ├─ 「離線體驗」→ 直接 onEnterGame（無認證）
   └─ 「帳號登入」→ setMode('login') → Email/密碼表單
```

### §6.2 MainMenu（主選單導航中心）

**檔案**：`src/components/MainMenu.tsx`

**布局**（由上而下）：
1. **玩家資訊列**：暱稱 + Lv.等級 + 金幣 + 鑽石
2. **關卡進度與離線產出組**：
   - 關卡進度（例：`🗺️ 關卡進度：1-3`）
   - 離線產出速度（金幣/h、經驗道具/h）
   - 待領取資源 + 「領取」按鈕
   - 未通關 1-1 顯示：「⚔️ 通關 1-1 後解鎖離線獎勵！」
3. **功能按鈕列**（7 卡片 grid）：

| 按鈕 | icon | 目標 MenuScreen | 解鎖條件 |
|------|------|----------------|--------|
| 關卡 | 🗺️ | `stages` | 無（`stagesHasDaily` 為 true 時顯示紅點 badge） |
| 英雄 | 🧟 | `heroes` | 通關 1-1（chapter 1, stage 2） |
| 召喚 | 🎰 | `gacha` | 通關 1-2（chapter 1, stage 3） |
| 背包 | 🎒 | `inventory` | 通關 1-1（chapter 1, stage 2） |
| 商店 | 🏪 | `shop` | 通關 1-2（chapter 1, stage 3） |
| 信箱 | 📬 | `mailbox` | 無（未領取數 >0 顯示紅點 badge） |
| 設定 | ⚙️ | `settings` | 無 |
| 簽到 | 📅 | `checkin` | 無 |

**解鎖機制**：按鈕被鎖定時顯示 🔒 圖示 + 解鎖條件提示。點擊鎖定按鈕顯示 2.5 秒 toast。

**行動裝置緊湊布局**（v1.7）：行動裝置下 padding/字型縮小，功能卡片更緊密，節省小螢幕空間。

**RedDot**：信箱、簽到等有未處理項目時，功能卡片右上角顯示紅點 badge（`RedDot` 元件）。

**InfoTip**：資源列中的貨幣 icon 點擊時顯示 `InfoTip` 說明浮窗。使用 **React Portal**（`createPortal` 到 `document.body`）渲染，`position: fixed` + 動態計算座標，確保不被任何父層 `overflow`/`z-index` 遮蔽或裁切。超出螢幕邊緣時自動偏移修正（左/右/底部）。

### §6.3 StageSelect（關卡選擇面板）

**檔案**：`src/components/StageSelect.tsx`

五個分頁（Mode Tabs）：

| Tab | icon | 說明 | 解鎖條件 | 紅點 |
|-----|------|------|---------|-------|
| 主線 | 📖 | 8 章 × 8 關 = 64 個主線關卡 | 無 | — |
| 爬塔 | 🗼 | 無盡塔，顯示當前樓層 + 獎勵預覽（gold/exp/diamond via `sc-reward-tag`） | `isModeUnlocked('tower')` | — |
| 每日副本 | 📅 | 依星期開放不同副本，分簡單/普通/困難；顯示各難度獎勵預覽 + 剩餘次數 + 耗盡訊息 | `isModeUnlocked('daily')` | 剩餘次數 > 0 |
| PvP | ⚔️ | 每日 3 位 AI 對手；顯示獎勵預覽（含 pvp_coin）+ 剩餘次數 | `isModeUnlocked('pvp')` | 剩餘次數 > 0 |
| Boss | 💀 | 3 位 Boss；顯示段位獎勵提示 + 剩餘次數 | `isModeUnlocked('boss')` | 剩餘次數 > 0 |

> 通過 fetch `/daily-counts` API 取得當日剩餘次數，次數耗盡時按鈕 disabled + 顯示「今日已挑戰完畢」。

**主線關卡狀態**：
- ✅ 已通關（顯示 ✅ 標記）
- 📍 當前關卡（可挑戰）
- 🔒 未解鎖（需先通過前一關）

**章節標籤佈局**：`display: grid; grid-template-columns: repeat(4, 1fr)`（2 行 × 4 列網格排列，取代舊版橫向捲動）

**選擇關卡** → 呼叫 `onSelectStage(mode, stageId)` → 回到 App 的 `handleStageSelect()`。

### §6.4 GachaScreen（召喚畫面）

**檔案**：`src/components/GachaScreen.tsx`

**布局**：
1. **Header**：← 返回 + 卡池名稱 + 鑽石餘額
2. **Banner 資訊**：「常駐招募 — 所有英雄均可獲得」
3. **機率顯示**：SSR 1.5% / SR 10% / R 35% / N 53.5%
4. **保底進度條**：{pityCount}/90（≥75 顯示 🔥 軟保底！）
5. **錯誤訊息**（若有）
6. **抽卡按鈕**（三按鈕布局）：免費單抽或抽卡券（最左）/ 單抽（160 鑽）/ 十連抽（1440 鑽）

**抽卡結果**：全螢幕 overlay，每張結果卡顯示：
- 英雄縮圖 + 名稱 + 稀有度標籤
- NEW! badge（新英雄）或「重複」badge + 星塵/碎片獎勵

**流程**：100% 本地處理（`localPull`），0ms 延遲。

### §6.5 HeroListPanel（英雄列表面板）

**檔案**：`src/components/HeroListPanel.tsx`

- 英雄 grid 列表（依稀有度排序：SSR > SR > R > N）
- 每張卡片顯示：縮圖 + 名稱 + Lv + 星級 + 稀有度 badge
- 點擊進入詳情頁：3D 待機模型預覽 + 完整屬性 + 技能列表 + 裝備槽（2×2 grid 佈局，每格：icon 靠左上 + 裝備名/屬性居中 + 強化按鈕靠右上）
- 若裝備帶有套裝加成，英雄詳情頁顯示當前套裝效果（已激活的套裝加成條件與效果）
- **裝備部位編輯介面**：點擊任何裝備欄位（無論空或已裝備）→ 彈出該部位的編輯 Modal：
  - 若已裝備：顯示「目前裝備」區塊（黃色邊框，含裝備資訊 + 「卸下裝備」按鈕）+ 「可更換裝備」列表（不含已裝備品）
  - 若未裝備：直接顯示可用裝備列表
  - 穿上裝備後 Modal 立即關閉；卸下裝備後 Modal 關閉
  - 不再支援「點擊已裝備欄位直接卸下」的舊行為

### §6.6 InventoryPanel（背包面板）

**檔案**：`src/components/InventoryPanel.tsx`

- Header 顯示「背包」標題（無容量顯示）
- 道具分類篩選（9 個分類 Tab：全部/經驗/突破/裝備素材/鍛造/通用/裝備/寶箱/貨幣）
- 道具列表 + 詳情檢視 + 出售操作

### §6.7 SettingsPanel（設定面板）

**檔案**：`src/components/SettingsPanel.tsx`

分區：
1. **帳號資訊**：綁定狀態（✅ 已綁定 / ⚠️ 訪客帳號）+ 玩家 ID
2. **修改暱稱**：輸入框 + 更新按鈕（1~16 字元）
3. **綁定帳號**（未綁定時）：Email + 密碼 + 確認密碼 → 綁定
4. **修改密碼**（已綁定時）：目前密碼 + 新密碼 + 確認新密碼
5. **登出按鈕**：呼叫 `useLogout(onLogout)` hook 返回的 `handleFullLogout()`（auth logout + 9 個快取清除 + onLogout state reset）

### §6.8 MailboxPanel（信箱面板）

**檔案**：`src/components/MailboxPanel.tsx`

- 信件列表 + 詳情閱覽 + 領取獎勵 + 刪除信件
- 批量操作：一鍵全部領取 / 刪除已讀
- 刪除採樂觀更新（先從 state 移除，再呼叫 API）
- 資料由 App 預加載，開啟面板時直接顯示

### §6.9 BattleHUD（戰鬥增強 HUD）

**檔案**：`src/components/BattleHUD.tsx`

僅在 `gameState === 'BATTLE'` 時渲染。顯示：
- 每位英雄的 **HP 血條**（依百分比變色：>50% 綠、>25% 黃、≤25% 紅）
- **能量條**（藍色填充，滿時脈衝動畫）
- **Buff/Debuff 圖示**（最多 8 個，含堆疊數）
- **技能發動彈幕**（SkillToast，2 秒自動消失）
- **屬性相剋提示**（ElementHint，1.5 秒自動消失）

### §6.10 HUD 常駐元素

**回合標示**：`turn > 0 && gameState !== 'GAMEOVER'` 時顯示 `ROUND {turn}`

**玩家資源列**：僅在 `gameState === 'MAIN_MENU'` 時顯示：
- 金幣（CSS badge `icon-coin`）+ 鑽石（CSS badge `icon-dia`）+ Lv + 經驗條

### §6.14 CurrencyIcon — 統一貨幣 icon 元件

**檔案**：`src/components/CurrencyIcon.tsx`

所有介面的貨幣 icon（金幣/鑽石/經驗/星塵）統一由此元件渲染，使用 CSS badge 樣式，確保跨平台/跨瀏覽器一致的外觀（不依賴 emoji 渲染能力）。

| 元件 | 用途 |
|------|------|
| `CurrencyIcon` | 渲染 5 種貨幣 CSS badge：`gold`(G)、`diamond`(D)、`exp`(E)、`stardust`(S)、`pvp_coin`(🏅) |
| `ItemIcon` | 通用道具 icon — 貨幣類 itemId 自動渲染 CSS badge，其他渲染 emoji（來自 `rarity.ts` 的 `getItemIcon()`） |

**CSS class 定義**（`App.css`）：

| class | 外觀 | 用途 |
|-------|------|------|
| `.icon-coin` | 金色圓形 G | 金幣 |
| `.icon-dia` | 藍色菱形 D | 鑽石 |
| `.icon-exp` | 綠色方形 E | 經驗 |
| `.icon-stardust` | 金色圓形 S | 星塵 |
| `.icon-pvp-coin` | 金色圓形 🏅 | PvP 競技幣 |

**使用範圍**：

| 介面 | 元件 | 使用 |
|------|------|------|
| HUD 資源列 | App.tsx | `<CurrencyIcon type="gold"/>`、`<CurrencyIcon type="diamond"/>` |
| 主選單資源列 | MainMenu.tsx | `<CurrencyIcon type="gold"/>`、`<CurrencyIcon type="diamond"/>`、`<CurrencyIcon type="exp"/>` |
| 勝利獎勵 | App.tsx | `<CurrencyIcon>` for gold/diamond/exp、`<ItemIcon>` for drops |
| 召喚畫面 | GachaScreen.tsx | `<CurrencyIcon type="diamond"/>` for 鑽石餘額/抽卡費用、`<CurrencyIcon type="stardust"/>` for 星塵 |
| 關卡選擇 | StageSelect.tsx | `<CurrencyIcon>` for 獎勵金幣/經驗/鑽石，`<CurrencyIcon type="pvp_coin">` for PvP 競技幣 |
| 商店 | ShopPanel.tsx | `<CurrencyIcon>` for Header 貨幣列/價格 |
| 背包 | InventoryPanel.tsx | `<CurrencyIcon>` for Header 貨幣列/出售/分類 Tab |
| 信箱 | MailboxPanel.tsx | `<ItemIcon>` for 獎勵 icon |
| 英雄詳情 | HeroListPanel.tsx | `<CurrencyIcon type="gold"/>` for 突破金幣 |

> **設計原則**：所有介面不再直接使用 `<i className="icon-xxx">` 或散落 emoji，統一透過 `CurrencyIcon` / `ItemIcon` 元件。

### §6.15 CheckinPanel（每日簽到面板）

**檔案**：`src/components/CheckinPanel.tsx`

**功能**：
- 7 天循環簽到獎勵（Day 1~7），每日可簽到一次
- 部分天數發放抽卡券（Day 3, 5, 6, 7 發放英雄召喚券或裝備鍛造券）
- UTC+8 日期判斷（與後端 GAS 一致）
- 當日已簽到 → 顯示已領取 badge
- 未簽到 → 點擊「簽到」按鈕 → 呼叫 `doDailyCheckin()` → 領取獎勵
- 獎勵循環結束（Day 7）→ 重置回 Day 1

**SaveData 欄位**（見 `save-system.md`）：
- `checkinDay`: number — 當前簽到天數（1~7 循環）
- `checkinLastDate`: string — 上次簽到日期（UTC+8 格式 `YYYY-MM-DD`）

**GAS Handler**：`handleDailyCheckin_()`
- UTC+8 日期邏輯：取得當前 UTC+8 日期，比對 `checkinLastDate`
- 已簽到當日 → 回傳 `{ success: false, reason: 'already_checked_in' }`
- 未簽到 → 遞增 `checkinDay`（超過 7 重置為 1）→ 發放獎勵 → 更新 `checkinLastDate`

**Service**：`saveService.ts` — `doDailyCheckin()` 呼叫 GAS `daily-checkin` action

### §6.16 TutorialOverlay（新手引導）

**檔案**：`src/components/TutorialOverlay.tsx`

**功能**：
- 5 步新手引導 overlay，引導玩家體驗核心遊戲流程
- 使用 `useTutorial()` hook 管理步驟狀態

**步驟**：

| Step | 名稱 | 觸發條件 | 內容 |
|------|------|---------|------|
| 1 | Welcome | 首次進入遊戲（自動） | 歡迎訊息 + 基本操作介紹 |
| 2 | Start-battle | Step 1 完成後 | 引導點擊「開始戰鬥」 |
| 3 | Victory-congrats | 首次戰鬥勝利 | 恭喜勝利 + 獎勵說明 |
| 4 | Explore | 返回主選單後 | 引導探索各功能面板 |
| 5 | Complete | Step 4 完成後 | 引導完成，關閉 overlay |

**狀態追蹤**：
- localStorage key: `globalganlan_tutorial_step`
- 記錄當前步驟編號（1~5），完成後設為 `done`
- 首次造訪（無此 key）→ 自動啟動 Step 1

**觸發邏輯**：
- 自動：首次進入遊戲觸發 Welcome
- 戰鬥勝利：advance 到 Victory-congrats
- 返回主選單：advance 到 Explore

### §6.17 InventoryPanel 裝備穿脫流程

**InventoryPanel.tsx** 新增裝備操作（在 EquipmentDetail 彈窗中）：

**裝備詳情彈窗按鈕**（三個）：
   - 「裝備給英雄」→ 彈出英雄選擇 popup（顯示實際英雄名稱）→ 選擇英雄 → 呼叫 `equipItem(heroInstanceId, equipId)` → 樂觀更新 UI
   - 「強化」→ 進入裝備強化流程
   - 「分解」→ 分解裝備取得素材（`equip_scrap` 等）

**圖鑑分頁（Codex）**：
   - 顯示所有裝備模板（無收集進度顯示）

**依賴服務**：
   - `equipItem` / `unequipItem` / `getHeroEquipment`（來自 `progressionService`）

### §6.11 底部面板（戰鬥準備區）

顯示條件：`gameState === 'IDLE' || 'FETCHING' || 'PRE_BATTLE'`

**戰鬥準備頂部橫幅**（`battle-prep-top-banner`）：
- 顯示 `CombatPowerComparison` 戰力對比
- **關卡資訊區塊**（`bp-stage-section`）：顯示當前挑戰關卡 ID（黃色 badge）+ 關卡名稱
- **通關獎勵列**（`bp-reward-row`）：顯示經驗/金幣/鑽石/額外掉落物 icon + 數量（使用 `getItemIcon`/`getItemName`）
- 資料來源：`getCachedStageConfig(stageId)`

- **英雄選擇欄**（`ThumbnailList`）：水平捲動卡片列表，顯示擁有的英雄
  - 僅在 `canAdjustFormation`（`gameState === 'IDLE' && turn === 0`）時可點擊上陣
  - 已上陣英雄顯示 ✓ 勾選標記
  - 非調整期顯示鎖定提示：「僅可在進入屠殺前調整上陣英雄」
- **按鈕列**（僅 `gameState === 'IDLE' && turn === 0`）：
  - 「← 返回」→ `setGameState('MAIN_MENU')`
  - 「開始戰鬥」→ `startAutoBattle()`

### §6.12 GAMEOVER 按鈕列

| 按鈕 | 條件 | 動作 |
|------|------|------|
| 下一關 ▶ / 下一層 ▶ | `battleResult === 'victory' && stageMode !== 'daily'` | `goNextStage()` |
| 重試 | `battleResult !== 'victory'` | `retryBattle()` |
| 回放 ⏪ | 恆顯示 | `replayBattle()` |
| 戰鬥資訊 📊 | 恆顯示 | `setShowBattleStats(true)` |
| 回大廳 | 恆顯示 | `backToLobby()` |

### §6.13 戰鬥中控制

| 按鈕 | 條件 | 動作 |
|------|------|------|
| x{speed} | `gameState === 'BATTLE'` | 切換倍速 1→2→4→8→1 循環（儲存至 localStorage） |
| 跳過 ⏭ | `gameState === 'BATTLE'` | 立即 resolve 所有動畫/移動 Promise，跳至戰鬥結果 |

---

## §7 導航函式詳解

### `handleMenuNavigate(screen: MenuScreen)`
設定 `menuScreen = screen`，顯示對應子面板。

### `handleBackToMenu()`
設定 `menuScreen = 'none'`，返回主選單首頁。

### `handleStageSelect(mode, sid)`
1. 判斷是否需要過場幕：`needsCurtain = mode !== stageMode`（場景主題不同時才拉幕）
2. 若 `needsCurtain`：拉起過場幕 + 設定文字（`準備{displayName}...`）+ `waitFrames(2)`
3. 設定 `stageMode`、`stageId`
4. 建立敵方陣型（`buildEnemySlotsFromStage`）
5. 恢復存檔陣型（`restoreFormationFromSave`）
6. `setMenuScreen('none')` + `setGameState('IDLE')`
7. 若 `needsCurtain`：`closeCurtain()` 收幕
8. `showToast('已選擇: {displayName}')`

### `startAutoBattle()`
- 前提：`gameState === 'IDLE'` 且 playerSlots 至少有一位英雄
- 呼叫 `runBattleLoop()` 進入戰鬥

### `retryBattle()`
**不使用過場幕**，直接重置狀態：
1. 恢復戰前玩家陣容（HP 完全回復、死亡復活）
2. 重建同一關卡敵方（`buildEnemySlotsFromStage`）
3. 清除所有戰鬥狀態（turn、popups、battleResult、actorStates、buffs、energy、skillToasts、elementHints、passiveHints 等）
4. 清除殘留的動畫/移動 Promise（避免上一場 stale timeout 漏進新戰鬥）
5. `setGameState('IDLE')`

### `replayBattle()`
**不使用過場幕**，直接重置並回放：
1. 儲存 `battleActionsRef` 副本為 `savedActions`
2. 恢復戰前雙方陣容（HP 完全回復）
3. 清除所有戰鬥狀態（含殘留的動畫/移動 Promise）
4. `await waitFrames(3)`（等 React commit + 模型掛載就緒）
5. 呼叫 `runBattleLoop(savedActions)` 進行回放

### `goNextStage()`
- **爬塔模式**：樓層 +1 → 恢復 HP → 建新敵方 → `setGameState('IDLE')` → 收幕
- **主線模式**：
  - 有下一關 → 處理方式同爬塔
  - 無下一關（全通關） → `showToast('恭喜！已通關所有關卡')` → `backToLobby()`
- **每日副本**（`daily`）：不顯示「下一關」按鈕，因此不會觸發

### `backToLobby()`
**不使用過場幕**，直接清理並返回戰前的 menuScreen：
1. 清空雙方槽位（`Array(6).fill(null)`）
2. `resetBattleState()` — 清除所有戰鬥狀態
3. `setVictoryRewards(null)`
4. `setShowBattleScene(false)` — 解除 3D 場景掛載
5. `setMenuScreen(preBattleMenuScreenRef.current)` — 返回進入戰鬥前的畫面（如 StageSelect）
6. `setGameState('MAIN_MENU')`

---

## §8 載入流程（Phase 0/1/2）

```
┌─ Phase 0（元件掛載，不需認證）─────────────────────────┐
│  ① GET 英雄列表（earlyHeroesRef）                      │
│  ② 預載遊戲資料（loadAllGameData + 快取）               │
│  ③ 英雄列表到手後 → 背景啟動 GLB 模型 & 縮圖下載       │
└────────────────────────────────────────────────────────┘
                          ↓ 認證成功
┌─ Phase 1（認證成功，不等 showGame）────────────────────┐
│  ④ 背景載入存檔（doLoadSave）                          │
│  ⑤ 預加載信箱（preloadMail）                           │
└────────────────────────────────────────────────────────┘
                          ↓ showGame = true
┌─ Phase 2（進入遊戲）──────────────────────────────────┐
│  ⑥ fetchData() 匯總                                    │
│     PRE_BATTLE → FETCHING（顯示進度條）                 │
│     await 英雄列表 + 遊戲資料 + 存檔（大部分已快取）     │
│     恢復存檔陣型 + 戰鬥倍速                             │
│     背景啟動模型/縮圖預載（不阻塞）                      │
│     FETCHING → MAIN_MENU                                │
│     closeCurtain(INITIAL_CURTAIN_GRACE_MS)               │
└────────────────────────────────────────────────────────┘
```

---

## §9 戰鬥完整流程

```
MAIN_MENU
  └─ StageSelect 選關 → handleStageSelect()
     └─ [條件過場幕：場景主題變更時] 建立敵方 + 恢復陣型 → IDLE

IDLE（戰鬥準備）
  ├─ 拖曳調整陣型 / 點擊英雄上下陣
  ├─ 「← 返回」→ MAIN_MENU
  └─ 「開始戰鬥」→ startAutoBattle()
     └─ 儲存陣型到 save → BATTLE

BATTLE（戰鬥進行中）
  ├─ Domain Engine 驅動回合迴圈
  │   ├─ 依速度排序行動順序
  │   ├─ 前進 → 攻擊/技能 → 傷害結算 → 後退
  │   ├─ 能量累積 → 大招觸發
  │   └─ Buff/Debuff 結算
  ├─ 倍速切換（x1/x2/x4/x8）
  ├─ 跳過戰鬥（skip → 立即結算）
  └─ 一方全滅 → GAMEOVER

GAMEOVER
  ├─ victory
  │   ├─ 顯示 VICTORY banner + 獎勵面板（金幣/鑽石/經驗/掉落物/離線產速，無星級評價、無首次通關 badge）
  │   ├─ 「下一關 ▶」→ goNextStage() → IDLE
  │   ├─ 「回放 ⏪」→ replayBattle() → waitFrames(3) → BATTLE（回放模式）
  │   ├─ 「戰鬥資訊 📊」→ 展開戰鬥統計面板
  │   └─ 「回大廳」→ backToLobby() → MAIN_MENU
  │
  └─ defeat
      ├─ 顯示 DEFEAT banner
      ├─ 「重試」→ retryBattle() → IDLE（同一關）
      ├─ 「回放 ⏪」→ replayBattle() → waitFrames(3) → BATTLE（回放模式）
      ├─ 「戰鬥資訊 📊」→ 展開戰鬥統計面板
      └─ 「回大廳」→ backToLobby() → MAIN_MENU
```

---

## §10 橫屏處理

當偵測到手機/平板橫屏（`isLandscape` via `useResponsive()`），顯示 CSS 控制的遮罩：
- 圖示：📱
- 文字：「請旋轉裝置至直屏模式」
- class：`.landscape-block`

---

## §11 浮動提示系統（Toast）

- 由 `useToast()` hook 提供 `showToast(text)` 函式
- Toast 以 CSS 動畫淡入淡出（`toast-item` class）
- `onAnimationEnd` 自動移除

使用場景：
- 英雄上/下陣通知
- 關卡選擇確認
- 資源領取結果
- 解鎖條件未達提示
- 抽卡結果提示
- 全通關祝賀
- 升級通知

---

## 擴展點

1. **新增 GameState**：若需要新的大階段（如 PvP 匹配中、劇情動畫播放中），在 `types.ts` 擴展 union，並在 App.tsx 加入對應渲染條件
2. **新增 MenuScreen**：在 `types.ts` 擴展 union → MainMenu 加新按鈕 → App.tsx 加渲染條件
3. **過場幕自訂**：可擴展 TransitionOverlay 支援不同視覺風格（如 Boss 關的特殊過場）
4. **戰鬥中 UI**：BattleHUD 目前保留 container div，可繼續擴展頂部/側邊資訊面板

---

## 變更歷史

| 版本 | 日期 | 說明 |
|------|------|------|
| v1.0 | 2026-02-28 | 初版：完整記錄所有 GameState、MenuScreen、導航函式、過場幕機制、元件規格 |
| v1.1 | 2026-02-28 | 新增 §6.14 CurrencyIcon 統一貨幣 icon 元件規格（4 種 CSS badge + ItemIcon 通用元件），實作對照新增 CurrencyIcon.tsx + rarity.ts |
| v1.2 | 2026-03-01 | 同步實際程式碼：MenuScreen 新增 `'shop'`（8 值）、MainMenu 7 卡片（加商店）、InventoryPanel 9 個分類 Tab、GachaScreen 費用 160/1440 鑽、retryBattle/replayBattle/backToLobby 移除過場幕描述（實際不使用）、handleStageSelect 改為條件式過場幕（僅場景主題變更時） |
| v1.3 | 2026-03-02 | **PWA Safe Area 適配**：`.main-menu-overlay`、`.panel-overlay`、`.login-screen` 新增 `padding-top: max(Npx, env(safe-area-inset-top, 0px))`，確保 iOS PWA 劉海/動態島不遮蔽 UI 內容（補充既有 `.game-hud` safe-area padding） |
| v1.4 | 2026-03-02 | **英雄資訊技能預覽**：未解鎖被動技能改為顯示完整技能名稱、圖標、說明，並以 `🔒 ★N 解鎖` 灰色 badge + 虛線邊框 + 降低透明度提示未解鎖狀態 |
| v1.5 | 2026-03-02 | **每日簽到 + 新手引導 + 背包裝備穿脫**：新增 §6.15 CheckinPanel（7 日循環簽到）、§6.16 TutorialOverlay（5 步新手引導）、§6.17 InventoryPanel 裝備穿脫流程；MenuScreen 新增 `'checkin'`（9 值）；MainMenu 新增簽到按鈕；實作對照新增 CheckinPanel.tsx + TutorialOverlay.tsx |
| v1.6 | 2026-03-02 | **登出流程重構**：SettingsPanel 登出改用 `useLogout(onLogout)` hook（auth logout + 9 快取清除 + state reset），取代舊版 inline `logout() + onLogout()` |
| v1.7 | 2026-03-03 | **新元件 + Gacha 三按鈕 + 大廳緊湊**：新增 `InfoTip.tsx`（資源說明 Tooltip，寬度 min 300px / max 380px）、`RedDot.tsx`（通知紅點 badge）；GachaScreen 改為三按鈕布局（免費/券抽、單抽、十連）；MainMenu 行動裝置下緊湊布局（縮小 padding/字型）；主線關卡擴展至 8 章 64 關；MainMenu 新增 RedDot + InfoTip 支援 |
| v1.8 | 2026-03-05 | **UI 全面優化**：InfoTip 改用 React Portal（`createPortal` 到 body + `position: fixed`），不再被父層 overflow/z-index 裁切；MainMenu 玩法格由 2 欄改為 3 欄（padding/icon/字型縮小），手機一屏可完整顯示所有功能；關閉按鈕統一為暗色背景 `rgba(30,30,40,0.85)`（取代紅色 `hd2-close`）；英雄詳情彈窗改為 `align-items: flex-start` + `padding-top`，避免手機上方導航列遮擋；關卡章節標籤新增 `overflow-x: auto` 橫向捲動（8 章不再右側裁切） |
| v1.9 | 2026-03-04 | **桌面版章節標籤橫向滾動修復**：章節標籤改為 `scrollbar-width: thin`（桌面顯示 4px 細 scrollbar），手機版維持隱藏 scrollbar（觸控滑動操作）；scrollbar 使用半透明白色配色 `rgba(255,255,255,0.25)` 融入深色主題 |
| v2.0 | 2026-03-06 | **英雄裝備 2×2 + 背包容量顯示**：HeroListPanel 裝備區塊改為 `display: grid; grid-template-columns: 1fr 1fr` 兩行兩列佈局；每格改為 `flex-direction: row; align-items: flex-start`（icon 靠左上、裝備名居中、強化按鈕靠右上同行）；InventoryPanel 容量顯示改為 `背包`（含所有道具+裝備總數）；D1 新增 gacha_ticket_hero / gacha_ticket_equip 道具描述 |
| v2.1 | 2026-06-19 | **UI 多處調整**：背包 Header 移除容量顯示（X/Y）；裝備詳情彈窗改為 3 按鈕（裝備給英雄/強化/分解，移除鎖定）；新增圖鑑分頁（顯示所有裝備，無收集進度）；商店改為 5 分頁（每日商店/素材商店/星塵兌換/特殊商店/碎片兌換）；特殊商店販賣英雄召喚券與裝備鍛造券；簽到部分天數發放抽卡券；英雄詳情顯示套裝加成效果；勝利面板移除星級評價與首次通關 badge；已通關關卡顯示 ✅ 取代星級；爬塔移除獎勵顯示行 |
| v2.2 | 2026-03-04 | **4 項 UI 優化**：(1) 統一裝備碎片外觀 🔩 + 名稱「裝備碎片」（商店碎片兌換分頁、Header InfoTip、價格圖示統一使用 🔩，與分解流程一致）；(2) 裝備穿脫改為部位編輯介面（點擊任何裝備欄位→開啟編輯 Modal，顯示「目前裝備」+「卸下裝備」+「可更換裝備」，不再直接卸下）；(3) 章節標籤改為 `grid-template-columns: repeat(4, 1fr)` 兩行四列網格排列，取代橫向捲動；(4) 戰鬥準備頂部新增關卡資訊橫幅，顯示關卡 ID + 名稱 + 通關獎勵預覽 |
| v2.5 | 2026-03-06 | **紅點系統擴展 + ClickableItemIcon 統一**：①抽卡免費抽紅點（`gachaHasFreePull` useMemo + GachaScreen 雙分頁 RedDot）②競技場挑戰紅點（`arenaChallengesLeft` + MainMenu RedDot）③全解鎖條件審核（所有紅點加 `!locked` 守衛）④5 檔案 10 處 `getItemIcon` → `<ClickableItemIcon>`（App.tsx/StageSelect/CheckinPanel/ShopPanel/HeroListPanel），CheckinPanel/ShopPanel 移除手動 `previewItemId` + `ItemInfoPopup`，改由 ClickableItemIcon 自帶 popup |
| v2.4 | 2026-03-05 | **面板說明 InfoTip + 紅點閃現修正 + 爬塔樓層同步**：①新增 `PanelInfoTip.tsx` 元件（ℹ️ 按鈕 + Portal popup），9 個面板標題旁皆加入介面說明浮窗（`PANEL_DESCRIPTIONS` 集中管理文案）；②StageSelect `hasRemaining()` 在 `dailyCounts` 尚未載入時改為 `return false`（修復紅點閃現問題）；③`runBattleLoop.ts` 爬塔勝利後呼叫 `doUpdateProgress({ towerFloor: nextFloor })` 即時同步樓層 |
| v2.7 | 2026-03-06 | **UX 修正**：①`backToLobby()` 更新為返回戰前 menuScreen（`preBattleMenuScreenRef`）+ `setShowBattleScene(false)` 解除 3D 場景②戰鬥準備戰力改為即時計算（`battlePrepPower` useMemo 基於 `playerSlots`）③物品資訊彈窗 z-index 提升至 99999 ④簽到彈窗描述支援 `white-space: pre-wrap` 換行 |
| v2.3 | 2026-03-05 | **StageSelect 5 分頁 + 紅點 + pvp_coin**：①StageSelect 從 3 分頁擴充至 5 分頁（主線/爬塔/每日/PvP/Boss），各面板顯示獎勵預覽 + 剩餘每日次數（fetch `/daily-counts` API）+ 耗盡時按鍵 disabled ②StageSelect Tab 剩餘次數 > 0 時顯示紅點 badge ③MainMenu 新增 `stagesHasDaily` prop，關卡按鈕剩餘次數 > 0 時顯示紅點 ④App.tsx 在 MAIN_MENU 時 fetch daily-counts 傳入 MainMenu ⑤CurrencyIcon 新增 `pvp_coin` 類型（🏅），PvP 獎勵預覽中使用 ⑥App.css 新增 tower-rewards/sc-reward-tag/daily-attempts/daily-exhausted/daily-tier-rewards/pvp-meta-row/pvp-reward-preview/boss-card-reward-hint 樣式 |