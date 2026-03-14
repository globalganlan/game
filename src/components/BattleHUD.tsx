/**
 * BattleHUD — 戰鬥增強 HUD
 *
 * Phase 7：在戰鬥中顯示：
 *  - 每位英雄的 Buff/Debuff 圖示
 *  - 能量條
 *  - 技能發動名稱彈幕
 *  - 屬性相剋指示
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import type { StatusEffect, StatusType } from '../domain/types'
import { statusZh } from '../constants/statNames'
import { getBossConfig, getBossRewardByBossAndRank } from '../domain/stageSystem'
import { CurrencyIcon } from './CurrencyIcon'

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

export interface PassiveHint {
  id: number
  skillName: string
  timestamp: number
  heroUid: string
  gen: number  // 同一批被動共享 gen，換批時清舊 gen
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
   Props
   ════════════════════════════════════ */

interface BattleHUDProps {
  /** 是否顯示（僅在 BATTLE 狀態） */
  visible: boolean
  /** 當前模式 */
  stageMode?: 'story' | 'tower' | 'daily' | 'pvp' | 'boss'
  /** 當前關卡 ID（boss 模式用） */
  stageId?: string
  /** Boss 模式即時累計傷害 */
  bossDamageProgress?: number
  /** 當前回合數 */
  currentTurn?: number
  /** 玩家英雄資訊 */
  playerHeroes: Array<{
    uid: string
    name: string
    currentHP: number
    maxHP: number
  }>
  /** 敵方英雄資訊 */
  enemyHeroes: Array<{
    uid: string
    name: string
    currentHP: number
    maxHP: number
  }>
  /** 各英雄身上的 Buff/Debuff */
  buffMap: BattleBuffMap
  /** 各英雄的能量狀態 */
  energyMap: BattleEnergyMap
  /** 技能發動通知佇列 */
  skillToasts: SkillToast[]
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
            title={`${statusZh(eff.type)} (${eff.duration}回合)`}
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
   Compact Energy Indicator
   ════════════════════════════════════ */

function CompactEnergyItem({
  hero,
  energy,
  side,
}: {
  hero: { uid: string; name: string }
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
   BossDamageBar — Boss 戰即時傷害進度條
   ════════════════════════════════════ */

const RANK_COLORS: Record<string, string> = { S: '#ff4444', A: '#ff9900', B: '#44aaff', C: '#88cc44' }

function BossDamageBar({ stageId, totalDamage, currentTurn }: { stageId: string; totalDamage: number; currentTurn: number }) {
  const boss = useMemo(() => getBossConfig(stageId), [stageId])
  if (!boss) return null

  const th = boss.damageThresholds
  const maxBar = th.S * 1.25 // 進度條最大值 = S 閾值的 125%

  // 計算目前評級
  let currentRank: 'S' | 'A' | 'B' | 'C' | '-' = '-'
  if (totalDamage >= th.S) currentRank = 'S'
  else if (totalDamage >= th.A) currentRank = 'A'
  else if (totalDamage >= th.B) currentRank = 'B'
  else if (totalDamage >= th.C) currentRank = 'C'

  // 當前評級對應獎勵
  const reward = currentRank !== '-'
    ? getBossRewardByBossAndRank(stageId, currentRank)
    : null

  const pct = Math.min(100, (totalDamage / maxBar) * 100)

  // 各閾值在進度條上的位置 %
  const markers = (['C', 'B', 'A', 'S'] as const).map(rank => ({
    rank,
    value: th[rank],
    pos: Math.min(100, (th[rank] / maxBar) * 100),
  }))

  return (
    <div className="boss-dmg-bar-wrap">
      <div className="boss-dmg-header">
        <span className="boss-dmg-title">⚔️ {boss.name} — 累計傷害</span>
        <span className="boss-dmg-round">回合 {currentTurn}/{boss.turnLimit}</span>
        <span className="boss-dmg-value">{totalDamage.toLocaleString()}</span>
      </div>

      <div className="boss-dmg-track">
        {/* 填充條 */}
        <div
          className="boss-dmg-fill"
          style={{
            width: `${pct}%`,
            background: currentRank === 'S' ? 'linear-gradient(90deg, #ff4444, #ffaa00)'
              : currentRank === 'A' ? 'linear-gradient(90deg, #ff9900, #ffcc44)'
              : currentRank === 'B' ? 'linear-gradient(90deg, #44aaff, #88ccff)'
              : currentRank === 'C' ? 'linear-gradient(90deg, #88cc44, #bbee77)'
              : 'linear-gradient(90deg, #555, #777)',
          }}
        />

        {/* 閾值標記 */}
        {markers.map(m => (
          <div
            key={m.rank}
            className="boss-dmg-marker"
            style={{ left: `${m.pos}%`, borderColor: RANK_COLORS[m.rank] }}
          >
            <span
              className="boss-dmg-marker-label"
              style={{ color: RANK_COLORS[m.rank] }}
            >
              {m.rank}
            </span>
            <span className="boss-dmg-marker-val">{m.value >= 1000 ? `${(m.value / 1000).toFixed(0)}k` : m.value}</span>
          </div>
        ))}
      </div>

      {/* 當前評級與獎勵 */}
      <div className="boss-dmg-footer">
        <span className="boss-dmg-rank" style={{ color: currentRank !== '-' ? RANK_COLORS[currentRank] : '#666' }}>
          評級：{currentRank}
        </span>
        {reward && (
          <span className="boss-dmg-reward">
            <CurrencyIcon type="gold" />{reward.gold} <CurrencyIcon type="diamond" />{reward.diamond ?? 0} <CurrencyIcon type="exp" />{reward.exp}
          </span>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   Main BattleHUD
   ════════════════════════════════════ */

export function BattleHUD({
  visible,
  stageMode,
  stageId,
  bossDamageProgress,
  currentTurn,
  playerHeroes: _playerHeroes,
  enemyHeroes: _enemyHeroes,
  buffMap: _buffMap,
  energyMap: _energyMap,
  skillToasts: _skillToasts,
}: BattleHUDProps) {
  if (!visible) return null

  return (
    <div className="bhud-container">
      {/* Boss 傷害進度條 */}
      {stageMode === 'boss' && stageId && (
        <BossDamageBar stageId={stageId} totalDamage={bossDamageProgress ?? 0} currentTurn={currentTurn ?? 0} />
      )}
    </div>
  )
}
