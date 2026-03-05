/**
 * GameOverButtons — 勝負結算按鈕組
 */

interface Props {
  battleResult: 'victory' | 'defeat' | null
  stageMode: string
  onNextStage: () => void
  onRetry: () => void
  onReplay: () => void
  onShowStats: () => void
  onBackToLobby: () => void
}

export function GameOverButtons({ battleResult, stageMode, onNextStage, onRetry, onReplay, onShowStats, onBackToLobby }: Props) {
  return (
    <div className="btn-bottom-center">
      {battleResult === 'victory' && stageMode !== 'daily' && stageMode !== 'pvp' && stageMode !== 'boss' && (
        <button onClick={onNextStage} className="btn-next-stage">
          {stageMode === 'tower' ? '下一層 ▶' : '下一關 ▶'}
        </button>
      )}
      {battleResult !== 'victory' && (
        <button onClick={onRetry} className="btn-reset">重試</button>
      )}
      <button onClick={onReplay} className="btn-replay">回放 ⏪</button>
      <button onClick={onShowStats} className="btn-stats">戰鬥資訊 📊</button>
      <button onClick={onBackToLobby} className="btn-back-lobby">返回</button>
    </div>
  )
}
