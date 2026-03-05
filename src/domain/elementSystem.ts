/**
 * elementSystem — 屬性剋制倍率查詢
 *
 * 純函式模組，無副作用。
 * 對應 .ai/specs/element-system.md v0.1
 * 資料來源：Google Sheet `element_matrix`（可動態載入覆蓋）
 */

import type { Element } from './types'

// ─── 預設倍率矩陣（硬編碼 fallback，可被 Sheet 資料覆蓋） ──────

type ElementMatrix = Record<Element, Record<Element, number>>

const DEFAULT_MATRIX: ElementMatrix = {
  fire:    { fire: 0.9, water: 0.7, wind: 1.3, thunder: 1.0, earth: 1.0, light: 1.0, dark: 1.0 },
  water:   { fire: 1.3, water: 0.9, wind: 1.0, thunder: 0.7, earth: 1.0, light: 1.0, dark: 1.0 },
  wind:    { fire: 0.7, water: 1.0, wind: 0.9, thunder: 1.0, earth: 1.3, light: 1.0, dark: 1.0 },
  thunder: { fire: 1.0, water: 1.3, wind: 1.0, thunder: 0.9, earth: 0.7, light: 1.0, dark: 1.0 },
  earth:   { fire: 1.0, water: 1.0, wind: 0.7, thunder: 1.3, earth: 0.9, light: 1.0, dark: 1.0 },
  light:   { fire: 1.0, water: 1.0, wind: 1.0, thunder: 1.0, earth: 1.0, light: 0.9, dark: 1.3 },
  dark:    { fire: 1.0, water: 1.0, wind: 1.0, thunder: 1.0, earth: 1.0, light: 1.3, dark: 0.9 },
}

let matrix: ElementMatrix = DEFAULT_MATRIX

/**
 * 用 Google Sheet 資料覆蓋倍率矩陣
 * @param entries - element_matrix 表的每一行
 */
export function loadElementMatrix(entries: Array<{ attacker: string; defender: string; multiplier: number }>): void {
  const m: Record<string, Record<string, number>> = {}
  for (const { attacker, defender, multiplier } of entries) {
    if (!m[attacker]) m[attacker] = {}
    m[attacker][defender] = multiplier
  }
  matrix = m as ElementMatrix
}

/**
 * 查詢攻擊者 vs 防守者的屬性倍率
 * - 無屬性攻擊或防守 → 1.0
 * - 查不到 → 1.0
 */
export function getElementMultiplier(attacker: Element | '' | undefined, defender: Element | '' | undefined): number {
  if (!attacker || !defender) return 1.0
  return matrix[attacker]?.[defender] ?? 1.0
}

/**
 * 判斷是否為「弱點」（克制關係，倍率 > 1.0）
 */
export function isWeakness(attacker: Element | '', defender: Element | ''): boolean {
  if (!attacker || !defender) return false
  return getElementMultiplier(attacker, defender) > 1.0
}

/**
 * 判斷是否為「抵抗」（被剋制，倍率 < 1.0 且不是同屬）
 */
export function isResist(attacker: Element | '', defender: Element | ''): boolean {
  if (!attacker || !defender) return false
  const mult = getElementMultiplier(attacker, defender)
  return mult < 1.0 && attacker !== defender
}
