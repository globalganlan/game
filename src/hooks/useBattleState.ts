/**
 * useBattleState — 戰鬥中介狀態 & refs 統一管理
 *
 * 從 App.tsx 抽出：turn / speed / battleResult / victoryRewards /
 * battleStats / actorStates / domain refs / setActorState 等。
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import type { ActorState } from '../types'
import type { BattleHero, BattleAction, SkillTemplate } from '../domain'
import type { HeroSkillConfig } from '../domain/types'
import type { RawHeroInput } from '../domain'
import type { Vector3Tuple } from 'three'
import type { CompleteBattleResult } from '../services/progressionService'
import type { BattleStatEntry } from '../components/BattleStatsPanel'
import type { VictoryRewards } from '../components/VictoryPanel'
import { BattleFlowValidator } from '../domain/battleFlowValidator'

export function useBattleState() {
  /* ── Turn & Speed ── */
  const [turn, setTurn] = useState(0)
  const turnRef = useRef(0)
  const [battleCalculating, setBattleCalculating] = useState(false)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
  /** 跳過戰鬥旗標 */
  const skipBattleRef = useRef(false)
  useEffect(() => { speedRef.current = speed }, [speed])

  /* ── Battle Result ── */
  const [battleResult, setBattleResult] = useState<'victory' | 'defeat' | null>(null)
  /** 勝利獎勵結算資料（勝利時才有值） */
  const [victoryRewards, setVictoryRewards] = useState<VictoryRewards | null>(null)

  /* ── Domain Engine Data ── */
  const skillsRef = useRef<Map<string, SkillTemplate>>(new Map())
  const heroSkillsRef = useRef<Map<number, HeroSkillConfig>>(new Map())
  const heroInputsRef = useRef<RawHeroInput[]>([])
  /** BattleHero map during battle — uid → BattleHero */
  const battleHeroesRef = useRef<Map<string, BattleHero>>(new Map())

  /* ── 戰鬥紀錄 & 統計 ── */
  const battleActionsRef = useRef<BattleAction[]>([])
  const [battleStats, setBattleStats] = useState<Record<string, BattleStatEntry>>({})
  const [showBattleStats, setShowBattleStats] = useState(false)
  const isReplayingRef = useRef(false)

  /* ── Actor State ── */
  const [actorStates, setActorStates] = useState<Record<string, ActorState>>({})
  const actorStatesRef = useRef<Record<string, ActorState>>({})
  /** 前進目標位置（世界座標），uid → [x, y, z] */
  const moveTargetsRef = useRef<Record<string, Vector3Tuple>>({})
  /** 戰鬥流程驗證器（僅 dev 模式啟用） */
  const flowValidatorRef = useRef<BattleFlowValidator | null>(null)
  /** 戰鬥結算 Promise（complete-battle：伺服器端戰鬥模擬 + 獎勵計算） */
  const completeBattleRef = useRef<Promise<CompleteBattleResult> | null>(null)

  const setActorState = useCallback((id: string, s: ActorState) => {
    // dev 模式：驗證狀態轉換合法性
    if (import.meta.env.DEV && flowValidatorRef.current) {
      flowValidatorRef.current.transition(id, s)
    }
    actorStatesRef.current = { ...actorStatesRef.current, [id]: s }
    setActorStates(actorStatesRef.current)
  }, [])

  /** 重置所有戰鬥相關 state/ref（登出時使用） */
  const resetBattleRefs = useCallback(() => {
    setBattleResult(null)
    setVictoryRewards(null)
    setBattleStats({})
    setShowBattleStats(false)
    setBattleCalculating(false)
    setTurn(0); turnRef.current = 0
    // 戰鬥倍速從 localStorage 恢復（使用者偏好應跨局保留）
    const savedSpd = Number(localStorage.getItem('battleSpeed'))
    const restoredSpd = savedSpd && [1, 2, 4, 8].includes(savedSpd) ? savedSpd : 1
    setSpeed(restoredSpd); speedRef.current = restoredSpd
    skipBattleRef.current = false
    setActorStates({}); actorStatesRef.current = {}
    moveTargetsRef.current = {}
    battleHeroesRef.current = new Map()
    battleActionsRef.current = []
    isReplayingRef.current = false
  }, [])

  return {
    // Turn & Speed
    turn, setTurn, turnRef,
    battleCalculating, setBattleCalculating,
    speed, setSpeed, speedRef, skipBattleRef,
    // Battle result
    battleResult, setBattleResult,
    victoryRewards, setVictoryRewards,
    // Domain data refs
    skillsRef, heroSkillsRef, heroInputsRef, battleHeroesRef,
    // Battle records
    battleActionsRef,
    battleStats, setBattleStats,
    showBattleStats, setShowBattleStats,
    isReplayingRef,
    // Actor state
    actorStates, setActorStates, actorStatesRef,
    moveTargetsRef, flowValidatorRef,
    completeBattleRef,
    setActorState,
    // Reset
    resetBattleRefs,
  }
}
