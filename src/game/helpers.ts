/**
 * 戰鬥工具函式
 *
 * 從 App.tsx 抽取的純函式：英雄 ID 正規化、敵方陣型建立等。
 */

import type { RawHeroData, SlotHero } from '../types'
import {
  getTowerFloorConfig,
  getDailyDungeonConfig,
  getPvPOpponents,
  getBossEnemies,
} from '../domain/stageSystem'

/* ────────────────────────────
   攻擊目標選擇策略（保留型別供未來擴展）
   ──────────────────────────── */

export type TargetStrategy = (
  attackerCol: number,
  targetSlots: (SlotHero | null)[],
) => (SlotHero & { slot: number })[]

/* ────────────────────────────
   工具函式
   ──────────────────────────── */

/** 將原始英雄資料的 ID 正規化為 `zombie_N` 格式 */
export function normalizeModelId(h: RawHeroData | null, idx = 0): string {
  const rawId = h && (h._modelId || h.ModelID || h.HeroID || h.ModelId || h.Model || h.id || h.Name)
  if (!rawId) return `zombie_${idx + 1}`
  const idText = rawId.toString().trim()
  const zm = idText.match(/zombie[_-]?(\d+)/i)
  if (zm) return `zombie_${zm[1]}`
  const nm = idText.match(/\d+/)
  if (nm) return `zombie_${nm[0]}`
  return `zombie_${idx + 1}`
}

/** 從英雄資料取得速度值 */
export function getHeroSpeed(h: RawHeroData): number {
  return (h.Speed || h.SPD || h.SPEED || h.AGI || 1) as number
}

/** clamp 0–1 */
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * 根據關卡設定產生固定的敵方 SlotHero 陣列。
 * mode: story / tower / daily — 由對應的 stageSystem 函式取得 enemies 定義
 * heroesList: 所有英雄原始資料（用於取得 HP/ATK 等基礎值）
 * injectedEnemies: 若提供則直接使用（story mode 從 API 取得時使用）
 */
export function buildEnemySlotsFromStage(
  mode: 'story' | 'tower' | 'daily' | 'pvp' | 'boss',
  stageId: string,
  heroesList: RawHeroData[],
  injectedEnemies?: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number; defMultiplier?: number }[],
): (SlotHero | null)[] {
  let enemies: { heroId: number; slot: number; hpMultiplier: number; atkMultiplier: number; speedMultiplier: number; defMultiplier?: number }[]

  if (injectedEnemies) {
    enemies = injectedEnemies
  } else if (mode === 'tower') {
    const floor = Number(stageId) || 1
    enemies = getTowerFloorConfig(floor).enemies
  } else if (mode === 'daily') {
    const cfg = getDailyDungeonConfig(stageId)
    enemies = cfg ? cfg.difficulty.enemies : []
  } else if (mode === 'pvp') {
    // stageId = "pvp_0" ~ "pvp_2"
    const idx = Number(stageId.replace('pvp_', '')) || 0
    const opponents = getPvPOpponents({ chapter: 1, stage: 1 }) // progress doesn't matter; opponents seeded by date
    enemies = opponents[idx]?.enemies ?? []
  } else if (mode === 'boss') {
    // stageId = bossId e.g. "boss_1"
    enemies = getBossEnemies(stageId)
  } else {
    // story mode — enemies 應從 API 取得後透過 injectedEnemies 傳入
    // 若未傳入則給空陣列（不應發生）
    enemies = []
  }

  // 建立 heroId → RawHeroData 的對照表
  const heroMap = new Map<number, { hero: RawHeroData; idx: number }>()
  heroesList.forEach((h, idx) => {
    const hid = Number(h.HeroID ?? h.id ?? idx + 1)
    heroMap.set(hid, { hero: h, idx })
  })

  const slots: (SlotHero | null)[] = Array(6).fill(null)
  enemies.forEach((e) => {
    if (e.slot >= 6) return
    // 查找基礎資料；找不到就用 zombie_{heroId} 的 fallback
    const found = heroMap.get(e.heroId)
    const baseHero: RawHeroData = found?.hero ?? { HeroID: e.heroId, Name: `殭屍 ${e.heroId}`, HP: 100, ATK: 20 }
    const mid = `zombie_${e.heroId}`
    const hp = Math.floor(((baseHero.HP as number) ?? 100) * e.hpMultiplier)
    const atk = Math.floor(((baseHero.ATK as number) ?? 20) * e.atkMultiplier)
    const def = Math.floor(((baseHero.DEF as number) ?? 10) * (e.defMultiplier ?? 1.0))
    const spd = Math.floor(getHeroSpeed(baseHero) * e.speedMultiplier)

    slots[e.slot] = {
      ...baseHero,
      HP: hp,
      ATK: atk,
      DEF: def,
      Speed: spd,
      slot: e.slot,
      currentHP: hp,
      _uid: `${mid}_stage_${e.slot}`,
      _modelId: mid,
      ModelID: mid,
    }
  })

  return slots
}
