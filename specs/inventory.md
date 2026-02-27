# 背包與道具系統 Spec

> 版本：v0.1 ｜ 狀態：🟡 草案
> 最後更新：2026-02-27
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

統一管理所有可堆疊道具、消耗品、素材、裝備的儲存與使用。
背包是玩家的核心資源中心，所有養成系統（升級/突破/升星/裝備強化/鍛造）的素材消耗都從背包扣除。

## 依賴

- `specs/save-system.md` — `inventory` Sheet 結構、`/load-save` API
- `specs/progression.md` — 消耗素材定義（經驗核心/碎片/職業石/強化石/重洗石/鍛造圖紙）
- `specs/gacha.md` — 星塵貨幣、抽卡產出
- `specs/stage-system.md` — 關卡掉落物
- `specs/hero-schema.md` — 英雄 HeroID 對應碎片

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

> 裝備是獨立物件（有屬性/強化等級），不存 inventory，存 `equipment_instances`。

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
/** 可堆疊道具（素材/貨幣/寶箱） */
interface InventoryItem {
  itemId: string
  quantity: number
}

/** 道具定義（從 item_definitions Sheet 載入） */
interface ItemDefinition {
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

type ItemCategory =
  | 'exp_material'
  | 'ascension_material'
  | 'equipment_material'
  | 'forge_material'
  | 'general_material'
  | 'equipment'
  | 'chest'
  | 'currency'

/** 裝備實例（從 equipment_instances Sheet 載入） */
interface EquipmentInstance {
  equipId: string
  templateId: string
  setId: string
  slot: EquipmentSlot
  rarity: 'N' | 'R' | 'SR' | 'SSR'
  mainStat: string
  mainStatValue: number
  enhanceLevel: number
  subStats: SubStat[]
  equippedBy: string       // heroInstanceId or ''
  locked: boolean
  obtainedAt: string
}

type EquipmentSlot = 'weapon' | 'armor' | 'ring' | 'boots'

interface SubStat {
  stat: string             // 'ATK' | 'HP' | 'DEF' | 'SPD' | 'CritRate' | 'CritDmg'
  value: number
  isPercent: boolean       // true = 百分比加成, false = 固定值
}

/** 完整背包狀態 */
interface PlayerInventory {
  items: InventoryItem[]           // 可堆疊道具
  equipment: EquipmentInstance[]   // 裝備實例
}
```

---

## 五、背包 UI 設計

### 5.1 分頁結構

```
┌─────────────────────────────────────┐
│  背包                    💰12,500   │
│                          💎 850     │
├────┬────┬────┬────┬────┬───────────┤
│ 全部│素材│裝備│寶箱│貨幣│ 排序 ▼     │
├────┴────┴────┴────┴────┴───────────┤
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐    │
│ │🔴│ │🟢│ │🔵│ │🟡│ │⬜│ │⬜│    │
│ │x5│ │x3│ │x1│ │x8│ │  │ │  │    │
│ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘    │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐             │
│ │⚔️│ │🛡️│ │💍│ │👟│              │
│ │+5│ │+0│ │+3│ │+0│              │
│ └──┘ └──┘ └──┘ └──┘              │
│                                    │
│ ──── 選中道具詳情 ────              │
│ 小型經驗核心 (x5)                   │
│ 提供 100 EXP 的升級素材            │
│ [使用] [出售]                      │
└─────────────────────────────────────┘
```

### 5.2 排序選項

| 排序方式 | 說明 |
|---------|------|
| 取得時間 | 最新在前（預設） |
| 稀有度 | SSR → SR → R → N |
| 類別 | 按 category 分組 |
| 數量 | 多到少 |

### 5.3 道具操作

| 操作 | 條件 | 說明 |
|------|------|------|
| **使用** | useAction 非空 | 寶箱→開啟、經驗核心→選英雄升級 |
| **出售** | sellPrice > 0 | 轉換為金幣 |
| **詳情** | 裝備類 | 查看主/副屬性、強化等級、套裝效果 |
| **鎖定** | 裝備類 | 標記為鎖定，防止誤拆解 |
| **批量出售** | 長按進入多選模式 | 一次賣多個 |
| **批量使用** | 素材類可批量 | 如一次用 10 個經驗核心 |

---

## 六、背包容量

| 項目 | 上限 | 說明 |
|------|------|------|
| 可堆疊道具種類 | **無限** | 每種道具只佔一行，quantity 堆疊 |
| 裝備數量 | **200 件** | 超過需拆解/回收（可擴容） |
| 擴容方式 | 每 50 格 = 100 鑽石 | 最多擴到 500 件 |

```typescript
const EQUIPMENT_SLOT_BASE = 200
const EQUIPMENT_SLOT_EXPAND = 50    // 每次擴容 +50
const EQUIPMENT_SLOT_COST = 100     // 每次擴容 100 鑽石
const EQUIPMENT_SLOT_MAX = 500      // 最大容量
```

---

## 七、API 端點

| 端點 | 方法 | 參數 | 回傳 | 說明 |
|------|------|------|------|------|
| `/load-inventory` | POST | `{ guestToken }` | `{ items, equipment }` | 載入完整背包 |
| `/add-items` | POST | `{ guestToken, items: [{itemId, quantity}] }` | `{ success, inventory }` | 批量增加道具 |
| `/remove-items` | POST | `{ guestToken, items: [{itemId, quantity}] }` | `{ success, inventory }` | 批量消耗道具（有不足則整筆失敗） |
| `/use-item` | POST | `{ guestToken, itemId, quantity, targetId? }` | `{ success, result }` | 使用道具（寶箱開啟/經驗核心升級） |
| `/sell-items` | POST | `{ guestToken, items: [{itemId, quantity}] }` | `{ success, goldGained }` | 出售道具換金幣 |
| `/add-equipment` | POST | `{ guestToken, templateId, setId, ... }` | `{ equipId }` | 新增裝備實例（掉落/鍛造） |
| `/remove-equipment` | POST | `{ guestToken, equipId }` | `{ success, materials }` | 拆解裝備（返回素材） |
| `/equip-item` | POST | `{ guestToken, equipId, heroInstanceId }` | `{ success }` | 裝備到英雄身上 |
| `/unequip-item` | POST | `{ guestToken, equipId }` | `{ success }` | 卸下裝備放回背包 |
| `/lock-equipment` | POST | `{ guestToken, equipId, locked }` | `{ success }` | 鎖定/解鎖裝備 |
| `/expand-inventory` | POST | `{ guestToken }` | `{ success, newCapacity }` | 擴容（扣鑽石） |

---

## 八、道具獲取來源總覽

| 來源 | 可獲得道具 |
|------|-----------|
| **主線關卡** | 金幣、經驗核心（小/中）、裝備（N~SR）、鍛造礦 |
| **資源計時器** | 金幣、小型經驗核心 |
| **無盡爬塔** | 鑽石（每10層）、大型經驗核心、裝備寶箱 |
| **每日副本** | 職業石（力量/敏捷/防禦）、強化石、經驗核心 |
| **PvP 競技場** | 競技幣（每日排名獎勵）→ 商店兌換碎片/道具 |
| **Boss 戰** | Boss 幣、鍛造圖紙、大型強化石、裝備（SR~SSR） |
| **抽卡（重複）** | 星塵 |
| **商店購買** | 鑽石 → 素材寶箱 / 體力等 |
| **活動** | 限定道具、限定裝備 |

---

## 九、商店系統（附屬於背包）

### 9.1 商店分類

| 商店 | 貨幣 | 商品 | 說明 |
|------|------|------|------|
| 雜貨商店 | 金幣 | 小/中型強化石、重洗石、經驗核心 | 每日刷新 6 個 |
| 競技商店 | 競技幣 | 指定英雄碎片（輪替）、鍛造礦 | 每週刷新 |
| 星塵商店 | 星塵 | 指定英雄碎片（永久） | 不刷新 |
| Boss 商店 | Boss 幣 | 鍛造圖紙、大型強化石、稀有鍛造礦 | 每週刷新 |
| 鑽石商店 | 鑽石 | 素材寶箱、背包擴容、外觀（未來） | 常駐 |

### 9.2 商店 API

| 端點 | 方法 | 說明 |
|------|------|------|
| `/get-shop` | POST | 取得商店列表（含已購買狀態） |
| `/buy-shop-item` | POST | 購買（扣貨幣 + 發道具） |
| `/refresh-shop` | POST | 手動刷新雜貨商店（50 鑽石） |

---

## 十、與其他系統的交互

### 10.1 養成系統 (`progression.md`)

```
升級英雄：
  inventory 扣除 exp_core_* → hero_instances.level 提升

突破英雄：
  inventory 扣除 asc_fragment_{heroId} + asc_class_* + gold
  → hero_instances.ascension 提升

升星英雄：
  inventory 扣除 asc_fragment_{heroId}
  → hero_instances.stars 提升

裝備強化：
  inventory 扣除 eqm_enhance_* + gold
  → equipment_instances.enhanceLevel 提升

裝備重洗：
  inventory 扣除 eqm_reroll
  → equipment_instances.subStats 重新隨機

鍛造裝備：
  inventory 扣除 forge_blueprint_* + forge_ore_* + gold
  → equipment_instances 新增一行

拆解裝備：
  equipment_instances 刪行
  → inventory 增加 eqm_enhance_* + gold
```

### 10.2 關卡系統 (`stage-system.md`)

```
通關結算：
  → inventory 增加掉落物（經驗核心/裝備/鍛造礦…）
  → 首通獎勵：diam + gold + 可能的裝備

每日副本結算：
  → inventory 增加職業石/強化石

Boss 結算：
  → inventory 增加 Boss 幣 + 鍛造圖紙 + 裝備
```

### 10.3 抽卡系統 (`gacha.md`)

```
抽到新英雄：
  → hero_instances 新增

抽到重複英雄：
  → inventory 增加 currency_stardust（SSR=25, SR=5, R=1, N=0.2）
  → inventory 增加 asc_fragment_{heroId}（見 progression.md §3 碎片來源）
```

---

## 擴展點

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
| v0.1 | 2026-02-27 | 初版：道具分類（8 類）、ID 命名規則、item_definitions + inventory + equipment_instances 三表結構、背包 UI、容量機制、11 個 API 端點、商店系統、與養成/關卡/抽卡的交互定義 |
