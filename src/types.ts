/**
 * 共用型別定義 — 全球感染 (GlobalGanLan)
 *
 * 所有 3D 場景、英雄資料、遊戲狀態相關的介面與類型。
 */

import type { Vector3Tuple } from 'three'

/* ────────────────────────────
   遊戲狀態
   ──────────────────────────── */

/** 遊戲大階段 */
export type GameState =
  | 'PRE_BATTLE'
  | 'FETCHING'
  | 'MAIN_MENU'
  | 'IDLE'
  | 'BATTLE'
  | 'GAMEOVER'

/** 主選單子畫面 */
export type MenuScreen = 'none' | 'heroes' | 'inventory' | 'gacha' | 'stages' | 'settings' | 'mailbox'

/** 單一角色的即時狀態 */
export type ActorState =
  | 'IDLE'
  | 'ADVANCING'
  | 'ATTACKING'
  | 'HURT'
  | 'RETREATING'
  | 'DEAD'

/** ZombieModel 動畫狀態（對應 FBX 動畫名） */
export type AnimationState = 'IDLE' | 'ATTACKING' | 'HURT' | 'DEAD' | 'RUN'

/* ────────────────────────────
   英雄資料
   ──────────────────────────── */

/** API 回傳的原始英雄資料 */
export interface RawHeroData {
  Name?: string
  HP?: number
  ATK?: number
  Speed?: number
  SPD?: number
  SPEED?: number
  AGI?: number
  HeroID?: string | number
  ModelID?: string | number
  ModelId?: string | number
  Model?: string | number
  id?: string | number
  _modelId?: string
  [key: string]: unknown
}

/** 槽位中的英雄（含執行期欄位） */
export interface SlotHero extends RawHeroData {
  currentHP: number
  slot?: number
  _uid: string
  _modelId: string
  ModelID: string
}

/* ────────────────────────────
   傷害彈窗
   ──────────────────────────── */

export interface DamagePopupData {
  id: number
  uid: string
  value: number
}

/* ────────────────────────────
   回應式設定
   ──────────────────────────── */

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export interface ResponsiveInfo {
  device: DeviceType
  fov: number
  camPos: Vector3Tuple
  camTarget: Vector3Tuple
  textScale: number
  dpr: [number, number]
  /** 手機/平板橫屏（需旋轉 UI） */
  isLandscape: boolean
}

/* ────────────────────────────
   碎片 (Debris)
   ──────────────────────────── */

export type DebrisType = 'box' | 'slab' | 'pillar' | 'rock' | 'rebar' | 'chunk'

export interface DebrisItem {
  position: Vector3Tuple
  scale: Vector3Tuple
  rotation: Vector3Tuple
  color: string
  type: DebrisType
}

/* ────────────────────────────
   戰鬥迴圈
   ──────────────────────────── */

export interface BattleActor {
  side: 'player' | 'enemy'
  slot: number
  hero: SlotHero
  speed: number
}

/** waitForAction 內部儲存 */
export interface ActionResolveEntry {
  resolve: () => void
  expectedState: AnimationState | null
}
