/**
 * CodexPanel — 圖鑑面板
 *
 * 可擴展的圖鑑系統，目前支援：
 * - 裝備圖鑑（8 套裝 × 4 部位 × 4 稀有度 = 128 種）
 *
 * 未來可擴展：英雄圖鑑、怪物圖鑑、成就圖鑑等。
 */

import React, { useState, useMemo } from 'react'
import {
  SET_IDS, SLOTS, SLOT_NAMES, SET_NAMES,
  SLOT_MAIN_STAT, MAIN_STAT_BASE,
} from '../domain/equipmentGacha'
import {
  EQUIPMENT_SETS,
  EQUIPMENT_SUB_STAT_COUNT,
  EQUIPMENT_MAX_ENHANCE,
} from '../domain/progressionSystem'
import type { Rarity, EquipmentSlot } from '../domain/progressionSystem'
import { RARITY_COLORS, RARITY_CONFIG } from '../constants/rarity'
import { statZh } from '../constants/statNames'

/* ════════════════════════════════════
   bonusType → 中文映射
   ════════════════════════════════════ */

const BONUS_ZH: Record<string, string> = {
  ATK_percent: '攻擊%',
  DEF_percent: '防禦%',
  HP_percent: '生命%',
  SPD_flat: '速度',
  CritRate_percent: '暴擊率%',
  CritDmg_percent: '暴擊傷害%',
  lifesteal: '吸血',
  counter: '反擊率',
}

const SLOT_EMOJI: Record<string, string> = {
  weapon: '⚔️', armor: '🛡️', ring: '💍', boots: '👢',
}

const RARITIES: Rarity[] = ['N', 'R', 'SR', 'SSR']

/* ════════════════════════════════════
   圖鑑分類
   ════════════════════════════════════ */

type CodexCategory = 'equipment' | 'element'

const CODEX_TABS: { key: CodexCategory; icon: string; label: string }[] = [
  { key: 'equipment', icon: '⚔️', label: '裝備' },
  { key: 'element', icon: '🔥', label: '屬性' },
]

/* ════════════════════════════════════
   裝備圖鑑子組件
   ════════════════════════════════════ */

function EquipmentCodex() {
  const [selectedSet, setSelectedSet] = useState<string>(SET_IDS[0])
  const [selectedRarity, setSelectedRarity] = useState<Rarity | 'all'>('all')

  // 取得該套裝的 2pc 和 4pc 效果
  const setBonuses = useMemo(() => {
    return EQUIPMENT_SETS.filter(b => b.setId === selectedSet)
  }, [selectedSet])

  // 篩選要展示的裝備（全部可見）
  const displayItems = useMemo(() => {
    const items: { setId: string; slot: EquipmentSlot; rarity: Rarity; templateId: string }[] = []
    for (const slot of SLOTS) {
      for (const rarity of RARITIES) {
        if (selectedRarity !== 'all' && rarity !== selectedRarity) continue
        const tid = `eq_${selectedSet}_${slot}_${rarity}`
        items.push({ setId: selectedSet, slot, rarity, templateId: tid })
      }
    }
    return items
  }, [selectedSet, selectedRarity])

  return (
    <div className="codex-equip">
      {/* 套裝選擇列 */}
      <div className="codex-set-tabs">
        {SET_IDS.map(sid => {
          const name = SET_NAMES[sid] || sid
          const isActive = sid === selectedSet
          return (
            <button
              key={sid}
              className={`codex-set-tab ${isActive ? 'codex-set-tab-active' : ''}`}
              onClick={() => setSelectedSet(sid)}
            >
              {name}
            </button>
          )
        })}
      </div>

      {/* 套裝資訊卡 */}
      <div className="codex-set-info">
        <div className="codex-set-header">
          <span className="codex-set-name">{SET_NAMES[selectedSet]}</span>
        </div>
        <div className="codex-set-bonuses">
          {setBonuses.map((b, i) => (
            <div key={i} className="codex-bonus-row">
              <span className="codex-bonus-count">{b.requiredCount} 件</span>
              <span className="codex-bonus-desc">
                {BONUS_ZH[b.bonusType] || b.bonusType} +{b.bonusValue}{b.bonusType.includes('flat') ? '' : '%'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 稀有度篩選 */}
      <div className="codex-rarity-filter">
        <button
          className={`codex-rarity-btn ${selectedRarity === 'all' ? 'codex-rarity-active' : ''}`}
          onClick={() => setSelectedRarity('all')}
        >全部</button>
        {RARITIES.map(r => (
          <button
            key={r}
            className={`codex-rarity-btn ${selectedRarity === r ? 'codex-rarity-active' : ''}`}
            style={{ color: RARITY_COLORS[r] }}
            onClick={() => setSelectedRarity(r)}
          >{r}</button>
        ))}
      </div>

      {/* 裝備格子 */}
      <div className="codex-equip-grid">
        {displayItems.map(item => {
          const mainStat = SLOT_MAIN_STAT[item.slot]
          const mainVal = MAIN_STAT_BASE[item.slot][item.rarity]
          const subCount = EQUIPMENT_SUB_STAT_COUNT[item.rarity]
          const maxEnhance = EQUIPMENT_MAX_ENHANCE[item.rarity]
          const color = RARITY_COLORS[item.rarity]

          return (
            <div
              key={item.templateId}
              className="codex-equip-card codex-owned"
              style={{ '--card-color': color } as React.CSSProperties}
            >
              <div className="codex-card-icon">{SLOT_EMOJI[item.slot] || '📦'}</div>
              <div className="codex-card-name">
                {SET_NAMES[item.setId]}{SLOT_NAMES[item.slot]}
              </div>
              <div className="codex-card-rarity" style={{ color }}>
                {RARITY_CONFIG[item.rarity]?.label || item.rarity}
              </div>
              <div className="codex-card-stats">
                <div className="codex-card-main">
                  {statZh(mainStat)} +{mainVal}
                </div>
                <div className="codex-card-meta">
                  副屬性 ×{subCount} · 強化上限 +{maxEnhance}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   屬性相剋圖鑑
   ════════════════════════════════════ */

const ELEMENTS = ['fire', 'water', 'wind', 'thunder', 'earth', 'light', 'dark'] as const
type ElemKey = typeof ELEMENTS[number]

const ELEM_ZH: Record<ElemKey, string> = {
  fire: '火', water: '水', wind: '風', thunder: '雷', earth: '地', light: '光', dark: '闇',
}
const ELEM_EMOJI: Record<ElemKey, string> = {
  fire: '🔥', water: '💧', wind: '🌿', thunder: '⚡', earth: '🪨', light: '✨', dark: '🌑',
}
const ELEM_COLOR: Record<ElemKey, string> = {
  fire: '#e63946', water: '#4dabf7', wind: '#2a9d8f', thunder: '#ffd43b',
  earth: '#a0522d', light: '#fff', dark: '#6c5ce7',
}

/** 克制環 + 光暗互剋。attacker → defender = 1.3 */
const ADVANTAGE: [ElemKey, ElemKey][] = [
  ['fire', 'wind'], ['wind', 'earth'], ['earth', 'thunder'], ['thunder', 'water'], ['water', 'fire'],
  ['light', 'dark'], ['dark', 'light'],
]

function ElementCodex() {
  return (
    <div className="codex-element">
      {/* 說明文字 */}
      <div className="codex-elem-desc">
        <p>屬性相剋影響攻擊傷害倍率：</p>
        <p><span style={{ color: '#e63946' }}>●</span> 克制（×1.3）　
           <span style={{ color: '#4dabf7' }}>●</span> 抵抗（×0.7）　
           <span style={{ color: '#888' }}>●</span> 同屬（×0.9）</p>
      </div>

      {/* 五行環 */}
      <div className="codex-elem-ring">
        <div className="codex-elem-ring-title">五行相剋環</div>
        <div className="codex-elem-cycle">
          {(['fire', 'wind', 'earth', 'thunder', 'water'] as ElemKey[]).map((el, i, arr) => {
            const next = arr[(i + 1) % arr.length]
            return (
              <span key={el} className="codex-elem-cycle-item">
                <span style={{ color: ELEM_COLOR[el] }}>{ELEM_EMOJI[el]} {ELEM_ZH[el]}</span>
                {i < arr.length - 1 && <span className="codex-elem-arrow"> → </span>}
              </span>
            )
          })}
          <span className="codex-elem-arrow"> → </span>
          <span style={{ color: ELEM_COLOR.fire }}>{ELEM_EMOJI.fire} {ELEM_ZH.fire}</span>
        </div>
        <div className="codex-elem-ld">
          <span style={{ color: ELEM_COLOR.light }}>{ELEM_EMOJI.light} {ELEM_ZH.light}</span>
          <span className="codex-elem-arrow"> ⇄ </span>
          <span style={{ color: ELEM_COLOR.dark }}>{ELEM_EMOJI.dark} {ELEM_ZH.dark}</span>
          <span style={{ color: '#999', marginLeft: 8 }}>（互相克制）</span>
        </div>
      </div>

      {/* 完整倍率表 */}
      <div className="codex-elem-table-wrap">
        <div className="codex-elem-ring-title">完整倍率表</div>
        <div className="codex-elem-table-scroll">
          <table className="codex-elem-table">
            <thead>
              <tr>
                <th className="codex-elem-th-corner">攻↓ 守→</th>
                {ELEMENTS.map(e => (
                  <th key={e} style={{ color: ELEM_COLOR[e] }}>
                    {ELEM_EMOJI[e]}<br />{ELEM_ZH[e]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ELEMENTS.map(atk => (
                <tr key={atk}>
                  <td className="codex-elem-row-label" style={{ color: ELEM_COLOR[atk] }}>
                    {ELEM_EMOJI[atk]} {ELEM_ZH[atk]}
                  </td>
                  {ELEMENTS.map(def => {
                    const isAdvantage = ADVANTAGE.some(([a, d]) => a === atk && d === def)
                    const isDisadvantage = ADVANTAGE.some(([a, d]) => a === def && d === atk)
                    const isSame = atk === def
                    const mult = isAdvantage ? 1.3 : isDisadvantage ? 0.7 : isSame ? 0.9 : 1.0
                    const cls = isAdvantage ? 'codex-elem-adv'
                      : isDisadvantage ? 'codex-elem-dis'
                      : isSame ? 'codex-elem-same'
                      : ''
                    return (
                      <td key={def} className={cls}>
                        ×{mult.toFixed(1)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 各屬性克制速查 */}
      <div className="codex-elem-quick">
        <div className="codex-elem-ring-title">各屬性速查</div>
        {ELEMENTS.map(el => {
          const beats = ADVANTAGE.filter(([a]) => a === el).map(([, d]) => d)
          const losesTo = ADVANTAGE.filter(([, d]) => d === el).map(([a]) => a)
          return (
            <div key={el} className="codex-elem-quick-row">
              <span className="codex-elem-quick-icon" style={{ color: ELEM_COLOR[el] }}>
                {ELEM_EMOJI[el]} {ELEM_ZH[el]}
              </span>
              <span className="codex-elem-quick-info">
                {beats.length > 0 && (
                  <span className="codex-elem-quick-adv">
                    剋 {beats.map(b => <span key={b} style={{ color: ELEM_COLOR[b] }}>{ELEM_EMOJI[b]}{ELEM_ZH[b]}</span>)}
                  </span>
                )}
                {losesTo.length > 0 && (
                  <span className="codex-elem-quick-dis">
                    被剋 {losesTo.map(b => <span key={b} style={{ color: ELEM_COLOR[b] }}>{ELEM_EMOJI[b]}{ELEM_ZH[b]}</span>)}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   主圖鑑面板
   ════════════════════════════════════ */

interface CodexPanelProps {
}

export function CodexPanel({}: CodexPanelProps) {
  const [category, setCategory] = useState<CodexCategory>('equipment')

  return (
    <div className="codex-panel">
      {/* 圖鑑分類 tabs（目前只有裝備，未來可擴展） */}
      {CODEX_TABS.length > 1 && (
        <div className="codex-category-tabs">
          {CODEX_TABS.map(t => (
            <button
              key={t.key}
              className={`codex-cat-tab ${category === t.key ? 'codex-cat-active' : ''}`}
              onClick={() => setCategory(t.key)}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 內容 */}
      {category === 'equipment' && (
        <EquipmentCodex />
      )}
      {category === 'element' && (
        <ElementCodex />
      )}
    </div>
  )
}
