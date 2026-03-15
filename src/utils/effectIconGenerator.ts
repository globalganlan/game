/**
 * effectIconGenerator — 效果圖標生成器
 *
 * 使用 Canvas API 動態生成 category 級圖標。
 * 對應 .ai/specs/effect-system.md v2.4 效果 UI 圖標
 */

import type { EffectCategory } from '../domain/types'

const ICON_SIZE = 48
const cache = new Map<string, string>()

const CATEGORY_CONFIG: Record<EffectCategory, { emoji: string; bgColor: string }> = {
  damage:          { emoji: '⚔️', bgColor: '#dc2626' },
  dot:             { emoji: '🔥', bgColor: '#ea580c' },
  heal:            { emoji: '💚', bgColor: '#16a34a' },
  buff:            { emoji: '⬆️', bgColor: '#16a34a' },
  debuff:          { emoji: '⬇️', bgColor: '#dc2626' },
  cc:              { emoji: '💫', bgColor: '#9333ea' },
  shield:          { emoji: '🛡️', bgColor: '#ca8a04' },
  energy:          { emoji: '⚡', bgColor: '#2563eb' },
  extra_turn:      { emoji: '🔄', bgColor: '#2563eb' },
  counter_attack:  { emoji: '↩️', bgColor: '#ea580c' },
  chase_attack:    { emoji: '⚡', bgColor: '#0891b2' },
  revive:          { emoji: '💖', bgColor: '#ec4899' },
  dispel_debuff:   { emoji: '✨', bgColor: '#e5e7eb' },
  dispel_buff:     { emoji: '🚫', bgColor: '#6b7280' },
  reflect:         { emoji: '🔃', bgColor: '#9ca3af' },
  steal_buff:      { emoji: '🖐️', bgColor: '#9333ea' },
  transfer_debuff: { emoji: '➡️', bgColor: '#991b1b' },
  execute:         { emoji: '💀', bgColor: '#450a0a' },
  modify_target:   { emoji: '🎯', bgColor: '#7c3aed' },
}

/**
 * 取得 category 對應的 emoji 圖標
 */
export function getCategoryEmoji(category: EffectCategory): string {
  return CATEGORY_CONFIG[category]?.emoji ?? '❓'
}

/**
 * 取得 category 對應的背景色
 */
export function getCategoryColor(category: EffectCategory): string {
  return CATEGORY_CONFIG[category]?.bgColor ?? '#6b7280'
}

/**
 * 生成 category 級圖標（Canvas data URL）
 * 快取避免重繪
 */
export function generateEffectIcon(category: EffectCategory): string {
  if (cache.has(category)) return cache.get(category)!

  // SSR / Worker 環境無 document
  if (typeof document === 'undefined') return ''

  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE
  canvas.height = ICON_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.damage

  // 圓形底色
  ctx.beginPath()
  ctx.arc(ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = cfg.bgColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Emoji
  ctx.font = `${ICON_SIZE * 0.5}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(cfg.emoji, ICON_SIZE / 2, ICON_SIZE / 2 + 2)

  const dataUrl = canvas.toDataURL('image/png')
  cache.set(category, dataUrl)
  return dataUrl
}
