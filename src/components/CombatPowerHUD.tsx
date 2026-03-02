/**
 * CombatPowerHUD — 戰力顯示 + 變動飛行動畫 + 敵我對比條
 *
 * 對應 Spec: specs/combat-power.md v0.1
 */

import { COMPARISON_TEXT, COMPARISON_COLOR, type ComparisonLevel } from '../domain/combatPower'
import { CurrencyIcon } from './CurrencyIcon'

/* ════════════════════════════════════
   戰力飛行 Toast（飄字動畫）
   ════════════════════════════════════ */

export function CombatPowerToast({ delta, finalPower }: { delta: number; finalPower?: number }) {
    if (delta === 0) return null
    const isUp = delta > 0
    const deltaColor = isUp ? '#4cff4c' : '#ff4c4c'

    return (
        <div
            className={`combat-power-toast ${isUp ? 'up' : 'down'}`}
            key={delta + Date.now()}
        >
            <CurrencyIcon type="cp" /> 戰力 {finalPower != null ? finalPower.toLocaleString() : ''}{' '}
            <span style={{ color: deltaColor, fontWeight: 'bold' }}>
                {isUp ? `+${delta.toLocaleString()} ↑` : `${delta.toLocaleString()} ↓`}
            </span>
        </div>
    )
}

/* ════════════════════════════════════
   敵我對比條（IDLE 狀態顯示）
   ════════════════════════════════════ */

export function CombatPowerComparison({
    myPower,
    enemyPower,
    comparison,
}: {
    myPower: number
    enemyPower: number
    comparison: ComparisonLevel
}) {
    const total = myPower + enemyPower
    const myPct = total > 0 ? (myPower / total) * 100 : 50
    const label = COMPARISON_TEXT[comparison]
    const color = COMPARISON_COLOR[comparison]

    return (
        <div className="cp-comparison">
            <div className="cp-comparison-header">
                <span className="cp-comparison-my"><CurrencyIcon type="cp" />{myPower.toLocaleString()}</span>
                <span className="cp-comparison-label" style={{ color }}> {label} </span>
                <span className="cp-comparison-enemy"><CurrencyIcon type="cp" />{enemyPower.toLocaleString()}</span>
            </div>
            <div className="cp-comparison-bar">
                <div className="cp-bar-my" style={{ width: `${myPct}%` }} />
                <div className="cp-bar-enemy" style={{ width: `${100 - myPct}%` }} />
            </div>
            {comparison === 'danger' && (
                <div className="cp-danger-flash">⚠️ 敵方實力遠超我方！</div>
            )}
        </div>
    )
}
