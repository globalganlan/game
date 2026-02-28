/**
 * inventoryService — 背包與道具系統前端服務
 *
 * 負責：背包載入、道具增減、裝備管理、擴容、出售
 *
 * 對應 Spec: specs/inventory.md v0.1
 */

import { getAuthState } from './authService'
import type { InventoryItem } from './saveService'
import type { EquipmentInstance, EquipmentSlot, Rarity, SubStat } from '../domain/progressionSystem'
import { fireOptimisticAsync } from './optimisticQueue'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

const STORAGE_KEY_INVENTORY = 'globalganlan_inventory_cache'

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export type ItemCategory =
  | 'exp_material'
  | 'ascension_material'
  | 'equipment_material'
  | 'forge_material'
  | 'general_material'
  | 'equipment'
  | 'chest'
  | 'currency'

export interface ItemDefinition {
  itemId: string
  name: string
  category: ItemCategory
  rarity: 'N' | 'R' | 'SR' | 'SSR'
  description: string
  icon: string
  stackLimit: number
  useAction: string
  sellPrice: number
}

export interface InventoryState {
  items: InventoryItem[]
  equipment: EquipmentInstance[]
  equipmentCapacity: number
  definitions: Map<string, ItemDefinition>
}

/* ════════════════════════════════════
   內部 State
   ════════════════════════════════════ */

let cachedDefinitions: Map<string, ItemDefinition> | null = null
let inventoryState: InventoryState | null = null

type InventoryListener = (state: InventoryState | null) => void
const listeners: InventoryListener[] = []

function notify(): void {
  const snapshot = inventoryState ? { ...inventoryState } : null
  for (const fn of listeners) fn(snapshot)
}

/** localStorage 備份 — 只存 items（equipment/definitions 由 API 載入） */
function saveInventoryToLocal(): void {
  if (!inventoryState) return
  try {
    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(inventoryState.items))
  } catch { /* 容量不足忽略 */ }
}

/** 從 localStorage 恢復 items（離線 fallback） */
function loadInventoryFromLocal(): InventoryItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVENTORY)
    if (raw) return JSON.parse(raw) as InventoryItem[]
  } catch { /* 損壞忽略 */ }
  return null
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
   道具定義（靜態資料）
   ════════════════════════════════════ */

/** 載入道具定義表（快取） */
export async function loadItemDefinitions(): Promise<Map<string, ItemDefinition>> {
  if (cachedDefinitions) return cachedDefinitions

  const res = await callApi<{ items: ItemDefinition[] }>('load-item-definitions')
  if (!res.success) throw new Error(res.error || 'load-item-definitions failed')

  const map = new Map<string, ItemDefinition>()
  for (const item of (res.items || [])) {
    map.set(item.itemId, item)
  }
  cachedDefinitions = map
  return map
}

/** 取得單個道具定義 */
export function getItemDefinition(itemId: string): ItemDefinition | undefined {
  return cachedDefinitions?.get(itemId)
}

/* ════════════════════════════════════
   背包操作
   ════════════════════════════════════ */

/** 載入完整背包 */
export async function loadInventory(): Promise<InventoryState> {
  const definitions = await loadItemDefinitions()
  const res = await callApi<{
    items: InventoryItem[]
    equipment: EquipmentInstance[]
    equipmentCapacity: number
  }>('load-inventory')

  if (!res.success) throw new Error(res.error || 'load-inventory failed')

  // Parse equipment subStats JSON if needed
  const equipment = (res.equipment || []).map(parseEquipment)

  // 合併 localStorage 暫存的樂觀道具（API 未反映的本地變更）
  const serverItems = res.items || []
  const localItems = loadInventoryFromLocal()
  let mergedItems = serverItems
  if (localItems) {
    // 以 server 為基準，若 local 數量更多則取 local（樂觀寫入尚未同步）
    const map = new Map<string, number>()
    for (const it of serverItems) map.set(it.itemId, it.quantity)
    for (const it of localItems) {
      const sv = map.get(it.itemId) ?? 0
      if (it.quantity > sv) map.set(it.itemId, it.quantity)
    }
    mergedItems = [...map.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))
  }

  inventoryState = {
    items: mergedItems,
    equipment,
    equipmentCapacity: res.equipmentCapacity || 200,
    definitions,
  }
  saveInventoryToLocal()
  notify()
  return inventoryState
}

/** 新增道具（前端不直接呼叫，由後端結算觸發） */
export async function addItems(items: { itemId: string; quantity: number }[]): Promise<boolean> {
  const res = await callApi<{ inventory: InventoryItem[] }>('add-items', { items })
  if (!res.success) return false

  if (inventoryState && res.inventory) {
    inventoryState.items = res.inventory
    saveInventoryToLocal()
    notify()
  }
  return true
}

/** 消耗道具 */
export async function removeItems(items: { itemId: string; quantity: number }[]): Promise<boolean> {
  const res = await callApi<{ inventory: InventoryItem[] }>('remove-items', { items })
  if (!res.success) return false

  if (inventoryState && res.inventory) {
    inventoryState.items = res.inventory
    saveInventoryToLocal()
    notify()
  }
  return true
}

/** 出售道具 */
export async function sellItems(items: { itemId: string; quantity: number }[]): Promise<number> {
  const res = await callApi<{ goldGained: number }>('sell-items', { items })
  if (!res.success) return 0

  // 本地更新 inventory
  if (inventoryState) {
    for (const sold of items) {
      const existing = inventoryState.items.find(i => i.itemId === sold.itemId)
      if (existing) existing.quantity = Math.max(0, existing.quantity - sold.quantity)
    }
    saveInventoryToLocal()
    notify()
  }

  return res.goldGained || 0
}

/** 使用道具（寶箱開啟/經驗核心使用等 — 樂觀佇列保護） */
export async function useItem(
  itemId: string,
  quantity: number,
  targetId?: string,
): Promise<{ success: boolean; result?: unknown }> {
  // 樂觀扣減本地數量
  if (inventoryState) {
    const existing = inventoryState.items.find(i => i.itemId === itemId)
    if (existing) {
      existing.quantity = Math.max(0, existing.quantity - quantity)
      saveInventoryToLocal()
      notify()
    }
  }
  const { serverResult } = fireOptimisticAsync<{ result: unknown }>(
    'use-item', { itemId, quantity, ...(targetId ? { targetId } : {}) },
  )
  const res = await serverResult
  return { success: res.success, result: res.result }
}

/* ════════════════════════════════════
   裝備操作
   ════════════════════════════════════ */

/** 裝備到英雄（樂觀佇列保護） */
export async function equipItem(equipId: string, heroInstanceId: string): Promise<boolean> {
  // 樂觀立即更新
  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.equippedBy = heroInstanceId
    notify()
  }
  const { serverResult } = fireOptimisticAsync('equip-item', { equipId, heroInstanceId })
  const res = await serverResult
  return res.success
}

/** 卸下裝備（樂觀佇列保護） */
export async function unequipItem(equipId: string): Promise<boolean> {
  // 樂觀立即更新
  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.equippedBy = ''
    notify()
  }
  const { serverResult } = fireOptimisticAsync('unequip-item', { equipId })
  const res = await serverResult
  return res.success
}

/** 鎖定/解鎖裝備（樂觀佇列保護） */
export async function lockEquipment(equipId: string, locked: boolean): Promise<boolean> {
  // 樂觀立即更新
  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.locked = locked
    notify()
  }
  const { serverResult } = fireOptimisticAsync('lock-equipment', { equipId, locked })
  const res = await serverResult
  return res.success
}

/** 擴容（樂觀佇列保護） */
export async function expandInventory(): Promise<number> {
  const { serverResult } = fireOptimisticAsync<{ newCapacity: number }>('expand-inventory', {})
  const res = await serverResult
  if (res.success && inventoryState) {
    inventoryState.equipmentCapacity = res.newCapacity
    notify()
  }
  return res.newCapacity || inventoryState?.equipmentCapacity || 200
}

/* ════════════════════════════════════
   查詢工具
   ════════════════════════════════════ */

/** 取得某道具的數量 */
export function getItemQuantity(itemId: string): number {
  if (!inventoryState) return 0
  return inventoryState.items.find(i => i.itemId === itemId)?.quantity || 0
}

/** 取得某英雄已裝備的裝備 */
export function getHeroEquipment(heroInstanceId: string): EquipmentInstance[] {
  if (!inventoryState) return []
  return inventoryState.equipment.filter(e => e.equippedBy === heroInstanceId)
}

/** 取得背包中未裝備的裝備 */
export function getUnequippedEquipment(): EquipmentInstance[] {
  if (!inventoryState) return []
  return inventoryState.equipment.filter(e => !e.equippedBy)
}

/** 依分類篩選道具 */
export function filterItemsByCategory(category: ItemCategory | 'all'): InventoryItem[] {
  if (!inventoryState) return []
  if (category === 'all') return inventoryState.items.filter(i => i.quantity > 0)
  return inventoryState.items.filter(i => {
    const def = inventoryState!.definitions.get(i.itemId)
    return def?.category === category && i.quantity > 0
  })
}

/** 訂閱背包變化 */
export function onInventoryChange(fn: InventoryListener): () => void {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

/** 取得當前背包狀態 */
export function getInventoryState(): InventoryState | null {
  return inventoryState
}

/**
 * 樂觀新增道具到本地背包（不呼叫 API）
 * 用於戰勝掉落、抽卡重複、信件獎勵等即時更新場景。
 * Server 入帳由對應的背景 API 處理。
 */
export function addItemsLocally(items: { itemId: string; quantity: number }[]): void {
  // 若 inventoryState 未初始化（玩家還沒開過背包），建立一個最小狀態
  if (!inventoryState) {
    const localItems = loadInventoryFromLocal() ?? []
    inventoryState = {
      items: localItems,
      equipment: [],
      equipmentCapacity: 200,
      definitions: cachedDefinitions ?? new Map(),
    }
  }
  let changed = false
  for (const { itemId, quantity } of items) {
    if (quantity <= 0) continue
    const existing = inventoryState.items.find(i => i.itemId === itemId)
    if (existing) {
      existing.quantity += quantity
    } else {
      inventoryState.items.push({ itemId, quantity })
    }
    changed = true
  }
  if (changed) {
    saveInventoryToLocal()
    notify()
  }
}

/* ════════════════════════════════════
   內部工具
   ════════════════════════════════════ */

function parseEquipment(raw: EquipmentInstance & { subStats?: unknown }): EquipmentInstance {
  let subStats: SubStat[] = []
  if (typeof raw.subStats === 'string') {
    try {
      subStats = JSON.parse(raw.subStats) as SubStat[]
    } catch {
      subStats = []
    }
  } else if (Array.isArray(raw.subStats)) {
    subStats = raw.subStats as SubStat[]
  }
  return {
    equipId: String(raw.equipId || ''),
    templateId: String(raw.templateId || ''),
    setId: String(raw.setId || ''),
    slot: (raw.slot || 'weapon') as EquipmentSlot,
    rarity: (raw.rarity || 'N') as Rarity,
    mainStat: String(raw.mainStat || 'ATK'),
    mainStatValue: Number(raw.mainStatValue) || 0,
    enhanceLevel: Number(raw.enhanceLevel) || 0,
    subStats,
    equippedBy: String(raw.equippedBy || ''),
    locked: raw.locked === true || raw.locked === 'TRUE' as unknown as boolean,
    obtainedAt: String(raw.obtainedAt || ''),
  }
}
