# 技能系統 Spec

> 版本：v0.2 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

技能分為**主動技能（終結技）**與**被動技能**兩類。
所有技能定義在統一的「技能表」中，可被任意英雄引用——新增英雄只需從技能表挑選組合。
技能效果由可重複使用的「效果模組」拼裝而成（傷害、治療、Buff、Debuff、特殊效果），
實現高度可組合、可擴展的設計。

## 依賴

- `specs/hero-schema.md` — 英雄屬性欄位（ATK, DEF, HP, SPD, CritRate, CritDmg）
- `specs/damage-formula.md` — 傷害/治療計算
- `specs/element-system.md` — 屬性標籤

---

## 一、設計原則

1. **技能與英雄分離** — 技能表是獨立的 Google Sheet，英雄只存 skillId 引用
2. **效果可組合** — 一個技能可有多個效果模組（如「對全體造成 ATK×180% 傷害 + 25% 機率沉默 2 回合」）
3. **數值驅動** — 所有倍率、機率、持續回合寫在表中，不 hardcode
4. **熱更新** — 修改 Google Sheet 即可調整技能，不需改程式碼

---

## 二、技能表結構（Google Sheet: `skill_templates`）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `skillId` | string | 唯一 ID，如 `SKL_FLAME_BURST` |
| `name` | string | 技能名稱「烈焰爆發」 |
| `type` | `'active' \| 'passive'` | 主動/被動 |
| `element` | Element \| null | 屬性標籤（null = 無屬性） |
| `target` | TargetType | 目標選擇方式 |
| `description` | string | 玩家可讀描述（支援 {atk}、{multiplier} 等佔位符） |
| `effects` | string (JSON) | 效果模組陣列 `SkillEffect[]` |
| `passive_trigger` | PassiveTrigger \| null | 被動觸發條件（主動技能為 null） |
| `icon` | string | icon 檔名 |

---

## 三、主動技能（終結技）

### 能量系統

| 項目 | 值 |
|------|-----|
| 施放門檻 | **1000** 能量 |
| 攻擊獲得 | 基礎 200（可被效果修改） |
| 被攻擊獲得 | 基礎 150（可被效果修改） |
| 擊殺獲得 | 額外 +100 |
| 每回合自然回復 | 50 |
| 戰鬥初始 | 0 |
| 施放後 | 歸零 |

```typescript
interface EnergyConfig {
  maxEnergy: 1000
  onAttack: 200       // 每次普攻命中
  onBeAttacked: 150   // 每次被攻擊
  onKill: 100         // 擊殺目標時額外加
  perTurn: 50         // 回合開始自然回復
  onUseActive: -1000  // 施放後歸零
}
```

### 施放邏輯

```
回合開始
  ↓
energy += perTurn
  ↓
energy >= 1000？
  ├─ 是 → 施放主動技能（取代普攻）
  └─ 否 → 使用普攻
  ↓
普攻命中 → energy += onAttack（+ onKill if target dies）
被攻擊時 → energy += onBeAttacked
```

### 目標類型

```typescript
type TargetType =
  | 'single_enemy'       // 單體敵人（傷害最高/HP 最低/隨機，由策略決定）
  | 'all_enemies'        // 敵方全體
  | 'random_enemies_N'   // 隨機 N 個敵人（N 寫在效果的 hitCount 中）
  | 'front_row_enemies'  // 敵方前排
  | 'back_row_enemies'   // 敵方後排
  | 'single_ally'        // 單體隊友（HP 最低）
  | 'random_allies_N'    // 隨機 N 個隊友
  | 'all_allies'         // 我方全體
  | 'self'               // 自身
```

### 主動技能範例

| skillId | 名稱 | 目標 | 效果 |
|---------|------|------|------|
| `SKL_FLAME_BURST` | 烈焰爆發 | all_enemies | ATK × 180% 傷害 + 30% 燃燒 2 回合 |
| `SKL_SHADOW_STRIKE` | 暗影連擊 | random_enemies_N (3) | ATK × 120% × 3 次 |
| `SKL_HEAL_WAVE` | 治癒波動 | all_allies | HP × 25% 回復 |
| `SKL_FOCUS_HEAL` | 集中治療 | single_ally | ATK × 300% 回復 |
| `SKL_FRONT_CRUSH` | 前排碾壓 | front_row_enemies | ATK × 220% 傷害 + 50% DEF-20% 2 回合 |
| `SKL_BACK_SNIPE` | 後排狙擊 | back_row_enemies | ATK × 250% 傷害 |

---

## 四、被動技能

### 星級解鎖

每個英雄有 **4 組被動**，依星級解鎖：

| 星級 | 解鎖 |
|------|------|
| ★1 | 被動 1 |
| ★2 | 被動 2 |
| ★4 | 被動 3 |
| ★6 | 被動 4 |

### 星級培養（重複抽卡）

| 目前星級 | 升星所需碎片 | 碎片來源 |
|---------|------------|---------|
| ★1 → ★2 | 10 | 重複抽到 = 碎片（數量依稀有度） |
| ★2 → ★3 | 20 | |
| ★3 → ★4 | 40 | |
| ★4 → ★5 | 80 | |
| ★5 → ★6 | 160 | |

重複抽到轉碎片量：
| 稀有度 | ★1~★2 重複 | ★3 重複 | ★4 重複 |
|--------|-----------|--------|--------|
| 碎片量 | 5 | 15 | 40 |

### 觸發條件

```typescript
type PassiveTrigger =
  | 'battle_start'        // 戰鬥開始時（僅觸發一次）
  | 'turn_start'          // 自身回合開始時
  | 'turn_end'            // 自身回合結束時
  | 'on_attack'           // 普攻/技能命中時
  | 'on_kill'             // 擊殺敵人時
  | 'on_be_attacked'      // 被攻擊時（受傷前）
  | 'on_take_damage'      // 受傷後
  | 'on_lethal'           // 受到致命傷害時（HP 將歸零）
  | 'hp_below_pct'        // HP 低於 X% 時（首次觸發）
  | 'every_n_turns'       // 每 N 回合觸發
  | 'on_ally_death'       // 隊友死亡時
  | 'on_energy_full'      // 能量滿時
  | 'always'              // 永久被動（戰鬥開始即生效，不消失）
```

### 被動技能範例（14 個英雄 × 4 被動）

**女喪屍（敏捷 ★2）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 殘存意志 | ★1 | on_lethal | 首次致命傷 → 保留 1 HP（每場一次） |
| 敏捷身法 | ★2 | always | SPD +10% |
| 逆境反擊 | ★4 | hp_below_pct(30) | ATK +25% 持續到戰鬥結束 |
| 不死執念 | ★6 | on_lethal | 殘存意志變為可觸發 2 次 + 觸發時回復 20% HP |

**異變者（力量 ★3）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 狂暴基因 | ★1 | hp_below_pct(30) | ATK +20% |
| 嗜血本能 | ★2 | on_kill | 回復 15% max HP |
| 力量爆發 | ★4 | on_attack | 15% 機率造成 150% 傷害 |
| 狂化覺醒 | ★6 | hp_below_pct(15) | ATK +50%, SPD +30%, 但 DEF -30% |

**詭獸（坦克 ★4）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 厚皮 | ★1 | always | 受傷減少 15% |
| 威嚇 | ★2 | battle_start | 敵方全體 ATK -8% 2 回合 |
| 硬化 | ★4 | on_be_attacked | 被打後 DEF +10% 疊加（最多 3 層） |
| 鐵壁 | ★6 | hp_below_pct(50) | 受傷減少翻倍至 30% |

**屠宰者（刺客 ★4）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 亡者之速 | ★1 | on_attack | SPD +2 疊加（最多 3 層） |
| 殺意 | ★2 | always | CritRate +15% |
| 追獵 | ★4 | on_kill | 能量 +300 |
| 處決 | ★6 | on_attack | 目標 HP < 30% 時傷害 +50% |

**口器者（特殊 ★3）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 寄生吸取 | ★1 | on_attack | 回復造成傷害的 10% |
| 腐蝕體液 | ★2 | on_attack | 20% 機率 DEF -15% 2 回合 |
| 增殖 | ★4 | every_n_turns(3) | 回復自身 15% max HP |
| 完全寄生 | ★6 | on_attack | 吸取提升至 20% + 降低目標 10% 同屬性 |

**無名活屍（均衡 ★1）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 茫然 | ★1 | battle_start | 隨機一項屬性 +10% |
| 適應力 | ★2 | every_n_turns(5) | 隨機一項屬性再 +5% |
| 群聚本能 | ★4 | always | 每有一名存活隊友 ATK +3% |
| 進化 | ★6 | turn_end | 每回合隨機一項屬性永久 +1%（上限 +20%） |

**腐學者（輔助 ★3）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 殘留智識 | ★1 | every_n_turns(3) | 全隊回復 10 HP |
| 知識結晶 | ★2 | turn_start | 全隊能量 +20 |
| 腐蝕智慧 | ★4 | on_attack | 25% 機率沉默目標 1 回合 |
| 蘊藏真理 | ★6 | every_n_turns(3) | 回復量提升至 max HP 8% + 淨化一個 debuff |

**夜鬼（力量 ★3）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 威壓 | ★1 | battle_start | 敵全 ATK -10% 2 回合 |
| 暗影步 | ★2 | always | 閃避率 +10% |
| 恐懼蔓延 | ★4 | on_kill | 敵方全體 SPD -15% 1 回合 |
| 夜之霸主 | ★6 | battle_start | 威壓升級：敵全 ATK -15% + DEF -10% 3 回合 |

**倖存者（均衡 ★2）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 求生本能 | ★1 | hp_below_pct(50) | SPD +3 |
| 堅韌 | ★2 | always | DEF +10% |
| 破釜沉舟 | ★4 | hp_below_pct(30) | ATK +20%, CritRate +20% |
| 絕境逆轉 | ★6 | on_lethal | 50% 機率回復 30% HP（每場一次） |

**童魘（敏捷 ★4）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 凝視 | ★1 | on_attack | 25% 使目標 SPD -3 |
| 詭笑 | ★2 | on_be_attacked | 20% 使攻擊者 ATK -10% 2 回合 |
| 惡夢纏繞 | ★4 | on_attack | 15% 機率使目標恐懼（跳過下一回合） |
| 深淵注視 | ★6 | on_attack | 凝視升級：SPD -5 + 15% 機率暈眩 1 回合 |

**白面鬼（特殊 ★3）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 瘋狂表演 | ★1 | on_attack | 傷害 ×0.5~1.8 隨機 |
| 幕間 | ★2 | every_n_turns(2) | 隨機對一個敵人施加隨機 debuff 1 回合 |
| 安可 | ★4 | on_kill | 立即再行動一次（每回合限一次） |
| 謝幕 | ★6 | on_attack | 傷害隨機範圍改為 ×0.8~2.5 |

**戰厄（坦克 ★4）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 壕溝戰術 | ★1 | on_take_damage | 下次受傷 -25% |
| 嘲諷壁壘 | ★2 | battle_start | 嘲諷 2 回合（敵人優先攻擊自己） |
| 不屈 | ★4 | on_take_damage | 被打時回復 5% max HP |
| 要塞化 | ★6 | always | 壕溝戰術升級：-25% → -40%，且反彈 10% 傷害 |

**南瓜魔（力量 ★4）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 巨力踐踏 | ★1 | on_attack | 30% 額外 50% 傷害 |
| 震懾 | ★2 | on_attack | 巨力觸發時 40% 暈眩目標 1 回合 |
| 南瓜盛宴 | ★4 | on_kill | ATK +15% 持續 2 回合 |
| 災厄之主 | ★6 | on_attack | 巨力機率提升至 45%，額外傷害提升至 80% |

**脫逃者（敏捷 ★2）**
| 被動 | 星級 | 觸發 | 效果 |
|------|------|------|------|
| 閃避直覺 | ★1 | on_be_attacked | 20% 完全閃避 |
| 疾風 | ★2 | always | SPD +15% |
| 反擊姿態 | ★4 | on_be_attacked | 閃避成功時 100% 反擊（ATK × 80%） |
| 殘影 | ★6 | on_be_attacked | 閃避率提升至 35% |

---

## 五、效果模組（SkillEffect）

所有技能（主動/被動）的效果都由以下模組拼裝：

```typescript
interface SkillEffect {
  type: EffectType
  
  // 傷害/治療
  scalingStat?: keyof HeroStats   // 基於哪個屬性（ATK, HP, DEF, SPD）
  multiplier?: number              // 倍率（1.8 = 180%）
  flatValue?: number               // 固定值加算
  hitCount?: number                // 多段攻擊次數（random_enemies_N 用）
  
  // Buff / Debuff
  status?: StatusType              // 狀態效果類型
  statusValue?: number             // 效果值（0.2 = +20%）
  statusDuration?: number          // 持續回合數（0 = 永久/直到戰鬥結束）
  statusMaxStacks?: number         // 最大疊加層數（1 = 不可疊加）
  statusChance?: number            // 觸發機率（1.0 = 100%）
  
  // 條件
  condition?: EffectCondition      // 額外觸發條件
}

type EffectType =
  | 'damage'         // 造成傷害
  | 'heal'           // 治療
  | 'buff'           // 增益（加自己/隊友）
  | 'debuff'         // 減益（加敵人）
  | 'dispel_buff'    // 淨化敵方 buff
  | 'dispel_debuff'  // 淨化我方 debuff
  | 'shield'         // 護盾（基於 scalingStat × multiplier）
  | 'energy'         // 能量增減
  | 'revive'         // 復活（回復 multiplier% HP）
  | 'execute'        // 斬殺（目標 HP 低於 X% 直接擊殺）
  | 'reflect'        // 反彈（反彈 multiplier% 受到的傷害）
  | 'extra_turn'     // 額外回合

type StatusType =
  // Buff
  | 'atk_up' | 'def_up' | 'spd_up' | 'crit_rate_up' | 'crit_dmg_up'
  | 'energy_gain_up'   // 能量獲取+X%
  | 'dodge_up'         // 閃避率+
  | 'dmg_reduce'       // 受傷減少
  | 'regen'            // 每回合回血
  | 'taunt'            // 嘲諷（敵人優先攻擊）
  | 'immunity'         // 免疫控制效果
  // Debuff
  | 'atk_down' | 'def_down' | 'spd_down' | 'crit_rate_down'
  | 'dot_burn' | 'dot_poison' | 'dot_bleed'  // 每回合扣血
  | 'stun'             // 暈眩（跳過回合）
  | 'silence'          // 沉默（不能放主動技能，但能普攻）
  | 'fear'             // 恐懼（跳過回合 + 受傷+20%）

interface EffectCondition {
  type: 'target_hp_below' | 'self_hp_below' | 'has_status' | 'no_status'
  value: number          // HP 百分比 or status type index
}
```

---

## 六、Buff/Debuff 顯示

### 3D 模型上方 Icon

```
      [♥ HP 條]
  [🔥2] [⬆ATK] [🛡3]     ← buff/debuff icons + 疊加層數
      「角色名稱」
```

| 規則 | 說明 |
|------|------|
| 位置 | 血條下方，角色名稱上方 |
| 排列 | 左→右，buff 在左（綠框）、debuff 在右（紅框） |
| 疊加顯示 | icon 右下角小數字（如 🔥2 = 燃燒 2 層） |
| 上限 | 最多顯示 8 個 icon，超過用 `+N` 表示 |
| 回合顯示 | icon 下方小字顯示剩餘回合數 |

### Buff/Debuff 規則

| 規則 | 說明 |
|------|------|
| 同類疊加 | `statusMaxStacks > 1` 的可疊加，每次重新觸發 +1 層，duration 刷新 |
| 同類不疊加 | `statusMaxStacks = 1` 的取較高 value，duration 取較長 |
| 異類共存 | 不同 StatusType 可同時存在 |
| 結算時機 | DOT 在持有者回合開始時結算，buff/debuff 在持有者回合結束時 -1 回合 |
| 淨化 | `dispel_buff` 移除所有 buff，`dispel_debuff` 移除所有 debuff |
| 免疫 | `immunity` 狀態下不會被施加控制效果（stun/silence/fear） |

---

## 七、英雄 → 技能對應表（Google Sheet: `hero_skills`）

| 欄位 | 說明 |
|------|------|
| `heroId` | 英雄 ID |
| `activeSkillId` | 主動技能 skillId |
| `passive1_skillId` | 被動 1（★1 解鎖） |
| `passive2_skillId` | 被動 2（★2 解鎖） |
| `passive3_skillId` | 被動 3（★4 解鎖） |
| `passive4_skillId` | 被動 4（★6 解鎖） |

這樣設計的好處：
- **同一個技能可以被多個英雄共用**
- **新增英雄只需要在 hero_skills 表加一行**
- **想調整某個技能效果，改 skill_templates 一處即可全局生效**
- **新 idea → 加入 skill_templates → 指派給英雄 → 程式碼自動識別**

---

## 八、普攻

普攻不在技能表中定義，而是戰鬥引擎的預設行為：

```typescript
const NORMAL_ATTACK = {
  target: 'single_enemy' as TargetType,   // 使用 TARGET_NORMAL 策略
  effects: [{
    type: 'damage' as EffectType,
    scalingStat: 'ATK',
    multiplier: 1.0,    // 100% ATK
  }],
  energyGain: 200,      // 普攻固定獲得 200 能量
}
```

---

## 擴展點

- [ ] **技能升級**：消耗素材提升技能倍率（每級 +8%）
- [ ] **合體技能**：兩個特定英雄同場時，共用一個超強主動技能
- [ ] **覺醒技能**：★6 後特殊覺醒路線，替換主動技能
- [ ] **裝備附加效果**：特定套裝觸發額外被動
- [ ] **環境效果**：特定關卡全場 buff/debuff（如「烈焰地形：每回合全體受到火焰傷害」）

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版草案 |
| v0.2 | 2026-02-26 | 全面重寫：能量制主動技能、4 被動星級解鎖、技能表分離、效果模組化、buff/debuff icon 顯示規則、14 英雄完整被動設計 |
