# 屬性系統 Spec

> 版本：v1.1 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-01
> 最後更新：2025-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING
> 原始碼：`src/domain/elementSystem.ts`（核心）、`src/services/dataService.ts`（中英對照 + 載入）

## 概述

7 屬性剋制系統。每位英雄和技能可擁有一種屬性，
攻擊時依屬性剋制矩陣乘算傷害倍率。
矩陣可從 Google Sheets `element_matrix` 表動態載入，也內建預設 fallback。

## 依賴

- `specs/damage-formula.md` §1 步驟 4 → 屬性倍率在傷害公式中的套用位置
- Google Sheets `element_matrix` 表（49 行 = 7×7）

---

## 一、7 屬性定義 

```typescript
// src/domain/types.ts
type Element = 'fire' | 'water' | 'wind' | 'thunder' | 'earth' | 'light' | 'dark'
```

### 中文 → 英文對照

```typescript
// src/services/dataService.ts
const ELEMENT_ZH_TO_EN: Record<string, Element> = {
  '火': 'fire',
  '冰': 'water',    // 冰元素 → water
  '水': 'water',
  '雷': 'thunder',
  '闇': 'dark',
  '暗': 'dark',
  '光': 'light',
  '毒': 'wind',     // 毒元素 → wind（遊戲設定）
  '風': 'wind',
  '地': 'earth',
  '土': 'earth',
}
```

> **重要設計決策**：
> - `冰` = `water`：冰被視為水系的表現形式
> - `毒` = `wind`：毒被歸類為風系（遊戲世界觀設定）
> - `闇` / `暗` 皆對應 `dark`（相容兩種寫法）
> - `地` / `土` 皆對應 `earth`

### 轉換函式

```typescript
// src/services/dataService.ts
export function toElement(raw: string | undefined | null): Element | '' {
  if (!raw) return ''
  const trimmed = raw.trim().toLowerCase()
  // 已經是英文
  const validEn: Element[] = ['fire', 'water', 'wind', 'thunder', 'earth', 'light', 'dark']
  if (validEn.includes(trimmed as Element)) return trimmed as Element
  // 中文轉換
  return ELEMENT_ZH_TO_EN[raw.trim()] ?? ''
}
```

---

## 二、剋制矩陣 

### 預設矩陣（硬編碼 fallback）

| 攻 守 | fire | water | wind | thunder | earth | light | dark |
|---------|------|-------|------|---------|-------|-------|------|
| **fire** | 0.9 | 0.7 | 1.3 | 1.0 | 1.0 | 1.0 | 1.0 |
| **water** | 1.3 | 0.9 | 1.0 | 0.7 | 1.0 | 1.0 | 1.0 |
| **wind** | 0.7 | 1.0 | 0.9 | 1.0 | 1.3 | 1.0 | 1.0 |
| **thunder** | 1.0 | 1.3 | 1.0 | 0.9 | 0.7 | 1.0 | 1.0 |
| **earth** | 1.0 | 1.0 | 0.7 | 1.3 | 0.9 | 1.0 | 1.0 |
| **light** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0.9 | 1.3 |
| **dark** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.3 | 0.9 |

### 剋制規則

| 倍率 | 意義 | 飄字顯示 |
|------|------|---------|
| 1.3 | 剋制（弱點） | 紅色「弱點」 |
| 1.0 | 中性 | 無特殊 |
| 0.9 | 同屬減傷 | 無特殊 |
| 0.7 | 抵抗 | 無特殊（可考慮加「抵抗」標記） |

### 剋制鏈

```
火 → 風 → 地 → 雷 → 水 → 火    （五行循環）
光 ↔ 闇                          （互剋）
```

---

## 三、動態載入 

### Google Sheet: element_matrix

| 欄位 | 型別 | 說明 |
|------|------|------|
| attacker | string | 攻擊方屬性（英文） |
| defender | string | 防守方屬性（英文） |
| multiplier | number | 倍率 |

共 49 行（7×7 完整矩陣）。

### 載入函式

```typescript
// src/domain/elementSystem.ts
export function loadElementMatrix(
  entries: Array<{ attacker: string; defender: string; multiplier: number }>
): void {
  const m: Record<string, Record<string, number>> = {}
  for (const { attacker, defender, multiplier } of entries) {
    if (!m[attacker]) m[attacker] = {}
    m[attacker][defender] = multiplier
  }
  matrix = m as ElementMatrix
}
```

此函式在 `dataService.ts` `loadElements()` 中被呼叫：

```typescript
export async function loadElements(): Promise<void> {
  const rows = await readSheet<RawElementRow>('element_matrix')
  const entries = rows.map(r => ({
    attacker: r.attacker as Element,
    defender: r.defender as Element,
    multiplier: Number(r.multiplier),
  }))
  loadElementMatrix(entries)
}
```

---

## 四、查詢 API 

```typescript
// 取得倍率
getElementMultiplier(attacker: Element | '' | undefined, defender: Element | '' | undefined): number
// 無屬性 → 1.0、查不到  1.0

// 是否為弱點（剋制）
isWeakness(attacker: Element | '', defender: Element | ''): boolean
// multiplier > 1.0

// 是否為抵抗（被剋）
isResist(attacker: Element | '', defender: Element | ''): boolean
// multiplier < 1.0 且 attacker !== defender
```

---

## 五、在傷害公式中的位置

```
步驟 4（共 10 步）：
  DMG = 基礎傷害 × DEF減傷 × 暴擊 × 【屬性倍率】 × 浮動 × Buff修正
```

---

## 擴展點

- [ ] 屬性加傷 buff（如「火屬性傷害 +20%」）
- [ ] 屬性抗性（如「水屬性抗性 +30%」降低受到的水系傷害）
- [ ] 雙屬性角色
- [ ] 飄字顯示「抵抗」標記
- [ ] 矩陣動態調整 UI（管理後台）

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2025-02-26 | 草案：基礎 7 屬性設計 |
| v1.0 | 2025-02-26 | **已實作**：完整矩陣 + Sheets 動態載入 + 中英對照 + 3 個查詢 API |
| v1.1 | 2026-03-01 | Spec 同步：`getElementMultiplier` 參數型別新增 `undefined` 支援 |
