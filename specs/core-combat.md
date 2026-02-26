# 戰鬥系統 Spec

> 版本：v2.0 ｜ 狀態：🟡 草案（v1.0 程式碼同步 + v2.0 新系統設計）
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/App.tsx` `src/components/Hero.tsx` `src/components/ZombieModel.tsx`

## 概述

6v6 自動戰鬥系統。玩家在戰前從英雄列表選擇角色佈陣（6 格 × 前後排），
敵方由系統或關卡配置編成。戰鬥為**全自動回合制**，
角色依速度排序逐一行動，跑到目標面前攻擊後退回原位。

**v2.0 新增**：能量系統（大招機制）、Buff/Debuff 系統、完整傷害公式、被動技能觸發。

## 依賴

- `specs/hero-schema.md` — 角色資料結構（HP / ATK / DEF / Speed / CritRate / CritDmg）
- `specs/skill-system.md` — 主動技能 + 被動技能 + Buff/Debuff 定義
- `specs/damage-formula.md` — 傷害 / 治療 / 暴擊 / 閃避 / DOT 數值計算
- `specs/element-system.md` — 屬性剋制倍率
- `specs/progression.md` — finalStats 結算（等級 / 突破 / 裝備）
- Google Sheets API — 英雄資料來源

---

## 一、遊戲狀態機（不變）

```
PRE_BATTLE → FETCHING → IDLE → BATTLE → GAMEOVER
                                           ↓
                                     resetGame → FETCHING（重頭來過）
```

| 狀態 | 說明 |
|------|------|
| `PRE_BATTLE` | 初始狀態，尚未載入 |
| `FETCHING` | 從 Google Sheets API 拉取英雄資料 + 預載 GLB 模型/動畫/縮圖 |
| `IDLE` | 資料就緒，玩家可選英雄上陣、調整陣型（拖曳換位） |
| `BATTLE` | 自動戰鬥進行中（不可操作） |
| `GAMEOVER` | 戰鬥結束，顯示 VICTORY/DEFEAT，可重啟 |

---

## 二、陣型系統（不變）

### 格子佈局（6 格：前排 3 + 後排 3）

```
               敵方                              我方
     後排(3,4,5)     前排(0,1,2)       前排(0,1,2)     後排(3,4,5)
       ●  ●  ●         ●  ●  ●          ●  ●  ●         ●  ●  ●
      
         -Z ←——————— 中場 ———————→ +Z
```

### 座標

| 欄位 | X 座標 |
|------|--------|
| 左 (0) | -2.5 |
| 中 (1) | 0.0 |
| 右 (2) | 2.5 |

| 陣營 | 前排 Z | 後排 Z |
|------|--------|--------|
| 玩家 | +3.0 | +6.0 |
| 敵方 | -3.0 | -6.0 |

### 陣型調整
- 狀態為 `IDLE` 且 `turn === 0` 時可調整
- **拖曳換位**：在格子間拖曳英雄，交換兩格內容
- **點擊上/下陣**：點擊縮圖添加到最近的空格，再次點擊移除

---

## 三、戰鬥迴圈（`runBattleLoop`）— v2.0 更新

### 整體流程

```
0. 戰鬥初始化：所有角色 energy = 0，觸發「戰鬥開始」被動
1. 收集雙方存活角色
2. 按速度排序（DESC），平手看 slot ASC，再平手玩家優先
3. 每回合開始：
   a. 結算 DOT（dot_burn / dot_poison / dot_bleed）
   b. 結算回合型 Buff/Debuff 倒數
   c. 被動觸發：「每回合開始」類被動
4. 逐一行動：
   for (actor of sorted) {
     a. 跳過已死亡 / 已暈眩 / 已凍結角色
     b. actor.energy += 50  // 回合能量
     c. 判斷是否施放大招（energy >= 1000 且有主動技能）
     d. 若施放大招：
        i.  選擇技能目標（依技能 targetType）
        ii. 執行技能演出（前進 → 技能動畫 → 多目標傷害/治療/Buff）
        iii. energy 歸零
     e. 若普通攻擊：
        i.  選擇目標（TARGET_NORMAL 策略）
        ii. 前進 → 攻擊 → 傷害判定 → 後退
        iii. 攻擊者 energy += 200
        iv. 被攻擊者 energy += 150（存活時）
     f. 被動觸發：「攻擊後」/「命中後」類被動
     g. 死亡判定：若目標 HP=0 → 攻擊者 energy += 100（擊殺獎勵）
     h. 間隔 delay(120ms / speed)
   }
5. turn++，回到 Step 1
6. 直到一方全滅 → GAMEOVER
```

---

## 四、能量系統（v2.0 新增）

### 能量值

| 屬性 | 值 |
|------|-----|
| 初始能量 | 0 |
| 大招門檻 | 1000 |
| 能量上限 | 1000（到達即可施放，不再累積） |

### 能量獲取途徑

| 行為 | 能量 | 說明 |
|------|------|------|
| 每回合開始 | +50 | 每個角色在自己行動前 |
| 發動普攻 | +200 | 攻擊者 |
| 被攻擊（存活） | +150 | 受擊者 |
| 擊殺敵人 | +100 | 給予最後一擊者 |
| 被動加成 | 可變 | 某些被動可加速充能 |
| Buff: energy_boost | 可變 | 技能效果 |

### 大招施放條件

```typescript
function shouldCastUltimate(actor: BattleHero): boolean {
  return actor.energy >= 1000 && actor.activeSkill != null
}
```

### 大招施放流程

1. 確認 `energy >= 1000`
2. 依技能 `targetType` 選擇目標：
   - `single_enemy` → TARGET_NORMAL 策略
   - `all_enemy` → 敵方全體存活
   - `random_enemy_3` → 隨機 3 個敵人
   - `front_row` → 敵方前排
   - `back_row` → 敵方後排
   - `single_ally` → HP 最低的隊友
   - `all_ally` → 我方全體
3. 播放大招演出（特殊鏡頭震動 / 全螢幕技能名稱閃光）
4. 計算傷害 / 治療 / 施加 Buff/Debuff
5. `energy = 0`

### 能量條 UI

- 位置：HP 條下方
- 顏色：金色漸層
- 充滿動畫：energy >= 1000 時發光脈動
- 大招圖標：角色頭上出現技能 icon（表示可施放）

---

## 五、Buff / Debuff 系統（v2.0 新增）

### 狀態資料結構

```typescript
interface StatusEffect {
  type: StatusType         // 效果類型
  value: number            // 數值（例如 0.2 = 20%）
  duration: number         // 剩餘回合數
  stacks: number           // 當前疊加層數
  maxStacks: number        // 最大疊加層數
  sourceHeroId: string     // 施加者 ID
}

type StatusType =
  // Buff（正面效果）
  | 'atk_up' | 'def_up' | 'speed_up' | 'crit_rate_up'
  | 'dmg_reduce' | 'shield' | 'regen' | 'energy_boost'
  | 'dodge_up' | 'reflect' | 'taunt'
  // Debuff（負面效果）
  | 'atk_down' | 'def_down' | 'speed_down' | 'crit_rate_down'
  | 'dot_burn' | 'dot_poison' | 'dot_bleed'
  | 'stun' | 'freeze' | 'silence' | 'fear'
  // 控制
  | 'immunity' | 'cleanse'
```

### 回合結算

每回合開始時（角色行動前）：

```typescript
function processStatusEffects(hero: BattleHero): void {
  for (const status of hero.statusEffects) {
    // DOT 結算
    if (['dot_burn', 'dot_poison', 'dot_bleed'].includes(status.type)) {
      const dotDmg = calculateDot(status.type, status.source, hero)
      hero.currentHP = Math.max(0, hero.currentHP - dotDmg)
      showDamagePopup(hero, dotDmg, 'dot')
    }
    
    // regen 結算
    if (status.type === 'regen') {
      const heal = Math.floor(hero.finalStats.HP * status.value)
      hero.currentHP = Math.min(hero.finalStats.HP, hero.currentHP + heal)
      showDamagePopup(hero, heal, 'heal')
    }
    
    // 回合倒數
    status.duration--
  }
  
  // 移除到期效果
  hero.statusEffects = hero.statusEffects.filter(s => s.duration > 0)
}
```

### 疊加規則

| 情況 | 處理方式 |
|------|----------|
| 同類型 Buff 重複施加 | `stacks++`（不超過 maxStacks），duration 取較長者 |
| 不同來源的同類型 | 各自獨立計算，效果加算 |
| 控制效果（stun/freeze） | 不疊加，刷新 duration |
| immunity 存在時 | 所有 debuff 施加被擋（顯示「免疫」） |

### 3D 圖標顯示（v2.0 新增）

在角色 3D 模型**頭頂上方**（血條再上方）顯示 Buff/Debuff 圖標：

```typescript
interface StatusIcon3D {
  position: [number, number, number]  // 角色頭頂 + offset
  texture: string                      // 圖標貼圖路徑
  isDebuff: boolean                    // true=紅框, false=綠框
  stackCount: number                   // 顯示在右下角的數字
  duration: number                     // 剩餘回合數（顯示在左下角）
}
```

- **Buff**：綠色邊框
- **Debuff**：紅色邊框
- **疊加數**：圖標右下角白色數字
- **排列**：橫向排列，最多顯示 6 個（超出以 `+N` 表示）
- **大小**：Billboard，螢幕空間約 24×24px

---

## 六、被動技能觸發點（v2.0 新增）

被動技能由 `specs/skill-system.md` 定義，戰鬥系統需在以下時機檢查觸發：

### 觸發時機

| 觸發點 | 位置 | 範例被動 |
|--------|------|---------|
| `battle_start` | 戰鬥開始 | 夜鬼「威壓」敵全體 ATK-10%、無名活屍「茫然」隨機 buff |
| `turn_start` | 每回合開始 | 腐學者「殘留智識」每 3 回合回血 |
| `before_attack` | 攻擊前 | 白面鬼「瘋狂表演」隨機傷害倍率 |
| `on_hit` | 命中目標後 | 屠宰者「殺意」CritRate+15%、口器者「寄生吸取」回血 |
| `on_kill` | 擊殺目標 | 屠宰者「亡者嗅覺」Speed+2 |
| `on_be_hit` | 被攻擊後 | 戰厄「壕溝戰術」下次受傷-25%、詭獸「厚皮」受傷-15% |
| `on_hp_below` | HP 低於閥值 | 異變者「狂暴基因」HP<30% ATK+20%、倖存者「求生本能」HP<50% Speed+3 |
| `on_fatal` | 即將致死 | 女喪屍「殘存意志」1HP 存活 |
| `on_dodge` | 閃避成功 | 脫逃者「反擊姿態」閃避後下次攻擊+30% |
| `on_crit` | 暴擊觸發 | 童魘「弱食本能」暴擊吸血 8% |

### 觸發器架構

```typescript
type PassiveTrigger = 
  | 'battle_start' | 'turn_start' | 'before_attack' 
  | 'on_hit' | 'on_kill' | 'on_be_hit'
  | 'on_hp_below' | 'on_fatal' | 'on_dodge' | 'on_crit'

function checkPassives(
  trigger: PassiveTrigger,
  actor: BattleHero,
  context: BattleContext
): void {
  for (const passive of actor.activePassives) {
    if (passive.trigger === trigger && passive.condition(actor, context)) {
      passive.execute(actor, context)
    }
  }
}
```

---

## 七、目標選擇策略

### 現有策略：`TARGET_NORMAL`（不變）

優先順序：
1. **前排對位欄** → 2. **前排其他欄** → 3. **後排對位欄** → 4. **後排其他欄** → 5. **Fallback**

### v2.0 新增策略

| 策略 | 用途 | 說明 |
|------|------|------|
| `TARGET_NORMAL` | 普攻 | 既有：前排對位優先 |
| `TARGET_ALL_ENEMY` | AOE 大招 | 敵方全體存活角色 |
| `TARGET_RANDOM(n)` | 隨機 N 體 | 隨機選 N 個敵人（可重複） |
| `TARGET_FRONT_ROW` | 前排大招 | 敵方前排全體 |
| `TARGET_BACK_ROW` | 後排大招 | 敵方後排全體（前排無人時打前排） |
| `TARGET_LOWEST_HP_ALLY` | 單體治療 | HP% 最低的隊友 |
| `TARGET_ALL_ALLY` | 群體治療 | 我方全體存活角色 |
| `TARGET_SELF` | 自我 buff | 施術者自身 |

---

## 八、傷害計算（v2.0 — 替代舊版 ATK 直扣）

完整傷害公式見 `specs/damage-formula.md`。

### 在戰鬥迴圈中的呼叫

```typescript
// 普通攻擊
const result = calculateDamage(attacker, target, {
  scalingStat: 'ATK',
  multiplier: 1.0,
  targetType: 'single_enemy',
})

// 大招
const result = calculateDamage(attacker, target, activeSkill.effect)

// 治療
const healAmount = calculateHeal(healer, target, activeSkill.effect)
```

### 傷害飄字延伸（v2.0）

| 類型 | 顏色 | 字號 |
|------|------|------|
| 普通傷害 | 白色 | 標準 |
| 暴擊傷害 | 橙色 + 加大 + 感嘆號 | 1.5× |
| 治療 | 綠色 + 「+」 | 標準 |
| 暴擊治療 | 亮綠 + 加大 | 1.5× |
| DOT 傷害 | 紫色 | 較小 0.8× |
| MISS | 灰色 | 較小 0.8× |
| 護盾吸收 | 藍色 | 標準 |
| 弱點（屬性剋制） | 紅色 + 「弱點」 | 1.3× |

---

## 九、角色行動狀態機（不變 + v2.0 擴展）

```
IDLE → ADVANCING → ATTACKING → RETREATING → IDLE
                       ↓
                  目標: HURT → IDLE
                  目標: DEAD → 移除

v2.0 追加：
IDLE → ADVANCING → CASTING → RETREATING → IDLE    （大招）
                      ↓
                 多目標演出（連續 HURT / 治療飄字）
```

| ActorState | 說明 | 對應動畫 |
|------------|------|---------|
| `IDLE` | 待機 | IDLE（循環） |
| `ADVANCING` | 跑向目標 | RUN（循環） |
| `ATTACKING` | 播放攻擊動畫 | ATTACKING（單次） |
| `CASTING` | 播放大招動畫 | ATTACKING（單次，未來可用專屬動畫） |
| `HURT` | 受擊反應 | HURT（單次 → 自動回 IDLE） |
| `RETREATING` | 跑回原位 | RUN（循環） |
| `DEAD` | 死亡 | DEAD（單次，clamp 最後幀） |

---

## 十、3D 演出流程

### 普通攻擊演出（不變）

```
1. 攻擊者 ADVANCING（lerp 跑向目標前方 2.0 距離）
2. 攻擊者 ATTACKING（播放攻擊動畫）
3. delay(180ms) → 目標 HURT + 傷害數字 + 紅色閃光
4. 等待攻擊動畫完成
5. 攻擊者 RETREATING（lerp 跑回原位）
6. 攻擊者到達原位 → IDLE
```

### 大招演出（v2.0 新增）

```
1. 攝影機微震 + 螢幕邊緣閃光
2. 全螢幕技能名稱閃現（0.8 秒）
3. 根據 targetType：
   a. 單體：同普攻流程（跑過去 → 攻擊 → 回來）
   b. AOE：攻擊者原地施法 → 全體目標同時 HURT + 傷害數字
   c. 治療：攻擊者原地施法 → 隊友同時播綠色治療特效 + 治療數字
4. 大招結束 → 攻擊者回 IDLE
```

### 受擊閃光（不變）
- 時長：0.28 秒
- 效果：emissive 紅色 `(2.0, 0, 0)` + color tint 紅 50%
- 曲線：bell-curve

### 移動機制（不變）
- `useFrame` 的 `lerp` 逐幀插值
- 前進速率：`Math.min(0.12 × speed, 1)`
- 到達判定：距離 < 0.25

---

## 十一、速度控制（不變）

- x1 / x2 / x4 切換
- 影響：delay 時間 / `mixer.timeScale`

---

## 十二、介面契約

### 型別（v2.0 擴展）

```typescript
type GameState = 'PRE_BATTLE' | 'FETCHING' | 'IDLE' | 'BATTLE' | 'GAMEOVER'

type ActorState = 'IDLE' | 'ADVANCING' | 'ATTACKING' | 'CASTING' | 'HURT' | 'RETREATING' | 'DEAD'

type AnimationState = 'IDLE' | 'ATTACKING' | 'HURT' | 'DEAD' | 'RUN'

// 見 hero-schema.md 的 RawHeroData / SlotHero 定義

interface BattleHero extends SlotHero {
  side: 'player' | 'enemy'
  slot: number
  energy: number                    // v2.0: 能量值 0~1000
  finalStats: FinalStats            // v2.0: 結算後數值
  statusEffects: StatusEffect[]     // v2.0: 目前身上的 Buff/Debuff
  activePassives: SkillTemplate[]   // v2.0: 已啟用的被動技能（受星級限制）
  activeSkill: SkillTemplate | null // v2.0: 大招技能
  shields: Shield[]                 // v2.0: 護盾列表
}

interface BattleContext {
  turn: number
  attacker: BattleHero
  target: BattleHero | null
  targets: BattleHero[]
  damageDealt: number
  isKill: boolean
  isCrit: boolean
  allAllies: BattleHero[]
  allEnemies: BattleHero[]
}

interface DamagePopupData {
  id: number
  uid: string
  value: number
  type: 'normal' | 'crit' | 'heal' | 'crit_heal' | 'dot' | 'miss' | 'shield' | 'weakness'  // v2.0
}
```

---

## 十三、元件架構（v2.0 擴展）

```
App.tsx
├── Canvas (R3F)
│   ├── Arena — 場景
│   ├── SlotMarker × 12 — 格子標記
│   ├── Hero × N — 場上英雄
│   │   ├── ZombieModel — GLB + 骨骼動畫 + 受擊閃光
│   │   ├── HealthBar3D — 3D 血條
│   │   ├── EnergyBar3D — 能量條（v2.0）
│   │   ├── StatusIcons3D — Buff/Debuff 圖標列（v2.0）
│   │   ├── DamagePopup — 飄字（v2.0 擴展多顏色）
│   │   └── Billboard Text — 角色名稱
│   ├── DragPlane
│   └── ResponsiveCamera
├── HUD
├── ThumbnailList
├── SkillNameFlash — 大招名稱閃現（v2.0）
├── Battle Result Banner
├── Speed Button
└── TransitionOverlay
```

---

## 擴展點

- [ ] **手動操作模式**：玩家回合可手動選技能+目標
- [ ] **回合數上限**：超時判定機制（例如 30 回合強制結算）
- [ ] **戰鬥結算畫面**：經驗值、掉落物品、金幣
- [ ] **多段攻擊演出**：隨機 N 體的逐一演出或同時演出
- [ ] **友軍 AI**：自動選擇最佳技能目標（治療 → HP 最低隊友、AOE → 敵方密集排）
- [ ] **戰鬥回放**：記錄 seed + 行動序列，支援重播

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2026-02-26 | 從現有程式碼逆向整理 |
| v2.0 | 2026-02-26 | 新增能量系統、Buff/Debuff 系統（含 3D 圖標）、被動觸發點、大招演出流程、完整傷害公式引用、BattleHero 擴展型別、新增 CASTING 狀態 |
