# 戰鬥系統 Spec

> 版本：v4.0 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-15
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/domain/battleEngine.ts`（前端邏輯）、`gas/battleEngine.js`（後端引擎）、`src/App.tsx`（3D 演出整合）、`gas/程式碼.js`（`handleCompleteBattle_` 伺服器端結算）

## 概述

6v6 自動戰鬥系統。玩家在戰前從英雄列表選擇角色佈陣（6 格 × 前後排），
敵方由系統或關卡配置編成。戰鬥為**全自動回合制**，
角色依速度排序逐一行動，跑到目標面前攻擊後退回原位。

**v2.0**：能量系統（大招機制）、Buff/Debuff 系統、完整傷害公式、被動技能觸發。
**v2.1**：Domain Engine 完整實作 — 純邏輯引擎 + Command Pattern 3D 演出。

## 依賴

- `.ai/specs/hero-schema.md` → 角色資料結構（HP / ATK / DEF / Speed / CritRate / CritDmg）
- `.ai/specs/skill-system.md` → 主動技能 + 被動技能 + Buff/Debuff 定義
- `.ai/specs/damage-formula.md` → 傷害 / 治療 / 暴擊 / 閃避 / DOT 數值計算
- ~~`.ai/specs/element-system.md`~~ — 已移除（2026-03-11）
- `.ai/specs/progression.md` → finalStats 結算（等級 / 突破 / 裝備）
- Google Sheets API → 英雄資料來源

## 實作對照

| 系統 | Spec 區段 | 原始碼 | 狀態 |
|------|----------|--------|------|
| 遊戲狀態機 | 1 | `src/App.tsx` useState | ✅ |
| 陣型系統 | 2 | `src/App.tsx` SLOT_POSITIONS | ✅ |
| 戰鬥迴圈 | 3 | Workers `complete-battle`（後端權威計算）→ 前端 Phase B 回放 `actions[]` | ✅ |
| 確定性戰鬥 seed | 3.3 | 已移除前端 seed — 後端獨立使用 `Math.random` 或自行產生 seed | ✅ |
| 伺服器端結算 | 3.4 | `workers/src/routes/battle.ts` `complete-battle` + `src/services/progressionService.ts` `completeBattle()` | ✅ |
| 能量系統 | 4 | `src/domain/energySystem.ts` | ✅ |
| Buff/Debuff | 5 | `src/domain/buffSystem.ts` | ✅ |
| 被動觸發 | 6 | `src/domain/battleEngine.ts` `triggerPassives()` | ✅ |
| 目標策略 | 7 | `src/domain/targetStrategy.ts` | ✅ |
| 傷害計算 | 8 | `src/domain/damageFormula.ts` | ✅ |
| 3D 演出 | 10 | `src/App.tsx` `onAction` callback | ✅ |
| 插入式大招 | 3.1 | `src/domain/battleEngine.ts` `processInterruptUltimates()` | ✅ |
| 後端戰鬥引擎 | 3.2 | `workers/src/domain/battleEngine.ts` + `workers/src/routes/battle.ts` | ✅ |
| 跳過戰鬥 | 11 | `src/App.tsx` `skipBattleRef` | ✅ |
| 戰鬥回放 | 12 | `src/App.tsx` `battleActionsRef` + `replayBattle()` | ✅ |
| 戰鬥統計 | 13 | `src/App.tsx` `battleStats` + stats panel UI | ✅ |
| 戰鬥速度持久化 | 11 | `localStorage.battleSpeed` | ✅ |
| 技能 3D 飄字 | 10.3 | `src/components/SceneWidgets.tsx` `SkillToast3D` | ✅ |
| waitForAction 防碰撞 | 10.4 | `src/App.tsx` | ✅ |
| 分頁隱藏補時 | 10.5 | `src/components/ZombieModel.tsx` `visibilitychange` | ✅ |
| Buff 3D 圖標 | 5.3 | — | ⬜ 待做 |
| 大招閃現 | 10.2 | — | ⬜ 待做 |
| 傷害飄字擴展 | 8.2 | — | ⬜ 待做 |

---

## 一、遊戲狀態機 

```
PRE_BATTLE → FETCHING → IDLE → BATTLE → GAMEOVER
                                           
                                     resetGame → FETCHING（重頭來過）
```

| 狀態 | 說明 |
|------|------|
| `PRE_BATTLE` | 初始狀態，尚未載入 |
| `FETCHING` | 從 Google Sheets API 拉取英雄資料 + 遊戲配置 + 預載 GLB 模型/動畫/縮圖 |
| `IDLE` | 資料就緒，玩家可選英雄上陣、調整陣型（拖曳換位） |
| `BATTLE` | 自動戰鬥進行中（不可操作） |
| `GAMEOVER` | 戰鬥結束，顯示 VICTORY/DEFEAT，可重啟 |

### 資料載入流程（v2.1 更新）

```
fetchData() 觸發：
  1. 並行載入：
     a. GET heroes API → heroesList（顯示用）
     b. loadAllGameData() → 並行讀取：
        - heroes → heroInputsRef（domain 格式 RawHeroInput[]）
        - skill_templates → skillsRef（Map<skillId, SkillTemplate>）
        - hero_skills → heroSkillsRef（Map<heroId, HeroSkillConfig>）
  2. 隨機生成敵方陣型
  3. 預載所有 GLB 模型 + 縮圖
  4. 設置 IDLE 狀態
```

**實作**：`src/App.tsx` `fetchData.current` + `src/services/dataService.ts` `loadAllGameData()`

---

## 二、陣型系統 

### 格子佈局（6 格：前排 3 + 後排 3）

```
               敵方                              我方
     後排(3,4,5)     前排(0,1,2)       前排(0,1,2)     後排(3,4,5)
                                                   

         -Z  中場  +Z
```

### 座標

| 欄位 | X 座標 |
|------|--------|
| 左 (slot 0/3) | -2.5 |
| 中 (slot 1/4) | 0.0 |
| 右 (slot 2/5) | 2.5 |

| 陣營 | 前排 Z | 後排 Z |
|------|--------|--------|
| 玩家 | +3.0 | +6.0 |
| 敵方 | -3.0 | -6.0 |

### 陣型調整
- 狀態為 `IDLE` 且 `turn === 0` 時可調整
- **拖曳換位**：在格子間拖曳英雄，交換兩格內容
- **點擊上/下陣**：點擊縮圖添加到最近的空格，再次點擊移除

---

## 三、戰鬥迴圈  Domain Engine 架構 

### v2.6 架構：後端計算 + 前端回放

```
前端 App.tsx
│ 建構 BattleHero[] │
│ 含所有 stats/skills │
└──────────────────┘
         │ POST {action:'run-battle', players, enemies}
         ▼
┌───────────────────────────┐
│ GAS gas/battleEngine.js │
│ runBattleEngine_() │
│ 純邏輯，完整戰鬥引擎 │
│ → { winner, actions[] } │
└───────────────────────────┘
         │ { winner, actions[] }
         ▼
┌───────────────────────────┐
│ 前端 Phase B: 回放 │
│ onAction → 3D 動畫/音效 │
│ skip → continue（零延遲） │
└───────────────────────────┘
         │
         ▼
┌───────────────────────────┐
│ 前端 Phase C: 結算 │
│ 同步 HP + removeSlot │
│ → GAMEOVER │
└───────────────────────────┘
```

**Server-First**：後端 API 失敗時不發放獎勵，前端顯示「伺服器結算失敗，獎勵未發放」提示。不再降級為前端本地計算。

### v2.1 架構（舊）：Command Pattern

```

    src/domain/battleEngine.ts       
    runBattle(players, enemies, cfg) 
     純邏輯，零 React 依賴          
   計算傷害、狀態、被動...            
    產生 BattleAction 指令          

            cfg.onAction(action)
           

    src/App.tsx onAction callback    
     消費 BattleAction              
   播放 3D 動畫                       
   前進 → 攻擊 → 受傷/死亡 → 後退    
   同步 HP 到 React state            

```

### BattleAction 型別（13 種指令）

```typescript
type BattleAction =
  | { type: 'NORMAL_ATTACK'; attackerUid: string; targetUid: string;
      result: DamageResult; killed: boolean;
      _atkEnergyNew?: number; _tgtEnergyNew?: number }
  | { type: 'SKILL_CAST'; attackerUid: string; skillId: string; skillName: string;
      targets: Array<{ uid: string; result: DamageResult | HealResult; killed?: boolean }>;
      _atkEnergyNew?: number; _tgtEnergyMap?: Record<string, number> }
  | { type: 'DOT_TICK'; targetUid: string; dotType: StatusType; damage: number; sourceUid?: string }
  | { type: 'BUFF_APPLY'; targetUid: string; effect: StatusEffect }
  | { type: 'BUFF_EXPIRE'; targetUid: string; effectType: StatusType }
  | { type: 'DEATH'; targetUid: string }
  | { type: 'PASSIVE_TRIGGER'; heroUid: string; skillId: string; skillName: string }
  | { type: 'ENERGY_CHANGE'; heroUid: string; delta: number; newValue: number }
  | { type: 'TURN_START'; turn: number }
  | { type: 'TURN_END'; turn: number }
  | { type: 'PASSIVE_DAMAGE'; attackerUid: string; targetUid: string;
      damage: number; killed: boolean }
  | { type: 'EXTRA_TURN'; heroUid: string; reason: string }
  | { type: 'BATTLE_END'; winner: 'player' | 'enemy' | 'draw' }
```

**實作**：`src/domain/types.ts` `BattleAction`

### 整體流程

```
0. 戰鬥初始化
   a. SlotHero  BattleHero 轉換（slotToInput  createBattleHero）
   b. 從 heroSkillsRef + skillsRef 查詢每個英雄的 activeSkill + passives
   c. energy = 0, passiveUsage = {}
   d. 觸發所有角色 battle_start + always 被動

1. 回合迴圈 (turn = 1..50)
    TURN_START action
    收集存活角色，按 SPD DESC  slot ASC  玩家優先 排序
    逐一行動 (for actor of sorted):
       回合開始能量 +50 → ENERGY_CHANGE action
       DOT 結算（burn/poison/bleed） DOT_TICK actions
          DOT 致死 → DEATH action  continue
       Regen 結算
       觸發 turn_start 被動
       觸發 every_n_turns 被動（turn % N === 0 的週期性被動）
       控制效果判定（stun/freeze  跳過，fear  跳過）
       判斷：energy >= 1000 且有 activeSkill 且未被 silence？
          是  executeSkill() → SKILL_CAST action → consumeEnergy
          否  executeNormalAttack() → NORMAL_ATTACK action
       死亡判定 → DEATH action
    回合結束 buff duration 倒數  BUFF_EXPIRE actions
    tickShieldDurations 結算
    觸發 turn_end 被動
    turn_end 被動致死檢查 → DEATH action（若被動傷害殺死角色）
    TURN_END action
    勝負判定  BATTLE_END action（若一方全滅）

2. 超時（50 回合） BATTLE_END { winner: 'draw' }
```

**實作**：`src/domain/battleEngine.ts` `runBattle()`

### SlotHero → BattleHero 轉換

```typescript
// App.tsx runBattleLoop()：
for (let i = 0; i < 6; i++) {
  const p = pSlotsRef.current[i]
  if (!p) continue
  const heroId = Number(p.HeroID ?? p.id ?? 0)
  const input = slotToInput(p, heroId)  // SlotHero → RawHeroInput
  const { activeSkill, passives } = getHeroSkillSet(heroId, skills, heroSkillsMap)
  const bh = createBattleHero(input, 'player', i, activeSkill, passives, 1, p._uid)
  playerBH.push(bh)
}
```

`slotToInput()` 從 `SlotHero`（表現層型別）萃取 `RawHeroInput`（domain 型別）。
`getHeroSkillSet()` 從快取 Map 查出英雄的主動 + 4 個被動技能。
`createBattleHero()` 產生完整的 `BattleHero`。

---

## 四、能量系統 

### 能量參數

| 屬性 | 值 |
|------|-----|
| 初始能量 | 0 |
| 大招門檻 | 1000 |
| 能量上限 | 1000（到達即可施放，不再累積） |

### 能量獲取途徑

| 行為 | 能量 | 常數名 |
|------|------|--------|
| 每回合開始 | +50 | `CONFIG.perTurn` |
| 發動普攻命中 | +200 | `CONFIG.onAttack` |
| 被攻擊（存活） | +150 | `CONFIG.onBeAttacked` |
| 擊殺敵人 | +100 | `CONFIG.onKill` |
| 技能 energy 效果 | 自訂 | `SkillEffect.flatValue` |

### 大招施放條件

```typescript
// src/domain/energySystem.ts
export function canCastUltimate(hero: BattleHero): boolean {
  return (
    hero.energy >= CONFIG.maxEnergy &&
    hero.activeSkill != null &&
    !isSilenced(hero)
  )
}
```

### 大招施放流程

1. `canCastUltimate()` === true
2. 依技能 `targetType` 選擇目標（見 7）
3. `executeSkill()` → 遍歷技能所有 `SkillEffect`
4. `consumeEnergy()` → energy 歸零
5. 產生 `SKILL_CAST` + `ENERGY_CHANGE` actions

**實作**：`src/domain/energySystem.ts`（所有函式皆為純函式 + 直接 mutation hero.energy）

### 能量條 UI（⬜ 待做）

- 位置：HP 條下方
- 顏色：金色漸層
- 充滿動畫：energy >= 1000 時發光脈動

---

## 五、Buff / Debuff 系統 

### 狀態資料結構

```typescript
// src/domain/types.ts
interface StatusEffect {
  type: StatusType
  value: number          // 效果數值（如 0.2 = 20%）
  duration: number       // 剩餘回合數（0 = 永久直到戰鬥結束）
  stacks: number         // 當前疊加層數
  maxStacks: number      // 最大疊加層數
  sourceHeroId: string   // 施加者 UID
}

type StatusType =
  // Buff（正面效果）12 種
  | 'atk_up' | 'def_up' | 'spd_up' | 'crit_rate_up' | 'crit_dmg_up'
  | 'dmg_reduce' | 'shield' | 'regen' | 'energy_boost'
  | 'dodge_up' | 'reflect' | 'taunt'
  // Debuff（負面效果）11 種
  | 'atk_down' | 'def_down' | 'spd_down' | 'crit_rate_down'
  | 'dot_burn' | 'dot_poison' | 'dot_bleed'
  | 'stun' | 'freeze' | 'silence' | 'fear'
  // 特殊 2 種
  | 'immunity' | 'cleanse'
```

### 護盾

```typescript
interface Shield {
  value: number          // 剩餘護盾量
  duration: number       // 剩餘回合數
  sourceHeroId: string
}
```

### Buff 分類常數（buffSystem.ts）

```typescript
const DOT_TYPES: StatusType[] = ['dot_burn', 'dot_poison', 'dot_bleed']
const CONTROL_TYPES: StatusType[] = ['stun', 'freeze', 'silence', 'fear']
const BUFF_TYPES: StatusType[] = [
  'atk_up', 'def_up', 'spd_up', 'crit_rate_up', 'crit_dmg_up',
  'dmg_reduce', 'shield', 'regen', 'energy_boost',
  'dodge_up', 'reflect', 'taunt',
]
```

### 施加規則

```typescript
// src/domain/buffSystem.ts
export function applyStatus(target: BattleHero, effect: Omit<StatusEffect, 'stacks'>): boolean
```

| 情況 | 處理方式 |
|------|----------|
| `immunity` 存在時施加 debuff | 失敗，回傳 `false` |
| 控制效果（stun/freeze/silence/fear）重複 | 不疊加 stacks，刷新 duration 取較長 |
| 其他同類型重複施加 | `stacks++`（≤ maxStacks），value 加算，duration 取較長 |
| 全新效果 | push 新 StatusEffect（stacks = 1） |

### DOT 傷害公式

| DOT 類型 | 傷害公式 | 與 DEF 關係 |
|---------|---------|------------|
| `dot_burn` | 施加者 `ATK × 0.3 × stacks` | 無視 DEF |
| `dot_poison` | 目標 `maxHP × 0.03 × stacks` | 無視 DEF |
| `dot_bleed` | 施加者 `ATK × 0.25 × (100/(100+DEF×0.5)) × stacks` | 套用 50% DEF |

> 注意：spec v2.0 設計 dot_bleed 套用 50% DEF，實作中已簡化為直接計算。

**實作**：`src/domain/buffSystem.ts` `processDotEffects()`

### Buff 對數值的影響（getBuffedStats）

```typescript
export function getBuffedStats(hero: BattleHero): FinalStats {
  const base = { ...hero.finalStats }
  // 乘算
  base.ATK = floor(ATK × (1 + atk_up_value - atk_down_value))
  base.DEF = floor(DEF × (1 + def_up_value - def_down_value))
  base.SPD = floor(SPD × (1 + spd_up_value - spd_down_value))
  // 加算
  base.CritRate = CritRate + crit_rate_up_value×100 - crit_rate_down_value×100
  // 下限保護
  base.ATK = max(1, ATK); base.DEF = max(0, DEF); base.SPD = max(1, SPD)
  base.CritRate = clamp(0, 100, CritRate)
  return base
}
```

### 控制效果查詢函式

| 函式 | 判斷 | 效果 |
|------|------|------|
| `isControlled(hero)` | stun \| freeze | 跳過整個行動 |
| `isSilenced(hero)` | silence | 不可施放大招，但可普攻 |
| `isFeared(hero)` | fear | 跳過行動 |
| `hasTaunt(hero)` | taunt | 強制作為攻擊目標 |

### 回合結算

```typescript
// 回合結束時
tickStatusDurations(hero)     // duration--; duration===0 的永久效果不倒數
tickShieldDurations(hero)     // shield.duration--; 移除到期或歸零的護盾
```

### 其他函式

```typescript
cleanse(target, count)        // 移除 count 個 debuff
removeStatus(target, type)    // 移除指定類型
getStatusValue(hero, type)    // 同類型 value×stacks 總和
hasStatus(hero, type)         // 是否擁有指定效果
isDebuff(type)                // 判斷是否為 debuff
absorbDamageByShields(hero, damage) // 護盾吸收，回傳 [actualDmg, absorbed]
```

---

## 六、被動技能觸發 

### 觸發時機（15 種）

```typescript
type PassiveTrigger =
  | 'battle_start'    // 戰鬥開始時（僅一次）
  | 'turn_start'      // 自身回合開始時
  | 'turn_end'        // 自身回合結束時
  | 'on_attack'       // 攻擊前觸發
  | 'on_kill'         // 擊殺敵人時
  | 'on_be_attacked'  // 被攻擊時
  | 'on_take_damage'  // 受傷後
  | 'on_lethal'       // 受到致命傷害時
  | 'on_dodge'        // 閃避成功時
  | 'on_crit'         // 暴擊觸發時
  | 'hp_below_pct'    // HP 低於 X% 時（首次觸發）
  | 'on_ally_death'   // 隊友死亡時（存活隊友觸發）
  | 'on_ally_skill'   // 隊友施放技能時
  | 'every_n_turns'   // 每 N 回合觸發
  | 'always'          // 永久被動（battle_start 即生效，duration=0）
```

### 觸發器架構

```typescript
function triggerPassives(
  hero: BattleHero,
  trigger: string,
  context: BattleContext,
  cfg: BattleEngineConfig,
): void {
  for (const passive of hero.activePassives) {
    if (passive.passiveTrigger !== trigger) continue
    // 使用次數限制
    const usageCount = hero.passiveUsage[usageKey] ?? 0
    if (trigger === 'on_lethal' && usageCount >= getMaxUsage(passive)) continue
    // 執行所有效果
    for (const effect of passive.effects) {
      executePassiveEffect(hero, effect, context, cfg)
    }
    hero.passiveUsage[usageKey] = usageCount + 1
    cfg.onAction({ type: 'PASSIVE_TRIGGER', ... })
  }
}
```

### executePassiveEffect 支援的效果類型

| SkillEffect.type | 行為 |
|-----------------|------|
| `buff` / `debuff` | 對自身（buff）或目標（debuff）施加 StatusEffect |
| `heal` | 自回復（scalingStat × multiplier + flatValue） |
| `energy` | 自身加能量（flatValue） |
| `damage` | 被動反擊（對 context.target 計算傷害） |
| `damage_mult` | 倍率增傷（觸發時 context.damageMult = multiplier，引擎在傷害計算中套用） |
| `damage_mult_random` | 隨機倍率增傷（min~max 區間隨機，同上） |
| `revive` | 由 `checkLethalPassive()` 特殊處理（heal 效果也可保命） |
| `dispel_debuff` | 清除目標身上指定數量的 debuff |
| `reflect` | 對自身施加反彈狀態（value = multiplier） |
| `extra_turn` | 額外行動：將英雄 uid 加入 extraTurnQueue，本回合結束後插隊行動 |
| `random_debuff` | 隨機施加 debuff（從 atk_down/def_down/spd_down/silence 中隨機一個） |

### resolvePassiveTargets() 目標解析

被動效果的目標由 `resolvePassiveTargets()` 決定：

| passiveTarget + effectType | 解析結果 |
|---------------------------|---------|
| `self` + `buff` | 自身（hero） |
| `self` + `debuff` | context.target（被動觸發的上下文目標，如被攻擊者的攻擊者） |
| `all_allies` | 同陣營所有存活角色 |
| `all_enemies` | 敵方陣營所有存活角色 |
| 其他 | context.target（預設） |

> 注意：`on_be_attacked` 觸發時，`context = makeContext(turn, attacker, allHeroes, target)`，其中 `target` 是被攻擊的英雄本身。因此 `self` + `debuff` 施加到 `context.target` = 被攻擊者本身。
> `perAlly` 欄位：若 `effect.perAlly === true`，buff/debuff 的 `statusValue` 會乘以存活隊友數量。

### duration=0 永久效果

`duration: 0` 表示永久效果（持續至戰鬥結束），`tickStatusDurations()` 跳過 `duration === 0` 的狀態不倒數。

### Buff 疊加規則

同類型 StatusEffect 施加時：
- `stacks++`（不超過 `maxStacks`）
- `value` 直接加算（非 value × stacks）
- `duration` 取較長值

`getStatusValue(hero, type)` 回傳該類型的 `value` 總和（已包含疊加），不再乘以 stacks。

### on_lethal 特殊處理

```typescript
export function checkLethalPassive(hero, incomingDamage, allHeroes): boolean
// 即將死亡 + 有 on_lethal 被動 + 使用次數未滿
//  HP = max(1, maxHP × multiplier)  保命成功回傳 true
```

使用次數限制：
- 預設 `on_lethal` 每場 1 次
- 特例：`PAS_1_4` 可觸發 2 次（`getMaxUsage()`）

### hp_below_pct 閾值解析

從被動 `description` 中解析數字：
- 含 `15%` → threshold 0.15
- 含 `30%` → threshold 0.30
- 含 `50%` → threshold 0.50
- 預設 → 0.30

每個被動只觸發一次（`passiveUsage[skillId + '_hp_below'] = 1`）。

### 星級與被動解鎖

| 星級 | 可用被動數 |
|------|----------|
| 1 | 1 |
| 2 | 2 |
| 4 | 3 |
| 6 | 4 |

```typescript
const passiveSlots = starLevel >= 6 ? 4 : starLevel >= 4 ? 3 : starLevel >= 2 ? 2 : 1
activePassives = passives.slice(0, passiveSlots)
```

---

## 七、目標選擇策略 

### selectTargets 路由表

| TargetType | 策略 | 說明 |
|------------|------|------|
| `single_enemy` | `selectSingleEnemy()` | 嘲諷 > 前排對位 > 近欄 > 後排 |
| `all_enemies` | filter alive | 敵方全體存活 |
| `random_enemies_N` | `selectRandomEnemies(N)` | 隨機 N 個（可重複） |
| `front_row_enemies` | `selectFrontRow()` | slot 0,1,2；全滅 fallback 後排 |
| `back_row_enemies` | `selectBackRow()` | slot 3,4,5；全滅 fallback 前排 |
| `single_ally` | `selectLowestHpAlly()` | HP% 最低的存活隊友 |
| `all_allies` | filter alive | 我方全體存活 |
| `self` | [attacker] | 自身 |
| `random_enemies_\d+` | regex 動態解析 | 支援任意 N 值 |

### 普攻目標選擇（selectNormalAttackTarget）

```
1. 嘲諷（taunt） → 第一個 taunter
2. 前排（slot 0,1,2） → pickByColumnProximity(col)
3. 後排（slot 3,4,5） → pickByColumnProximity(col)
4. Fallback → 第一個存活敵人
```

column 透過 `slot % 3` 計算，proximity 為 `|targetCol - attackerCol|`。

**實作**：`src/domain/targetStrategy.ts`

---

## 八、傷害計算 

完整傷害公式見 `.ai/specs/damage-formula.md`。

### 引擎中的呼叫

```typescript
// 普攻
const result = calculateDamage(attacker, target)  // multiplier 預設 1.0

// 技能
const result = calculateDamage(attacker, target, effect)

// 治療
const result = calculateHeal(attacker, target, effect)
```

### 傷害飄字顏色（⬜ 待擴展）

| DamageResult.damageType | 顏色 | 說明 |
|------------------------|------|------|
| `normal` | 白色 | 普通傷害 |
| `crit` | 橙色 + 加大 | 暴擊 |
| `miss` | 灰色 | 閃避 |
| ~~`weakness`~~ | ~~紅色~~ | ~~屬性剋制~~（已移除） |
| `dot` | 紫色 | DOT 持續傷害（burn/poison/bleed） |
| `shield` | 藍色 | 完全被護盾吸收 |

---

## 九、角色行動狀態機 

```
IDLE → ADVANCING → ATTACKING → RETREATING → IDLE
                       
                  目標: HURT → IDLE
                  目標: DEAD → 移除
```

| ActorState | 說明 | 對應動畫 |
|------------|------|---------|
| `IDLE` | 待機 | idle（循環） |
| `ADVANCING` | 跑向目標 | run（循環） |
| `ATTACKING` | 播放攻擊動畫 | attack（單次） |
| `HURT` | 受擊反應 | hurt（單次 → 回 IDLE） |
| `RETREATING` | 跑回原位 | run（循環） |
| `DEAD` | 死亡 | dying（單次，clamp 最後幀） |

> 大招與普攻共用 `ATTACKING` 動畫。CASTING 專屬動畫為擴展點。

---

## 十、3D 演出流程 

### 普攻演出（onAction: NORMAL_ATTACK）

```
1. set moveTargetsRef[uid] = 目標前方 2.0
2. setActorState(uid, 'ADVANCING') → 等待到達
3. setActorState(uid, 'ATTACKING') → delay
4. playHitOrDeath(targetUid, damage, killed, isDodge)
   - 命中：HURT + 傷害飄字 + 受擊閃光
   - 擊殺：DEAD（★ 背景執行，不阻塞下一個 action）
   - 閃避：MISS 飄字
5. 攻擊者後退（pendingRetreats，與受傷/死亡並行）
   ★ 致死攻擊：死亡動畫在 backgroundAnims 背景執行，
     攻擊者立刻後退 + 下一個 action 可立即開始
```

### 技能演出（onAction: SKILL_CAST）

```
1. 前進位置：
   - 單體目標 → 目標前方
   - AOE → 中場 [0, 0, 0]
2. ATTACKING 動畫
3. 逐目標播放效果
   - 非致死：await HURT 動畫
   - 致死：DEAD 動畫推入 backgroundAnims（不阻塞）
4. 後退回原位（pendingRetreats）
```

### 受擊閃光

- 時長：0.28 秒
- 效果：emissive 紅色 (2.0, 0, 0) + color tint 紅 50%
- 曲線：bell-curve

### 移動機制

- `useFrame` lerp 逐幀插值
- 前進速率：`Math.min(0.12 × speed, 1)`
- 到達判定：距離 < 0.25

### 10.3 技能 3D 飄字

- `SkillToast3D`：技能名稱顯示在攻擊者頭頂（Billboard Text，2.5s 淡出上浮）
- ~~`ElementHint3D`~~：已移除（2026-03-11）
- `PassiveHint3D`：被動觸發浮動文字，多個同時觸發時依 `idx * 0.55` 垂直對開避免疑疊（v3.9）
- 元件位於 `src/components/Hero.tsx`（PassiveHint3D）、`src/components/SceneWidgets.tsx`（SkillToast3D）

### 10.4 waitForAction / waitForMove 防碰撞機制

- **問題**：`random_enemies_N` 可選重複目標 → 同一 uid 同時呼叫 `waitForAction` → 舊 resolve 被覆蓋 → 永遠不 resolve（等 5s timeout）
- **解法（三層防護）**：
  1. **SKILL_CAST 合併重複 uid**：`mergedTargets` Map 把同 uid 的 damage 加總、killed OR、isDodge AND，再 `Promise.all` 並行播放
  2. **waitForAction/waitForMove 碰撞搶佔**：若同一 uid 已有 pending promise，先 resolve 舊的再建新的
  3. **安全逾時 5 秒**：最後防線，防止動畫回呼完全遺失

### 10.5 分頁隱藏補時（visibilitychange）

- **問題**：瀏覽器切分頁時 `requestAnimationFrame` 停止 → Three.js mixer 不前進 → 動畫回呼不觸發 → 但 `setTimeout` 仍倒數 → 5s 後 timeout 誤報
- **解法（兩層）**：
  1. **ZombieModel mixer catch-up**：監聽 `visibilitychange`，切回來時 `mixer.update(deltaSec)`（上限 30s），讓 LoopOnce 動畫自然播完觸發 `finished`
  2. **timeout 延後重排**：timeout 觸發時若 `document.hidden` 為 true，不 resolve 而是重排 5s 後再檢查

### 10.6 攻擊者反彈致死處理

- **問題**：反彈傷害（`reflectDamage`）可能在攻擊期間殺死攻擊者，但 UI 層只跳過後退、仍設 IDLE → 屍體殘留場上
- **解法**：NORMAL_ATTACK / SKILL_CAST 的「後退」階段檢查攻擊者 HP，若 ≤ 0 改播 DEAD 動畫、`syncHpToSlot` + `removeSlot`

### 10.7 致死傷害跳過 HURT 直接 DEAD

- **問題**：致死傷害（普攻/反彈/技能）先播 HURT 再播 DEAD，動畫卡頓不自然
- **解法**：`playHitOrDeath()` 中若 `killed === true`，直接走 DEAD 分支（背景執行），不播 HURT 動畫
- 適用場景：NORMAL_ATTACK 擊殺、SKILL_CAST 擊殺、反彈致死

### 10.8 死亡角色演出守衛（Dead-Actor Guard）

- **問題**：Phase B 動畫回放中，如果目標已因 DOT/反彈在前一個 action 死亡，後續 NORMAL_ATTACK / SKILL_CAST action 仍嘗試對已死角色播放前進→攻擊動畫，造成英雄衝向空位置
- **根因**：Phase A 引擎正確過濾死亡目標（`targetStrategy` 中 `filter(e => e.currentHP > 0)`），但 Phase B 動畫層未檢查 `actorStatesRef` 即盲目播放
- **解法**（三處守衛）——**僅使用 `actorStatesRef` 判斷，不可用 `currentHP <= 0`**：
  1. **NORMAL_ATTACK handler**：開頭檢查攻擊者與目標的 `actorStatesRef.current[uid] === 'DEAD'`，若任一已死則 `break`
  2. **SKILL_CAST handler**：開頭檢查攻擊者是否已死，若已死則 `break`
  3. **DEATH handler**：開頭檢查目標是否已死（狀態已為 DEAD），若已死則 `break`（防止重複播放死亡動畫）
- **⚠ 不可使用 `currentHP <= 0` 判斷**：`applyHpFromAction()` 在 `onAction()` **之前**執行，會將**當前 action** 的傷害預先扣除；擊殺 action 的目標 HP 已被扣為 0，用 `currentHP` 判斷會誤觸 early-exit 導致跳過死亡動畫（英雄站著不動）。`playHitOrDeath()` 中 `setActorState('DEAD')` 是同步呼叫，可確保後續 action 正確偵測到已死角色。

---

## 十一、速度控制 

- x1 / x2 / x4 切換
- `speedRef.current` → `delay(ms / speedRef.current)`
- 同步影響 `mixer.timeScale`

### 速度持久化

- 切換速度時存入 `localStorage`（key: `battleSpeed`）
- 進入戰鬥時讀取 `localStorage.getItem('battleSpeed')`（預設 1）恢復上次速度
- 有效值限 1 / 2 / 4，不合規則重置為 1
- 不再同步到 Google Sheet，純前端本地儲存

### 跳過戰鬥（v3.8 後端權威 + 前端回放）

- 戰鬥中右下角顯示「跳過 ⏭」按鈕
- **Phase A — 後端權威計算**：前端 `await completeBattle()` 阻塞等待 Workers `complete-battle` 回傳 `{ winner, actions[], rewards }`
  - 後端為戰鬥唯一計算源，前端不再執行任何本地戰鬥模擬
  - 失敗時顯示錯誤 toast 並中斷（不再有本地 fallback）
- **Phase B — 逐筆回放**：playback loop 依序迭代 `allActions`：
  - 每筆 action 前檢查 `skipBattleRef.current`
  - 若已跳過 → `continue`（不呼叫 `onAction`、不播 SFX、不等待動畫）
  - 若未跳過 → 正常呼叫 `onAction` 播放 3D 演出 + 音效
- **Phase C — 最終同步**：回放結束後，遍歷 heroMap 最終狀態，死亡者 removeSlot，存活者 syncHp
- **SFX 防護**：所有 `playSfx()` 呼叫加上 `!skipBattleRef.current` 守衛
- **stopAllSfx()**：點擊跳過同時呼叫 `audioManager.stopAllSfx()` 立即靜音
- 結束後自然進入 GAMEOVER，顯示勝負結果與獎勵
- 實作：
  - `workers/src/routes/battle.ts` — `complete-battle` 後端戰鬥引擎 + 獎勵計算
  - `workers/src/domain/battleEngine.ts` — `runBattle()` 後端戰鬥模擬
  - `src/services/audioService.ts` — `stopAllSfx()` + `activeSfxGains[]` 追蹤

---

## 十二、介面契約

### BattleHero（domain 層完整角色）

```typescript
interface BattleHero {
  uid: string; heroId: number; modelId: string; name: string
  side: 'player' | 'enemy'; slot: number
  baseStats: FinalStats; finalStats: FinalStats
  currentHP: number; maxHP: number; energy: number
  activeSkill: SkillTemplate | null
  passives: SkillTemplate[]; activePassives: SkillTemplate[]
  statusEffects: StatusEffect[]; shields: Shield[]
  passiveUsage: Record<string, number>
  totalDamageDealt: number; totalHealingDone: number; killCount: number
}
```

### RawHeroInput（建立 BattleHero 的輸入）

```typescript
interface RawHeroInput {
  heroId: number; modelId: string; name: string
  HP: number; ATK: number; DEF: number; SPD: number
  CritRate: number; CritDmg: number
}
```

### BattleEngineConfig

```typescript
interface BattleEngineConfig {
  maxTurns: number          // 預設 50
  onAction: (action: BattleAction) => void | Promise<void>
  _extraTurnQueue?: string[]  // @internal 額外行動佇列
}
```

### BattleContext（被動 / 傷害公式上下文）

```typescript
interface BattleContext {
  turn: number; attacker: BattleHero; target: BattleHero | null
  targets: BattleHero[]; allAllies: BattleHero[]; allEnemies: BattleHero[]
  damageDealt: number; isKill: boolean; isCrit: boolean; isDodge: boolean
  damageMult?: number   // on_attack 被動的傷害倍率修正
}
```

---

## 十三、元件架構

```
App.tsx
 Canvas (R3F)
    Arena  場景（地面/牆/碎片/雨/煙火/霧）
    SlotMarker × 12  格子標記
    Hero × N  場上英雄
       ZombieModel  GLB + 骨骼動畫 + 受擊閃光 + visibilitychange 補時
       HealthBar3D  3D 血條
       EnergyBar3D  3D 能量條
       DamagePopup  傷害飄字（待擴展多顏色）
       SkillToast3D  技能名稱 3D 飄字
       Billboard Text  角色名稱
    DragPlane
    ResponsiveCamera
 HUD
 ThumbnailList
 SkillNameFlash ⬜
 Battle Result Banner
 Speed Button
 TransitionOverlay
```

---

## 擴展點

- [ ] 手動操作模式（玩家回合手選技能+目標）
- [x] ~~回合數上限~~（已實作 maxTurns: 50）
- [ ] 戰鬥結算畫面（經驗值、掉落、金幣）
- [ ] 大招鏡頭特效（攝影機震動 + 邊緣閃光）
- [ ] Buff/Debuff 3D 圖標
- [ ] 能量條 UI
- [ ] 傷害飄字多色分類
- [ ] CASTING 專屬動畫
- [x] ~~extra_turn 額外行動~~（已實作 `processExtraTurns()`）

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2025-02-25 | 初版：基礎回合制戰鬥 + 3D 演出 |
| v2.0 | 2025-02-26 | 新增：能量/Buff/被動/傷害設計草案 |
| v2.1 | 2025-02-26 | **已實作**：Domain Engine、Command Pattern、所有子系統程式碼就位 |
| v2.2 | 2026-02-28 | 新增：插入式大招（processInterruptUltimates）、跳過戰鬥、速度持久化、技能/屬性 3D 飄字、waitForAction 碰撞防護（三層：合併 uid + 搶佔 resolve + 5s timeout）、分頁隱藏 mixer 補時（visibilitychange）、攻擊者反彈致死播 DEAD 動畫、非攻擊技能不前進 |
| v2.3 | 2026-02-28 | 戰鬥速度持久化改用 localStorage（移除 saveService.battleSpeed，不再同步 Google Sheet） |
| v2.4 | 2026-02-28 | 新增戰鬥回放（紀錄 BattleAction[] → GAMEOVER 點擊「回放」重播 3D 動畫）、戰鬥統計面板（每位英雄輸出/治療/承傷）、DOT_TICK 攜帶 sourceUid、SKILL_CAST reflectDamage 統計+回放修正 |
| v2.5 | 2026-02-28 | **戰鬥跳過重構**：新增 `runBattleCollect()` 同步計算模式（Phase A 計算 → Phase B 回放 → Phase C 最終同步），修復跳過後敗方英雄殘留+音效爆發；`AudioManager.stopAllSfx()` 即時靜音；所有 SFX 加 skip 守衛 |
| v2.6 | 2026-02-28 | **後端戰鬥引擎**：將戰鬥引擎移植到 GAS（`gas/battleEngine.js` ~650 行），前端 POST `run-battle` 取得 `{ winner, actions[] }`，僅負責 3D 動畫回放；失敗時自動降級為本地 `runBattleCollect()` |
| v2.7 | 2026-03-01 | **能量滿即施放大招**：重構 `processInterruptUltimates` 移除 `excludeUid` 改用 `alreadyActedUids` Set，每個 action 後掃描**所有**角色（含攻擊者自己、被攻擊者），能量滿即插入大招；前後端（`battleEngine.ts` + `gas/battleEngine.js`）同步修正；GAS POST @68、GET @69；**致死攻擊不阻塞**：死亡動畫推入 `backgroundAnims`（不 await），攻擊者立刻後退 |
| v2.8 | 2026-03-01 | **反作弊校驗**：新增 Mulberry32 seeded PRNG（`src/domain/seededRng.ts`），前端 `runBattleCollect()` 接受 seed 參數暫時覆蓋 `Math.random`；GAS 新增 `verify-battle` action（`handleVerifyBattle_`），以相同 seed 重現戰鬥比對 winner；`antiCheatService.ts` 在 Phase A 後 fire-and-forget 背景驗證，結算前 await 結果，不一致時覆寫 winner 並 toast 警告；GAS 記錄可疑紀錄至 `ANTICHEAT_LOG` ScriptProperties；GAS POST @80、GET @81 |
| v2.9 | 2026-03-01 | **伺服器端獎勵計算**：新增 `handleCompleteBattle_`（`gas/程式碼.js`），整合反作弊校驗 + 伺服器端獎勵計算（gold/exp/diamond）+ 升等（`expToNextLevel_`）+ 進度寫入；`save-progress` 封鎖 gold/diamond/exp/level/storyProgress/towerFloor；前端 `completeBattle()`（`progressionService.ts`）背景呼叫，動畫播放期間不阻塞；涵蓋 story/tower/daily/pvp/boss 五模式；GAS POST @82、GET @83 |
| v3.0 | 2026-03-01 | **GAS 引擎同步修復**：GAS `battleEngine.js` 修復五大缺漏與前端同步：(1) 戰鬥開始觸發 `always` 被動、(2) `every_n_turns` 週期被動處理、(3) `processExtraTurns_` 額外行動機制 + `_currentExtraTurnQueue_` 模組變數、(4) `resolvePassiveTargets_` 支援 `all_allies`/`all_enemies`/`self` 被動目標、(5) 新增 `dispel_debuff`/`reflect`/`extra_turn` 被動效果處理 |
| v3.1 | 2026-03-01 | **硬驗證恢復 + Spec 全面同步**：`handleCompleteBattle_` 改回 `var winner = serverWinner` 硬驗證模式（以伺服器重跑結果為準發放獎勵）；GAS POST @86、GET @87；Spec 全面同步：BattleAction 11→13 種、PassiveTrigger 13→15 種、executePassiveEffect 6→10 種、BattleContext 新增 damageMult、damageType 新增 dot |
| v3.2 | 2026-03-02 | **Phase B HP 狀態修復**：`runBattleCollect()` 計算完成後（Phase A），engine 會 mutate heroMap 的 BattleHero 到最終狀態（死亡英雄 currentHP=0）；先前 `needsHpSync = false` 導致 Phase B 回放時讀取已為 0 的 HP，使英雄首回合即判定死亡（retreat handler 檢查 `heroMap.get(uid).currentHP` 為 0）；修正：Phase A 完成後重置所有 BattleHero `currentHP = maxHP`、`energy = 0`，並設 `needsHpSync = true`，讓 `applyHpFromAction()` 在 Phase B 逐步更新 HP（與 replay 模式一致） |
| v3.3 | 2026-03-02 | **Phase B 死亡角色守衛 + 致死跳過 HURT**：(1) NORMAL_ATTACK / SKILL_CAST / DEATH handler 開頭新增 dead-actor guard，檢查 `actorStatesRef` + `currentHP`，已死角色直接 `break` 不播動畫（修復 DOT/反彈致死後，後續英雄仍衝向空位置攻擊的問題）；(2) 致死傷害不再播放 HURT 動畫，直接進入 DEAD 分支（普攻/技能/反彈三處統一行為） |
| v3.4 | 2026-03-02 | **屬性提示修復 + DOT/被動致死動畫修復**：(1) NORMAL_ATTACK 的 elementHint 加入 `setTimeout(2000)` 自動清理（先前無 cleanup 導致累積）；(2) SKILL_CAST handler 新增屬性相剋指示（取第一個非閃避目標的 `elementMult`）；(3) DOT_TICK / PASSIVE_DAMAGE handler 新增致死判定 — 若 `hero.currentHP <= 0` 直接播放死亡動畫（含音效 + `waitForAction('DEAD')` + `removeSlot`），後續 DEATH action 因 `actorState===DEAD` 自動跳過 |
| v3.5 | 2026-03-02 | **Dead-Actor Guard 修正 — 移除 `currentHP <= 0` 判斷**：`applyHpFromAction()` 在 `onAction()` 前執行，會將**當前 action** 的傷害預扣為 0，導致擊殺 action 誤觸 early-exit → 跳過死亡動畫（角色站著不動、HP 條不更新）。修正：三處 guard（NORMAL_ATTACK×2 + SKILL_CAST×1）只保留 `actorStatesRef === 'DEAD'`，移除 `|| currentHP <= 0` 判斷 || v3.6 | 2026-03-02 | **pendingRetreats 等待擴展 + Validator DEATH 降級**：(1) `pendingRetreats` 的 await 從只限 NORMAL_ATTACK/SKILL_CAST 擴展到所有非 TURN_START/TURN_END/BATTLE_END 的 action——修復被動文字/DOT 傷害在前一位英雄還在退回動畫時就提前顯示的問題，同時修復 DOT 傷害數字被前一位英雄動畫過渡後看不到的問題；(2) Validator `beforeAction` 對 DEATH action 的重複檢查從 error 降級為 warn（DOT/被動致死後引擎仍會發 DEATH action，表現層因 actorState===DEAD 正確跳過，非真正錯誤） |
| v3.8 | 2026-03-05 | **後端權威戰鬥模式**：完全移除前端本地戰鬥模擬（`runBattleCollect()`、`generateBattleSeed()`），Phase A 改為阻塞式 `await completeBattle()` 等待後端回傳 `actions[]` + `winner`；移除 `completeBattleRef`（不再需要背景 Promise）；前端僅負責 Phase B 3D 動畫回放 + Phase C 狀態同步；後端 `complete-battle` 為戰鬥唯一計算源，消除前後端資料不一致風險 |
| v3.9 | 2026-03-12 | **被動技能飄字防疊痌 + Boss 回合計數器**：(1) `PassiveHint3D`（Hero.tsx）多個同時觸發時依 `idx * 0.55` 垂直偏移，避免文字重疊；(2) `BossDamageBar`（BattleHUD.tsx）新增回合顯示「回合 N/20」，App.tsx 傳 `currentTurn={turn}` 至 BattleHUD |
| v4.0 | 2026-03-15 | **Spec 全面校正**：(1) PASSIVE_DAMAGE 型別修正為 `damage: number`（非 `result: DamageResult`），移除不存在的 `skillId` 欄位；(2) EXTRA_TURN 補上 `reason: string` 欄位；(3) 新增 `random_debuff` 到 executePassiveEffect 效果表；(4) 新增 `resolvePassiveTargets()` 目標解析規則文檔（含 on_be_attacked 上下文說明）；(5) 新增 `perAlly` 欄位說明；(6) 新增 `duration=0` 永久效果說明；(7) 修正 Buff 疊加規則（value 直接加算、getStatusValue 不再乘 stacks） |