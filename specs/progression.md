# 養成系統 Spec

> 版本：v0.2 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

角色成長路徑：**等級**（消耗素材升級）、**星級**（重複抽卡取得碎片升星，解鎖被動技能）、**裝備**（4 格位 + 套裝效果 + 鍛造合成 + 強化，可完整重置退還素材）。

## 依賴

- `specs/hero-schema.md` — HeroInstance 結構（HP, ATK, DEF, SPD, CritRate, CritDmg）
- `specs/skill-system.md` — 被動技能星級解鎖
- `specs/save-system.md` — 存檔結構

---

## 一、等級系統

### 基礎

| 項目 | 值 |
|------|-----|
| 等級範圍 | 1-60 |
| 升級方式 | 消耗「經驗素材」，非自動經驗值 |
| 等級上限 | 由突破階段決定 |

### 經驗素材

| 素材 | 提供經驗 | 來源 |
|------|---------|------|
| 小型經驗核心 | 100 EXP | 主線掉落、每日副本 |
| 中型經驗核心 | 500 EXP | 主線後期、每日副本 |
| 大型經驗核心 | 2000 EXP | 爬塔獎勵、Boss 戰 |

### 升級所需經驗

```typescript
function expToNextLevel(level: number): number {
  const base = 100
  const tier = Math.floor((level - 1) / 10)  // 0-5
  return Math.floor(base * Math.pow(1.8, tier) * (1 + (level % 10) * 0.15))
}
```

| 等級 | 升級 EXP（約） | 累計（約） |
|------|--------------|-----------|
| 1→2 | 100 | 100 |
| 10→11 | 235 | 1,600 |
| 20→21 | 762 | 8,500 |
| 30→31 | 2,468 | 36,000 |
| 40→41 | 7,993 | 140,000 |
| 50→51 | 25,894 | 500,000 |

### 數值成長

```typescript
function getStatAtLevel(baseStat: number, level: number): number {
  return Math.floor(baseStat * (1 + (level - 1) * 0.04))  // 每級 +4% of base
}
```

---

## 二、突破系統

| 階段 | 需求等級 | 突破後上限 | 屬性加成 |
|------|---------|-----------|---------|
| 0（初始） | — | 20 | — |
| 1 | 20 | 30 | 全屬性 +5% |
| 2 | 30 | 40 | 全屬性 +10% |
| 3 | 40 | 50 | 全屬性 +15% |
| 4 | 50 | 60 | 全屬性 +20% |
| 5（覺醒） | 60 | 60 | 全屬性 +30%（外觀變化） |

### 突破素材

| 階段 | 通用素材 | 職業素材 | 金幣 |
|------|---------|---------|------|
| 0→1 | 碎片×5 | 職業石×3 | 5,000 |
| 1→2 | 碎片×10 | 職業石×8 | 15,000 |
| 2→3 | 碎片×20 | 職業石×15 | 40,000 |
| 3→4 | 碎片×40 | 職業石×25 | 80,000 |
| 4→5 | 碎片×60 | 職業石×40 | 150,000 |

---

## 三、星級系統

### 星級與被動解鎖

| 星級 | 解鎖 | 基礎數值加成 |
|------|------|-------------|
| ★1 | 被動 1 | — |
| ★2 | 被動 2 | 全屬性 +5% |
| ★3 | — | 全屬性 +10% |
| ★4 | 被動 3 | 全屬性 +15% |
| ★5 | — | 全屬性 +20% |
| ★6 | 被動 4 | 全屬性 +30% |

### 升星消耗

| 升星 | 所需碎片 |
|------|---------|
| ★1→★2 | 10 |
| ★2→★3 | 20 |
| ★3→★4 | 40 |
| ★4→★5 | 80 |
| ★5→★6 | 160 |

### 碎片來源

| 來源 | 碎片量 |
|------|--------|
| 重複抽到（稀有度 ★1~★2） | 5 碎片 |
| 重複抽到（稀有度 ★3） | 15 碎片 |
| 重複抽到（稀有度 ★4） | 40 碎片 |
| 競技場商店 | 可兌換指定碎片 |
| 特定關卡 Hard 模式 | 低機率掉落 |

### 初始星級

角色首次取得時的星級由稀有度決定：

| 原始稀有度 | 初始星級 |
|-----------|---------|
| ★1 | ★1 |
| ★2 | ★1 |
| ★3 | ★2 |
| ★4 | ★3 |

所有角色最終都能培養到 ★6，稀有度只影響起步。

---

## 四、裝備系統

### 格位（4 格）

| 格位 | 主屬性 | 說明 |
|------|--------|------|
| 武器 | ATK | 提升攻擊力 |
| 衣服 | HP 或 DEF | 提升生存 |
| 戒指 | CritRate 或 CritDmg | 提升暴擊 |
| 鞋子 | SPD | 提升速度 |

### 裝備稀有度

| 稀有度 | 副屬性條數 | 顏色 |
|--------|-----------|------|
| N（普通） | 0 | 灰 |
| R（精良） | 1 | 綠 |
| SR（稀有） | 2 | 藍 |
| SSR（傳說） | 3 | 紫 |

### 副屬性池

| 副屬性 | 可出現格位 | 範圍 |
|--------|-----------|------|
| ATK +N | 全格位 | 5-30 |
| ATK +N% | 全格位 | 3%-15% |
| HP +N | 全格位 | 50-300 |
| HP +N% | 全格位 | 3%-15% |
| DEF +N | 全格位 | 3-20 |
| DEF +N% | 全格位 | 3%-15% |
| SPD +N | 全格位 | 1-8 |
| CritRate +N% | 全格位 | 2%-10% |
| CritDmg +N% | 全格位 | 4%-20% |

### 套裝系統

穿戴同套裝 **2 件**觸發套裝效果：

| 套裝 | 2 件效果 | 掉落來源 |
|------|---------|---------|
| 狂戰士 | ATK +15% | 主線 Ch.1 |
| 鐵壁 | DEF +20% | 主線 Ch.2 |
| 疾風 | SPD +15 | 主線 Ch.3 |
| 吸血 | 攻擊回復造成傷害的 12% | 爬塔 |
| 暴擊 | CritRate +12% | 每日副本 |
| 致命 | CritDmg +25% | 每日副本 |
| 生命 | HP +20% | Boss 戰 |
| 反擊 | 被攻擊時 20% 反擊 | Boss 戰 |

```typescript
interface EquipmentSet {
  setId: string
  name: string
  requiredCount: 2          // 目前只做 2 件套
  bonus: SkillEffect        // 套裝效果（復用技能效果模組）
}
```

### 裝備強化

| 項目 | 說明 |
|------|------|
| 消耗素材 | 強化石（小/中/大） + 金幣 |
| 等級上限 | N=+5, R=+10, SR=+15, SSR=+20 |
| 每級效果 | 主屬性 +？%（依公式） |
| 副屬性強化 | 每 +5 級隨機一條副屬性提升 |

```typescript
function enhancedMainStat(baseValue: number, enhanceLevel: number): number {
  return Math.floor(baseValue * (1 + enhanceLevel * 0.1))  // 每級 +10% of base
}
```

### 🔄 裝備重置（完整退還）

| 操作 | 效果 | 消耗 |
|------|------|------|
| **強化重置** | 裝備回到 +0，**返還所有強化石 + 金幣** | 免費 |
| **副屬性重洗** | 副屬性重新隨機（條數不變） | 重洗石 ×1 |

> 設計理念：讓玩家敢於嘗試強化，不怕浪費資源。培養錯的裝備可以 100% 回收。

### 鍛造 / 合成

| 操作 | 輸入 | 輸出 | 說明 |
|------|------|------|------|
| **鍛造** | 鍛造圖紙 + 素材 + 金幣 | 指定套裝的隨機裝備 | 圖紙從關卡/Boss 掉落 |
| **合成** | 同稀有度裝備 ×3 | 高一級稀有度隨機裝備 | N×3→R, R×3→SR, SR×3→SSR |
| **拆解** | 任意裝備 | 強化石 + 少量金幣 | 不要的裝備回收 |
| **鍛造重置** | — | **返還鍛造圖紙 + 素材 + 金幣** | 鍛造出的裝備回爐，無損退還 |

```typescript
interface ForgeRecipe {
  recipeId: string       // "recipe_berserker_weapon"
  setId: string          // "berserker"
  slot: EquipmentSlot    // "weapon"
  rarity: 'R' | 'SR' | 'SSR'
  materials: MaterialCost[]
  goldCost: number
}

interface MaterialCost {
  itemId: string
  quantity: number
}
```

---

## 五、最終數值計算

```typescript
function getFinalStats(hero: HeroInstance): HeroStats {
  const base = getBaseStats(hero.heroId)            // heroes 表原始數值
  const levelMult = 1 + (hero.level - 1) * 0.04    // 等級成長
  const ascMult = getAscensionMultiplier(hero.ascension)  // 突破加成
  const starMult = getStarMultiplier(hero.stars)    // 星級加成
  
  let stats = {
    HP:       Math.floor(base.HP * levelMult * ascMult * starMult),
    ATK:      Math.floor(base.ATK * levelMult * ascMult * starMult),
    DEF:      Math.floor(base.DEF * levelMult * ascMult * starMult),
    SPD:      base.SPD,   // SPD 不受等級影響，只受裝備/buff
    CritRate: base.CritRate,
    CritDmg:  base.CritDmg,
  }
  
  // 裝備主屬性 + 副屬性（flat 值先加）
  stats = applyEquipmentFlat(stats, hero.equipment)
  // 裝備百分比加成
  stats = applyEquipmentPercent(stats, hero.equipment)
  // 套裝效果
  stats = applySetBonuses(stats, hero.equipment)
  
  return stats
}
```

---

## 擴展點

- [ ] **裝備鍛造升級**：圖紙升級，鍛造出更高品質
- [ ] **4 件套效果**：目前只做 2 件套
- [ ] **專屬裝備**：特定英雄專用武器
- [ ] **天賦樹**：每角色 3 條天賦路線（攻擊/防禦/輔助），每條 5 節點
- [ ] **外觀系統**：覺醒後替換模型
- [ ] **好感度系統**：互動解鎖語音/劇情

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版草案 |
| v0.2 | 2026-02-26 | 重寫：4 格位裝備（武器/衣服/戒指/鞋子）+ 套裝效果 + 鍛造合成 + 強化重置全額退還 + 星級系統（分離自 skill-system）+ 素材式升級 |
