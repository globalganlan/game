/**
 * useBgm — BGM 自動切換
 *
 * 從 App.tsx 抽出：根據遊戲狀態自動切換背景音樂。
 */
import { useEffect } from 'react'
import { audioManager } from '../services/audioService'
import type { GameState, MenuScreen } from '../types'

export function useBgm(
  showGame: boolean,
  gameState: GameState,
  menuScreen: MenuScreen,
  battleResult: 'victory' | 'defeat' | null,
) {
  useEffect(() => {
    if (!showGame) {
      audioManager.playBgm('login')
      return
    }
    if (gameState === 'GAMEOVER') {
      audioManager.playBgm(battleResult === 'victory' ? 'victory' : 'defeat')
    } else if (gameState === 'BATTLE') {
      audioManager.playBgm('battle')
    } else if (gameState === 'MAIN_MENU') {
      if (menuScreen === 'gacha') {
        audioManager.playBgm('gacha')
      } else {
        audioManager.playBgm('lobby')
      }
    } else if (gameState === 'IDLE') {
      audioManager.playBgm('lobby')
    }
  }, [showGame, gameState, menuScreen, battleResult])
}
