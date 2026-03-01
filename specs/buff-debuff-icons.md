# Buff/Debuff 3D 狀態圖示 Spec

> 版本：v1.1 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING → 🎨 UI_DESIGN
> 原始碼：`src/components/SceneWidgets.tsx`（`BuffIcons3D`）、`src/components/Hero.tsx`、`src/App.tsx`

## 概述

戰鬥中，英雄身上的 Buff/Debuff 效果以 3D 圖示列（icon row）的形式顯示在**英雄模型上方**（名字下方）。Buff 使用**綠色底框**，Debuff 使用**紅色底框**。可疊層的效果額外顯示**當前層數**。

## 設計目標

1. 玩家一眼辨識場上每個角色身上的增益/減益狀態
2. 綠色 = 正面效果（Buff），紅色 = 負面效果（Debuff）
3. 可疊層效果顯示層數數字（stacks > 1 時才顯示）
4. 不遮蔽名字、血條、能量條
5. 效果消失時圖示即時移除

## 視覺規格

### 佈局

- **掛載位置**：Hero 3D group 內部，`position=[0, 3.2, 0]`（名字 3.5 下方、血條 3.0 上方之間）
- **排列方式**：水平排列（Billboard），每個 icon 佔 `0.35 × textScale` 寬
- **居中對齊**：icon 列整體水平居中
- **最大顯示數**：8 個（超過時顯示前 7 個 + 灰色 `+N` 溢出計數卡片）

### 單一 Icon

| 屬性 | 值 |
|------|-----|
| 底框大小 | `0.28 × textScale` 正方形（RoundedRect，圓角 0.04） |
| 底框顏色 | Buff: `#22c55e`（綠色 60% 透明）｜ Debuff: `#ef4444`（紅色 60% 透明）｜ 溢出: `#6b7280`（灰色 70% 透明） |
| 文字內容 | 中文短代號（如「攻↑」「毒」「焚」），用 NotoSansSC 字型渲染（不用 emoji，因 troika-three-text 不支援） |
| 文字大小 | `fontSize: 0.11 × textScale` |
| 層數文字 | `fontSize: 0.1 × textScale`，白色，描邊黑色，右下角偏移 |
| 渲染順序 | `renderOrder: 16`（在名字 renderOrder 15 之上） |

### 顏色分類

完整對應 `src/domain/types.ts` 的 `StatusType`：

**Buff（綠色底框）**：
`atk_up`, `def_up`, `spd_up`, `crit_rate_up`, `crit_dmg_up`, `dmg_reduce`, `shield`, `regen`, `energy_boost`, `dodge_up`, `reflect`, `taunt`, `immunity`

**Debuff（紅色底框）**：
`atk_down`, `def_down`, `spd_down`, `crit_rate_down`, `dot_burn`, `dot_poison`, `dot_bleed`, `stun`, `freeze`, `silence`, `fear`

### Icon 映射表（中文短代號）

3D 場景用 `STATUS_ICONS_3D`（中文短代號，保證 troika-three-text 可渲染）；
2D HUD 用 `STATUS_ICONS`（emoji，HTML 原生渲染無問題）。

| StatusType | 3D 短代號 | 分類 |
|------------|----------|------|
| atk_up | 攻↑ | Buff |
| def_up | 防↑ | Buff |
| spd_up | 速↑ | Buff |
| crit_rate_up | 暴↑ | Buff |
| crit_dmg_up | 爆↑ | Buff |
| dmg_reduce | 減傷 | Buff |
| shield | 盾 | Buff |
| regen | 回血 | Buff |
| energy_boost | 氣↑ | Buff |
| dodge_up | 閃↑ | Buff |
| reflect | 彈 | Buff |
| taunt | 嘲諷 | Buff |
| immunity | 免疫 | Buff |
| atk_down | 攻↓ | Debuff |
| def_down | 防↓ | Debuff |
| spd_down | 速↓ | Debuff |
| crit_rate_down | 暴↓ | Debuff |
| dot_burn | 焚 | Debuff |
| dot_poison | 毒 | Debuff |
| dot_bleed | 血 | Debuff |
| stun | 暈 | Debuff |
| freeze | 凍 | Debuff |
| silence | 默 | Debuff |
| fear | 懼 | Debuff |

## 資料流

```
battleEngine → BUFF_APPLY / BUFF_EXPIRE action
  → App.tsx setBattleBuffs() 更新 BattleBuffMap
  → Hero props: battleBuffs={battleBuffs[uid] || []}
  → Hero 內部渲染 <BuffIcons3D effects={battleBuffs} textScale={textScale} />
```

## 元件介面

```typescript
// SceneWidgets.tsx
interface BuffIcons3DProps {
  effects: StatusEffect[]
  textScale?: number
}

export function BuffIcons3D({ effects, textScale = 1 }: BuffIcons3DProps): JSX.Element | null
```

## 疊層顯示規則

- `stacks === 1`：只顯示 icon，不顯示數字
- `stacks > 1`：在 icon 右下角顯示白色數字（如 `×3`）
- `stacks` 值來自 `StatusEffect.stacks`

## 效能考量

- 每個 Icon 使用 `Billboard` + `Text`（drei），數量有限（最多 8×12=96 個），效能影響微小
- `useMemo` 計算 icon 佈局位置，避免每幀重算

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2026-03-01 | 初版：3D Buff/Debuff Icon 顯示於英雄模型上方 |
| v1.1 | 2026-03-01 | Emoji→中文短代號（troika 字型相容）；超過 8 個顯示 7+「+N」溢出卡片 |
