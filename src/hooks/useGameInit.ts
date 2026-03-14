/**
 * useGameInit — 遊戲初始化：資料載入 + Phase 0/1/2 Effects
 *
 * 從 App.tsx 抽出，管理 fetchData、存檔提前載入、PWA 獎勵等。
 * GLB 模型與縮圖統一走 Suspense 懶載入，不做背景預載。
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { RawHeroData, SlotHero, GameState } from '../types'
import type { SkillTemplate } from '../domain'
import type { HeroSkillConfig } from '../domain/types'
import type { RawHeroInput } from '../domain'
import type { MailItem } from '../services/mailService'
import type { SaveData, HeroInstance } from '../services/saveService'
import { loadAllGameData, loadRawHeroes } from '../services'
import { getSaveState } from '../services/saveService'
import { loadInventory } from '../services/inventoryService'
import { preloadMail } from '../services/mailService'
import { isStandalone, claimPwaReward } from '../services/pwaService'
import { normalizeModelId, clamp01 } from '../game/helpers'
import { INITIAL_CURTAIN_GRACE_MS } from '../game/constants'

export interface GameInitDeps {
  /* ── 外部 hooks ── */
  authIsLoggedIn: boolean
  authGuestToken: string | null | undefined
  saveDoLoadSave: () => Promise<unknown>
  savePlayerData: { save: SaveData; heroes: HeroInstance[] } | null

  /* ── 狀態設定 ── */
  setGameState: (s: GameState) => void
  setCurtainText: (t: string) => void
  closeCurtain: (delayMs?: number) => Promise<boolean>
  initialReady: React.MutableRefObject<boolean>

  setHeroesList: (h: RawHeroData[]) => void
  heroesListRef: React.MutableRefObject<RawHeroData[]>
  skillsRef: React.MutableRefObject<Map<string, SkillTemplate>>
  heroSkillsRef: React.MutableRefObject<Map<number, HeroSkillConfig>>
  heroInputsRef: React.MutableRefObject<RawHeroInput[]>

  updatePlayerSlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  formationRestoredRef: React.MutableRefObject<boolean>

  setSpeed: (s: number) => void
  setMailItems: (m: MailItem[]) => void
  setMailLoaded: (b: boolean) => void
  refreshMailData: () => Promise<void>
  showGame: boolean
  gameState: GameState
}

export function useGameInit(deps: GameInitDeps) {
  const {
    authIsLoggedIn, authGuestToken, saveDoLoadSave, savePlayerData,
    setGameState, setCurtainText, closeCurtain, initialReady,
    setHeroesList, heroesListRef, skillsRef, heroSkillsRef, heroInputsRef,
    updatePlayerSlots, formationRestoredRef,
    setSpeed, setMailItems, setMailLoaded, refreshMailData,
    showGame, gameState,
  } = deps

  const [preloadProgress, setPreloadProgress] = useState<number | null>(null)
  const didInitFetch = useRef(false)

  /* ── 提前背景載入（登入期間就開始，不阻塞 loading 畫面） ── */
  const earlySaveRef = useRef<Promise<unknown> | null>(null)
  const earlyInvRef = useRef<Promise<unknown> | null>(null)
  const earlySaveStarted = useRef(false)

  /* ── 資料載入 ── */
  const fetchData = useRef<(() => Promise<void>) | null>(null)
  fetchData.current = async () => {
    const stageWeight = { fetch: 0.7, finalize: 0.3 }
    const stageProgress = { fetch: 0, finalize: 0 }
    let lastReported = 0
    const refresh = () => {
      const total =
        stageProgress.fetch * stageWeight.fetch +
        stageProgress.finalize * stageWeight.finalize
      const clamped = clamp01(total)
      if (clamped > lastReported) {
        lastReported = clamped
        setPreloadProgress(clamped)
      }
    }

    try {
      setGameState('FETCHING')
      setCurtainText('載入資源中...')
      setPreloadProgress(0)

      const [gameData] = await Promise.all([
        loadAllGameData((r) => { stageProgress.fetch = r; refresh() }),
        earlySaveRef.current ?? Promise.resolve(),
        earlyInvRef.current ?? Promise.resolve(),
      ])
      stageProgress.fetch = 1; refresh()

      // loadAllGameData 內部已呼叫 readSheet('heroes')，這裡直接從 sheetApi 快取取原始資料
      const data = (await loadRawHeroes()) as RawHeroData[]
      setHeroesList(data)
      heroesListRef.current = data
      skillsRef.current = gameData.skills
      heroSkillsRef.current = gameData.heroSkills
      heroInputsRef.current = gameData.heroes
      if (!data.length) return

      // 從存檔恢復上次上陣陣型
      try {
        const saveState = getSaveState()
        const savedFormation = saveState?.save.formation
        if (savedFormation && Array.isArray(savedFormation)) {
          const heroMap = new Map<string, { hero: RawHeroData; idx: number }>()
          data.forEach((h, idx) => {
            const hid = String(h.HeroID ?? h.id ?? idx + 1)
            heroMap.set(hid, { hero: h, idx })
          })
          const ownedIds = new Set(
            (saveState?.heroes ?? []).map(h => String(h.heroId)),
          )
          const restored: (SlotHero | null)[] = savedFormation.map((heroId, slot) => {
            if (!heroId) return null
            const hid = String(heroId)
            if (!ownedIds.has(hid)) return null
            const found = heroMap.get(hid)
            if (!found) return null
            const { hero, idx } = found
            const mid = normalizeModelId(hero, idx)
            return {
              ...hero,
              currentHP: (hero.HP ?? 1) as number,
              _uid: `${mid}_player_${slot}`,
              _modelId: mid,
              ModelID: mid,
            }
          })
          if (restored.some(Boolean)) {
            updatePlayerSlots(() => restored)
          }
        }
      } catch (e) { console.warn('[formation restore]', e) }
      formationRestoredRef.current = true

      // 恢復戰鬥倍速
      try {
        const savedSpeed = Number(localStorage.getItem('battleSpeed'))
        if (savedSpeed && [1, 2, 4, 6].includes(savedSpeed)) {
          setSpeed(savedSpeed)
        }
      } catch (e) { console.warn('[speed restore]', e) }

      stageProgress.finalize = 0.5; refresh()
      setCurtainText('初始化戰場...')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      stageProgress.finalize = 1; refresh()

      setGameState('MAIN_MENU')
      await closeCurtain(INITIAL_CURTAIN_GRACE_MS)
    } catch (err) {
      console.error('[fetchData]', err)
      setPreloadProgress(null)
      await closeCurtain(INITIAL_CURTAIN_GRACE_MS)
    }
  }

  // ── Phase 0: 公開資料 — 元件掛載後立刻開始（可能因無 token 而失敗，僅作為擴熱快取）──
  useEffect(() => {
    loadAllGameData().catch(() => { })
  }, [])

  // ── Phase 1: 認證成功 → 背景載入存檔 & 信箱 & 背包 ──
  useEffect(() => {
    if (!authIsLoggedIn || earlySaveStarted.current) return
    earlySaveStarted.current = true
    earlySaveRef.current = saveDoLoadSave().catch(e => console.warn('[early] save load failed:', e))
    earlyInvRef.current = loadInventory().catch(e => console.warn('[early] inventory load failed:', e))
    preloadMail()
      .then(({ mails }) => { setMailItems(mails); setMailLoaded(true) })
      .catch(e => console.warn('[early] mail preload failed:', e))
  }, [authIsLoggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── PWA: 自動領取安裝獎勵 ──
  useEffect(() => {
    if (!isStandalone()) return
    if (!authIsLoggedIn || !authGuestToken) return
    const save = savePlayerData?.save
    if (!save) return
    if (save.pwaRewardClaimed === true || save.pwaRewardClaimed === ('true' as unknown as boolean)) return
    claimPwaReward(authGuestToken)
      .then((res) => {
        if (res.success) refreshMailData()
      })
      .catch(() => { /* silent */ })
  }, [authIsLoggedIn, authGuestToken, savePlayerData?.save]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 2: showGame → 走 fetchData 匯總 ──
  useEffect(() => {
    if (!showGame) return
    if (didInitFetch.current) return
    didInitFetch.current = true
    fetchData.current?.()
  }, [showGame])

  // 長載入提示
  useEffect(() => {
    const t = setTimeout(() => {
      if (!initialReady.current && gameState === 'FETCHING') setCurtainText('載入資源中...')
    }, 12000)
    return () => clearTimeout(t)
  }, [gameState]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 重置初始化守門旗標（登出時使用） */
  const resetInitRefs = useCallback(() => {
    didInitFetch.current = false
    earlySaveStarted.current = false
    earlySaveRef.current = null
    setPreloadProgress(null)
  }, [])

  return {
    preloadProgress,
    resetInitRefs,
  }
}
