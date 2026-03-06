/**
 * 共用物品 & 稀有度常數
 *
 * 所有 UI 畫面（背包、抽卡、英雄列表、信箱、商店、獎勵等）統一使用，
 * 避免各檔案重複定義導致不一致。
 */

export type Rarity = 'N' | 'R' | 'SR' | 'SSR'

/** 文字/數字 → Rarity 標籤（相容 DB TEXT 欄位 'R'/'SR'/'SSR' 及舊式數字 1-4） */
export function toRarity(v: unknown): Rarity {
  const s = String(v).toUpperCase()
  if (s === 'SSR' || s === '4') return 'SSR'
  if (s === 'SR' || s === '3') return 'SR'
  if (s === 'R' || s === '2') return 'R'
  return 'N'
}

/** 文字/數字 → 稀有度數字（N=1, R=2, SR=3, SSR=4），供 domain 層使用 */
const _RARITY_TO_NUM: Record<string, number> = { N: 1, R: 2, SR: 3, SSR: 4 }
export function toRarityNum(v: unknown): number {
  const n = Number(v)
  if (n >= 1 && n <= 4 && Number.isFinite(n)) return Math.round(n)
  return _RARITY_TO_NUM[String(v).toUpperCase()] ?? 1
}

/** 基礎邊框/文字顏色 */
export const RARITY_COLORS: Record<Rarity, string> = {
  N: '#aaa',
  R: '#4dabf7',
  SR: '#be4bdb',
  SSR: '#ffd43b',
}

/** 完整稀有度視覺配置（含光暈、標籤、背景） */
export const RARITY_CONFIG: Record<Rarity, {
  color: string
  border: string
  bg: string
  glow: string
  label: string
}> = {
  SSR: { color: '#ffd43b', border: '#ffd43b', bg: 'rgba(255,212,59,0.12)', glow: '0 0 20px #ffd43b', label: '★★★★ SSR' },
  SR:  { color: '#be4bdb', border: '#be4bdb', bg: 'rgba(190,75,219,0.10)', glow: '0 0 15px #be4bdb', label: '★★★ SR' },
  R:   { color: '#4dabf7', border: '#4dabf7', bg: 'rgba(77,171,247,0.08)', glow: '0 0 10px #4dabf7', label: '★★ R' },
  N:   { color: '#aaa',    border: '#666',    bg: 'rgba(136,136,136,0.06)', glow: 'none',              label: '★ N' },
}

/* ────────────────────────────
   道具 Icon 映射（emoji）
   ──────────────────────────── */

/** 道具 itemId → 顯示 Emoji icon */
export const ITEM_ICONS: Record<string, string> = {
  // 貨幣
  diamond: '💎',
  gold: '💰',
  stardust: '✨',
  currency_diamond: '💎',
  currency_gold: '💰',
  currency_stardust: '✨',
  currency_pvp_coin: '🏅',
  // 經驗資源
  exp: '💚',
  currency_exp: '💚',
  // 突破職業石
  asc_class_power: '🗡️',
  asc_class_agility: '🏃',
  asc_class_defense: '🛡️',
  asc_class_universal: '🌐',
  // 裝備相關
  chest_equipment: '📦',
  chest_bronze: '🥉',
  chest_silver: '🥈',
  chest_gold: '🥇',
  eqm_enhance_s: '🔨',
  eqm_enhance_m: '🔨',
  eqm_enhance_l: '🔨',
  forge_ore_common: '⛏️',
  forge_ore_rare: '💠',
  // 其他
  stamina_potion: '⚡',
  gold_pack_10k: '💰',
  pvp_coin: '🏅',
  // 召喚券
  gacha_ticket_hero: '🎟️',
  gacha_ticket_equip: '🔧',
  equip_scrap: '🔩',
}

/** 根據 itemId 取得顯示 icon（碎片用 🧩，未知用 🎁） */
export function getItemIcon(itemId: string): string {
  if (ITEM_ICONS[itemId]) return ITEM_ICONS[itemId]
  if (itemId.startsWith('asc_fragment_')) return '🧩'
  return '🎁'
}

/* ────────────────────────────
   道具名稱映射（中文）
   ──────────────────────────── */

/** 道具 itemId → 中文名稱 */
export const ITEM_NAMES: Record<string, string> = {
  // 貨幣
  diamond: '鑽石',
  gold: '金幣',
  stardust: '星塵',
  currency_diamond: '鑽石',
  currency_gold: '金幣',
  currency_stardust: '星塵',
  currency_pvp_coin: '競技幣',
  // 經驗資源
  exp: '經驗',
  currency_exp: '經驗',
  // 突破職業石
  asc_class_power: '力量職業石',
  asc_class_agility: '敏捷職業石',
  asc_class_defense: '防禦職業石',
  asc_class_universal: '通用職業石',
  // 裝備相關
  chest_equipment: '裝備寶箱',
  chest_bronze: '銅寶箱',
  chest_silver: '銀寶箱',
  chest_gold: '金寶箱',
  eqm_enhance_s: '小型強化石',
  eqm_enhance_m: '中型強化石',
  eqm_enhance_l: '大型強化石',
  forge_ore_common: '普通鍛造礦',
  forge_ore_rare: '稀有鍛造礦',
  // 其他
  stamina_potion: '體力藥水',
  gold_pack_10k: '金幣禮包',
  pvp_coin: '競技幣',
  // 召喚券
  gacha_ticket_hero: '英雄召喚券',
  gacha_ticket_equip: '裝備鍛造券',
  equip_scrap: '裝備碎片',
}

/** 根據 itemId 取得中文名稱（碎片顯示「突破碎片」，未知回傳 itemId） */
export function getItemName(itemId: string): string {
  if (ITEM_NAMES[itemId]) return ITEM_NAMES[itemId]
  if (itemId.startsWith('asc_fragment_')) return '突破碎片'
  return itemId
}
