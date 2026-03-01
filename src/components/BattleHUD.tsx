/**
 * BattleHUD — 戰鬥增強 HUD
 *
 * Phase 7：在戰鬥中顯示：
 *  - 每位英雄的 Buff/Debuff 圖示
 *  - 能量條
 *  - 技能發動名稱彈幕
 *  - 屬性相剋指示
 */

import { useState, useEffect, useRef } from 'react'
import type { StatusEffect, StatusType, Element } from '../domain/types'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface BattleBuffMap {
  [uid: string]: StatusEffect[]
}

export interface BattleEnergyMap {
  [uid: string]: { current: number; max: number }
}

export interface SkillToast {
  id: number
  heroName: string
  skillName: string
  timestamp: number
  attackerUid: string
}

export interface ElementHint {
  id: number
  text: string
  color: string
  timestamp: number
  attackerUid: string
}

export interface PassiveHint {
  id: number
  skillName: string
  timestamp: number
  heroUid: string
}

export interface BuffApplyHint {
  id: number
  effectType: StatusType
  isBuff: boolean
  timestamp: number
  heroUid: string
}

/* ════════════════════════════════════
   Buff / Debuff 圖示對應
   ════════════════════════════════════ */

const STATUS_ICONS: Partial<Record<StatusType, { icon: string; color: string; isBuff: boolean }>> = {
  atk_up:       { icon: '⚔️', color: '#e63946', isBuff: true },
  def_up:       { icon: '🛡️', color: '#457b9d', isBuff: true },
  spd_up:       { icon: '💨', color: '#2a9d8f', isBuff: true },
  crit_rate_up: { icon: '🎯', color: '#e9c46a', isBuff: true },
  crit_dmg_up:  { icon: '💥', color: '#f4a261', isBuff: true },
  dmg_reduce:   { icon: '🔰', color: '#4dabf7', isBuff: true },
  shield:       { icon: '🛡️', color: '#ffd43b', isBuff: true },
  regen:        { icon: '💚', color: '#2a9d8f', isBuff: true },
  energy_boost: { icon: '⚡', color: '#ffd43b', isBuff: true },
  dodge_up:     { icon: '👻', color: '#aaa',    isBuff: true },
  reflect:      { icon: '🪞', color: '#be4bdb', isBuff: true },
  taunt:        { icon: '😤', color: '#e63946', isBuff: true },
  immunity:     { icon: '✨', color: '#ffd43b', isBuff: true },
  atk_down:     { icon: '⚔️', color: '#999',    isBuff: false },
  def_down:     { icon: '🛡️', color: '#999',    isBuff: false },
  spd_down:     { icon: '🐌', color: '#999',    isBuff: false },
  crit_rate_down: { icon: '🎯', color: '#999',  isBuff: false },
  dot_burn:     { icon: '🔥', color: '#e63946', isBuff: false },
  dot_poison:   { icon: '☠️', color: '#2a9d8f', isBuff: false },
  dot_bleed:    { icon: '🩸', color: '#c1121f', isBuff: false },
  stun:         { icon: '💫', color: '#ffd43b', isBuff: false },
  freeze:       { icon: '🧊', color: '#4dabf7', isBuff: false },
  silence:      { icon: '🤐', color: '#be4bdb', isBuff: false },
  fear:         { icon: '😱', color: '#333',    isBuff: false },
}

/* ════════════════════════════════════
   屬性相剋
   ════════════════════════════════════ */

const ELEMENT_COLORS: Record<Element, string> = {
  fire:    '#e63946',
  water:   '#4dabf7',
  wind:    '#2a9d8f',
  thunder: '#ffd43b',
  earth:   '#a0522d',
  light:   '#fff',
  dark:    '#6c5ce7',
}

/* ════════════════════════════════════
   Props
   ════════════════════════════════════ */

interface BattleHUDProps {
  /** 是否顯示（僅在 BATTLE 狀態） */
  visible: boolean
  /** 玩家英雄資訊 */
  playerHeroes: Array<{
    uid: string
    name: string
    currentHP: number
    maxHP: number
    element?: Element | ''
  }>
  /** 敵方英雄資訊 */
  enemyHeroes: Array<{
    uid: string
    name: string
    currentHP: number
    maxHP: number
    element?: Element | ''
  }>
  /** 各英雄身上的 Buff/Debuff */
  buffMap: BattleBuffMap
  /** 各英雄的能量狀態 */
  energyMap: BattleEnergyMap
  /** 技能發動通知佇列 */
  skillToasts: SkillToast[]
  /** 屬性相剋提示 */
  elementHints: ElementHint[]
}

/* ════════════════════════════════════
   Sub-components
   ════════════════════════════════════ */

function BuffBar({ effects }: { effects: StatusEffect[] }) {
  if (!effects || effects.length === 0) return null

  return (
    <div className="bhud-buffs">
      {effects.slice(0, 8).map((eff, i) => {
        const cfg = STATUS_ICONS[eff.type]
        if (!cfg) return null
        return (
          <span
            key={`${eff.type}-${i}`}
            className={`bhud-buff-icon ${cfg.isBuff ? 'bhud-buff' : 'bhud-debuff'}`}
            title={`${eff.type} (${eff.duration}t)`}
            style={{ '--buff-color': cfg.color } as React.CSSProperties}
          >
            {cfg.icon}
            {eff.stacks > 1 && <span className="bhud-buff-stacks">{eff.stacks}</span>}
          </span>
        )
      })}
    </div>
  )
}

function EnergyBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0
  const isFull = current >= max

  return (
    <div className="bhud-energy">
      <div className="bhud-energy-bar">
        <div
          className={`bhud-energy-fill ${isFull ? 'bhud-energy-full' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="bhud-energy-text">{Math.floor(current)}/{max}</span>
    </div>
  )
}

function HeroPanel({
  hero,
  buffs,
  energy,
}: {
  hero: BattleHUDProps['playerHeroes'][number]
  buffs: StatusEffect[]
  energy: { current: number; max: number } | undefined
}) {
  const hpPct = hero.maxHP > 0 ? Math.min(100, (hero.currentHP / hero.maxHP) * 100) : 0
  const hpColor = hpPct > 50 ? '#2a9d8f' : hpPct > 25 ? '#e9c46a' : '#e63946'

  return (
    <div className="bhud-hero-panel">
      {/* Portrait */}
      <div className="bhud-portrait">
        <span className="bhud-portrait-char">{hero.name.charAt(0)}</span>
        {hero.element && (
          <span
            className="bhud-element-dot"
            style={{ background: ELEMENT_COLORS[hero.element] || '#888' }}
          />
        )}
      </div>

      {/* Info */}
      <div className="bhud-info">
        <span className="bhud-hero-name">{hero.name}</span>

        {/* HP bar */}
        <div className="bhud-hp-bar">
          <div className="bhud-hp-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>

        {/* Energy bar */}
        {energy && <EnergyBar current={energy.current} max={energy.max} />}

        {/* Buff icons */}
        <BuffBar effects={buffs} />
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   SkillToastBar
   ════════════════════════════════════ */

function SkillToastBar({ toasts }: { toasts: SkillToast[] }) {
  const [visible, setVisible] = useState<SkillToast[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (toasts.length === 0) return
    const latest = toasts[toasts.length - 1]
    setVisible((prev) => [...prev.slice(-2), latest])

    // Auto-remove after 2s
    timerRef.current = setTimeout(() => {
      setVisible((prev) => prev.filter((t) => t.id !== latest.id))
    }, 2000)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [toasts])

  if (visible.length === 0) return null

  return (
    <div className="bhud-skill-toasts">
      {visible.map((t) => (
        <div key={t.id} className="bhud-skill-toast">
          <span className="bhud-skill-hero">{t.heroName}</span>
          <span className="bhud-skill-name">{t.skillName}</span>
        </div>
      ))}
    </div>
  )
}

/* ════════════════════════════════════
   ElementHintBar
   ════════════════════════════════════ */

function ElementHintBar({ hints }: { hints: ElementHint[] }) {
  const [visible, setVisible] = useState<ElementHint[]>([])

  useEffect(() => {
    if (hints.length === 0) return
    const latest = hints[hints.length - 1]
    setVisible((prev) => [...prev.slice(-1), latest])

    const t = setTimeout(() => {
      setVisible((prev) => prev.filter((h) => h.id !== latest.id))
    }, 1500)

    return () => clearTimeout(t)
  }, [hints])

  if (visible.length === 0) return null

  return (
    <div className="bhud-element-hints">
      {visible.map((h) => (
        <span key={h.id} className="bhud-element-hint" style={{ color: h.color }}>
          {h.text}
        </span>
      ))}
    </div>
  )
}

/* ════════════════════════════════════
   Compact Energy Indicator
   ════════════════════════════════════ */

function CompactEnergyItem({
  hero,
  energy,
  side,
}: {
  hero: { uid: string; name: string; element?: Element | '' }
  energy: { current: number; max: number } | undefined
  side: 'player' | 'enemy'
}) {
  const cur = energy?.current ?? 0
  const max = energy?.max ?? 1000
  const pct = max > 0 ? Math.min(100, (cur / max) * 100) : 0
  const isFull = cur >= max

  return (
    <div className={`bhud-compact-energy ${side}`}>
      <span className="bhud-compact-name">{hero.name.charAt(0)}</span>
      <div className="bhud-compact-bar">
        <div
          className={`bhud-compact-fill ${isFull ? 'bhud-energy-full' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   Main BattleHUD
   ════════════════════════════════════ */

export function BattleHUD({
  visible,
  playerHeroes: _playerHeroes,
  enemyHeroes: _enemyHeroes,
  buffMap: _buffMap,
  energyMap: _energyMap,
  skillToasts: _skillToasts,
  elementHints: _elementHints,
}: BattleHUDProps) {
  if (!visible) return null

  return (
    <div className="bhud-container">
      {/* Skill/Element popups now rendered in 3D space via Hero component */}
    </div>
  )
}
