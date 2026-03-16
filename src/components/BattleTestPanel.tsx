/**
 * BattleTestPanel — 戰鬥效果測試沙盒
 *
 * 提供 UI 讓開發者：
 * 1. 選擇預設測試情境 或 自訂英雄/效果
 * 2. 執行本地戰鬥（不走 API）
 * 3. 查看詳細戰鬥日誌，驗證效果觸發正確性
 *
 * 日誌區域帶有結構化 data-* 屬性，供 Playwright 自動讀取。
 */
import { useState, useCallback, useRef } from 'react'
import type { BattleAction, BattleHero } from '../domain'
import { runBattleCollect } from '../domain/battleEngine'
import { statusZh } from '../constants/statNames'
import {
  TEST_SCENARIOS,
  TEST_SKILLS,
  BLANK_HERO_STATS,
  buildTestBattle,
  createTestBattleHero,
  type TestScenario,
  type TestHeroConfig,
  type TestSkillConfig,
} from '../domain/testHeroes'

/* ════════════════════════════════════
   戰鬥日誌項目
   ════════════════════════════════════ */

interface BattleLogEntry {
  turn: number
  type: string
  detail: string
  raw: BattleAction
}

function formatAction(action: BattleAction, heroMap: Map<string, BattleHero>): BattleLogEntry {
  const name = (uid: string) => heroMap.get(uid)?.name ?? uid
  const turn = 'turn' in action ? (action as { turn: number }).turn : 0

  switch (action.type) {
    case 'TURN_START':
      return { turn: action.turn, type: 'TURN_START', detail: `── 回合 ${action.turn} 開始 ──`, raw: action }
    case 'TURN_END':
      return { turn: action.turn, type: 'TURN_END', detail: `── 回合 ${action.turn} 結束 ──`, raw: action }
    case 'NORMAL_ATTACK': {
      const r = action.result
      const dmg = r.isDodge ? 'MISS' : `${r.damage}${r.isCrit ? ' 暴擊' : ''}`
      return { turn, type: 'NORMAL_ATTACK', detail: `${name(action.attackerUid)} → ${name(action.targetUid)} 普攻 ${dmg}${action.killed ? ' 💀擊殺' : ''}${r.reflectDamage > 0 ? ` (反彈${r.reflectDamage})` : ''}`, raw: action }
    }
    case 'SKILL_CAST': {
      const tgts = action.targets.map(t => {
        const n = name(t.uid)
        if ('damage' in t.result) {
          const d = t.result as { damage: number; isDodge: boolean; isCrit: boolean }
          return `${n}:${d.isDodge ? 'MISS' : d.damage}${t.killed ? '💀' : ''}`
        }
        return `${n}:+${(t.result as { heal: number }).heal}HP`
      }).join(', ')
      return { turn, type: 'SKILL_CAST', detail: `${name(action.attackerUid)} 技能【${action.skillName}】→ ${tgts}`, raw: action }
    }
    case 'DOT_TICK':
      return { turn, type: 'DOT_TICK', detail: `${name(action.targetUid)} ${statusZh(action.dotType)} -${action.damage}`, raw: action }
    case 'BUFF_APPLY':
      return { turn, type: 'BUFF_APPLY', detail: `${name(action.targetUid)} +${statusZh(action.effect.type)}${action.effect.stacks > 1 ? `×${action.effect.stacks}` : ''} (${action.effect.duration}t)`, raw: action }
    case 'BUFF_EXPIRE':
      return { turn, type: 'BUFF_EXPIRE', detail: `${name(action.targetUid)} -${statusZh(action.effectType)} 到期`, raw: action }
    case 'DEATH':
      return { turn, type: 'DEATH', detail: `${name(action.targetUid)} 💀 死亡`, raw: action }
    case 'PASSIVE_TRIGGER':
      return { turn, type: 'PASSIVE_TRIGGER', detail: `${name(action.heroUid)} 效果【${action.skillName}】觸發`, raw: action }
    case 'PASSIVE_DAMAGE':
      return { turn, type: 'PASSIVE_DAMAGE', detail: `${name(action.attackerUid)} → ${name(action.targetUid)} 效果傷害 ${action.damage}${action.killed ? ' 💀' : ''}`, raw: action }
    case 'ENERGY_CHANGE':
      return { turn, type: 'ENERGY_CHANGE', detail: `${name(action.heroUid)} 能量 +${action.delta} → ${action.newValue}`, raw: action }
    case 'EXTRA_TURN':
      return { turn, type: 'EXTRA_TURN', detail: `${name(action.heroUid)} 額外行動`, raw: action }
    case 'COUNTER_ATTACK':
      return { turn, type: 'COUNTER_ATTACK', detail: `${name(action.attackerUid)} ↩️反擊 → ${name(action.targetUid)} ${action.damage}${action.killed ? ' 💀' : ''}`, raw: action }
    case 'CHASE_ATTACK':
      return { turn, type: 'CHASE_ATTACK', detail: `${name(action.attackerUid)} ⚡追擊 → ${name(action.targetUid)} ${action.damage}${action.killed ? ' 💀' : ''}`, raw: action }
    case 'EXECUTE':
      return { turn, type: 'EXECUTE', detail: `${name(action.attackerUid)} 💀斬殺 → ${name(action.targetUid)}`, raw: action }
    case 'STEAL_BUFF':
      return { turn, type: 'STEAL_BUFF', detail: `${name(action.heroUid)} 偷取 ${name(action.targetUid)} 的 ${statusZh(action.buffType)}`, raw: action }
    case 'TRANSFER_DEBUFF':
      return { turn, type: 'TRANSFER_DEBUFF', detail: `${name(action.heroUid)} 轉移 ${statusZh(action.debuffType)} → ${name(action.targetUid)}`, raw: action }
    case 'SHIELD_APPLY':
      return { turn, type: 'SHIELD_APPLY', detail: `${name(action.targetUid)} +護盾 ${action.value}`, raw: action }
    case 'SHIELD_BREAK':
      return { turn, type: 'SHIELD_BREAK', detail: `${name(action.heroUid)} 護盾破碎`, raw: action }
    case 'BATTLE_END':
      return { turn, type: 'BATTLE_END', detail: `══ 戰鬥結束：${action.winner === 'player' ? '✅ 勝利' : action.winner === 'enemy' ? '❌ 失敗' : '⏸️ 平手'} ══`, raw: action }
    default:
      return { turn, type: (action as { type: string }).type, detail: JSON.stringify(action), raw: action }
  }
}

/* ════════════════════════════════════
   自訂英雄編輯器
   ════════════════════════════════════ */

const SKILL_KEYS = Object.keys(TEST_SKILLS)
const PASSIVE_TRIGGER_OPTIONS: ('' | string)[] = [
  '', 'always', 'battle_start', 'turn_start', 'turn_end',
  'on_attack', 'on_normal_attack', 'on_skill_cast', 'on_crit', 'on_kill',
  'on_be_attacked', 'on_take_damage', 'on_lethal', 'on_dodge',
  'on_ally_death', 'on_ally_skill', 'on_ally_attacked',
  'hp_below_pct', 'hp_above_pct', 'every_n_turns',
  'enemy_count_below', 'ally_count_below',
]

function CustomHeroEditor({ hero, onChange, label }: {
  hero: TestHeroConfig
  onChange: (h: TestHeroConfig) => void
  label: string
}) {
  const updateStat = (key: keyof typeof BLANK_HERO_STATS, v: string) => {
    onChange({ ...hero, stats: { ...hero.stats, [key]: Number(v) || 0 } })
  }

  const activeSkillKey = SKILL_KEYS.find(k =>
    TEST_SKILLS[k].name === hero.activeSkill?.name && TEST_SKILLS[k].type === 'active',
  ) ?? ''

  const passiveKeys = (hero.passives ?? []).map(p =>
    SKILL_KEYS.find(k => TEST_SKILLS[k].name === p.name) ?? '',
  )

  return (
    <div className="test-hero-editor" data-testid={`hero-editor-${label}`}>
      <h4 style={{ margin: '4px 0', color: '#ffd700' }}>{label}</h4>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
        <label>名稱: <input value={hero.name} onChange={e => onChange({ ...hero, name: e.target.value })} style={{ width: 80 }} data-testid={`name-${label}`} /></label>
        {(Object.keys(BLANK_HERO_STATS) as (keyof typeof BLANK_HERO_STATS)[]).map(k => (
          <label key={k}>{k}: <input type="number" value={hero.stats[k]} onChange={e => updateStat(k, e.target.value)} style={{ width: 60 }} data-testid={`stat-${k}-${label}`} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label>主動技:
          <select value={activeSkillKey} onChange={e => {
            const sk = TEST_SKILLS[e.target.value]
            onChange({ ...hero, activeSkill: sk && sk.type === 'active' ? sk : null })
          }} data-testid={`active-skill-${label}`}>
            <option value="">（無）</option>
            {SKILL_KEYS.filter(k => TEST_SKILLS[k].type === 'active').map(k => (
              <option key={k} value={k}>{TEST_SKILLS[k].name}</option>
            ))}
          </select>
        </label>
        {[0, 1, 2, 3].map(i => (
          <label key={i}>被動{i + 1}:
            <select value={passiveKeys[i] ?? ''} onChange={e => {
              const newPassives = [...(hero.passives ?? [])]
              if (e.target.value) {
                newPassives[i] = TEST_SKILLS[e.target.value]
              } else {
                newPassives.splice(i, 1)
              }
              onChange({ ...hero, passives: newPassives.filter(Boolean) })
            }} data-testid={`passive-${i}-${label}`}>
              <option value="">（無）</option>
              {SKILL_KEYS.filter(k => TEST_SKILLS[k].type === 'passive').map(k => (
                <option key={k} value={k}>{TEST_SKILLS[k].name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════
   日誌類型顏色
   ════════════════════════════════════ */

const LOG_COLORS: Record<string, string> = {
  TURN_START: '#888',
  TURN_END: '#888',
  NORMAL_ATTACK: '#ff6b6b',
  SKILL_CAST: '#ffd93d',
  DOT_TICK: '#ff8c00',
  BUFF_APPLY: '#6bff6b',
  BUFF_EXPIRE: '#999',
  DEATH: '#ff0000',
  PASSIVE_TRIGGER: '#bb86fc',
  PASSIVE_DAMAGE: '#cf6679',
  ENERGY_CHANGE: '#4fc3f7',
  COUNTER_ATTACK: '#ff9800',
  CHASE_ATTACK: '#00e5ff',
  EXECUTE: '#ff1744',
  SHIELD_APPLY: '#ffd700',
  SHIELD_BREAK: '#ff6f00',
  BATTLE_END: '#ffd700',
  EXTRA_TURN: '#69f0ae',
  STEAL_BUFF: '#ab47bc',
  TRANSFER_DEBUFF: '#e53935',
}

const ACTION_TYPE_ZH: Record<string, string> = {
  TURN_START: '回合開始',
  TURN_END: '回合結束',
  NORMAL_ATTACK: '普攻',
  SKILL_CAST: '技能',
  DOT_TICK: '持續傷害',
  BUFF_APPLY: '狀態施加',
  BUFF_EXPIRE: '狀態消失',
  DEATH: '死亡',
  PASSIVE_TRIGGER: '效果觸發',
  PASSIVE_DAMAGE: '效果傷害',
  ENERGY_CHANGE: '能量變化',
  COUNTER_ATTACK: '反擊',
  CHASE_ATTACK: '追擊',
  EXECUTE: '斬殺',
  SHIELD_APPLY: '護盾施加',
  SHIELD_BREAK: '護盾破碎',
  BATTLE_END: '戰鬥結束',
  EXTRA_TURN: '額外行動',
  STEAL_BUFF: '偷取',
  TRANSFER_DEBUFF: '轉移',
}

/* ════════════════════════════════════
   主面板元件
   ════════════════════════════════════ */

interface BattleTestPanelProps {
  onBack: () => void
}

export function BattleTestPanel({ onBack }: BattleTestPanelProps) {
  const [selectedScenario, setSelectedScenario] = useState<string>(TEST_SCENARIOS[0]?.id ?? '')
  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [running, setRunning] = useState(false)
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([])
  const [winner, setWinner] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const logRef = useRef<HTMLDivElement>(null)

  // 自訂英雄（支援多英雄）
  const [customPlayers, setCustomPlayers] = useState<TestHeroConfig[]>([{
    name: '測試員A',
    side: 'player',
    slot: 0,
    stats: { ...BLANK_HERO_STATS },
    activeSkill: TEST_SKILLS.basic_damage,
    passives: [],
  }])
  const [customEnemies, setCustomEnemies] = useState<TestHeroConfig[]>([{
    name: '沙包B',
    side: 'enemy',
    slot: 0,
    stats: { ...BLANK_HERO_STATS, HP: 15000 },
    activeSkill: TEST_SKILLS.basic_damage,
    passives: [],
  }])

  // 效果統計
  const effectCounts = battleLog.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1
    return acc
  }, {})

  const runTest = useCallback(async () => {
    setRunning(true)
    setBattleLog([])
    setWinner(null)

    try {
      let players: BattleHero[]
      let enemies: BattleHero[]

      if (mode === 'preset') {
        const scenario = TEST_SCENARIOS.find(s => s.id === selectedScenario)
        if (!scenario) { setRunning(false); return }
        const built = buildTestBattle(scenario)
        players = built.players
        enemies = built.enemies
      } else {
        players = customPlayers.map((cfg, i) => createTestBattleHero({ ...cfg, slot: i }))
        enemies = customEnemies.map((cfg, i) => createTestBattleHero({ ...cfg, slot: i }))
      }

      const heroMap = new Map<string, BattleHero>()
      for (const h of [...players, ...enemies]) heroMap.set(h.uid, h)

      const result = await runBattleCollect(players, enemies, { maxTurns: 30 })

      const logs = result.actions.map(a => formatAction(a, heroMap))
      setBattleLog(logs)
      setWinner(result.winner)

      // 自動滾到底
      setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 100)
    } catch (err) {
      setBattleLog([{ turn: 0, type: 'ERROR', detail: `錯誤: ${err}`, raw: { type: 'BATTLE_END', winner: 'draw' } as BattleAction }])
    } finally {
      setRunning(false)
    }
  }, [mode, selectedScenario, customPlayers, customEnemies])

  const filteredLog = typeFilter === 'ALL' ? battleLog : battleLog.filter(e => e.type === typeFilter)
  const activeTypes = [...new Set(battleLog.map(e => e.type))]

  const currentScenario = TEST_SCENARIOS.find(s => s.id === selectedScenario)

  return (
    <div className="menu-panel battle-test-panel" data-testid="battle-test-panel" style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.95)',
      color: '#eee', display: 'flex', flexDirection: 'column', padding: 12, overflow: 'hidden',
      fontFamily: 'monospace',
    }}>
      {/* 標題列 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, color: '#ffd700' }}>🧪 戰鬥效果測試沙盒</h2>
        <button onClick={onBack} className="btn" data-testid="test-back-btn" style={{ padding: '4px 12px' }}>← 返回</button>
      </div>

      {/* 模式切換 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={() => setMode('preset')} className="btn"
          data-testid="mode-preset"
          style={{ background: mode === 'preset' ? '#457b9d' : '#333', padding: '4px 12px' }}>
          📋 預設情境
        </button>
        <button onClick={() => setMode('custom')} className="btn"
          data-testid="mode-custom"
          style={{ background: mode === 'custom' ? '#457b9d' : '#333', padding: '4px 12px' }}>
          ✏️ 自訂英雄
        </button>
      </div>

      {/* 配置區 */}
      <div style={{ marginBottom: 8, background: '#1a1a2e', padding: 8, borderRadius: 8, maxHeight: mode === 'custom' ? 280 : 160, overflowY: 'auto' }}>
        {mode === 'preset' ? (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {TEST_SCENARIOS.map(s => (
                <button key={s.id} onClick={() => setSelectedScenario(s.id)}
                  data-testid={`scenario-${s.id}`}
                  className="btn"
                  style={{
                    padding: '4px 10px', fontSize: 12,
                    background: selectedScenario === s.id ? '#2a9d8f' : '#333',
                    border: selectedScenario === s.id ? '2px solid #ffd700' : '1px solid #555',
                  }}>
                  {s.name}
                </button>
              ))}
            </div>
            {currentScenario && (
              <div style={{ fontSize: 12, color: '#aaa' }}>
                <div><strong>描述：</strong>{currentScenario.description}</div>
                <div><strong>預期效果：</strong>{currentScenario.expectedEffects.join(', ')}</div>
                <div style={{ marginTop: 4 }}>
                  <strong>玩家方：</strong>
                  {currentScenario.players.map(p => `${p.name} (HP:${p.stats.HP} ATK:${p.stats.ATK} SPD:${p.stats.SPD}${p.passives?.map(ps => ` [${ps.name}]`).join('') ?? ''})`).join(' | ')}
                </div>
                <div>
                  <strong>敵方：</strong>
                  {currentScenario.enemies.map(p => `${p.name} (HP:${p.stats.HP} ATK:${p.stats.ATK} SPD:${p.stats.SPD}${p.passives?.map(ps => ` [${ps.name}]`).join('') ?? ''})`).join(' | ')}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#6bff6b', fontWeight: 'bold' }}>▸ 玩家方 ({customPlayers.length})</span>
              {customPlayers.length < 6 && (
                <button className="btn" data-testid="add-player" style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => setCustomPlayers(prev => [...prev, {
                    name: `測試員${String.fromCharCode(65 + prev.length)}`,
                    side: 'player', slot: prev.length,
                    stats: { ...BLANK_HERO_STATS }, activeSkill: TEST_SKILLS.basic_damage, passives: [],
                  }])}>+ 新增</button>
              )}
            </div>
            {customPlayers.map((h, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <CustomHeroEditor hero={h} label={`player-${i}`}
                  onChange={updated => setCustomPlayers(prev => prev.map((p, j) => j === i ? updated : p))} />
                {customPlayers.length > 1 && (
                  <button className="btn" style={{ position: 'absolute', top: 0, right: 0, padding: '1px 6px', fontSize: 10, background: '#c0392b' }}
                    data-testid={`remove-player-${i}`}
                    onClick={() => setCustomPlayers(prev => prev.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
            ))}
            <hr style={{ borderColor: '#333', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>▸ 敵方 ({customEnemies.length})</span>
              {customEnemies.length < 6 && (
                <button className="btn" data-testid="add-enemy" style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => setCustomEnemies(prev => [...prev, {
                    name: `敵人${String.fromCharCode(88 + prev.length)}`,
                    side: 'enemy', slot: prev.length,
                    stats: { ...BLANK_HERO_STATS }, activeSkill: TEST_SKILLS.basic_damage, passives: [],
                  }])}>+ 新增</button>
              )}
            </div>
            {customEnemies.map((h, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <CustomHeroEditor hero={h} label={`enemy-${i}`}
                  onChange={updated => setCustomEnemies(prev => prev.map((e, j) => j === i ? updated : e))} />
                {customEnemies.length > 1 && (
                  <button className="btn" style={{ position: 'absolute', top: 0, right: 0, padding: '1px 6px', fontSize: 10, background: '#c0392b' }}
                    data-testid={`remove-enemy-${i}`}
                    onClick={() => setCustomEnemies(prev => prev.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 執行按鈕 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <button onClick={runTest} disabled={running} className="btn"
          data-testid="run-battle-btn"
          style={{ padding: '6px 20px', background: running ? '#555' : '#e74c3c', fontWeight: 'bold', fontSize: 14 }}>
          {running ? '⏳ 執行中...' : '⚔️ 開始戰鬥'}
        </button>
        {winner && (
          <span data-testid="battle-result" style={{
            fontWeight: 'bold', fontSize: 16,
            color: winner === 'player' ? '#00ff88' : winner === 'enemy' ? '#ff4444' : '#ffaa00',
          }}>
            結果: {winner === 'player' ? '✅ 玩家勝利' : winner === 'enemy' ? '❌ 敵方勝利' : '⏸️ 平手'}
          </span>
        )}
      </div>

      {/* 效果統計 */}
      {battleLog.length > 0 && (
        <div style={{ marginBottom: 6, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}
          data-testid="effect-stats">
          <button onClick={() => setTypeFilter('ALL')} className="btn"
            style={{ padding: '2px 8px', background: typeFilter === 'ALL' ? '#457b9d' : '#222', fontSize: 11 }}>
            全部 ({battleLog.length})
          </button>
          {activeTypes.filter(t => t !== 'TURN_START' && t !== 'TURN_END').map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className="btn"
              data-testid={`filter-${t}`}
              style={{
                padding: '2px 8px', fontSize: 11,
                background: typeFilter === t ? '#457b9d' : '#222',
                color: LOG_COLORS[t] ?? '#eee',
                border: `1px solid ${LOG_COLORS[t] ?? '#555'}`,
              }}>
              {ACTION_TYPE_ZH[t] ?? t} ({effectCounts[t] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* 戰鬥日誌 */}
      <div ref={logRef} data-testid="battle-log"
        style={{
          flex: 1, overflowY: 'auto', background: '#0d0d0d', borderRadius: 6,
          padding: 8, fontSize: 12, lineHeight: 1.6,
        }}>
        {filteredLog.length === 0 && !running && (
          <div style={{ color: '#555', textAlign: 'center', marginTop: 40 }}>
            選擇測試情境或自訂英雄，點擊「開始戰鬥」執行測試
          </div>
        )}
        {filteredLog.map((entry, i) => (
          <div key={i} data-testid={`log-${i}`} data-log-type={entry.type} data-log-turn={entry.turn}
            style={{ color: LOG_COLORS[entry.type] ?? '#eee', borderBottom: '1px solid #1a1a1a', padding: '1px 0' }}>
            <span style={{ color: '#555', marginRight: 6 }}>[T{entry.turn}]</span>
            <span style={{ color: '#666', marginRight: 6, fontSize: 10 }}>{ACTION_TYPE_ZH[entry.type] ?? entry.type}</span>
            {entry.detail}
          </div>
        ))}
      </div>

      {/* Playwright 用的隱藏結構化資料 */}
      <div data-testid="battle-summary" style={{ display: 'none' }}>
        <span data-testid="summary-winner">{winner ?? ''}</span>
        <span data-testid="summary-total-actions">{battleLog.length}</span>
        {Object.entries(effectCounts).map(([type, count]) => (
          <span key={type} data-testid={`summary-count-${type}`}>{count}</span>
        ))}
      </div>
    </div>
  )
}
