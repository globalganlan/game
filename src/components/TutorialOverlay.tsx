/**
 * TutorialOverlay — 新手引導覆蓋層
 *
 * 在關鍵節點顯示教學提示，引導新玩家了解遊戲流程。
 * 進度存於 localStorage，完成後不再顯示。
 *
 * 步驟：
 *  0: 歡迎 → 認識主畫面
 *  1: 點擊「關卡」開始冒險
 *  2: 第一場戰鬥結束 → 恭喜通關
 *  3: 解鎖英雄/背包/召喚 → 探索功能
 *  4: 引導簽到
 *  5: 完成
 */

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'globalganlan_tutorial_step'
const TOTAL_STEPS = 5

interface Step {
  title: string
  body: string
  /** 按鈕文字 */
  btn: string
}

const STEPS: Step[] = [
  {
    title: '🎮 歡迎來到全球感染！',
    body: '你是末日中倖存的指揮官，帶領殭屍小隊在廢墟中戰鬥求生。\n\n這裡是你的指揮中心 — 主選單。',
    btn: '了解！',
  },
  {
    title: '🗺️ 開始第一場戰鬥',
    body: '點擊「關卡」進入冒險，選擇關卡 1-1，然後上陣你的英雄開始戰鬥！\n\n（你已經有 3 位初始英雄自動上陣了）',
    btn: '知道了！',
  },
  {
    title: '🎉 恭喜通關第一關！',
    body: '太棒了！通關後會獲得金幣、經驗和各種獎勵。\n\n現在更多功能已經解鎖了：英雄養成、背包、召喚…',
    btn: '繼續探索！',
  },
  {
    title: '📖 探索更多功能',
    body: '🧟 英雄 — 升級、突破、升星你的隊員\n🎒 背包 — 管理道具與裝備\n🎰 召喚 — 招募新英雄與裝備\n📅 簽到 — 每天登入領獎勵\n⚔️ 競技場 — 與其他玩家對戰',
    btn: '太讚了！',
  },
  {
    title: '✅ 新手引導完成！',
    body: '你已經掌握基本操作了！\n\n記得每天回來簽到、領取離線獎勵，持續強化你的隊伍！\n\n祝你在末日中存活下去 💪',
    btn: '開始冒險！',
  },
]

/* ═══════════════════════════════════
   Hook
   ═══════════════════════════════════ */

export function useTutorial() {
  const [step, setStep] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return 0 // 新玩家
    const n = Number(stored)
    return n >= TOTAL_STEPS ? TOTAL_STEPS : n
  })

  const advance = useCallback(() => {
    setStep(prev => {
      const next = prev + 1
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  /** 直接跳到指定步驟（外部事件觸發用），但只往前不往後 */
  const advanceTo = useCallback((target: number) => {
    setStep(prev => {
      if (target <= prev) return prev
      localStorage.setItem(STORAGE_KEY, String(target))
      return target
    })
  }, [])

  const completed = step >= TOTAL_STEPS

  return { step, advance, advanceTo, completed }
}

/* ═══════════════════════════════════
   Component
   ═══════════════════════════════════ */

interface TutorialOverlayProps {
  step: number
  onNext: () => void
}

export function TutorialOverlay({ step, onNext }: TutorialOverlayProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 短暫延遲後淡入，避免與頁面切換動畫衝突
    const t = setTimeout(() => setVisible(true), 300)
    return () => clearTimeout(t)
  }, [step])

  if (step >= TOTAL_STEPS) return null

  const s = STEPS[step]
  if (!s) return null

  return (
    <div
      className={`tutorial-overlay ${visible ? 'tutorial-visible' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tutorial-card">
        <div className="tutorial-step-indicator">
          {STEPS.map((_, i) => (
            <span key={i} className={`tutorial-dot ${i === step ? 'tutorial-dot-active' : ''} ${i < step ? 'tutorial-dot-done' : ''}`} />
          ))}
        </div>
        <h3 className="tutorial-title">{s.title}</h3>
        <p className="tutorial-body">{s.body}</p>
        <button className="tutorial-btn" onClick={() => { setVisible(false); setTimeout(onNext, 200) }}>
          {s.btn}
        </button>
        {step < TOTAL_STEPS - 1 && (
          <button className="tutorial-skip" onClick={() => {
            // 跳過全部
            localStorage.setItem(STORAGE_KEY, String(TOTAL_STEPS))
            setVisible(false)
            setTimeout(onNext, 0)
          }}>
            跳過教學
          </button>
        )}
      </div>
    </div>
  )
}
