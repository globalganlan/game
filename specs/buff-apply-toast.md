# Buff/Debuff 施加漂浮文字 Spec

> 版本：v1.1 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/components/SceneWidgets.tsx`（`BuffApplyToast3D`）、`src/App.tsx`

## 概述

當英雄被施加 Buff、Debuff 或 DOT 效果時，在**被施加者模型上方**顯示一條漂浮文字提示，類似被動技能觸發的 `PassiveHint3D`，讓玩家清楚知道哪個效果剛被施加。

## 設計目標

1. 立即告知玩家哪個角色剛獲得/被施加了什麼狀態效果
2. Buff 用**綠色**文字，Debuff 用**紅色**文字，與 3D Icon 底框顏色呼應
3. 自動上浮淡出，不阻塞戰鬥節奏（與 PassiveHint3D 行為一致）
4. DOT 施加（dot_burn/dot_poison/dot_bleed）同樣觸發，格式：`🔥 灼燒`

## 視覺規格

### 文字格式

```
{中文短代號} {中文狀態名}
```

範例：
- `攻↑ 攻擊提升` （atk_up, Buff，綠色）
- `焚 炙燒` （dot_burn, Debuff，紅色）
- `暈 暈眩` （stun, Debuff，紅色）

### 動畫行為

| 屬性 | 值 |
|------|-----|
| 初始位置 | `[0, 0.8, 0]`（Hero 局部座標，被動觸發 1.0 下方，避免重疊） |
| 上浮速度 | `0.15 / s` |
| 前期靜止 | 前 `0.3s` 不透明度保持 1.0 |
| 淡出速率 | `0.7 / s`（≈ 1.7s 完全消失） |
| 進場動畫 | 微彈（0.05s 放大 1.1x → 0.1s 縮回 1.0x） |
| `renderOrder` | 27（低於 ElementHint 的 28） |

### 文字樣式

| 屬性 | Buff | Debuff |
|------|------|--------|
| 文字顏色 | `#4ade80`（亮綠） | `#f87171`（亮紅） |
| 描邊顏色 | `#064e3b`（深綠） | `#7f1d1d`（深紅） |
| 描邊寬度 | `0.04` | `0.04` |
| 字型大小 | `0.34 × textScale` | `0.34 × textScale` |

## 中文狀態名映射

```typescript
const STATUS_LABELS: Record<StatusType, string> = {
  atk_up:        '攻擊提升',
  def_up:        '防禦提升',
  spd_up:        '速度提升',
  crit_rate_up:  '暴擊率提升',
  crit_dmg_up:   '暴擊傷害提升',
  dmg_reduce:    '減傷',
  shield:        '護盾',
  regen:         '再生',
  energy_boost:  '能量提升',
  dodge_up:      '閃避提升',
  reflect:       '反彈',
  taunt:         '嘲諷',
  immunity:      '免疫',
  atk_down:      '攻擊下降',
  def_down:      '防禦下降',
  spd_down:      '速度下降',
  crit_rate_down:'暴擊率下降',
  dot_burn:      '灼燒',
  dot_poison:    '中毒',
  dot_bleed:     '流血',
  stun:          '暈眩',
  freeze:        '凍結',
  silence:       '沉默',
  fear:          '恐懼',
  cleanse:       '淨化',
}
```

## 資料流

```
battleEngine → BUFF_APPLY action { targetUid, effect }
  → App.tsx onAction('BUFF_APPLY')
  → 1. 更新 battleBuffs（已有邏輯）
  → 2. 新增 buffApplyHint 到 state（新增）
  → Hero props: buffApplyHints={buffApplyHints.filter(h => h.heroUid === uid)}
  → Hero 內部渲染 <BuffApplyToast3D ... />
  → setTimeout 2s 自動清除
```

## 元件介面

```typescript
// BattleHUD.tsx (型別)
export interface BuffApplyHint {
  id: number
  effectType: StatusType
  isBuff: boolean
  timestamp: number
  heroUid: string
}

// SceneWidgets.tsx
interface BuffApplyToast3DProps {
  effectType: StatusType
  isBuff: boolean
  position: Vector3Tuple
  textScale?: number
}

export function BuffApplyToast3D(props: BuffApplyToast3DProps): JSX.Element | null
```

## 觸發時機

| Action | 是否觸發 | 備註 |
|--------|----------|------|
| BUFF_APPLY | ✅ | 所有 Buff/Debuff/DOT 施加時 |
| BUFF_EXPIRE | ❌ | 到期消失不顯示文字 |
| DOT_TICK | ❌ | DOT 結算顯示傷害數字（已有） |

## 效能考量

- 與 PassiveHint3D 完全相同的生命週期管理（setTimeout 2s 移除）
- 每個 toast 為獨立 `Billboard` + `Text`，數量有限

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2026-03-01 | 初版：Buff/Debuff 施加漂浮文字（含 DOT 中文名稱） |
| v1.1 | 2026-03-01 | Emoji→中文短代號（troika-three-text 字型相容） |
