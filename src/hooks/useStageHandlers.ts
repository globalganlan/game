/**
 * useStageHandlers — 關卡選擇 / 競技場 / 每日簽到 handlers
 *
 * 從 App.tsx 抽出：handleStageSelect / handleArenaStartBattle /
 * handleCheckin / handleMenuNavigate / handleBackToMenu
 */
import { useCallback } from 'react'
import type { GameState, MenuScreen, SlotHero, RawHeroData } from '../types'
import type { AcquireItem } from '../hooks/useAcquireToast'
import { getDailyDungeonDisplayName } from '../domain/stageSystem'
import { startArenaChallenge } from '../services/arenaService'
import { getItemName } from '../constants/rarity'
import { buildEnemySlotsFromStage, normalizeModelId } from '../game/helpers'
import { getStageConfig } from '../services/stageService'
import { waitFrames } from '../game/constants'

export interface StageHandlerDeps {
  setStageMode: (m: 'story' | 'tower' | 'daily' | 'pvp' | 'boss') => void
  setStageId: (id: string) => void
  setMenuScreen: (m: MenuScreen) => void
  setGameState: (s: GameState) => void
  setCurtainVisible: (b: boolean) => void
  setCurtainFading: (b: boolean) => void
  setCurtainText: (t: string) => void
  curtainClosePromiseRef: React.MutableRefObject<Promise<boolean> | null>
  closeCurtain: () => Promise<boolean>
  updateEnemySlots: (updater: (prev: (SlotHero | null)[]) => (SlotHero | null)[]) => void
  restoreFormationFromSave: () => void
  showToast: (msg: string) => void
  acquireShow: (items: AcquireItem[]) => void
  heroesList: RawHeroData[]
  stageMode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss'
  arenaTargetRankRef: React.MutableRefObject<number>
}

export function useStageHandlers(deps: StageHandlerDeps) {
  const {
    setStageMode, setStageId, setMenuScreen, setGameState,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    updateEnemySlots, restoreFormationFromSave,
    showToast, acquireShow, heroesList, stageMode, arenaTargetRankRef,
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
        : mode === 'pvp' ? '競技場對戰'
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

    // story mode: 從 API 快取取得敵方陣容
    let injectedEnemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number }[] | undefined
    if (mode === 'story') {
      try {
        const cfg = await getStageConfig(sid)
        if (cfg) injectedEnemies = cfg.enemies
      } catch { /* fallback: injectedEnemies stays undefined */ }
    }

    updateEnemySlots(() => buildEnemySlotsFromStage(mode, sid, heroesList, injectedEnemies))
    restoreFormationFromSave()
    setMenuScreen('none')
    setGameState('IDLE')

    if (needsCurtain) closeCurtain()
    showToast(`已選擇: ${displayName}`)
  }, [stageMode, heroesList, setStageMode, setStageId, updateEnemySlots, restoreFormationFromSave, setMenuScreen, setGameState, setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain, showToast])

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
      setStageId(`arena-${targetRank}`)
      updateEnemySlots(() => enemySlotsArr)
      restoreFormationFromSave()
      setMenuScreen('none')
      setGameState('IDLE')
    } catch (e) {
      showToast('挑戰載入失敗：' + String(e))
    }
  }, [heroesList, showToast, updateEnemySlots, restoreFormationFromSave, setStageMode, setStageId, setMenuScreen, setGameState]) // eslint-disable-line react-hooks/exhaustive-deps

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
    handleCheckin,
  }
}
