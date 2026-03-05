/**
 * useStageHandlers — 關卡選擇 / 競技場 / 每日簽到 handlers
 *
 * 從 App.tsx 抽出：handleStageSelect / handleArenaStartBattle /
 * handleCheckin / handleMenuNavigate / handleBackToMenu
 */
import { useCallback } from 'react'
import type { GameState, MenuScreen, SlotHero, RawHeroData } from '../types'
import type { AcquireItem } from '../hooks/useAcquireToast'
import type { SceneMode } from '../components/Arena'
import { getDailyDungeonDisplayName } from '../domain/stageSystem'
import { startArenaChallenge, getDefenseFormation, setDefenseFormation } from '../services/arenaService'
import { getItemName } from '../constants/rarity'
import { buildEnemySlotsFromStage, normalizeModelId } from '../game/helpers'
import { getStageConfig } from '../services/stageService'
import { waitFrames } from '../game/constants'
import { EMPTY_SLOTS } from '../game/constants'

/* ── 場景輪替配色池（基於 stageId 做確定性選取） ── */
const SCENE_POOL_BY_MODE: Record<string, SceneMode[]> = {
  tower: ['tower', 'underground', 'factory', 'hospital', 'city', 'core', 'forest'],
  daily: ['daily', 'wasteland', 'factory', 'underground', 'core'],
  pvp:   ['pvp', 'city', 'residential', 'forest', 'wasteland', 'underground'],
  boss:  ['boss', 'core', 'underground', 'factory'],
}

/** 根據 stageId 產生確定性雜湊，從場景池中選取場景 */
function pickSceneForStage(mode: string, stageId: string): SceneMode {
  const pool = SCENE_POOL_BY_MODE[mode]
  if (!pool || pool.length <= 1) return (mode as SceneMode)
  // 簡易確定性雜湊：將 stageId 各字元 charCode 加總
  let hash = 0
  for (let i = 0; i < stageId.length; i++) hash = (hash * 31 + stageId.charCodeAt(i)) | 0
  return pool[Math.abs(hash) % pool.length]
}

export interface StageHandlerDeps {
  setStageMode: (m: 'story' | 'tower' | 'daily' | 'pvp' | 'boss') => void
  setSceneTheme: (m: SceneMode) => void
  setStageId: (id: string) => void
  setMenuScreen: (m: MenuScreen) => void
  setGameState: (s: GameState) => void
  setCurtainVisible: (b: boolean) => void
  setCurtainFading: (b: boolean) => void
  setCurtainText: (t: string) => void
  curtainClosePromiseRef: React.MutableRefObject<Promise<boolean> | null>
  closeCurtain: () => Promise<boolean>
  updateEnemySlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  updatePlayerSlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  restoreFormationFromSave: (force?: boolean) => void
  showToast: (msg: string) => void
  acquireShow: (items: AcquireItem[]) => void
  heroesList: RawHeroData[]
  stageMode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss'
  arenaTargetRankRef: React.MutableRefObject<number>
  setIsDefenseSetup: (b: boolean) => void
  isDefenseSetupRef: React.MutableRefObject<boolean>
  heroesListRef: React.MutableRefObject<RawHeroData[]>
}

export function useStageHandlers(deps: StageHandlerDeps) {
  const {
    setStageMode, setSceneTheme, setStageId, setMenuScreen, setGameState,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    updateEnemySlots, updatePlayerSlots, restoreFormationFromSave,
    showToast, acquireShow, heroesList, stageMode, arenaTargetRankRef,
    setIsDefenseSetup, isDefenseSetupRef, heroesListRef,
  } = deps

  /* ── 主選單導航 ── */
  const handleMenuNavigate = useCallback((screen: MenuScreen) => { setMenuScreen(screen) }, [setMenuScreen])
  const handleBackToMenu = useCallback(() => { setMenuScreen('none') }, [setMenuScreen])

  /* ── 關卡選擇 ── */
  const handleStageSelect = useCallback(async (
    mode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss',
    sid: string,
  ) => {
    const displayName = mode === 'tower' ? `第 ${sid} 層`
      : mode === 'daily' ? getDailyDungeonDisplayName(sid)
        : mode === 'pvp' ? '試煉場對戰'
          : mode === 'boss' ? `Boss 挑戰`
            : `關卡 ${sid}`

    const needsCurtain = mode !== stageMode
    if (needsCurtain) {
      setCurtainVisible(true)
      setCurtainFading(false)
      setCurtainText(`準備${mode === 'tower' ? '挑戰' : ''}${displayName}...`)
      curtainClosePromiseRef.current = null
      await waitFrames(2)
    }

    setStageMode(mode)
    setStageId(sid)

    // story mode: 從 API 快取取得敵方陣容 + 場景主題
    let injectedEnemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number }[] | undefined
    if (mode === 'story') {
      try {
        const cfg = await getStageConfig(sid)
        if (cfg) {
          injectedEnemies = cfg.enemies
          // 設定章節對應的場景視覺主題
          const bgTheme = cfg.extra?.bgTheme
          if (bgTheme) setSceneTheme(bgTheme as SceneMode)
          else setSceneTheme('story')
        }
      } catch { /* fallback: injectedEnemies stays undefined */ }
    } else {
      // 非 story 模式：基於 stageId 從場景池輪替選取
      setSceneTheme(pickSceneForStage(mode, sid))
    }

    updateEnemySlots(() => buildEnemySlotsFromStage(mode, sid, heroesList, injectedEnemies))
    restoreFormationFromSave()
    setMenuScreen('none')
    setGameState('IDLE')

    if (needsCurtain) closeCurtain()
    showToast(`已選擇: ${displayName}`)
  }, [stageMode, heroesList, setStageMode, setSceneTheme, setStageId, updateEnemySlots, restoreFormationFromSave, setMenuScreen, setGameState, setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain, showToast])

  /* ── 競技場挑戰 ── */
  const handleArenaStartBattle = useCallback(async (
    targetRank: number,
    defender: { displayName: string; power: number; isNPC: boolean },
  ) => {
    showToast(`正在載入排名 #${targetRank} ${defender.displayName} 的陣型…`)
    try {
      const res = await startArenaChallenge(targetRank)
      if (!res.success) {
        showToast(`挑戰失敗：${res.error === 'no_challenges_left' ? '今日挑戰次數已用完' : res.error}`)
        return
      }
      const defHeroes: unknown[] = res.defenderData?.heroes ?? []
      const enemySlotsArr: (SlotHero | null)[] = [null, null, null, null, null, null]
      defHeroes.forEach((dh: unknown, i: number) => {
        if (i >= 6 || !dh) return
        const d = dh as Record<string, unknown>
        const heroId = Number(d.heroId ?? d.HeroID ?? 0)
        const base = heroesList.find(h => Number(h.HeroID ?? 0) === heroId)
        if (!base) return
        const modelId = Number(base.ModelID ?? base.HeroID ?? heroId)
        const hp = Number(d.HP ?? base.HP ?? 100)
        const atk = Number(d.ATK ?? base.ATK ?? 10)
        const spd = Number(d.Speed ?? base.Speed ?? 100)
        enemySlotsArr[i] = {
          ...base, HP: hp, ATK: atk, Speed: spd, slot: i, currentHP: hp,
          _uid: `arena_${heroId}_${i}`, _modelId: String(modelId), ModelID: String(modelId),
        } as SlotHero
      })
      if (!enemySlotsArr.some(Boolean) && defender.isNPC) {
        const npcPower = defender.power
        const npcBase = heroesList[Math.floor(Math.random() * heroesList.length)]
        if (npcBase) {
          const mid = Number(npcBase.ModelID ?? npcBase.HeroID ?? 1)
          const scale = Math.max(1, npcPower / 500)
          const hp = Math.floor(Number(npcBase.HP ?? 100) * scale)
          const atk = Math.floor(Number(npcBase.ATK ?? 10) * scale)
          enemySlotsArr[0] = {
            ...npcBase, HP: hp, ATK: atk, Speed: Number(npcBase.Speed ?? 100),
            slot: 0, currentHP: hp,
            _uid: `arena_npc_0`, _modelId: String(mid), ModelID: String(mid),
          } as SlotHero
        }
      }
      arenaTargetRankRef.current = targetRank
      setStageMode('pvp')
      setSceneTheme(pickSceneForStage('pvp', `arena-${targetRank}`))
      setStageId(`arena-${targetRank}`)
      updateEnemySlots(() => enemySlotsArr)
      restoreFormationFromSave()
      setMenuScreen('none')
      setGameState('IDLE')
    } catch (e) {
      showToast('挑戰載入失敗：' + String(e))
    }
  }, [heroesList, showToast, updateEnemySlots, restoreFormationFromSave, setStageMode, setSceneTheme, setStageId, setMenuScreen, setGameState]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 競技場防守陣型配置 ── */
  const handleArenaDefenseSetup = useCallback(async () => {
    showToast('載入防守陣型配置…')
    setIsDefenseSetup(true)
    isDefenseSetupRef.current = true
    setStageMode('pvp')
    setSceneTheme('pvp')
    setStageId('defense-setup')
    // 清空敵方
    updateEnemySlots(() => [...EMPTY_SLOTS])
    // 嘗試載入已儲存的防守陣型到玩家槽位
    try {
      const defFormation = await getDefenseFormation()
      const data = heroesListRef.current
      if (defFormation.some(Boolean) && data.length > 0) {
        const heroMap = new Map<string, { hero: RawHeroData; idx: number }>()
        data.forEach((h, idx) => {
          const hid = String(h.HeroID ?? h.id ?? idx + 1)
          heroMap.set(hid, { hero: h, idx })
        })
        const restored: (SlotHero | null)[] = defFormation.map((heroId, slot) => {
          if (!heroId) return null
          const hid = String(heroId)
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
        } else {
          updatePlayerSlots(() => [...EMPTY_SLOTS])
        }
      } else {
        // 沒有已儲存的防守陣型，清空
        updatePlayerSlots(() => [...EMPTY_SLOTS])
      }
    } catch {
      // API 失敗，清空
      updatePlayerSlots(() => [...EMPTY_SLOTS])
    }
    setMenuScreen('none')
    setGameState('IDLE')
  }, [heroesList, showToast, setIsDefenseSetup, isDefenseSetupRef, heroesListRef, updateEnemySlots, updatePlayerSlots, setStageMode, setSceneTheme, setStageId, setMenuScreen, setGameState]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 儲存防守陣型並返回 ── */
  const handleSaveDefenseFormation = useCallback(async (currentPlayerSlots: (SlotHero | null)[]) => {
    const formation = currentPlayerSlots.map(s => s ? String(s.HeroID ?? '') : null)
    const ok = await setDefenseFormation(formation)
    setIsDefenseSetup(false)
    isDefenseSetupRef.current = false
    setMenuScreen('arena')
    setGameState('MAIN_MENU')
    showToast(ok ? '防守陣型已儲存！' : '儲存失敗，請稍後再試')
  }, [setIsDefenseSetup, isDefenseSetupRef, setMenuScreen, setGameState, showToast])

  /* ── 離開防守配置（不儲存） ── */
  const handleCancelDefenseSetup = useCallback(() => {
    setIsDefenseSetup(false)
    isDefenseSetupRef.current = false
    setMenuScreen('arena')
    setGameState('MAIN_MENU')
  }, [setIsDefenseSetup, isDefenseSetupRef, setMenuScreen, setGameState])

  /* ── 每日簽到 ── */
  const handleCheckin = useCallback(async () => {
    const { doDailyCheckin } = await import('../services/saveService')
    const res = await doDailyCheckin()
    if (res.success && res.reward) {
      const items: AcquireItem[] = []
      if (res.reward.gold) items.push({ type: 'currency', id: 'gold', name: '金幣', quantity: res.reward.gold })
      if (res.reward.diamond) items.push({ type: 'currency', id: 'diamond', name: '鑽石', quantity: res.reward.diamond, rarity: 'SR' })
      if (res.reward.items) {
        for (const ri of res.reward.items) {
          items.push({ type: 'item', id: ri.itemId, name: getItemName(ri.itemId), quantity: ri.quantity })
        }
      }
      if (items.length > 0) acquireShow(items)
    }
    return res
  }, [acquireShow])

  return {
    handleMenuNavigate,
    handleBackToMenu,
    handleStageSelect,
    handleArenaStartBattle,
    handleArenaDefenseSetup,
    handleSaveDefenseFormation,
    handleCancelDefenseSetup,
    handleCheckin,
  }
}
