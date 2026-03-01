/**
 * 戰鬥流程驗證器 (Battle Flow Validator)
 *
 * 在開發/測試階段自動偵測常見的戰鬥動畫流程 bug：
 * - 無效的角色狀態轉換（如 DEAD → ATTACKING）
 * - 對已死亡角色發送動作
 * - onAction 回呼耗時異常（可能卡住）
 * - 同一角色並行衝突（同時 ADVANCING + ATTACKING）
 * - 流程中缺少必要的狀態轉換
 *
 * v1.0.0 - 2026-03-01
 */

import type { ActorState } from '../types'
import type { BattleAction } from './types'

/* ── 合法狀態轉換表 ── */
const VALID_TRANSITIONS: Record<ActorState, ActorState[]> = {
  IDLE:       ['ADVANCING', 'ATTACKING', 'HURT', 'DEAD'],
  ADVANCING:  ['ATTACKING', 'IDLE'],               // 到定位後可攻擊或被打斷回 IDLE
  ATTACKING:  ['RETREATING', 'HURT', 'DEAD', 'IDLE'],  // 攻擊後退、被反彈打、被殺、原地施法回 IDLE
  HURT:       ['IDLE', 'DEAD'],                     // 受傷恢復 or 死亡
  RETREATING: ['IDLE', 'HURT', 'DEAD'],             // 回位後 IDLE，或後退途中被殺
  DEAD:       [],                                   // 終態，不可轉換
}

export interface FlowIssue {
  severity: 'error' | 'warn'
  message: string
  actionIndex: number
  actionType: string
  timestamp: number
}

export class BattleFlowValidator {
  private actorStates: Map<string, ActorState> = new Map()
  private deadActors: Set<string> = new Set()
  private issues: FlowIssue[] = []
  private actionIndex = 0
  private actionStartTime = 0
  private readonly HUNG_THRESHOLD_MS: number

  /**
   * @param hungThresholdMs 單一 onAction 超過此毫秒數視為疑似卡住 (預設 10 秒)
   */
  constructor(hungThresholdMs = 10_000) {
    this.HUNG_THRESHOLD_MS = hungThresholdMs
  }

  /** 初始化所有參戰角色為 IDLE */
  registerActors(uids: string[]): void {
    this.actorStates.clear()
    this.deadActors.clear()
    this.issues = []
    this.actionIndex = 0
    for (const uid of uids) {
      this.actorStates.set(uid, 'IDLE')
    }
  }

  /** 記錄一次狀態轉換，回傳是否合法 */
  transition(uid: string, newState: ActorState, context?: string): boolean {
    const current = this.actorStates.get(uid)
    if (current === undefined) {
      this.addIssue('warn', `Unknown actor ${uid} transition → ${newState}`, context)
      this.actorStates.set(uid, newState)
      return false
    }

    // 已死亡角色不得轉換
    if (this.deadActors.has(uid)) {
      this.addIssue('error', `Dead actor ${uid} attempted transition → ${newState} (should be removed)`, context)
      return false
    }

    const validTargets = VALID_TRANSITIONS[current]
    if (!validTargets.includes(newState)) {
      this.addIssue('error',
        `Invalid transition: ${uid} ${current} → ${newState} ` +
        `(valid: ${validTargets.join(', ') || 'none'})`,
        context,
      )
      return false
    }

    this.actorStates.set(uid, newState)
    if (newState === 'DEAD') this.deadActors.add(uid)
    return true
  }

  /** 在 onAction 開始前呼叫 */
  beforeAction(action: BattleAction): void {
    this.actionIndex++
    this.actionStartTime = performance.now()

    // 驗證：對已死亡角色發動攻擊/技能
    if (action.type === 'NORMAL_ATTACK') {
      this.assertAlive(action.attackerUid, 'NORMAL_ATTACK attacker')
      this.assertAlive(action.targetUid, 'NORMAL_ATTACK target')
    } else if (action.type === 'SKILL_CAST') {
      this.assertAlive(action.attackerUid, 'SKILL_CAST attacker')
      for (const t of action.targets) {
        this.assertAlive(t.uid, `SKILL_CAST target`)
      }
    } else if (action.type === 'DEATH') {
      // DEATH action on already dead actor — DOT/被動致死後引擎仍會發 DEATH action，
      // 表現層的 onAction 會因 actorState===DEAD 跳過，降級為 warn
      if (this.deadActors.has(action.targetUid)) {
        this.addIssue('warn', `DEATH action on already dead actor ${action.targetUid} (DOT/passive killed earlier, expected)`)
      }
    } else if (action.type === 'DOT_TICK') {
      this.assertAlive(action.targetUid, 'DOT_TICK target')
    } else if (action.type === 'PASSIVE_DAMAGE') {
      this.assertAlive(action.targetUid, 'PASSIVE_DAMAGE target')
    }
  }

  /** 在 onAction 結束後呼叫 */
  afterAction(action: BattleAction): void {
    const elapsed = performance.now() - this.actionStartTime
    if (elapsed > this.HUNG_THRESHOLD_MS) {
      this.addIssue('warn',
        `Action #${this.actionIndex} (${action.type}) took ${elapsed.toFixed(0)}ms — possible hang`,
      )
    }

    // 驗證：攻擊者應該在動作結束後回到 IDLE、DEAD、RETREATING 或 ATTACKING（pending retreat）
    // ★ 注意：戰鬥引擎透過 pendingRetreats 延遲後退動畫（與下一個 action 並行），
    //   因此 onAction 回傳時攻擊者仍在 ATTACKING 是正常行為。
    //   只有 ADVANCING / HURT 才是真正異常的狀態。
    if (action.type === 'NORMAL_ATTACK' || action.type === 'SKILL_CAST') {
      const attackerUid = action.attackerUid
      const state = this.actorStates.get(attackerUid)
      if (state && state !== 'IDLE' && state !== 'DEAD' && state !== 'RETREATING' && state !== 'ATTACKING') {
        this.addIssue('warn',
          `After ${action.type}, attacker ${attackerUid} is in unexpected state ${state}`,
        )
      }
    }

    // 驗證：被殺的目標應該已經是 DEAD
    // ★ 致死攻擊的死亡動畫放入 backgroundAnims 不阻塞 onAction，
    //   afterAction 時角色可能仍在 IDLE/HURT → 降級為 warn（非真正錯誤）
    if (action.type === 'NORMAL_ATTACK' && action.killed) {
      const state = this.actorStates.get(action.targetUid)
      if (state && state !== 'DEAD') {
        this.addIssue('warn',
          `After NORMAL_ATTACK kill, target ${action.targetUid} is ${state} (death anim in background, expected)`,
        )
      }
    }
  }

  /** 戰鬥結束後統一驗證 — 所有存活角色應在 IDLE */
  validateEnd(): void {
    for (const [uid, state] of this.actorStates) {
      if (this.deadActors.has(uid)) continue
      if (state !== 'IDLE') {
        this.addIssue('warn', `Battle ended but actor ${uid} is in ${state} instead of IDLE`)
      }
    }
  }

  /** 取得所有問題（可用於測試斷言或 console 輸出） */
  getIssues(): readonly FlowIssue[] {
    return this.issues
  }

  getErrors(): FlowIssue[] {
    return this.issues.filter(i => i.severity === 'error')
  }

  getWarnings(): FlowIssue[] {
    return this.issues.filter(i => i.severity === 'warn')
  }

  /** 印出所有問題到 console */
  report(): void {
    if (this.issues.length === 0) return
    console.group(`%c[BattleFlowValidator] ${this.issues.length} issue(s) found`, 'color: #e63946; font-weight: bold')
    for (const issue of this.issues) {
      const fn = issue.severity === 'error' ? console.error : console.warn
      fn(`[#${issue.actionIndex} ${issue.actionType}] ${issue.message}`)
    }
    console.groupEnd()
  }

  /* ── 內部工具 ── */
  private assertAlive(uid: string, context: string): void {
    if (this.deadActors.has(uid)) {
      this.addIssue('error', `${context}: actor ${uid} is already dead`)
    }
  }

  private addIssue(
    severity: 'error' | 'warn',
    message: string,
    actionTypeOverride?: string,
  ): void {
    this.issues.push({
      severity,
      message,
      actionIndex: this.actionIndex,
      actionType: actionTypeOverride ?? `action#${this.actionIndex}`,
      timestamp: Date.now(),
    })
  }
}

/* ── 靜態工具：快速驗證整組 BattleAction[] ── */

/**
 * 靜態驗證一組 BattleAction 序列的合法性（不需要 3D 渲染環境）
 * 適合用於單元測試
 */
export function validateBattleActions(
  actions: BattleAction[],
  actorUids: string[],
  options?: { hungThresholdMs?: number },
): FlowIssue[] {
  const v = new BattleFlowValidator(options?.hungThresholdMs ?? Infinity)
  v.registerActors(actorUids)

  for (const act of actions) {
    v.beforeAction(act)
    // 模擬 onAction 產生的狀態轉換
    simulateStateTransitions(v, act)
    v.afterAction(act)
  }

  v.validateEnd()
  return [...v.getIssues()]
}

/**
 * 模擬 onAction 中所有 setActorState 呼叫
 * （純邏輯，與 App.tsx 的 onAction switch-case 對映）
 */
function simulateStateTransitions(v: BattleFlowValidator, action: BattleAction): void {
  switch (action.type) {
    case 'NORMAL_ATTACK': {
      // 1. 前進
      v.transition(action.attackerUid, 'ADVANCING', 'NORMAL_ATTACK:advance')
      // 2. 攻擊
      v.transition(action.attackerUid, 'ATTACKING', 'NORMAL_ATTACK:attack')
      // 3. 目標受擊/死亡
      if (!action.result.isDodge) {
        if (action.killed) {
          v.transition(action.targetUid, 'DEAD', 'NORMAL_ATTACK:target_killed')
        } else {
          v.transition(action.targetUid, 'HURT', 'NORMAL_ATTACK:target_hurt')
          v.transition(action.targetUid, 'IDLE', 'NORMAL_ATTACK:target_recover')
        }
      }
      // 4. 攻擊者後退
      // 檢查 reflectDamage 致死
      if (action.result.reflectDamage > 0) {
        // 需要看攻擊者是否存活 — 這裡簡化：killed target 且 reflectDamage 不會致死攻擊者
        // 精確判斷需要 HP 資訊，此處僅做轉換驗證
      }
      v.transition(action.attackerUid, 'RETREATING', 'NORMAL_ATTACK:retreat')
      v.transition(action.attackerUid, 'IDLE', 'NORMAL_ATTACK:retreat_done')
      break
    }

    case 'SKILL_CAST': {
      // 判斷是否有傷害目標
      const hasDamageTargets = action.targets.some(t => 'damage' in t.result)
      // 1. 前進（僅當有傷害目標）
      if (hasDamageTargets) {
        v.transition(action.attackerUid, 'ADVANCING', 'SKILL_CAST:advance')
      }
      // 2. 攻擊動作
      v.transition(action.attackerUid, 'ATTACKING', 'SKILL_CAST:attack')
      // 3. 所有目標受擊
      for (const t of action.targets) {
        if ('damage' in t.result && !t.result.isDodge) {
          if (t.killed) {
            v.transition(t.uid, 'DEAD', 'SKILL_CAST:target_killed')
          } else {
            v.transition(t.uid, 'HURT', 'SKILL_CAST:target_hurt')
            v.transition(t.uid, 'IDLE', 'SKILL_CAST:target_recover')
          }
        }
      }
      // 4. 攻擊者後退
      if (hasDamageTargets) {
        v.transition(action.attackerUid, 'RETREATING', 'SKILL_CAST:retreat')
      }
      v.transition(action.attackerUid, 'IDLE', 'SKILL_CAST:retreat_done')
      break
    }

    case 'DEATH': {
      v.transition(action.targetUid, 'HURT', 'DEATH:hurt')
      v.transition(action.targetUid, 'DEAD', 'DEATH:dead')
      break
    }

    // 其他 action 不涉及 ActorState 轉換
    default:
      break
  }
}
