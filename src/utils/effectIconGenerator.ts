/**
 * effectIconGenerator — 效果 / 技能圖標生成器
 *
 * 使用 Canvas API 動態生成圖標。
 * - getCategoryEmoji / getCategoryColor：效果分類 emoji 與色彩
 * - generateSkillIcon：技能圖標（64×64 圓角方塊 + 漸層底 + emoji）
 */

import type { EffectCategory } from '../domain/types'

const ICON_SIZE = 48
const SKILL_ICON_SIZE = 64
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

/** 技能圖標配色方案 */
const SKILL_ICON_THEMES: Record<string, [string, string, string]> = {
  // [漸層起點, 漸層終點, 邊框色]
  fire:    ['#e65100', '#b71c1c', '#ff8a65'],
  ice:     ['#0277bd', '#1a237e', '#4fc3f7'],
  poison:  ['#2e7d32', '#1b5e20', '#66bb6a'],
  shadow:  ['#4a148c', '#1a0033', '#ab47bc'],
  blood:   ['#b71c1c', '#4a0000', '#ef5350'],
  holy:    ['#f9a825', '#e65100', '#ffee58'],
  nature:  ['#33691e', '#1b5e20', '#8bc34a'],
  arcane:  ['#6a1b9a', '#311b92', '#ce93d8'],
  steel:   ['#546e7a', '#263238', '#90a4ae'],
  wind:    ['#00838f', '#004d40', '#4dd0e1'],
  death:   ['#37474f', '#1a1a2e', '#78909c'],
  light:   ['#fbc02d', '#ff6f00', '#fff176'],
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
  if (typeof document === 'undefined') return ''

  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE
  canvas.height = ICON_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.damage

  ctx.beginPath()
  ctx.arc(ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = cfg.bgColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.font = `${ICON_SIZE * 0.5}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(cfg.emoji, ICON_SIZE / 2, ICON_SIZE / 2 + 2)

  const dataUrl = canvas.toDataURL('image/png')
  cache.set(category, dataUrl)
  return dataUrl
}

/**
 * 生成技能級圖標（64×64 圓角方塊 + 雙層漸層 + 金/銀邊框 + emoji）
 * @param emoji  技能 emoji（如 🔥 💀 🩸）
 * @param theme  配色主題 key（fire / ice / poison / shadow / ...）
 * @param isActive  是否為主動技（金框）或被動技（銀框）
 */
export function generateSkillIcon(
  emoji: string,
  theme: string = 'steel',
  isActive: boolean = false,
): string {
  const key = `skill_${emoji}_${theme}_${isActive}`
  if (cache.has(key)) return cache.get(key)!
  if (typeof document === 'undefined') return ''

  const S = SKILL_ICON_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const [c1, c2, border] = SKILL_ICON_THEMES[theme] || SKILL_ICON_THEMES.steel
  const R = 10 // corner radius

  // — 圓角路徑
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  // 1. 外框（金/銀邊）
  const borderW = isActive ? 3 : 2
  roundRect(0, 0, S, S, R)
  ctx.fillStyle = isActive ? '#ffd54f' : '#90a4ae'
  ctx.fill()

  // 2. 內背景漸層
  roundRect(borderW, borderW, S - borderW * 2, S - borderW * 2, R - 1)
  const grad = ctx.createLinearGradient(0, 0, S, S)
  grad.addColorStop(0, c1)
  grad.addColorStop(1, c2)
  ctx.fillStyle = grad
  ctx.fill()

  // 3. 徑向光暈（中心高光）
  const radial = ctx.createRadialGradient(S * 0.4, S * 0.35, 0, S / 2, S / 2, S * 0.55)
  radial.addColorStop(0, 'rgba(255,255,255,0.25)')
  radial.addColorStop(1, 'rgba(0,0,0,0)')
  roundRect(borderW, borderW, S - borderW * 2, S - borderW * 2, R - 1)
  ctx.fillStyle = radial
  ctx.fill()

  // 4. 底部暗角
  const bottomGrad = ctx.createLinearGradient(0, S * 0.6, 0, S)
  bottomGrad.addColorStop(0, 'rgba(0,0,0,0)')
  bottomGrad.addColorStop(1, 'rgba(0,0,0,0.35)')
  roundRect(borderW, borderW, S - borderW * 2, S - borderW * 2, R - 1)
  ctx.fillStyle = bottomGrad
  ctx.fill()

  // 5. 頂部光線
  roundRect(borderW, borderW, S - borderW * 2, (S - borderW * 2) * 0.45, R - 1)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fill()

  // 6. 邊框內光
  roundRect(borderW + 1, borderW + 1, S - borderW * 2 - 2, S - borderW * 2 - 2, R - 2)
  ctx.strokeStyle = `${border}55`
  ctx.lineWidth = 1
  ctx.stroke()

  // 7. Emoji
  ctx.font = `${S * 0.5}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 陰影
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#fff'
  ctx.fillText(emoji, S / 2, S / 2 + 1)
  ctx.shadowColor = 'transparent'

  // 8. 主動技額外金色角標
  if (isActive) {
    ctx.fillStyle = '#ffd54f'
    ctx.beginPath()
    ctx.moveTo(S - 14, 0)
    ctx.lineTo(S, 0)
    ctx.lineTo(S, 14)
    ctx.closePath()
    ctx.fill()
  }

  const dataUrl = canvas.toDataURL('image/png')
  cache.set(key, dataUrl)
  return dataUrl
}
