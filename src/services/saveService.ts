/**
 * saveService  存檔系統前端服務
 *
 * 負責：
 *  - 載入 / 初始化 / 寫入存檔（後端權威）
 *  - 資源產出計時器計算
 *  - 內存快取（不使用 localStorage，後端為唯一資料來源）
 *
 * 對應 Spec: .ai/specs/save-system.md v0.3
 */

import { callApi } from './apiClient'

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
  lastSaved: string
  gachaPity?: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
  lastHeroFreePull?: string
  lastEquipFreePull?: string
  pwaRewardClaimed?: boolean
  checkinDay?: number
  checkinLastDate?: string
  nameChangeCount?: number
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
  const snapshot = currentData ? { ...currentData, heroes: [...currentData.heroes], save: { ...currentData.save } } : null
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
   內存快取（不使用 localStorage）
    */

export function clearLocalSaveCache(): void {
  // 清除舊版 localStorage 殘留（向下相容清理）
  try {
    localStorage.removeItem('globalganlan_save_cache')
    localStorage.removeItem('globalganlan_inventory_cache')
    localStorage.removeItem('gg_equipment_cache')
    localStorage.removeItem('gg_checkin_date')
    localStorage.removeItem('globalganlan_schema_version')
    localStorage.removeItem('globalganlan_gacha_pity')
    localStorage.removeItem('globalganlan_gacha_pool')
    localStorage.removeItem('globalganlan_owned_heroes')
    localStorage.removeItem('globalganlan_pending_pulls')
    localStorage.removeItem('globalganlan_pending_ops')
  } catch { /* ignore */ }
  currentData = null
}

/** 即時更新內存 state（不寫 localStorage，後端為唯一資料來源） */
function updateLocal(changes: Record<string, unknown>) {
  if (!currentData) return
  for (const [key, val] of Object.entries(changes)) {
    // 允許設定所有 SaveData 欄位（含 optional）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(currentData.save as any)[key] = val
  }
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
  // 確保 optional 欄位存在，避免 updateLocal 無法設定
  if (sd.lastHeroFreePull === undefined) sd.lastHeroFreePull = ''
  if (sd.lastEquipFreePull === undefined) sd.lastEquipFreePull = ''
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
  // 首次載入時清除舊版 localStorage 殘留
  clearLegacyLocalStorage()

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

  // 後端為唯一權威來源，不再從 localStorage 合併
  notify()
  return currentData
}

/** 清除舊版 localStorage 遊戲資料殘留（一次性） */
function clearLegacyLocalStorage(): void {
  try {
    const legacyKeys = [
      'globalganlan_save_cache',
      'globalganlan_inventory_cache',
      'gg_equipment_cache',
      'gg_checkin_date',
      'globalganlan_schema_version',
      'globalganlan_gacha_pity',
      'globalganlan_gacha_pool',
      'globalganlan_owned_heroes',
      'globalganlan_pending_pulls',
      'globalganlan_pending_ops',
    ]
    for (const key of legacyKeys) {
      localStorage.removeItem(key)
    }
  } catch { /* ignore */ }
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
  'towerFloor' | 'resourceTimerStage' | 'resourceTimerLastCollect' | 'nameChangeCount'
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
 * 儲存陣型  本地即時更新 + 背景 API 同步
 */
export function saveFormation(formation: (string | null)[]): boolean {
  if (currentData) {
    currentData.save.formation = formation
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
 *
 * 支援兩種格式：
 *  - number[] — 舊版（自動產生 local_ instanceId，不建議）
 *  - { heroId, instanceId }[] — 新版（使用 server 回傳的真實 instanceId）
 */
export function addHeroesLocally(heroes: number[] | { heroId: number; instanceId: string }[]): void {
  if (!currentData) return
  const now = new Date().toISOString()
  let changed = false
  for (const entry of heroes) {
    const heroId = typeof entry === 'number' ? entry : entry.heroId
    const instanceId = typeof entry === 'number' ? `local_${entry}_${Date.now()}` : entry.instanceId
    if (currentData.heroes.some(h => h.heroId === heroId)) continue
    currentData.heroes.push({
      instanceId,
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
  notify()
}

/** 更新免費抽狀態到本地（樂觀更新，server 已記錄） */
export function updateFreePullLocally(field: 'lastHeroFreePull' | 'lastEquipFreePull', dateStr: string): void {
  updateLocal({ [field]: dateStr })
}

/** 更新抽卡保底進度到本地（樂觀更新，server 已記錄） */
export function updateGachaPityLocally(pity: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }): void {
  updateLocal({ gachaPity: pity })
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
  notify()
}

/**
 * 領取計時器累積資源
 *
 * 呼叫 API，以伺服器回傳的 currencies 絕對值覆蓋本地
 */
let isCollectingResources = false

export async function collectResources(): Promise<AccumulatedResources | null> {
  if (!currentData) return null
  if (isCollectingResources) return null // 防重複點擊

  // 尚未通關 1-1  離線獎勵未解鎖
  const sp = currentData.save.storyProgress
  if (sp && sp.chapter === 1 && sp.stage === 1) return null

  const resources = getAccumulatedResources(
    currentData.save.resourceTimerStage,
    currentData.save.resourceTimerLastCollect,
  )
  if (resources.gold <= 0 && resources.exp <= 0) return null

  isCollectingResources = true

  // 呼叫 API → lastCollect 一律由伺服器回傳覆蓋，前端不自行生成
  try {
    const result = await callApi<{
      gold: number
      exp: number
      newGoldTotal: number
      newExpTotal: number
      hoursElapsed: number
      currencies?: { gold?: number; diamond?: number; exp?: number }
      resourceTimerLastCollect?: string
    }>('collect-resources', {})
    if (result.success && currentData) {
      if (result.currencies) {
        applyCurrenciesFromServer(result.currencies)
      } else {
        // 舊版相容
        if (result.newGoldTotal !== undefined) currentData.save.gold = result.newGoldTotal
        if (result.newExpTotal !== undefined) currentData.save.exp = result.newExpTotal
        notify()
      }
      // 同步伺服器的 lastCollect 時間戳（確保與 DB 一致）
      if (result.resourceTimerLastCollect && currentData) {
        currentData.save.resourceTimerLastCollect = result.resourceTimerLastCollect
        notify()
      }
    }
  } catch (e) {
    console.warn('[save] collect-resources error:', e)
    // API 失敗 → lastCollect 不動，下次重新計算
  } finally {
    isCollectingResources = false
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
  /* Day 1 */ { gold: 5000 },
  /* Day 2 */ { gold: 8000, items: [{ itemId: 'exp', quantity: 500 }] },
  /* Day 3 */ { diamond: 50, items: [{ itemId: 'gacha_ticket_hero', quantity: 1 }] },
  /* Day 4 */ { gold: 12000, items: [{ itemId: 'chest_bronze', quantity: 1 }] },
  /* Day 5 */ { diamond: 80, items: [{ itemId: 'exp', quantity: 1500 }, { itemId: 'gacha_ticket_equip', quantity: 1 }] },
  /* Day 6 */ { gold: 20000, items: [{ itemId: 'chest_silver', quantity: 1 }, { itemId: 'gacha_ticket_hero', quantity: 1 }] },
  /* Day 7 */ { diamond: 200, items: [{ itemId: 'chest_gold', quantity: 1 }, { itemId: 'gacha_ticket_hero', quantity: 2 }, { itemId: 'gacha_ticket_equip', quantity: 2 }] },
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

  // 防重複（由後端判斷為主，前端只做內存快速檢查）
  if (lastDate === todayStr) {
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

      // 使用伺服器回傳的權威獎勵資料（而非本地 CHECKIN_REWARDS，避免不同步）
      const serverReward = serverRes.reward ?? reward

      // 道具寫入背包（伺服器已處理貨幣，此處只處理背包道具的內存同步）
      if (serverReward.items && serverReward.items.length > 0) {
        const otherItems = serverReward.items.filter(i => i.itemId !== 'exp')
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
        reward: serverReward,
      }
    }
    return { success: false, error: serverRes.error || 'server_error' }
  } catch (e) {
    console.warn('[save] daily-checkin error:', e)
    return { success: false, error: 'network_error' }
  }
}
