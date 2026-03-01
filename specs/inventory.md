# 背包與道具系統 Spec

> 版本：v1.3 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 負賬角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

統一管理所有可堆疊道具、消耗品、素材、裝備的儲存與使用。
背包是玩家的核心資源中心，所有養成系統（升級/突破/升星/裝備強化/鑫造）的素材消耗都從背包扣除。

UI 已全面實作：9 個分類 Tab、排序功能、4 種排序模式、使用/出售按鈕、裝備詳情彈窗、金幣鉇石 Header。

## 依賴

- `specs/save-system.md` — `save_data.equipmentCapacity` 欄位
- `specs/progression.md` — 消耗素材定義（經驗核心/碎片/職業石/強化石等）
- `specs/gacha.md` — 星塵貨幣、抽卡產出
- `specs/stage-system.md` — 關卡掉落物
- `specs/hero-schema.md` — 英雄 HeroID 對應碎片

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/services/inventoryService.ts` | Service 層 — 20 個匯出函式 |
| `src/components/InventoryPanel.tsx` | UI — 6 分頁背包 + ItemDetail 彈窗 |
| `src/domain/progressionSystem.ts` | EquipmentInstance / EquipmentSlot / SubStat 型別定義 |
| `src/services/saveService.ts` | InventoryItem 型別定義 |
| `gas/程式碼.js` | GAS Handler — 10 個 inventory 端點 |

---

## 一、道具分類

### 1.1 分類總覽

| 類別 | category | 可堆疊 | 說明 |
|------|----------|--------|------|
| 經驗素材 | `exp_material` | ✅ | 消耗以升級英雄等級 |
| 突破素材 | `ascension_material` | ✅ | 英雄突破用（碎片 + 職業石） |
| 裝備素材 | `equipment_material` | ✅ | 強化石、重洗石 |
| 鍛造素材 | `forge_material` | ✅ | 鍛造圖紙 + 鍛造原料 |
| 通用素材 | `general_material` | ✅ | 各類可交換/合成的材料 |
| 裝備 | `equipment` | ❌ | 每件獨立（有副屬性/強化等級），不可堆疊 |
| 寶箱 / 禮包 | `chest` | ✅ | 開啟後獲得隨機道具 |
| 貨幣代幣 | `currency` | ✅ | 競技幣、星塵等非主貨幣 |

> **金幣（gold）和鑽石（diamond）** 儲存在 `save_data` 主表，不放 inventory。

### 1.2 道具 ID 命名規則

```
{category}_{name}_{variant}

範例：
  exp_core_s          小型經驗核心
  exp_core_m          中型經驗核心
  exp_core_l          大型經驗核心
  asc_fragment_{heroId}   英雄碎片（每英雄獨立）
  asc_class_power     力量型職業石
  asc_class_agility   敏捷型職業石
  asc_class_defense   防禦型職業石
  asc_class_universal 通用職業石
  eqm_enhance_s       小型強化石
  eqm_enhance_m       中型強化石
  eqm_enhance_l       大型強化石
  eqm_reroll          重洗石
  forge_blueprint_{setId}_{slot}   鍛造圖紙
  forge_ore_common    普通鍛造礦
  forge_ore_rare      稀有鍛造礦
  forge_ore_epic      史詩鍛造礦
  chest_equipment     裝備寶箱
  chest_material      素材寶箱
  currency_arena      競技幣
  currency_stardust   星塵
```

---

## 二、道具定義表

### 2.1 經驗素材

| itemId | 名稱 | 經驗值 | 來源 |
|--------|------|--------|------|
| `exp_core_s` | 小型經驗核心 | 100 | 主線掉落、資源計時器、每日副本 |
| `exp_core_m` | 中型經驗核心 | 500 | 主線後期、每日副本（中/高級） |
| `exp_core_l` | 大型經驗核心 | 2,000 | 爬塔獎勵（每10層）、Boss 戰 |

### 2.2 突破素材

| itemId | 名稱 | 說明 |
|--------|------|------|
| `asc_fragment_{heroId}` | {英雄名}碎片 | 每個英雄獨立碎片，突破 + 升星用 |
| `asc_class_power` | 力量職業石 | 力量型英雄突破用 |
| `asc_class_agility` | 敏捷職業石 | 敏捷型英雄突破用 |
| `asc_class_defense` | 防禦職業石 | 防禦型英雄突破用 |
| `asc_class_universal` | 通用職業石 | 可替代任何職業石 |

### 2.3 裝備素材

| itemId | 名稱 | 說明 |
|--------|------|------|
| `eqm_enhance_s` | 小型強化石 | 強化裝備用（提供 50 強化經驗） |
| `eqm_enhance_m` | 中型強化石 | 強化裝備用（提供 200 強化經驗） |
| `eqm_enhance_l` | 大型強化石 | 強化裝備用（提供 800 強化經驗） |
| `eqm_reroll` | 重洗石 | 重新隨機裝備副屬性（條數不變） |

### 2.4 鍛造素材

| itemId | 名稱 | 說明 |
|--------|------|------|
| `forge_blueprint_{setId}_{slot}` | 鍛造圖紙 | 指定套裝+格位，Boss/關卡掉落 |
| `forge_ore_common` | 普通鍛造礦 | 鍛造 R 級裝備用 |
| `forge_ore_rare` | 稀有鍛造礦 | 鍛造 SR 級裝備用 |
| `forge_ore_epic` | 史詩鍛造礦 | 鍛造 SSR 級裝備用 |

### 2.5 寶箱

| itemId | 名稱 | 內容物 |
|--------|------|--------|
| `chest_equipment` | 裝備寶箱 | 隨機 1 件 R~SSR 裝備 |
| `chest_material` | 素材寶箱 | 隨機強化石/鍛造礦/職業石 |
| `chest_exp` | 經驗寶箱 | 隨機 3~5 個經驗核心（混合大小） |

### 2.6 貨幣代幣

| itemId | 名稱 | 用途 |
|--------|------|------|
| `currency_arena` | 競技幣 | PvP 商店兌換英雄碎片/道具 |
| `currency_stardust` | 星塵 | 抽卡商店兌換指定碎片 |
| `currency_boss` | Boss 幣 | Boss 戰商店兌換裝備圖紙/素材 |

---

## 三、Google Sheet 結構

### 3.1 Sheet: `inventory`（玩家可堆疊道具，一人多行）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵，對應 players |
| `itemId` | string | 道具 ID（見命名規則） |
| `quantity` | number | 數量（≥ 0，0 不刪行、下次增加時直接更新） |

### 3.2 Sheet: `equipment_instances`（玩家裝備實例，一件一行）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 外鍵 |
| `equipId` | string | 唯一 ID `{playerId}_EQ_{timestamp}` |
| `templateId` | string | 對應 `equipment_templates.templateId` |
| `setId` | string | 套裝 ID（空字串=無套裝） |
| `slot` | string | `weapon` / `armor` / `ring` / `boots` |
| `rarity` | string | `N` / `R` / `SR` / `SSR` |
| `mainStat` | string | 主屬性名稱（`ATK` / `HP` / `DEF` / `CritRate` / `CritDmg` / `SPD`） |
| `mainStatValue` | number | 主屬性基礎值 |
| `enhanceLevel` | number | 強化等級（0 ~ maxLevel） |
| `subStats` | string | 副屬性 JSON `[{"stat":"ATK","value":15,"isPercent":false}, ...]` |
| `equippedBy` | string | 裝備在哪個 heroInstanceId（空=背包中） |
| `locked` | boolean | 鎖定防拆解 |
| `obtainedAt` | string | 獲得時間 |

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
  | 'exp_material'
  | 'ascension_material'
  | 'equipment_material'
  | 'forge_material'
  | 'general_material'
  | 'equipment'
  | 'chest'
  | 'currency'

/** 裝備實例（定義於 domain/progressionSystem.ts） */
export interface EquipmentInstance {
  equipId: string
  templateId: string
  setId: string
  slot: EquipmentSlot
  rarity: Rarity
  mainStat: string
  mainStatValue: number
  enhanceLevel: number
  subStats: SubStat[]
  equippedBy: string       // heroInstanceId or ''
  locked: boolean
  obtainedAt: string
}

export type EquipmentSlot = 'weapon' | 'armor' | 'ring' | 'boots'
export type Rarity = 'N' | 'R' | 'SR' | 'SSR'

export interface SubStat {
  stat: string
  value: number
  isPercent: boolean
}

/** 背包完整狀態（inventoryService 管理） */
export interface InventoryState {
  items: InventoryItem[]
  equipment: EquipmentInstance[]
  equipmentCapacity: number
  definitions: Map<string, ItemDefinition>
}
```

---

## 五、背包容量

| 項目 | 上限 | 說明 |
|------|------|------|
| 可堆疊道具種類 | **無限** | 每種道具只佔一行，quantity 堆疊 |
| 裝備數量 | **200 件** | 超過需拆解/回收（可擴容） |
| 擴容方式 | 每 50 格 = 100 鑽石 | 最多擴到 500 件 |

```typescript
const EQUIPMENT_SLOT_BASE = 200
const EQUIPMENT_SLOT_EXPAND = 50
const EQUIPMENT_SLOT_COST = 100     // 鑽石
const EQUIPMENT_SLOT_MAX = 500
```

---

## 六、背包載入流程

```
InventoryPanel mount
  ├─ getInventoryState() === null ?
  │   └─ YES → loadInventory()
  │             ├─ loadItemDefinitions()    ← GAS API (有記憶體快取)
  │             ├─ GAS API: load-inventory  ← 取得 items + equipment + equipmentCapacity
  │             ├─ 解析 equipment.subStats (JSON string → object)
  │             ├─ localStorage 合併：若 local 數量 > server 則取 local（樂觀寫入尚未同步）
  │             └─ 組成 InventoryState → 存 localStorage → 通知監聽者
  └─ NO  → 使用快取的 InventoryState
```

> **與 save 系統分離**：背包不在 `load-save` 中載入，由 `inventoryService` 獨立管理。

---

## 七、Service 層（inventoryService）

### 20 個匯出函式

| # | 函式 | 說明 | API/Queue |
|---|------|------|-----------|
| 1 | `loadItemDefinitions(): Promise<Map<string, ItemDefinition>>` | 從 GAS 載入道具定義（有記憶體快取） | API `load-item-definitions` |
| 2 | `getItemDefinition(itemId): ItemDefinition \| undefined` | 從快取取得單個道具定義 | 純前端 |
| 3 | `loadInventory(): Promise<InventoryState>` | 載入完整背包，合併 localStorage | API `load-inventory` |
| 4 | `addItems(items): Promise<boolean>` | 批量增加道具 | API `add-items` |
| 5 | `removeItems(items): Promise<boolean>` | 批量消耗道具（不足則整筆失敗） | API `remove-items` |
| 6 | `sellItems(items): Promise<number>` | 出售道具換金幣 | API `sell-items` |
| 7 | `useItem(itemId, quantity, targetId?): Promise<{success, result?}>` | 使用道具（寶箱/經驗核心） | Optimistic Queue |
| 8 | `equipItem(equipId, heroInstanceId): Promise<boolean>` | 裝備到英雄（同 slot 自動卸下舊裝） | Optimistic Queue |
| 9 | `unequipItem(equipId): Promise<boolean>` | 卸下裝備 | Optimistic Queue |
| 10 | `lockEquipment(equipId, locked): Promise<boolean>` | 鎖定/解鎖裝備 | Optimistic Queue |
| 11 | `expandInventory(): Promise<number>` | 擴容 +50（扣 100 鑽石） | Optimistic Queue |
| 12 | `getItemQuantity(itemId): number` | 查詢某道具數量 | 純前端 |
| 13 | `getHeroEquipment(heroInstanceId): EquipmentInstance[]` | 取得某英雄已裝備列表 | 純前端 |
| 14 | `getUnequippedEquipment(): EquipmentInstance[]` | 取得所有未裝備的裝備 | 純前端 |
| 15 | `filterItemsByCategory(category \| 'all'): InventoryItem[]` | 依分類篩選（'all' 回傳 qty>0） | 純前端 |
| 16 | `onInventoryChange(fn): () => void` | 訂閱背包變化，回傳 unsubscribe | 純前端 |
| 17 | `getInventoryState(): InventoryState \| null` | 取得當前記憶體中的背包狀態 | 純前端 |
| 18 | `addItemsLocally(items): void` | **不呼叫 API**，純前端樂觀新增（戰鬥掉落/抽卡碎片/信件獎勵） | 純前端 |
| 19 | `removeItemsLocally(items): void` | **不呼叫 API**，純前端樂觀扣除（升級/突破/升星素材扣除） | 純前端 |
| 20 | `clearInventoryCache(): void` | 清除記憶體 + localStorage 快取（登出時呼叫） | 純前端 |

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

### 已實作的 10 個 handler

| action | handler | 說明 |
|--------|---------|------|
| `load-item-definitions` | `handleLoadItemDefinitions_()` | 從 `item_definitions` Sheet 載入（有 CacheService 快取） |
| `load-inventory` | `handleLoadInventory_(params)` | 讀 `inventory` + `equipment_instances` + `save_data.equipmentCapacity` |
| `add-items` | `handleAddItems_(params)` | 批量 `upsertItem_()` 增加 |
| `remove-items` | `handleRemoveItems_(params)` | 先全量檢查夠不夠，再批量扣除 |
| `sell-items` | `handleSellItems_(params)` | 扣道具 + 查 sellPrice + 加金幣到 `save_data.gold` |
| `use-item` | `handleUseItem_(params)` | 扣道具，回傳 `{ used, quantity }`（簡化版） |
| `equip-item` | `handleEquipItem_(params)` | 設定 `equippedBy`，**同英雄同 slot 舊裝備自動卸下** |
| `unequip-item` | `handleUnequipItem_(params)` | 清空 `equippedBy` |
| `lock-equipment` | `handleLockEquipment_(params)` | 設定 `locked` |
| `expand-inventory` | `handleExpandInventory_(params)` | +50 容量、扣 100 鑽石、上限 500 |

### ⚠️ 未實作的端點

| 設計中 | 說明 |
|--------|------|
| `add-equipment` | 新增裝備實例 — 目前由鍛造/掉落/抽卡等 handler 內部建立 |
| `remove-equipment` | 拆解裝備 — 由 `dismantle-equipment`（progressionService）處理 |

### ✅ 已實作的商店端點

| action | handler | 說明 |
|--------|---------|------|
| `shop-buy` | `handleShopBuy_()` | 購買商品：扣貨幣 + 發放道具（GAS 驗證+冪等保護） |

> 商品定義目前由前端 `ShopPanel.tsx` 硬編碼（`SHOP_ITEMS` 常數），無需 `get-shop` API。
> `refresh-shop` 待每日刷新需求時再實作。

---

## 九、InventoryPanel UI

### Props

```typescript
interface InventoryPanelProps {
  onBack: () => void
  heroesList?: RawHeroData[]   // 用於英雄碎片名稱解析
}
```

### 分頁（9 個）

| key | icon | label |
|-----|------|-------|
| `all` | 📦 | 全部 |
| `exp_material` | 📗 | 經驗 |
| `ascension_material` | 🔥 | 突破 |
| `equipment_material` | 🔧 | 裝備素材 |
| `forge_material` | ⚒️ | 鑫造 |
| `general_material` | 🧪 | 通用 |
| `equipment` | 🗡️ | 裝備 |
| `chest` | 🎁 | 寶箱 |
| `currency` | `CurrencyIcon(gold)` | 貨幣 |

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
| 容量顯示 | Header 顯示 `{equipment.length}/{equipmentCapacity} 裝備` |
| 金幣/鑽石 Header | 顯示 `<CurrencyIcon type="gold"/>` + `<CurrencyIcon type="diamond"/>` （CSS badge，非 emoji） |
| 點擊查看 | 點擊道具 → ItemDetail 彈窗（名稱、稀有度、描述、數量、出售價格） |
| 英雄碎片辨識 | `asc_fragment_{heroId}` 自動顯示英雄縮圖 + 🧩 角標 |
| 使用按鈕 | 寶箱開啟 / 經驗核心升級（依 item.useAction 判斷） |
| 出售按鈕 | 道具換金幣（顯示價格 + 確認） |
| 鎖定按鈕 | 裝備鎖定/解鎖（防拆解） |
| 裝備詳情 | 裝備樣式彈窗：主屬性 + 副屬性 + 強化等級 + 套裝名 |
| 排序功能 | 4 種排序模式（default / rarity-desc / quantity-desc / name-asc） |
| 9 個分類 Tab | 新增 forge_material、general_material、currency 3 個 Tab |

### ⚠️ 尚未實作的 UI 操作

| 操作 | 狀態 |
|------|------|
| 批量出售 | ❌ 未實作（單件出售已實作） |
| 批量使用 | ❌ 未實作 |
| 擴容入口 | ❌ 未實作（僅顯示容量） |

---

## 十、與其他系統的交互

### 10.1 養成系統 (`progression.md`)

```
升級英雄：inventory 扣除 exp_core_* → hero.level 提升
突破英雄：inventory 扣除 asc_fragment + asc_class_* + gold → hero.ascension 提升
升星英雄：inventory 扣除 asc_fragment → hero.stars 提升
裝備強化：inventory 扣除 eqm_enhance_* + gold → equipment.enhanceLevel 提升
裝備重洗：inventory 扣除 eqm_reroll → equipment.subStats 重隨機
鍛造裝備：inventory 扣除 forge_blueprint_* + forge_ore_* + gold → equipment_instances 新增
拆解裝備：equipment_instances 刪行 → inventory 增加 eqm_enhance_* + gold
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

### 商店分類（規劃）

| 商店 | 貨幣 | 商品 | 刷新 |
|------|------|------|------|
| 雜貨商店 | 金幣 | 小/中型強化石、重洗石、經驗核心 | 每日 6 個 |
| 競技商店 | 競技幣 | 指定英雄碎片（輪替）、鍛造礦 | 每週 |
| 星塵商店 | 星塵 | 指定英雄碎片（永久） | 不刷新 |
| Boss 商店 | Boss 幣 | 鍛造圖紙、大型強化石、稀有鍛造礦 | 每週 |
| 鑽石商店 | 鑽石 | 素材寶箱、背包擴容 | 常駐 |

---

## 擴展點

- [x] **UI 操作按鈕**：使用/出售/鎖定（✅ 已完成）
- [x] **排序功能**：4 種排序模式（✅ 已完成）
- [x] **缺少的分頁**：forge_material / general_material / currency Tab（✅ 已完成）
- [x] **裝備詳情面板**：獨立於一般道具的裝備資訊（✅ 已完成）
- [x] **金幣/鉇石 Header 顯示**（✅ 已完成）
- [x] **商店系統 — 購買**：`shop-buy` API + `ShopPanel.tsx` UI（4 分類商品）
- [ ] **商店系統 — 動態刷新**：伺服器端商品定義 + 每日/每週刷新 API
- [ ] **批量出售**：長按多選
- [ ] **批量使用**：素材批量使用
- [ ] **道具合成**：低級素材合成高級（如 3×小型強化石 → 1×中型強化石）
- [ ] **禮物系統**：玩家之間贈送道具
- [ ] **公會倉庫**：公會共享道具池
- [ ] **限時道具**：活動限定道具有效期限
- [ ] **自動分解規則**：設定「N 級裝備自動拆解」
- [ ] **收藏圖鑑**：蒐集所有道具/裝備獲得獎勵

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
