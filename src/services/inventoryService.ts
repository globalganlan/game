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

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

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

  inventoryState = {
    items: res.items || [],
    equipment,
    equipmentCapacity: res.equipmentCapacity || 200,
    definitions,
  }
  notify()
  return inventoryState
}

/** 新增道具（前端不直接呼叫，由後端結算觸發） */
export async function addItems(items: { itemId: string; quantity: number }[]): Promise<boolean> {
  const res = await callApi<{ inventory: InventoryItem[] }>('add-items', { items })
  if (!res.success) return false

  if (inventoryState && res.inventory) {
    inventoryState.items = res.inventory
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
    notify()
  }

  return res.goldGained || 0
}

/** 使用道具（寶箱開啟/經驗核心使用等） */
export async function useItem(
  itemId: string,
  quantity: number,
  targetId?: string,
): Promise<{ success: boolean; result?: unknown }> {
  const res = await callApi<{ result: unknown }>('use-item', { itemId, quantity, targetId })
  return { success: res.success, result: res.result }
}

/* ════════════════════════════════════
   裝備操作
   ════════════════════════════════════ */

/** 裝備到英雄 */
export async function equipItem(equipId: string, heroInstanceId: string): Promise<boolean> {
  const res = await callApi('equip-item', { equipId, heroInstanceId })
  if (!res.success) return false

  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.equippedBy = heroInstanceId
    notify()
  }
  return true
}

/** 卸下裝備 */
export async function unequipItem(equipId: string): Promise<boolean> {
  const res = await callApi('unequip-item', { equipId })
  if (!res.success) return false

  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.equippedBy = ''
    notify()
  }
  return true
}

/** 鎖定/解鎖裝備 */
export async function lockEquipment(equipId: string, locked: boolean): Promise<boolean> {
  const res = await callApi('lock-equipment', { equipId, locked })
  if (!res.success) return false

  if (inventoryState) {
    const eq = inventoryState.equipment.find(e => e.equipId === equipId)
    if (eq) eq.locked = locked
    notify()
  }
  return true
}

/** 擴容 */
export async function expandInventory(): Promise<number> {
  const res = await callApi<{ newCapacity: number }>('expand-inventory')
  if (!res.success) return inventoryState?.equipmentCapacity || 200

  if (inventoryState) {
    inventoryState.equipmentCapacity = res.newCapacity
    notify()
  }
  return res.newCapacity
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
