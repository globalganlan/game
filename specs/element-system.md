# 屬性剋制系統 Spec

> 版本：v0.1 ｜ 狀態：🟡 草案
> 最後更新：2026-02-26
> 負責角色：🎯 GAME_DESIGN → 🔧 CODING

## 概述

定義元素屬性的種類、相剋關係與傷害倍率，影響戰鬥策略的核心系統。

## 依賴

- 無外部依賴（此為底層系統）

## 介面契約

```typescript
type Element = 'fire' | 'water' | 'wind' | 'thunder' | 'earth' | 'light' | 'dark';

interface ElementSystem {
  getMultiplier(attacker: Element, defender: Element): number;
  getAdvantaged(element: Element): Element;   // 我剋誰
  getDisadvantaged(element: Element): Element; // 誰剋我
}
```

## 詳細規格

### 剋制環
```
fire → wind → earth → thunder → water → fire
         （五元素循環剋制）

light ⇔ dark
    （互相剋制）
```

### 傷害倍率表

| 關係 | 倍率 |
|------|------|
| 剋制（我打弱點） | ×1.3（+30%） |
| 被剋（我打鋼板） | ×0.7（-30%） |
| 無關 | ×1.0 |
| 光⇔暗（互剋） | ×1.3（雙方都吃加成） |
| 同屬性 | ×0.9（-10%，些微抗性） |

### 完整倍率矩陣

| 攻↓ 守→ | Fire | Water | Wind | Thunder | Earth | Light | Dark |
|----------|------|-------|------|---------|-------|-------|------|
| **Fire** | 0.9 | 0.7 | 1.3 | 1.0 | 1.0 | 1.0 | 1.0 |
| **Water** | 1.3 | 0.9 | 1.0 | 0.7 | 1.0 | 1.0 | 1.0 |
| **Wind** | 0.7 | 1.0 | 0.9 | 1.0 | 1.3 | 1.0 | 1.0 |
| **Thunder** | 1.0 | 1.3 | 1.0 | 0.9 | 0.7 | 1.0 | 1.0 |
| **Earth** | 1.0 | 1.0 | 0.7 | 1.3 | 0.9 | 1.0 | 1.0 |
| **Light** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0.9 | 1.3 |
| **Dark** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.3 | 0.9 |

### 程式實作建議

```typescript
const ELEMENT_ADVANTAGE: Record<Element, Element> = {
  fire: 'wind', wind: 'earth', earth: 'thunder',
  thunder: 'water', water: 'fire',
  light: 'dark', dark: 'light'
};

function getElementMultiplier(atk: Element, def: Element): number {
  if (atk === def) return 0.9;
  if (ELEMENT_ADVANTAGE[atk] === def) return 1.3;
  if (ELEMENT_ADVANTAGE[def] === atk) return 0.7;
  return 1.0;
}
```

## 擴展點

- [ ] **雙屬性角色**：覺醒後獲得第二屬性
- [ ] **屬性共鳴**：同隊 3 個同屬性角色觸發隊伍 buff
- [ ] **環境屬性**：特定關卡增強某屬性（如火山關卡 fire +15%）
- [ ] **無屬性**：BOSS 專用，不受任何剋制

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-02-26 | 初版草案：7 元素循環、倍率矩陣、實作建議 |
