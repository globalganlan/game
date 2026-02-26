# 傷害公式 Spec

> 版本：v0.1 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

定義戰鬥中所有數值計算：傷害、治療、暴擊、閃避、DOT。
取代現有的 `dmg = ATK` 極簡公式，加入 DEF 減傷、暴擊系統、屬性剋制、Buff/Debuff 修正。

## 依賴

- `specs/hero-schema.md` — 英雄屬性（ATK, DEF, HP, SPD, CritRate, CritDmg）
- `specs/skill-system.md` — 技能倍率、效果模組、Buff/Debuff 系統
- `specs/element-system.md` — 屬性剋制倍率
- `specs/progression.md` — 裝備 + 等級最終數值計算

---

## 一、傷害公式（總覽）

```
最終傷害 = 基礎傷害 × DEF 減傷 × 暴擊 × 屬性倍率 × 浮動 × Buff/Debuff 修正
```

### 步驟拆解

```typescript
function calculateDamage(
  attacker: BattleHero,
  target: BattleHero,
  skill: SkillEffect,
): DamageResult {
  // 1. 基礎傷害
  const scalingStat = attacker.finalStats[skill.scalingStat ?? 'ATK']
  const baseDmg = scalingStat * (skill.multiplier ?? 1.0) + (skill.flatValue ?? 0)
  
  // 2. DEF 減傷
  const targetDef = target.finalStats.DEF
  const defReduction = 100 / (100 + targetDef)   // DEF=100 → 50% 減傷
  let dmg = baseDmg * defReduction
  
  // 3. 暴擊判定
  const critRate = Math.min(attacker.finalStats.CritRate / 100, 1.0) // cap 100%
  const isCrit = Math.random() < critRate
  if (isCrit) {
    dmg *= (1 + attacker.finalStats.CritDmg / 100)  // CritDmg=150 → ×2.5
  }
  
  // 4. 屬性倍率
  const elementMult = getElementMultiplier(attacker.element, target.element)
  dmg *= elementMult
  
  // 5. 隨機浮動 ±5%
  dmg *= 0.95 + Math.random() * 0.10
  
  // 6. Buff/Debuff 修正
  dmg *= getAttackerDamageModifier(attacker)   // atk_up, 處決 等
  dmg *= getTargetDamageModifier(target)       // def_down, dmg_reduce, fear 等
  
  // 7. 特殊被動修正（白面鬼亂數、南瓜魔巨力等）
  dmg *= getPassiveMultiplier(attacker, target)
  
  // 8. 取整
  dmg = Math.max(1, Math.floor(dmg))  // 最低傷害 = 1
  
  return { damage: dmg, isCrit, elementMult }
}
```

---

## 二、DEF 減傷曲線

公式：`減傷比例 = DEF / (100 + DEF)`

| DEF | 減傷 | 實際受到 |
|-----|------|---------|
| 0 | 0% | 100% |
| 25 | 20% | 80% |
| 50 | 33% | 67% |
| 100 | 50% | 50% |
| 200 | 67% | 33% |
| 300 | 75% | 25% |

特性：**收益遞減**——DEF 越高每點帶來的邊際減傷越少，防止坦克永遠打不死。

### DEF 穿透

若技能或被動有「DEF 穿透」效果：
```typescript
const effectiveDef = targetDef * (1 - defPenetration)  // 穿透 30% → ×0.7
```

---

## 三、暴擊系統

| 屬性 | 預設值 | 說明 |
|------|--------|------|
| CritRate | 5% | 暴擊率（可培養、可 buff） |
| CritDmg | 50% | 暴擊傷害加成（非倍率，最終 = 1 + CritDmg/100） |

### 暴擊傷害計算

```
isCrit → finalDmg = dmg × (1 + CritDmg / 100)
```

| CritDmg | 暴擊倍率 |
|---------|---------|
| 50%（預設） | ×1.5 |
| 100% | ×2.0 |
| 150% | ×2.5 |
| 200% | ×3.0（合理上限） |

### 影響 CritRate 的因素

| 來源 | 範圍 |
|------|------|
| 基礎值 | 5% |
| 裝備（戒指主屬性） | +5%~+20% |
| 裝備副屬性 | +2%~+10% |
| 暴擊套裝 2 件 | +12% |
| Buff: crit_rate_up | 依技能值 |
| 被動技能 | 如屠宰者「殺意」+15% |

---

## 四、閃避系統

```typescript
function checkDodge(attacker: BattleHero, target: BattleHero): boolean {
  const dodgeRate = target.getStatusValue('dodge_up') // 基礎 0% + buff
  // 被動加成（如脫逃者「閃避直覺」20%）
  const passiveDodge = getPassiveDodgeRate(target)
  const totalDodge = Math.min(dodgeRate + passiveDodge, 0.75) // cap 75%
  return Math.random() < totalDodge
}
```

閃避時：
- 傷害 = 0
- 顯示「MISS」飄字
- 攻擊者不獲得能量
- 觸發目標的「閃避後」被動（如脫逃者「反擊姿態」）

---

## 五、治療公式

```typescript
function calculateHeal(
  healer: BattleHero,
  target: BattleHero,
  skill: SkillEffect,
): number {
  const scalingStat = healer.finalStats[skill.scalingStat ?? 'ATK']
  let heal = scalingStat * (skill.multiplier ?? 1.0) + (skill.flatValue ?? 0)
  
  // 治療可以暴擊（暴擊治療量 ×1.5，不套用 CritDmg）
  const isCrit = Math.random() < (healer.finalStats.CritRate / 100)
  if (isCrit) heal *= 1.5
  
  // 不可超過目標 HP 上限
  heal = Math.min(heal, target.finalStats.HP - target.currentHP)
  
  return Math.floor(heal)
}
```

---

## 六、DOT（持續傷害）

在持有者回合開始時結算：

| DOT 類型 | 傷害 | 特殊效果 |
|---------|------|---------|
| dot_burn | 施加者 ATK × 30% | — |
| dot_poison | 目標 max HP × 3% | 無視 DEF |
| dot_bleed | 施加者 ATK × 25% | 無視 50% DEF |

```typescript
function calculateDot(type: string, source: BattleHero, target: BattleHero): number {
  switch (type) {
    case 'dot_burn':   return Math.floor(source.finalStats.ATK * 0.3)
    case 'dot_poison': return Math.floor(target.finalStats.HP * 0.03)
    case 'dot_bleed':  return Math.floor(source.finalStats.ATK * 0.25 * (100 / (100 + target.finalStats.DEF * 0.5)))
    default: return 0
  }
}
```

---

## 七、Buff/Debuff 數值修正

### 攻擊方修正

```typescript
function getAttackerDamageModifier(attacker: BattleHero): number {
  let mult = 1.0
  // atk_up: 加算（多個 atk_up 效果加算後乘）
  mult += attacker.getStatusValue('atk_up')     // 0.2 = +20%
  mult -= attacker.getStatusValue('atk_down')    // 被施加的 ATK 降低
  return Math.max(0.1, mult)  // 下限 10%
}
```

### 防守方修正

```typescript
function getTargetDamageModifier(target: BattleHero): number {
  let mult = 1.0
  mult -= target.getStatusValue('dmg_reduce')    // 0.25 = 受傷-25%
  mult += target.getStatusValue('def_down') * 0.5 // DEF 降低間接增傷
  if (target.hasStatus('fear')) mult *= 1.2       // 恐懼狀態受傷+20%
  return Math.max(0.1, mult)
}
```

---

## 八、護盾系統

```typescript
interface Shield {
  value: number          // 剩餘護盾量
  duration: number       // 剩餘回合數
  sourceHeroId: string
}
```

- 護盾在 HP 之前吸收傷害
- 多個護盾同時存在，**先施加的先消耗**
- 護盾有時效，回合結束 -1
- 護盾量歸零或時效結束即消失

---

## 九、反彈傷害

```typescript
function calculateReflect(target: BattleHero, damageReceived: number): number {
  const reflectRate = target.getStatusValue('reflect')  // 0.1 = 10%
  if (reflectRate <= 0) return 0
  return Math.floor(damageReceived * reflectRate)
  // 反彈傷害無視 DEF，不觸發對方被動
}
```

---

## 十、傷害飄字顏色

| 類型 | 顏色 | 字號 |
|------|------|------|
| 普通傷害 | 白色 | 標準 |
| 暴擊傷害 | 橙色 + 加大 | 1.5× |
| 治療 | 綠色 | 標準 |
| 暴擊治療 | 亮綠 + 加大 | 1.5× |
| DOT 傷害 | 紫色 | 較小 |
| MISS | 灰色 | 較小 |
| 護盾吸收 | 藍色 | 標準 |

---

## 擴展點

- [ ] **DEF 穿透**：作為技能/裝備/被動效果
- [ ] **真實傷害**：無視 DEF 的傷害類型
- [ ] **傷害上限**：單次傷害不超過目標 max HP 的 X%（Boss 戰用）
- [ ] **連擊遞減**：多段攻擊每段傷害遞減（平衡 AOE）
- [ ] **反擊傷害公式**：反擊也走完整傷害流程（目前簡化為比率反彈）

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版：完整傷害/治療/暴擊/閃避/DOT/護盾/反彈公式 |
