# 關卡系統 Spec

> 版本：v2.7 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-06
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

五種已實作關卡模式：**主線章節**（劇情推進）、**無盡爬塔**（挑戰極限）、**每日副本**（素材農場）、**PvP 競技場**（每日對手）、**Boss 挑戰**（高難度單體戰）。
所有模式共用 `core-combat.md` 戰鬥引擎，差異在於敵方配置、勝負條件、獎勵。

主線關卡配置改由 **Workers API + D1 `stage_configs` 表**驅動，前端不再 hardcode。
爬塔、每日副本、PvP、Boss 仍由前端 seeded PRNG 確定性生成。

## 依賴

- `specs/core-combat.md` — 戰鬥引擎
- `specs/hero-schema.md` — 英雄數值（ZOMBIE_IDS [1-14]）
- `specs/save-system.md` — 進度儲存（storyProgress / towerFloor / stageStars）
- `specs/auth-system.md` — 玩家身份
- Cloudflare Workers + D1 — 關卡配置 API

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `workers/src/routes/stage.ts` | Workers API — `/list-stages`、`/stage-config` 端點 |
| `src/services/stageService.ts` | 前端關卡服務 — fetchStageConfigs / getCachedStageConfig / getStageConfig |
| `src/domain/stageSystem.ts` | 核心邏輯 — 爬塔/副本/PvP/Boss 配置生成 / 星級計算 / 掉落擲骰（主線部分已移至 D1） |
| `src/components/StageSelect.tsx` | 關卡選擇 UI — 5 個分頁，主線改用 API 驅動的章節主題卡片 |
| `src/components/SceneProps.tsx` | 章節專屬 3D 場景道具（8 主題 × 3-5 種道具，seeded 散佈，stageId 參與 seed 計算使每小關佈局不同）；4 種共用氛圍元件（RubblePile/BloodStain/ScatteredLitter/RustMark）；每個道具含精細末日風化細節（鏽斑、血漬、裂縫、碎玻璃、掉落物等） |
| `src/components/Arena.tsx` | 場景環境（地面 + 碎片 + 粒子 + 燈光 + 天空 + SceneProps），接收 stageId 傳給 SceneProps |
| `src/game/helpers.ts` | buildEnemySlotsFromStage — 接受 injectedEnemies 參數（story 模式從 API 取得）+ defMultiplier 縮放敵方 DEF |
| `src/game/runBattleLoop.ts` | 戰鬥結算 — 使用 getCachedStageConfig 取得獎勵 |
| `scripts/seed_stage_configs.sql` | D1 種子資料 — 64 筆關卡配置 |

---

## 核心常數

```typescript
const MAX_CHAPTER = 8
const STAGES_PER_CHAPTER = 8
const ZOMBIE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
```

## Seeded PRNG（爬塔 / PvP 用）

爬塔與 PvP 的敵方組合使用確定性偽隨機生成（Linear Congruential Generator）：

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
| 爬塔 | `floor * 7919`（7919 為質數） |
| PvP | `dateSeed + progress * 7` |

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

章節 4~8（依序通關前章最後一關後解鎖）
└── 4-1 ~ 8-8
```

| 項目 | 值 |
|------|-----|
| 每章關卡數 | 8 關 |
| 章節數 | 8 章（共 64 關） |
| 體力消耗 | **無**（免費無限挑戰） |
| stageId 格式 | `"{chapter}-{stage}"`（如 `"2-5"`） |
| 星級評價 | ★★★（全員存活）、★★（≤2 人陣亡）、★（通關即可） |
| 三星鎖定 | 已獲 3 星的關卡顯示 ✅ 並禁止再挑戰（`stage-maxed` class） |
| 星級記錄 | `save_data.stageStars` JSON，`updateStageStars()` 只升不降 |
| 首通效果 | 推進 storyProgress + 更新 resourceTimerStage + 首通獎勵 |

### 敵方配置（D1 stage_configs 表）

主線敵方不再由前端 PRNG 生成，改為存放在 D1 `stage_configs` 表中，由 Workers `/list-stages` API 提供。

**StageEnemy 結構：**
```typescript
interface StageEnemy {
  heroId: number          // 對應 heroes.tsv 的 HeroID
  slot: number            // 陣位 0~5
  levelMultiplier: number // 保留欄位（目前固定 1）
  hpMultiplier: number    // 基礎 HP × 此值 = 實戰 HP
  atkMultiplier: number   // 基礎 ATK × 此值 = 實戰 ATK
  speedMultiplier: number // 基礎 SPD × 此值 = 實戰 SPD
  defMultiplier?: number  // 基礎 DEF × 此值 = 實戰 DEF（預設 1.0）
}
```

> **defMultiplier 設計原則**：早期關卡（Ch1）設為 `= atkMultiplier`，讓 DEF 與 ATK 同步縮放，避免低 HP 敵人有不相稱的高 DEF。Boss 關及後期關卡設為 `1.0`（維持基礎值）。

**D1 Schema：**
```sql
CREATE TABLE stage_configs (
  stageId TEXT PRIMARY KEY,
  chapter INTEGER NOT NULL DEFAULT 1,
  stage INTEGER NOT NULL DEFAULT 1,
  enemies TEXT NOT NULL DEFAULT '[]',   -- JSON: StageEnemy[]
  rewards TEXT NOT NULL DEFAULT '{}',   -- JSON: { exp, gold, diamond?, items? }
  extra TEXT NOT NULL DEFAULT '{}'      -- JSON: { chapterName, stageName, description, bgTheme, difficulty, recommendedLevel, isBoss, chapterIcon }
);
```

**章節主題：**

| 章節 | 名稱 | 主題色 | 圖示 | bgTheme | 推薦等級範圍 |
|------|------|--------|------|---------|-------------|
| 1 | 廢墟之城 | 灰色 (#a0aec0) | 🏙️ | `ruins` | Lv.1~18 |
| 2 | 暗夜森林 | 綠色 (#68d391) | 🌲 | `forest` | Lv.20~38 |
| 3 | 死寂荒原 | 橘色 (#ed8936) | 🏜️ | `desert` | Lv.40~60 |
| 4 | 冰封峽谷 | 冰藍 (#63b3ed) | 🏔️ | `glacier` | Lv.62~78 |
| 5 | 熔岩地獄 | 赤紅 (#fc8181) | 🌋 | `volcano` | Lv.80~98 |
| 6 | 深淵墓穴 | 暗紫 (#b794f4) | 💀 | `abyss` | Lv.100~118 |
| 7 | 天空神殿 | 金色 (#f6e05e) | ⛩️ | `sky_temple` | Lv.120~138 |
| 8 | 末日核心 | 黑紅 (#e53e3e) | ☢️ | `doomsday` | Lv.140~160 |

**每關最後一關為 Boss 關**（1-8, 2-8, ... 8-8），有金色邊框、BOSS 徽章、更高倍率。

**前端流程：**
1. StageSelect 載入時呼叫 `fetchStageConfigs()` 取得 64 筆資料（快取於記憶體）
2. 選關時 `handleStageSelect` → `getStageConfig(stageId)` → 取得 enemies
3. 傳入 `buildEnemySlotsFromStage(mode, sid, heroesList, injectedEnemies)` 生成 SlotHero[]
4. 戰鬥結算：**後端為唯一獎勵來源** — 前端 await `completeBattle` 回應，使用 `serverResult.rewards` 寫入 localStorage + 顯示
5. Fallback：伺服器不可用時，前端才用 `getCachedStageConfig(stageId)` 本地計算

**Fallback：** 若伺服器不可用且快取未命中，結算時使用公式計算獎勵：`exp = 30 + li*15, gold = 50 + li*30`

### 獎勵公式

| 類型 | exp | gold | diamond | items |
|------|-----|------|---------|-------|
| **普通** | `30 + linearIndex × 15` | `50 + linearIndex × 30` | 章底關(stage=8): 20, 其餘: 0 | — |
| **首通** | `60 + linearIndex × 20` | `100 + linearIndex × 50` | 30 | — |

> **v2.2 變更**：exp 獎勵直接發放至 `save_data.exp`（頂層資源），不再掉落 exp_core 道具。

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
| Boss 層 (floor%10=0) | `50 + floor×10` | `100 + floor×20` | 50 | — |
| 每5層 (floor%5=0) | `50 + floor×10` | `100 + floor×20` | 0 | — |
| 其他 | `50 + floor×10` | `100 + floor×20` | 0 | — |

> **v2.2 變更**：exp 獎勵直接發放至 `save_data.exp`，不再掉落 exp_core_l / exp_core_m 道具。

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
| easy | 100 | 500 | `asc_class_power ×2` |
| normal | 200 | 1000 | `asc_class_power ×4` |
| hard | 400 | 2000 | `asc_class_power ×8` |

> **v2.2 變更**：每日副本 exp 獎勵直接發放至 `save_data.exp`，不再掉落 exp_core 道具。

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
| S | `≥ damageThresholds.S` | 600 | 3000 | 100 | — |
| A | `≥ damageThresholds.A` | 400 | 2000 | 50 | — |
| B | `≥ damageThresholds.B` | 200 | 1000 | 20 | — |
| C | 其他 | 100 | 500 | 0 | — |

> **v2.2 變更**：Boss 戰 exp 獎勵直接發放至 `save_data.exp`，不再掉落 exp_core 道具。

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

### handleCompleteBattle_（統一結算，主路徑）

`gas/程式碼.js` 中的**統一伺服器端結算 handler**，處理所有模式（story / tower / daily / pvp / boss）。
前端 POST `complete-battle` 時附帶 `{ guestToken, seed, snapshot, localWinner, stageMode, stageId, starsEarned }`。

| 參數 | 說明 |
|------|------|
| `seed` | 戰鬥種子（可重播驗證） |
| `snapshot` | 戰鬥快照 |
| `localWinner` | 前端判定的勝負 |
| `stageMode` | `'story' \| 'tower' \| 'daily' \| 'pvp' \| 'boss'` |
| `stageId` | 關卡 ID（格式依模式不同） |
| `starsEarned` | 星級（僅 story 模式使用） |

> 舊有 `handleCompleteStage_` / `handleCompleteTower_` / `handleCompleteDaily_` 保留供 reconcile 向下相容。

### GAS 端獎勵公式（實際發放）

> ⚠️ **前端與 GAS 獎勵公式不同！** 前端公式（`stageSystem.ts`）為顯示用預估值，GAS 公式為實際發放數值。以 GAS 回傳為準。

#### Story 模式

> **v2.4 變更**：後端（Workers `battle.ts`）改為從 D1 `stage_configs` 表讀取獎勵，不再使用 hardcoded 公式。
> 前端不再獨立計算獎勵，而是 await 後端 `completeBattle` 回應取得 `rewards` 欄位，確保 localStorage 與 DB 完全一致。

| 類型 | gold | exp | diamond |
|------|------|-----|---------|
| 普通通關 | `stage_configs.rewards.gold` | `stage_configs.rewards.exp` | `stage_configs.rewards.diamond` |
| 首通加碼 | 基礎 × 2 | 基礎 × 2 | max(基礎, 30) |

- 首通判定：`stageStars[stageId]` 無值 = 首通
- **Fallback**（stage_configs 缺失時）：`gold = 100 + ch×50 + st×20 + (首通?200:0)`

#### Tower 模式

| gold | exp | diamond |
|------|-----|---------|
| `100 + floor×20` | `50 + floor×10` | Boss 層 (floor%10=0): 50，其餘: 0 |

- 驗證 `floor === currentFloor + 1`

#### Daily 模式

| 難度 | gold | exp |
|------|------|-----|
| easy | 500 | 100 |
| normal | 1000 | 200 |
| hard | 2000 | 400 |

#### PvP 模式

| gold | exp |
|------|-----|
| `200 + linear×30` | `100 + linear×15` |

- `linear` = `(chapter-1)×8 + stage`（玩家主線進度）

#### Boss 模式

| gold | exp | diamond |
|------|-----|---------|
| 500（固定） | 300（固定） | 20（固定） |

- GAS 端無段位分級系統，發放固定獎勵（與前端的 S/A/B/C 段位顯示不同）

### 舊 Handler（向下相容）

#### handleCompleteStage_

| 參數 | `{ guestToken, stageId, starsEarned }` |
|------|-------|
| 獎勵公式 | 同上 Story 模式 |

#### handleCompleteTower_

| 參數 | `{ guestToken, floor }` |
|------|-------|
| 獎勵公式 | 同上 Tower 模式 |

#### handleCompleteDaily_

| 參數 | `{ guestToken, dungeonId, tier }` |
|------|-------|
| 獎勵 | 同上 Daily 模式 |

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
| v1.3 | 2026-03-01 | 統一結算：新增 `handleCompleteBattle_` 為所有模式的統一 GAS 結算 handler（story/tower/daily/pvp/boss）；完整記載 GAS 端獎勵公式（含 PvP / Boss）；標注前端與 GAS 獎勵公式差異（前端為顯示預估值，GAS 為實際發放）；舊 per-mode handler 保留向下相容 |
| v1.4 | 2026-06-15 | **配合裝備模板制 v2**：移除所有 `chest_equipment` 獎勵（Boss 層/Boss 戰 S/A 段位）改為 `exp_core_l`；每日副本掉落移除強化石（`eqm_enhance_*`）改為經驗核心 |
| v2.1 | 2026-03-02 | **遊戲平衡修正**：新增 `defMultiplier` 敵方 DEF 乘數（StageEnemy 介面 + buildEnemySlotsFromStage）；Chapter 1 關卡重新平衡 — 1-2 從 3 敵→2 敵（解決新手死鎖）+ 保底 exp_core_s；全 Ch1 加入 defMultiplier = atkMultiplier（DEF 與 ATK 連動）；D1 seed 已更新 |
| v2.2 | 2026-03-02 | **EXP 資源重構**：所有模式（story/tower/daily/pvp/boss）的 exp 獎勵改為直接發放至 `save_data.exp` 頂層資源；移除所有 exp_core_s/m/l 掉落物；Boss 段位獎勵 items 欄清空；每日副本獎勵表移除經驗核心 |
| v2.3 | 2026-03-03 | **八章擴展**：MAX_CHAPTER 3→8（共 64 關）；新增 5 個章節（Ch4 冰封峽谷/Ch5 熔岩地獄/Ch6 深淵墓穴/Ch7 天空神殿/Ch8 末日核心）；bgTheme 新增 `glacier`/`volcano`/`abyss`/`sky_temple`/`doomsday` 值；Arena SceneMode 擴展至 13 種（新增 8 個章節專屬場景主題）；整體難度曲線降低（配合較多章節的漸進式成長） |
| v2.4 | 2026-03-04 | **修復雙重獎勵 Bug**：前端不再獨立計算獎勵寫入 localStorage（與後端 DB 產生不一致）；改為 await `completeBattle` 後端回應，使用 `serverResult.rewards` 作為唯一來源；後端 Story 模式改從 D1 `stage_configs` 表讀取 rewards（取代 hardcoded 公式 `100+ch*50+st*20`）；首通邏輯：基礎翻倍 + diamond≥30；離線 fallback 保留本地計算 |
| v2.5 | 2026-03-05 | **章節專屬 3D 場景道具**：新增 `SceneProps.tsx` 元件（8 個章節主題各有獨特 3D 道具）；city=路牌＋建築殘骸＋街燈＋路障、forest=樹幹＋倒木＋蘑菇、wasteland=購物車＋破架子＋油桶、factory=齒輪機構＋管線架＋輸送帶、hospital=病床＋點滴架＋醫療櫃、residential=桌椅＋書架＋電視、underground=汽車殘骸＋交通錐＋水泥柱＋停車欄杆、core=能量水晶(浮動動畫)＋科技主機＋發光管；使用 seeded PRNG 確定性散佈避開中央戰鬥區域；Arena.tsx 導入 SceneProps；StageSelect CHAPTER_THEMES 擴展至 8 章（新增 factory/hospital/residential/underground/core 色彩主題） |
| v2.6 | 2026-03-04 | **每小關場景道具佈局差異化**：SceneProps seed 計算加入 stageId（`chapter*100+stage`），同章不同小關道具種類相同但位置分佈不同；Arena 新增 `stageId` prop 傳遞給 SceneProps；App.tsx 傳遞 stageId 給 Arena |
| v2.7 | 2026-03-06 | **場景道具品質全面升級**：4 種共用氛圍元件（RubblePile/BloodStain/ScatteredLitter/RustMark）；全部 8 主題 20+ 道具逐一增加末日風化細節 — city(掛線/碎玻璃/鏽斑)、forest(樹皮剝落/菌絲/爪痕/蘑菇發光)、wasteland(缺輪/散落貨物/油漬)、factory(傳送帶殘片/管線洩漏)、hospital(血漬床墊/點滴管/藥瓶散落)、residential(桌面汙漬/碎盤/椅裂縫/灰塵/書籍掉落/電視碎屏)、underground(火損車身/碎玻璃/少輪/鋼筋外露/水漬)、core(碎片衛星增多/地裂光環/螢幕裂紋/管線洩漏)；`generateSceneElements` 為所有 8 主題加入獨立散佈的 RubblePile/BloodStain/ScatteredLitter 氛圍元素 |