# 獲得物品動畫提示 Spec

> 版本：v0.4 ｜ 狀態：🟢 已實作（全場景連接）
> 最後更新：2026-03-01
> 負責角色：🎨 UI_DESIGN → 🔧 CODING

## 概述

任何獲得物品的場景（戰鬥勝利、抽卡、開寶箱、信件領取、商店購買、競技場獎勵等）都需要在**畫面正中央**以動畫方式展示獲得的物品，包括名稱、數量、稀有度。
讓玩家在獲得物品時有**強烈的成就感和滿足感**。

## 依賴

- `specs/ui-flow.md` — GameState 控制顯示時機
- `specs/inventory.md` — ItemDefinition（道具名稱/稀有度/icon）
- `specs/hero-schema.md` — RawHeroData（英雄名稱/稀有度/大頭照）
- `specs/progression.md` — OwnedEquipment / EquipmentTemplate（裝備名稱/套裝/稀有度）
- `specs/gacha.md` — 抽卡結果
- `specs/stage-system.md` — 通關獎勵
- `specs/combat-power.md` — CurrencyIcon 元件復用

## 實作對照（待建立）

| 原始碼 | 說明 |
|--------|------|
| `src/components/AcquireToast.tsx` | UI 元件 — 獲得物品動畫遮罩 |
| `src/hooks/useAcquireToast.ts` | Hook — 控制佇列、依序播放 |
| `src/services/acquireToastBus.ts` | 全域事件匯流排 — 子元件可透過 `emitAcquire()` 觸發動畫 |
| `src/App.css` | CSS 動畫 keyframes |

---

## 一、物品類型與展示規格

### 1.1 物品類型

| 類型 | 觸發場景 | 展示元素 |
|------|---------|---------|
| 英雄 | 抽卡（新英雄）、首抽 | 大頭照 + 名稱 + 稀有度邊框 + ✨ 光效 |
| 裝備 | 裝備抽卡、商店購買 | 部位 icon + 套裝名 + 稀有度邊框 |
| 消耗品/素材 | 戰鬥掉落、信件、商店、開寶箱 | 道具 icon + 名稱 + 數量 |
| 貨幣 | 戰鬥獎勵、每日獎勵、信件 | CurrencyIcon + 名稱 + 數量 |
| 碎片 | 抽卡重複、信件 | 英雄縮圖 + 🧩 + 數量 |

### 1.2 稀有度視覺等級

| 稀有度 | 邊框色 | 背景效果 | 停留時間 |
|--------|--------|---------|---------|
| N | `#9ca3af`（灰） | 無 | 0.6s |
| R | `#60a5fa`（藍） | 輕微光暈 | 0.8s |
| SR | `#a78bfa`（紫） | 中等光暈 + 粒子 | 1.0s |
| SSR | `#fbbf24`（金） | 強烈光效 + 粒子爆發 + 螢幕微震 | 1.5s |

---

## 二、動畫設計

### 2.1 單個物品動畫流程

```
Phase 1: 進入（0 ~ 0.3s）
  ├─ 背景遮罩淡入（半透明黑 rgba(0,0,0,0.4)）
  ├─ 物品從中央放大彈出（scale 0 → 1.2 → 1.0，easeOutBack）
  └─ 稀有度邊框光效亮起

Phase 2: 展示（0.3s ~ 停留時間）
  ├─ 物品浮動展示（微上下浮動 ±3px）
  ├─ 名稱 + 數量文字淡入
  └─ SR/SSR：背景粒子持續播放

Phase 3: 退出（停留時間 ~ +0.3s）
  ├─ 物品向上飄移 + 縮小（scale 1.0 → 0.8）
  ├─ 整體淡出（opacity 1 → 0）
  └─ 背景遮罩淡出
```

### 2.2 多物品佇列模式（批量獲得）

當一次獲得多件物品時（例如戰鬥掉落 3 種道具 + 金幣 + 經驗）：

#### 模式 A：重要物品逐一展示 + 小物品合併

```
1. SSR/SR 英雄/裝備 → 逐一全螢幕動畫（Phase 1-3）
2. R/N 裝備 + 消耗品 + 貨幣 → 合併為一頁多物品列表
```

#### 合併列表展示

```
┌─────────────────────────────────┐
│                                 │
│        🎉 獲得物品               │
│  ──────────────────────────     │
│  🪙 金幣           +2,000      │
│  ✨ 經驗             +150       │
│  📗 小型經驗核心      ×2        │
│  🔥 力量職業石        ×3        │
│  ──────────────────────────     │
│          [ 確認 ]               │
│                                 │
└─────────────────────────────────┘
```

| 參數 | 值 |
|------|-----|
| 合併列表最大行數 | 8 行（超過顯示「...及其他 N 件」） |
| 貨幣使用 CurrencyIcon | ✅ 金幣、鑽石、經驗、星塵 |
| 自動關閉 | 3 秒後自動關閉（或手動點「確認」） |
| 物品排序 | 稀有度降序 → 類型 → 數量降序 |

### 2.3 跳過機制

- 點擊螢幕任意處 → 跳過當前物品動畫，直接進入下一件
- 長按 / 快速多點 → 跳過全部，直接顯示合併列表
- 合併列表的「確認」按鈕 → 關閉整個提示

---

## 三、觸發場景與整合

### 3.1 各場景觸發點

| 場景 | 觸發時機 | 物品來源 | 模式 | 實作狀態 |
|------|---------|---------|------|---------|
| 戰鬥勝利 | `GAMEOVER` 勝利結算後 | `stageReward` (exp/gold/diamond/items) | 合併列表 | ✅ App.tsx |
| 英雄抽卡 | `GachaScreen` 抽卡結果 | `LocalPullResult[]` | 逐一展示（新英雄 + 重複碎片合併） | ✅ GachaScreen.tsx `emitAcquire()` |
| 裝備抽卡 | `GachaScreen` 裝備抽結果 | `OwnedEquipment[]` | SSR 逐一展示 + 其餘合併 | ⬜ 尚無裝備卡池 |
| 信件領取 | `MailboxPanel` 領取獎勵 | mail.rewards | 合併列表 | ✅ App.tsx `onRewardsClaimed` |
| 商店購買 | `ShopPanel` 購買完成 | 購買的商品 | 單物品動畫 / 合併列表 | ✅ ShopPanel.tsx `emitAcquire()` |
| 開寶箱 | `InventoryPanel` 使用寶箱 | 寶箱輸出 | 合併列表 | ⬜ 待 GAS `use-item` 回傳結構 |
| 競技場獎勵 | `ArenaPanel` 挑戰勝利 | diamond/gold/pvpCoin | 合併列表 | ✅ App.tsx 競技場勝利分支 |
| 排名提升 | 首次達到排名里程碑 | 鑽石/金幣/競技幣 | 合併列表 | ⬜ 待 milestoneReward |

### 3.1a 全域事件匯流排（v0.3 新增）

子元件無法直接存取 `useAcquireToast()` hook，因此透過 `acquireToastBus.ts` 解耦：

```typescript
// src/services/acquireToastBus.ts
registerAcquireHandler(h)  // App.tsx mount 時註冊
emitAcquire(items)         // 任何元件均可呼叫
```

- **App.tsx** 在 mount 時呼叫 `registerAcquireHandler(acquireToast.show)`
- **GachaScreen / ShopPanel** 等子元件 import `emitAcquire` 觸發動畫
- **App.tsx 內部**（信件、競技場、戰鬥）直接用 `acquireToast.show()`

### 3.2 Hook 介面

```typescript
interface AcquireItem {
  type: 'hero' | 'equipment' | 'item' | 'currency' | 'fragment'
  id: string           // heroId / equipmentTemplateId / itemId / 'gold'|'diamond'|'exp'|'stardust'
  name: string         // 顯示名稱
  quantity: number     // 數量
  rarity: 'N' | 'R' | 'SR' | 'SSR'
  isNew?: boolean      // 新英雄/首次獲得（加 NEW badge）
  thumbnail?: string   // 英雄大頭照 URL（僅 hero/fragment 類型）
}

function useAcquireToast(): {
  show: (items: AcquireItem[]) => void  // 顯示獲得提示
  isShowing: boolean                     // 是否正在播放
}
```

### 3.3 呼叫範例

```typescript
// 戰鬥勝利後
const acquireToast = useAcquireToast()

const items: AcquireItem[] = [
  { type: 'currency', id: 'gold', name: '金幣', quantity: 2000, rarity: 'N' },
  { type: 'currency', id: 'exp', name: '經驗', quantity: 150, rarity: 'N' },
  { type: 'item', id: 'exp_core_s', name: '小型經驗核心', quantity: 2, rarity: 'N' },
]
acquireToast.show(items)

// 抽卡獲得 SSR 英雄
acquireToast.show([
  { type: 'hero', id: '9', name: '暗夜領主', quantity: 1, rarity: 'SSR', isNew: true, thumbnail: '/models/zombie_9/thumbnail.webp' },
])
```

---

## 四、AcquireToast 元件結構

### 4.1 React 元件

```tsx
// AcquireToast.tsx
function AcquireToast({ items, onComplete }: { items: AcquireItem[]; onComplete: () => void }) {
  // 1. 拆分：important（SR/SSR 英雄/裝備）vs common（其他）
  // 2. important 逐一播放全螢幕動畫
  // 3. 播完後顯示 common 合併列表
  // 4. 全部完成呼叫 onComplete
}
```

### 4.2 全螢幕單物品動畫

```
┌─────────────────────────────────────────┐
│           ░░ 半透明黑色背景 ░░            │
│                                         │
│              ╔═══════════╗              │
│              ║  ✨ 光效  ║              │
│              ║  [大頭照]  ║              │
│              ║  金色邊框  ║              │
│              ╚═══════════╝              │
│                                         │
│             ★★★★ SSR                   │
│           「暗夜領主」                    │
│              🆕 NEW                     │
│                                         │
│          ┄ 點擊任意處繼續 ┄              │
│                                         │
└─────────────────────────────────────────┘
```

---

## 五、CSS 動畫

```css
/* 背景遮罩 */
.acquire-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: acquire-bg-in 0.3s ease-out;
}

/* 物品彈出 */
.acquire-item-enter {
  animation: acquire-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes acquire-pop {
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1.0); opacity: 1; }
}

/* 物品退出 */
.acquire-item-exit {
  animation: acquire-fly-out 0.3s ease-in forwards;
}

@keyframes acquire-fly-out {
  0%   { transform: translateY(0) scale(1.0); opacity: 1; }
  100% { transform: translateY(-40px) scale(0.8); opacity: 0; }
}

/* SSR 金色光效 */
.acquire-ssr-glow {
  box-shadow: 0 0 30px rgba(251, 191, 36, 0.6),
              0 0 60px rgba(251, 191, 36, 0.3);
  animation: acquire-glow-pulse 1s ease-in-out infinite;
}

@keyframes acquire-glow-pulse {
  0%, 100% { box-shadow: 0 0 30px rgba(251, 191, 36, 0.6); }
  50%      { box-shadow: 0 0 50px rgba(251, 191, 36, 0.8); }
}

/* SR 紫色光效 */
.acquire-sr-glow {
  box-shadow: 0 0 20px rgba(167, 139, 250, 0.5),
              0 0 40px rgba(167, 139, 250, 0.2);
}

/* 浮動展示 */
.acquire-float {
  animation: acquire-float 2s ease-in-out infinite;
}

@keyframes acquire-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}

/* 合併列表項目逐一淡入 */
.acquire-list-item {
  animation: acquire-list-fade 0.3s ease-out forwards;
  opacity: 0;
}

.acquire-list-item:nth-child(1) { animation-delay: 0.0s; }
.acquire-list-item:nth-child(2) { animation-delay: 0.1s; }
.acquire-list-item:nth-child(3) { animation-delay: 0.2s; }
.acquire-list-item:nth-child(4) { animation-delay: 0.3s; }
.acquire-list-item:nth-child(5) { animation-delay: 0.4s; }
.acquire-list-item:nth-child(6) { animation-delay: 0.5s; }
.acquire-list-item:nth-child(7) { animation-delay: 0.6s; }
.acquire-list-item:nth-child(8) { animation-delay: 0.7s; }

@keyframes acquire-list-fade {
  0%   { opacity: 0; transform: translateX(-10px); }
  100% { opacity: 1; transform: translateX(0); }
}

/* 螢幕微震（SSR 專用） */
.acquire-screen-shake {
  animation: acquire-shake 0.3s ease-out;
}

@keyframes acquire-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-4px); }
  40%      { transform: translateX(4px); }
  60%      { transform: translateX(-2px); }
  80%      { transform: translateX(2px); }
}
```

---

## 六、與現有系統的整合要點

### 6.1 抽卡（GachaScreen）

- 現有抽卡已有自己的結果展示動畫
- **整合方式**：將現有抽卡結果展示遷移至 `useAcquireToast`，統一動畫風格
- 或：抽卡保留自己的全螢幕展示，結束後的碎片/星塵入帳用 AcquireToast

### 6.2 戰鬥勝利（GAMEOVER）

- 現有 GAMEOVER 有獎勵面板
- **整合方式**：獎勵面板顯示前先播放 AcquireToast → 播完後顯示獎勵面板摘要

### 6.3 信件領取（MailboxPanel）

- 現有 `onRewardsClaimed` 直接走 `addItemsLocally()`
- **整合方式**：領取成功後呼叫 `acquireToast.show(rewards)` → 動畫播完再 close

### 6.4 商店購買（ShopPanel）

- 現有購買成功有 toast 提示
- **整合方式**：替換為 `acquireToast.show([purchasedItem])`

---

## 擴展點

- [ ] **粒子效果**：Canvas 粒子爆發（ confetti / 光點飛散）
- [ ] **音效**：不同稀有度的開箱音效（N: 輕響、SSR: 史詩感）
- [ ] **3D 展示**：英雄獲得時顯示 3D 模型旋轉（而非 2D 大頭照）
- [ ] **收藏動畫**：物品飛向背包 icon 的收納動畫
- [ ] **連續抽卡加速**：十連抽時的快轉/跳過最佳化

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.5 | 2026-03-01 | 新增場景連接：競技場里程碑獎勵 milestoneReward → acquireToast（含 exp）、InventoryPanel 寶箱開啟結果 → emitAcquire、競技場挑戰獎勵新增 exp 顯示；場景連接提升至 7/8 |
| v0.4 | 2026-03-01 | QA 審計通過：15 單元測試全通過、5/8 場景已連接確認、acquireToastBus 事件匹流排驗證 |
| v0.3 | 2026-03-01 | 全場景連接：新增 acquireToastBus.ts 全域事件匯流排、GachaScreen emitAcquire（英雄+星塵/碎片）、ShopPanel emitAcquire（購買獎勵）、App.tsx MailboxPanel onRewardsClaimed、App.tsx 競技場勝利獎勵（diamond/gold/pvpCoin） |
| v0.2 | 2026-03-01 | 完成全部實作：useAcquireToast hook + AcquireToast 元件（SingleItemDisplay + ItemListDisplay）+ CSS 動畫 + App.tsx GAMEOVER 整合 |
| v0.1 | 2026-03-01 | 初版草案：5 種物品類型、4 級稀有度視覺、3 階段動畫流程（進入/展示/退出）、批量佇列模式（重要物品逐一 + 小物品合併列表）、跳過機制、8 個觸發場景、useAcquireToast hook 介面、AcquireToast 元件結構、CSS keyframes（pop/fly-out/glow/float/shake/list-fade）、與 GachaScreen/GAMEOVER/MailboxPanel/ShopPanel 整合要點 |
