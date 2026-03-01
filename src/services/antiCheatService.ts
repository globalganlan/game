/**
 * antiCheatService — 背景反作弊校驗服務
 *
 * 戰鬥以本地引擎計算（毫秒級），同時在背景將相同輸入 + seed 送到 GAS 後端驗證。
 * 兩端使用同一套 Mulberry32 seeded PRNG → 確定性結果。
 * 若 winner 不一致 → 表示前端引擎被竄改 → 標記為可疑。
 *
 * 設計原則：
 * - 不阻塞遊戲流程（背景 fire-and-forget）
 * - 網路失敗時靜默跳過（不影響正常遊戲體驗）
 * - 校驗結果供獎勵發放前檢查
 */

import type { BattleHero } from '../domain/types'

const POST_URL =
  'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

export type Winner = 'player' | 'enemy' | 'draw'

export interface VerifyResult {
  /** 校驗是否成功（true = 伺服器有回應且結果一致） */
  verified: boolean
  /** 伺服器端的 winner */
  serverWinner: Winner
  /** 本地端的 winner */
  localWinner: Winner
  /** 校驗是否因網路/超時失敗（失敗時不視為作弊） */
  networkError: boolean
}

/**
 * 精簡序列化 BattleHero — 只保留後端引擎需要的邏輯欄位
 */
function serializeHeroes(heroes: BattleHero[]): unknown[] {
  return heroes.map(h => ({
    uid: h.uid,
    heroId: h.heroId,
    modelId: h.modelId,
    name: h.name,
    side: h.side,
    slot: h.slot,
    element: h.element,
    baseStats: h.baseStats,
    finalStats: h.finalStats,
    currentHP: h.currentHP,
    maxHP: h.maxHP,
    energy: h.energy,
    activeSkill: h.activeSkill,
    passives: h.passives,
    activePassives: h.activePassives,
    statusEffects: h.statusEffects,
    shields: h.shields,
    passiveUsage: h.passiveUsage,
    totalDamageDealt: h.totalDamageDealt,
    totalHealingDone: h.totalHealingDone,
    killCount: h.killCount,
  }))
}

/**
 * 建立一個反作弊校驗 Promise。
 *
 * 呼叫後立即回傳 { promise, abort }：
 * - promise: 解析為 VerifyResult
 * - abort: 可在不需要時取消（例如回放模式）
 *
 * @param players   - 玩家方 BattleHero（戰鬥前的初始快照）
 * @param enemies   - 敵方 BattleHero（戰鬥前的初始快照）
 * @param seed      - 與本地引擎相同的隨機種子
 * @param localWinner - 本地引擎計算的 winner
 * @param maxTurns  - 最大回合數
 * @param timeoutMs - 超時毫秒數（預設 15 秒，涵蓋 GAS 冷啟動）
 */
export function startBattleVerification(
  players: BattleHero[],
  enemies: BattleHero[],
  seed: number,
  localWinner: Winner,
  maxTurns = 50,
  timeoutMs = 15000,
): { promise: Promise<VerifyResult>; abort: () => void } {
  const controller = new AbortController()

  const promise = (async (): Promise<VerifyResult> => {
    try {
      const body = JSON.stringify({
        action: 'verify-battle',
        players: serializeHeroes(players),
        enemies: serializeHeroes(enemies),
        maxTurns,
        seed,
        localWinner,
      })

      const res = await fetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body,
        signal: controller.signal,
      })

      if (!res.ok) {
        console.warn(`[AntiCheat] HTTP ${res.status}`)
        return { verified: true, serverWinner: localWinner, localWinner, networkError: true }
      }

      const data = await res.json()

      if (!data.success) {
        console.warn(`[AntiCheat] API error:`, data.error)
        return { verified: true, serverWinner: localWinner, localWinner, networkError: true }
      }

      const result: VerifyResult = {
        verified: data.verified,
        serverWinner: data.serverWinner as Winner,
        localWinner,
        networkError: false,
      }

      if (!result.verified) {
        console.error(
          `[AntiCheat] ⚠️ 戰鬥結果不一致！` +
          `\n  本地: ${localWinner}` +
          `\n  伺服器: ${data.serverWinner}` +
          `\n  seed: ${seed}`
        )
      } else {
        console.debug(`[AntiCheat] ✓ 校驗通過 (winner=${localWinner}, seed=${seed})`)
      }

      return result
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 被手動取消（例：回放模式不需要校驗）
        return { verified: true, serverWinner: localWinner, localWinner, networkError: true }
      }
      console.warn(`[AntiCheat] Network error:`, err)
      return { verified: true, serverWinner: localWinner, localWinner, networkError: true }
    }
  })()

  // 超時保護：超過 timeoutMs 就放棄等待，視為通過
  const timeoutPromise = new Promise<VerifyResult>((resolve) => {
    setTimeout(() => {
      resolve({ verified: true, serverWinner: localWinner, localWinner, networkError: true })
    }, timeoutMs)
  })

  return {
    promise: Promise.race([promise, timeoutPromise]),
    abort: () => controller.abort(),
  }
}
