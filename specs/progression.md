# 養成系統 Spec

> 版本：v1.4 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 負賬角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

角色成長路徑：**等級**（消耗素材升級）、**突破**（提升等級上限+屬性加成）、**星級**（碎片升星，解鎖被動技能）、**裝備**（4 格位 + 套裝效果 + 強化，可完整重置退還素材）。

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

## 四、裝備系統

### 格位（Domain 定義 4 格）

```typescript
type EquipmentSlot = 'weapon' | 'armor' | 'ring' | 'boots'
```

| 格位 | 主屬性 | 說明 |
|------|--------|------|
| 武器 (weapon) | ATK | 提升攻擊力 |
| 護甲 (armor) | HP 或 DEF | 提升生存 |
| 戒指 (ring) | CritRate 或 CritDmg | 提升暴擊 |
| 鞋子 (boots) | SPD | 提升速度 |

> ✅ **UI 已對齊**：HeroListPanel 顯示 4 個裝備槽（weapon/armor/ring/boots），與 domain 4 槽一致。支援裝備選擇彈窗 + 卸下功能。

### 裝備稀有度

| 稀有度 | 副屬性條數 | 最大強化等級 |
|--------|-----------|------------|
| N（普通） | 0 | +5 |
| R（精良） | 1 | +10 |
| SR（稀有） | 2 | +15 |
| SSR（傳說） | 3 | +20 |

### 副屬性隨機池（SUB_STAT_POOL）

| 副屬性 | Flat 範圍 | % 範圍 | 可百分比 |
|--------|----------|--------|---------|
| ATK | 5-30 | 3%-15% | ✅ |
| HP | 50-300 | 3%-15% | ✅ |
| DEF | 3-20 | 3%-15% | ✅ |
| SPD | 1-8 | — | ❌（僅 flat） |
| CritRate | — | 2%-10% | ✅（僅 %） |
| CritDmg | — | 4%-20% | ✅（僅 %） |

### 裝備強化

```typescript
function enhancedMainStat(baseValue: number, enhanceLevel: number): number {
  return Math.floor(baseValue * (1 + enhanceLevel * 0.1))  // 每級 +10% of base
}

function getEnhanceCost(currentLevel: number, rarity: Rarity): number {
  const baseCost = { N: 100, R: 200, SR: 500, SSR: 1000 }
  return Math.floor(baseCost[rarity] * (1 + currentLevel * 0.5))
}
```

### 套裝系統（8 套）

穿戴同套裝 **2 件**觸發套裝效果：

| setId | 名稱 | 2 件效果 | bonusType |
|-------|------|---------|-----------|
| `berserker` | 狂戰士 | ATK +15% | `ATK_percent` |
| `ironwall` | 鐵壁 | DEF +20% | `DEF_percent` |
| `gale` | 疾風 | SPD +15 | `SPD_flat` |
| `vampire` | 吸血 | 攻擊回復 12% 傷害 | `lifesteal` |
| `critical` | 暴擊 | CritRate +12% | `CritRate_percent` |
| `lethal` | 致命 | CritDmg +25% | `CritDmg_percent` |
| `vitality` | 生命 | HP +20% | `HP_percent` |
| `counter` | 反擊 | 被攻擊時 20% 反擊 | `counter` |

> `lifesteal` 和 `counter` 效果在戰鬥引擎中處理，不在 `getFinalStats` 計算。

### 裝備容量

| 項目 | 值 |
|------|-----|
| 基礎容量 | 200 件 |
| 每次擴容 | +50 件 |
| 擴容費用 | 100 鑽石/次 |
| 最大容量 | 500 件 |

```typescript
function getEquipmentCapacity(expandCount: number): number {
  return Math.min(500, 200 + expandCount * 50)
}
```

### 鍛造 / 合成 / 拆解

| 操作 | Service API | Domain 公式 | 備註 |
|------|-----------|------------|------|
| 鍛造 | `forgeEquipment(blueprintItemId)` | ❌ 無 domain 函式 | 僅 GAS 呼叫 |
| 拆解 | `dismantleEquipment(equipId)` | ❌ 無 domain 函式 | 僅 GAS 呼叫 |
| 合成 | — | ❌ 未實作 | Spec 設計中 |

---

## 五、最終數值計算（getFinalStats）

```typescript
function getFinalStats(base: BaseStats, hero: HeroInstanceData): FinalStats {
  // 1. 基礎成長（HP/ATK/DEF）
  stat = Math.floor(base × (1 + (level-1) × 0.04) × ascMult × starMult)
  // SPD/CritRate/CritDmg = base（不受等級/突破/星級影響）

  // 2. 裝備主屬性 + 強化
  mainStatValue = enhancedMainStat(base, enhanceLevel)
  // → addStatFlat(stats, mainStat, mainStatValue)

  // 3. 副屬性 flat 值直加
  // 4. 副屬性百分比累計
  // 5. 套裝百分比加成累計（ATK_percent / DEF_percent / HP_percent / CritRate_percent / CritDmg_percent）
  // 6. SPD_flat 套裝直加
  // 7. 所有百分比一次乘算：Math.floor(stat × (1 + totalPercent / 100))
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
| `enhanceEquipment(equipId, materials)` | `enhance-equipment` | 裝備強化 |
| `forgeEquipment(blueprintItemId)` | `forge-equipment` | 鍛造裝備 |
| `dismantleEquipment(equipId)` | `dismantle-equipment` | 拆解裝備 |
| `completeStage(stageId, stars)` | `complete-stage` | 主線通關結算 |
| `completeTower(floor)` | `complete-tower` | 爬塔通關結算 |
| `completeDaily(dungeonId, tier)` | `complete-daily` | 副本通關結算 |
| `completeBattle(resultData)` | `complete-battle` | **統一戰鬥結算**（POST seed/snapshot/localWinner/stageMode/stageId/starsEarned），為主結算路徑；舊 completeStage/completeTower/completeDaily 保留向下相容 |
| `gachaPull(bannerId, count)` | `gacha-pull` | 抽卡 |
| `getGachaPoolStatus()` | `gacha-pool-status` | 查詢池剩餘（直接 callApi） |

---

## 七、UI 養成操作狀態

| 操作 | UI 按鈕 | 狀態 |
|------|--------|------|
| 升級 | 📈 升級 | ✅ **已實作** — 素材選擇（經驗核心 S/M/L）+ 預覽 + Optimistic update |
| 突破 | 🔥 突破 | ✅ **已實作** — canAscend 檢查 + 費用顯示 + Optimistic update |
| 升星 | ⭐ 升星 | ✅ **已實作** — canStarUp 檢查 + 碎片費用 + Optimistic update |
| 裝備穿脫 | ⚔️/🛡️/💍/👢 | ✅ **已實作** — 4 槽位（weapon/armor/ring/boots）、裝備選擇彈窗、卸下功能 |

> 全部養成操作均透過 `progressionService` 走 Optimistic Queue，本地即時更新 + 背景同步 GAS。

---

## 擴展點

- [ ] **裝備鍛造升級**：圖紙升級，鍛造出更高品質
- [ ] **4 件套效果**：目前只做 2 件套
- [ ] **專屬裝備**：特定英雄專用武器
- [ ] **天賦樹**：每角色 3 條天賦路線（攻擊/防禦/輔助），每條 5 節點
- [ ] **外觀系統**：覺醒後替換模型
- [ ] **好感度系統**：互動解鎖語音/劇情
- [ ] **合成系統**：3×同稀有度裝備 → 高一級（Spec 設計中）
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