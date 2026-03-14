/**
 * BattleSpeedControls — 倍速 + 跳過按鈕
 */

import { audioManager } from '../services/audioService'
import type { AnimationState } from '../types'
import type { ActionResolveEntry } from '../types'

interface Props {
  speed: number
  setSpeed: React.Dispatch<React.SetStateAction<number>>
  skipBattleRef: React.RefObject<boolean>
  actionResolveRefs: React.RefObject<Record<string, ActionResolveEntry>>
  moveResolveRefs: React.RefObject<Record<string, () => void>>
}

export function BattleSpeedControls({ speed, setSpeed, skipBattleRef, actionResolveRefs, moveResolveRefs }: Props) {
  return (
    <div className="btn-speed-wrap">
      <button
        onClick={() => setSpeed((s) => {
          const o = [1, 2, 4, 6]
          const nv = o[(o.indexOf(s) + 1) % o.length]
          localStorage.setItem('battleSpeed', String(nv))
          return nv
        })}
        className="btn-speed"
      >
        x{speed}
      </button>
      <button
        className="btn-skip-battle"
        onClick={() => {
          skipBattleRef.current = true
          // 立即 resolve 所有等待中的動畫/移動 Promise
          for (const key of Object.keys(actionResolveRefs.current)) {
            actionResolveRefs.current[key]?.resolve()
            delete actionResolveRefs.current[key]
          }
          for (const key of Object.keys(moveResolveRefs.current)) {
            moveResolveRefs.current[key]?.()
            delete moveResolveRefs.current[key]
          }
          audioManager.stopAllSfx()
        }}
      >
        跳過 ⏭
      </button>
    </div>
  )
}
