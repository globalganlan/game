# 關卡系統 Spec

> 版本：v1.1 ｜ 狀態：🟢 已實作
> 最後更新：2026-02-28
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

五種已實作關卡模式：**主線章節**（劇情推進）、**無盡爬塔**（挑戰極限）、**每日副本**（素材農場）、**PvP 競技場**（每日對手）、**Boss 挑戰**（高難度單體戰）。
所有模式共用 `core-combat.md` 戰鬥引擎，差異在於敵方配置、勝負條件、獎勵。
敵方配置全部由**前端 seeded PRNG** 確定性生成，無需 GAS 端提供關卡配置。

## 依賴

- `specs/core-combat.md` — 戰鬥引擎
- `specs/hero-schema.md` — 英雄數值（ZOMBIE_IDS [1-14]）
- `specs/save-system.md` — 進度儲存（storyProgress / towerFloor / stageStars）
- `specs/auth-system.md` — 玩家身份

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/domain/stageSystem.ts` | 核心邏輯 — 配置生成 / PRNG / 星級計算 / 副本定義 / 掉落擲骰 |
| `src/components/StageSelect.tsx` | 關卡選擇 UI — 5 個分頁（主線/爬塔/每日/競技場/Boss） |
| `src/App.tsx` | 遊戲流程整合 — handleStageSelect / buildEnemySlots / 勝利結算 / goNextStage |
| `gas/程式碼.js` | GAS Handler — `handleCompleteStage_ / handleCompleteTower_ / handleCompleteDaily_` |

---

## 核心常數

```typescript
const MAX_CHAPTER = 3
const STAGES_PER_CHAPTER = 8
const ZOMBIE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
```

## Seeded PRNG

所有敵方組合使用確定性偽隨機生成（Linear Congruential Generator）：

```typescript
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}
```

| 模式 | Seed 公式 |
|------|----------|
| 主線 | `chapter * 1000 + stage` |
| 爬塔 | `floor * 7919`（7919 為質數） |

---

## 一、主線章節

### 結構

```
章節 1（共 8 關）
├── 1-1 ~ 1-7  一般關
└── 1-8        章節 Boss 關（首通獎勵含 20 鑽石）

章節 2（通關 1-8 後解鎖）
└── 2-1 ~ 2-8

章節 3（通關 2-8 後解鎖）
└── 3-1 ~ 3-8
```

| 項目 | 值 |
|------|-----|
| 每章關卡數 | 8 關 |
| 章節數 | 3 章（共 24 關） |
| 體力消耗 | **無**（免費無限挑戰） |
| stageId 格式 | `"{chapter}-{stage}"`（如 `"2-5"`） |
| 星級評價 | ★★★（全員存活）、★★（≤2 人陣亡）、★（通關即可） |
| 三星鎖定 | 已獲 3 星的關卡顯示 ✅ 並禁止再挑戰（`stage-maxed` class） |
| 星級記錄 | `save_data.stageStars` JSON，`updateStageStars()` 只升不降 |
| 首通效果 | 推進 storyProgress + 更新 resourceTimerStage + 首通獎勵 |

### 敵方配置公式（getStoryStageConfig）

```typescript
linearIndex = (chapter - 1) * 8 + stage  // 1~24
seed = chapter * 1000 + stage

// 敵人數量
minCount = min(2 + floor(linearIndex / 4), 6)
maxCount = min(minCount + 2, 6)
enemyCount = minCount + floor(rng() * (maxCount - minCount + 1))

// 倍率
hpMult    = 1.0 + (linearIndex - 1) * 0.12
atkMult   = 1.0 + (linearIndex - 1) * 0.08
speedMult = 1.0 + (linearIndex - 1) * 0.015

// 敵人 heroId 從 ZOMBIE_IDS [1-14] 隨機選取
recommendedLevel = min(1 + (linearIndex - 1) * 2, 60)
```

### 獎勵公式

| 類型 | exp | gold | diamond | items |
|------|-----|------|---------|-------|
| **普通** | `30 + linearIndex × 15` | `50 + linearIndex × 30` | 章底關(stage=8): 20, 其餘: 0 | `linearIndex % 3 === 0` → `exp_core_s ×1` (60%) |
| **首通** | `60 + linearIndex × 20` | `100 + linearIndex × 50` | 30 | `exp_core_s ×2` (100%) |

### 星級判定（calculateStarRating）

```typescript
survivingHeroes >= totalHeroes            → ⭐⭐⭐ (3)
totalHeroes - survivingHeroes <= 2        → ⭐⭐   (2)
otherwise                                 → ⭐     (1)
```

### 下一關（getNextStageId）

`stage + 1`，若 `> 8` → `chapter + 1, stage = 1`。若 `chapter > MAX_CHAPTER` → 回傳 `null`（全通關）。

---

## 二、無盡爬塔

### 機制

```
第 1 層 → 第 2 層 → ... → 第 N 層（無上限）
    每層 seeded PRNG 生成固定敵方配置
    每 10 層一個 Boss 層（單體高數值 + 獎勵加倍）
    打不過 = 停在該層，下次再挑戰
```

| 項目 | 值 |
|------|-----|
| 體力消耗 | **0** |
| stageId 格式 | `"{floor}"`（純數字，如 `"15"`） |
| 重置週期 | 不重置，永久進度 |
| 存檔欄位 | `save_data.towerFloor` |

### 敵方配置公式（getTowerFloorConfig）

```typescript
seed = floor * 7919
hpMult    = 1.0 + floor * 0.15
atkMult   = 1.0 + floor * 0.10
speedMult = 1.0 + floor * 0.02

// Boss 層（floor % 10 === 0）
enemies = [{ heroId: random, slot: 1, hp: hpMult×3, atk: atkMult×2, speed: speedMult }]

// 普通層
enemyCount = min(6, 3 + floor(floor / 5))
enemies = randomFormation(enemyCount, hpMult, atkMult, speedMult)
```

### 獎勵公式（getTowerReward）

| 條件 | exp | gold | diamond | items |
|------|-----|------|---------|-------|
| Boss 層 (floor%10=0) | `50 + floor×10` | `100 + floor×20` | 50 | `chest_equipment ×1` (100%) |
| 每5層 (floor%5=0) | `50 + floor×10` | `100 + floor×20` | 0 | `exp_core_m ×1` (50%) |
| 其他 | `50 + floor×10` | `100 + floor×20` | 0 | 無 |

### 連續挑戰（goNextStage — tower）

勝利後可點「下一層」，恢復戰前 HP（`preBattlePlayerSlotsRef`），不回大廳。

---

## 三、每日副本

### 三種副本定義

| dungeonId | 名稱 | 開放日 | 掉落主題 |
|-----------|------|--------|---------|
| `power_trial` | 力量試煉 | 週一(1)、週四(4) | 力量職業石 + 強化石 |
| `agility_trial` | 敏捷試煉 | 週二(2)、週五(5) | 敏捷職業石 + 強化石 |
| `defense_trial` | 防禦試煉 | 週三(3)、週六(6) | 防禦職業石 + 強化石 |

**週日(0)**：三個副本全部開放。

| 項目 | 值 |
|------|-----|
| stageId 格式 | `"{dungeonId}_{tier}"`（如 `"power_trial_easy"`） |
| 難度分級 | `easy` / `normal` / `hard` |
| 解鎖條件 | Easy: Ch.1、Normal: Ch.2、Hard: Ch.3 |

### 難度配置（以力量試煉為例）

| 難度 | 敵人數 | HP/ATK/SPD 倍率 | 敵方 heroIds |
|------|--------|-----------------|-------------|
| easy | 3 | 1.0 / 1.0 / 1.0 | [2, 8, 13] |
| normal | 4 | 1.5 / 1.3 / 1.1 | [2, 8, 13, 2] |
| hard | 5 | 2.5 / 2.0 / 1.2 | [2, 8, 13, 2, 8] |

### 獎勵（以力量試煉為例）

| 難度 | exp | gold | 專屬掉落 |
|------|-----|------|---------|
| easy | 100 | 500 | `asc_class_power ×2`, `eqm_enhance_s ×3` |
| normal | 200 | 1000 | `asc_class_power ×4`, `eqm_enhance_m ×2`, `exp_core_m ×1` (50%) |
| hard | 400 | 2000 | `asc_class_power ×8`, `eqm_enhance_l ×1`, `exp_core_l ×1` (30%) |

> Daily 模式勝利後無「下一關」按鈕。

---

## 四、PvP 競技場（✅ 已實作）

### 機制

每日刷新 3 位 AI 對手（seeded by 日期 + 玩家進度），分為 3 個難度梯隊。

| 項目 | 值 |
|------|-----|
| 體力消耗 | **0** |
| 解鎖條件 | 通關 2-1 |
| 刷新週期 | 每日自動刷新（基於日期 seed） |
| stageId 格式 | `"pvp_{opponentId}"` |
| 對手數量 | 固定 3 位 |

### PvPOpponent 型別

```typescript
interface PvPOpponent {
  opponentId: string   // 'pvp_0' | 'pvp_1' | 'pvp_2'
  name: string         // 隨機中文名
  power: number        // 戰力估算
  enemies: StageEnemy[]
}
```

### 對手生成（getPvPOpponents）

```typescript
function getPvPOpponents(storyProgress: { chapter: number; stage: number }): PvPOpponent[]
```

| 梯隊 | 敵人數 | HP 倍率 | ATK 倍率 | SPD 倍率 |
|------|--------|---------|----------|----------|
| i=0（易） | `3 + floor(progress/6)` | `1.0 + progress×0.10` | `1.0 + progress×0.06` | `1.0 + progress×0.01` |
| i=1（中） | `3 + floor(progress/6) + 1` | `1.0 + progress×0.10 + 0.3` | `1.0 + progress×0.06 + 0.2` | 同上 |
| i=2（難） | `3 + floor(progress/6) + 2` | `1.0 + progress×0.10 + 0.6` | `1.0 + progress×0.06 + 0.4` | 同上 |

Seed = `年×10000 + 月×100 + 日 + progress×7`

### PvP 獎勵（getPvPReward）

| exp | gold | diamond | items |
|-----|------|---------|-------|
| `80 + progress×10` | `200 + progress×40` | 10 | `pvp_coin ×(3 + floor(progress/4))` |

### 場景主題

PvP 使用專屬「冷藍電光」競技場主題（Arena `SceneMode = 'pvp'`、`pvpTheme`）。

---

## 五、Boss 挑戰（✅ 已實作）

### 機制

3 位固定 Boss，單體高數值、30 回合限制、傷害段位獎勵。

| 項目 | 值 |
|------|-----|
| 體力消耗 | **0** |
| 解鎖條件 | 通關 2-8 |
| Boss 數量 | 3 位 |
| 回合限制 | 30 回合 |
| stageId 格式 | `"boss_{bossId}"` |

### BOSS_CONFIGS 常數

```typescript
const BOSS_CONFIGS: BossConfig[] = [
  { bossId: 'boss_1', name: '腐化巨獸', heroId: 5,  hp: 5000,  atk: 120, speed: 80,  turnLimit: 30, damageThresholds: { S: 15000, A: 10000, B: 5000, C: 2000 } },
  { bossId: 'boss_2', name: '暗夜領主', heroId: 9,  hp: 8000,  atk: 180, speed: 100, turnLimit: 30, damageThresholds: { S: 25000, A: 18000, B: 10000, C: 4000 } },
  { bossId: 'boss_3', name: '末日審判者', heroId: 14, hp: 12000, atk: 250, speed: 120, turnLimit: 30, damageThresholds: { S: 40000, A: 28000, B: 15000, C: 6000 } },
]
```

### BossConfig 型別

```typescript
interface BossConfig {
  bossId: string
  name: string
  heroId: number
  hp: number
  atk: number
  speed: number
  turnLimit: number
  damageThresholds: { S: number; A: number; B: number; C: number }
}
```

### API 函式

| 函式 | 說明 |
|------|------|
| `getBossConfig(bossId)` | 回傳 BossConfig 或 null |
| `getBossEnemies(bossId)` | 回傳 StageEnemy[]（單一 Boss，倍率由 hp/atk/speed 除以基礎值算出） |
| `getBossReward(bossId, totalDamage)` | 依累計傷害判定段位（S/A/B/C），回傳分級獎勵 |

### Boss 獎勵分級（getBossReward）

| 段位 | 傷害門檻 | exp | gold | diamond | items |
|------|---------|-----|------|---------|-------|
| S | `≥ damageThresholds.S` | 600 | 3000 | 100 | `chest_equipment ×2` |
| A | `≥ damageThresholds.A` | 400 | 2000 | 50 | `chest_equipment ×1` |
| B | `≥ damageThresholds.B` | 200 | 1000 | 20 | `exp_core_l ×1` |
| C | 其他 | 100 | 500 | 0 | `exp_core_m ×1` |

### 場景主題

Boss 使用專屬「煉獄深紅」場景主題（Arena `SceneMode = 'boss'`、`bossTheme`）。

---

## 模式解鎖條件

```typescript
const MODE_UNLOCK = {
  tower: { chapter: 1, stage: 4 },   // 通關 1-4
  daily: { chapter: 1, stage: 8 },   // 通關 1-8
  pvp:   { chapter: 2, stage: 1 },   // 通關 2-1（✅ 已實作）
  boss:  { chapter: 2, stage: 8 },   // 通關 2-8（✅ 已實作）
}

function isModeUnlocked(mode, storyProgress): boolean {
  const playerProgress = (storyProgress.chapter - 1) * 8 + storyProgress.stage
  const reqProgress = (req.chapter - 1) * 8 + req.stage
  return playerProgress >= reqProgress
}
```

鎖定的模式 Tab 點擊時顯示 Toast 提示解鎖條件。

### MainMenu 功能解鎖

| 按鈕 | 解鎖條件 |
|------|---------|
| 🗺️ 關卡 | 無 |
| 🧟 英雄 | 通關 1-1 |
| 🎰 召喚 | 通關 1-2 |
| 🎒 背包 | 通關 1-1 |
| 📬 信箱 | 無 |
| ⚙️ 設定 | 無 |

---

## 選關過場流程

```
handleStageSelect(mode, stageId):
  1. setCurtainVisible(true) — 拉起過場幕
  2. 設定顯示文字（tower: "第 X 層" / daily: 中文名 / story: "關卡 X-Y"）
  3. await waitFrames(2) — 等幕不透明
  4. setStageMode(mode), setStageId(sid)
  5. buildEnemySlotsFromStage(mode, sid, heroesList) — 生成敵方
  6. restoreFormationFromSave() — 恢復玩家陣型
  7. setGameState('IDLE'), 收幕
```

### 勝利結算行為差異

| 模式 | 星級 | 顯示 | 操作按鈕 |
|------|------|------|---------|
| 主線 | ✅ 計算並記錄 | 星級評價 + 首通 Badge + 獎勵 + 資源速度 | 返回大廳 / 下一關 |
| 爬塔 | ❌ 不計算 | 「🗼 第 N 層通關！」+ 獎勵 | 返回大廳 / 下一層 |
| 副本 | ❌ 不計算 | 獎勵 | 返回大廳 |
| PvP | ❌ 不計算 | 獎勵 + 競技幣 | 返回大廳 |
| Boss | ❌ 不計算 | 傷害段位（S/A/B/C）+ 分級獎勵 | 返回大廳 |

- 勝利時不顯示「再戰一次」（僅敗北時顯示）

### 掉落物機制

```typescript
rollDrops(items: StageDropItem[]): InventoryItem[]   // 按 dropRate 機率擲骰
mergeDrops(items: InventoryItem[]): InventoryItem[]   // 合併同 itemId
```

掉落物透過 `addItemsLocally()` 樂觀寫入本地背包。

---

## GAS 後端結算 Handler

### handleCompleteStage_

| 參數 | `{ guestToken, stageId, starsEarned }` |
|------|-------|
| 首通判定 | `stageStars[stageId]` 無值 = 首通 |
| 獎勵公式 | `gold: 100 + ch×50 + st×20`, `exp: 50 + ch×30 + st×10` |
| 首通加碼 | `gold: +200`, `exp: +100`, `diamond: +30` |

### handleCompleteTower_

| 參數 | `{ guestToken, floor }` |
|------|-------|
| 驗證 | `floor === currentFloor + 1` |
| 獎勵公式 | `gold: 100 + floor×20`, `exp: 50 + floor×10`，Boss 層 `diamond: 50` |

### handleCompleteDaily_

| 參數 | `{ guestToken, dungeonId, tier }` |
|------|-------|
| 獎勵 | 硬編碼：easy(500g/100e), normal(1000g/200e), hard(2000g/400e) |

> 注意：前端獎勵公式與 GAS 公式**不完全一致**（前端更細緻），最終以 GAS 回傳為準。

---

## 擴展點

- [x] **PvP 競技場**：每日 seeded 對手 × 3 梯隊 + 競技幣獎勵 + 專屬場景
- [x] **Boss 挑戰**：3 Boss + 30 回合限制 + 傷害段位獎勵 + 專屬場景
- [ ] **PvP 排行榜**：異步 PvP 防守陣容 + 排名
- [ ] **困難模式**：主線 Hard 難度
- [ ] **掃蕩功能**：已三星通關的關卡跳過戰鬥直接領獎
- [ ] **活動關卡**：限時活動副本
- [ ] **Stage 對話系統**：戰前/戰後劇情對話

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版：5 種模式（章節/爬塔/每日/PvP/Boss） |
| v0.2 | 2026-02-26 | 移除體力系統，所有模式免費挑戰 |
| v0.3 | 2026-02-28 | 新增三星鎖定、關卡鎖定 toast、模式解鎖 toast、選關過場遮幕 |
| v0.4 | 2026-02-28 | 每日副本 stageId 中文名、副本專用 config、副本獎勵 |
| v1.0 | 2026-03-01 | 全面同步實作：補齊 stageSystem.ts 所有公式（seeded PRNG / 敵方配置 / 獎勵 / 星級 / 掉落 / 解鎖條件）、3 副本完整數據表、GAS 3 個結算 Handler、標記 PvP + Boss 為未實作、前端勝利結算完整流程、goNextStage 機制 |
| v1.1 | 2026-02-28 | PvP 競技場完整實作：PvPOpponent 型別 + getPvPOpponents()（seeded daily 3 梯隊）+ getPvPReward() + StageSelect 競技場分頁 + Arena pvpTheme；Boss 挑戰完整實作：3 Boss（腐化巨獸/暗夜領主/末日審判者）+ BossConfig + BOSS_CONFIGS + getBossConfig/getBossEnemies/getBossReward + 傷害段位(S/A/B/C)獎勵 + Arena bossTheme；SceneMode 擴展為 5 種 |