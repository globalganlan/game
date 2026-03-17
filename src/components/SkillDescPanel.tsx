/**
 * SkillDescPanel — 技能描述面板
 *
 * 對應 .ai/specs/effect-system.md v2.4 §12
 * 顯示技能效果列表、等級對比、依賴提示
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
   元件
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

export function effectDescription(eff: ResolvedEffect): string {
  const icon = getCategoryEmoji(eff.category) || '❓'
  const pct = (v: number) => `${Math.round(v * 100)}%`

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
      if (eff.statusValue) {
        // 毒傷基於目標 maxHP，燃燒/流血基於施加者 ATK
        if (eff.status === 'dot_poison') {
          text += `（每回合 目標HP×${pct(eff.statusValue)}）`
        } else {
          text += `（每回合 攻擊×${pct(eff.statusValue)}）`
        }
      }
      if (duration) text += `，持續 ${duration}`
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

  return (
    <div className="skill-desc-panel" onClick={e => e.stopPropagation()}>
      <div className="skill-desc-header">
        <span className="skill-desc-name">
          {skill.icon || '⚔️'} {skill.name}
          {skillLevel > 1 && <span className="skill-desc-level">Lv.{skillLevel}</span>}
        </span>
        <button className="skill-desc-close" onClick={onClose}>✕</button>
      </div>

      <div className="skill-desc-type">
        {triggerLabel}
        {isLocked && unlockStar && <span className="skill-desc-locked">🔒 ★{unlockStar} 解鎖</span>}
      </div>

      {skill.description && (
        <div className="skill-desc-text">{skill.description}</div>
      )}

      <div className="skill-desc-effects">
        {effects.map((eff, i) => (
          <div key={eff.effectId || i} className="skill-desc-effect-row"
               style={{ borderLeftColor: getCategoryColor(eff.category) }}>
            <span className="skill-desc-effect-num">效果 {i + 1}:</span>
            <span className="skill-desc-effect-desc">{effectDescription(eff)}</span>
            {eff.dependsOnName && (
              <span className="skill-desc-depends">└ 需要「{eff.dependsOnName}」生效</span>
            )}
          </div>
        ))}
      </div>

      {allLevelEffects && allLevelEffects.size > 1 && (
        <div className="skill-desc-levels">
          <div className="skill-desc-levels-title">等級對比</div>
          {Array.from(allLevelEffects.entries()).map(([lv, effs]) => (
            <div key={lv} className={`skill-desc-level-row ${lv === skillLevel ? 'current' : ''}`}>
              <span className="skill-desc-lv">Lv.{lv}{lv === skillLevel ? ' ★' : ''}</span>
              <span className="skill-desc-lv-desc">
                {effs.map(e => effectDescription(e)).join('；')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SkillDescPanel
