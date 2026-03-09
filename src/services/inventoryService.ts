/**
 * inventoryService  背包與道具系統前端服務
 *
 * 負責：背包載入、道具增減、裝備管理、擴容、出售
 *
 * 對應 Spec: .ai/specs/inventory.md v0.1
 */

import { callApi } from './apiClient'
import type { InventoryItem } from './saveService'
import type { EquipmentInstance, EquipmentSlot, Rarity, SubStat } from '../domain/progressionSystem'
import { getEnhanceCost, getMaxEnhanceLevel, enhancedMainStat } from '../domain/progressionSystem'

/* 
   型別
    */

export type ItemCategory =
  | 'ascension_material'
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
}

export interface InventoryState {
  items: InventoryItem[]
  equipment: EquipmentInstance[]
  definitions: Map<string, ItemDefinition>
}

/* 
   內部 State
    */

let cachedDefinitions: Map<string, ItemDefinition> | null = null
let inventoryState: InventoryState | null = null

type InventoryListener = (state: InventoryState | null) => void
const listeners: InventoryListener[] = []

function notify(): void {
  const snapshot = inventoryState ? { ...inventoryState } : null
  for (const fn of listeners) fn(snapshot)
}

/* 
   道具定義（靜態資料）
    */

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

export function getItemDefinition(itemId: string): ItemDefinition | undefined {
  return cachedDefinitions?.get(itemId)
}

/* 
   背包操作
    */

export async function loadInventory(): Promise<InventoryState> {
  const definitions = await loadItemDefinitions()
  const res = await callApi<{
    items: InventoryItem[]
    equipment: EquipmentInstance[]
  }>('load-inventory')
  if (!res.success) throw new Error(res.error || 'load-inventory failed')

  const equipment = (res.equipment || []).map(parseEquipment)
  const serverItems = res.items || []

  inventoryState = { items: serverItems, equipment, definitions }
  notify()
  return inventoryState
}

export async function addItems(items: { itemId: string; quantity: number }[]): Promise<boolean> {
  const res = await callApi<{ inventory: InventoryItem[] }>('add-items', { items })
  if (!res.success) return false
  if (inventoryState && res.inventory) {
    inventoryState.items = res.inventory
    notify()
  }
  return true
}

export async function removeItems(items: { itemId: string; quantity: number }[]): Promise<boolean> {
  const res = await callApi<{ inventory: InventoryItem[] }>('remove-items', { items })
  if (!res.success) return false
  if (inventoryState && res.inventory) {
    inventoryState.items = res.inventory
    notify()
  }
  return true
}

export async function useItem(
  itemId: string,
  quantity: number,
  targetId?: string,
  extra?: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; currencies?: { gold?: number; diamond?: number; exp?: number } }> {
  const res = await callApi<{ result: unknown; currencies?: { gold?: number; diamond?: number; exp?: number } }>(
    'use-item', { itemId, quantity, ...(targetId ? { targetId } : {}), ...(extra || {}) },
  )
  // 伺服器確認成功後才扣除本地庫存
  if (res.success && inventoryState) {
    const existing = inventoryState.items.find(i => i.itemId === itemId)
    if (existing) {
      existing.quantity = Math.max(0, existing.quantity - quantity)
      notify()
    }
  }
  return { success: res.success, result: res.result, currencies: res.currencies }
}

/* 
   裝備操作
    */

export async function equipItem(equipId: string, heroInstanceId: string): Promise<boolean> {
  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) {
      // 先卸下同英雄同格位的舊裝備（前端樂觀更新，與後端原子操作對齊）
      for (const old of inventoryState.equipment) {
        if (old.equippedBy === heroInstanceId && old.slot === eq.slot && old.equipId !== equipId) {
          old.equippedBy = ''
        }
      }
      eq.equippedBy = heroInstanceId
    }
    notify()
  }
  const res = await callApi<{ success: boolean; heroInstanceId?: string }>('equip-item', { equipId, heroInstanceId })
  // 後端可能將 local_ ID 解析為真實 instanceId，同步回本地
  if (res.success && res.heroInstanceId && res.heroInstanceId !== heroInstanceId) {
    if (inventoryState) {
      const eq = inventoryState.equipment.find(e => e.equipId === equipId)
      if (eq) eq.equippedBy = res.heroInstanceId
      notify()
    }
  }
  return res.success
}

export async function unequipItem(equipId: string): Promise<boolean> {
  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.equippedBy = ''
    notify()
  }
  const res = await callApi('unequip-item', { equipId })
  return res.success
}

export async function lockEquipment(equipId: string, locked: boolean): Promise<boolean> {
  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.locked = locked
    notify()
  }
  const res = await callApi('lock-equipment', { equipId, locked })
  return res.success
}



export async function decomposeEquipment(equipIds: string[]): Promise<{
  success: boolean; decomposed?: number; goldGained?: number; scrapGained?: number; error?: string
}> {
  // 樂觀移除本地裝備
  const removed: EquipmentInstance[] = []
  if (inventoryState) {
    inventoryState.equipment = inventoryState.equipment.filter(e => {
      if (equipIds.includes(e.equipId)) { removed.push(e); return false }
      return true
    })
    notify()
  }
  try {
    const res = await callApi<{
      decomposed: number; goldGained: number; scrapGained: number
      currencies?: { gold?: number; diamond?: number; exp?: number }
    }>('decompose-equipment', { equipIds })
    if (res.success) {
      if (res.currencies) {
        const { applyCurrenciesFromServer } = await import('./saveService')
        applyCurrenciesFromServer(res.currencies)
      }
      // 增加碎片到本地
      if (res.scrapGained && res.scrapGained > 0) {
        addItemsLocally([{ itemId: 'equip_scrap', quantity: res.scrapGained }])
      }
      return { success: true, decomposed: res.decomposed, goldGained: res.goldGained, scrapGained: res.scrapGained }
    } else {
      // 回滾
      if (inventoryState) { inventoryState.equipment.push(...removed); notify() }
      return { success: false, error: res.error ?? 'decompose_failed' }
    }
  } catch (e) {
    if (inventoryState) { inventoryState.equipment.push(...removed); notify() }
    return { success: false, error: String(e) }
  }
}

export async function enhanceEquipment(equipId: string): Promise<{
  success: boolean; newLevel?: number; newMainStatValue?: number; goldConsumed?: number; error?: string
}> {
  if (!inventoryState) return { success: false, error: 'inventory_not_loaded' }
  const eq = inventoryState.equipment.find(e => e.equipId === equipId)
  if (!eq) return { success: false, error: 'equip_not_found' }
  const maxLvl = getMaxEnhanceLevel(eq.rarity)
  if (eq.enhanceLevel >= maxLvl) return { success: false, error: 'max_enhance_level' }
  const cost = getEnhanceCost(eq.enhanceLevel, eq.rarity)
  const oldLevel = eq.enhanceLevel
  eq.enhanceLevel = Math.min(maxLvl, oldLevel + 1)
  notify()

  const res = await callApi<{
    newLevel: number; newMainStatValue: number; goldConsumed: number; error?: string;
    currencies?: { gold: number; diamond: number; exp: number }
  }>('enhance-equipment', { equipId })

  if (res.success) {
    eq.enhanceLevel = res.newLevel ?? eq.enhanceLevel
    // 同步後端返回的最新貨幣值（強化扣除金幣）
    if (res.currencies) {
      const { applyCurrenciesFromServer } = await import('./saveService')
      applyCurrenciesFromServer(res.currencies)
    }
    notify()
    return { success: true, newLevel: res.newLevel, newMainStatValue: res.newMainStatValue, goldConsumed: res.goldConsumed }
  } else {
    eq.enhanceLevel = oldLevel
    notify()
    return { success: false, error: res.error ?? 'enhance_failed' }
  }
}

/* 
   查詢工具
    */

export function getItemQuantity(itemId: string): number {
  if (!inventoryState) return 0
  return inventoryState.items.find(i => i.itemId === itemId)?.quantity || 0
}

export function getHeroEquipment(heroInstanceId: string): EquipmentInstance[] {
  if (!inventoryState) return []
  return inventoryState.equipment.filter(e => e.equippedBy === heroInstanceId)
}

export function getUnequippedEquipment(): EquipmentInstance[] {
  if (!inventoryState) return []
  return inventoryState.equipment.filter(e => !e.equippedBy)
}

export function filterItemsByCategory(category: ItemCategory | 'all'): InventoryItem[] {
  if (!inventoryState) return []
  if (category === 'all') return inventoryState.items.filter(i => i.quantity > 0)
  return inventoryState.items.filter(i => {
    const def = inventoryState!.definitions.get(i.itemId)
    return def?.category === category && i.quantity > 0
  })
}

export function onInventoryChange(fn: InventoryListener): () => void {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

export function getInventoryState(): InventoryState | null {
  return inventoryState
}

export function clearInventoryCache(): void {
  inventoryState = null
  cachedDefinitions = null
  notify()
}

export function addItemsLocally(items: { itemId: string; quantity: number }[]): void {
  if (!inventoryState) {
    inventoryState = { items: [], equipment: [], definitions: cachedDefinitions ?? new Map() }
  }
  let changed = false
  for (const { itemId, quantity } of items) {
    if (quantity <= 0) continue
    const existing = inventoryState.items.find(i => i.itemId === itemId)
    if (existing) { existing.quantity += quantity } else { inventoryState.items.push({ itemId, quantity }) }
    changed = true
  }
  if (changed) { notify() }
}

export function removeItemsLocally(items: { itemId: string; quantity: number }[]): void {
  if (!inventoryState) {
    inventoryState = { items: [], equipment: [], definitions: cachedDefinitions ?? new Map() }
  }
  let changed = false
  for (const { itemId, quantity } of items) {
    if (quantity <= 0) continue
    const existing = inventoryState.items.find(i => i.itemId === itemId)
    if (existing) { existing.quantity = Math.max(0, existing.quantity - quantity); changed = true }
  }
  if (changed) { notify() }
}

export function addEquipmentLocally(equipment: EquipmentInstance[]): void {
  if (!inventoryState) {
    inventoryState = { items: [], equipment: [], definitions: cachedDefinitions ?? new Map() }
  }
  if (equipment.length === 0) return
  // 透過 parseEquipment 正規化，避免 rarity/subStats 為 undefined 或字串導致崩潰
  const normalized = equipment.map(eq => parseEquipment(eq))
  inventoryState.equipment.push(...normalized)
  notify()
}

/* 
   內部工具
    */

function parseEquipment(raw: EquipmentInstance & { subStats?: unknown }): EquipmentInstance {
  let subStats: SubStat[] = []
  if (typeof raw.subStats === 'string') {
    try { subStats = JSON.parse(raw.subStats) as SubStat[] } catch { subStats = [] }
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
