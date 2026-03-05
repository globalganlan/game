# 養成系統 Spec

> 版本：v2.6 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-05
> 負賬角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

角色成長路徑：**等級**（消耗 EXP 頂層資源升級）、**突破**（提升等級上限+屬性加成）、**星級**（碎片升星，解鎖被動技能）、**裝備**（模板制 128 種，4 格位 × 8 套裝 × 4 稀有度，主屬性 + 強化，套裝 2 件 / 4 件效果，抽卡取得可重複持有）。

養成 UI 已全面實作：升級（EXP 滑桿 + 預覽）、突破、升星、裝備穿脫均可操作，全部走 Optimistic Queue。

## 依賴

- `specs/hero-schema.md` — HeroInstance 結構（HP, ATK, DEF, SPD, CritRate, CritDmg, stars）
- `specs/skill-system.md` — 被動技能星級解鎖
- `specs/save-system.md` — 存檔結構
- `specs/inventory.md` — 素材消耗與背包操作（碎片/職業石等）；EXP 已改為頂層資源（save_data.exp）

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/domain/progressionSystem.ts` | Domain 層 — 所有公式、常數、數值計算（478 行） |
| `src/services/progressionService.ts` | Service 層 — 11 個 API 操作（全部走 Optimistic Queue） |
| `src/components/HeroListPanel.tsx` | UI — 英雄列表 + 詳情（養成按鈕目前 disabled） |
| `gas/程式碼.js` | GAS Handler — upgrade/ascend/starUp/enhance/forge/dismantle/completeStage/Tower/Daily/completeBattle（統一結算） |

---

## 一、等級系統

### 基礎

| 項目 | 值 |
|------|-----|
| 等級範圍 | 1-100 |
| 升級方式 | 消耗 EXP 頂層資源（滑桿 UI 選擇投入量） |
| 等級上限 | 由突破階段決定（見 §二） |

### 升級所需經驗（expToNextLevel）

```typescript
function expToNextLevel(level: number): number {
  return level * 100
}
```

| 等級 | 升級 EXP | 累計（約） |
|------|-----------|----------|
| 1→2 | 100 | 100 |
| 10→11 | 1,000 | 5,500 |
| 20→21 | 2,000 | 21,000 |
| 30→31 | 3,000 | 46,500 |
| 40→41 | 4,000 | 82,000 |
| 50→51 | 5,000 | 127,500 |

### 輔助函式

```typescript
// 計算升到 targetLevel 的累計經驗
function totalExpForLevel(targetLevel: number): number

// 消耗經驗素材，回傳新等級/經驗/實際消耗量
function consumeExpMaterials(
  currentLevel: number, currentExp: number,
  levelCap: number, expToAdd: number
): { level: number; exp: number; expConsumed: number }
```

### 數值成長（稀有度差異化）

```typescript
function getStatAtLevel(baseStat: number, level: number, rarity: number = 3): number {
  const growth = RARITY_LEVEL_GROWTH[rarity] ?? 0.04
  return Math.floor(baseStat * (1 + (level - 1) * growth))
}
```

| 稀有度 | 每級成長 | Lv60 乘數 |
|--------|----------|------------|
| ★1 | +3.0% | ×2.77 |
| ★2 | +3.5% | ×3.07 |
| ★3 | +4.0% | ×3.36（與舊公式相同） |
| ★4 | +5.0% | ×3.95 |

> **SPD / CritRate / CritDmg** 不受等級影響，只受裝備/buff。

### EXP 資源（v2.3 重構）

> **v2.3 變更**：EXP 改為頂層資源（與 gold / diamond 同級），存於 `save_data.exp`。
> 舊版 exp_core_s / exp_core_m / exp_core_l 道具已移除。

| 來源 | EXP 獲取量 |
|------|------------|
| 主線通關 | 依關卡公式（見 stage-system.md） |
| 無盡爬塔 | `50 + floor × 10` |
| 每日副本 | easy: 100 / normal: 200 / hard: 400 |
| PvP 競技場 | `80 + progress × 10` |
| Boss 挑戰 | 依段位 100~600 |
| 離線計時器 | `expPerHour = Math.max(100, progress * 50)` |
| 商店購買 | 直接購買 EXP 資源 |

---

## 一.1、每日挑戰次數限制（v2.6 新增）

部分模式有每日挑戰次數上限，由後端 `battle.ts` 強制執行：

```typescript
const DAILY_LIMITS = { daily: 3, pvp: 5, boss: 3 }
```

| 模式 | 每日上限 | 說明 |
|------|---------|------|
| 主線 (story) | 無限 | — |
| 爬塔 (tower) | 無限 | — |
| 每日副本 (daily) | 3 次/天 | 所有副本共用 |
| PvP (pvp) | 5 次/天 | UTC 00:00 重置 |
| Boss (boss) | 3 次/天 | 所有 Boss 共用 |

超過上限的挑戰會被後端拒絕。即使戰鬥失敗也會消耗一次。

### dailyCounts 存檔欄位

D1 `save_data` 表新增 `dailyCounts TEXT NOT NULL DEFAULT '{}'` 欄位，儲存 JSON：

```json
{ "daily": 2, "pvp": 3, "boss": 1, "date": "2026-03-05" }
```

當 `date` 與當日（UTC）不同時自動重置為 0。前端可透過 `/daily-counts` API 查詢剩餘次數。

詳見 `stage-system.md` 「每日挑戰次數限制」章節。

---

## 二、突破系統

### 突破等級上限表（ASCENSION_LEVEL_CAP）

| 突破階段 | 0（初始） | 1 | 2 | 3 | 4 | 5（覺醒） |
|---------|----------|---|---|---|---|----------|
| 等級上限 | 20 | 40 | 60 | 80 | 90 | 100 |

### 突破屬性乘數（RARITY_ASC_MULT，依稀有度差異化）

| 稀有度 \ 突破 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| ★1 | 1.00 | 1.03 | 1.06 | 1.09 | 1.12 | 1.18 |
| ★2 | 1.00 | 1.04 | 1.08 | 1.12 | 1.16 | 1.24 |
| ★3 | 1.00 | 1.05 | 1.10 | 1.15 | 1.20 | 1.30 |
| ★4 | 1.00 | 1.07 | 1.14 | 1.22 | 1.30 | 1.42 |

### 突破條件

```typescript
function canAscend(level: number, ascension: number): boolean {
  return ascension < 5 && level >= getLevelCap(ascension)
}
```

### 突破素材消耗（ASCENSION_COSTS）

| 階段 | 碎片 | 職業石 | 金幣 |
|------|------|--------|------|
| 0→1 | 10 | 5 | 5,000 |
| 1→2 | 20 | 10 | 10,000 |
| 2→3 | 30 | 15 | 20,000 |
| 3→4 | 50 | 20 | 40,000 |
| 4→5 | 80 | 30 | 80,000 |

---

## 三、星級系統

### 星級與被動解鎖

**星級乘數（RARITY_STAR_MULT，依稀有度差異化）：**

| 稀有度 \ 星級 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| ★1 | 0.90 | 1.00 | 1.03 | 1.06 | 1.09 | 1.13 | 1.18 |
| ★2 | 0.90 | 1.00 | 1.04 | 1.08 | 1.12 | 1.17 | 1.24 |
| ★3 | 0.90 | 1.00 | 1.05 | 1.10 | 1.15 | 1.20 | 1.30 |
| ★4 | 0.90 | 1.00 | 1.07 | 1.14 | 1.22 | 1.30 | 1.42 |

**星級被動解鎖（STAR_PASSIVE_SLOTS）：**

| 星級 | 被動槽數 |
|------|--------|
| ★0 | 1 |
| ★1 | 1 |
| ★2 | 2 |
| ★3 | 2 |
| ★4 | 3 |
| ★5 | 3 |
| ★6 | 4 |

### 升星碎片消耗（STAR_UP_COST）

| 升星 | 所需碎片 |
|------|---------|
| ★0→★1 | 5 |
| ★1→★2 | 10 |
| ★2→★3 | 20 |
| ★3→★4 | 40 |
| ★4→★5 | 80 |
| ★5→★6 | 160 |

### 初始星級（RARITY_INITIAL_STARS）

所有英雄不論稀有度，獲得時一律從 **★0** 開始培養。

> **設計意圖**：★0 自帶 ×0.90 屬性懲罰（HP/ATK/DEF −10%），作為養成引導——激勵玩家收集碎片升至 ★1 以解鎖完整基礎數值。★0 仍保有 1 個被動技能槽位（與 `battleEngine.createBattleHero` 一致）。

| 原始稀有度 | 初始星級 |
|-----------|---------|
| ★1 (N) | ★0 |
| ★2 (R) | ★0 |
| ★3 (SR) | ★0 |
| ★4 (SSR) | ★0 |

### 碎片來源

| 來源 | 碎片量 |
|------|--------|
| 重複抽到（稀有度 ★1~★2） | 5 碎片 |
| 重複抽到（稀有度 ★3） | 15 碎片 |
| 重複抽到（稀有度 ★4） | 40 碎片 |

---

## 四、裝備系統（模板制 v2）

> **v2.0 重新設計**：從「隨機實例制」改為「固定模板制」。移除副屬性、鍛造、拆解、重洗石、強化石、容量管理。裝備透過抽卡取得，可重複持有（不同英雄各穿一件）。

### 核心概念

- **128 種固定模板**：8 套裝 × 4 格位 × 4 稀有度
- 每種模板**可重複持有**（抽到多件 → 不同英雄各穿一件）
- 穿在英雄 A 的那件不能同時穿在英雄 B（穿戴獨佔）
- 養成深度靠「強化」+「湊套裝」+「分解回收」
- 無副屬性、無鍛造、無重洗、無裝備容量限制
- 多餘裝備可**分解**回收金幣 + 裝備碎片（碎片可在兌換商店換取強化素材）

### 格位（4 格）

```typescript
type EquipmentSlot = 'weapon' | 'armor' | 'ring' | 'boots'
```

| 格位 | 主屬性 | N 基礎 | R 基礎 | SR 基礎 | SSR 基礎 |
|------|--------|--------|--------|---------|----------|
| 武器 weapon | ATK | 8 | 20 | 40 | 70 |
| 護甲 armor | DEF | 3 | 8 | 16 | 28 |
| 戒指 ring | CritRate% | 1% | 3% | 5% | 8% |
| 鞋子 boots | SPD | 2 | 4 | 7 | 12 |

> 每格位只有 1 種固定主屬性，不再隨機。

### 稀有度（與英雄統一 4 檔）

| 稀有度 | 強化上限 | 每級主屬性 | 金幣基礎費 |
|--------|---------|----------|----------|
| N | +5 | +6% of base | 200 |
| R | +10 | +8% of base | 500 |
| SR | +15 | +10% of base | 1,000 |
| SSR | +20 | +12% of base | 2,000 |

### 強化（只消耗金幣）

```typescript
function enhancedMainStat(baseValue: number, enhanceLevel: number, rarity: Rarity): number {
  const mult = { N: 0.06, R: 0.08, SR: 0.10, SSR: 0.12 }
  return Math.floor(baseValue * (1 + enhanceLevel * mult[rarity]))
}

function getEnhanceCost(currentLevel: number, rarity: Rarity): number {
  const baseCost = { N: 200, R: 500, SR: 1000, SSR: 2000 }
  return Math.floor(baseCost[rarity] * (1 + currentLevel * 0.3))
}
```

### 模板 ID 命名

```
eq_{setId}_{slot}_{rarity}
範例：eq_berserker_weapon_SSR
```

### 套裝系統（8 套 × 2件/4件 × 4 稀有度）

同一英雄身上 4 件裝備中，**同 setId + 同 rarity** 的件數：
- ≥ 4 件 → 觸發 **4 件效果**（取代 2 件效果，數值更高 + 額外特效）
- ≥ 2 件（< 4）→ 觸發 **2 件效果**
- 不同稀有度的同套裝**不計入**（例如 2 件 SSR 狂戰 + 1 件 SR 狂戰 → 只觸發 SSR 2 件）

#### berserker 狂戰士

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | ATK +5% | ATK +12% |
| R | ATK +8% | ATK +18% |
| SR | ATK +12% | ATK +25% |
| SSR | ATK +18% | ATK +35% |

#### ironwall 鐵壁

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | DEF +8% | DEF +15% |
| R | DEF +12% | DEF +22% |
| SR | DEF +18% | DEF +30%、受傷 -5% |
| SSR | DEF +25% | DEF +40%、受傷 -10% |

#### gale 疾風

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | SPD +4 | SPD +8 |
| R | SPD +6 | SPD +12 |
| SR | SPD +10 | SPD +20、回合開始能量 +30 |
| SSR | SPD +15 | SPD +30、回合開始能量 +50 |

#### vampire 吸血

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | 回復 3% 傷害 | 回復 6% 傷害 |
| R | 回復 5% 傷害 | 回復 10% 傷害 |
| SR | 回復 8% 傷害 | 回復 15% 傷害 |
| SSR | 回復 12% 傷害 | 回復 20% 傷害 |

#### critical 暴擊

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | CritRate +4% | CritRate +8% |
| R | CritRate +6% | CritRate +12%、CritDmg +8% |
| SR | CritRate +10% | CritRate +20%、CritDmg +15% |
| SSR | CritRate +15% | CritRate +28%、CritDmg +20% |

#### lethal 致命

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | CritDmg +10% | CritDmg +20% |
| R | CritDmg +15% | CritDmg +28% |
| SR | CritDmg +20% | CritDmg +40%、暴擊無視 10% DEF |
| SSR | CritDmg +30% | CritDmg +55%、暴擊無視 20% DEF |

#### vitality 生命

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | HP +8% | HP +15% |
| R | HP +12% | HP +22% |
| SR | HP +18% | HP +30%、回合開始回復 3% HP |
| SSR | HP +25% | HP +40%、回合開始回復 5% HP |

#### counter 反擊

| 稀有度 | 2 件 | 4 件（含 2 件） |
|--------|------|----------------|
| N | 10% 反擊 | 18% 反擊 |
| R | 15% 反擊 | 25% 反擊 |
| SR | 20% 反擊 | 35% 反擊、反擊傷害 +15% |
| SSR | 25% 反擊 | 45% 反擊、反擊傷害 +25% |

### 取得方式

#### A. 裝備抽卡（主要途徑）

| 池 | 貨幣 | 單抽 | 十連 | SSR | SR | R | N |
|----|------|------|------|-----|----|----|---|
| 金幣裝備池 | 金幣 | 10,000 | 90,000 | 2% | 10% | 35% | 53% |
| 鑽石裝備池 | 鑽石 | 200 | 1,800 | 8% | 25% | 40% | 27% |

- 從 128 種模板中隨機抽 1 件
- **可重複取得**（多件同模板給不同英雄穿）
- 十連保底：至少 1 件 SR 以上

#### B. 商店（賣最好的）

| 商店 | 貨幣 | 商品 | 刷新 |
|------|------|------|------|
| 競技商店 | 競技幣 | SSR 裝備（每週輪替 2 件） | 每週 |
| 星塵商店 | 星塵 | SSR 裝備（永久可選，高價） | 不刷新 |

### 資料結構

```typescript
/** 玩家擁有的單件裝備（存在 save_data.equipment JSON 陣列中） */
interface OwnedEquipment {
  id: string            // 唯一 ID: "EQ_{timestamp}_{random}"
  templateId: string    // "eq_berserker_weapon_SSR"
  enhanceLevel: number  // 0 ~ maxLevel
  equippedBy: string    // heroInstanceId 或 '' (在背包)
}

/** 模板定義（前端常數，不需 Sheet） */
interface EquipmentTemplate {
  templateId: string    // "eq_{setId}_{slot}_{rarity}"
  setId: string
  slot: EquipmentSlot
  rarity: 'N' | 'R' | 'SR' | 'SSR'
  mainStat: string      // 'ATK' | 'DEF' | 'CritRate' | 'SPD'
  mainStatBase: number
}
```

> 相比舊版 `EquipmentInstance`，移除了 `subStats`、`locked`、`obtainedAt`。
> 不需要 `equipment_instances` Sheet，裝備資料直接存在 `save_data.equipment` JSON 欄位。

### 已移除項目（v2.0）

| 移除項目 | 說明 |
|---------|------|
| 副屬性系統 | `subStats` 隨機池、重洗石 |
| 鍛造系統 | 32 種圖紙 + 3 種鍛造礦 |
| ~~拆解系統~~ | ~~裝備 → 強化石~~（v2.4 重新引入為「分解」系統，見 §四.分解） |
| 強化石（3 種） | 改為只消耗金幣 |
| 裝備容量管理 | 不再限容量（模板制無上限問題） |
| 擴容機制 | 移除 |
| ~~鎖定功能~~ | v2.0 移除；v2.4 分解系統不設鎖定，UI 與 API 已完全移除 locked 欄位 |

### 分解系統（v2.4 新增）

多餘裝備可在**背包面板**直接分解，獲得金幣 + 裝備碎片（裝備碎片）。

#### 分解產出公式

| 稀有度 | 金幣 | 裝備碎片 |
|--------|------|----------|
| N | 100 | 1 |
| R | 300 | 2 |
| SR | 800 | 4 |
| SSR | 2,000 | 8 |

> 已穿戴在英雄身上的裝備需先卸下才能分解。無鎖定機制。

#### 碎片兌換商店（v2.4 新增）

商店新增「碎片兌換」分頁，使用裝備碎片兌換強化用道具：

| 商品 | 碎片花費 |
|------|----------|
| 裝備寶箱 ×1 | 10 碎片 |
| 小型強化石 ×5 | 3 碎片 |
| 中型強化石 ×3 | 8 碎片 |
| 大型強化石 ×2 | 15 碎片 |

---

## 五、最終數值計算（getFinalStats）

```typescript
function getFinalStats(base: BaseStats, hero: HeroInstanceData): FinalStats {
  // 1. 基礎成長（HP/ATK/DEF）
  stat = Math.floor(base × (1 + (level-1) × growth[rarity]) × ascMult × starMult)
  // SPD/CritRate/CritDmg = base（不受等級/突破/星級影響）

  // 2. 裝備主屬性 + 強化（模板制 v2）
  mainStatValue = enhancedMainStat(template.mainStatBase, enhanceLevel, rarity)
  // → addStatFlat(stats, template.mainStat, mainStatValue)

  // 3. 套裝效果（同 setId + 同 rarity 計件，≥4 件用 4 件效果，≥2 件用 2 件效果）
  // → 純數值套裝（ATK%/DEF%/HP%/CritRate%/CritDmg%/SPD flat）加入百分比/flat 累計
  // → 特殊套裝（lifesteal/counter/dmg_reduce/def_ignore/regen）在戰鬥引擎中處理

  // 4. 所有百分比一次乘算：Math.floor(stat × (1 + totalPercent / 100))
}
```

---

## 六、Service 層（progressionService）

全部 11 個操作走 `fireOptimisticAsync`（Optimistic Queue）：

| 函式 | action | 說明 |
|------|--------|------|
| `upgradeHero(instanceId, materials)` | `upgrade-hero` | 消耗經驗素材升級 |
| `ascendHero(instanceId)` | `ascend-hero` | 突破 |
| `starUpHero(instanceId)` | `star-up-hero` | 升星 |
| `enhanceEquipment(equipId)` | `enhance-equipment` | 裝備強化（只消耗金幣） |
| `equipGachaPull(poolType, count)` | `equip-gacha-pull` | 裝備抽卡（金幣池 / 鑽石池） |
| `completeStage(stageId, stars)` | `complete-stage` | 主線通關結算 |
| `completeTower(floor)` | `complete-tower` | 爬塔通關結算 |
| `completeDaily(dungeonId, tier)` | `complete-daily` | 副本通關結算 |
| `completeBattle(resultData)` | `complete-battle` | **統一戰鬥結算**（POST seed/snapshot/localWinner/stageMode/stageId/starsEarned），為主結算路徑；舊 completeStage/completeTower/completeDaily 保留向下相容 |
| `gachaPull(bannerId, count)` | `gacha-pull` | 英雄抽卡 |
| `getGachaPoolStatus()` | `gacha-pool-status` | 查詢池剩餘（直接 callApi） |

---

## 七、UI 養成操作狀態

| 操作 | UI 按鈕 | 狀態 |
|------|--------|------|
| 升級 | 📈 升級 | ✅ **已實作** — EXP 滑桿選擇投入量 + 預覽 + Optimistic update |
| 突破 | 🔥 突破 | ✅ **已實作** — canAscend 檢查 + 費用顯示 + Optimistic update |
| 升星 | ⭐ 升星 | ✅ **已實作** — canStarUp 檢查 + 碎片費用 + Optimistic update |
| 裝備穿脫 | ⚔️/🛡️/💍/👢 | ✅ **已實作** — 4 槽位（weapon/armor/ring/boots）、裝備選擇彈窗、卸下功能 |
| 裝備強化 | ⚒️ 強化 | ✅ **已實作** — 英雄詳情裝備格位 + 背包面板均可點擊 ⚒️ → 顯示費用 + 確認 → 僅消耗金幣 |
| 裝備分解 | 🗑️ 分解 | ✅ **已實作** — 背包面板選取裝備 → 分解 → 獲得金幣 + 裝備碎片（依稀有度） |
| 套裝效果顯示 | 📋 套裝 | ✅ **已實作** — 英雄詳情面板顯示當前已啟用的套裝加成效果 |
| 碎片兌換商店 | 🔄 碎片兌換 | ✅ **已實作** — 商店新分頁，用裝備碎片兌換強化素材 |
| 裝備抽卡 | 🎰 裝備抽 | ❌ 未實作 — 需新增裝備抽卡頁面（金幣池 / 鑽石池、單抽 / 十連） |

> 全部養成操作均透過 `progressionService` 走 Optimistic Queue，本地即時更新 + 背景同步 GAS。

---

## 八、每日簽到系統

> **v2.2 新增**

### 概述

7 天循環簽到獎勵系統，每日可簽到一次領取獎勵。UTC+8 日期判斷。

### GAS Handler

`handleDailyCheckin_()` — action: `daily-checkin`

```
POST { action: 'daily-checkin', guestToken }
    ↓
1. resolvePlayerId_(guestToken) → playerId
2. 取得 UTC+8 當日日期（YYYY-MM-DD）
3. 讀取 save_data.checkinLastDate
4. 若 checkinLastDate === 當日 → { success: false, reason: 'already_checked_in' }
5. 讀取 checkinDay → 遞增（>7 重置為 1）
6. 依 checkinDay 發放對應獎勵（7 天循環表）
7. 更新 checkinDay + checkinLastDate + lastSaved
8. 回傳 { success: true, day: checkinDay, rewards: [...] }
```

### 7 天獎勵循環

| Day | 獎勵 |
|-----|------|
| 1 | 金幣 |
| 2 | 經驗素材 |
| 3 | 鑽石 |
| 4 | 突破素材 |
| 5 | 金幣 + 經驗素材 |
| 6 | 鑽石 + 素材 |
| 7 | 大獎（高額鑽石/稀有素材） |

> 獎勵具體數值由 GAS `handleDailyCheckin_()` 內部定義。

### SaveData 欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `checkinDay` | number | 當前簽到天數（1~7 循環） |
| `checkinLastDate` | string | 上次簽到日期（UTC+8 格式 `YYYY-MM-DD`） |

### 前端

- **元件**：`CheckinPanel.tsx`（見 `ui-flow.md` §6.15）
- **Service**：`saveService.ts` — `doDailyCheckin()` 呼叫 GAS `daily-checkin` action
- **MenuScreen**：MainMenu 新增 `'checkin'` 選項

---

## 擴展點

- [ ] **專屬裝備**：特定英雄專用武器（有專屬套裝 bonus）
- [ ] **天賦樹**：每角色 3 條天賦路線（攻擊/防禦/輔助），每條 5 節點
- [ ] **外觀系統**：覺醒後替換模型
- [ ] **好感度系統**：互動解鎖語音/劇情
- [ ] **裝備合成**：3×同稀有度同模板 → 高一級稀有度（N→R→SR→SSR）
- [x] **裝備分解回收**：~~分解多餘裝備回收少量金幣~~（✅ v2.4 已完成 — 分解獲得金幣 + 裝備碎片，碎片兌換商店可換取強化素材）
- [x] **UI 槽位對齊**：~~HeroListPanel 3 槽 → 與 domain 4 槽一致~~（✅ 已完成）
- [x] **UI 養成按鈕啟用**：~~升級/突破/升星功能已有 service+domain，缺 UI 串接~~（✅ 已完成）

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版草案 |
| v0.2 | 2026-02-26 | 重寫：4 格位裝備 + 套裝 + 鍛造合成 + 強化重置 + 星級系統 + 素材式升級 |
| v0.3 | 2026-02-28 | Optimistic Queue、自動升級計算、EXP 進度條、addItemsLocally |
| v1.0 | 2026-03-01 | 全面同步實作：補齊所有 domain 常數表（ASCENSION_LEVEL_CAP / MULTIPLIER / STAR系列 / SUB_STAT_POOL / 8 套裝）、所有匯出函式簽名、getFinalStats 5 步計算流程、consumeExpMaterials 函式、service 層 11 個 API 全列、UI 養成按鈕狀態（disabled）、裝備槽數不一致標注、鍛造/拆解 domain 缺失說明 |
| v1.1 | 2026-02-28 | 養成 UI 全面實作：升級（素材選擇 exp_core S/M/L + 預覽 + optimistic update）、突破（canAscend 驗證 + 費用顯示）、升星（canStarUp 驗證 + 碎片費用）、裝備穿脫（4 槽 weapon/armor/ring/boots + 選擇彈窗 + 卸下）、全部走 Optimistic Queue |
| v1.2 | 2026-02-28 | **Bug Fix**：升級/突破/升星操作新增本地樂觀扣除素材（`removeItemsLocally`）；戰鬥 HP 條改讀實際 `battleHero.maxHP`；存檔星級改讀 `inst.stars` |
| v1.3 | 2026-06-14 | **稀有度差異化成長**：新增 RARITY_LEVEL_GROWTH / RARITY_ASC_MULT / RARITY_STAR_MULT 三張查找表，等級/突破/星級成長係數依稀有度差異化（★1=3%/lv, ★2=3.5%, ★3=4%不變, ★4=5%）；getStatAtLevel / getAscensionMultiplier / getStarMultiplier / getFinalStats 新增可選 rarity 參數（預設=3 向下相容） |
| v1.4 | 2026-03-01 | 新增 `completeBattle()` 統一結算 API（POST `complete-battle`），對應 GAS `handleCompleteBattle_`；STAR_PASSIVE_SLOTS 補齊全 7 級（★0~★6 → 1/1/2/2/3/3/4）；舊 completeStage/completeTower/completeDaily 保留向下相容 |
| v2.0 | 2026-06-15 | **裝備系統 v2 — 模板制大改版**：移除副屬性隨機池、鍛造/拆解系統、強化石、容量管理；改為 128 固定模板（8 套裝 × 4 部位 × 4 稀有度 N/R/SR/SSR）；強化只消耗金幣；新增裝備抽卡取得途徑（金幣池 / 鑽石池）；套裝效果改為 2 件 + 4 件且按稀有度差異化；同 setId + 同 rarity 才計件；Service 層移除 forge/dismantle、新增 enhanceEquipment / equipGachaPull |
| v2.1 | 2026-06-15 | **裝備系統接通**：修正 App.tsx/useCombatPower 中 `equipment:[]` 改為讀取 `getHeroEquipment()`、裝備數值正式影響戰鬥與戰力；`enhancedMainStat` 依稀有度差異化成長(N:6%/R:8%/SR:10%/SSR:12%)；`getEnhanceCost` 基礎費用調升(N:200/R:500/SR:1000/SSR:2000)；EQUIPMENT_SETS 新增 8 套 4pc 效果；`getActiveSetBonuses` 改為同 setId+同 rarity 才計件；新增 `enhanceEquipment()` service + 強化 UI Modal；GAS enhance handler 改為僅消耗金幣；InventoryPanel tabs 清理移除 3 個廢棄分頁 |
| v2.2 | 2026-03-02 | **每日簽到系統**：新增 §八 每日簽到（7 天循環、UTC+8 日期邏輯、GAS `handleDailyCheckin_()` handler）；SaveData 新增 `checkinDay` / `checkinLastDate` 欄位；前端 `CheckinPanel.tsx` + `doDailyCheckin()` service |
| v2.3 | 2026-03-02 | **EXP 資源重構**：移除 exp_core_s/m/l 道具，EXP 改為頂層資源（save_data.exp）；英雄升級改用 EXP 資源 + 滑桿 UI；戰鬥獎勵/離線計時器/商店皆直接發放 EXP；主選單頂欄新增 EXP 顯示；勝利面板顯示 EXP 獎勵 |
| v2.4 | 2026-06-19 | **裝備養成強化**：① 英雄詳情面板顯示已啟用套裝加成效果；② 裝備分解系統（背包面板分解 → 金幣 + 裝備碎片，N:100金+1片/R:300金+2片/SR:800金+4片/SSR:2000金+8片）；③ 碎片兌換商店新分頁（裝備寶箱10片/小型強化石×5=3片/中型強化石×3=8片/大型強化石×2=15片）；④ 裝備鎖定功能完全移除（UI + API locked 欄位清除）；⑤ 背包面板可直接強化裝備（不限於英雄詳情頁） |
| v2.5 | 2026-06-20 | **前後端公式一致性對齊 + UI 強化**：① 升級經驗公式對齊後端 `level * 100`（原前端用 tier-based 公式）；② 突破等級上限對齊後端 `{20,40,60,80,90,100}`（原前端 `{20,30,40,50,60,60}`）；③ 突破素材消耗對齊後端（碎片10/20/30/50/80，職業石5/10/15/20/30，金幣5k/10k/20k/40k/80k）；④ 強化費用倍率對齊後端 `*0.3`（原前端 `*0.5`）；⑤ 後端強化不再修改 mainStatValue（由前端 `enhancedMainStat` 從 base 計算）；⑥ 英雄面板顯示裝備+套裝加成後的最終數值；⑦ 升級 UI 重做（左右按鈕 + 統計預覽 + 持久模態）；⑧ 難度圖示改用⭐星星（原💀骷髏）；⑨ 分解新增確認面板（顯示預估金幣+碎片返還）；⑩ 商店移除強化石品項；⑪ 券類圖示統一（英雄券🎟️，裝備券🔧）；⑫ 關卡卡片新增獎勵預覽 || v2.6 | 2026-03-05 | **每日挑戰次數限制**：①新增 §一.1 每日挑戰次數限制章節（DAILY_LIMITS: daily=3/pvp=5/boss=3，後端強制，敗北也消耗）②D1 `save_data` 新增 `dailyCounts TEXT` 欄位（JSON，自動每日重置）③參照 `stage-system.md` v2.9 完整每日限制機制說明 |