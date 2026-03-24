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
import { preloadHeroModels, disposeDracoDecoder, preloadTimeoutMs } from '../loaders/glbLoader'
import { getSaveState } from '../services/saveService'

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
  arenaEnemyPowerRef: React.MutableRefObject<number>
  setIsDefenseSetup: (b: boolean) => void
  isDefenseSetupRef: React.MutableRefObject<boolean>
  heroesListRef: React.MutableRefObject<RawHeroData[]>
  preBattleMenuScreenRef: React.MutableRefObject<MenuScreen>
  setShowBattleScene: (b: boolean) => void
}

export function useStageHandlers(deps: StageHandlerDeps) {
  const {
    setStageMode, setSceneTheme, setStageId, setMenuScreen, setGameState,
    setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain,
    updateEnemySlots, updatePlayerSlots, restoreFormationFromSave,
    showToast, acquireShow, heroesList, stageMode, arenaTargetRankRef, arenaEnemyPowerRef,
    setIsDefenseSetup, isDefenseSetupRef, heroesListRef,
    preBattleMenuScreenRef,
    setShowBattleScene,
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

    // 每次從大廳進入戰鬥場景都需要過場幕（Canvas 正在掛載）
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText(`準備${mode === 'tower' ? '挑戰' : ''}${displayName}...`)
    curtainClosePromiseRef.current = null
    await waitFrames(2)

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

    // ── 預載入所有英雄 3D 模型 ──
    const builtEnemySlots = buildEnemySlotsFromStage(mode, sid, heroesList, injectedEnemies)
    const modelIds = new Set<string>()
    builtEnemySlots.forEach(s => { if (s?._modelId) modelIds.add(s._modelId) })
    try {
      const saveState = getSaveState()
      const savedFormation = saveState?.save?.formation as (string | null)[] | undefined
      if (savedFormation) {
        const ownedIds = new Set((saveState?.heroes ?? []).map((h: { heroId: number }) => String(h.heroId)))
        savedFormation.forEach((heroId) => {
          if (!heroId || !ownedIds.has(String(heroId))) return
          const hero = heroesList.find(h => String(h.HeroID ?? h.id) === String(heroId))
          if (hero) modelIds.add(normalizeModelId(hero, heroesList.indexOf(hero)))
        })
      }
    } catch { /* ignore save read errors */ }
    // ★ 序列批次預載（iOS 限制併發，避免記憶體尖峰）
    const preloadPromise = preloadHeroModels([...modelIds])

    // ★ 立即掛載 3D 場景（過場幕遮蓋 Suspense 載入佔位符）
    setShowBattleScene(true)
    setStageMode(mode)
    setStageId(sid)

    updateEnemySlots(() => builtEnemySlots)
    restoreFormationFromSave()
    // 記住進入戰鬥前的 menuScreen，戰後可返回（一律回到關卡選擇頁）
    preBattleMenuScreenRef.current = 'stages'
    setMenuScreen('none')
    setGameState('IDLE')

    // ★ 等待所有模型預載完成再收幕，避免使用者看到 Suspense 旋轉方塊
    //   安全網：根據模型數量動態計算（每英雄 5 秒，下限 15 秒、上限 90 秒）
    await Promise.race([preloadPromise, new Promise<void>(r => setTimeout(r, preloadTimeoutMs(modelIds.size)))])
    disposeDracoDecoder() // ★ 標記佇列清空後自動釋放 Draco（不會殺掉仍在排隊的解碼）
    await waitFrames(5)
    closeCurtain()
    showToast(`已選擇: ${displayName}`)
  }, [stageMode, heroesList, setStageMode, setSceneTheme, setStageId, updateEnemySlots, restoreFormationFromSave, setMenuScreen, setGameState, setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain, showToast, setShowBattleScene]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 競技場挑戰（新版：用 targetUserId 識別對手） ── */
  const handleArenaStartBattle = useCallback(async (
    targetUserId: string,
    defender: { displayName: string; power: number; isNPC: boolean },
  ) => {
    // 過場幕（先不掛載 Canvas，等 API + 模型預載完成後再掛載）
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText(`正在載入 ${defender.displayName} 的陣型…`)
    curtainClosePromiseRef.current = null
    await waitFrames(2)

    try {
      const res = await startArenaChallenge(targetUserId)
      if (!res.success) {
        if (res.rankChanged) {
          showToast('對手排名已變動，已自動刷新對手清單')
        } else {
          showToast(`挑戰失敗：${res.error === 'no_challenges_left' ? '今日挑戰次數已用完' : res.error}`)
        }
        closeCurtain()
        return
      }
      const targetRank = res.targetRank ?? 0
      const defHeroes: unknown[] = res.defenderData?.heroes ?? []
      const enemySlotsArr: (SlotHero | null)[] = [null, null, null, null, null, null]
      defHeroes.forEach((dh: unknown, i: number) => {
        if (i >= 6 || !dh) return
        const d = dh as Record<string, unknown>
        const heroId = Number(d.heroId ?? d.HeroID ?? 0)
        const base = heroesList.find(h => Number(h.HeroID ?? 0) === heroId)
        if (!base) return
        const rawMid = String(d.ModelID ?? base.ModelID ?? base.HeroID ?? heroId)
        const zm = rawMid.match(/zombie[_-]?(\d+)/i)
        const nm = rawMid.match(/\d+/)
        const resolvedModelId = zm ? `zombie_${zm[1]}` : nm ? `zombie_${nm[0]}` : `zombie_${heroId}`
        const hp = Number(d.HP ?? base.HP ?? 100)
        const atk = Number(d.ATK ?? base.ATK ?? 10)
        const def = Number(d.DEF ?? base.DEF ?? 5)
        const spd = Number(d.Speed ?? base.Speed ?? 100)
        const critRate = Number(d.CritRate ?? 5)
        const critDmg = Number(d.CritDmg ?? 50)
        enemySlotsArr[i] = {
          ...base, HP: hp, ATK: atk, DEF: def, Speed: spd,
          CritRate: critRate, CritDmg: critDmg,
          slot: i, currentHP: hp,
          _uid: `arena_${heroId}_${i}`, _modelId: resolvedModelId, ModelID: resolvedModelId,
        } as SlotHero
      })
      if (!enemySlotsArr.some(Boolean) && defender.isNPC) {
        const npcPower = defender.power
        const npcBase = heroesList[Math.floor(Math.random() * heroesList.length)]
        if (npcBase) {
          const rawMid = String(npcBase.ModelID ?? npcBase.HeroID ?? 1)
          const zm = rawMid.match(/zombie[_-]?(\d+)/i)
          const nm = rawMid.match(/\d+/)
          const resolvedMid = zm ? `zombie_${zm[1]}` : nm ? `zombie_${nm[0]}` : 'zombie_1'
          const scale = Math.max(1, npcPower / 500)
          const hp = Math.floor(Number(npcBase.HP ?? 100) * scale)
          const atk = Math.floor(Number(npcBase.ATK ?? 10) * scale)
          enemySlotsArr[0] = {
            ...npcBase, HP: hp, ATK: atk, Speed: Number(npcBase.Speed ?? 100),
            slot: 0, currentHP: hp,
            _uid: `arena_npc_0`, _modelId: resolvedMid, ModelID: resolvedMid,
          } as SlotHero
        }
      }
      arenaTargetRankRef.current = targetRank

      // ── 預載入所有英雄 3D 模型 ──
      const arenaModelIds = new Set<string>()
      enemySlotsArr.forEach(s => { if (s?._modelId) arenaModelIds.add(s._modelId) })
      try {
        const saveState = getSaveState()
        const savedFormation = saveState?.save?.formation as (string | null)[] | undefined
        if (savedFormation) {
          const ownedIds = new Set((saveState?.heroes ?? []).map((h: { heroId: number }) => String(h.heroId)))
          savedFormation.forEach((heroId) => {
            if (!heroId || !ownedIds.has(String(heroId))) return
            const hero = heroesList.find(h => String(h.HeroID ?? h.id) === String(heroId))
            if (hero) arenaModelIds.add(normalizeModelId(hero, heroesList.indexOf(hero)))
          })
        }
      } catch { /* ignore */ }
      const arenaPreload = preloadHeroModels([...arenaModelIds])

      // ── 立即掛載 Canvas + 設定戰鬥狀態（過場幕遮蓋 Suspense 佔位符）──
      arenaEnemyPowerRef.current = res.defenderData?.power ?? 0
      setShowBattleScene(true)
      setStageMode('pvp')
      setSceneTheme(pickSceneForStage('pvp', `arena-${targetRank}`))
      setStageId(`arena-${targetRank}`)
      updateEnemySlots(() => enemySlotsArr)
      restoreFormationFromSave()
      preBattleMenuScreenRef.current = 'arena'
      setMenuScreen('none')
      setGameState('IDLE')
      // ★ 等待所有模型預載完成再收幕，避免使用者看到 Suspense 旋轉方塊
      await Promise.race([arenaPreload, new Promise<void>(r => setTimeout(r, preloadTimeoutMs(arenaModelIds.size)))])
      disposeDracoDecoder() // ★ 標記延遲釋放
      await waitFrames(5)
      closeCurtain()
    } catch (e) {
      setShowBattleScene(false)
      closeCurtain()
      showToast('挑戰載入失敗：' + String(e))
    }
  }, [heroesList, showToast, updateEnemySlots, restoreFormationFromSave, setStageMode, setSceneTheme, setStageId, setMenuScreen, setGameState, setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain, setShowBattleScene]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 競技場防守陣型配置 ── */
  const handleArenaDefenseSetup = useCallback(async () => {
    // 過場幕（先不掛載 Canvas，等 API + 模型預載完成後再掛載）
    setCurtainVisible(true)
    setCurtainFading(false)
    setCurtainText('載入防守陣型配置…')
    curtainClosePromiseRef.current = null
    await waitFrames(2)

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
        // ── 預載入防守陣型模型 ──
        const defModelIds = restored.filter(Boolean).map(h => h!._modelId).filter(Boolean) as string[]
        const defPreload = preloadHeroModels(defModelIds)
        if (restored.some(Boolean)) {
          updatePlayerSlots(() => restored)
        } else {
          updatePlayerSlots(() => [...EMPTY_SLOTS])
        }
        // ── 立即掛載 Canvas（過場幕遮蓋載入佔位符）──
        setShowBattleScene(true)
        setMenuScreen('none')
        setGameState('IDLE')
        // ★ 等待模型預載完成再收幕
        await Promise.race([defPreload, new Promise<void>(r => setTimeout(r, preloadTimeoutMs(defModelIds.length)))])
        disposeDracoDecoder() // ★ 標記延遲釋放
        await waitFrames(5)
        closeCurtain()
      } else {
        // 沒有已儲存的防守陣型，清空
        updatePlayerSlots(() => [...EMPTY_SLOTS])
        setShowBattleScene(true)
        setMenuScreen('none')
        setGameState('IDLE')
        await waitFrames(3)
        closeCurtain()
      }
    } catch {
      // API 失敗，清空
      updatePlayerSlots(() => [...EMPTY_SLOTS])
      setShowBattleScene(true)
      setMenuScreen('none')
      setGameState('IDLE')
      await waitFrames(3)
      closeCurtain()
    }
  }, [heroesList, showToast, setIsDefenseSetup, isDefenseSetupRef, heroesListRef, updateEnemySlots, updatePlayerSlots, setStageMode, setSceneTheme, setStageId, setMenuScreen, setGameState, setCurtainVisible, setCurtainFading, setCurtainText, curtainClosePromiseRef, closeCurtain, setShowBattleScene]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 儲存防守陣型並返回 ── */
  const handleSaveDefenseFormation = useCallback(async (currentPlayerSlots: (SlotHero | null)[]) => {
    const formation = currentPlayerSlots.map(s => s ? String(s.HeroID ?? '') : null)
    const ok = await setDefenseFormation(formation)
    setIsDefenseSetup(false)
    isDefenseSetupRef.current = false
    setShowBattleScene(false)
    setMenuScreen('arena')
    setGameState('MAIN_MENU')
    showToast(ok ? '防守陣型已儲存！' : '儲存失敗，請稍後再試')
  }, [setIsDefenseSetup, isDefenseSetupRef, setMenuScreen, setGameState, showToast, setShowBattleScene])

  /* ── 離開防守配置（不儲存） ── */
  const handleCancelDefenseSetup = useCallback(() => {
    setIsDefenseSetup(false)
    isDefenseSetupRef.current = false
    setShowBattleScene(false)
    setMenuScreen('arena')
    setGameState('MAIN_MENU')
  }, [setIsDefenseSetup, isDefenseSetupRef, setMenuScreen, setGameState, setShowBattleScene])

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
