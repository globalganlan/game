# 戰力系統 Spec

> 版本：v0.4 ｜ 狀態：🟢 已實作（HUD 已渲染）
> 最後更新：2026-03-01
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

戰力（Combat Power, CP）是對玩家當前陣容強度的**單一數值量化指標**。
顯示於大廳主選單 HUD，督促玩家養成；每當戰力變動（培養英雄、穿脫裝備、調整陣型等）時，畫面正中央以**飛行動畫**即時顯示 ↑ 提升 / ↓ 降低的差值並更新。
戰鬥準備階段（`IDLE`）同時顯示**敵我雙方戰力對比條**，讓玩家評估勝負預期。

## 依賴

- `specs/hero-schema.md` — BattleHero / FinalStats 數值
- `specs/progression.md` — getFinalStats（含等級/突破/星級/裝備/套裝加成）
- `specs/skill-system.md` — 被動技能效果加權
- `specs/save-system.md` — formation 陣型、hero_instances、equipment
- `specs/ui-flow.md` — GameState / MenuScreen 控制顯示時機
- `specs/element-system.md` — 屬性權重（選配）

## 實作對照（待建立）

| 原始碼 | 說明 |
|--------|------|
| `src/domain/combatPower.ts` | Domain 層 — CP 公式、隊伍 CP 計算 |
| `src/components/CombatPowerHUD.tsx` | UI — 主選單戰力顯示 + 飛行動畫 + 對比條 |
| `src/hooks/useCombatPower.ts` | Hook — 監聽陣型/養成/裝備變化，計算並觸發動畫 |

---

## 一、戰力計算公式

### 1.1 單一英雄戰力（getHeroCombatPower）

```typescript
function getHeroCombatPower(finalStats: FinalStats, hero: HeroInstanceData): number {
  // 1. 基礎六維加權
  const basePower =
    finalStats.HP * W_HP +
    finalStats.ATK * W_ATK +
    finalStats.DEF * W_DEF +
    finalStats.SPD * W_SPD +
    finalStats.CritRate * W_CRIT_RATE +
    finalStats.CritDmg * W_CRIT_DMG

  // 2. 技能加成
  const skillBonus = getSkillPowerBonus(hero)

  // 3. 套裝效果加成
  const setBonus = getSetBonusPower(hero)

  return Math.floor(basePower + skillBonus + setBonus)
}
```

### 1.2 權重常數（CP_WEIGHTS）

| 屬性 | 權重 | 說明 |
|------|------|------|
| HP | `W_HP = 0.5` | 生命值，量大但單位價值低 |
| ATK | `W_ATK = 3.0` | 攻擊力，核心輸出指標 |
| DEF | `W_DEF = 2.5` | 防禦力，重要生存指標 |
| SPD | `W_SPD = 8.0` | 速度，高權重（決定先手） |
| CritRate | `W_CRIT_RATE = 5.0` | 暴擊率（%），每 1% = 5 CP |
| CritDmg | `W_CRIT_DMG = 2.0` | 暴擊傷害（%），每 1% = 2 CP |

> **設計原則**：確保 Lv1 初始英雄 CP ≈ 100~300，Lv60 滿裝 SSR 英雄 CP ≈ 5,000~10,000。
> 調參時以 `heroes.tsv` 的 14 隻英雄為基準做 sanity check。

### 1.3 技能加成（getSkillPowerBonus）

```typescript
function getSkillPowerBonus(hero: HeroInstanceData): number {
  let bonus = 0
  // 大招固定加成
  bonus += ULTIMATE_POWER_BASE  // 100

  // 每個已解鎖的被動技能
  const passiveSlots = STAR_PASSIVE_SLOTS[hero.stars]  // 0~4 個
  bonus += passiveSlots * PASSIVE_POWER_EACH  // 每個 50
  return bonus
}
```

| 常數 | 值 | 說明 |
|------|-----|------|
| `ULTIMATE_POWER_BASE` | 100 | 擁有大招的基礎加成 |
| `PASSIVE_POWER_EACH` | 50 | 每個已解鎖被動的加成 |

### 1.4 套裝效果加成（getSetBonusPower）

```typescript
function getSetBonusPower(hero: HeroInstanceData): number {
  // 依已湊齊的套裝效果加分
  // 2 件套 → +SET_2PC_POWER
  // 4 件套 → +SET_4PC_POWER（含 2 件套）
  let bonus = 0
  for (const setBonusActive of hero.activeSetBonuses) {
    if (setBonusActive.pieces >= 4) bonus += SET_4PC_POWER
    else if (setBonusActive.pieces >= 2) bonus += SET_2PC_POWER
  }
  return bonus
}
```

| 常數 | 值 | 說明 |
|------|-----|------|
| `SET_2PC_POWER` | 80 | 湊齊 2 件套的加成 |
| `SET_4PC_POWER` | 200 | 湊齊 4 件套的**額外**加成（與 2 件套疊加，4pc 總 CP = 80 + 200 = 280） |

### 1.5 隊伍總戰力（getTeamCombatPower）

```typescript
function getTeamCombatPower(
  formation: (string | null)[],
  heroInstances: HeroInstance[],
  equipment: OwnedEquipment[],
  heroesList: RawHeroData[]
): number {
  let total = 0
  for (const instanceId of formation) {
    if (!instanceId) continue
    const hero = heroInstances.find(h => h.instanceId === instanceId)
    if (!hero) continue
    const base = heroesList.find(h => h.HeroID === hero.heroId)
    if (!base) continue
    const finalStats = getFinalStats(base, hero, equipment)
    total += getHeroCombatPower(finalStats, hero)
  }
  return total
}
```

> 只計算**陣型中已上陣**的英雄，空位不計。

### 1.6 敵方戰力估算（getEnemyTeamPower）

由 `stageSystem.ts` 生成的 `StageEnemy[]` 計算：

```typescript
function getEnemyTeamPower(enemies: StageEnemy[]): number {
  let total = 0
  for (const enemy of enemies) {
    total += Math.floor(
      enemy.hp * W_HP +
      enemy.atk * W_ATK +
      (enemy.def ?? 10) * W_DEF +
      enemy.speed * W_SPD +
      (enemy.critRate ?? 5) * W_CRIT_RATE +
      (enemy.critDmg ?? 50) * W_CRIT_DMG
    )
  }
  return total
}
```

---

## 二、顯示位置

### 2.1 大廳主選單（MAIN_MENU + menuScreen='none'）

```
┌─────────────────────────────────────────┐
│  💎 1,200   🪙 45,000        ⚡ 3,280  │  ← 資源 HUD 列，右側新增戰力
│                                         │
│          ┌────────────────┐             │
│          │   📋 主選單     │             │
│          │   🗺️ 關卡      │             │
│          │   🧟 英雄      │             │
│          │   🎰 召喚      │             │
│          │   ...          │             │
│          └────────────────┘             │
│                                         │
└─────────────────────────────────────────┘
```

- 戰力 icon：⚡ 閃電符號
- 數值顯示：格式化千位分隔（如 `3,280`）
- 位置：HUD 資源列右側（鑽石 + 金幣之後）
- **只在 `menuScreen === 'none'`（主選單首頁）時顯示**，子面板中隱藏

### 2.2 戰鬥準備（IDLE）

```
┌─────────────────────────────────────────┐
│                                         │
│        ⚡ 3,280   VS   ⚡ 2,150        │  ← 敵我戰力對比
│        ████████████░░░░░░░░░░░         │  ← 對比進度條
│        我方 60%         敵方 40%         │
│                                         │
│   [3D 戰場 — 陣型排列]                   │
│                                         │
│   ┌────┬────┬────┬────┬────┬────┐      │
│   │ 英雄 │ 英雄 │ ... │    │    │    │  │  ← 底部英雄選擇欄
│   └────┴────┴────┴────┴────┴────┘      │
│          [← 返回]    [⚔️ 開戰]          │
└─────────────────────────────────────────┘
```

#### 對比條規則

```typescript
const myPct = myPower / (myPower + enemyPower)
const enemyPct = 1 - myPct
// 對比條：綠色（我方）→ 紅色（敵方）
// 若我方 > 敵方 1.5× → 文字 "碾壓！"
// 若敵方 > 我方 1.5× → 文字 "危險！" + 紅色閃爍
```

| 差距 | 文字提示 | 效果 |
|------|---------|------|
| 我方 ≥ 1.5× | 碾壓！ | 綠色文字 |
| 我方 ≥ 1.2× | 優勢 | 綠色文字 |
| 大致持平 | 勢均力敵 | 白色文字 |
| 敵方 ≥ 1.2× | 劣勢 | 橙色文字 |
| 敵方 ≥ 1.5× | 危險！ | 紅色閃爍 |

---

## 三、戰力變動動畫（CombatPowerChangeToast）

### 觸發時機

任何導致**當前陣型隊伍總戰力**變化的操作：

| 操作 | 變動方向 | 場景 |
|------|---------|------|
| 升級已上陣英雄 | ↑ 提升 | HeroListPanel → 升級按鈕 |
| 突破已上陣英雄 | ↑ 提升 | HeroListPanel → 突破按鈕 |
| 升星已上陣英雄 | ↑ 提升 | HeroListPanel → 升星按鈕 |
| 穿裝備到已上陣英雄 | ↑ 提升 | HeroListPanel → 裝備槽 |
| 脫裝備從已上陣英雄 | ↓ 降低 | HeroListPanel → 卸下裝備 |
| 強化已上陣英雄的裝備 | ↑ 提升 | 裝備強化 UI |
| 上陣較強英雄 | ↑ 提升 | IDLE 拖曳陣型 |
| 下陣英雄 / 換弱英雄 | ↓ 降低 | IDLE 拖曳陣型 |
| 原陣型英雄死亡後重構 | ↓ 降低 | 特殊情況 |

### 動畫設計

```
                    ⚡ +320 ↑
              ┌──────────────────┐
              │  數字從中央向上飄  │
              │  綠色（提升）     │
              │  / 紅色（降低）   │
              └──────────────────┘
                    淡出消失
```

| 參數 | 值 |
|------|-----|
| 動畫持續時間 | 1.5 秒 |
| 起始位置 | 螢幕正中央（略偏上） |
| 飄移方向 | 提升 → 向上飄；降低 → 向下飄 |
| 起始大小 | `fontSize: 2rem` |
| 最終大小 | `fontSize: 2.5rem`（略放大） |
| 淡入 | 0~0.2s `opacity: 0 → 1` |
| 淡出 | 1.0~1.5s `opacity: 1 → 0` |
| 提升色 | `#4ade80`（綠色） |
| 降低色 | `#f87171`（紅色） |
| 格式 | `⚡ +1,320 ↑` 或 `⚡ -280 ↓` |
| 疊加規則 | 短時間內多次觸發 → 合併差值，重置動畫 |

### 實作方式

```typescript
// useCombatPower hook
function useCombatPower(formation, heroInstances, equipment, heroesList) {
  const prevPowerRef = useRef<number>(0)
  const [currentPower, setCurrentPower] = useState(0)
  const [powerDelta, setPowerDelta] = useState<number | null>(null)

  useEffect(() => {
    const newPower = getTeamCombatPower(formation, heroInstances, equipment, heroesList)
    const delta = newPower - prevPowerRef.current
    if (prevPowerRef.current > 0 && delta !== 0) {
      setPowerDelta(delta)
      // 1.5s 後清除
      setTimeout(() => setPowerDelta(null), 1500)
    }
    prevPowerRef.current = newPower
    setCurrentPower(newPower)
  }, [formation, heroInstances, equipment])

  return { currentPower, powerDelta }
}
```

### CSS 動畫（戰力飛行 Toast）

```css
.combat-power-toast {
  position: fixed;
  top: 40%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 2rem;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(0,0,0,0.5);
  pointer-events: none;
  z-index: 9999;
  animation: cp-fly 1.5s ease-out forwards;
}

.combat-power-toast.up {
  color: #4ade80;
}

.combat-power-toast.down {
  color: #f87171;
}

@keyframes cp-fly {
  0%   { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.8); }
  15%  { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1.1); }
  80%  { opacity: 1; transform: translateX(-50%) translateY(-40px) scale(1.0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-60px) scale(1.0); }
}
```

---

## 四、存檔與快取

### 戰力不持久化

- 戰力是**衍生值**（由 formation + heroInstances + equipment 計算而來），不額外存入 `save_data`
- 每次 `loadSave()` 後重新計算
- `useCombatPower` hook 在 formation/heroInstances/equipment 任一變化時自動重算

### localStorage 快取（選配）

```typescript
// 可將最新戰力存入 localStorage，用於：
// 1. 登入後立即顯示上次戰力（載入完成前的佔位）
// 2. 競技場防守陣型的防守戰力顯示
const CP_CACHE_KEY = 'globalganlan_combat_power'
```

---

## 五、與其他系統的交互

### 5.1 競技場（arena-pvp.md）

- 玩家防守戰力顯示於排行榜
- 挑戰時顯示敵我戰力對比
- 匹配時可用戰力做粗略分層

### 5.2 關卡系統（stage-system.md）

- 戰鬥準備（IDLE）自動計算敵方 CP，顯示對比條
- 「推薦戰力」可作為關卡難度提示（擴展點）

### 5.3 養成系統（progression.md）

- 所有養成操作後 → `useCombatPower` 自動偵測差值 → 觸發飛行動畫
- 裝備穿脫 → 同理

---

## 擴展點

- [ ] **推薦戰力**：每個關卡/Boss/副本顯示推薦 CP 門檻
- [ ] **戰力排行榜**：全伺服器戰力排名
- [ ] **戰力里程碑**：CP 達到特定值時發放獎勵
- [ ] **歷史最高戰力**：記錄並展示歷史最高 CP
- [ ] **權重可調**：活動期間臨時調整權重（例如「防禦日」DEF 權重翻倍）

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|| v0.5 | 2026-03-01 | 主選單 CP HUD 實作：MainMenu 新增 combatPower prop + ⚗️ 戰力顯示；App.tsx 傳入 cpState.currentPower |
| v0.4 | 2026-03-01 | QA 審計修正：4 件套 CP 描述更明確（SET_2PC + SET_4PC = 280 疊加）、113 單元測試全通過 |
| v0.3 | 2026-03-01 | App.tsx 整合完成：`useCombatPower()` hook 已呼叫（傳入 formation/heroInstances/heroesList/enemySlots）、`<CombatPowerComparison>` 在 IDLE 狀態顯示我方與敵方戰力對比條、`<CombatPowerToast>` 顯示戰力變動飛行數字 || v0.2 | 2026-03-01 | 完成全部實作：domain/combatPower.ts + useCombatPower hook + CombatPowerHUD + CSS 動畫 + App.tsx 整合 |
| v0.1 | 2026-03-01 | 初版草案：CP 六維加權公式、技能/套裝加成、隊伍 CP、敵方 CP 估算、HUD 位置（主選單 + IDLE 對比條）、戰力變動飛行動畫（1.5s、綠/紅、合併差值）、useCombatPower hook、CSS keyframes |
