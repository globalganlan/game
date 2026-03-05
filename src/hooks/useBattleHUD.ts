/**
 * useBattleHUD — 戰鬥 HUD 狀態管理
 *
 * 從 App.tsx 抽出，管理 Buff / Energy / SkillToast / ElementHint / PassiveHint / BuffApplyHint。
 */
import { useState, useRef, useCallback } from 'react'
import type {
  BattleBuffMap,
  BattleEnergyMap,
  SkillToast,
  ElementHint,
  PassiveHint,
  BuffApplyHint,
} from '../components/BattleHUD'

export function useBattleHUD() {
  const [battleBuffs, setBattleBuffs] = useState<BattleBuffMap>({})
  const [battleEnergy, setBattleEnergy] = useState<BattleEnergyMap>({})
  const [skillToasts, setSkillToasts] = useState<SkillToast[]>([])
  const [elementHints, setElementHints] = useState<ElementHint[]>([])
  const [passiveHints, setPassiveHints] = useState<PassiveHint[]>([])
  const [buffApplyHints, setBuffApplyHints] = useState<BuffApplyHint[]>([])
  const [bossDamageProgress, setBossDamageProgress] = useState<number>(0)

  const skillToastIdRef = useRef(0)
  const elementHintIdRef = useRef(0)
  const passiveHintIdRef = useRef(0)
  const buffApplyHintIdRef = useRef(0)

  /** 清除所有 HUD 狀態（戰鬥重置用） */
  const resetBattleHUD = useCallback(() => {
    setBattleBuffs({})
    setBattleEnergy({})
    setSkillToasts([])
    setElementHints([])
    setPassiveHints([])
    setBuffApplyHints([])
    setBossDamageProgress(0)
  }, [])

  /** 完全重置（含 ref id 計數器歸零，登出時用） */
  const fullResetBattleHUD = useCallback(() => {
    resetBattleHUD()
    skillToastIdRef.current = 0
    elementHintIdRef.current = 0
    passiveHintIdRef.current = 0
    buffApplyHintIdRef.current = 0
  }, [resetBattleHUD])

  return {
    battleBuffs, setBattleBuffs,
    battleEnergy, setBattleEnergy,
    skillToasts, setSkillToasts,
    elementHints, setElementHints,
    passiveHints, setPassiveHints,
    buffApplyHints, setBuffApplyHints,
    bossDamageProgress, setBossDamageProgress,
    skillToastIdRef, elementHintIdRef,
    passiveHintIdRef, buffApplyHintIdRef,
    resetBattleHUD, fullResetBattleHUD,
  }
}
