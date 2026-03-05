/**
 * VictoryPanel — 勝負標語 + 獎勵面板
 */

import { CurrencyIcon, ItemIcon } from './CurrencyIcon'
import { ClickableItemIcon } from './ClickableItemIcon'
import { getItemName } from '../constants/rarity'

export interface VictoryRewards {
  gold: number
  diamond: number
  exp: number
  drops: { itemId: string; quantity: number }[]
  resourceSpeed: { goldPerHour: number; expPerHour: number } | null
}

interface Props {
  battleResult: 'victory' | 'defeat'
  victoryRewards: VictoryRewards | null
  stageMode: string
  stageId: string
}

export function VictoryPanel({ battleResult, victoryRewards, stageMode, stageId }: Props) {
  return (
    <div className={`battle-result-banner ${battleResult}`}>
      <span className="banner-text">{battleResult === 'victory' ? '勝利' : '敗北'}</span>
      <span className="banner-sub">{battleResult === 'victory' ? '你生存了下來' : '你淪為了它們的一員'}</span>

      {/* 勝利獎勵面板 */}
      {battleResult === 'victory' && victoryRewards && (
        <div className="victory-rewards-panel">
          {stageMode === 'tower' && (
            <div className="reward-floor-clear">🗼 第 {stageId} 層通關！</div>
          )}
          {stageMode === 'pvp' && (
            <div className="reward-floor-clear">⚔️ 競技場勝利！</div>
          )}
          {stageMode === 'boss' && (
            <div className="reward-floor-clear">👹 Boss 討伐完成！</div>
          )}

          {/* 獎勵明細（可點擊查看道具詳情） */}
          <div className="reward-items-list">
            <div className="reward-item">
              <span className="reward-icon gold"><ClickableItemIcon itemId="gold" /></span>
              <span className="reward-label">金幣</span>
              <span className="reward-value">+{victoryRewards.gold.toLocaleString()}</span>
            </div>
            {victoryRewards.diamond > 0 && (
              <div className="reward-item">
                <span className="reward-icon diamond"><ClickableItemIcon itemId="diamond" /></span>
                <span className="reward-label">鑽石</span>
                <span className="reward-value">+{victoryRewards.diamond}</span>
              </div>
            )}
            {victoryRewards.exp > 0 && (
              <div className="reward-item">
                <span className="reward-icon exp"><ClickableItemIcon itemId="exp" /></span>
                <span className="reward-label">經驗</span>
                <span className="reward-value">+{victoryRewards.exp.toLocaleString()}</span>
              </div>
            )}
            {victoryRewards.drops.map((d, i) => (
              <div className="reward-item" key={i}>
                <span className="reward-icon drop"><ClickableItemIcon itemId={d.itemId} /></span>
                <span className="reward-label">{getItemName(d.itemId)}</span>
                <span className="reward-value">×{d.quantity}</span>
              </div>
            ))}
          </div>

          {/* 資源產出速度（僅主線關卡） */}
          {victoryRewards.resourceSpeed && (
            <div className="reward-resource-speed">
              <span className="resource-speed-title">📈 離線資源產出</span>
              <span className="resource-speed-detail">
                金幣 {victoryRewards.resourceSpeed.goldPerHour}/時
                &nbsp;·&nbsp;
                經驗 {victoryRewards.resourceSpeed.expPerHour}/時
              </span>
              <span className="resource-speed-hint">通關越多關卡，產出速度越快！</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
