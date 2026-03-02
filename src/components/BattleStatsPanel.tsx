/**
 * BattleStatsPanel — 戰鬥統計面板
 *
 * 顯示我方/敵方各英雄的輸出、治療、承傷長條圖。
 */

export interface BattleStatEntry {
  name: string
  side: 'player' | 'enemy'
  damageDealt: number
  healingDone: number
  damageTaken: number
}

interface Props {
  stats: Record<string, BattleStatEntry>
  onClose: () => void
}

export function BattleStatsPanel({ stats, onClose }: Props) {
  const allEntries = Object.entries(stats)
  const maxDmg = Math.max(1, ...allEntries.map(([, s]) => s.damageDealt))
  const maxHeal = Math.max(1, ...allEntries.map(([, s]) => s.healingDone))
  const maxTaken = Math.max(1, ...allEntries.map(([, s]) => s.damageTaken))

  const renderRow = (uid: string, s: BattleStatEntry, isEnemy: boolean) => (
    <div key={uid} className={`battle-stats-row ${isEnemy ? 'enemy' : ''}`}>
      <div className="bs-hero-name">{s.name}</div>
      <div className="bs-bar-group">
        <div className="bs-bar-row">
          <span className="bs-bar-label damage">輸出</span>
          <div className="bs-bar-track">
            <div className="bs-bar-fill damage" style={{ width: `${(s.damageDealt / maxDmg) * 100}%` }} />
          </div>
          <span className="bs-bar-value damage">{s.damageDealt.toLocaleString()}</span>
        </div>
        {maxHeal > 1 && (
          <div className="bs-bar-row">
            <span className="bs-bar-label heal">治療</span>
            <div className="bs-bar-track">
              <div className="bs-bar-fill heal" style={{ width: `${(s.healingDone / maxHeal) * 100}%` }} />
            </div>
            <span className="bs-bar-value heal">{s.healingDone.toLocaleString()}</span>
          </div>
        )}
        <div className="bs-bar-row">
          <span className="bs-bar-label taken">承傷</span>
          <div className="bs-bar-track">
            <div className="bs-bar-fill taken" style={{ width: `${(s.damageTaken / maxTaken) * 100}%` }} />
          </div>
          <span className="bs-bar-value taken">{s.damageTaken.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="battle-stats-overlay" onClick={onClose}>
      <div className="battle-stats-panel" onClick={e => e.stopPropagation()}>
        <div className="battle-stats-header">
          <span>⚔️ 戰鬥統計</span>
          <button className="battle-stats-close" onClick={onClose}>✕</button>
        </div>
        <div className="battle-stats-section">
          <div className="battle-stats-section-title">🟢 我方</div>
          {allEntries
            .filter(([, s]) => s.side === 'player')
            .sort(([, a], [, b]) => b.damageDealt - a.damageDealt)
            .map(([uid, s]) => renderRow(uid, s, false))}
        </div>
        <div className="battle-stats-section">
          <div className="battle-stats-section-title">🔴 敵方</div>
          {allEntries
            .filter(([, s]) => s.side === 'enemy')
            .sort(([, a], [, b]) => b.damageDealt - a.damageDealt)
            .map(([uid, s]) => renderRow(uid, s, true))}
        </div>
      </div>
    </div>
  )
}
