# 效果模組化系統 Spec

> 版本：v2.23 ｜ 狀態：✅ 已實作
> 最後更新：2026-03-17
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/domain/types.ts`（型別）、`src/domain/battleEngine.ts`（執行）、`src/domain/buffSystem.ts`（Buff 操作）、`src/services/dataService.ts`（資料載入）
> 取代：`skill-system.md` v1.7 中的 SkillEffect 內嵌 JSON 架構

## 概述

技能（Skill）是英雄的專屬能力。效果（Effect）是通用的可重用模組。

**核心改動**：將效果從「每個 SkillTemplate 內嵌 effects JSON 陣列」改為「獨立 `effect_templates` 表 + `skill_effects` 關聯表」。觸發條件從技能層下移到效果層 — 同一技能的不同效果可有不同觸發時機。

| 層級 | 現行 (v1.x) | 新系統 (v2.0) |
|------|-------------|---------------|
| 效果定義 | 內嵌在 `skill_templates.effects` JSON | 獨立 `effect_templates` 表 |
| 技能↔效果 | 1:N 陣列 | M:N 關聯表 `skill_effects`（含 sortOrder + overrideParams） |
| 觸發條件 | 在 skill 層（passiveTrigger） | 在 effect 層（每個效果自帶 trigger） |
| 效果依賴 | 不支援 | `dependsOn` 欄位（前置效果成功才觸發） |
| 技能升級 | 不支援 | `overrideParams` 覆寫倍率/機率/持續 |
| 效果複用 | 不支援 | 同一 effectId 可被多個技能引用 |

## 依賴

- `.ai/specs/skill-system.md` → 技能模板（SkillTemplate）+ 英雄技能配置（HeroSkillConfig）
- `.ai/specs/core-combat.md` §4 → 能量系統（大招門檻 1000）
- `.ai/specs/core-combat.md` §5 → Buff/Debuff 系統
- `.ai/specs/core-combat.md` §6 → 被動觸發機制
- `.ai/specs/damage-formula.md` → 傷害 / 治療計算
- D1 `skill_templates` 表 + `hero_skills` 表（保留）

---

## 一、效果分類（19 種 category）

| category | 說明 | 範例 |
|----------|------|------|
| `damage` | 直接傷害（單段/多段） | ATK×1.8 對單體 |
| `dot` | 持續傷害（燃燒/中毒/流血） | 每回合 ATK×30% |
| `heal` | 治療 | ATK×1.2 回血 |
| `buff` | 正面狀態 | 攻擊力+20% 持續 2 回合 |
| `debuff` | 負面狀態（非 CC） | 防禦力-15% |
| `cc` | 控制效果 | 暈眩 1 回合 |
| `shield` | 護盾 | 吸收 HP×20% 傷害 |
| `energy` | 能量增減 | 自己+200 能量 / 目標-300 能量 |
| `extra_turn` | 額外行動 | 擊殺後再動一次 |
| `counter_attack` | 🆕 反擊 | 被攻擊時自動普攻反擊 |
| `chase_attack` | 🆕 追擊 | 隊友攻擊後跟進攻擊 |
| `revive` | 復活/保命 | 致命傷時回復 30% HP |
| `dispel_debuff` | 淨化（移除己方 debuff） | 移除 1 個 debuff |
| `dispel_buff` | 🆕 驅散（移除敵方 buff） | 移除敵方 1 個 buff |
| `reflect` | 反傷 | 反彈受到傷害的 30% |
| `steal_buff` | 🆕 偷取 | 偷敵方 1 個 buff 給自己 |
| `transfer_debuff` | 🆕 轉移 | 把自己 1 個 debuff 轉給敵方 |
| `execute` | 🆕 斬殺 | HP 低於閾值直接擊殺 |
| `modify_target` | 🆕 目標變更 | 改變普攻/主動技的攻擊目標規則 |

---

## 二、觸發條件（23 種 trigger）

### 現有觸發（15 + 1）

| trigger | 說明 | triggerParam |
|---------|------|-------------|
| `immediate` | 主動技能直接執行（無條件） | — |
| `battle_start` | 戰鬥開始時 | — |
| `turn_start` | 自己回合開始時 | — |
| `turn_end` | 自己回合結束時 | — |
| `on_attack` | 自己攻擊時（普攻+大招） | — |
| `on_crit` | 暴擊時 | — |
| `on_kill` | 擊殺敵人時 | — |
| `on_be_attacked` | 被攻擊時 | — |
| `on_take_damage` | 受傷後（含 DOT） | — |
| `on_lethal` | 受致命傷時 | — |
| `on_dodge` | 閃避成功時 | — |
| `on_ally_death` | 隊友死亡時 | — |
| `on_ally_skill` | 隊友施放大招時 | — |
| `always` | 永久生效（進場即掛） | — |
| `hp_below_pct` | HP 低於閾值時 | 閾值 (0.3 = 30%) |
| `every_n_turns` | 每 N 回合 | N（整數） |

### 新增觸發（7）🆕

| trigger | 說明 | triggerParam |
|---------|------|-------------|
| `on_normal_attack` | 🆕 只限普攻時 | — |
| `on_skill_cast` | 🆕 只限大招時 | — |
| `on_ally_attacked` | 🆕 隊友被攻擊時 | — |
| `hp_above_pct` | 🆕 HP 高於閾值時 | 閾值 (0.8 = 80%) |
| `enemy_count_below` | 🆕 場上敵人 ≤ N 時 | N |
| `ally_count_below` | 🆕 場上隊友 ≤ N 時 | N |
| `has_status` | 🆕 目標帶有特定狀態時 | StatusType |

---

## 三、EffectTarget 類型

```typescript
type EffectTarget =
  | 'single_enemy'       // 單體敵人（普攻策略）
  | 'all_enemies'        // 敵方全體
  | 'random_enemies_3'   // 隨機 3 體（可重複）
  | 'front_row_enemies'  // 敵方前排
  | 'back_row_enemies'   // 敵方後排
  | 'single_ally'        // HP% 最低的隊友
  | 'all_allies'         // 我方全體
  | 'self'               // 自身
  | 'trigger_source'     // 🆕 觸發來源（反擊→攻擊者、追擊→隊友的目標）
```

---

## 四、EffectTemplate 資料結構

```typescript
// src/domain/types.ts（新增）

type EffectCategory =
  | 'damage' | 'dot' | 'heal' | 'buff' | 'debuff' | 'cc'
  | 'shield' | 'energy' | 'extra_turn' | 'counter_attack'
  | 'chase_attack' | 'revive' | 'dispel_debuff' | 'dispel_buff'
  | 'reflect' | 'steal_buff' | 'transfer_debuff' | 'execute'
  | 'modify_target'

type EffectTrigger =
  // 現有
  | 'immediate' | 'battle_start' | 'turn_start' | 'turn_end'
  | 'on_attack' | 'on_crit' | 'on_kill'
  | 'on_be_attacked' | 'on_take_damage' | 'on_lethal'
  | 'on_dodge' | 'on_ally_death' | 'on_ally_skill'
  | 'always' | 'hp_below_pct' | 'every_n_turns'
  // 新增
  | 'on_normal_attack' | 'on_skill_cast' | 'on_ally_attacked'
  | 'hp_above_pct' | 'enemy_count_below' | 'ally_count_below'
  | 'has_status'

interface EffectTemplate {
  effectId: string           // 唯一 ID，如 'EFF_DMG_ATK_180'
  name: string               // 效果名稱
  category: EffectCategory   // 分類
  
  // 觸發
  trigger: EffectTrigger     // 觸發條件
  triggerParam?: number | string  // 觸發參數（hp_below_pct 的閾值 / every_n_turns 的 N / has_status 的 StatusType）
  triggerChance?: number     // 觸發機率 0~1（預設 1.0）
  triggerLimit?: number      // 每場觸發上限（0=無限，on_lethal 通常 1）

  // 目標
  target: EffectTarget       // 效果目標

  // 數值
  scalingStat?: keyof FinalStats
  multiplier?: number        // 倍率（1.8 = 180%）
  flatValue?: number         // 固定值（能量吸取用負數表示：-200 = 吸走 200）
  hitCount?: number          // 多段攻擊次數
  min?: number               // 隨機倍率最小值
  max?: number               // 隨機倍率最大值

  // 狀態
  status?: StatusType        // Buff/Debuff 類型
  statusChance?: number      // 施加機率（0~1）
  statusValue?: number       // 效果數值
  statusDuration?: number    // 持續回合
  statusMaxStacks?: number   // 最大疊加數

  // 條件
  targetHpThreshold?: number // HP% 門檻
  perAlly?: boolean          // 按存活隊友人數倍增
}
```

---

## 五、資料庫表結構

### effect_templates 表（新增）

```sql
CREATE TABLE IF NOT EXISTS effect_templates (
  effectId        TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL,
  trigger_type    TEXT NOT NULL DEFAULT 'immediate',  -- 注意：因 trigger 為 SQLite 保留字，實際欄名用 trigger_type
  triggerParam    TEXT,           -- 數字或 StatusType 字串
  triggerChance   REAL NOT NULL DEFAULT 1.0,
  triggerLimit    INTEGER NOT NULL DEFAULT 0,
  target          TEXT NOT NULL DEFAULT 'single_enemy',
  scalingStat     TEXT,
  multiplier      REAL,
  flatValue       REAL,
  hitCount        INTEGER,
  min             REAL,
  max             REAL,
  status          TEXT,
  statusChance    REAL,
  statusValue     REAL,
  statusDuration  INTEGER,
  statusMaxStacks INTEGER,
  targetHpThreshold REAL,
  perAlly         INTEGER NOT NULL DEFAULT 0,
  targetOverride  TEXT,           -- JSON: 覆寫 target（如 §8.9 modify_target）
  applyTo         TEXT            -- 施加對象修飾（self / target 等）
);
```

> **備註**：前端讀取時，SQL 使用 `trigger_type AS trigger` 別名，讓 TypeScript 端統一用 `trigger` 屬性名。

### skill_effects 關聯表（新增）

```sql
CREATE TABLE IF NOT EXISTS skill_effects (
  skillId        TEXT NOT NULL,
  effectId       TEXT NOT NULL,
  sortOrder      INTEGER NOT NULL DEFAULT 0,
  overrideParams TEXT NOT NULL DEFAULT '{}',  -- JSON: 覆寫 effect 的部分參數
  dependsOn      TEXT,                         -- 前置 effectId（命中才觸發後續）
  skillLevel     INTEGER NOT NULL DEFAULT 1,   -- 技能等級（§7 等級系統）
  PRIMARY KEY (skillId, effectId, skillLevel)
);
```

> **備註**：D1 不強制 FOREIGN KEY，故省略 FOREIGN KEY 約束。資料完整性由 Workers 寫入邏輯保證。

### skill_templates 表變更

```sql
-- effects 欄位已遷移至 effect_templates + skill_effects，未來可移除
-- passiveTrigger 保留，作為「技能整體是否啟用」的開關
```

---

## 六、效果依賴（dependsOn）

解決「攻擊命中才附加燃燒」的需求。

`skill_effects.dependsOn` 指向同技能中另一個 effectId。當該前置效果**未命中（被閃避）或未觸發（機率失敗）**時，依賴它的效果自動跳過。

### 範例

```
技能「腐蝕之牙」（3 段效果連鎖）：
  sortOrder 1: EFF_DMG_ATK_180  → damage (ATK×180%)
  sortOrder 2: EFF_DOT_POISON   → debuff (dot_poison) dependsOn=EFF_DMG_ATK_180
  sortOrder 3: EFF_ENERGY_DRAIN → energy (-200)       dependsOn=EFF_DMG_ATK_180

情境 A：效果1 命中
  → 效果2 觸發機率判定 → 中毒成功
  → 效果3 吸取能量 200

情境 B：效果1 被閃避
  → 效果2 跳過（依賴未滿足）
  → 效果3 跳過（依賴未滿足）
  → 整個技能只是 miss，不附加任何額外效果
```

```
技能「連環爆破」（多層依賴鏈）：
  sortOrder 1: EFF_DMG_ATK_120  → damage (ATK×120%)
  sortOrder 2: EFF_DEBUFF_DEF   → debuff (def_down -20%) dependsOn=EFF_DMG_ATK_120
  sortOrder 3: EFF_DMG_ATK_200  → damage (ATK×200%)     dependsOn=EFF_DEBUFF_DEF

效果：先打一拳(120%) → 命中才降防(-20%) → 降防成功才追加重擊(200%)
若第一段命中但降防被免疫(immunity) → 第三段也不會觸發
```

### 執行邏輯

```typescript
const results = new Map<string, boolean>()

for (const { effectId, overrideParams, dependsOn } of sortedEffects) {
  const template = effectTemplates.get(effectId)!

  // 檢查前置條件
  if (dependsOn && !results.get(dependsOn)) {
    results.set(effectId, false)
    continue
  }

  // 合併覆寫參數
  const finalEffect = { ...template, ...JSON.parse(overrideParams) }

  // 執行效果
  const success = executeEffect(finalEffect, context)
  results.set(effectId, success)
}
```

---

## 七、參數覆寫（overrideParams）

`skill_effects.overrideParams` 允許同一 effect_template 被不同技能以不同數值使用。

### 效果複用範例

同一個 `EFF_DMG_ATK_BASE_001`（基礎 ATK 傷害模板）被多個技能引用，各自覆寫不同倍率：

```sql
-- 效果模板：通用 ATK 基礎傷害
INSERT INTO effect_templates (effectId, name, category, trigger_type, target, scalingStat, multiplier)
VALUES ('EFF_DMG_ATK_BASE_001', '基礎斬擊', 'damage', 'immediate', 'single_enemy', 'ATK', 1.0);

-- 英雄1 的大招引用，覆寫倍率 2.5 + 3段攻擊
INSERT INTO skill_effects (skillId, effectId, sortOrder, overrideParams)
VALUES ('ACT_1', 'EFF_DMG_ATK_BASE_001', 1, '{"multiplier": 2.5, "hitCount": 3}');

-- 英雄5 的大招引用同一效果，但只要 1.8 倍
INSERT INTO skill_effects (skillId, effectId, sortOrder, overrideParams)
VALUES ('ACT_5', 'EFF_DMG_ATK_BASE_001', 1, '{"multiplier": 1.8}');

-- 英雄10 的被動也引用，on_crit 觸發追加 0.5 倍打擊
INSERT INTO skill_effects (skillId, effectId, sortOrder, overrideParams)
VALUES ('PAS_10_2', 'EFF_DMG_ATK_BASE_001', 1, '{"multiplier": 0.5}');
```

好處：修改 `EFF_DMG_ATK_BASE_001` 的 `scalingStat` 會**同時影響所有引用它的技能**，不用逐一修改。

### 技能等級系統（星級 > 6 後生效）

英雄星級超過 6★ 後，每升一星改為提升技能等級：

| 星級 | 技能等級 | 效果 |
|------|---------|------|
| ★1~6 | Lv.1 | 基礎效果（解鎖被動 slot） |
| ★7 | Lv.2 | 全技能效果提升 |
| ★8 | Lv.3 | 全技能效果提升 |
| ★9 | Lv.4 | 全技能效果提升 |
| ★10 | Lv.5 | 全技能效果提升（滿級） |

> **星級上限**：所有稀有度上限均為 **10★**。★1~6 解鎖被動 slot，★7~10 提升技能等級。

實作方式：每個技能等級對應不同的 `overrideParams`。`skill_effects` 新增 `skillLevel` 欄位：

```sql
-- skill_effects 增加 skillLevel 欄位
ALTER TABLE skill_effects ADD COLUMN skillLevel INTEGER NOT NULL DEFAULT 1;
-- primary key 變為 (skillId, effectId, skillLevel)
```

```json
// ACT_1 + EFF_DMG_001, Lv.1
{ "multiplier": 1.8 }
// ACT_1 + EFF_DMG_001, Lv.2
{ "multiplier": 2.0 }
// ACT_1 + EFF_DMG_001, Lv.3
{ "multiplier": 2.5, "hitCount": 2 }
```

載入時根據英雄星級計算 skillLevel → 取對應的 overrideParams。

### 技能升級範例

英雄1 的大招「烈火猛擊」隨星級提升，倍率從 180% → 300%，並在 Lv.3 獲得多段攻擊：

```sql
-- Lv.1（★1~6）：ATK×180% 單段
INSERT INTO skill_effects (skillId, effectId, sortOrder, skillLevel, overrideParams)
VALUES ('ACT_1', 'EFF_DMG_ATK_BASE_001', 1, 1, '{"multiplier": 1.8}');

-- Lv.2（★7）：ATK×220% 單段
INSERT INTO skill_effects (skillId, effectId, sortOrder, skillLevel, overrideParams)
VALUES ('ACT_1', 'EFF_DMG_ATK_BASE_001', 1, 2, '{"multiplier": 2.2}');

-- Lv.3（★8）：ATK×250% 雙段（每段獨立暴擊）
INSERT INTO skill_effects (skillId, effectId, sortOrder, skillLevel, overrideParams)
VALUES ('ACT_1', 'EFF_DMG_ATK_BASE_001', 1, 3, '{"multiplier": 2.5, "hitCount": 2}');

-- Lv.4（★9）：ATK×280% 雙段
INSERT INTO skill_effects (skillId, effectId, sortOrder, skillLevel, overrideParams)
VALUES ('ACT_1', 'EFF_DMG_ATK_BASE_001', 1, 4, '{"multiplier": 2.8, "hitCount": 2}');

-- Lv.5（★10）：ATK×300% 三段
INSERT INTO skill_effects (skillId, effectId, sortOrder, skillLevel, overrideParams)
VALUES ('ACT_1', 'EFF_DMG_ATK_BASE_001', 1, 5, '{"multiplier": 3.0, "hitCount": 3}');
```

技能描述面板會對比各等級差異：
```
Lv.1: ATK×180%
Lv.2: ATK×220%         (+40%)
Lv.3: ATK×250% ×2段    (+30%, +1段) ★當前
Lv.4: ATK×280% ×2段    (+30%)
Lv.5: ATK×300% ×3段    (+20%, +1段)
```

---

## 八、新機制詳細設計

### 8.1 反擊（counter_attack）

- **觸發**：`on_be_attacked`
- **執行**：自動對攻擊者發動攻擊（使用 `trigger_source` 目標）
- **次數**：不限制每回合次數 — 每次被攻擊都可觸發（受 `triggerChance` 機率控制）
- **多目標**：若攻擊者有多個（AoE），逐一反擊每個攻擊來源
- **連鎖防護**：反擊不觸發對方的反擊（防止 A↔B 無限反擊迴圈）
- **參數**：`multiplier`（反擊傷害倍率，預設 0.8 = 普攻 80%）

### 8.2 追擊（chase_attack）

- **觸發**：`on_ally_skill` 或 `on_ally_attacked`
- **執行**：對隊友的目標發動攻擊
- **次數**：不限制每回合次數 — 每次隊友行動都可觸發（受 `triggerChance` 機率控制）
- **多目標**：可攻擊隊友的所有目標（AoE 追擊），或只追擊主要目標（由 `target` 決定）
- **連鎖防護**：追擊不觸發其他人的追擊（防止無限連鎖）
- **參數**：`multiplier`、target = `trigger_source`（預設追擊隊友的攻擊目標）

### 8.3 驅散（dispel_buff）

- **目標**：敵方
- **參數**：`flatValue`（移除 buff 數量，如 1 = 移除 1 個隨機 buff）

### 8.4 偷取（steal_buff）

- **目標**：敵方
- **執行**：移除目標 1 個 buff → 施加到自己身上（保留持續時間）

### 8.5 轉移（transfer_debuff）

- **目標**：敵方
- **執行**：移除自己 1 個 debuff → 施加到目標身上

### 8.6 能量吸取（energy drain）

- **category**：`energy`
- **參數**：`flatValue` 為負數表示吸取（-200 = 吸走 200 能量給自己）

### 8.7 斬殺（execute）🆕

- **觸發**：`immediate`（主動技）或被動（`on_attack` 等）
- **執行**：檢查目標 HP%，低於 `targetHpThreshold` 則直接擊殺（HP 歸零）
- **參數**：`targetHpThreshold`（如 0.15 = HP 低於 15% 時斬殺）
- **免疫**：帶有 `immunity` buff 的目標免疫斬殺
- **飄字**：斬殺成功顯示「斬殺！」飄字

### 8.8 目標變更（modify_target）🆕

改變普攻或主動技能的攻擊目標規則（持續至效果消失）。

- **觸發**：`battle_start` / `turn_start` / `always` 等被動觸發
- **作用**：修改施放者的普攻或主動技的 target 類型
- **參數**：
  - `targetOverride`：新的目標類型（`all_enemies` / `front_row_enemies` / `back_row_enemies` / `random_enemies_N` 等）
  - `applyTo`：`'normal'`（僅普攻）/ `'active'`（僅大招）/ `'both'`（兩者皆改）
  - `multiplier`：目標變更後的傷害修正（多目標時通常降低，如 0.5）

```
範例 1：被動「劍氣四射」
  trigger: always
  category: modify_target
  targetOverride: all_enemies    ← 普攻改全體
  applyTo: normal
  multiplier: 0.4                ← 每個目標只受 40% 傷害
  → 效果：普攻從單體變全體 AoE，但每人只受 40%

範例 2：被動「箭雨」
  trigger: on_skill_cast
  category: modify_target
  targetOverride: random_enemies_5
  applyTo: active
  multiplier: 0.6
  → 效果：大招從原目標改為隨機攻擊 5 人

範例 3：被動「前排掃射」
  trigger: always
  category: modify_target
  targetOverride: front_row_enemies
  applyTo: normal
  multiplier: 0.7
  → 效果：普攻從單體改為攻擊前排所有敵人
```

#### EffectTemplate 新增欄位

```typescript
interface EffectTemplate {
  // ... 現有欄位
  targetOverride?: EffectTarget  // 🆕 modify_target 用：新目標類型
  applyTo?: 'normal' | 'active' | 'both'  // 🆕 modify_target 用：影響哪種攻擊
}
```

#### 執行邏輯

```typescript
// battleEngine.ts — 執行普攻/技能前檢查
function resolveAttackTarget(hero: BattleHero, isSkill: boolean): EffectTarget {
  const modifiers = hero.statusEffects.filter(s => s.type === 'modify_target')
  for (const mod of modifiers) {
    if (mod.applyTo === 'both'
      || (mod.applyTo === 'normal' && !isSkill)
      || (mod.applyTo === 'active' && isSkill)) {
      return mod.targetOverride  // 使用修改後的目標
    }
  }
  return isSkill ? hero.activeSkill.target : 'single_enemy'  // 預設
}
```

### 8.9 護盾視覺強化（shield）

目前護盾僅以 Buff 圖示（🛡️ / 頭頂「盾」字）呈現，缺乏視覺衝擊。v2.0 新增：

| 項目 | 說明 |
|------|------|
| **HP 條上方護盾條** | 在 HealthBar3D 和 BattleHUD 的 HP 條上方新增一層金色半透明護盾條，寬度 = `shieldValue / maxHP` |
| **護盾吸收飄字** | 新增 `DamageDisplayType: 'shield'`，護盾吸收時顯示金色飄字如「護盾 -150」 |
| **3D 護盾特效** | 英雄模型外圍半透明球形光罩（金色），護盾存在時持續顯示 |
| **護盾破碎動畫** | 護盾值歸零時播放碎裂粒子效果 |

---

## 九、執行流程（改造後）

```
1. 輪到英雄行動
2. 觸發 turn_start 效果
   → 遍歷 activePassives → 取各 skill 的 effects（via skill_effects）
   → 過濾 trigger === 'turn_start' 的 effect
   → 按 sortOrder 執行，檢查 dependsOn 鏈
3. 選擇行動（普攻 / 大招）
4. 大招 effects 執行：
   → 取 skill_effects WHERE skillId = activeSkillId ORDER BY sortOrder
   → 逐一執行，檢查 dependsOn 鏈
5. 每段傷害後觸發 on_attack / on_crit / on_kill 等被動效果
   → 只執行 trigger 匹配的 effect
6. 受擊方觸發 on_be_attacked / on_take_damage 等被動效果
   → counter_attack 在此階段觸發
7. 觸發 turn_end 效果
8. 處理 extra_turn 佇列
```

---

## 十、遷移範例

### 現有 ACT_1「烈火猛擊」

```json
// skill_templates.effects（v1）
[
  { "type": "damage", "scalingStat": "ATK", "multiplier": 1.8 },
  { "type": "debuff", "status": "dot_burn", "statusChance": 0.7, "statusValue": 0.3, "statusDuration": 2, "statusMaxStacks": 3 }
]
```

### 遷移後（v2）

```sql
-- effect_templates
INSERT INTO effect_templates (effectId, name, category, trigger_type, target, scalingStat, multiplier)
VALUES ('EFF_DMG_ATK_180', '烈焰斬擊', 'damage', 'immediate', 'single_enemy', 'ATK', 1.8);

INSERT INTO effect_templates (effectId, name, category, trigger_type, target, status, statusChance, statusValue, statusDuration, statusMaxStacks)
VALUES ('EFF_DOT_BURN_70', '烈焰灼傷', 'dot', 'immediate', 'single_enemy', 'dot_burn', 0.7, 0.3, 2, 3);

-- skill_effects
INSERT INTO skill_effects (skillId, effectId, sortOrder)
VALUES ('ACT_1', 'EFF_DMG_ATK_180', 1);

INSERT INTO skill_effects (skillId, effectId, sortOrder, dependsOn)
VALUES ('ACT_1', 'EFF_DOT_BURN_70', 2, 'EFF_DMG_ATK_180');
```

### PAS_11_3（on_kill → extra_turn）

```sql
INSERT INTO effect_templates (effectId, name, category, trigger_type, target, triggerLimit)
VALUES ('EFF_EXTRA_TURN_KILL', '安可', 'extra_turn', 'on_kill', 'self', 1);

INSERT INTO skill_effects (skillId, effectId, sortOrder)
VALUES ('PAS_11_3', 'EFF_EXTRA_TURN_KILL', 1);
```

---

## 實作對照

| 系統 | Spec 區段 | 原始碼 | 狀態 |
|------|----------|--------|------|
| EffectTemplate 型別 | §4 | `src/domain/types.ts` | ✅ 已實作 |
| effect_templates 表 | §5 | `workers/schema.sql` | ✅ 已實作 |
| skill_effects 關聯表 | §5 | `workers/schema.sql` | ✅ 已實作 |
| 效果載入 | — | `src/services/dataService.ts` | ✅ 已實作 |
| dependsOn 邏輯 | §6 | `src/domain/battleEngine.ts` | ✅ 已實作 |
| counter_attack | §8.1 | `src/domain/battleEngine.ts` | ✅ 已實作 |
| chase_attack | §8.2 | `src/domain/battleEngine.ts` | ✅ 已實作 |
| dispel_buff | §8.3 | `src/domain/buffSystem.ts` | ✅ 已實作 |
| steal_buff | §8.4 | `src/domain/buffSystem.ts` | ✅ 已實作 |
| transfer_debuff | §8.5 | `src/domain/buffSystem.ts` | ✅ 已實作 |
| energy_drain | §8.6 | `src/domain/battleEngine.ts` | ✅ 已實作 |
| execute 斬殺 | §8.7 | `src/domain/battleEngine.ts` | ✅ 已實作 |
| modify_target 目標變更 | §8.8 | `src/domain/battleEngine.ts` | ✅ 已實作 |
| 護盾視覺強化 | §8.9 | `src/components/SceneWidgets.tsx` + `BattleHUD.tsx` | ✅ 已實作 |
| 技能等級系統 | §7 | `src/services/dataService.ts`（含 Lv.2~5 自動縮放） | ✅ 已實作 |
| 效果圖標生成 | — | `src/utils/effectIconGenerator.ts`（被 SkillDescPanel 引用） | ✅ 已實作 |
| 技能描述面板 | §11 | `src/components/SkillDescPanel.tsx`（被 HeroListPanel 引用） | ✅ 已實作 |
| 升星技能升級詳情預覽 | §7 | `src/components/HeroListPanel.tsx`（★7+ 升星 Modal 內技能等級對比） | ✅ 已實作 |
| 效果疊加規則 | §12 | `src/domain/buffSystem.ts` | ✅ 已實作 |
| 遷移腳本 | §10 | —（已刪除） | ✅ 已完成並移除 |
| 單元測試 | — | `src/domain/__tests__/effectSystem.test.ts` | ✅ 已實作 |
| 戰鬥測試沙盒 | — | `src/components/BattleTestPanel.tsx` + `src/domain/testHeroes.ts` | ✅ 已實作 |
| 表現層動畫強化 | §8.1/§8.2/§8.7 | `src/game/runBattleLoop.ts` | ✅ 已實作 |
| 飄字視覺區分 | §8.7/§8.9 | `src/components/SceneWidgets.tsx` | ✅ 已實作 |
| 傷害統計修正 | — | `src/domain/battleEngine.ts` | ✅ 已實作 |
| 反擊/追擊 action type 修正 | §8.1/§8.2 | `src/domain/battleEngine.ts` + `src/domain/types.ts` | ✅ 已實作 |
| 沙盒多英雄支援 | — | `src/components/BattleTestPanel.tsx` + `src/domain/testHeroes.ts` | ✅ 已實作 |
| Workers 後端同步 | §8.1/§8.2 | `workers/src/domain/battleEngine.ts` | ✅ 已實作 |
| 死碼清除 counter/chase case | §8.1/§8.2 | `src/domain/battleEngine.ts` | ✅ 已實作 |
| SkillEffect 型別完整化 | §4 | `src/domain/types.ts` | ✅ 已實作 |
| modify_target 引擎邏輯 | §8.8 | `src/domain/battleEngine.ts`（resolveModifiedTarget + executeNormalAttack + executeSkill） | ✅ 已實作 |
| dependsOn 引擎強制執行 | §6 | `src/domain/battleEngine.ts`（executeSkill 內 effectSuccess 追蹤） | ✅ 已實作 |
| BattleHUD 護盾條 | §8.9 | `src/components/BattleHUD.tsx` + `src/App.tsx` + `src/App.css` | ✅ 已實作 |
| BattleHero.targetModifiers | §8.8 | `src/domain/types.ts` + `src/domain/battleEngine.ts` | ✅ 已實作 |

---

## 實作計畫（5 階段 / 16 步）

### Phase 1 — 資料結構（DB + Types）
1. 新增 `effect_templates` 表（D1 + schema.sql），每筆效果有唯一 effectId
2. 新增 `skill_effects` 關聯表（skill_id → effect_id + sortOrder + overrideParams + dependsOn）
3. 更新 `types.ts`：新增 EffectTemplate / EffectCategory / EffectTrigger 介面
5. _(depends on 1-3)_

### Phase 2 — 資料載入（Services）
6. 更新 `dataService.ts`：載入 effect_templates + skill_effects，組裝回 SkillTemplate
7. 更新 Workers routes（`data.ts`）：新增 readEffectTemplates + readSkillEffects 端點
8. _(parallel with 6-7)_

### Phase 3 — 戰鬥引擎
9. 更新 `battleEngine.ts`：效果層觸發條件（trigger 從技能下移到效果） _(depends on 6)_
10. 新增效果類型實作：counter_attack、chase_attack、dispel_buff、steal_buff、transfer_debuff、energy_drain _(depends on 9)_
11. 新增條件系統：has_status、hp_above_pct、enemy_count_below、ally_count_below、on_ally_attacked _(depends on 9)_
12. 新增效果依賴邏輯 dependsOn（effectA 命中才觸發 effectB） _(depends on 9)_

### Phase 4 — 資料遷移
13. 寫遷移腳本：將現有 63 筆技能的 effects JSON 拆解為 effect_templates + skill_effects 記錄
14. 部署遷移到 D1

### Phase 5 — 驗證
15. 更新單元測試（每種 category × trigger 至少 1 個 case）
16. 完整戰鬥流程 Playwright 測試

---

## 效果 ID 命名規範

格式：`EFF_{CATEGORY}_{描述}_{序號}`

| 規則 | 說明 | 範例 |
|------|------|------|
| CATEGORY | 效果分類縮寫（大寫） | DMG / DOT / HEAL / BUFF / DEBUFF / CC / SHIELD / ENERGY / EXTRA / COUNTER / CHASE / REVIVE / DISPEL / REFLECT / STEAL / TRANSFER / EXEC |
| 描述 | 效果特徵（大寫，可含底線） | ATK_180 / BURN / STUN / HP_20 |
| 序號 | 同類效果的流水號（3 位數） | 001 / 002 |

完整範例：
- `EFF_DMG_ATK_180_001` — ATK×180% 傷害
- `EFF_DOT_BURN_001` — 燃燒 DOT
- `EFF_BUFF_ATK_UP_001` — ATK 提升 buff
- `EFF_EXEC_HP15_001` — HP<15% 斬殺
- `EFF_COUNTER_ATK_80_001` — 80% 普攻反擊

---

## 效果 UI 圖標

每個 effectId 需要對應的圖標，用於技能描述面板和戰鬥日誌。

### 圖標來源策略

1. **StatusType 沿用**：buff / debuff / cc 類效果直接沿用現有 `STATUS_ICONS` / `STATUS_ICONS_3D` 的圖標系統
2. **category 級圖標**：每個 category 有一個預設圖標（作為沒有 status 的效果的 fallback）
3. **自動生成**：使用 Canvas API 或 SVG 動態生成 category 級圖標（純前端，無需外部資源）

| category | 預設圖標 | 顏色 |
|----------|---------|------|
| damage | ⚔️ 劍 | 紅色 |
| dot | 🔥 火 | 橙色 |
| heal | 💚 心 | 綠色 |
| buff | ⬆️ 上箭 | 綠色 |
| debuff | ⬇️ 下箭 | 紅色 |
| cc | 💫 暈 | 紫色 |
| shield | 🛡️ 盾 | 金色 |
| energy | ⚡ 雷 | 藍色 |
| extra_turn | 🔄 循環 | 藍色 |
| counter_attack | ↩️ 回擊 | 橙色 |
| chase_attack | ⚡ 追擊 | 青色 |
| revive | 💖 復活 | 粉色 |
| dispel_debuff | ✨ 淨化 | 白色 |
| dispel_buff | 🚫 驅散 | 灰色 |
| reflect | 🔃 反射 | 銀色 |
| steal_buff | 🖐️ 偷取 | 紫色 |
| transfer_debuff | ➡️ 轉移 | 暗紅 |
| execute | 💀 斬殺 | 黑紅 |
| modify_target | 🎯 目標 | 紫色 |

### 自動生成實作

```typescript
// src/utils/effectIconGenerator.ts
function generateEffectIcon(category: EffectCategory): string {
  // Canvas 繪製圓形底 + category emoji + 邊框色
  // 返回 data:image/png;base64 字串
  // 快取到 Map 避免重繪
}
```

---

## 十一、技能描述面板

目前只有 `HeroListPanel` 有基本的技能名稱 + 描述文字。v2.0 需要更豐富的技能資訊展示。

### 觸發場景

| 場景 | 位置 | 描述 |
|------|------|------|
| 英雄詳情頁 | `HeroListPanel` 技能區塊 | 點擊技能彈出詳情面板 |
| 戰鬥中長按 | `BattleHUD` 技能圖示 | 長按技能 icon 顯示 tooltip |
| 団隊編成頁 | 陣型編輯中點擊英雄 | 查看技能配置 |

### 面板內容

```
┌───────────────────────────────────┐
│  [⚔️ icon]  烈火猛擊     Lv.3  │
│  主動技 · 對單體敵人          │
├───────────────────────────────────┤
│  效果 1: ⚔️ ATK×250% 傷害       │
│     └ Lv.1: 180% → Lv.2: 200%     │
│       → Lv.3: 250% ★              │
│  效果 2: 🔥 燃燒 70% 機率         │
│     30%×2回合 (最高3層)         │
│     └ 需要效果 1 命中           │
├───────────────────────────────────┤
│  被動 1: ⚡ 攻擊力強化 (★1)     │
│     always · 自身 ATK+20%         │
│  被動 2: 🔥 燃燒之血 (★2)      │
│     on_attack · 30%機率燃燒      │
│  被動 3: 🛡️ 火焰護盾 (★4)     │
│     hp_below_pct(30%) · 護盾     │
│  被動 4: 💀 斬殺本能 (★6) 🔒  │
│     on_attack · HP<15%斬殺      │
└───────────────────────────────────┘
```

### 顯示元素

| 元素 | 說明 |
|------|------|
| **技能名稱** | 技能名 + 等級標示（Lv.X） |
| **類型標籤** | 主動技 / 被動 + 解鎖星級 |
| **目標標籤** | 單體敵人 / 敵方全體 / 自身 等 |
| **效果列表** | 每個效果一行：category icon + 數值描述 |
| **等級對比** | 顯示各等級數值差異，當前等級加★標記 |
| **依賴提示** | dependsOn 的效果顯示「需要效果 N 命中」 |
| **觸發條件** | 被動效果顯示 trigger 的中文翻譯 |
| **未解鎖** | 被動未解鎖時顯示鎖頭 🔒 + 解鎖星級 |

### trigger 中文對照

| trigger | 顯示文字 |
|---------|----------|
| `immediate` | 立即生效 |
| `battle_start` | 戰鬥開始時 |
| `turn_start` | 回合開始時 |
| `turn_end` | 回合結束時 |
| `on_attack` | 攻擊時 |
| `on_normal_attack` | 普攻時 |
| `on_skill_cast` | 施放大招時 |
| `on_crit` | 暴擊時 |
| `on_kill` | 擊殺敵人時 |
| `on_be_attacked` | 被攻擊時 |
| `on_take_damage` | 受傷後 |
| `on_lethal` | 受致命傷時 |
| `on_dodge` | 閃避成功時 |
| `on_ally_death` | 隊友死亡時 |
| `on_ally_skill` | 隊友施放大招時 |
| `on_ally_attacked` | 隊友被攻擊時 |
| `always` | 永久生效 |
| `hp_below_pct` | HP 低於 {param}% |
| `hp_above_pct` | HP 高於 {param}% |
| `every_n_turns` | 每 {param} 回合 |
| `enemy_count_below` | 敵人 ≤ {param} 時 |
| `ally_count_below` | 隊友 ≤ {param} 時 |
| `has_status` | 目標帶有 {param} |

### 元件

```typescript
// src/components/SkillDescPanel.tsx
interface SkillDescPanelProps {
  skill: SkillTemplate          // 技能模板
  effects: ResolvedEffect[]     // 解析後的效果列表（含 overrideParams 合併）
  skillLevel: number            // 當前技能等級
  allLevelEffects?: Map<number, ResolvedEffect[]>  // 各等級效果（用於對比）
  isLocked?: boolean            // 是否未解鎖
  unlockStar?: number           // 解鎖所需星級
  onClose: () => void
}

// ResolvedEffect = EffectTemplate + overrideParams merged + dependsOn info
interface ResolvedEffect extends EffectTemplate {
  dependsOnName?: string        // 前置效果名稱（用於顯示「需要 XX 命中」）
}
```

---

## 十二、效果疊加規則

現行 `applyStatus` 已有基本疊加邏輯，v2.0 將其正式化為明確規則並擴展。

### 同源疊加

同一 `effectId` 重複施加到同一目標：

| 情境 | stacks | value | duration |
|------|--------|-------|----------|
| **回合數相同** | +1（未滿層）| 累加 +value（合併%數） | 不變 |
| **回合數不同** | 視為**獨立效果** | 各自獨立 | 各自獨立倒數 |
| 已滿層、回合數相同 | 不變 | 不變 | 不變 |
| CC 重複施加 | 不變 | 不變 | 刷新（取較大值） |

```
範例：英雄 A 被動 on_attack 施加 dot_burn（30%/2回合），連續攻擊 3 次
→ 回合數都是 2，合併：stacks=3, value=90%, duration=2

範例：技能附加 dot_burn（30%/2回合），被動附加 dot_burn（20%/3回合）
→ 回合數不同，獨立：效果1 (30%/2回合) + 效果2 (20%/3回合)
→ 結算 DOT 時兩筆分別計算傷害
```

### 異源共存

不同 `effectId` 但同一 `StatusType` → **各自完全獨立**（各自有 stacks、duration）。

```
範例：英雄A 的被動施加 dot_burn（30%/2回合），英雄B 的技能也施加 dot_burn（50%/3回合）
→ 目標身上有兩筆獨立 DOT，結算時分別計算
```

### 3D 圖示顯示規則

無論同一 StatusType 有幾筆獨立效果，**英雄模型頭頂只顯示一個圖示**。顯示規則：

- 圖示右下角顯示**總層數**（所有獨立來源的 stacks 合計）
- Tooltip 展開時列出每筆獨立效果的明細

```
範例：英雄頭上顯示 🔥×5
  └ 效果A: dot_burn 30%×3層 (剩2回合)
  └ 效果B: dot_burn 50%×2層 (剩1回合)
```

### 互斥覆蓋

增減同屬性的 buff/debuff 互斥。施加新狀態時，若目標已有互斥狀態：

| 情境 | 行為 |
|------|------|
| **回合數相同** | 合併：移除舊的，新狀態的 value = 新值 - 舊值（正值為 buff，負值為 debuff） |
| **回合數不同** | 共存為獨立效果，結算時互相抵消 |

```
範例（同回合數）：目標有 atk_up +20%/2回合，新施加 atk_down -15%/2回合
→ 合併：atk_up +5%/2回合（20% - 15% = 淨+5%）

範例（不同回合數）：目標有 atk_up +20%/3回合，新施加 atk_down -15%/2回合
→ 共存：atk_up +20% (剩3回合) + atk_down -15% (剩2回合)
→ 結算時淨效果 = +20% - 15% = +5%
→ 2回合後 atk_down 消失，剩餘 atk_up +20% (剩1回合)
→ 英雄頭頂只顯示一個「攻↑」或「攻↓」（取淨值方向）
```

互斥對照表：

| 增益 | 減益 |
|------|------|
| `atk_up` | `atk_down` |
| `def_up` | `def_down` |
| `spd_up` | `spd_down` |
| `crit_rate_up` | `crit_rate_down` |

### 免疫阻擋

`immunity` buff 存在時，所有 debuff/cc 施加失敗。

### 同源 vs 異源判斷

```typescript
// buffSystem.ts 擴充
applyStatusV2(target, effect, sourceEffectId) {
  // 1. 互斥覆蓋檢查
  const opposite = MUTUAL_EXCLUSIVE_MAP[effect.type]
  if (opposite) handleMutualExclusion(target, effect, opposite)

  // 2. 查找同源
  const existing = target.statusEffects.find(
    s => s.type === effect.type
      && s.sourceEffectId === sourceEffectId
      && s.duration === effect.duration  // 回合數相同才合併
  )
  if (existing) {
    // 同源 + 同回合 → 合併疊加
    if (existing.stacks < existing.maxStacks) {
      existing.stacks++
      existing.value += effect.value
    }
  } else {
    // 異源 或 同源不同回合 → 新增獨立效果
    pushNewStatus(target, effect, sourceEffectId)
  }
}
```

### StatusEffect 擴充欄位

```typescript
interface StatusEffect {
  // ... 現有欄位
  sourceEffectId?: string   // 🆕 來源的 effectId（用於同源/異源判斷）
}
```

### 狀態解除規則

| 效果 | 行為 |
|------|------|
| `dispel_debuff`（淨化） | 移除目標身上**同一種類**的所有 debuff（如淨化 `dot_burn` → 移除所有燃燒效果） |
| `dispel_buff`（驅散） | 移除目標身上**同一種類**的所有 buff |
| `steal_buff` | 移除目標 1 個 buff → 施加到自己身上 |
| `transfer_debuff` | 移除自己 1 個 debuff → 施加到目標身上 |

`dispel_debuff` / `dispel_buff` 的 `status` 欄位指定要淨化的 StatusType。若未指定，則隨機移除 `flatValue` 個。

### 狀態數量

Buff / Debuff / Shield **數量無上限**。英雄可以同時存在任意數量的狀態效果。

### 狀態消失順序

每個狀態有自己的 `duration` 倒數。誰的回合先到，誰的狀態先扣回合數，到 0 就自動消失。沒有全域的優先解除順序 — 完全依回合倒數自然過期。

---

## 擴展點

- [ ] 戰鬥日誌 — 記錄每個效果的觸發 / 命中 / 被閃避 / 被免疫

---

## 設計決策

1. **效果可被多個技能重用**（透過 overrideParams 區分數值）
2. **觸發條件位於效果層**，不在技能層（技能的 passiveTrigger 僅作啟用開關）
3. **反擊/追擊不觸發連鎖**（反擊不觸發對方反擊、追擊不觸發其他追擊 — 防止無限迴圈）
4. **反擊/追擊不限制每回合次數** — 每次觸發事件都可觸發，由 `triggerChance` 控制頻率
5. **星級上限 10★**（★1~6 解鎖被動 slot，★7~10 提升技能等級 Lv.2~5），透過 skillLevel 的 overrideParams 實現
7. **護盾視覺強化** — HP 條上方金色護盾條 + 吸收飄字 + 3D 光罩 + 碎裂動畫
8. **效果圖標自動生成** — Canvas/SVG 動態產生 category 級圖標，StatusType 效果沿用現有系統
9. **effectId 命名格式** — `EFF_{CATEGORY}_{描述}_{序號}`，統一大寫 + 3 位流水號
10. **buff/debuff 增減互斥** — atk_up 覆蓋 atk_down，反之亦然（DEF/SPD/CritRate 同理）
11. **同源疊加 + 異源共存** — 同 effectId 走 stacks，不同 effectId 但同 StatusType 各自獨立
12. **Buff/Debuff/Shield 數量無上限** — 可同時存在任意數量的狀態效果
13. **同源同回合合併、不同回合獨立** — 合併時相加%數；獨立效果各自倒數，但頭頂只顯示一個圖示
14. **互斥同回合抵消、不同回合共存** — 結算時取淨值，視覺顯示淨值方向
15. **淨化移除同類全部** — dispel_debuff/dispel_buff 指定 StatusType 時移除該類全部；未指定時隨機移除 flatValue 個
16. **狀態消失依回合倒數** — 每個狀態有自己的 duration，誰先到期誰消失
17. **modify_target 改變攻擊目標** — 被動可將普攻/大招從單體改為 AoE / 隨機 N 體 / 前後排

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v2.0 | 2026-03-15 | 草案：效果模組化系統設計（17 種 category、23 種 trigger、EffectTemplate、dependsOn、overrideParams、6 種新機制） |
| v2.1 | 2026-03-15 | 更新：新增 execute 斬殺（18 種 category）；反擊/追擊取消每回合次數限制+支援多目標；新增技能等級系統（★7~10）；新增護盾視覺強化規格；新增效果圖標自動生成規格；新增 effectId 命名規範；移除技能冷卻/連鎖技擴展點 |
| v2.2 | 2026-03-15 | 新增§11 技能描述面板（wireframe + 元件定義 + trigger 中文對照）；新增§12 效果疊加規則（同源疊加/異源共存/互斥覆蓋表/FIFO 上限）；StatusEffect 新增 sourceEffectId 欄位 |
| v2.3 | 2026-03-15 | 細化§12：同源同回合合併（加%數）/不同回合獨立；互斥同回合抵消/不同回合共存取淨值；頭頂圖示合併顯示規則；新增§8.8 modify_target（改變普攻/大招目標規則）；新增 dependsOn/overrideParams/效果複用詳細範例；EffectTemplate 新增 targetOverride + applyTo 欄位 |
| v2.4 | 2026-03-15 | 修正§12：狀態數量無上限（移除 buff 8/shield 3 的限制）；淨化改為移除同類全部（非固定 3 筆）；狀態消失改為依回合倒數自然過期（非 LIFO）；統一「效果連鎖」用詞為「效果依賴」 |
| v2.5 | 2026-03-15 | 移除§10 向下相容策略（遷移已完成，不再需要 fallback）；章節重新編號（十一→十、十二→十一、十三→十二）；移除設計決策「effects JSON 保留作 deprecated fallback」 |
| v2.6 | 2026-03-15 | 全面 spec-vs-code 合規修正：(1) §8.1/§8.2 counter_attack/chase_attack 加入 _isCounterAttack/_isChaseAttack 連鎖防護旗標；(2) §8.7 execute 斬殺前呼叫 checkLethalPassive；(3) shield/cc/dot 發送 SHIELD_APPLY/BUFF_APPLY action 通知表現層；(4) 技能傷害觸發 on_ally_attacked 被動；(5) 被動 energy 支援負值吸取；(6) 被動 dispel_buff 支援 effect.status 類型過濾；(7) §5 CREATE TABLE 更正：trigger→trigger_type、新增 targetOverride/applyTo 欄位、skill_effects PK 含 skillLevel、移除 FOREIGN KEY；(8) §10 圖標表補上 modify_target；(9) BattleAction 新增 SHIELD_APPLY 類型；(10) BattleContext 新增 _isCounterAttack/_isChaseAttack 欄位 |
| v2.7 | 2026-03-15 | 全修 10 項已知問題：(1) 表現層 runBattleLoop 新增 7 種 v2.0 BattleAction 處理（COUNTER/CHASE/EXECUTE/STEAL_BUFF/TRANSFER_DEBUFF/SHIELD_APPLY/SHIELD_BREAK）；(2) 普攻/技能傷害前呼叫 checkLethalPassive（on_lethal 保命被動）；(3) checkHpBelowPassives 改用結構化 targetHpThreshold/flatValue 取代 description 字串解析；(4) 修復 44 個單元測試（10 檔案）；(5) 刪除孤兒 migrate-effects.ts；(6) SQL 範例 trigger→trigger_type + 移除多餘 type 欄位；(7) §8.8/§8.9 實體順序修正（modify_target→§8.8、shield→§8.9）；(8) 實作追蹤表更新遷移腳本狀態；(9) 修正 v2.3/v2.6 changelog 章節引用 |
| v2.8 | 2026-03-15 | 修復 4 項殘留風險 + 新增戰鬥測試沙盒：(1) COUNTER/CHASE 動畫強化為前進→攻擊→受擊→後退完整流程；(2) DamagePopup 支援 execute（💀斬殺）/ shield（🛡️金色）/ dot（橙色）/ reflect（紫色）視覺區分；(3) totalDamageDealt 保命被動後改記實際扣血量而非全額傷害；(4) 新增戰鬥效果測試沙盒（BattleTestPanel + testHeroes.ts），支援 7 種預設情境（反擊/DOT/保命/護盾/斬殺/CC/反傷）+ 自訂英雄模式 + 詳細戰鬥日誌 + Playwright 自動化結構化 data-testid |
| v2.9 | 2026-03-15 | 修復引擎 COUNTER_ATTACK/CHASE_ATTACK action type + 沙盒多英雄支援：(1) 被動 damage case 根據 _currentTrigger 分派正確 action type（on_be_attacked→COUNTER_ATTACK、on_ally_skill/on_ally_attacked→CHASE_ATTACK）；(2) 修正 on_be_attacked damage 目標為 context.attacker（敌人）而非 context.target（自己）；(3) on_ally_attacked 新增 _originalAttacker 提供追擊正確目標；(4) on_ally_skill context.target 改為技能命中的第一個敵人（而非技能施放者）；(5) BattleContext 新增 _currentTrigger/_originalAttacker 欄位；(6) 沙盒自訂模式支援每方最多 6 名英雄（新增/刪除）；(7) 新增 3 個多人測試情境（追擊-隊友大招、3v1/追擊-隊友被攻擊、2v1/反擊多人、2v2） || v2.10 | 2026-03-15 | Workers 後端同步 + 死碼清除：(1) workers/src/domain/battleEngine.ts 同步 v2.9 前端修正（BattleContext 新增 _currentTrigger/_originalAttacker、triggerPassives 設定 _currentTrigger、damage case 分派 COUNTER_ATTACK/CHASE_ATTACK）；(2) Workers 新增 on_ally_attacked 觸發（executeNormalAttack + executeSkill 內）；(3) Workers 新增 on_ally_skill 觸發 + on_ally_death 觸發；(4) 前端刪除 executePassiveEffect 中永遠不會執行的 case 'counter_attack' 和 case 'chase_attack' 死碼（-0.92 KB） |
| v2.11 | 2026-03-15 | 孤兒檔案審計修復：(1) SkillDescPanel.tsx 整合至 HeroListPanel——點擊技能行彈出技能描述面板（顯示效果列表、等級對比、依賴提示、觸發條件、鎖定狀態）；(2) effectIconGenerator.ts 整合至 SkillDescPanel——getCategoryEmoji/getCategoryColor 提供分類圖標和左邊框色彩；(3) 新增 dataService.getEffectTemplatesCache/getSkillEffectsCache 同步存取器；(4) 新增 150+ 行 CSS 樣式（.skill-desc-panel/overlay/header/effects/levels）；(5) 全面審計 Spec 實作對照表 27 項——確認所有「✅ 已實作」項目均實際被引用且功能正常 |
| v2.12 | 2026-03-15 | 深度審計修復 4 項缺失：(1) **SkillEffect 型別完整化**——將 19 種 v2.0 EffectCategory 全部加入 SkillEffect.type 聯合型別，移除所有 `as SkillEffect['type']` 強制轉型（14 處）；新增 dependsOn/targetOverride/applyTo 欄位；(2) **modify_target 引擎邏輯**——新增 TargetModifier 介面 + BattleHero.targetModifiers 欄位 + resolveModifiedTarget() 輔助函式；executeNormalAttack 支援 modify_target（多目標普攻 + 傷害修正）；executeSkill 支援 modify_target（目標覆寫 + 傷害修正）；(3) **dependsOn 引擎強制執行**——executeSkill 新增 effectSuccess Map 追蹤每個效果的命中/失敗；dependsOn 索引參照前置效果成功才繼續；非 damage 效果預設視為命中；(4) **BattleHUD 護盾條**——新增 shieldTotal prop + 金色護盾條 CSS（.bhud-shield-bar/.bhud-shield-fill）；App.tsx 從 battleHeroesRef.shields 計算總護盾值傳入 HUD |
| v2.18 | 2026-03-16 | 保命被動日誌修正：(1) **checkLethalPassive 返回型別改為 LethalSaveInfo**——從 `boolean` 改為 `{ saved: true; skillId: string; skillName: string } | false`，讓呼叫端能發送正確的 PASSIVE_TRIGGER action；(2) **5 個呼叫點全部補上 PASSIVE_TRIGGER**——普攻（含 modify_target 多目標）、單體普攻、技能傷害、executeSkill 的 execute case、executePassiveEffect 的 execute case 五處，保命觸發後立即 cfg.onAction PASSIVE_TRIGGER；(3) **Playwright 驗證**——戰鬥測試沙盒「保命被動測試」日誌從 0 筆被動觸發 → 正確顯示 1 筆「被動【不死之身】觸發」 |
| v2.23 | 2026-03-17 | DOT 修復 + 技能圖示 + 15 新英雄：(1) **DOT 毒傷 bug 修復**——processDotEffects 改為 data-driven（使用 status.value 而非硬編碼係數），移除 ×stacks 雙重計算；新增 `DOT_POISON_HP_CAP=100,000` 防止首領百分比毒傷爆炸（前端 buffSystem.ts + Workers battleEngine.ts 同步修復）；processRegen 同步移除 ×stacks；D1 瘟疫醫生毒傷 statusValue 0.4→0.03、0.35→0.02；(2) **Canvas 技能圖示系統**——effectIconGenerator.ts 新增 `generateSkillIcon()` 函式，64×64 Canvas 產生漸層背景/光暈/金屬邊框/emoji 中心的遊戲風格圖示；12 種顏色主題（fire/ice/poison/shadow/blood/holy/nature/arcane/steel/wind/death/light）；HeroListPanel 新增 `SkillIcon` 組件替換 4 處純文字 emoji；自動從 emoji 推導主題色；(3) **15 隻新英雄 (heroId 16~30)**——N×2（腐蝕蟲、枯骨兵）、R×4（影行者、毒蕈師、鏽鋼衛士、亡靈弓手）、SR×5（血族伯爵、炎魔、魂縛者、冰霜巫妖、深淵使徒）、SSR×4（末日審判者、瘟疫女王、虛空獵手、不朽將軍）；每隻 1 主動+4 被動技能；共 75 筆 skill_templates + 110 筆 effect_templates + 100 筆 skill_effects；SQL 腳本 `workers/_insert_heroes_16_30.sql` |
| v2.22 | 2026-03-17 | dependsOn 提示文字修正 + 效果名稱全面重命名：(1) **dataService.ts dependsOnName 改為位置索引**——從直接使用 effect_templates.name（如「被動傷害」）改為根據同技能效果列表的順序顯示「效果 N」，消除 UI 中無意義的「需要『被動傷害』生效」文字；(2) **D1 effect_templates 76 筆名稱更新**——所有效果名從自動遷移的泛用命名（如「被動傷害」「被動減益 (dot_burn)」）改為與技能名對應的有意義中文名稱（如「暗影突襲」「烈焰灼傷」「狂暴強化」「威嚇降攻」等）；(3) **瘟疫醫生 v2.0 遷移**——Hero #15 補齊 9 筆 effect_templates + 9 筆 skill_effects（主動技 dependsOn 鏈 + 4 個被動），確認 SkillDescPanel 效果列表、等級對比、依賴提示全部正確顯示 |
| v2.21 | 2026-03-16 | 魔術數字系統性消除 + 常數守護測試：(1) **LEVEL_SCALE 單一來源**——從 dataService.ts 的重複定義改為 import progressionSystem.ts 的 `LEVEL_SCALE`；(2) **battleEngine 被動欄位**——`starLevel >= 6 ? 4 : ...` 硬編碼三元運算改為 `getStarPassiveSlots(starLevel)`；(3) **runBattleLoop 技能等級**——`starLevel > 6 ? starLevel - 5 : 1` 改為 `getSkillLevel(starLevel)`；(4) **Workers progression.ts**——新增 `MAX_STARS`/`MAX_ASCENSION` 具名常數取代硬編碼 `10`/`5`；(5) **Workers arena.ts**——STAR_MUL/STAR_PASSIVE 加上同步警告註解；(6) **constantsGuard.test.ts**——新增 102 個守護測試，驗證所有常數表（STAR_PASSIVE_SLOTS/STAR_MULTIPLIER/STAR_UP_COST/RARITY_STAR_MULT/ASCENSION_LEVEL_CAP/ASCENSION_COSTS/RARITY_ASC_MULT/RARITY_LEVEL_GROWTH/LEVEL_SCALE）涵蓋完整的星級和突破範圍，未來修改 MAX_STARS 時若忘記同步表格會立刻被測試攔截 |
| v2.20 | 2026-03-16 | 星級常數集中化 + Workers ★7-10 修復：(1) **新增集中化常數**——progressionSystem.ts 新增 `MAX_STARS=10`、`SKILL_LEVEL_STAR_THRESHOLD=6`、`getSkillLevel()` 函式，消除所有魔術數字；(2) **HeroListPanel 魔術數字替換**——13 處硬編碼的 `10`/`6`/`stars > 6 ? stars - 5 : 1` 全部替換為 `MAX_STARS`/`SKILL_LEVEL_STAR_THRESHOLD`/`getSkillLevel()`；(3) **Workers arena.ts STAR_MUL 修復**——★7-10 四個稀有度乘數缺失（fallback 1.0 導致 ★7+ 戰力計算嚴重偏低），補齊正確數值（如 SSR: 7→1.48, 8→1.54, 9→1.60, 10→1.68）；(4) **Workers arena.ts STAR_PASSIVE 修復**——★7-10 被動欄位數缺失，補齊為 4；(5) **Workers 重新部署**——修復自 v2.16 以來未重新部署的陳舊 bundle（仍有 `stars >= 6` 上限檢查） |
| v2.19 | 2026-03-16 | 升星介面★７+ 技能升級詳情：(1) **修復 nextStars 上限 Bug**——`Math.min(6, stars+1)` 改為 `Math.min(10, stars+1)`，修正 ★7+ 屬性預覽和星級顯示錯誤；(2) **技能等級詳情區塊**——升星 Modal 在 nextStars > 6 時顯示詳細技能升級對比（主動+所有已解鎖被動），每個技能顯示 Lv.X 和 Lv.Y 的效果描述對比，無變化的技能顯示單一描述；(3) **星級視覺變化**——升星預覽 StarDisplay 現在能正確顯示 ★7+ 金色星星（star-gold class）；★1-6 仍顯示「被動欄位不變」提示，★7+ 改為顯示技能升級區塊；(4) **新增 CSS**——`.hd2-star-skill-upgrade` 系列樣式（金色邊框、技能對比行、等級標籤色彩區分） |
| v2.17 | 2026-03-16 | 星級顯示與技能等級修正：(1) **StarDisplay 擴展至 10★**——從硬編碼 6 顆改為 10 顆，★7-10 使用橙金色 `star-gold` 特殊顯色；(2) **技能等級自動縮放**——dataService 新增 `LEVEL_SCALE=[1.0,1.15,1.30,1.50,1.75]` + `applyLevelScaling()` 函式，當 D1 無 Lv.2~5 的 `skill_effects` 記錄時，自動對 multiplier/statusValue/flatValue 套用等級倍率；resolveSkillEffects 與 resolveSkillEffectsForBattle 均已整合，確保 UI 顯示和戰鬥引擎都能正確反映技能等級效果；(3) **等級對比面板**——SkillDescPanel 的 Lv.1~5 對比現在有實際數值差異（如 ATK×120%→138%→156%→180%→210%） |
| v2.16 | 2026-03-16 | 技能描述品質全面提升 + 星級上限擴展：(1) **effectDescription 重寫**——19 種 category 各自產生語意完整的中文句子（如 damage→「造成 攻擊×180% 傷害」、reflect→「反彈受到傷害的 15%」、revive→「致命傷時回復 HP 至 30%」），取代原本簡潔拼接的 token 格式；(2) **被動技能描述改由效果驅動**——HeroListPanel 的 SkillDescWithTags 新增效果資料解析，被動技能描述從 DB 靜態文字改為 effectDescription() 動態生成，確保描述與實際效果永遠一致；(3) **dependsOn 措辭修正**——「需要 XX 命中」改為「需要 XX 生效」，更準確描述效果依賴關係；(4) **星級上限 6→10**——前端 progressionSystem（canStarUp/STAR_UP_COST/STAR_MULTIPLIER/RARITY_STAR_MULT）+ Workers progression.ts（max_stars 檢查）+ HeroListPanel UI 限制全面調整；新增 ★7-10 升星費用（320/640/1280/2560 碎片）和屬性乘數；★7-10 不再解鎖新被動，改為提升技能等級（Lv.2~5）；(5) **效果圖示確認**——emoji 為最終設計方案，Canvas generateEffectIcon() 保留但不啟用（spec §圖標 已更新說明） |
| v2.15 | 2026-03-16 | 效果圖標修正：(1) **reflect/steal_buff emoji 相容性修復**——🪞(U+1FA9E)→🔃、🫳(U+1FAF3)→🖐️，解決較舊系統顯示亂碼問題；(2) **effectDescription 無 scalingStat 倍率顯示**——新增 `else if (multiplier && !scalingStat)` 分支，讓 reflect/counter_attack/chase_attack 等不依賴屬性的效果正確顯示百分比；(3) **category 中文標籤**——新增 CATEGORY_MULTIPLIER_LABEL（reflect→反傷、counter_attack→反擊、chase_attack→追擊），讓效果描述更直觀 |
| v2.14 | 2026-03-16 | 技能等級效果修正：(1) **等級對比智慧隱藏**——SkillDescPanel 等級對比改用 `effectDescription()` 完整渲染所有效果類型（不再只顯示 multiplier）；HeroListPanel 新增 JSON 簽名比對，等級間無差異時隱藏等級對比區（避免 Lv.1~5 全部一樣的誤導 UI）；(2) **戰鬥引擎技能等級整合**——新增 `resolveSkillEffectsForBattle()` 函式（dataService.ts），將 effect_templates+skill_effects+overrideParams 解析為 SkillEffect[]；runBattleLoop.ts 開戰前根據英雄星級計算 skillLevel 並覆寫 activeSkill.effects 和 passives.effects，確保戰鬥實際使用技能等級效果（而非僅顯示層面） |
| v2.13 | 2026-03-15 | UI 文字全面中文化審計：(1) **SkillDescPanel** — `eff.status` 改用 `statusZh()` 顯示中文（如 dot_burn→「灼燒」）；`eff.scalingStat` 改用 `statZh()` 顯示中文（如 ATK→「攻擊」）；等級對比同步修正；`has_status` 的 triggerParam 也經過 statusZh 翻譯；(2) **HeroListPanel** — TRIGGER_LABEL 補齊 7 個新增觸發條件（on_normal_attack/on_skill_cast/on_ally_attacked/hp_above_pct/enemy_count_below/ally_count_below/has_status）；TARGET_LABEL 補齊 trigger_source；(3) **BattleTestPanel** — DOT_TICK/BUFF_APPLY/BUFF_EXPIRE/STEAL_BUFF/TRANSFER_DEBUFF 改用 statusZh 顯示中文；篩選器按鈕和日誌標籤新增 ACTION_TYPE_ZH 中文對照表（如 NORMAL_ATTACK→「普攻」）；(4) **runBattleLoop** — 戰鬥 console 日誌同步修正 statusZh 翻譯 |