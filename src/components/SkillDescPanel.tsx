/**
 * SkillDescPanel — 技能描述面板
 *
 * 對應 .ai/specs/effect-system.md v2.26 §11
 * 顯示技能效果列表、觸發/目標/機率標籤、等級逐效果對比、依賴提示
 */

import { useMemo } from 'react'
import type { SkillTemplate, EffectCategory, EffectTrigger, ResolvedEffect } from '../domain/types'
import { getCategoryEmoji, getCategoryColor } from '../utils/effectIconGenerator'
import { statusZh, statZh } from '../constants/statNames'

const TRIGGER_LABEL: Record<EffectTrigger, string> = {
  immediate: '立即生效',
  battle_start: '戰鬥開始時',
  turn_start: '回合開始時',
  turn_end: '回合結束時',
  on_attack: '攻擊時',
  on_normal_attack: '普攻時',
  on_skill_cast: '施放大招時',
  on_crit: '暴擊時',
  on_kill: '擊殺敵人時',
  on_be_attacked: '被攻擊時',
  on_take_damage: '受傷後',
  on_lethal: '受致命傷時',
  on_dodge: '閃避成功時',
  on_ally_death: '隊友死亡時',
  on_ally_skill: '隊友施放大招時',
  on_ally_attacked: '隊友被攻擊時',
  always: '永久生效',
  hp_below_pct: 'HP 低於 {param}%',
  hp_above_pct: 'HP 高於 {param}%',
  every_n_turns: '每 {param} 回合',
  enemy_count_below: '敵人 ≤ {param} 時',
  ally_count_below: '隊友 ≤ {param} 時',
  has_status: '目標帶有 {param}',
}

const TARGET_ZH: Record<string, string> = {
  single_enemy: '單體敵人', all_enemies: '全體敵人',
  random_enemies_3: '隨機 3 敵', front_row_enemies: '前排敵人',
  back_row_enemies: '後排敵人', single_ally: '單體隊友',
  all_allies: '全體隊友', self: '自身', trigger_source: '觸發來源',
}

const CATEGORY_ZH: Partial<Record<EffectCategory, string>> = {
  damage: '傷害', dot: '持續傷害', heal: '治療', buff: '增益', debuff: '減益',
  cc: '控制', shield: '護盾', energy: '能量', extra_turn: '額外行動',
  counter_attack: '反擊', chase_attack: '追擊', revive: '復活',
  dispel_debuff: '淨化', dispel_buff: '驅散', reflect: '反傷',
  steal_buff: '偷取', transfer_debuff: '轉移', execute: '斬殺',
  modify_target: '目標變更',
}

/* ════════════════════════════════════
   Props
   ════════════════════════════════════ */

interface SkillDescPanelProps {
  skill: SkillTemplate
  effects: ResolvedEffect[]
  skillLevel: number
  allLevelEffects?: Map<number, ResolvedEffect[]>
  isLocked?: boolean
  unlockStar?: number
  onClose: () => void
}

/* ════════════════════════════════════
   輔助函式
   ════════════════════════════════════ */

function formatTrigger(trigger: EffectTrigger, triggerParam?: number | string): string {
  const template = TRIGGER_LABEL[trigger] || trigger
  if (triggerParam != null) {
    const paramStr = typeof triggerParam === 'number' && trigger.includes('pct')
      ? String(Math.round(triggerParam * 100))      : trigger === 'has_status' ? statusZh(String(triggerParam))      : String(triggerParam)
    return template.replace('{param}', paramStr)
  }
  return template.replace(/ \{param\}[%時]?/, '')
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export function effectDescription(eff: ResolvedEffect): string {
  const icon = getCategoryEmoji(eff.category) || '❓'

  /** 倍率文字：「攻擊×180%」或「180%」 */
  const scalingPct = () => {
    if (eff.scalingStat && eff.multiplier)
      return `${statZh(eff.scalingStat)}×${pct(eff.multiplier)}`
    if (eff.multiplier) return pct(eff.multiplier)
    return ''
  }
  /** 數值：倍率優先，否則 flatValue */
  const valueText = () => scalingPct() || (eff.flatValue != null ? String(eff.flatValue) : '')

  const chancePrefix = eff.statusChance != null && eff.statusChance < 1
    ? `${pct(eff.statusChance)} 機率 ` : ''
  const statusName = eff.status ? statusZh(eff.status) : ''
  const duration = eff.statusDuration ? `${eff.statusDuration} 回合` : ''

  let desc = ''

  switch (eff.category) {
    case 'damage': {
      const val = valueText()
      const hit = eff.hitCount && eff.hitCount > 1 ? `（${eff.hitCount} 段）` : ''
      desc = val ? `造成 ${val} 傷害${hit}` : `造成傷害${hit}`
      break
    }
    case 'heal': {
      const val = valueText()
      desc = val ? `回復 ${val} 生命` : '回復生命'
      break
    }
    case 'shield': {
      const val = valueText()
      desc = val ? `獲得 ${val} 護盾` : '獲得護盾'
      break
    }
    case 'buff': {
      let text = statusName || '增益'
      if (eff.statusValue) text += ` ${pct(eff.statusValue)}`
      if (duration) text += eff.statusValue ? `，持續 ${duration}` : ` ${duration}`
      if (eff.perAlly) text += '（每位存活隊友）'
      desc = chancePrefix + text
      break
    }
    case 'debuff': {
      let text = statusName || '減益'
      if (eff.statusValue) text += ` ${pct(eff.statusValue)}`
      if (duration) text += eff.statusValue ? `，持續 ${duration}` : ` ${duration}`
      desc = chancePrefix + text
      break
    }
    case 'dot': {
      let text = statusName || '持續傷害'
      const hasAtk = eff.statusValue && eff.statusValue > 0
      const hasHp = eff.multiplier && eff.multiplier > 0
      if (hasAtk || hasHp) {
        const parts: string[] = []
        if (hasAtk) parts.push(`攻擊×${pct(eff.statusValue!)}`)
        if (hasHp) parts.push(`目標HP×${pct(eff.multiplier!)}`)
        text += `（每回合 ${parts.join(' + ')}${hasHp ? '，HP傷害上限10萬' : ''}）`
      }
      if (duration) text += `，持續 ${duration}`
      if (eff.statusMaxStacks && eff.statusMaxStacks > 1) text += `（最高 ${eff.statusMaxStacks} 層）`
      desc = `${chancePrefix}施加 ${text}`
      break
    }
    case 'cc': {
      let text = statusName || '控制'
      if (duration) text += ` ${duration}`
      desc = chancePrefix + text
      break
    }
    case 'energy': {
      const val = eff.flatValue ?? 0
      desc = val >= 0 ? `恢復 ${val} 能量` : `吸取 ${Math.abs(val)} 能量`
      break
    }
    case 'extra_turn':
      desc = '再行動一次'
      break
    case 'revive':
      desc = eff.multiplier
        ? `致命傷時回復至 ${pct(eff.multiplier)} HP`
        : eff.flatValue
          ? `致命傷時回復 ${eff.flatValue} 生命`
          : '致命傷時復活'
      break
    case 'reflect':
      desc = `反彈受到傷害的 ${eff.multiplier ? pct(eff.multiplier) : '?%'}`
      break
    case 'counter_attack': {
      const val = valueText()
      desc = val ? `反擊造成 ${val} 傷害` : '反擊'
      break
    }
    case 'chase_attack': {
      const val = valueText()
      desc = val ? `追擊造成 ${val} 傷害` : '追擊'
      break
    }
    case 'dispel_debuff':
      desc = `淨化 ${eff.flatValue ?? 1} 個減益效果`
      break
    case 'dispel_buff':
      desc = `驅散 ${eff.flatValue ?? 1} 個增益效果`
      break
    case 'steal_buff':
      desc = `偷取 ${eff.flatValue ?? 1} 個增益效果`
      break
    case 'transfer_debuff':
      desc = `轉移 ${eff.flatValue ?? 1} 個減益給目標`
      break
    case 'execute':
      desc = eff.targetHpThreshold
        ? `斬殺 HP 低於 ${pct(eff.targetHpThreshold)} 的目標`
        : '斬殺低血量目標'
      break
    case 'modify_target':
      desc = `改變目標為${TARGET_ZH[eff.targetOverride ?? ''] ?? eff.targetOverride ?? '?'}`
      break
    default:
      desc = eff.name || eff.category
  }

  // 門檻條件（execute 已內建）
  if (eff.category !== 'execute' && eff.targetHpThreshold) {
    desc += `（目標 HP < ${pct(eff.targetHpThreshold)}）`
  }

  return `${icon} ${desc}`
}

/* ── 效果附加標籤（目標/觸發/機率/上限/疊層） ── */
function EffectTags({ eff }: { eff: ResolvedEffect }) {
  const tags: { label: string; cls: string }[] = []

  // 目標
  const targetLabel = TARGET_ZH[eff.target]
  if (targetLabel && eff.target !== 'single_enemy') {
    tags.push({ label: `🎯 ${targetLabel}`, cls: 'sdp-tag-target' })
  }

  // 觸發條件（只有被動效果 trigger !== immediate 才顯示）
  if (eff.trigger && eff.trigger !== 'immediate') {
    tags.push({ label: formatTrigger(eff.trigger, eff.triggerParam), cls: 'sdp-tag-trigger' })
  }

  // 觸發機率
  if (eff.triggerChance != null && eff.triggerChance < 1) {
    tags.push({ label: `${pct(eff.triggerChance)} 機率觸發`, cls: 'sdp-tag-chance' })
  }

  // 每場上限
  if (eff.triggerLimit && eff.triggerLimit > 0) {
    tags.push({ label: `每場限 ${eff.triggerLimit} 次`, cls: 'sdp-tag-limit' })
  }

  // 最大疊層（buff/debuff/dot 類）
  if (eff.statusMaxStacks && eff.statusMaxStacks > 1 && eff.category !== 'dot') {
    tags.push({ label: `最高 ${eff.statusMaxStacks} 層`, cls: 'sdp-tag-stacks' })
  }

  if (tags.length === 0) return null

  return (
    <div className="sdp-effect-tags">
      {tags.map((t, i) => (
        <span key={i} className={`sdp-tag ${t.cls}`}>{t.label}</span>
      ))}
    </div>
  )
}

/* ── 等級對比：逐效果展開 ── */
function LevelComparison({
  allLevelEffects,
  skillLevel,
}: {
  allLevelEffects: Map<number, ResolvedEffect[]>
  skillLevel: number
}) {
  // 取所有等級列表
  const levels = Array.from(allLevelEffects.keys()).sort((a, b) => a - b)
  // 取效果數最多的等級作為基準
  const maxEffCt = Math.max(...Array.from(allLevelEffects.values()).map(e => e.length))

  return (
    <div className="sdp-levels">
      <div className="sdp-levels-title">📊 等級對比</div>
      <div className="sdp-levels-table">
        {/* 表頭 */}
        <div className="sdp-lv-header">
          <span className="sdp-lv-cell sdp-lv-label"></span>
          {levels.map(lv => (
            <span key={lv} className={`sdp-lv-cell ${lv === skillLevel ? 'sdp-lv-current' : ''}`}>
              Lv.{lv}{lv === skillLevel ? ' ★' : ''}
            </span>
          ))}
        </div>
        {/* 逐效果行 */}
        {Array.from({ length: maxEffCt }, (_, ei) => {
          // 取各等級此效果的描述
          const descriptions = levels.map(lv => {
            const effs = allLevelEffects.get(lv)
            const e = effs?.[ei]
            return e ? effectDescription(e) : '—'
          })
          // 如果所有等級描述相同→跳過（無變化不顯示）
          if (new Set(descriptions).size <= 1) return null
          // 取 category icon
          const baseEff = allLevelEffects.get(levels[0])?.[ei]
          const catLabel = baseEff ? (CATEGORY_ZH[baseEff.category] || baseEff.category) : `效果 ${ei + 1}`
          return (
            <div key={ei} className="sdp-lv-row">
              <span className="sdp-lv-cell sdp-lv-label">{catLabel}</span>
              {levels.map((lv, li) => (
                <span key={lv} className={`sdp-lv-cell ${lv === skillLevel ? 'sdp-lv-current' : ''}`}>
                  {descriptions[li]}
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   主元件
   ════════════════════════════════════ */

export function SkillDescPanel({
  skill,
  effects,
  skillLevel,
  allLevelEffects,
  isLocked,
  unlockStar,
  onClose,
}: SkillDescPanelProps) {
  const triggerLabel = useMemo(() => {
    if (skill.type === 'active') return '主動技'
    const trigger = (skill.passiveTrigger || 'always') as EffectTrigger
    return formatTrigger(trigger)
  }, [skill])

  const typeClass = skill.type === 'active' ? 'sdp-badge-active' : 'sdp-badge-passive'

  return (
    <div className="skill-desc-panel" onClick={e => e.stopPropagation()}>
      {/* ── 頂部裝飾線 ── */}
      <div className="sdp-top-accent" />

      {/* ── Header ── */}
      <div className="skill-desc-header">
        <div className="skill-desc-name">
          <span className="sdp-skill-icon">{skill.icon || '⚔️'}</span>
          <span>{skill.name}</span>
          {skillLevel > 1 && <span className="skill-desc-level">Lv.{skillLevel}</span>}
        </div>
        <button className="skill-desc-close" onClick={onClose}>✕</button>
      </div>

      {/* ── 類型標籤列 ── */}
      <div className="sdp-type-row">
        <span className={`sdp-badge ${typeClass}`}>{triggerLabel}</span>
        {effects.length > 0 && effects[0].target && (
          <span className="sdp-badge sdp-badge-target">🎯 {TARGET_ZH[effects[0].target] || effects[0].target}</span>
        )}
        {isLocked && unlockStar && <span className="sdp-badge sdp-badge-locked">🔒 ★{unlockStar} 解鎖</span>}
      </div>

      {/* ── 技能描述 ── */}
      {skill.description && (
        <div className="skill-desc-text">{skill.description}</div>
      )}

      {/* ── 效果列表 ── */}
      <div className="skill-desc-effects">
        {effects.map((eff, i) => {
          const color = getCategoryColor(eff.category)
          return (
            <div key={eff.effectId || i} className="skill-desc-effect-row"
                 style={{ borderLeftColor: color }}>
              <div className="sdp-effect-header">
                <span className="sdp-effect-cat" style={{ color }}>
                  {getCategoryEmoji(eff.category)} {CATEGORY_ZH[eff.category] || eff.category}
                </span>
                {eff.name && <span className="sdp-effect-name">{eff.name}</span>}
              </div>
              <div className="skill-desc-effect-desc">{effectDescription(eff)}</div>
              <EffectTags eff={eff} />
              {eff.dependsOnName && (
                <span className="skill-desc-depends">└ 需要「{eff.dependsOnName}」生效</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 等級對比 ── */}
      {allLevelEffects && allLevelEffects.size > 1 && (
        <LevelComparison allLevelEffects={allLevelEffects} skillLevel={skillLevel} />
      )}
    </div>
  )
}

export default SkillDescPanel
