# 英雄資料結構 Spec

> 版本：v2.4 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 負賬角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/types.ts`（表現層）、`src/domain/types.ts`（domain 層）、`src/services/dataService.ts`（資料轉換）、`src/services/saveService.ts`（HeroInstance）

## 概述

英雄資料由 Google Sheets 提供，前端透過 API 拉取後即時使用。
資料流：**Sheet → sheetApi → dataService → domain types → battleEngine**。

**v2.0**：新增 DEF / CritRate / CritDmg / Element、星級系統、模組化技能表。
**v2.1**：Domain 層新增 `RawHeroInput`、`BattleHero`、`FinalStats` 三層型別。
**v2.2**：HeroInstance 新增 `stars` 欄位，舊存檔自動遷移預設 stars=1。
**v2.3**：所有英雄從 ★0 開始培養（不再依稀有度給初始星級），舊存檔遷移預設改為 stars=0。

## 依賴

- `.ai/specs/skill-system.md` → 技能模板 + 英雄技能對照表
- `.ai/specs/progression.md` → 等級 / 突破 / 裝備提供的數值加成（✅ 已實作）
- `.ai/specs/element-system.md` → 屬性定義 + 中英對照
- `.ai/specs/damage-formula.md` → 戰鬥數值計算
- Google Sheets `heroes` 表 → 資料來源

---

## 一、資料來源欄位（Google Sheets `heroes` 表）

### 基礎欄位

| 欄位 | 型別 | 說明 | 範例 |
|------|------|------|------|
| `HeroID` | number | 唯一 ID | 1 |
| `ModelID` | string | 模型目錄名 | zombie_1 |
| `Name` | string | 角色名稱 | 女喪屍 |
| `Type` | string | 職業類型 | 敏捷 / 力量 / 坦克 / 刺客 / 特殊 / 均衡 / 輔助 |
| `Rarity` | string \| number | 基礎稀有度。D1 存 TEXT（'N'/'R'/'SR'/'SSR'），前端用 `toRarity(v)` 統一轉換 | 'SSR' |
| `Description` | string | 角色描述 |  |

### 戰鬥數值欄位

| 欄位 | 型別 | 說明 | 預設 | 範圍 |
|------|------|------|------|------|
| `HP` | number | 基礎生命值 | 100 | 80~200 |
| `ATK` | number | 基礎攻擊力 | 20 | 20~70 |
| `DEF` | number | 基礎防禦力 | 10 | 10~50 |
| `Speed` | number | 行動速度 |★ 5 |★ 5~15 |
| `CritRate` | number | 暴擊率（%） |★ 5 | 0~100 |
| `CritDmg` | number | 暴擊傷害加成（%） |★ 50 | 0~300 |
| `Element` | string | 屬性（中文） |  | 火/冰/雷/毒/闇/光 |

### 已廢棄欄位

| 欄位 | 說明 |
|------|------|
| ~~`Passive`~~ | 改用 `skill_templates` + `hero_skills` 表 |
| ~~`PassiveDesc`~~ | 同上 |

---

## 二、TypeScript 介面 — 三層型別 

### 層級 1：RawHeroData（API 原始回傳）

```typescript
// src/types.ts — 表現層
interface RawHeroData {
  HeroID?: string | number
  ModelID?: string | number; ModelId?: string | number; Model?: string | number
  Name?: string
  Type?: string
  Rarity?: string | number  // D1 存 TEXT，用 toRarity() / toRarityNum() 轉換
  Description?: string
  Element?: string
  HP?: number; ATK?: number; DEF?: number
  Speed?: number; SPD?: number; SPEED?: number; AGI?: number
  CritRate?: number; CritDmg?: number
  id?: string | number
  _modelId?: string
  [key: string]: unknown
}
```

### 層級 2：SlotHero（陣型格子中的英雄）

```typescript
// src/types.ts — 表現層
interface SlotHero extends RawHeroData {
  currentHP: number       // 戰鬥中即時 HP
  slot?: number           // 所在格子 index (0-5)
  _uid: string            // 唯一識別碼
  _modelId: string        // 正規化模型 ID "zombie_N"
  ModelID: string
}
```

### 層級 3：RawHeroInput（Domain 層輸入）

```typescript
// src/domain/battleEngine.ts
interface RawHeroInput {
  heroId: number
  modelId: string
  name: string
  element: string         // 已轉為英文（fire/water/...）
  HP: number
  ATK: number
  DEF: number
  SPD: number             //  注意：domain 用 SPD 不是 Speed
  CritRate: number        // 百分比整數
  CritDmg: number         // 百分比整數
}
```

### 層級 4：BattleHero（戰鬥中完整角色）

```typescript
// src/domain/types.ts  21 個欄位
interface BattleHero {
  // 身份
  uid: string             // 唯一 ID（由 createBattleHero 產生或傳入）
  heroId: number
  modelId: string
  name: string
  side: 'player' | 'enemy'
  slot: number            // 0-5
  element: Element | ''   // 英文屬性

  // 數值
  baseStats: FinalStats   // 基礎數值（= RawHeroInput 的值）
  finalStats: FinalStats  // 結算數值（含等級/裝備，目前 = baseStats）
  currentHP: number       // 戰鬥中即時 HP
  maxHP: number           // = finalStats.HP
  energy: number          // 0~1000

  // 技能
  activeSkill: SkillTemplate | null   // 主動技能（大招）
  passives: SkillTemplate[]           // 所有被動（4 個）
  activePassives: SkillTemplate[]     // 已解鎖被動（受星級限制）

  // 狀態
  statusEffects: StatusEffect[]
  shields: Shield[]
  passiveUsage: Record<string, number>  // 被動使用次數追蹤

  // 統計
  totalDamageDealt: number
  totalHealingDone: number
  killCount: number
}
```

### FinalStats（結算後數值）

```typescript
// src/domain/types.ts
interface FinalStats {
  HP: number
  ATK: number
  DEF: number
  SPD: number             //  domain 層使用 SPD（不是 Speed）
  CritRate: number        // 百分比整數 e.g. 15 = 15%
  CritDmg: number         // 百分比整數 e.g.★ 50 = +50%  暴擊倍率 1.5
}
```

---

## 三、型別轉換流程 

```
Google Sheet (heroes 表)
     readSheet<RawHeroRow>()
RawHeroRow
     toRawHeroInput() → [dataService.ts]
RawHeroInput                         domain 輸入格式
     createBattleHero() → [battleEngine.ts]
BattleHero                           戰鬥引擎使用
```

### 關鍵轉換：toRawHeroInput()

```typescript
// src/services/dataService.ts
function toRawHeroInput(row: RawHeroRow): RawHeroInput {
  return {
    heroId: Number(row.HeroID),
    modelId: String(row.ModelID || `zombie_${row.HeroID}`),
    name: String(row.Name || ''),
    element: toElement(row.Element) || '',   // 中文→英文
    HP: Number(row.HP) || 100,
    ATK: Number(row.ATK) || 20,
    DEF: Number(row.DEF) || 10,
    SPD: Number(row.Speed) ||★ 5,             // Speed → SPD
    CritRate: Number(row.CritRate) ||★ 5,
    CritDmg: Number(row.CritDmg) ||★ 50,
  }
}
```

### 關鍵轉換：slotToInput()

```typescript
// src/App.tsx（表現層  domain 層）
function slotToInput(slot: SlotHero, heroId: number): RawHeroInput
// 從 SlotHero 萃取 domain 需要的欄位
```

### 屬性中英對照（toElement）

| 中文 | 英文 | 備註 |
|------|------|------|
| 火 | fire |  |
| 冰 / 水 | water | 冰 = water |
| 毒 / 風 | wind | 毒 = wind |
| 雷 | thunder |  |
| 地 / 土 | earth |  |
| 光 | light |  |
| 闇 / 暗 | dark |  |

---

## 四、ModelID 正規化邏輯（不變）

```typescript
// 嘗試的欄位順序：_modelId  ModelID  HeroID  ModelId  Model  id  Name
// 結果統一為 "zombie_N" 格式
function normalizeModelId(h: RawHeroData, idx: number): string
```

### 速度值取得

```typescript
function getHeroSpeed(h: RawHeroData): number {
  return h.Speed ?? h.SPD ?? h.SPEED ?? h.AGI ?? 1
}
```

---

## 五、角色一覽（14 隻）

| ID | 名稱 | 類型 | 稀有度 | HP | ATK | DEF | Speed | CritRate | CritDmg | 屬性 |
|----|------|------|--------|-----|-----|-----|-------|----------|---------|------|
| 1 | 女喪屍 | 敏捷 | ★★★★ | 100 | 25 | 15 | 8 | 5% | 50% | 闇 |
| 2 | 異變者 | 力量 | ★★★ | 125 | 50 | 20 | 10 | 5% | 50% | 毒 |
| 3 | 詭獸 | 坦克 | ★★★★ | 175 | 30 | 45 | 7 | 5% | 50% | 闇 |
| 4 | 屠宰者 | 刺客 | ★★★★ | 100 | 60 | 12 | 11 | 15% | 80% | 火 |
| 5 | 口器者 | 特殊 | ★★★ | 110 | 40 | 18 | 10 | 5% | 50% | 毒 |
| 6 | 無名活屍 | 均衡 | ★★ | 100 | 30 | 20 | 8 | 5% | 50% | 闇 |
| 7 | 腐學者 | 輔助 | ★★★ | 105 | 35 | 22 | 9 | 5% | 50% | 毒 |
| 8 | 夜鬼 | 力量 | ★★★★ | 130 | 45 | 25 | 9 | 5% | 50% | 闇 |
| 9 | 倖存者 | 均衡 | ★★★ | 115 | 35 | 20 | 9 | 5% | 50% | 光 |
| 10 | 童魘 | 敏捷 | ★★★★ | 95 | 45 | 14 | 12 | 10% | 60% | 冰 |
| 11 | 白面鬼 | 特殊 | ★★ | 100 | 40 | 16 | 10 | 5% | 50% | 火 |
| 12 | 戰厄 | 坦克 | ★★★ | 160 | 35 | 40 | 7 | 5% | 50% | 雷 |
| 13 | 南瓜魔 | 力量 | ★★★★ | 150 | 55 | 30 | 6 | 10% | 70% | 火 |
| 14 | 脫逃者 | 敏捷 | ★ | 90 | 30 | 10 | 13 | 8% | 50% | 冰 |

### 職業分佈
- 力量 3、敏捷 3、坦克 2、特殊 2、均衡 2、刺客 1、輔助 1

### 稀有度分佈
- ★ 1、★★ 3、★★★ 5、★★★★ 5

### 屬性分佈
- 闇 4、火 3、毒 3、冰 2、雷 1、光 1

---

## 六、星級系統

| 星級 | 解鎖被動 | 升星碎片 |
|------|---------|---------|
| ★0 | 被動 1 | 初始（新英雄預設） |
| ★1 | 被動 1 | 10 |
| ★2 | 被動 2 | 30 |
| ★3 | — | 60 |
| ★4 | 被動 3 | 120 |
| ★5 | — | 200 |
| ★6 | 被動 4 | 300 |

```typescript
// createBattleHero(input, side, slot, activeSkill, passives, starLevel=1, uid?, heroInstance?, rarity=3)
// heroInstance + rarity → getFinalStats(rawStats, heroInstance, rarity) 計算養成數值
const passiveSlots = starLevel >= 6 ? 4 : starLevel >= 4 ? 3 : starLevel >= 2 ? 2 : 1
```

> 目前預設 `starLevel = 1`，升星系統為 progression 擴展點。

---

## 七、HeroInstance（養成層 — ✅ 已實作）

```typescript
// src/services/saveService.ts
interface HeroInstance {
  instanceId: string
  heroId: number
  level: number           // 1~60
  exp: number             // 當前經驗
  ascension: number       // 突破 0~5
  stars: number           // 星級 0~6（新英雄從 0 開始）
  equippedItems: Record<string, string>  // slot → equipId
  obtainedAt: string
}
```

> `stars` 欄位於 v2.2 新增。舊存檔缺少此欄位時，`stripPlayerId()` 會自動補上預設值 `stars = 0`。

### 星級用途

- 決定被動技能解鎖數（見 `skill-system.md`）
- 星級乘數加成全屬性（見 `progression.md`）
- 升星消耗英雄碎片（見 `progression.md`）

---

## 八、3D 資產結構（不變）

```
public/models/zombie_N/
 zombie_N.glb           Mesh + 骨架（Draco 壓縮）
 zombie_N_idle.glb      待機動畫
 zombie_N_attack.glb    攻擊動畫
 zombie_N_hurt.glb      受擊動畫
 zombie_N_dying.glb     死亡動畫
 zombie_N_run.glb       跑步動畫
 thumbnail.png          大頭照
```

---

## 擴展點

- [ ] **新英雄**：加入 Google Sheets 即可自動識別
- [ ] **HeroInstance 覺醒系統**：☆ 6 後的額外突破
- [ ] **外觀系統**：替換模型皮膚
- [ ] **天賦樹**：小天賦點數分配

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2025-02-26 | 從程式碼逆向整理 |
| v2.0 | 2025-02-26 | 新增 DEF/CritRate/CritDmg/Element、星級系統、14 隻角色數值 |
| v2.1 | 2025-02-26 | **已實作**：Domain 三層型別（RawHeroInput → BattleHero）、dataService 轉換流程 |
| v2.2 | 2026-02-28 | HeroInstance 新增 `stars: number` 欄位，舊存檔自動遷移 |
| v2.3 | 2026-03-01 | 所有英雄從 ★0 開始培養：初始星級統一 0、加乘數 0.90、GAS appendRow 寫入 stars=0（注意：code 中 ★0 仍有 1 個被動欄位） |
| v2.4 | 2026-03-01 | Spec 同步：BattleHero 欄位數修正 23→21、createBattleHero 加入 heroInstance/rarity 參數、★0 被動欄修正為 1（非 0）、養成依賴標記為已實作 |
| v2.5 | 2026-03-06 | 修正 Rarity 欄位型別：D1 存 TEXT 非 number。新增共用 `toRarity(v)` / `toRarityNum(v)` 工具函式於 `constants/rarity.ts`，取代各元件 inline `numToRarity()` |
