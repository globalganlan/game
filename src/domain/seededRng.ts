/**
 * seededRng — 種子式偽隨機數產生器 (Mulberry32)
 *
 * 用於確定性戰鬥：前端與 Workers 使用相同種子 → 可重現的戰鬥結果。
 * 演算法：Mulberry32（32-bit state, 週期 2^32）
 */

/**
 * 建立 Mulberry32 偽隨機數產生器
 * @param seed - 32-bit 整數種子
 * @returns 回傳 [0, 1) 的浮點數（與 Math.random() 介面相同）
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 產生一個 32-bit 隨機種子（用於初始化 seeded RNG）
 */
export function generateBattleSeed(): number {
  return (Math.random() * 0xFFFFFFFF) >>> 0
}
