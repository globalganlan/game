# 戰鬥系統 Spec

> 版本：v2.1 ｜ 狀態：🟢 已實作
> 最後更新：2025-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/domain/battleEngine.ts`（邏輯）、`src/App.tsx`（3D 演出整合）

## 概述

6v6 自動戰鬥系統。玩家在戰前從英雄列表選擇角色佈陣（6 格 × 前後排），
敵方由系統或關卡配置編成。戰鬥為**全自動回合制**，
角色依速度排序逐一行動，跑到目標面前攻擊後退回原位。

**v2.0**：能量系統（大招機制）、Buff/Debuff 系統、完整傷害公式、被動技能觸發。
**v2.1**：Domain Engine 完整實作 — 純邏輯引擎 + Command Pattern 3D 演出。

## 依賴

- `specs/hero-schema.md` → 角色資料結構（HP / ATK / DEF / Speed / CritRate / CritDmg）
- `specs/skill-system.md` → 主動技能 + 被動技能 + Buff/Debuff 定義
- `specs/damage-formula.md` → 傷害 / 治療 / 暴擊 / 閃避 / DOT 數值計算
- `specs/element-system.md` → 屬性剋制倍率
- `specs/progression.md` → finalStats 結算（等級 / 突破 / 裝備）
- Google Sheets API → 英雄資料來源

## 實作對照

| 系統 | Spec 區段 | 原始碼 | 狀態 |
|------|----------|--------|------|
| 遊戲狀態機 | 1 | `src/App.tsx` useState | ✅ |
| 陣型系統 | 2 | `src/App.tsx` SLOT_POSITIONS | ✅ |
| 戰鬥迴圈 | 3 | `src/domain/battleEngine.ts` `runBattle()` | ✅ |
| 能量系統 | 4 | `src/domain/energySystem.ts` | ✅ |
| Buff/Debuff | 5 | `src/domain/buffSystem.ts` | ✅ |
| 被動觸發 | 6 | `src/domain/battleEngine.ts` `triggerPassives()` | ✅ |
| 目標策略 | 7 | `src/domain/targetStrategy.ts` | ✅ |
| 傷害計算 | 8 | `src/domain/damageFormula.ts` | ✅ |
| 3D 演出 | 10 | `src/App.tsx` `onAction` callback | ✅ |
| Buff 3D 圖標 | 5.3 | — | ⬜ 待做 |
| 能量條 UI | 4.5 | — | ⬜ 待做 |
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
        - element_matrix → loadElementMatrix()（domain 全域矩陣）
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

### v2.1 架構：Command Pattern

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

### BattleAction 型別（11 種指令）

```typescript
type BattleAction =
  | { type: 'NORMAL_ATTACK'; attackerUid: string; targetUid: string;
      result: DamageResult; killed: boolean }
  | { type: 'SKILL_CAST'; attackerUid: string; skillId: string; skillName: string;
      targets: Array<{ uid: string; result: DamageResult | HealResult; killed?: boolean }> }
  | { type: 'DOT_TICK'; targetUid: string; dotType: StatusType; damage: number }
  | { type: 'BUFF_APPLY'; targetUid: string; effect: StatusEffect }
  | { type: 'BUFF_EXPIRE'; targetUid: string; effectType: StatusType }
  | { type: 'DEATH'; targetUid: string }
  | { type: 'PASSIVE_TRIGGER'; heroUid: string; skillId: string; skillName: string }
  | { type: 'ENERGY_CHANGE'; heroUid: string; delta: number; newValue: number }
  | { type: 'TURN_START'; turn: number }
  | { type: 'TURN_END'; turn: number }
  | { type: 'BATTLE_END'; winner: 'player' | 'enemy' | 'draw' }
```

**實作**：`src/domain/types.ts` `BattleAction`

### 整體流程

```
0. 戰鬥初始化
   a. SlotHero  BattleHero 轉換（slotToInput  createBattleHero）
   b. 從 heroSkillsRef + skillsRef 查詢每個英雄的 activeSkill + passives
   c. energy = 0, passiveUsage = {}
   d. 觸發所有角色 battle_start 被動

1. 回合迴圈 (turn = 1..50)
    TURN_START action
    收集存活角色，按 SPD DESC  slot ASC  玩家優先 排序
    逐一行動 (for actor of sorted):
       回合開始能量 +50 → ENERGY_CHANGE action
       DOT 結算（burn/poison/bleed） DOT_TICK actions
          DOT 致死 → DEATH action  continue
       Regen 結算
       觸發 turn_start 被動
       控制效果判定（stun/freeze  跳過，fear  跳過）
       判斷：energy >= 1000 且有 activeSkill 且未被 silence？
          是  executeSkill() → SKILL_CAST action → consumeEnergy
          否  executeNormalAttack() → NORMAL_ATTACK action
       死亡判定 → DEATH action
    回合結束 buff duration 倒數  BUFF_EXPIRE actions
    tickShieldDurations 結算
    觸發 turn_end 被動
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
| 其他同類型重複施加 | `stacks++`（ maxStacks），value 加算，duration 取較長 |
| 全新效果 | push 新 StatusEffect（stacks = 1） |

### DOT 傷害公式

| DOT 類型 | 傷害公式 | 與 DEF 關係 |
|---------|---------|------------|
| `dot_burn` | 施加者 `ATK × 0.3 × stacks` | 無視 DEF |
| `dot_poison` | 目標 `maxHP × 0.03 × stacks` | 無視 DEF |
| `dot_bleed` | 施加者 `ATK × 0.25 × stacks` | 無視 DEF（簡化實作） |

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

### 觸發時機（13 種）

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
| `revive` | 由 `checkLethalPassive()` 特殊處理 |
| `extra_turn` |  TODO |

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

完整傷害公式見 `specs/damage-formula.md`。

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
| `weakness` | 紅色 | 屬性剋制 |
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
   - 擊殺：DEAD
   - 閃避：MISS 飄字
5. setActorState(uid, 'RETREATING') → 等待回原位
6. setActorState(uid, 'IDLE')
```

### 技能演出（onAction: SKILL_CAST）

```
1. 前進位置：
   - 單體目標 → 目標前方
   - AOE → 中場 [0, 0, 0]
2. ATTACKING 動畫
3. 逐目標播放效果
4. 後退回原位
```

### 受擊閃光

- 時長：0.28 秒
- 效果：emissive 紅色 (2.0, 0, 0) + color tint 紅 50%
- 曲線：bell-curve

### 移動機制

- `useFrame` lerp 逐幀插值
- 前進速率：`Math.min(0.12 × speed, 1)`
- 到達判定：距離 < 0.25

---

## 十一、速度控制 

- x1 / x2 / x4 切換
- `speedRef.current`  `delay(ms / speedRef.current)`
- 同步影響 `mixer.timeScale`

---

## 十二、介面契約

### BattleHero（domain 層完整角色）

```typescript
interface BattleHero {
  uid: string; heroId: number; modelId: string; name: string
  side: 'player' | 'enemy'; slot: number; element: Element | ''
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
  heroId: number; modelId: string; name: string; element: string
  HP: number; ATK: number; DEF: number; SPD: number
  CritRate: number; CritDmg: number
}
```

### BattleEngineConfig

```typescript
interface BattleEngineConfig {
  maxTurns: number          // 預設 50
  onAction: (action: BattleAction) => void | Promise<void>
}
```

### BattleContext（被動 / 傷害公式上下文）

```typescript
interface BattleContext {
  turn: number; attacker: BattleHero; target: BattleHero | null
  targets: BattleHero[]; allAllies: BattleHero[]; allEnemies: BattleHero[]
  damageDealt: number; isKill: boolean; isCrit: boolean; isDodge: boolean
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
       ZombieModel  GLB + 骨骼動畫 + 受擊閃光
       HealthBar3D  3D 血條
       EnergyBar3D ⬜
       StatusIcons3D ⬜
       DamagePopup  傷害飄字（待擴展多顏色）
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
- [ ] extra_turn 額外行動

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2025-02-25 | 初版：基礎回合制戰鬥 + 3D 演出 |
| v2.0 | 2025-02-26 | 新增：能量/Buff/被動/傷害設計草案 |
| v2.1 | 2025-02-26 | **已實作**：Domain Engine、Command Pattern、所有子系統程式碼就位 |
