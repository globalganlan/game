# 關卡系統 Spec

> 版本：v0.2 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

五種關卡模式：**主線章節**（劇情推進）、**無盡爬塔**（挑戰極限）、**每日副本**（素材農場）、**PvP 競技場**（玩家對戰）、**Boss 戰**（高難度單體）。
所有模式共用 `core-combat.md` 戰鬥引擎，差異在於敵方配置、勝負條件、獎勵。

## 依賴

- `specs/core-combat.md` — 戰鬥引擎
- `specs/hero-schema.md` — 英雄數值
- `specs/save-system.md` — 進度儲存
- `specs/auth-system.md` — 玩家身份

---

## 一、主線章節

### 結構

```
章節 1（廢墟之城）
├── 1-1  教學關（固定敵人, 引導操作）
├── 1-2
├── ...
├── 1-8  章節 Boss
└── 1-8 通關 → 解鎖章節 2

章節 2（暗夜森林）
├── 2-1
├── ...
└── 2-8  章節 Boss
```

| 項目 | 值 |
|------|-----|
| 每章關卡數 | 8 關 |
| 初期章節數 | 3 章（共 24 關） |
| 體力消耗 | **無**（免費無限挑戰） |
| 通關效果 | 資源計時器掛載到此關卡（產出量隨進度提升） |
| 星級評價 | ★★★（全員存活）、★★（≤2 人陣亡）、★（通關即可） |
| 首通獎勵 | 鑽石 + 金幣 + 經驗值 |
| 星級獎勵 | 每章累計星數達標 → 額外獎勵（角色碎片/裝備箱） |

### 難度曲線

| 章節 | 推薦等級 | 敵數 | 敵 HP 倍率 | 敵 ATK 倍率 |
|------|---------|------|-----------|------------|
| 1 | 1-10 | 3-6 | ×1.0 | ×1.0 |
| 2 | 10-20 | 4-6 | ×1.5 | ×1.3 |
| 3 | 20-30 | 5-6 | ×2.2 | ×1.7 |

### 敵方配置

```typescript
interface StageConfig {
  stageId: string            // "1-1", "1-2", ...
  chapter: number
  stage: number
  enemies: StageEnemy[]      // 敵方陣容（1-6 隻）
  recommendedLevel: number
  rewards: StageReward
  firstClearRewards: StageReward
  dialogue?: StageDialogue[] // 戰前/戰後對話（可選）
}

interface StageEnemy {
  heroId: number             // 使用哪個 zombie 模型 + 數值
  slot: number               // 格子位置 (0-5)
  levelMultiplier: number    // 數值倍率（基於原始數值）
  hpMultiplier: number
  atkMultiplier: number
  speedMultiplier: number
}

interface StageReward {
  exp: number
  gold: number
  diamond?: number
  items?: { itemId: string; quantity: number; dropRate: number }[]
}

interface StageDialogue {
  timing: 'before' | 'after'
  lines: { speaker: string; text: string }[]
}
```

### 資料儲存

- Sheet: `stage_configs`（所有關卡配置，由開發者維護）
- 進度儲存在 `save_data.storyProgress = { chapter, stage }`
- 星級記錄在 `save_data` 額外欄位 `stageStars` JSON：`{"1-1": 3, "1-2": 2, ...}`

---

## 二、無盡爬塔

### 機制

```
第 1 層 → 第 2 層 → ... → 第 N 層（無上限）
    每層固定敵方配置，難度逐層遞增
    每 10 層一個 Boss 層（獎勵加倍）
    打不過 = 停在該層，下次再挑戰
```

| 項目 | 值 |
|------|-----|
| 體力消耗 | **0**（免費無限挑戰） |
| 重置週期 | 不重置，永久進度 |
| 獎勵 | 首次通過每層：金幣 + 經驗，每 10 層：鑽石 + 道具 |
| 排行榜 | 依最高樓層排名 |

### 難度公式

```typescript
function getTowerEnemies(floor: number): StageEnemy[] {
  const enemyCount = Math.min(6, 3 + Math.floor(floor / 5))
  const hpMult = 1.0 + floor * 0.15
  const atkMult = 1.0 + floor * 0.10
  const spdMult = 1.0 + floor * 0.02

  // 每 10 層 Boss：單體高數值
  if (floor % 10 === 0) {
    return [{ heroId: randomBoss(), slot: 1, levelMultiplier: 1,
              hpMultiplier: hpMult * 3, atkMultiplier: atkMult * 2,
              speedMultiplier: spdMult }]
  }

  // 一般層：隨機組合
  return randomEnemyFormation(enemyCount, hpMult, atkMult, spdMult)
}
```

### 獎勵公式

```typescript
function getTowerReward(floor: number): StageReward {
  return {
    exp: 50 + floor * 10,
    gold: 100 + floor * 20,
    diamond: floor % 10 === 0 ? 50 : 0,
    items: floor % 10 === 0
      ? [{ itemId: 'equipment_box', quantity: 1, dropRate: 1.0 }]
      : []
  }
}
```

---

## 三、每日副本

### 種類（輪替制）

| 星期 | 副本 | 掉落 |
|------|------|------|
| 一、四 | 力量試煉 | 力量型升級素材 |
| 二、五 | 敏捷試煉 | 敏捷型升級素材 |
| 三、六 | 防禦試煉 | 坦克型升級素材 |
| 日 | 全開放 | 隨機素材 |

| 項目 | 值 |
|------|-----|
| 體力消耗 | **無** |
| 每日次數 | 3 次（可用鑽石買額外次數，每次 50 鑽） |
| 難度分級 | 初級 / 中級 / 高級（需主線進度解鎖） |

```typescript
interface DailyDungeon {
  dungeonId: string          // "power_trial", "agility_trial", "defense_trial"
  name: string
  availableDays: number[]    // [1,4] = 一、四
  difficulties: DungeonDifficulty[]
}

interface DungeonDifficulty {
  tier: 'easy' | 'normal' | 'hard'
  requiredChapter: number    // 解鎖條件（主線章節）
  enemies: StageEnemy[]
  rewards: StageReward
}
```

---

## 四、PvP 競技場

### 機制（異步 PvP）

```
不是即時對戰 — 打的是別人設定的「防守陣容」
    ↓
從排行榜選對手 → 用自己的攻擊隊 vs 對方防守隊
    ↓
戰鬥用同一套 core-combat 引擎（全自動）
    ↓
贏 → 排名交換（或獲得積分）
輸 → 排名不變
```

| 項目 | 值 |
|------|-----|
| 體力消耗 | **0** |
| 每日挑戰次數 | 5 次（VIP 可增加） |
| 排名重置 | 每週一重算 |
| 獎勵 | 每日依排名發放鑽石 + 競技幣 |
| 對手匹配 | 排名 ±50 名內隨機 3 人 |

### 資料結構

```typescript
interface PvpDefense {
  playerId: string
  formation: (string | null)[]  // 6 slots, heroInstanceId
  // 伺服器端展開為完整英雄數值快照
}

interface PvpRecord {
  playerId: string
  rank: number
  score: number
  defenseFormation: (string | null)[]
  wins: number
  losses: number
  lastUpdated: string
}
```

### Google Sheet「pvp_rankings」

| 欄位 | 型別 | 說明 |
|------|------|------|
| `playerId` | string | 主鍵 |
| `rank` | number | 當前排名 |
| `score` | number | 積分 |
| `defenseFormation` | string | 防守陣容 JSON |
| `defenseSnapshot` | string | 防守英雄數值快照 JSON（避免即時查表） |
| `wins` | number | 本週勝場 |
| `losses` | number | 本週敗場 |

---

## 五、Boss 戰

### 機制

```
獨立高難 Boss → 巨量 HP + 特殊技能
    ↓
玩家 6 人陣容 vs 1-2 隻 Boss
    ↓
有回合數上限（30 回合），打不死 = 失敗
    ↓
依據造成傷害量給獎勵（不必打死也有獎勵）
```

| 項目 | 值 |
|------|-----|
| 體力消耗 | **無** |
| 出現頻率 | 每週固定 2 隻，輪替 |
| 回合上限 | 30 回合 |
| 獎勵機制 | 依傷害量段位：S/A/B/C 級 |

```typescript
interface BossConfig {
  bossId: string
  name: string
  heroId: number             // 模型
  hp: number                 // 超高（數萬）
  atk: number
  speed: number
  skills: BossSkill[]        // Boss 專屬技能
  turnLimit: number          // 30
  damageThresholds: {        // 傷害量段位
    S: number                // >= 此值 = S 級
    A: number
    B: number
    C: number                // 任何傷害 = C 級
  }
}

interface BossSkill {
  name: string
  type: 'aoe' | 'single' | 'buff' | 'debuff'
  triggerCondition: 'every_N_turns' | 'hp_below'
  triggerValue: number       // 每 N 回合 or HP% 閾值
  effect: string             // 效果描述
}
```

---

## 模式解鎖條件

| 模式 | 解鎖條件 |
|------|---------|
| 主線章節 | 預設開放（第 1 章） |
| 無盡爬塔 | 通過 1-4 |
| 每日副本 | 通過 1-8（第 1 章全通） |
| PvP 競技場 | 通過 2-1（進入第 2 章） |
| Boss 戰 | 通過 2-8（第 2 章全通） |

---

## 主選單結構

```
┌──────────────────────┐
│      全球感染         │
│                      │
│  ┌──────┐ ┌──────┐  │
│  │ 主線  │ │ 爬塔  │  │
│  │ 章節  │ │ 🔒    │  │
│  └──────┘ └──────┘  │
│  ┌──────┐ ┌──────┐  │
│  │ 每日  │ │ PvP  │  │
│  │ 🔒   │ │ 🔒    │  │
│  └──────┘ └──────┘  │
│     ┌──────┐         │
│     │ Boss │         │
│     │ 🔒   │         │
│     └──────┘         │
│                      │
│  [英雄] [背包] [設定] │
└──────────────────────┘
```

---

## API 端點

| 端點 | 說明 |
|------|------|
| `/get-stage-config` | 取得關卡敵方配置 |
| `/complete-stage` | 通關結算（驗證 + 發獎勵 + 存進度） |
| `/get-tower-floor` | 取得爬塔當前樓層敵方 |
| `/complete-tower` | 爬塔通關結算 |
| `/get-daily-dungeon` | 取得今日副本配置 |
| `/complete-daily` | 副本結算 |
| `/get-pvp-opponents` | 取得 3 個對手 |
| `/pvp-battle-result` | PvP 結果上報 |
| `/get-boss-config` | 取得本週 Boss 配置 |
| `/boss-battle-result` | Boss 戰結果上報 |

---

## 擴展點

- [ ] **困難模式**：主線章節 Hard 難度，不同獎勵
- [ ] **公會副本**：多人協力打 Boss
- [ ] **賽季系統**：PvP 賽季獎勵
- [ ] **活動關卡**：限時活動副本
- [ ] **掃蕩功能**：已三星通關的關卡可跳過戰鬥直接領獎

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版：5 種模式（章節/爬塔/每日/PvP/Boss） |
| v0.2 | 2026-02-26 | 移除體力系統，所有模式免費挑戰；成長限制改由資源計時器控制（見 save-system.md） |
