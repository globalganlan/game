# 技能系統 Spec

> 版本：v1.1 ｜ 狀態：🟢 已實作
> 最後更新：2026-06-14
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/domain/types.ts`（型別）、`src/domain/battleEngine.ts`（執行）、`src/services/dataService.ts`（資料載入）

## 概述

技能分為**主動技能（active）**與**被動技能（passive）**。
每位英雄有 **1 個主動技能（大招）** 和 **4 個被動技能**（受星級限制解鎖）。
所有技能資料存於 Google Sheets，前端透過 `dataService` 載入並解析。

## 依賴

- `specs/core-combat.md` §4 → 能量系統（大招門檻 1000）
- `specs/core-combat.md` §5 → Buff/Debuff 系統
- `specs/core-combat.md` §6 → 被動觸發機制
- `specs/damage-formula.md` → 傷害 / 治療計算
- Google Sheets `skill_templates` 表 + `hero_skills` 表

---

## 一、資料架構 

### SkillTemplate（技能模板）

```typescript
// src/domain/types.ts
interface SkillTemplate {
  skillId: string         // 唯一 ID，如 'ACT_1', 'PAS_2_1'
  name: string            // 技能名稱
  type: 'active' | 'passive'
  element: Element | ''   // 技能屬性（空 = 無屬性）
  target: TargetType | string  // 目標類型
  description: string     // 技能描述文字
  effects: SkillEffect[]  // 效果列表（一個技能可有多個效果）
  passiveTrigger: PassiveTrigger | ''  // 被動觸發時機
  icon: string            // 圖標路徑
}
```

### SkillEffect（技能效果模組）

```typescript
interface SkillEffect {
  type: 'damage' | 'heal' | 'buff' | 'debuff' | 'energy'
      | 'revive' | 'dispel_debuff' | 'extra_turn' | 'reflect'
  scalingStat?: keyof FinalStats  // 基於哪個數值（ATK / HP / DEF）
  multiplier?: number             // 倍率（1.8 = 180%）
  flatValue?: number              // 固定值加成
  hitCount?: number               // 多段攻擊次數（⬜ 未實作）
  status?: StatusType             // Buff/Debuff 類型
  statusChance?: number           // 觸發機率 0~1（預設 1.0）
  statusValue?: number            // 效果數值
  statusDuration?: number         // 持續回合（預設 2）
  statusMaxStacks?: number        // 最大疊加數（預設 1）
}
```

### HeroSkillConfig（英雄技能配置）

```typescript
interface HeroSkillConfig {
  heroId: number
  activeSkillId: string       // 主動技能 ID
  passive1_skillId: string    // 被動 1（1 解鎖）
  passive2_skillId: string    // 被動 2（2 解鎖）
  passive3_skillId: string    // 被動 3（4 解鎖）
  passive4_skillId: string    // 被動 4（6 解鎖）
}
```

---

## 二、目標類型 

```typescript
type TargetType =
  | 'single_enemy'       // 單體敵人（普攻策略）
  | 'all_enemies'        // 敵方全體
  | 'random_enemies_3'   // 隨機 3 體（可重複）
  | 'front_row_enemies'  // 敵方前排（全滅 fallback 後排）
  | 'back_row_enemies'   // 敵方後排（全滅 fallback 前排）
  | 'single_ally'        // HP% 最低的隊友
  | 'all_allies'         // 我方全體
  | 'self'               // 自身
```

> `targetStrategy.ts` 還支援 regex 匹配 `random_enemies_\d+`（如 `random_enemies_5`）。

---

## 三、效果類型實作狀態

| SkillEffect.type | 狀態 | 說明 |
|-----------------|------|------|
| `damage` | ✅ 已實作 | 呼叫 `calculateDamage(attacker, target, effect)` |
| `heal` | ✅ 已實作 | 呼叫 `calculateHeal(healer, target, effect)` |
| `buff` | ✅ 已實作 | `applyStatus(target, ...)` + 機率判定 |
| `debuff` | ✅ 已實作 | 同上，受 `immunity` 阻擋 |
| `energy` | ✅ 已實作 | `addEnergy(target, flatValue)` |
| `revive` | ✅ 已實作 | 由 `checkLethalPassive()` 特殊處理 |
| `dispel_debuff` | ✅ 已實作 | `cleanse(target, 1)` |
| `reflect` | ✅ 被動中實作 | 施加 reflect buff |
| `extra_turn` | ⬜ TODO | 額外行動機制 |

### Buff/Debuff 施加流程

```typescript
// src/domain/battleEngine.ts executeSkill() 內
case 'buff':
case 'debuff': {
  const chance = effect.statusChance ?? 1.0
  if (Math.random() < chance && effect.status) {
    const success = applyStatus(target, {
      type: effect.status,
      value: effect.statusValue ?? 0,
      duration: effect.statusDuration ?? 2,
      maxStacks: effect.statusMaxStacks ?? 1,
      sourceHeroId: attacker.uid,
    })
    if (success) → cfg.onAction({ type: 'BUFF_APPLY', ... })
  }
}
```

---

## 四、被動觸發時機 

```typescript
type PassiveTrigger =
  | 'battle_start'    // 戰鬥開始（只觸發一次）
  | 'turn_start'      // 自身回合開始
  | 'turn_end'        // 自身回合結束
  | 'on_attack'       // 攻擊前（普攻 + 大招皆觸發）
  | 'on_kill'         // 擊殺敵人
  | 'on_be_attacked'  // 被攻擊時
  | 'on_take_damage'  // 受傷後
  | 'on_lethal'       // 致命傷保命（每場限次）
  | 'on_dodge'        // 閃避成功
  | 'on_crit'         // 暴擊觸發
  | 'hp_below_pct'    // HP 低於閾值（15%/30%/50%，只觸發一次）
  | 'every_n_turns'   // 每 N 回合
  | 'always'          // 永久效果（duration=0）
```

### 被動效果支援

| effect.type | 被動中的行為 |
|------------|------------|
| `buff` | 對自身施加 buff |
| `debuff` | 對觸發目標（context.target）施加 debuff |
| `heal` | 自回復（scalingStat × multiplier + flatValue） |
| `energy` | 自身加能量 |
| `damage` | 對 context.target 反擊 |
| `revive` | checkLethalPassive 保命 |

---

## 五、星級解鎖被動 

| 星級 | 被動數 | slot |
|------|--------|------|
| ★1 | 1 | passive1 |
| ★2 | 2 | passive1~2 |
| ★4 | 3 | passive1~3 |
| ★6 | 4 | passive1~4 |

```typescript
// createBattleHero()
const passiveSlots = starLevel >= 6 ? 4 : starLevel >= 4 ? 3 : starLevel >= 2 ? 2 : 1
activePassives = passives.slice(0, passiveSlots)
```

> 目前預設所有角色 starLevel = 1（僅 1 個被動），升星系統為 progression 擴展點。

---

## 六、Google Sheets 資料結構 

### skill_templates 表

| 欄位 | 型別 | 說明 |
|------|------|------|
| skillId | string | 唯一 ID |
| name | string | 技能名稱 |
| type | string | `active` 或 `passive` |
| element | string | 屬性（中/英文皆可） |
| target | string | TargetType |
| description | string | 描述 |
| effects | string | **JSON 字串**（`SkillEffect[]`） |
| passive_trigger | string | PassiveTrigger |
| icon | string | 圖標路徑 |

### hero_skills 表

| 欄位 | 型別 | 說明 |
|------|------|------|
| heroId | number | 英雄 ID |
| activeSkillId | string | 主動技能 skillId |
| passive1_skillId | string | 被動 1 skillId |
| passive2_skillId | string | 被動 2 skillId |
| passive3_skillId | string | 被動 3 skillId |
| passive4_skillId | string | 被動 4 skillId |

### effects JSON 範例

```json
[
  {
    "type": "damage",
    "scalingStat": "ATK",
    "multiplier": 1.8
  },
  {
    "type": "debuff",
    "status": "dot_burn",
    "statusChance": 0.7,
    "statusValue": 0.3,
    "statusDuration": 2,
    "statusMaxStacks": 3
  }
]
```

---

## 七、資料載入流程 

```typescript
// src/services/dataService.ts

// 1. 載入技能模板
const rows = await readSheet<RawSkillRow>('skill_templates')
const skillsMap = new Map<string, SkillTemplate>()
for (const row of rows) {
  const skill = toSkillTemplate(row)  // 解析 JSON effects
  skillsMap.set(skill.skillId, skill)
}

// 2. 載入英雄技能對照
const heroSkillRows = await readSheet<RawHeroSkillRow>('hero_skills')
const heroSkillsMap = new Map<number, HeroSkillConfig>()

// 3. 查詢指定英雄的完整技能配置
getHeroSkillSet(heroId, skillsMap, heroSkillsMap)
// → { activeSkill: SkillTemplate | null, passives: SkillTemplate[] }
```

### 快取策略

- 每張表只讀取一次（`sheetApi.ts` 層級快取）
- `dataService.ts` 層級也有模組快取（`heroesCache`, `skillsCache`, `heroSkillsCache`）
- `loadAllGameData()` 一次並行載入所有表
- `clearGameDataCache()` 可重設所有快取

---

## 八、技能 ID 命名慣例

| 前綴 | 類型 | 範例 |
|------|------|------|
| `ACT_N` | 主動技能 | `ACT_1`（英雄 1 的大招） |
| `PAS_N_M` | 被動技能 | `PAS_1_1`（英雄 1 的被動 1） |
| `NORMAL` | 普通攻擊 | 不需要 SkillTemplate |

---

## 擴展點

- [ ] `hitCount` 多段攻擊（每段獨立暴擊 / 閃避）
- [ ] `extra_turn` 額外行動
- [ ] `shield` 效果類型（直接產生護盾而非走 buff）
- [ ] `execute` 斬殺（HP 低於閾值直接擊殺）
- [ ] `dispel_buff` 驅散正面效果
- [ ] 技能冷卻 CD（目前僅用能量門檻限制）
- [ ] 連鎖技（連續施放多個技能）
- [ ] 技能升級（同技能不同等級的數值差異）
---

## 九、平衡設計原則（v1.1 新增）

### 主動技能倍率與目標數反比

目標越多→單體係數越低，確保單體技 > AoE 技的單体傷害。

| 目標類型 | 倍率 | 平均總傷害 |
|------|------|------|
| single_enemy | ATK×350% | 350% |
| back_row (~2-3) | ATK×220% | ~440-660% |
| front_row (~2-3) | ATK×180% | ~360-540% |
| random_enemies_3 | ATK×140%×3 | 420% |
| all_enemies (~4-6) | ATK×120% | ~480-720% |
| single_ally (heal) | ATK×350% | — |
| all_allies (heal) | HP×20% | — |

### 被動技能依稀有度分層

| 稀有度 | 被動定位 | 特徵 |
|--------|---------|------|
| ★4 | 強力自身增強 | 高數值（+20~55%）、獨特機制（反彈、曉眩、斬殺） |
| ★3 | 均衡型 | 中等數值，自身 buff/debuff，部分全體效果 |
| ★2 | 自身+光環 | 混合自身加成與小幅全隊光環（SPD/DEF +5~8%） |
| ★1 | 全光環支援 | 被動全部運用於全隊（全隊 ATK、全敵 DEF降、全隊能量加速） |
## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2025-02-26 | 草案：技能系統設計規劃 |
| v0.2 | 2025-02-26 | 草案：新增被動觸發 + 效果模組化設計 |
| v1.0 | 2025-02-26 | **已實作**：完整型別 + Sheets 資料管線 + 引擎執行邏輯 |
| v1.1 | 2026-06-14 | **平衡重設計**：主動技倍率依目標數反比（single 350% > all 120%）；被動技依稀有度分層（★4=強力自 buff, ★1=全光環支援）；#6 無名活屍改為全光環專家；#1/#9/#14 新增光環被動 |
