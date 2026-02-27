/**
 * saveService — 存檔系統前端服務
 *
 * 負責：
 *  - 載入 / 初始化 / 寫入存檔
 *  - 資源產出計時器計算
 *  - 本地快取 (localStorage)
 *  - 寫入佇列（debounce 2s 合併）
 *
 * 對應 Spec: specs/save-system.md v0.2
 */

import { getAuthState } from './authService'
import { initLocalPool, type PoolEntry } from './gachaLocalPool'
import { fireOptimistic, reconcilePendingOps } from './optimisticQueue'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

const STORAGE_KEY_SAVE = 'globalganlan_save_cache'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export interface SaveData {
  playerId: string
  displayName: string
  level: number
  exp: number
  diamond: number
  gold: number
  resourceTimerStage: string
  resourceTimerLastCollect: string
  towerFloor: number
  storyProgress: { chapter: number; stage: number }
  formation: (string | null)[] // 6 slots, heroInstanceId or null
  lastSaved: string
  gachaPity?: { pullsSinceLastSSR: number; guaranteedFeatured: boolean }
}

export interface HeroInstance {
  instanceId: string
  heroId: number
  level: number
  exp: number
  ascension: number
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
  expItemsPerHour: number
}

export interface AccumulatedResources {
  gold: number
  expItems: number
  hoursElapsed: number
}

/* ════════════════════════════════════
   內部 state
   ════════════════════════════════════ */

let currentData: PlayerData | null = null
let pendingChanges: Record<string, unknown> = {}
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let isSaving = false

type SaveListener = (data: PlayerData | null) => void
const listeners: SaveListener[] = []

function notify() {
  const snapshot = currentData ? { ...currentData, save: { ...currentData.save } } : null
  for (const fn of listeners) fn(snapshot)
}

/* ════════════════════════════════════
   通用 API 呼叫
   ════════════════════════════════════ */

async function callApi<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T & { success: boolean; error?: string }> {
  const token = getAuthState().guestToken
  if (!token) throw new Error('not_logged_in')
  const body = JSON.stringify({ action, guestToken: token, ...params })
  const res = await fetch(POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  })
  return res.json()
}

/* ════════════════════════════════════
   資源產出計時器公式
   ════════════════════════════════════ */

/** 根據已通關最高關卡計算每小時產出 */
export function getTimerYield(stageId: string): ResourceTimerYield {
  const parts = stageId.split('-').map(Number)
  const ch = parts[0] || 1
  const st = parts[1] || 1
  const progress = (ch - 1) * 8 + st // 線性進度 1~24
  return {
    goldPerHour: 100 + progress * 50,
    expItemsPerHour: Math.max(1, Math.floor(progress / 3)),
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
  const { goldPerHour, expItemsPerHour } = getTimerYield(stageId)
  return {
    gold: Math.floor(goldPerHour * hours),
    expItems: Math.floor(expItemsPerHour * hours),
    hoursElapsed: Math.round(hours * 10) / 10,
  }
}

/* ════════════════════════════════════
   本地快取
   ════════════════════════════════════ */

function saveToLocal(data: PlayerData) {
  try {
    localStorage.setItem(STORAGE_KEY_SAVE, JSON.stringify(data))
  } catch {
    // localStorage 滿了 → 忽略
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
  pendingChanges = {}
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

/* ════════════════════════════════════
   寫入佇列（debounce 2s）
   ════════════════════════════════════ */

async function flushChanges(): Promise<void> {
  if (isSaving || Object.keys(pendingChanges).length === 0) return
  isSaving = true
  const batch = { ...pendingChanges }
  pendingChanges = {}

  try {
    const res = await callApi('save-progress', { changes: batch })
    if (!res.success) {
      console.warn('[save] flush failed:', res.error)
      // 合併回去重試
      pendingChanges = { ...batch, ...pendingChanges }
      scheduleRetry()
    } else {
      // 更新 lastSaved
      if (currentData && (res as Record<string, unknown>).lastSaved) {
        currentData.save.lastSaved = (res as Record<string, unknown>).lastSaved as string
        saveToLocal(currentData)
      }
    }
  } catch (err) {
    console.warn('[save] flush network error:', err)
    pendingChanges = { ...batch, ...pendingChanges }
    scheduleRetry()
  } finally {
    isSaving = false
  }
}

let retryCount = 0
function scheduleRetry() {
  retryCount++
  if (retryCount > 3) {
    console.error('[save] 存檔失敗已達 3 次上限')
    retryCount = 0
    return
  }
  debounceTimer = setTimeout(flushChanges, 3000 * retryCount)
}

function enqueueSave(changes: Record<string, unknown>) {
  pendingChanges = { ...pendingChanges, ...changes }
  if (currentData) {
    currentData.isDirty = true
    // 即時更新 local state
    for (const [key, val] of Object.entries(changes)) {
      if (key in currentData.save) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(currentData.save as any)[key] = val
      }
    }
    saveToLocal(currentData)
    notify()
  }
  if (debounceTimer) clearTimeout(debounceTimer)
  retryCount = 0
  debounceTimer = setTimeout(flushChanges, 2000)
}

/* ════════════════════════════════════
   公開 API
   ════════════════════════════════════ */

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
 * 防禦性解析 GAS 回傳的 SaveData
 * GAS Sheets 的 JSON 欄位可能被雙重序列化，前端必須確保是物件
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
 * 2. 若 isNew → 呼叫 init-save
 * 3. 失敗時使用本地快取
 */
export async function loadSave(): Promise<PlayerData> {
  try {
    const res = await callApi<{
      saveData: SaveData
      heroes: HeroInstance[]
      inventory?: InventoryItem[]
      isNew: boolean
      gachaPool?: PoolEntry[]
      ownedHeroIds?: number[]
    }>('load-save')

    if (!res.success) throw new Error(res.error || 'load-save failed')

    if (res.isNew) {
      // 新玩家 → 初始化存檔
      const initRes = await callApi<{ starterHeroInstanceId?: string }>('init-save')
      if (!initRes.success) throw new Error(initRes.error || 'init-save failed')
      // 重新載入
      const reload = await callApi<{
        saveData: SaveData
        heroes: HeroInstance[]
        inventory?: InventoryItem[]
        gachaPool?: PoolEntry[]
        ownedHeroIds?: number[]
      }>('load-save')
      if (!reload.success) throw new Error(reload.error || 'reload failed')

      // 防禦性解析 GAS JSON 欄位
      const reloadSave = sanitizeSaveData(reload.saveData)

      // 初始化本地抽卡池
      initLocalPool(
        reload.gachaPool || [],
        reloadSave?.gachaPity || { pullsSinceLastSSR: 0, guaranteedFeatured: false },
        reload.ownedHeroIds || [],
      )

      currentData = {
        save: reloadSave,
        heroes: (reload.heroes || []).map(stripPlayerId),
        inventory: reload.inventory || [],
        isDirty: false,
      }
    } else {
      // 防禦性解析 GAS JSON 欄位
      const cleanSave = sanitizeSaveData(res.saveData)

      // 初始化本地抽卡池
      initLocalPool(
        res.gachaPool || [],
        cleanSave?.gachaPity || { pullsSinceLastSSR: 0, guaranteedFeatured: false },
        res.ownedHeroIds || [],
      )

      currentData = {
        save: cleanSave,
        heroes: (res.heroes || []).map(stripPlayerId),
        inventory: res.inventory || [],
        isDirty: false,
      }
    }

    saveToLocal(currentData)
    notify()

    // ── 登入成功後：背景 reconcile 上次未完成的樂觀操作 ──
    reconcilePendingOps().catch(e =>
      console.warn('[save] reconcilePendingOps error:', e),
    )

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

/** 從 HeroInstance 移除 playerId（前端不需要） */
function stripPlayerId(h: HeroInstance & { playerId?: string }): HeroInstance {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { playerId: _, ...rest } = h
  return rest as HeroInstance
}

/**
 * 更新玩家進度（金幣、鑽石、等級、經驗等）
 * 變更即時反映到本地 state，2 秒後批次寫入伺服器
 */
export function updateProgress(changes: Partial<Pick<SaveData,
  'gold' | 'diamond' | 'level' | 'exp' | 'displayName' |
  'towerFloor' | 'resourceTimerStage'
>>): void {
  const serialized: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(changes)) {
    serialized[key] = val
  }
  enqueueSave(serialized)
}

/**
 * 更新劇情進度
 */
export function updateStoryProgress(chapter: number, stage: number): void {
  const sp = JSON.stringify({ chapter, stage })
  enqueueSave({ storyProgress: sp })
  if (currentData) {
    currentData.save.storyProgress = { chapter, stage }
  }
}

/**
 * 儲存陣型（立即寫入，不經 debounce）
 */
export async function saveFormation(formation: (string | null)[]): Promise<boolean> {
  if (currentData) {
    currentData.save.formation = formation
    saveToLocal(currentData)
    notify()
  }
  try {
    const res = await callApi('save-formation', { formation })
    return res.success
  } catch {
    console.warn('[save] save-formation failed')
    return false
  }
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
    // 不重複加入
    if (currentData.heroes.some(h => h.heroId === heroId)) continue
    currentData.heroes.push({
      instanceId: `local_${heroId}_${Date.now()}`,
      heroId,
      level: 1,
      exp: 0,
      ascension: 0,
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

/**
 * 領取計時器累積資源（樂觀更新 — 零等待）
 *
 * 1. 本地計算累積資源（公式與伺服器一致）
 * 2. 立即更新本地 state + localStorage
 * 3. 背景非同步呼叫 API → 成功後移除備份
 * 4. 伺服器回傳若金幣不同則校正
 */
export async function collectResources(): Promise<AccumulatedResources | null> {
  if (!currentData) return null

  const resources = getAccumulatedResources(
    currentData.save.resourceTimerStage,
    currentData.save.resourceTimerLastCollect,
  )
  if (resources.gold <= 0 && resources.expItems <= 0) return null

  // ── 樂觀本地更新 ──
  const optimisticGold = currentData.save.gold + resources.gold
  currentData.save.gold = optimisticGold
  currentData.save.resourceTimerLastCollect = new Date().toISOString()
  saveToLocal(currentData)
  notify()

  // ── 背景 API（附帶 opId 做幂等保護） ──
  fireOptimistic<{
    gold: number
    newGoldTotal: number
    expItems: number
    hoursElapsed: number
  }>('collect-resources', {}, undefined, (result) => {
    // 伺服器回傳後校正
    if (result.success && currentData) {
      const serverGold = (result as Record<string, unknown>).newGoldTotal as number | undefined
      if (serverGold !== undefined && serverGold !== currentData.save.gold) {
        currentData.save.gold = serverGold
        saveToLocal(currentData)
        notify()
      }
    }
  })

  return resources
}

/**
 * 立即同步未寫入變更（離開頁面前呼叫）
 */
export async function flushPendingChanges(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  await flushChanges()
}
