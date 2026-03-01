# Buff/Debuff 3D 狀態圖示 Spec

> 版本：v1.2 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-02
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING → 🎨 UI_DESIGN
> 原始碼：`src/components/SceneWidgets.tsx`（`BuffIcons3D` / `BuffApplyToast3D`）、`src/components/Hero.tsx`、`src/App.tsx`

## 概述

戰鬥中，英雄身上的 Buff/Debuff 效果以 3D 圖示列（icon row）的形式顯示在**英雄模型上方**（名字下方）。Buff 使用**綠色底框**，Debuff 使用**紅色底框**。可疊層的效果額外顯示**當前層數**。

**v1.2 重大變更**：改用 `@react-three/drei` 的 `<Html>` 元件渲染 Buff Icon 和施加 Toast，
利用瀏覽器原生 emoji 顯示彩色圖示，不再受限於 troika-three-text 字型。

## 設計目標

1. 玩家一眼辨識場上每個角色身上的增益/減益狀態
2. 綠色 = 正面效果（Buff），紅色 = 負面效果（Debuff）
3. 可疊層效果顯示層數數字（stacks > 1 時才顯示）
4. 不遮蔽名字、血條、能量條
5. 效果消失時圖示即時移除

## 視覺規格

### 佈局

- **掛載位置**：Hero 3D group 內部，`position=[0, 3.2, 0]`（名字 3.5 下方、血條 3.0 上方之間）
- **渲染方式**：`<Html center distanceFactor={8}>` — DOM overlay 釘在 3D 座標上
- **排列方式**：CSS flexbox 水平排列，`gap: 2px`
- **居中對齊**：`Html center` 自動水平居中
- **最大顯示數**：8 個（超過時顯示前 7 個 + 灰色 `+N` 溢出計數卡片）

### 單一 Icon

| 屬性 | 值 |
|------|-----|
| 底框大小 | `22 × textScale` px 正方形 |
| 底框顏色 | Buff: `rgba(34,197,94,0.75)` 綠 ｜ Debuff: `rgba(239,68,68,0.75)` 紅 ｜ 溢出: `rgba(107,114,128,0.8)` 灰 |
| 底框圓角 | 3px |
| Icon 內容 | **原生彩色 emoji**（瀏覽器渲染，不需額外字型） |
| Icon 大小 | `size * 0.65`（size = 22 × textScale） |
| 層數文字 | `size * 0.45`，白色，text-shadow 黑色，右下角絕對定位 |

### 顏色分類

完整對應 `src/domain/types.ts` 的 `StatusType`：

**Buff（綠色底框）**：
`atk_up`, `def_up`, `spd_up`, `crit_rate_up`, `crit_dmg_up`, `dmg_reduce`, `shield`, `regen`, `energy_boost`, `dodge_up`, `reflect`, `taunt`, `immunity`

**Debuff（紅色底框）**：
`atk_down`, `def_down`, `spd_down`, `crit_rate_down`, `dot_burn`, `dot_poison`, `dot_bleed`, `stun`, `freeze`, `silence`, `fear`

### Icon 映射表（原生 emoji）

3D 場景和 2D HUD 現在**統一使用 emoji**（`<Html>` 元件讓瀏覽器原生渲染彩色 emoji）。

| StatusType | Emoji | 分類 |
|------------|-------|------|
| atk_up | ⚔️ | Buff |
| def_up | 🛡️ | Buff |
| spd_up | 💨 | Buff |
| crit_rate_up | 🎯 | Buff |
| crit_dmg_up | 💥 | Buff |
| dmg_reduce | 🔰 | Buff |
| shield | 🛡️ | Buff |
| regen | 💚 | Buff |
| energy_boost | ⚡ | Buff |
| dodge_up | 👻 | Buff |
| reflect | 🪞 | Buff |
| taunt | 😤 | Buff |
| immunity | ✨ | Buff |
| atk_down | ⚔️ | Debuff |
| def_down | 🛡️ | Debuff |
| spd_down | 🐌 | Debuff |
| crit_rate_down | 🎯 | Debuff |
| dot_burn | 🔥 | Debuff |
| dot_poison | ☠️ | Debuff |
| dot_bleed | 🩸 | Debuff |
| stun | 💫 | Debuff |
| freeze | 🧊 | Debuff |
| silence | 🤐 | Debuff |
| fear | 😱 | Debuff |

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

- `BuffIcons3D` 使用 `<Html>` DOM overlay（最多 8×12=96 個 DOM 元素），效能影響微小
- `BuffApplyToast3D` 使用 `<Html>` + `useFrame` 操作 DOM style (opacity, display)，無 React re-render 開銷
- `distanceFactor={8}` 讓 icon 大小隨相機距離自動縮放

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2026-03-01 | 初版：3D Buff/Debuff Icon 顯示於英雄模型上方 |
| v1.1 | 2026-03-01 | Emoji→中文短代號（troika 字型相容）；超過 8 個顯示 7+「+N」溢出卡片 |
| v1.2 | 2026-03-02 | **改用 `<Html>` DOM overlay**：中文短代號→原生彩色 emoji（瀏覽器渲染），BuffIcons3D 和 BuffApplyToast3D 都改為 Html 元件，無需額外字型下載 |
