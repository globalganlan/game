/**
 * 戰鬥 & 場景常數
 *
 * 從 App.tsx 抽取，集中管理所有戰鬥時序、格子佈局、API 端點等常數。
 */

import type { Vector3Tuple } from 'three'
import type { SlotHero } from '../types'

/* ────────────────────────────
   過場幕時序常數（單位：ms）
   ──────────────────────────── */

/**
 * 過場流程：
 *   1. setCurtainVisible(true) → React commit DOM
 *   2. 等 CURTAIN_SETTLE_MS（2 rAF ≈ 33ms）確保幕已不透明
 *   3. 在幕後切換 state（敵方/陣型/gameState）
 *   4. closeCurtain(SCENE_RENDER_GRACE_MS) → 給場景渲染 1~2 幀的餘裕
 *   5. delay 後觸發 CSS fade-out（CURTAIN_FADE_MS = 1000，對應 curtainFadeOut 動畫）
 *   6. fade 結束 → setCurtainVisible(false)
 */
export const CURTAIN_FADE_MS = 1000
export const SCENE_RENDER_GRACE_MS = 300
export const INITIAL_CURTAIN_GRACE_MS = 350
export const REPLAY_SCENE_SETTLE_MS = 400
export const ATTACK_DELAY_MS = 840

/* ────────────────────────────
   Buff 類型
   ──────────────────────────── */

/** Buff 類型集合（用於 BuffApplyToast3D 判斷 isBuff） */
export const BUFF_TYPE_SET = new Set([
  'atk_up', 'def_up', 'spd_up', 'crit_rate_up', 'crit_dmg_up',
  'dmg_reduce', 'shield', 'regen', 'energy_boost',
  'dodge_up', 'reflect', 'taunt', 'immunity',
])

/* ────────────────────────────
   API
   ──────────────────────────── */

export const API_URL =
  'https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec'

/* ────────────────────────────
   槽位 & 格子佈局
   ──────────────────────────── */

/** 6 格空陣列 */
export const EMPTY_SLOTS: (SlotHero | null)[] = Array(6).fill(null)

/** 格子欄 X 座標（3 欄） */
export const COL_X: [number, number, number] = [-2.2, 0.0, 2.2]

/** 敵方兩排 Z 座標（前排靠近中場，後排遠離） */
export const ENEMY_ROWS_Z: [number, number] = [-2.0, -4.5]
/** 玩家兩排 Z 座標（前排靠近中場，後排遠離） */
export const PLAYER_ROWS_Z: [number, number] = [2.0, 4.5]

/**
 * 6 格座標（上下分割敵我陣型）
 *
 * 前排 idx 0,1,2（L→R），後排 idx 3,4,5（L→R）
 *
 * 敵方(上方):               我方(下方):
 *   ●  ●  ●  ← 後排(3,4,5)     ●  ●  ●  ← 前排(0,1,2)
 *   ●  ●  ●  ← 前排(0,1,2)     ●  ●  ●  ← 後排(3,4,5)
 */
function buildSlotPositions(rowsZ: [number, number]): Vector3Tuple[] {
  return rowsZ.flatMap(z => COL_X.map((x): Vector3Tuple => [x, 0, z]))
}

export const PLAYER_SLOT_POSITIONS = buildSlotPositions(PLAYER_ROWS_Z)
export const ENEMY_SLOT_POSITIONS = buildSlotPositions(ENEMY_ROWS_Z)

/* ────────────────────────────
   工具
   ──────────────────────────── */

/** 等待 N 個 requestAnimationFrame（確保 DOM/WebGL 已 commit） */
export const waitFrames = (n = 2): Promise<void> =>
  new Promise(resolve => {
    let count = 0
    const tick = () => { if (++count >= n) resolve(); else requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
