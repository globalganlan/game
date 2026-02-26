# 英雄資料結構 Spec

> 版本：v2.0 ｜ 狀態：🟡 草案（v1.0 程式碼同步 + v2.0 新系統設計）
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/types.ts`、Google Sheets API

## 概述

英雄資料由 Google Sheets 提供，前端透過 API 拉取後即時使用。
v2.0 新增：DEF（防禦）、CritRate（暴擊率）、CritDmg（暴擊傷害）、Element（屬性）、
星級系統（★1~★6，影響被動技能解鎖）、等級/突破/裝備結算的 finalStats。

**heroes.tsv 中舊有的 Passive / PassiveDesc 欄位不再參考**，
被動技能改為模組化技能表驅動（見 `specs/skill-system.md`）。

## 依賴

- `specs/skill-system.md` — 技能模板 + 英雄技能對照表
- `specs/progression.md` — 等級 / 突破 / 裝備提供的數值加成
- `specs/element-system.md` — 屬性定義
- `specs/damage-formula.md` — 戰鬥數值計算
- Google Sheets API — 資料來源

---

## 一、資料來源欄位（Google Sheets `heroes` 表）

### 基礎欄位（已存在，保留）

| 欄位 | 型別 | 說明 | 範例 |
|------|------|------|------|
| `HeroID` | number | 唯一 ID | 1 |
| `ModelID` | string | 模型目錄名 | zombie_1 |
| `Name` | string | 角色名稱 | 女喪屍 |
| `Type` | string | 職業類型 | 敏捷 / 力量 / 坦克 / 刺客 / 特殊 / 均衡 / 輔助 |
| `Rarity` | number | 基礎稀有度（1~4） | 4 |
| `Description` | string | 角色描述 | 感染初期的年輕女性... |

### 戰鬥數值欄位（v2.0 新增 DEF / CritRate / CritDmg）

| 欄位 | 型別 | 說明 | 預設 | 範圍 |
|------|------|------|------|------|
| `HP` | number | 基礎生命值 | — | 80~200 |
| `ATK` | number | 基礎攻擊力 | — | 20~70 |
| `DEF` | number | 基礎防禦力 | — | 10~50 |
| `Speed` | number | 行動速度 | — | 5~15 |
| `CritRate` | number | 暴擊率（%） | 5 | 0~100 |
| `CritDmg` | number | 暴擊傷害加成（%） | 50 | 0~300 |

### 屬性欄位（v2.0 新增）

| 欄位 | 型別 | 說明 | 範例 |
|------|------|------|------|
| `Element` | string | 屬性 | 火 / 冰 / 雷 / 毒 / 闇 / 光 |

### 已廢棄欄位

| 欄位 | 說明 |
|------|------|
| ~~`Passive`~~ | 舊版被動名稱 — **不再參考**，改用 `skill-system.md` 的技能模板表 |
| ~~`PassiveDesc`~~ | 舊版被動描述 — **不再參考** |

---

## 二、TypeScript 介面

### RawHeroData（API 回傳原始資料）

```typescript
interface RawHeroData {
  // 基礎
  HeroID?: string | number
  ModelID?: string | number; ModelId?: string | number; Model?: string | number
  Name?: string
  Type?: string
  Rarity?: number
  Description?: string
  Element?: string

  // 戰鬥數值
  HP?: number
  ATK?: number
  DEF?: number
  Speed?: number; SPD?: number; SPEED?: number; AGI?: number
  CritRate?: number
  CritDmg?: number

  // 內部
  id?: string | number
  _modelId?: string
  [key: string]: unknown
}
```

### SlotHero（陣型中的英雄實例）

```typescript
interface SlotHero extends RawHeroData {
  currentHP: number       // 戰鬥中即時 HP
  slot?: number           // 所在格子 index (0-5)
  _uid: string            // 唯一識別碼 "{modelId}_{timestamp}_{slot}"
  _modelId: string        // 正規化模型 ID "zombie_N"
  ModelID: string
}
```

### HeroInstance（玩家擁有的英雄實例 — v2.0 新增）

```typescript
interface HeroInstance {
  instanceId: string      // 唯一 ID（UUID）
  heroId: number          // 對應 HeroID
  
  // 養成狀態
  level: number           // 1~60
  ascension: number       // 突破等級 0~5
  star: number            // 星級 1~6
  shards: number          // 當前碎片數
  
  // 裝備
  equipment: {
    weapon: EquipmentInstance | null
    armor: EquipmentInstance | null
    ring: EquipmentInstance | null
    shoes: EquipmentInstance | null
  }
  
  // 戰鬥用快取（從基礎+等級+突破+裝備+星級 結算）
  finalStats: FinalStats
}
```

### FinalStats（結算後數值）

```typescript
interface FinalStats {
  HP: number
  ATK: number
  DEF: number
  Speed: number
  CritRate: number    // 百分比（5 = 5%）
  CritDmg: number     // 百分比（50 = +50%）
}
```

### 數值結算公式

```typescript
function calculateFinalStats(hero: HeroInstance, baseData: RawHeroData): FinalStats {
  const base = {
    HP:       baseData.HP ?? 100,
    ATK:      baseData.ATK ?? 30,
    DEF:      baseData.DEF ?? 20,
    Speed:    getHeroSpeed(baseData),
    CritRate: baseData.CritRate ?? 5,
    CritDmg:  baseData.CritDmg ?? 50,
  }
  
  // 等級加成（每級 +2% 基礎值）
  const levelMult = 1 + (hero.level - 1) * 0.02
  
  // 突破固定加成（見 progression.md）
  const ascBonus = getAscensionBonus(hero.ascension)
  
  // 裝備加成
  const equipBonus = getEquipmentBonus(hero.equipment)
  
  return {
    HP:       Math.floor(base.HP * levelMult + ascBonus.HP + equipBonus.HP),
    ATK:      Math.floor(base.ATK * levelMult + ascBonus.ATK + equipBonus.ATK),
    DEF:      Math.floor(base.DEF * levelMult + ascBonus.DEF + equipBonus.DEF),
    Speed:    Math.floor(base.Speed + ascBonus.Speed + equipBonus.Speed),
    CritRate: base.CritRate + equipBonus.CritRate,   // 不受等級影響
    CritDmg:  base.CritDmg + equipBonus.CritDmg,    // 不受等級影響
  }
}
```

---

## 三、ModelID 正規化邏輯（不變）

```typescript
// 嘗試的欄位順序：_modelId → ModelID → HeroID → ModelId → Model → id → Name
// 結果統一為 "zombie_N" 格式
function normalizeModelId(h: RawHeroData, idx: number): string
```

### 速度值取得（擴展 DEF）

```typescript
function getHeroSpeed(h: RawHeroData): number {
  return h.Speed ?? h.SPD ?? h.SPEED ?? h.AGI ?? 1
}

function getHeroDef(h: RawHeroData): number {
  return h.DEF ?? 0
}
```

---

## 四、角色一覽（14 隻 — v2.0 含 DEF / CritRate / CritDmg / Element）

| ID | 名稱 | 類型 | 稀有度 | HP | ATK | DEF | Speed | CritRate | CritDmg | 屬性 |
|----|------|------|--------|-----|-----|-----|-------|----------|---------|------|
| 1 | 女喪屍 | 敏捷 | ★★ | 100 | 25 | 15 | 8 | 5% | 50% | 闇 |
| 2 | 異變者 | 力量 | ★★★ | 125 | 50 | 20 | 10 | 5% | 50% | 毒 |
| 3 | 詭獸 | 坦克 | ★★★★ | 175 | 30 | 45 | 7 | 5% | 50% | 闇 |
| 4 | 屠宰者 | 刺客 | ★★★★ | 100 | 60 | 12 | 11 | 15% | 80% | 火 |
| 5 | 口器者 | 特殊 | ★★★ | 110 | 40 | 18 | 10 | 5% | 50% | 毒 |
| 6 | 無名活屍 | 均衡 | ★ | 100 | 30 | 20 | 8 | 5% | 50% | 闇 |
| 7 | 腐學者 | 輔助 | ★★★ | 105 | 35 | 22 | 9 | 5% | 50% | 毒 |
| 8 | 夜鬼 | 力量 | ★★★ | 130 | 45 | 25 | 9 | 5% | 50% | 闇 |
| 9 | 倖存者 | 均衡 | ★★ | 115 | 35 | 20 | 9 | 5% | 50% | 光 |
| 10 | 童魘 | 敏捷 | ★★★★ | 95 | 45 | 14 | 12 | 10% | 60% | 冰 |
| 11 | 白面鬼 | 特殊 | ★★★ | 100 | 40 | 16 | 10 | 5% | 50% | 火 |
| 12 | 戰厄 | 坦克 | ★★★★ | 160 | 35 | 40 | 7 | 5% | 50% | 雷 |
| 13 | 南瓜魔 | 力量 | ★★★★ | 150 | 55 | 30 | 6 | 10% | 70% | 火 |
| 14 | 脫逃者 | 敏捷 | ★★ | 90 | 30 | 10 | 13 | 8% | 50% | 冰 |

### DEF 設計理念

| 職業 | DEF 範圍 | 說明 |
|------|----------|------|
| 坦克 | 35~50 | 高 DEF，扛傷害 |
| 力量 | 20~30 | 中等 |
| 均衡 | 18~22 | 中等 |
| 輔助 | 18~25 | 中等偏低 |
| 敏捷 | 10~16 | 低 DEF，靠速度/閃避 |
| 刺客 | 10~15 | 最低：高攻低防 |
| 特殊 | 14~20 | 中偏低 |

### CritRate / CritDmg 設計理念

- **多數角色** CritRate=5%, CritDmg=50%（預設）
- **刺客**（屠宰者）：天生高 CritRate=15%, CritDmg=80%
- **敏捷型**（童魘、脫逃者）：稍高基礎暴擊
- **力量型**（南瓜魔）：稍高暴擊傷害（重擊型）
- 暴擊主要透過**裝備和 Buff** 培養，基礎值差異不大

### 職業分佈
- 力量 ×3（異變者、夜鬼、南瓜魔）
- 敏捷 ×3（女喪屍、童魘、脫逃者）
- 坦克 ×2（詭獸、戰厄）
- 特殊 ×2（口器者、白面鬼）
- 均衡 ×2（無名活屍、倖存者）
- 刺客 ×1（屠宰者）
- 輔助 ×1（腐學者）

### 稀有度分佈
- ★ ×1（無名活屍）
- ★★ ×3（女喪屍、倖存者、脫逃者）
- ★★★ ×5（異變者、口器者、腐學者、夜鬼、白面鬼）
- ★★★★ ×5（詭獸、屠宰者、童魘、戰厄、南瓜魔）

### 屬性分佈
- 闇 ×4（女喪屍、詭獸、無名活屍、夜鬼）
- 火 ×3（屠宰者、白面鬼、南瓜魔）
- 毒 ×3（異變者、口器者、腐學者）
- 冰 ×2（童魘、脫逃者）
- 雷 ×1（戰厄）
- 光 ×1（倖存者）

---

## 五、星級系統（v2.0 新增）

星級 ★1~★6，每提升一星解鎖一個被動技能欄位。

| 星級 | 解鎖被動 | 升星所需碎片 |
|------|---------|-------------|
| ★1 | 被動 1 | —（初始） |
| ★2 | 被動 2 | 30 碎片 |
| ★3 | — | 60 碎片 |
| ★4 | 被動 3 | 120 碎片 |
| ★5 | — | 200 碎片 |
| ★6 | 被動 4 | 300 碎片 |

碎片來源：見 `specs/gacha.md`（重複抽到 → 轉碎片）

### 星級與技能關係

每個英雄 4 個被動技能由 `specs/skill-system.md` 的 `hero_skills` 表定義。
星級門檻決定哪些被動生效：

```typescript
function getActivePassives(hero: HeroInstance): SkillTemplate[] {
  const thresholds = [1, 2, 4, 6]  // 被動1=★1, 被動2=★2, 被動3=★4, 被動4=★6
  return hero.skills
    .filter((_, i) => hero.star >= thresholds[i])
}
```

---

## 六、3D 資產結構（不變）

```
public/models/zombie_N/
├── zombie_N.glb          ← Mesh + 骨架（Draco 壓縮）
├── zombie_N_idle.glb     ← 待機動畫（循環）
├── zombie_N_attack.glb   ← 攻擊動畫（單次）
├── zombie_N_hurt.glb     ← 受擊動畫（單次）
├── zombie_N_dying.glb    ← 死亡動畫（單次 clamp）
├── zombie_N_run.glb      ← 跑步動畫（循環，已移除 root motion）
└── thumbnail.png         ← 大頭照縮圖
```

### 模型載入方式
- `GLTFLoader` + `DRACOLoader`（本地 WASM：`public/draco/`）
- 全域快取：`src/loaders/glbLoader.ts`（`loadGlbShared` / `getGlbForSuspense`）
- 克隆：`SkeletonUtils.clone()`（SkinnedMesh 必須用這個）
- 縮放：`Box3` Z 軸高度 → 統一到 2.5 單位高

### 動畫系統
- `useAnimations(clips, scene)` — drei hook
- 動畫切換：`crossFadeTo(newAction, 0.25)`
- 單次動畫結束後自動 `fadeIn` 回 IDLE

---

## 擴展點

- [ ] **新英雄**：加入 Google Sheets 即可，前端自動識別
- [ ] **覺醒系統**：★6 後的額外突破機制
- [ ] **外觀系統**：替換模型皮膚而不影響數值
- [ ] **天賦樹**：等級到達上限後的小天賦點數分配

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2026-02-26 | 從現有程式碼 + heroes.tsv 逆向整理 |
| v2.0 | 2026-02-26 | 新增 DEF/CritRate/CritDmg/Element 欄位、HeroInstance + FinalStats 介面、星級系統、廢棄舊 Passive 欄位、14 隻角色新數值 |
