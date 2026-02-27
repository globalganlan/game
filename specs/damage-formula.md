# 傷害公式 Spec

> 版本：v1.0 ｜ 狀態：🟢 已實作
> 最後更新：2025-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/domain/damageFormula.ts`

## 概述

所有傷害 / 治療 / DOT / 閃避 / 暴擊 / 護盾吸收 / 反彈的數值計算。
本模組為**純函式**，無副作用、無 React 依賴。

## 依賴

- `src/domain/types.ts` → `BattleHero`, `DamageResult`, `HealResult`, `SkillEffect`, `FinalStats`
- `src/domain/elementSystem.ts` → `getElementMultiplier()`, `isWeakness()`
- `src/domain/buffSystem.ts` → `getStatusValue()`, `hasStatus()`, `absorbDamageByShields()`, `getBuffedStats()`

---

## 一、主要傷害公式 

```typescript
calculateDamage(attacker: BattleHero, target: BattleHero, skill?: SkillEffect): DamageResult
```

### 計算流程（10 步）

```
步驟 0. 閃避判定
步驟 1. 基礎傷害
步驟 2. DEF 減傷
步驟 3. 暴擊判定
步驟 4. 屬性倍率
步驟 5. 隨機浮動
步驟 6. 攻擊方修正
步驟 7. 防守方修正
步驟 8. 取整
步驟 9. 護盾吸收
步驟 10. 反彈傷害
```

### 步驟 0：閃避判定

```typescript
const dodgeRate = getStatusValue(target, 'dodge_up')
const totalDodge = Math.min(dodgeRate, 0.75) // 上限 75%
if (Math.random() < totalDodge) → 回傳 MISS
```

- 閃避上限：75%
- MISS 時傷害為 0，不觸發後續任何算式
- 回傳 `{ damage: 0, isCrit: false, isDodge: true, damageType: 'miss', ... }`

### 步驟 1：基礎傷害

```typescript
const scalingStat = skill?.scalingStat ?? 'ATK'
const statValue = atkStats[scalingStat]  // 經 getBuffedStats() 計算後
const multiplier = skill?.multiplier ?? 1.0
const flatValue = skill?.flatValue ?? 0
const baseDmg = statValue * multiplier + flatValue
```

| 參數 | 來源 | 預設 |
|------|------|------|
| `scalingStat` | `SkillEffect.scalingStat` | `ATK` |
| `multiplier` | `SkillEffect.multiplier` | `1.0`（= 普攻 100%） |
| `flatValue` | `SkillEffect.flatValue` | `0` |

### 步驟 2：DEF 減傷

```
DMG = baseDmg × 100 / (100 + DEF)
```

| DEF | 減傷率 | 有效倍率 |
|-----|--------|---------|
| 0 | 0% | 1.00 |
| 50 | 33.3% | 0.667 |
| 100 | 50.0% | 0.500 |
| 200 | 66.7% | 0.333 |
| 500 | 83.3% | 0.167 |

**DEF 穿透**： 未實作（擴展點）

### 步驟 3：暴擊判定

```typescript
const critRate = Math.min(atkStats.CritRate / 100, 1.0) // 百分比轉小數
const isCrit = Math.random() < critRate
if (isCrit) dmg *= (1 + atkStats.CritDmg / 100)
```

- `CritRate` 為百分比整數（如 15 = 15%）
- `CritDmg` 為百分比整數（如 50 = +50%）
- 暴擊倍率 = `1 + CritDmg/100`（CritDmg=50 → 1.5×）
- CritRate 上限：100%

### 步驟 4：屬性倍率

```typescript
const elementMult = getElementMultiplier(attacker.element, target.element)
dmg *= elementMult
```

- 無屬性 → 1.0
- 剋制 → 1.3（配置來自 `element_matrix` Google Sheet）
- 抵抗 → 0.7
- 同屬 → 0.9

### 步驟 5：隨機浮動

```typescript
dmg *= 0.95 + Math.random() * 0.10   // 5%
```

### 步驟 6：攻擊方 Buff 修正

```typescript
function getAttackerDamageModifier(attacker): number {
  let mult = 1.0
  mult += getStatusValue(attacker, 'atk_up')
  mult -= getStatusValue(attacker, 'atk_down')
  return Math.max(0.1, mult) // 下限 10%
}
```

### 步驟 7：防守方 Buff 修正

```typescript
function getTargetDamageModifier(target): number {
  let mult = 1.0
  mult -= getStatusValue(target, 'dmg_reduce')
  mult += getStatusValue(target, 'def_down') * 0.5
  if (hasStatus(target, 'fear')) mult *= 1.2  // 恐懼增傷 20%
  return Math.max(0.1, mult) // 下限 10%
}
```

### 步驟 8：取整

```typescript
dmg = Math.max(1, Math.floor(dmg))
```

最低傷害保證為 1。

### 步驟 9：護盾吸收

```typescript
const [actualDmg, shieldAbsorbed] = absorbDamageByShields(target, dmg)
```

- 先進先消耗（遍歷 shields 陣列）
- 傳回 `[實際受到的傷害, 被吸收的量]`
- 護盾歸零後自動移除

### 步驟 10：反彈傷害

```typescript
const reflectDamage = calculateReflect(target, actualDmg)
// reflectDamage = damageReceived  reflect_value
// 反彈無視 DEF，不觸發被動
```

### DamageResult 回傳結構

```typescript
interface DamageResult {
  damage: number           // 實際受到的傷害（扣除護盾後）
  isCrit: boolean
  isDodge: boolean
  elementMult: number      // 屬性倍率
  damageType: 'normal' | 'crit' | 'dot' | 'miss' | 'shield' | 'weakness'
  shieldAbsorbed: number   // 護盾吸收量
  reflectDamage: number    // 反彈傷害
}
```

### damageType 飄字分類

| 條件 | damageType | 優先順序 |
|------|-----------|---------|
| 閃避成功 | `miss` | 最高（步驟 0） |
| 暴擊 | `crit` | 高 |
| 屬性剋制 | `weakness` | 中 |
| 護盾完全吸收（actualDmg=0） | `shield` | 中 |
| 以上皆非 | `normal` | 低 |

---

## 二、治療公式 

```typescript
calculateHeal(healer: BattleHero, target: BattleHero, skill: SkillEffect): HealResult
```

### 計算流程

```typescript
const scalingStat = skill.scalingStat ?? 'ATK'
const statValue = healerStats[scalingStat]
let heal = statValue * (skill.multiplier ?? 1.0) + (skill.flatValue ?? 0)

// 治療可暴擊（固定 1.5，不套用 CritDmg）
if (Math.random() < critRate) heal *= 1.5

// 不超過 HP 上限
heal = min(floor(heal), target.maxHP - target.currentHP)
heal = max(0, heal)
```

### HealResult 回傳結構

```typescript
interface HealResult {
  heal: number
  isCrit: boolean
}
```

---

## 三、DOT 傷害 

```typescript
calculateDot(dotType: string, source: BattleHero | undefined, target: BattleHero): number
```

| DOT 類型 | 公式 | DEF 關係 |
|---------|------|---------|
| `dot_burn` | `source.ATK × 0.3` | 無視 DEF |
| `dot_poison` | `target.maxHP × 0.03` | 無視 DEF |
| `dot_bleed` | `source.ATK × 0.25 × (100/(100 + DEF×0.5))` | 50% DEF |

> 注意：`calculateDot()` 是獨立函式，但實際 DOT 結算在 `buffSystem.ts` `processDotEffects()` 中完成（含 stacks 乘算）。

### DOT 結算時機

- 每個角色在**自身回合開始時**結算所有 DOT
- DOT 可致死 → 角色死亡跳過行動
- DOT 不觸發 `on_take_damage` 被動

---

## 四、反彈傷害 

```typescript
calculateReflect(target: BattleHero, damageReceived: number): number
```

- 反彈率 = `getStatusValue(target, 'reflect')`
- 反彈傷害 = `floor(damageReceived × reflectRate)`
- **無視 DEF，不觸發任何被動**
- 由引擎在 `executeNormalAttack` / `executeSkill` 中套用到攻擊者

---

## 五、Buff/Debuff 對傷害的影響摘要

### 攻擊方

| 狀態 | 效果 |
|------|------|
| `atk_up` | +damage |
| `atk_down` | -damage |

### 防守方

| 狀態 | 效果 |
|------|------|
| `dmg_reduce` | -damage |
| `def_down` | +damage (×0.5) |
| `fear` | +20% damage |
| `dodge_up` | 閃避機率 |
| `shield` | 護盾吸收 |
| `reflect` | 反彈傷害 |

---

## 擴展點

- [ ] DEF 穿透（`defPen` 參數）
- [ ] 真實傷害（無視 DEF 的傷害類型）
- [ ] 屬性加傷 buff（如「火屬性傷害 +20%」）
- [ ] 多段攻擊（`hitCount > 1` 每段獨立暴擊）
- [ ] 最終傷害乘算層（如「對 Boss +30%」）

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2025-02-26 | 草案：設計公式流程 |
| v1.0 | 2025-02-26 | **已實作**：完整 10 步公式 + 護盾 + 反彈 + 治療 + DOT |
