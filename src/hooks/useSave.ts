/**
 * useSave — 存檔系統 React Hook
 *
 * 包裝 saveService，提供 React 響應式狀態 + 操作方法。
 * 自動在頁面關閉前同步未寫入變更。
 *
 * 對應 Spec: specs/save-system.md v0.2
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  loadSave,
  getSaveState,
  onSaveChange,
  updateProgress,
  updateStoryProgress,
  updateStageStars,
  saveFormation,
  addHero,
  collectResources,
  flushPendingChanges,
  getAccumulatedResources,
  clearLocalSaveCache,
  type PlayerData,
  type SaveData,
  type HeroInstance,
  type AccumulatedResources,
} from '../services/saveService'
import { clearLocalPool } from '../services/gachaLocalPool'

export interface UseSaveReturn {
  /** 完整存檔資料 */
  playerData: PlayerData | null
  /** 是否正在載入 */
  loading: boolean
  /** 錯誤訊息 */
  error: string | null
  /** 載入存檔（登入後呼叫一次） */
  doLoadSave: () => Promise<PlayerData | null>
  /** 更新進度（金幣、鑽石、等級、經驗等） */
  doUpdateProgress: (changes: Partial<Pick<SaveData,
    'gold' | 'diamond' | 'level' | 'exp' | 'displayName' |
    'towerFloor' | 'resourceTimerStage'
  >>) => void
  /** 更新劇情進度 */
  doUpdateStory: (chapter: number, stage: number) => void
  /** 更新關卡星級 */
  doUpdateStageStars: (stageId: string, stars: number) => void
  /** 儲存陣型 */
  doSaveFormation: (formation: (string | null)[]) => Promise<boolean>
  /** 新增英雄 */
  doAddHero: (heroId: number) => Promise<HeroInstance | null>
  /** 領取計時器資源 */
  doCollectResources: () => Promise<AccumulatedResources | null>
  /** 取得目前累積的資源預覽（不實際領取） */
  getResourcePreview: () => AccumulatedResources | null
  /** 清除本地快取 + 狀態 */
  doClearCache: () => void
}

export function useSave(): UseSaveReturn {
  const [playerData, setPlayerData] = useState<PlayerData | null>(getSaveState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  // 訂閱 saveService 狀態
  useEffect(() => {
    mounted.current = true
    const unsub = onSaveChange((data) => {
      if (mounted.current) setPlayerData(data)
    })
    return () => {
      mounted.current = false
      unsub()
    }
  }, [])

  // 頁面關閉前同步
  useEffect(() => {
    const handler = () => {
      flushPendingChanges()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const doLoadSave = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadSave()
      if (mounted.current) setPlayerData(data)
      return data
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (mounted.current) setError(msg)
      console.error('[useSave] loadSave failed:', msg)
      return null
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const doUpdateProgress = useCallback((changes: Partial<Pick<SaveData,
    'gold' | 'diamond' | 'level' | 'exp' | 'displayName' |
    'towerFloor' | 'resourceTimerStage'
  >>) => {
    updateProgress(changes)
  }, [])

  const doUpdateStory = useCallback((chapter: number, stage: number) => {
    updateStoryProgress(chapter, stage)
  }, [])

  const doUpdateStageStars = useCallback((stageId: string, stars: number) => {
    updateStageStars(stageId, stars)
  }, [])

  const doSaveFormation = useCallback(async (formation: (string | null)[]) => {
    return saveFormation(formation)
  }, [])

  const doAddHero = useCallback(async (heroId: number) => {
    return addHero(heroId)
  }, [])

  const doCollectResources = useCallback(async () => {
    return collectResources()
  }, [])

  const getResourcePreview = useCallback((): AccumulatedResources | null => {
    const data = getSaveState()
    if (!data) return null
    // 尚未通關 1-1 → 離線獎勵未解鎖
    const sp = data.save.storyProgress
    if (sp && sp.chapter === 1 && sp.stage === 1) return null
    return getAccumulatedResources(
      data.save.resourceTimerStage,
      data.save.resourceTimerLastCollect,
    )
  }, [])

  const doClearCache = useCallback(() => {
    clearLocalSaveCache()
    clearLocalPool()
    if (mounted.current) {
      setPlayerData(null)
      setError(null)
    }
  }, [])

  return {
    playerData,
    loading,
    error,
    doLoadSave,
    doUpdateProgress,
    doUpdateStory,
    doUpdateStageStars,
    doSaveFormation,
    doAddHero,
    doCollectResources,
    getResourcePreview,
    doClearCache,
  }
}
