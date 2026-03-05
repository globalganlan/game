# 背包與道具系統 Spec

> 版本：v2.8 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-05
> 負賬角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

統一管理所有可堆疊道具、消耗品、素材的儲存與使用。
背包是玩家的核心資源中心，所有養成系統（升級/突破/升星）的素材消耗都從背包扣除。

> **v2.0 變更**：裝備系統改為模板制（見 `progression.md` §四），裝備資料獨立存於 `save_data.equipment` JSON 欄位，不再放在背包 inventory 中。鍛造/拆解/強化石/重洗石全部移除。

UI 已全面實作：分類 Tab、排序功能、4 種排序模式、使用/出售按鈕、金幣鉇石 Header。

## 依賴

- `specs/save-system.md` — `save_data.equipment` JSON 欄位（裝備獨立儲存）
- `specs/progression.md` — 消耗素材定義（經驗核心/碎片/職業石）、裝備模板制 v2
- `specs/gacha.md` — 星塵貨幣、抽卡產出
- `specs/stage-system.md` — 關卡掉落物
- `specs/hero-schema.md` — 英雄 HeroID 對應碎片

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/services/inventoryService.ts` | Service 層 — 背包道具管理函式 |
| `src/components/InventoryPanel.tsx` | UI — 分頁背包 + ItemDetail 彈窗 |
| `src/domain/progressionSystem.ts` | OwnedEquipment / EquipmentTemplate 型別定義（v2 模板制） |
| `src/services/saveService.ts` | InventoryItem 型別定義 |
| `workers/src/routes/inventory.ts` | Workers 路由 — inventory 端點 |

---

## 一、道具分類

### 1.1 分類總覽

| 類別 | category | 可堆疊 | 說明 |
|------|----------|--------|------|
| 突破素材 | `ascension_material` | ✅ | 英雄突破用（碎片 + 職業石） |
| 通用素材 | `general_material` | ✅ | 各類可交換/合成的材料（含裝備碎片 `equip_scrap`） |
| 寶箱 / 禮包 | `chest` | ✅ | 開啟後獲得隨機道具 |
| 貨幣代幣 | `currency` | ✅ | 競技幣、星塵等非主貨幣 |

> **v2.0 移除的分類**：
> - `equipment_material`（強化石、重洗石）— 裝備強化改為只消耗金幣
> - `forge_material`（鍛造圖紙、鍛造礦）— 鍛造系統移除
> - `equipment`（獨立裝備實例）— 裝備改存 `save_data.equipment` JSON

> **v2.4 移除的分類**：
> - `exp_material`（經驗核心 S/M/L）— EXP 改為頂層資源（save_data.exp），不再使用經驗道具

> **v2.4 移除的道具**：
> - `eqm_reroll`（重洗石）— 已從商店、後端 SHOP_CATALOG、ItemInfoPopup、constants/rarity.ts 移除

> **金幣（gold）、鑽石（diamond）、EXP（exp）** 儲存在 `save_data` 主表，不放 inventory。

### 1.2 道具 ID 命名規則

```
{category}_{name}_{variant}

範例：
  asc_fragment_{heroId}   英雄碎片（每英雄獨立）
  asc_class_power     力量型職業石
  asc_class_agility   敏捷型職業石
  asc_class_defense   防禦型職業石
  asc_class_universal 通用職業石
  chest_material      素材寶箱
  chest_exp           經驗寶箱
  currency_arena      競技幣
  currency_stardust   星塵
```

---

## 二、道具定義表

### ~~2.1 經驗素材~~（v2.4 已移除）

> **v2.4 移除**：exp_core_s / exp_core_m / exp_core_l 已全部移除。EXP 改為頂層資源（`save_data.exp`），與 gold / diamond 同級。詳見 `progression.md` §一。

### 2.2 突破素材

| itemId | 名稱 | 說明 |
|--------|------|------|
| `asc_fragment_{heroId}` | {英雄名}碎片 | 每個英雄獨立碎片，突破 + 升星用 |
| `asc_class_power` | 力量職業石 | 力量型英雄突破用 |
| `asc_class_agility` | 敏捷職業石 | 敏捷型英雄突破用 |
| `asc_class_defense` | 防禦職業石 | 防禦型英雄突破用 |
| `asc_class_universal` | 通用職業石 | 可替代任何職業石 |

### 2.3 寶箱

| itemId | 名稱 | 內容物 |
|--------|------|--------|
| `chest_material` | 素材寶箱 | 隨機職業石/經驗核心 |
| `chest_exp` | 經驗寶箱 | 隨機 3~5 個經驗核心（混合大小） |
| `chest_bronze` | 銅寶箱 | 低階隨機獎勵（金幣 + 少量素材） |
| `chest_silver` | 銀寶箱 | 中階隨機獎勵（金幣 + 鑽石 + 素材） |
| `chest_gold` | 金寶箱 | 高階隨機獎勵（大量金幣 + 鑽石 + 稀有素材） |

### 2.4 貨幣代幣

| itemId | 名稱 | 用途 |
|--------|------|------|
| `currency_arena` | 競技幣 | PvP 商店兌換英雄碎片/裝備 |
| `currency_stardust` | 星塵 | 抽卡商店兌換指定碎片/裝備 |
| `currency_boss` | Boss 幣 | Boss 戰商店兌換道具 || `pvp_coin` | PvP 競技幣 | PvP 競技場專屬貨幣，用於競技商店兑換（使用 `CurrencyIcon type="pvp_coin"` 顯示 🏅） |
### 2.5 裝備碎片（v2.7 新增）

| itemId | 名稱 | 說明 |
|--------|------|------|
| `equip_scrap` | 裝備碎片 | 分解裝備產出，可在碎片兌換商店兌換裝備/素材 |

---

## 三、Google Sheet 結構

### 3.1 Sheet: `inventory`（玩家可堆疊道具，一人多行）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵，對應 players |
| `itemId` | string | 道具 ID（見命名規則） |
| `quantity` | number | 數量（≥ 0，0 不刪行、下次增加時直接更新） |

### 3.2 裝備資料儲存（v2.0）

> **不再使用 `equipment_instances` Sheet**。
> 裝備資料存在 `save_data` 表的 `equipment` JSON 欄位中（見 `save-system.md`）。
> 結構為 `OwnedEquipment[]`，定義見 `progression.md` §四。

### 3.3 Sheet: `item_definitions`（道具定義表，開發者維護）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `itemId` | string | 主鍵 |
| `name` | string | 顯示名稱（中文） |
| `category` | string | 分類（見 §1.1） |
| `rarity` | string | `N` / `R` / `SR` / `SSR`（影響顯示框色） |
| `description` | string | 說明文字 |
| `icon` | string | 圖示檔名（未來用） |
| `stackLimit` | number | 單格堆疊上限（0=無限、-1=不可堆疊） |
| `useAction` | string | 使用效果 ID（空=不可直接使用） |
| `sellPrice` | number | 出售金幣價（0=不可賣） |

---

## 四、前端資料結構

```typescript
/** 可堆疊道具（定義於 saveService.ts） */
export interface InventoryItem {
  itemId: string
  quantity: number
}

/** 道具定義（從 item_definitions Sheet 載入） */
export interface ItemDefinition {
  itemId: string
  name: string
  category: ItemCategory
  rarity: 'N' | 'R' | 'SR' | 'SSR'
  description: string
  icon: string
  stackLimit: number
  useAction: string
  sellPrice: number
}

export type ItemCategory =
  | 'ascension_material'
  | 'general_material'
  | 'chest'
  | 'currency'
  // v2.4 移除: 'exp_material'（EXP 改為頂層資源）

/** 背包狀態（inventoryService 管理，僅可堆疊道具） */
export interface InventoryState {
  items: InventoryItem[]
  definitions: Map<string, ItemDefinition>
}
```

> **v2.0 移除**：`EquipmentInstance`、`SubStat`、`equipmentCapacity`、`equipment` 陣列。
> 裝備型別 `OwnedEquipment` / `EquipmentTemplate` 定義在 `progressionSystem.ts`，由 `save_data.equipment` JSON 管理。

---

## 五、背包容量

| 項目 | 上限 | 說明 |
|------|------|------|
| 可堆疊道具種類 | **無限** | 每種道具只佔一行，quantity 堆疊 |
| 裝備數量 | **無限** | v2.7 移除容量上限，不再顯示 X/Y 容量 |

> **v2.0 移除**：裝備容量限制（200/500 件）、擴容機制。裝備改為 `save_data.equipment` JSON，無上限問題。
>
> **v2.7 移除**：`equipmentCapacity` 欄位與 `expand-inventory` API 端點已完全棄用。背包 Header 不再顯示容量指示器（X/Y）。

---

## 六、背包載入流程

```
InventoryPanel mount
  ├─ getInventoryState() === null ?
  │   └─ YES → loadInventory()
  │             ├─ loadItemDefinitions()    ← GAS API (有記憶體快取)
  │             ├─ GAS API: load-inventory  ← 取得 items（可堆疊道具）
  │             ├─ localStorage 合併：若 local 數量 > server 則取 local（樂觀寫入尚未同步）
  │             └─ 組成 InventoryState → 存 localStorage → 通知監聽者
  └─ NO  → 使用快取的 InventoryState
```

> **v2.0 變更**：背包載入不再包含 `equipment` / `equipmentCapacity`。裝備資料由 `saveService` 的 `load-save` 獨立載入。

> **與 save 系統分離**：背包不在 `load-save` 中載入，由 `inventoryService` 獨立管理。

---

## 七、Service 層（inventoryService）

### 匯出函式（v2.0 精簡）

| # | 函式 | 說明 | API/Queue |
|---|------|------|-----------|
| 1 | `loadItemDefinitions(): Promise<Map<string, ItemDefinition>>` | 從 GAS 載入道具定義（有記憶體快取） | API `load-item-definitions` |
| 2 | `getItemDefinition(itemId): ItemDefinition \| undefined` | 從快取取得單個道具定義 | 純前端 |
| 3 | `loadInventory(): Promise<InventoryState>` | 載入背包（僅可堆疊道具），合併 localStorage | API `load-inventory` |
| 4 | `addItems(items): Promise<boolean>` | 批量增加道具 | API `add-items` |
| 5 | `removeItems(items): Promise<boolean>` | 批量消耗道具（不足則整筆失敗） | API `remove-items` |
| 6 | `sellItems(items): Promise<number>` | 出售道具換金幣 | API `sell-items` |
| 7 | `useItem(itemId, quantity, targetId?): Promise<{success, result?}>` | 使用道具（寶箱/經驗核心） | Optimistic Queue |
| 8 | `getItemQuantity(itemId): number` | 查詢某道具數量 | 純前端 |
| 9 | `filterItemsByCategory(category \| 'all'): InventoryItem[]` | 依分類篩選（'all' 回傳 qty>0） | 純前端 |
| 10 | `onInventoryChange(fn): () => void` | 訂閱背包變化，回傳 unsubscribe | 純前端 |
| 11 | `getInventoryState(): InventoryState \| null` | 取得當前記憶體中的背包狀態 | 純前端 |
| 12 | `addItemsLocally(items): void` | **不呼叫 API**，純前端樂觀新增（戰鬥掉落/抽卡碎片/信件獎勵） | 純前端 |
| 13 | `removeItemsLocally(items): void` | **不呼叫 API**，純前端樂觀扣除（升級/突破/升星素材扣除） | 純前端 |
| 14 | `clearInventoryCache(): void` | 清除記憶體 + localStorage 快取（登出時呼叫） | 純前端 |

> **v2.0 移除的函式**：`equipItem`、`unequipItem`、`lockEquipment`、`expandInventory`、`getHeroEquipment`、`getUnequippedEquipment`（裝備操作移至 `progressionService`）
>
> **v2.7 棄用**：`lockEquipment` — `/lock-equipment` API 端點已棄用，裝備實例上的 `locked` 欄位不再使用，背包 UI 不再顯示鎖定按鈕。

### addItemsLocally 細節

```typescript
function addItemsLocally(items: { itemId: string; quantity: number }[]): void
```

- 直接修改記憶體中的 `inventoryState.items`
- 若 `inventoryState` 為 `null`，自動建立最小狀態 `{ items: [], equipment: [], equipmentCapacity: 200, definitions: new Map() }`
- **不呼叫 API**，資料由 GAS 端在 `completeStage` / `gachaPull` 等 handler 中寫入 Sheet
- 用途 1：戰鬥勝利後的掉落物即時入帳
- 用途 2：抽卡重複英雄的碎片入帳
- 用途 3：信件獎勵領取（MailboxPanel `onRewardsClaimed`）

---

## 八、GAS 端點

### 已實作的 handler

| action | handler | 說明 |
|--------|---------|------|
| `load-item-definitions` | `handleLoadItemDefinitions_()` | 從 `item_definitions` Sheet 載入（有 CacheService 快取） |
| `load-inventory` | `handleLoadInventory_(params)` | 讀 `inventory` 可堆疊道具 |
| `add-items` | `handleAddItems_(params)` | 批量 `upsertItem_()` 增加 |
| `remove-items` | `handleRemoveItems_(params)` | 先全量檢查夠不夠，再批量扣除 |
| `sell-items` | `handleSellItems_(params)` | 扣道具 + 查 sellPrice + 加金幣到 `save_data.gold` |
| `use-item` | `handleUseItem_(params)` | 扣道具；偵測寶箱（chest_bronze/silver/gold）→ 呼叫 `generateChestRewards_(chestId, qty)` 生成獎勵 → 分配貨幣/道具 → 回傳 `{ used, quantity, result? }` |

> **v2.0 移除的端點**：`equip-item`、`unequip-item`、`lock-equipment`、`expand-inventory`（裝備操作移至 `save_data.equipment` JSON 直接更新）
>
> **v2.7 新增端點**：`/decompose-equipment` — 分解裝備，回收金幣 + 裝備碎片（`equip_scrap`）。
>
> **v2.7 棄用端點**：`/lock-equipment`（鎖定功能移除）、`/expand-inventory`（容量限制移除）。

### ✅ 已實作的商店端點

| action | handler | 說明 |
|--------|---------|------|
| `shop-buy` | `handleShopBuy_()` | 購買商品：扣貨幣 + 發放道具（GAS 驗證+冪等保護） |

> 商品定義目前由前端 `ShopPanel.tsx` 硬編碼（`SHOP_ITEMS` 常數），無需 `get-shop` API。
> `refresh-shop` 待每日刷新需求時再實作。

---

### 寶箱開啟機制（v2.2 新增）

GAS `generateChestRewards_(chestId, qty)` 依寶箱等級生成隨機獎勵：

| 寶箱 | 金幣範圍 | 鑽石 | 素材機率 | 稀有素材 |
|------|---------|------|---------|----------|
| chest_bronze | 低 | 無 | 普通 | 無 |
| chest_silver | 中 | 少量 | 普通~中級 | 低 |
| chest_gold | 高 | 中量 | 中級~高級 | 中 |

`handleUseItem_()` 偵測寶箱類道具 → 呼叫 `generateChestRewards_()` → 分配貨幣（gold/diamond 直接加到 save_data）+ 道具（upsertItem_ 加到 inventory）→ 回傳獎勵清單。

前端 InventoryPanel 解析回傳 `result.result` 顯示獎勵內容，並透過 `updateLocalCurrency()` 同步金幣/鑽石到本地 state。

---

## 九、InventoryPanel UI

### Props

```typescript
interface InventoryPanelProps {
  onBack: () => void
  heroesList?: RawHeroData[]   // 用於英雄碎片名稱解析
}
```

### 分頁（v2.5 更新為 6 個）

| key | icon | label | 內容 |
|-----|------|-------|------|
| `all` | 📦 | 全部 | 所有道具 + 裝備 |
| `equipment` | ⚔️ | 裝備 | 裝備實例（已裝備排前 + 稀有度排序） |
| `ascension_material` | 🔥 | 突破 | 英雄碎片 + 職業石 |
| `general_material` | 🧪 | 素材 | 強化石、其他素材 |
| `chest` | 🎁 | 寶箱 | 裝備寶箱、銅/銀/金寶箱 |
| `currency` | `CurrencyIcon(gold)` | 貨幣 | 競技幣、星塵等非主貨幣 |

> **v2.0 移除的分頁**：`equipment_material`、`forge_material`、`equipment`（裝備管理移至專屬裝備面板）

### 排序功能（✅ 已實作）

```typescript
type SortMode = 'default' | 'rarity-desc' | 'quantity-desc' | 'name-asc'
```

| 排序模式 | 說明 |
|---------|------|
| `default` | 原始順序 |
| `rarity-desc` | 稀有度由高到低（SSR → N） |
| `quantity-desc` | 數量由多到少 |
| `name-asc` | 名稱 A-Z |

> ⬜ **缺少的分頁**：~~`forge_material`、`general_material`、`currency` 尚無對應 Tab~~（✅ 已新增）

### ✅ 已實作的 UI 操作

| 功能 | 說明 |
|------|------|
| 容量顯示 | ~~Header 顯示 `{equipment.length}/{equipmentCapacity} 裝備`~~（v2.0 移除） |
| 金幣/鑽石 Header | 顯示 `<CurrencyIcon type="gold"/>` + `<CurrencyIcon type="diamond"/>` （CSS badge，非 emoji） |
| 點擊查看 | 點擊道具 → ItemDetail 彈窗（名稱、稀有度、描述、數量、出售價格） |
| 英雄碎片辨識 | `asc_fragment_{heroId}` 自動顯示英雄縮圖 + 🧩 角標 + 英雄名稱中文（`resolveFallbackName` 優先於 DB 定義） |
| 使用按鈕 | 寶箱開啟 / 經驗核心升級（依 item.useAction 判斷） |
| 寶箱開啟結果 | 寶箱使用後顯示獎勵內容（金幣/鑽石/道具），透過 `updateLocalCurrency()` 同步前端貨幣 |
| 出售按鈕 | 道具換金幣（顯示價格 + 確認） |
| 裝備按鈕 | 裝備詳情中 equip/unequip 操作（彈出英雄選擇 popup，顯示實際英雄名） |
| 分解按鈕 | 裝備詳情中分解操作（呼叫 `/decompose-equipment`），回收金幣 + 裝備碎片（`equip_scrap`） |
| 強化按鈕 | 裝備詳情中直接強化（v2.7 新增，不必進入英雄詳情頁即可強化裝備） |
| 排序功能 | 4 種排序模式（default / rarity-desc / quantity-desc / name-asc） |
| 6 個分類 Tab | 全部 / 裝備 / 突破 / 素材 / 寶箱 / 貨幣（「全部」含裝備） |
| ~~鎖定按鈕~~ | ~~v2.7 移除：裝備鎖定功能已棄用，`locked` 欄位不再使用~~ |

### ⚠️ 尚未實作的 UI 操作

| 操作 | 狀態 |
|------|------|
| 批量出售 | ❌ 未實作（單件出售已實作） |
| 批量使用 | ❌ 未實作 |

---

## 十、與其他系統的交互

### 10.1 養成系統 (`progression.md`)

```
升級英雄：消耗 save_data.exp（EXP 頂層資源）→ hero.level 提升
突破英雄：inventory 扣除 asc_fragment + asc_class_* + gold → hero.ascension 提升
升星英雄：inventory 扣除 asc_fragment → hero.stars 提升
裝備強化：只消耗金幣（不經過背包） → equipment.enhanceLevel 提升
裝備抽卡：消耗金幣/鑽石 → save_data.equipment 新增 OwnedEquipment
```

### 10.2 關卡系統 (`stage-system.md`)

```
通關結算 → addItemsLocally() 入帳掉落物 → GAS handler 同步寫入 Sheet
每日副本 → addItemsLocally() 入帳職業石/強化石
```

### 10.3 抽卡系統 (`gacha.md`)

```
抽到重複英雄 → addItemsLocally() 入帳碎片 + 星塵
```

### 10.4 信件系統 (`mailbox.md`)

```
領取信件獎勵 → 非貨幣獎勵走 addItemsLocally() 入帳
```

---

## 十一、商店系統（✅ 購買已實作）

### 商店分類

| 商店 | 貨幣 | 商品 | 刷新 |
|------|------|------|------|
| 雜貨商店 | 金幣 | EXP 資源、職業石 | 每日 6 個 |
| 競技商店 | 競技幣 | 指定英雄碎片（輪替）、SSR 裝備（每週輪替 2 件） | 每週 |
| Boss 商店 | Boss 幣 | 職業石 | 每週 |
| 鑽石商店 | 鑽石 | 素材寶箱 | 常駐 |
| 碎片兌換 | 裝備碎片 | 裝備/素材 | 常駐 || **競技商店（arena）** | **pvp_coin** | **EXP/金幣/鑽石/職業石/裝備寶箱/英雄券** | **常駐** |
### 碎片兌換商店（v2.7 新增）

以分解裝備所得的裝備碎片（`equip_scrap`，存於 inventory 表）兌換裝備與素材。商店面板中新增「碎片兌換」分頁。

> 後端處理：`workers/src/routes/inventory.ts` SHOP_CATALOG 中 `scrap` 分類，扣除來源為 inventory 表的 `equip_scrap` 行。
### 競技商店（arena）（v2.8 新增）

以 PvP 競技場獲得的 `pvp_coin` 兑換資源與道具。商店面板新增「競技商店」分頁（`ShopPanel.tsx` 中 `arena` category）。

| 商品 ID | 名稱 | pvp_coin 價格 | 產出 |
|----------|------|------------|------|
| `arena_exp_3000` | EXP ×3,000 | 10 | save_data.exp |
| `arena_gold_20k` | 金幣 ×20,000 | 15 | save_data.gold |
| `arena_diamond_30` | 鑽石 ×30 | 25 | save_data.diamond |
| `arena_class_universal` | 通用職業石 ×2 | 20 | inventory asc_class_universal |
| `arena_chest_equip` | 裝備寶箱 ×1 | 30 | inventory chest_equipment |
| `arena_ticket_hero` | 英雄召喚券 ×1 | 40 | inventory gacha_ticket_hero |

> 後端處理：`workers/src/routes/inventory.ts` SHOP_CATALOG 新增 `arena` 分類，扣除 inventory 表中的 `pvp_coin` 行。價格使用 `<CurrencyIcon type="pvp_coin" />` 顯示。
### 星塵兌換商店（v2.4 新增）

以抽卡重複產生的星塵（`currency_stardust`，存於 inventory 表）兌換資源與道具。

| 商品 | 星塵價格 | 說明 |
|------|----------|------|
| EXP × 5,000 | 10☆ | 直接加到 save_data.exp |
| Gold × 50,000 | 15☆ | 直接加到 save_data.gold |
| 通用職業石 × 2 | 20☆ | asc_class_universal |
| 大型強化石 × 3 | 25☆ | enhance_l |
| 金寶箱 × 1 | 50☆ | chest_gold |
| Diamond × 100 | 80☆ | 直接加到 save_data.diamond |

> 後端處理：`workers/src/routes/inventory.ts` SHOP_CATALOG 中 `stardust` 分類，扣除來源為 inventory 表的 `currency_stardust` 行。

---

## 擴展點

- [x] **UI 操作按鈕**：使用/出售（✅ 已完成）
- [x] **排序功能**：4 種排序模式（✅ 已完成）
- [x] **金幣/鑽石 Header 顯示**（✅ 已完成）
- [x] **商店系統 — 購買**：`shop-buy` API + `ShopPanel.tsx` UI（4 分類商品）
- [ ] **商店系統 — 動態刷新**：伺服器端商品定義 + 每日/每週刷新 API
- [ ] **批量出售**：長按多選
- [ ] **批量使用**：素材批量使用
- [ ] **道具合成**：低級素材合成高級（如 3×小型經驗核心 → 1×中型經驗核心）
- [x] **收藏圖鑑**：裝備圖鑑百科（✅ 已完成，v2.7 移除收集進度追蹤）
- [ ] **裝備分解功能**：批量分解（目前僅支援單件分解）

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-27 | 初版：道具分類（8 類）、ID 命名規則、三表結構、背包 UI、容量機制、11 個 API 端點、商店系統、與養成/關卡/抽卡的交互定義 |
| v0.2 | 2026-02-28 | 全面採用 Optimistic Queue（equip/unequip/lock/expand/useItem）、localStorage 快取、local/server 合併策略、新增 `addItemsLocally()`、英雄碎片縮圖 |
| v1.0 | 2026-03-01 | 全面同步實作：修正 InventoryState 型別（含 equipmentCapacity/definitions）、補齊 18 個 Service 匯出函式簽名、10 個 GAS handler、UI 6 分頁對照（缺 forge/general/currency）、未實作操作完整列表、addItemsLocally 用途場景（戰鬥/抽卡/信件）、背包獨立載入流程、裝備同 slot 自動卸下行為、商店系統標示為未實作 |
| v1.1 | 2026-02-28 | UI 全面強化：分類 Tab 擴充至 9 個、排序功能 4 種模式、使用/出售/鎖定按鈕、裝備詳情彈窗、金幣鑽石 Header 顯示 |
| v1.2 | 2026-02-28 | 統一 icon 系統：Header 金幣/鑽石改用 `CurrencyIcon` CSS badge、出售按鈕金幣 icon 統一、貨幣分類 Tab icon 改用 CSS badge、移除散落 emoji |
| v1.3 | 2026-03-01 | **Spec 同步**：匯出函式 18→20（新增 `removeItemsLocally` + `clearInventoryCache`）；商店狀態更新為已實作（GAS `handleShopBuy_()` + 前端 `ShopPanel.tsx`） |
| v2.0 | 2026-06-15 | **配合裝備模板制 v2 大改版**：移除分類 `equipment_material` / `forge_material` / `equipment`；移除 `equipment_instances` Sheet（裝備改存 `save_data.equipment` JSON）；移除背包容量/擴容機制；Service 函式 20→14（移除 equip/unequip/lock/expand/getHeroEquipment/getUnequippedEquipment）；GAS 端點 10→6；UI Tab 9→6；移除所有 forge/dismantle/enhance stone/reroll 相關道具定義；商店更新（競技/星塵商店新增 SSR 裝備） |
| v2.1 | 2026-03-01 | **裝備寶箱開啟**：`useItem` 新增 `extra` 參數支援傳遞裝備資料；`InventoryPanel.handleUse` 偵測 `chest_equipment` → `openEquipmentChest()` 本地生成裝備 + `addEquipmentLocally` + acquireToast；GAS `handleUseItem_` 支援 chest_equipment 裝備持久化；Google Sheet item_definitions 新增 `chest_equipment` 行（SR / useAction:open）+ 全寶箱加 `useAction` 欄 |
| v2.2 | 2026-03-02 | **寶箱三階開啟 + 背包裝備穿脫**：①GAS `generateChestRewards_(chestId, qty)` 支援 bronze/silver/gold 三階寶箱獎勵生成；`handleUseItem_` 偵測 chest 類道具自動呼叫獎勵生成 + 分配貨幣/道具；前端 InventoryPanel 顯示寶箱開啟結果 + `updateLocalCurrency()` 同步金幣/鑽石 ②InventoryPanel 新增 equip/unequip 按鈕（EquipmentDetail 彈窗）；英雄選擇 popup 顯示實際英雄名稱；使用 `equipItem`/`unequipItem`/`getHeroEquipment` 服務 ③`ITEM_ICONS`/`ITEM_NAMES` 新增 chest_bronze/chest_silver/chest_gold |
| v2.3 | 2026-03-02 | **商店/寶箱/道具詳情優化**：①移除裝備商店分頁（與裝備銻造重複），商店從 4 分頁縮為 3 分頁（每日/素材/特殊）；後端同步移除 `equip_chest` 商品 ②修復寶箱無法開啟問題：`load-item-definitions` API 解析 `extra` JSON 合併 `useAction`/`category` 等欄位到回傳結果，寶箱等道具現在正確顯示「開啟」按鈕 ③新增 `ItemInfoPopup` 共用元件，簽到預覽和商店道具支援點擊查看詳細資訊（名稱/稀有度/說明） |
| v2.4 | 2026-03-02 | **EXP 資源重構 + 星塵兌換商店**：①移除 exp_core_s/m/l 道具（EXP 改為頂層資源 save_data.exp）；移除 exp_material 分類 ②移除重洗石 eqm_reroll（ShopPanel / Workers SHOP_CATALOG / ItemInfoPopup / constants/rarity.ts） ③新增星塵兌換商店（§十一補充）：6 種商品以 currency_stardust 兌換（exp×5000/gold×50k/通用職業石×2/大型強化石×3/金寶箱/diamond×100） ④InventoryPanel TABS 補回 equipment 分頁 |
| v2.5 | 2026-03-03 | **背包 UI 改善**：①「全部」分頁同時顯示道具+裝備（原只顯示道具） ②英雄碎片名稱修復：`asc_fragment_X` 一律用 `resolveFallbackName()`（英雄名+碎片），不被 DB 定義的原始 key 覆蓋 ③裝備「使用中」稀有度視覺：外框光暈+徽章顏色跟隨稀有度色 ④分頁更新為 6 個（全部/裝備/突破/素材/寶箱/貨幣），「通用」改名「素材」 |
| v2.6 | 2026-03-03 | **裝備圖鑑系統**：①背包新增「📖 圖鑑」tab（第 7 個分頁）②新建 `CodexPanel.tsx`，可擴展 `CodexCategory` 聯合型別（目前 'equipment'，預留 hero/monster/achievement）③EquipmentCodex 子元件：128 種裝備百科（8 套裝 × 4 部位 × 4 稀有度）、收集進度條、套裝效果卡（2pc/4pc）、稀有度篩選、擁有/鎖定卡片視覺 ④匯出 equipmentGacha 常數（SET_IDS/SLOTS/SLOT_MAIN_STAT/MAIN_STAT_BASE）⑤App.css 新增 `.codex-*` 全套樣式 ~200 行含 RWD |
| v2.7 | 2026-06-19 | **背包功能強化**：①圖鑑面板移除收集進度追蹤（無進度條/X÷Y 計數），所有裝備項目一律顯示不再灰顯 ②背包容量上限完全移除，Header 不再顯示 X/Y 容量（`equipmentCapacity` 欄位 + `expand-inventory` API 棄用）③新增裝備分解功能：`/decompose-equipment` API 端點，回收金幣＋裝備碎片（`equip_scrap`）；商店面板新增「碎片兌換」分頁 ④裝備鎖定功能移除：`/lock-equipment` API 棄用、`locked` 欄位不再使用、UI 移除鎖定按鈕 ⑤裝備可直接從背包裝備詳情彈窗中強化（不必進入英雄詳情頁） || v2.8 | 2026-03-05 | **競技商店 + pvp_coin 貨幣**：①新增 `pvp_coin` 貨幣定義（§2.4），使用 `CurrencyIcon type="pvp_coin"` 顯示（🏅）②商店系統新增「競技商店」分類（6 項商品：arena_exp_3000/arena_gold_20k/arena_diamond_30/arena_class_universal/arena_chest_equip/arena_ticket_hero，以 pvp_coin 定價）③後端 `inventory.ts` SHOP_CATALOG 新增 `arena` 分類④`ShopPanel.tsx` 新增「競技商店」分頁 |