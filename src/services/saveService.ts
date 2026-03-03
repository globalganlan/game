/**
 * saveService  存檔系統前端服務
 *
 * 負責：
 *  - 載入 / 初始化 / 寫入存檔
 *  - 資源產出計時器計算
 *  - 本地快取 (localStorage)
 *  - 寫入佇列（debounce 2s 合併）
 *
 * 對應 Spec: specs/save-system.md v0.2
 */

import { callApi } from './apiClient'

const STORAGE_KEY_SAVE = 'globalganlan_save_cache'

/* 
   型別
    */

export interface SaveData {
  playerId: string
  displayName: string
  diamond: number
  gold: number
  exp: number
  resourceTimerStage: string
  resourceTimerLastCollect: string
  towerFloor: number
  storyProgress: { chapter: number; stage: number }
  formation: (string | null)[] // 6 slots, heroInstanceId or null
  stageStars: Record<string, number> // stageId  best star (1-3)
  lastSaved: string
  gachaPity?: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
  lastHeroFreePull?: string
  lastEquipFreePull?: string
  pwaRewardClaimed?: boolean
  checkinDay?: number
  checkinLastDate?: string
}

export interface HeroInstance {
  instanceId: string
  heroId: number
  level: number
  exp: number
  ascension: number
  stars: number
  equippedItems: Record<string, string>
  obtainedAt: string
}

export interface InventoryItem {
  itemId: string
  quantity: number
}

export interface PlayerData {
  save: SaveData
  heroes: HeroInstance[]
  inventory: InventoryItem[]
  isDirty: boolean
}

export interface ResourceTimerYield {
  goldPerHour: number
  expPerHour: number
}

export interface AccumulatedResources {
  gold: number
  exp: number
  hoursElapsed: number
}

/* 
   內部 state
    */

let currentData: PlayerData | null = null

type SaveListener = (data: PlayerData | null) => void
const listeners: SaveListener[] = []

function notify() {
  const snapshot = currentData ? { ...currentData, save: { ...currentData.save } } : null
  for (const fn of listeners) fn(snapshot)
}

/* 
   資源產出計時器公式
    */

/** 根據已通關最高關卡計算每小時產出 */
export function getTimerYield(stageId: string): ResourceTimerYield {
  const parts = stageId.split('-').map(Number)
  const ch = parts[0] || 1
  const st = parts[1] || 1
  const progress = (ch - 1) * 8 + st // 線性進度 1~24
  return {
    goldPerHour: 100 + progress * 50,
    expPerHour: Math.max(100, progress * 50),
  }
}

/** 計算可領取的累積資源 */
export function getAccumulatedResources(
  stageId: string,
  lastCollect: string,
  maxHours = 24,
): AccumulatedResources {
  const elapsed = Date.now() - new Date(lastCollect).getTime()
  const hours = Math.min(maxHours, Math.max(0, elapsed / (3600 * 1000)))
  const { goldPerHour, expPerHour } = getTimerYield(stageId)
  return {
    gold: Math.floor(goldPerHour * hours),
    exp: Math.floor(expPerHour * hours),
    hoursElapsed: Math.round(hours * 10) / 10,
  }
}

/* 
   本地快取
    */

function saveToLocal(data: PlayerData) {
  try {
    localStorage.setItem(STORAGE_KEY_SAVE, JSON.stringify(data))
  } catch {
    // localStorage 滿了  忽略
  }
}

function loadFromLocal(): PlayerData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVE)
    if (!raw) return null
    return JSON.parse(raw) as PlayerData
  } catch {
    return null
  }
}

export function clearLocalSaveCache(): void {
  localStorage.removeItem(STORAGE_KEY_SAVE)
  currentData = null
}

/** 即時更新本地 state + localStorage（不打 API，各功能由專用路由負責寫入伺服器） */
function updateLocal(changes: Record<string, unknown>) {
  if (!currentData) return
  for (const [key, val] of Object.entries(changes)) {
    if (key in currentData.save) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(currentData.save as any)[key] = val
    }
  }
  saveToLocal(currentData)
  notify()
}

/* 
   公開 API
    */

/** 取得當前存檔（唯讀） */
export function getSaveState(): PlayerData | null {
  return currentData
}

/** 訂閱存檔變化 */
export function onSaveChange(fn: SaveListener): () => void {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

/**
 * 防禦性解析回傳的 SaveData
 * JSON 欄位可能被雙重序列化，前端必須確保是物件
 */
function sanitizeSaveData(sd: SaveData): SaveData {
  if (!sd) return sd
  // storyProgress
  if (typeof sd.storyProgress === 'string') {
    try { sd.storyProgress = JSON.parse(sd.storyProgress as unknown as string) } catch { sd.storyProgress = { chapter: 1, stage: 1 } }
  }
  if (!sd.storyProgress || typeof sd.storyProgress !== 'object') {
    sd.storyProgress = { chapter: 1, stage: 1 }
  }
  // formation
  if (typeof sd.formation === 'string') {
    try { sd.formation = JSON.parse(sd.formation as unknown as string) } catch { sd.formation = [null, null, null, null, null, null] }
  }
  if (!Array.isArray(sd.formation)) {
    sd.formation = [null, null, null, null, null, null]
  }
  // stageStars  防多層序列化
  for (let i = 0; i < 3 && typeof sd.stageStars === 'string'; i++) {
    try { sd.stageStars = JSON.parse(sd.stageStars as unknown as string) } catch { sd.stageStars = {}; break }
  }
  if (!sd.stageStars || typeof sd.stageStars !== 'object' || Array.isArray(sd.stageStars)) {
    sd.stageStars = {}
  }
  // towerFloor
  if (!sd.towerFloor || sd.towerFloor < 1) {
    sd.towerFloor = 1
  }
  // gachaPity
  if (typeof sd.gachaPity === 'string') {
    try { sd.gachaPity = JSON.parse(sd.gachaPity as unknown as string) } catch { sd.gachaPity = { pullsSinceLastSSR: 0, guaranteedFeatured: false } }
  }
  if (!sd.gachaPity || typeof sd.gachaPity !== 'object') {
    sd.gachaPity = { pullsSinceLastSSR: 0, guaranteedFeatured: false }
  }
  return sd
}

/**
 * 載入存檔（進入遊戲時呼叫一次）
 *
 * 1. 嘗試從 API 載入
 * 2. 若 isNew  呼叫 init-save
 * 3. 失敗時使用本地快取
 */
export async function loadSave(): Promise<PlayerData> {
  try {
    const res = await callApi<{
      saveData: SaveData
      heroes: HeroInstance[]
      inventory?: InventoryItem[]
      isNew: boolean
    }>('load-save')

    if (!res.success) throw new Error(res.error || 'load-save failed')

    if (res.isNew) {
      // 新玩家  初始化存檔
      const initRes = await callApi<{ starterHeroInstanceId?: string }>('init-save')
      if (!initRes.success) throw new Error(initRes.error || 'init-save failed')
      // 重新載入
      const reload = await callApi<{
        saveData: SaveData
        heroes: HeroInstance[]
        inventory?: InventoryItem[]
      }>('load-save')
      if (!reload.success) throw new Error(reload.error || 'reload failed')

      const reloadSave = sanitizeSaveData(reload.saveData)

      currentData = {
        save: reloadSave,
        heroes: (reload.heroes || []).map(stripPlayerId),
        inventory: reload.inventory || [],
        isDirty: false,
      }
    } else {
      const cleanSave = sanitizeSaveData(res.saveData)

      currentData = {
        save: cleanSave,
        heroes: (res.heroes || []).map(stripPlayerId),
        inventory: res.inventory || [],
        isDirty: false,
      }
    }

    //  合併本地樂觀英雄進度 
    // 若本地有較新的 level/ascension/stars（單調遞增），取 MAX
    const localCache = loadFromLocal()
    if (localCache?.heroes?.length) {
      const localMap = new Map<string, HeroInstance>()
      for (const h of localCache.heroes) localMap.set(h.instanceId, h)
      for (const sh of currentData.heroes) {
        const lh = localMap.get(sh.instanceId)
        if (!lh) continue
        if ((lh.level ?? 1) > (sh.level ?? 1)) {
          sh.level = lh.level
          sh.exp = lh.exp
        }
        if ((lh.ascension ?? 0) > (sh.ascension ?? 0)) {
          sh.ascension = lh.ascension
        }
        if ((lh.stars ?? 0) > (sh.stars ?? 0)) {
          sh.stars = lh.stars
        }
      }
    }

    saveToLocal(currentData)
    notify()
    return currentData
  } catch (err) {
    console.warn('[save] load from server failed, trying local cache:', err)
    const local = loadFromLocal()
    if (local) {
      currentData = local
      notify()
      return currentData
    }
    throw err
  }
}

/** 從 HeroInstance 移除 playerId、補全缺少的欄位（前端不需要 playerId） */
function stripPlayerId(h: HeroInstance & { playerId?: string }): HeroInstance {
  const { playerId: _, ...rest } = h
  if (rest.stars == null || (rest.stars as unknown) === '') (rest as HeroInstance).stars = 0
  return rest as HeroInstance
}

/**
 * 更新玩家進度（金幣、鑽石等）
 * 變更即時反映到本地 state，2 秒後批次寫入伺服器
 */
export function updateProgress(changes: Partial<Pick<SaveData,
  'gold' | 'diamond' | 'exp' | 'displayName' |
  'towerFloor' | 'resourceTimerStage'
>>): void {
  const serialized: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(changes)) {
    serialized[key] = val
  }
  updateLocal(serialized)
}

/**
 * 更新劇情進度
 */
export function updateStoryProgress(chapter: number, stage: number): void {
  const sp = JSON.stringify({ chapter, stage })
  updateLocal({ storyProgress: sp })
  if (currentData) {
    // enqueueSave 將 storyProgress 設為 JSON 字串再 notify，
    // 必須覆蓋為正確的物件型態後再 notify，否則 React 端會拿到字串
    currentData.save.storyProgress = { chapter, stage }
    notify()
  }
}

/**
 * 更新關卡星級（只保留最佳）
 */
export function updateStageStars(stageId: string, stars: number): void {
  if (currentData) {
    if (typeof currentData.save.stageStars === 'string') {
      try { currentData.save.stageStars = JSON.parse(currentData.save.stageStars as unknown as string) } catch { currentData.save.stageStars = {} }
    }
    if (!currentData.save.stageStars || typeof currentData.save.stageStars !== 'object') {
      currentData.save.stageStars = {}
    }
    const prev = currentData.save.stageStars[stageId] || 0
    if (stars > prev) {
      currentData.save.stageStars[stageId] = stars
      saveToLocal(currentData)
      notify()
      updateLocal({ stageStars: JSON.stringify(currentData.save.stageStars) })
    }
  }
}

/**
 * 儲存陣型  本地即時更新 + 背景 API 同步
 */
export function saveFormation(formation: (string | null)[]): boolean {
  if (currentData) {
    currentData.save.formation = formation
    saveToLocal(currentData)
    notify()
  }
  callApi('save-formation', { formation }).catch(e =>
    console.warn('[save] save-formation error:', e),
  )
  return true
}

/**
 * 樂觀新增英雄到本地（不呼叫 API）
 * 用於抽卡後即時更新英雄列表，server 入帳由 gacha-pull 背景處理。
 */
export function addHeroesLocally(heroIds: number[]): void {
  if (!currentData) return
  const now = new Date().toISOString()
  let changed = false
  for (const heroId of heroIds) {
    if (currentData.heroes.some(h => h.heroId === heroId)) continue
    currentData.heroes.push({
      instanceId: `local_${heroId}_${Date.now()}`,
      heroId,
      level: 1,
      exp: 0,
      ascension: 0,
      stars: 0,
      equippedItems: {},
      obtainedAt: now,
    })
    changed = true
  }
  if (changed) {
    saveToLocal(currentData)
    notify()
  }
}

/**
 * 樂觀更新英雄資料（不呼叫 API）
 */
export function updateHeroLocally(
  heroId: number,
  changes: Partial<Pick<HeroInstance, 'level' | 'exp' | 'ascension' | 'stars'>>,
): void {
  if (!currentData) return
  const hero = currentData.heroes.find(h => h.heroId === heroId)
  if (!hero) return
  if (changes.level !== undefined) hero.level = changes.level
  if (changes.exp !== undefined) hero.exp = changes.exp
  if (changes.ascension !== undefined) hero.ascension = changes.ascension
  if (changes.stars !== undefined) hero.stars = changes.stars
  saveToLocal(currentData)
  notify()
}

/**
 * 新增英雄（抽卡 / 通關獎勵）
 */
export async function addHero(heroId: number): Promise<HeroInstance | null> {
  try {
    const res = await callApi<{ instanceId: string }>('add-hero', { heroId })
    if (!res.success) return null
    const newHero: HeroInstance = {
      instanceId: res.instanceId,
      heroId,
      level: 1,
      exp: 0,
      ascension: 0,
      stars: 0,
      equippedItems: {},
      obtainedAt: new Date().toISOString(),
    }
    if (currentData) {
      currentData.heroes.push(newHero)
      saveToLocal(currentData)
      notify()
    }
    return newHero
  } catch {
    console.warn('[save] add-hero failed')
    return null
  }
}

/** 本地增減金幣或鑽石（寶箱獎勵等場景用） */
export function updateLocalCurrency(field: 'gold' | 'diamond', delta: number) {
  if (!currentData || delta === 0) return
  currentData.save[field] = (currentData.save[field] ?? 0) + delta
  saveToLocal(currentData)
  notify()
}

/**
 * 以後端回傳的 currencies 絕對值覆蓋本地 gold / diamond / exp。
 * 所有會變動貨幣的 API 都應在 response 內帶回 currencies，前端一律用此函式同步。
 */
export function applyCurrenciesFromServer(
  currencies: { gold?: number; diamond?: number; exp?: number } | null | undefined,
) {
  if (!currencies || !currentData) return
  if (typeof currencies.gold === 'number') currentData.save.gold = currencies.gold
  if (typeof currencies.diamond === 'number') currentData.save.diamond = currencies.diamond
  if (typeof currencies.exp === 'number') currentData.save.exp = currencies.exp
  saveToLocal(currentData)
  notify()
}

/**
 * 領取計時器累積資源
 *
 * 呼叫 API，以伺服器回傳的 currencies 絕對值覆蓋本地
 */
export async function collectResources(): Promise<AccumulatedResources | null> {
  if (!currentData) return null

  // 尚未通關 1-1  離線獎勵未解鎖
  const sp = currentData.save.storyProgress
  if (sp && sp.chapter === 1 && sp.stage === 1) return null

  const resources = getAccumulatedResources(
    currentData.save.resourceTimerStage,
    currentData.save.resourceTimerLastCollect,
  )
  if (resources.gold <= 0 && resources.exp <= 0) return null

  // 更新收集時間（避免重複領取）
  currentData.save.resourceTimerLastCollect = new Date().toISOString()
  saveToLocal(currentData)

  // 呼叫 API → 以伺服器權威值覆蓋
  try {
    const result = await callApi<{
      gold: number
      exp: number
      newGoldTotal: number
      newExpTotal: number
      hoursElapsed: number
      currencies?: { gold?: number; diamond?: number; exp?: number }
    }>('collect-resources', {})
    if (result.success && currentData) {
      if (result.currencies) {
        applyCurrenciesFromServer(result.currencies)
      } else {
        // 舊版相容
        if (result.newGoldTotal !== undefined) currentData.save.gold = result.newGoldTotal
        if (result.newExpTotal !== undefined) currentData.save.exp = result.newExpTotal
        saveToLocal(currentData)
        notify()
      }
    }
  } catch (e) {
    console.warn('[save] collect-resources error:', e)
    // 離線時使用本地預估值
    currentData.save.gold += resources.gold
    currentData.save.exp = (currentData.save.exp ?? 0) + resources.exp
    saveToLocal(currentData)
    notify()
  }

  return resources
}

/**
 * 已不需要（save-progress 已移除，各功能由專用路由同步）
 * 保留空殼以免呼叫端報錯
 */
export async function flushPendingChanges(): Promise<void> {
  // no-op
}

/* 
   每日簽到
    */

export interface DailyCheckinResult {
  success: boolean
  error?: string
  checkinDay?: number
  checkinLastDate?: string
  reward?: { gold?: number; diamond?: number; items?: { itemId: string; quantity: number }[] }
}

/**
 * 每日簽到獎勵表
 */
const CHECKIN_REWARDS: { gold?: number; diamond?: number; items?: { itemId: string; quantity: number }[] }[] = [
  { gold: 5000 },
  { gold: 8000, items: [{ itemId: 'exp', quantity: 500 }] },
  { diamond: 50 },
  { gold: 12000, items: [{ itemId: 'chest_bronze', quantity: 1 }] },
  { diamond: 80, items: [{ itemId: 'exp', quantity: 1500 }] },
  { gold: 20000, items: [{ itemId: 'chest_silver', quantity: 1 }] },
  { diamond: 200, items: [{ itemId: 'chest_gold', quantity: 1 }] },
]

/** 取得 UTC+8 (Taipei) 的 YYYY-MM-DD 字串 */
function getTaipeiDate(): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const taipei = new Date(utc + 8 * 3600000)
  const y = taipei.getFullYear()
  const m = String(taipei.getMonth() + 1).padStart(2, '0')
  const d = String(taipei.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function doDailyCheckin(): Promise<DailyCheckinResult> {
  if (!currentData) return { success: false, error: 'no_save_data' }

  const todayStr = getTaipeiDate()
  const lastDate = currentData.save.checkinLastDate ?? ''

  // 防重複
  if (lastDate === todayStr) {
    return { success: false, error: 'already_checked_in' }
  }
  const CHECKIN_LS_KEY = 'gg_checkin_date'
  if (localStorage.getItem(CHECKIN_LS_KEY) === todayStr) {
    return { success: false, error: 'already_checked_in' }
  }

  // 計算新的簽到天數（斷簽重置）
  const oldDay = currentData.save.checkinDay ?? 0
  let newDay: number
  if (lastDate) {
    const lastMs = new Date(lastDate + 'T00:00:00+08:00').getTime()
    const todayMs = new Date(todayStr + 'T00:00:00+08:00').getTime()
    const diffDays = Math.round((todayMs - lastMs) / 86400000)
    newDay = diffDays === 1 ? (oldDay % 7) + 1 : 1
  } else {
    newDay = 1
  }

  const reward = CHECKIN_REWARDS[newDay - 1] || CHECKIN_REWARDS[0]

  // 呼叫伺服器簽到（不再本地樂觀更新貨幣）
  try {
    const serverRes = await callApi<DailyCheckinResult & { currencies?: { gold?: number; diamond?: number; exp?: number } }>('daily-checkin', {})
    if (serverRes.success && currentData) {
      if (serverRes.checkinDay !== undefined) currentData.save.checkinDay = serverRes.checkinDay
      if (serverRes.checkinLastDate) currentData.save.checkinLastDate = serverRes.checkinLastDate
      if (serverRes.currencies) {
        applyCurrenciesFromServer(serverRes.currencies)
      }
      localStorage.setItem('gg_checkin_date', todayStr)

      // 道具寫入背包（伺服器已處理貨幣，此處只處理背包道具的本地快取同步）
      if (reward.items && reward.items.length > 0) {
        const otherItems = reward.items.filter(i => i.itemId !== 'exp')
        if (otherItems.length > 0) {
          try {
            const { addItemsLocally } = await import('./inventoryService')
            addItemsLocally(otherItems.map(i => ({ itemId: i.itemId, quantity: i.quantity })))
          } catch { /* silent */ }
        }
      }

      return {
        success: true,
        checkinDay: serverRes.checkinDay ?? newDay,
        checkinLastDate: serverRes.checkinLastDate ?? todayStr,
        reward,
      }
    }
    return { success: false, error: serverRes.error || 'server_error' }
  } catch (e) {
    console.warn('[save] daily-checkin error:', e)
    // 離線備援：本地樂觀更新
    currentData.save.checkinDay = newDay
    currentData.save.checkinLastDate = todayStr
    if (reward.gold) currentData.save.gold += reward.gold
    if (reward.diamond) currentData.save.diamond += reward.diamond
    if (reward.items) {
      const expItems = reward.items.filter(i => i.itemId === 'exp')
      if (expItems.length > 0) {
        currentData.save.exp += expItems.reduce((acc, i) => acc + i.quantity, 0)
      }
    }
    saveToLocal(currentData)
    notify()
    localStorage.setItem('gg_checkin_date', todayStr)
    return { success: true, checkinDay: newDay, checkinLastDate: todayStr, reward }
  }
}
