# 養成系統 Spec

> 版本：v2.0 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 負賬角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

角色成長路徑：**等級**（消耗素材升級）、**突破**（提升等級上限+屬性加成）、**星級**（碎片升星，解鎖被動技能）、**裝備**（模板制 128 種，4 格位 × 8 套裝 × 4 稀有度，主屬性 + 強化，套裝 2 件 / 4 件效果，抽卡取得可重複持有）。

養成 UI 已全面實作：升級（素材選擇 + 預覽）、突破、升星、裝備穿脫均可操作，全部走 Optimistic Queue。

## 依賴

- `specs/hero-schema.md` — HeroInstance 結構（HP, ATK, DEF, SPD, CritRate, CritDmg, stars）
- `specs/skill-system.md` — 被動技能星級解鎖
- `specs/save-system.md` — 存檔結構
- `specs/inventory.md` — 素材消耗與背包操作（經驗核心/碎片/職業石/強化石等）

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
| 等級範圍 | 1-60 |
| 升級方式 | 消耗「經驗素材」（非自動經驗） |
| 等級上限 | 由突破階段決定（見 §二） |

### 升級所需經驗（expToNextLevel）

```typescript
function expToNextLevel(level: number): number {
  const base = 100
  const tier = Math.floor((level - 1) / 10)  // 0-5
  return Math.floor(base * Math.pow(1.8, tier) * (1 + (level % 10) * 0.15))
}
```

| 等級 | 升級 EXP（約） | 累計（約） |
|------|--------------|-----------|
| 1→2 | 100 | 100 |
| 10→11 | 235 | 1,600 |
| 20→21 | 762 | 8,500 |
| 30→31 | 2,468 | 36,000 |
| 40→41 | 7,993 | 140,000 |
| 50→51 | 25,894 | 500,000 |

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

### 經驗素材

| 素材 | 提供經驗 | 來源 |
|------|---------|------|
| 小型經驗核心 | 100 EXP | 主線掉落、資源計時器、每日副本 |
| 中型經驗核心 | 500 EXP | 主線後期、每日副本（中/高級） |
| 大型經驗核心 | 2,000 EXP | 爬塔獎勵（每10層）、Boss 戰 |

---

## 二、突破系統

### 突破等級上限表（ASCENSION_LEVEL_CAP）

| 突破階段 | 0（初始） | 1 | 2 | 3 | 4 | 5（覺醒） |
|---------|----------|---|---|---|---|----------|
| 等級上限 | 20 | 30 | 40 | 50 | 60 | 60 |

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
| 0→1 | 5 | 3 | 5,000 |
| 1→2 | 10 | 8 | 15,000 |
| 2→3 | 20 | 15 | 40,000 |
| 3→4 | 40 | 25 | 80,000 |
| 4→5 | 60 | 40 | 150,000 |

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
- 養成深度靠「強化」+「湊套裝」
- 無副屬性、無鍛造、無拆解、無重洗、無裝備容量限制

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
  return Math.floor(baseCost[rarity] * (1 + currentLevel * 0.5))
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
| 拆解系統 | 裝備 → 強化石 |
| 強化石（3 種） | 改為只消耗金幣 |
| 裝備容量管理 | 不再限容量（模板制無上限問題） |
| 擴容機制 | 移除 |
| 鎖定功能 | 不能拆解 → 不需要鎖 |

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
| 升級 | 📈 升級 | ✅ **已實作** — 素材選擇（經驗核心 S/M/L）+ 預覽 + Optimistic update |
| 突破 | 🔥 突破 | ✅ **已實作** — canAscend 檢查 + 費用顯示 + Optimistic update |
| 升星 | ⭐ 升星 | ✅ **已實作** — canStarUp 檢查 + 碎片費用 + Optimistic update |
| 裝備穿脫 | ⚔️/🛡️/💍/👢 | ✅ **已實作** — 4 槽位（weapon/armor/ring/boots）、裝備選擇彈窗、卸下功能 |
| 裝備強化 | ⚒️ 強化 | ✅ **已實作** — 在英雄詳情裝備格位點擊 ⚒️ → 顯示費用 + 確認 → 僅消耗金幣 |
| 裝備抽卡 | 🎰 裝備抽 | ❌ 未實作 — 需新增裝備抽卡頁面（金幣池 / 鑽石池、單抽 / 十連） |

> 全部養成操作均透過 `progressionService` 走 Optimistic Queue，本地即時更新 + 背景同步 GAS。

---

## 擴展點

- [ ] **專屬裝備**：特定英雄專用武器（有專屬套裝 bonus）
- [ ] **天賦樹**：每角色 3 條天賦路線（攻擊/防禦/輔助），每條 5 節點
- [ ] **外觀系統**：覺醒後替換模型
- [ ] **好感度系統**：互動解鎖語音/劇情
- [ ] **裝備合成**：3×同稀有度同模板 → 高一級稀有度（N→R→SR→SSR）
- [ ] **裝備分解回收**：分解多餘裝備回收少量金幣
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