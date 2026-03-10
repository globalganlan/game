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

type CodexCategory = 'equipment'

const CODEX_TABS: { key: CodexCategory; icon: string; label: string }[] = [
  { key: 'equipment', icon: '⚔️', label: '裝備' },
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
    </div>
  )
}
