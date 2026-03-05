/**
 * audioService — 音效與背景音樂管理器
 *
 * 使用 Web Audio API 合成音效（無需外部音檔）。
 * BGM 使用簡易振盪器 + 濾波器模擬環境氛圍。
 * SFX 使用短聲調合成點擊、攻擊、暴擊等音效。
 *
 * 對應 Spec: .ai/specs/audio.md v0.2
 */

/* ════════════════════════════════════
   型別
   ════════════════════════════════════ */

export type BgmTrack = 'login' | 'lobby' | 'battle' | 'victory' | 'defeat' | 'gacha' | 'none'
export type SfxType =
  | 'click'
  | 'hit_normal'
  | 'hit_critical'
  | 'skill_cast'
  | 'death'
  | 'gacha_pull'
  | 'gacha_ssr'
  | 'reward_claim'
  | 'level_up'

interface AudioSettings {
  masterVolume: number   // 0~1
  bgmVolume: number      // 0~1
  sfxVolume: number      // 0~1
  muted: boolean
}

/* ════════════════════════════════════
   Storage
   ════════════════════════════════════ */

const STORAGE_KEY = 'globalganlan_audio_settings'

function loadSettings(): AudioSettings {
  try {
    const json = localStorage.getItem(STORAGE_KEY)
    if (json) return { ...DEFAULT_SETTINGS, ...JSON.parse(json) }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: AudioSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 0.5,
  bgmVolume: 0.4,
  sfxVolume: 0.6,
  muted: false,
}

/* ════════════════════════════════════
   AudioManager（Singleton）
   ════════════════════════════════════ */

class AudioManager {
  private ctx: AudioContext | null = null
  private settings: AudioSettings
  private currentBgm: BgmTrack = 'none'
  private bgmNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null
  private listeners: Array<() => void> = []
  /** 追蹤所有活躍中的 SFX gain node（用於 stopAllSfx） */
  private activeSfxGains: GainNode[] = []

  /** 是否已透過使用者手勢偵測器綁定過 */
  private gestureListenerBound = false

  constructor() {
    this.settings = loadSettings()
    this.bindGestureListener()
  }

  /**
   * 綁定全域使用者手勢偵測 — 任何 click / touchstart / keydown
   * 都會自動啟動 AudioContext，確保 BGM 能播放。
   */
  private bindGestureListener() {
    if (this.gestureListenerBound) return
    if (typeof window === 'undefined') return
    this.gestureListenerBound = true
    const handler = () => {
      this.ensureContext()
      // ctx 建立成功後移除監聽（只需一次）
      if (this.ctx && this.ctx.state === 'running') {
        window.removeEventListener('click', handler, true)
        window.removeEventListener('touchstart', handler, true)
        window.removeEventListener('keydown', handler, true)
      }
    }
    window.addEventListener('click', handler, true)
    window.addEventListener('touchstart', handler, true)
    window.addEventListener('keydown', handler, true)
  }

  /* ── 初始化（需要用戶互動後調用） ── */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    // 若有暫存 BGM（使用者手勢前已請求），現在才真正播放
    if (this.currentBgm !== 'none' && !this.bgmNodes) {
      const pending = this.currentBgm
      this.currentBgm = 'none' // 重置以避免 playBgm 的 early return
      this.playBgm(pending)
    }
    return this.ctx
  }

  /* ── Getters ── */
  getSettings(): AudioSettings { return { ...this.settings } }
  getCurrentBgm(): BgmTrack { return this.currentBgm }

  /* ── Settings ── */
  setMasterVolume(v: number) {
    this.settings.masterVolume = Math.max(0, Math.min(1, v))
    this.applyBgmVolume()
    this.persist()
  }

  setBgmVolume(v: number) {
    this.settings.bgmVolume = Math.max(0, Math.min(1, v))
    this.applyBgmVolume()
    this.persist()
  }

  setSfxVolume(v: number) {
    this.settings.sfxVolume = Math.max(0, Math.min(1, v))
    this.persist()
  }

  setMuted(muted: boolean) {
    this.settings.muted = muted
    this.applyBgmVolume()
    this.persist()
  }

  toggleMute() {
    this.setMuted(!this.settings.muted)
  }

  subscribe(fn: () => void) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(f => f !== fn) }
  }

  private persist() {
    saveSettings(this.settings)
    this.listeners.forEach(fn => fn())
  }

  private getEffectiveBgmVolume(): number {
    if (this.settings.muted) return 0
    return this.settings.masterVolume * this.settings.bgmVolume
  }

  private getEffectiveSfxVolume(): number {
    if (this.settings.muted) return 0
    return this.settings.masterVolume * this.settings.sfxVolume
  }

  private applyBgmVolume() {
    if (!this.bgmNodes) return
    const vol = this.getEffectiveBgmVolume()
    this.bgmNodes.gain.gain.setTargetAtTime(vol * 0.15, this.ctx!.currentTime, 0.3)
  }

  /* ════════════════════════════════════
     BGM — 合成環境音
     ════════════════════════════════════ */

  playBgm(track: BgmTrack) {
    if (track === this.currentBgm) return
    this.stopBgm()
    if (track === 'none') return

    // AudioContext 尚未由使用者手勢建立 → 暫存曲目，等 ensureContext() 再播
    if (!this.ctx) {
      this.currentBgm = track
      return
    }

    // ctx 是 suspended 狀態（手勢前就建立過）→ 只暫存，不嘗試 resume（避免瀏覽器警告）
    if (this.ctx.state === 'suspended') {
      this.currentBgm = track
      return
    }

    const ctx = this.ctx
    const masterGain = ctx.createGain()
    masterGain.gain.value = 0
    masterGain.connect(ctx.destination)

    const oscs: OscillatorNode[] = []
    const config = BGM_CONFIGS[track]

    for (const tone of config.tones) {
      const osc = ctx.createOscillator()
      osc.type = tone.type
      osc.frequency.value = tone.freq

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = tone.filterFreq ?? 800
      filter.Q.value = tone.filterQ ?? 1

      const toneGain = ctx.createGain()
      toneGain.gain.value = tone.gain

      // LFO for subtle movement
      if (tone.lfoRate) {
        const lfo = ctx.createOscillator()
        lfo.frequency.value = tone.lfoRate
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = tone.lfoDepth ?? 5
        lfo.connect(lfoGain)
        lfoGain.connect(osc.frequency)
        lfo.start()
        oscs.push(lfo)
      }

      osc.connect(filter)
      filter.connect(toneGain)
      toneGain.connect(masterGain)
      osc.start()
      oscs.push(osc)
    }

    // Fade in
    const vol = this.getEffectiveBgmVolume()
    masterGain.gain.setTargetAtTime(vol * 0.15, ctx.currentTime, 1.0)

    this.bgmNodes = { osc: oscs, gain: masterGain }
    this.currentBgm = track
  }

  stopBgm() {
    if (!this.bgmNodes || !this.ctx) {
      this.currentBgm = 'none'
      return
    }
    // Fade out
    this.bgmNodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5)
    const nodes = this.bgmNodes
    setTimeout(() => {
      try {
        nodes.osc.forEach(o => o.stop())
        nodes.gain.disconnect()
      } catch { /* already stopped */ }
    }, 2000)
    this.bgmNodes = null
    this.currentBgm = 'none'
  }

  /* ════════════════════════════════════
     SFX — 合成短音效
     ════════════════════════════════════ */

  playSfx(type: SfxType) {
    // SFX 不主動建立 AudioContext（避免非手勢呼叫產生大量瀏覽器警告）
    if (!this.ctx || this.ctx.state === 'suspended') return
    const ctx = this.ctx
    const vol = this.getEffectiveSfxVolume()
    if (vol <= 0) return

    const config = SFX_CONFIGS[type]
    if (!config) return

    const masterGain = ctx.createGain()
    masterGain.gain.value = vol * config.volume
    masterGain.connect(ctx.destination)

    for (const note of config.notes) {
      const osc = ctx.createOscillator()
      osc.type = note.type ?? 'sine'
      osc.frequency.value = note.freq

      const env = ctx.createGain()
      env.gain.value = 0
      const t = ctx.currentTime + (note.delay ?? 0)
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(note.gain ?? 1, t + (note.attack ?? 0.005))
      env.gain.linearRampToValueAtTime(0, t + (note.attack ?? 0.005) + (note.decay ?? 0.1))

      if (note.filterFreq) {
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = note.filterFreq
        osc.connect(filter)
        filter.connect(env)
      } else {
        osc.connect(env)
      }
      env.connect(masterGain)
      osc.start(t)
      osc.stop(t + (note.attack ?? 0.005) + (note.decay ?? 0.1) + 0.05)
    }

    // Cleanup
    setTimeout(() => {
      try { masterGain.disconnect() } catch { /* ok */ }
      const idx = this.activeSfxGains.indexOf(masterGain)
      if (idx >= 0) this.activeSfxGains.splice(idx, 1)
    }, 2000)
  }

  /** 立即停止所有正在播放的音效（跳過戰鬥時呼叫） */
  stopAllSfx() {
    for (const g of this.activeSfxGains) {
      try { g.gain.setValueAtTime(0, g.context.currentTime); g.disconnect() } catch { /* ok */ }
    }
    this.activeSfxGains = []
  }
}

/* ════════════════════════════════════
   BGM Config — 合成器參數
   ════════════════════════════════════ */

interface BgmTone {
  type: OscillatorType
  freq: number
  gain: number
  filterFreq?: number
  filterQ?: number
  lfoRate?: number
  lfoDepth?: number
}

interface BgmConfig {
  tones: BgmTone[]
}

const BGM_CONFIGS: Record<BgmTrack, BgmConfig> = {
  none: { tones: [] },
  login: {
    tones: [
      { type: 'sine', freq: 65, gain: 0.6, filterFreq: 200, lfoRate: 0.05, lfoDepth: 2 },
      { type: 'sine', freq: 98, gain: 0.3, filterFreq: 300, lfoRate: 0.08, lfoDepth: 3 },
      { type: 'triangle', freq: 130, gain: 0.15, filterFreq: 400, lfoRate: 0.03, lfoDepth: 4 },
    ],
  },
  lobby: {
    tones: [
      { type: 'sine', freq: 82, gain: 0.5, filterFreq: 250, lfoRate: 0.1, lfoDepth: 3 },
      { type: 'triangle', freq: 123, gain: 0.25, filterFreq: 350, lfoRate: 0.06, lfoDepth: 5 },
      { type: 'sine', freq: 165, gain: 0.12, filterFreq: 500, lfoRate: 0.15, lfoDepth: 2 },
    ],
  },
  battle: {
    tones: [
      { type: 'sawtooth', freq: 55, gain: 0.35, filterFreq: 400, filterQ: 3, lfoRate: 0.2, lfoDepth: 8 },
      { type: 'square', freq: 110, gain: 0.15, filterFreq: 600, filterQ: 2, lfoRate: 0.35, lfoDepth: 10 },
      { type: 'sine', freq: 82, gain: 0.4, filterFreq: 300, lfoRate: 0.12, lfoDepth: 4 },
    ],
  },
  victory: {
    tones: [
      { type: 'sine', freq: 196, gain: 0.4, filterFreq: 800, lfoRate: 0.08, lfoDepth: 3 },
      { type: 'triangle', freq: 294, gain: 0.25, filterFreq: 1000, lfoRate: 0.05, lfoDepth: 2 },
      { type: 'sine', freq: 392, gain: 0.15, filterFreq: 1200, lfoRate: 0.1, lfoDepth: 4 },
    ],
  },
  defeat: {
    tones: [
      { type: 'sine', freq: 55, gain: 0.5, filterFreq: 150, lfoRate: 0.03, lfoDepth: 2 },
      { type: 'triangle', freq: 73, gain: 0.3, filterFreq: 200, lfoRate: 0.05, lfoDepth: 3 },
    ],
  },
  gacha: {
    tones: [
      { type: 'sine', freq: 110, gain: 0.4, filterFreq: 600, lfoRate: 0.2, lfoDepth: 8 },
      { type: 'triangle', freq: 165, gain: 0.25, filterFreq: 800, lfoRate: 0.15, lfoDepth: 5 },
      { type: 'sine', freq: 220, gain: 0.12, filterFreq: 1000, lfoRate: 0.3, lfoDepth: 3 },
    ],
  },
}

/* ════════════════════════════════════
   SFX Config — 合成短音效參數
   ════════════════════════════════════ */

interface SfxNote {
  type?: OscillatorType
  freq: number
  gain?: number
  attack?: number
  decay?: number
  delay?: number
  filterFreq?: number
}

interface SfxConfig {
  volume: number
  notes: SfxNote[]
}

const SFX_CONFIGS: Record<SfxType, SfxConfig> = {
  click: {
    volume: 0.6,
    notes: [
      { type: 'sine', freq: 800, gain: 1, attack: 0.002, decay: 0.06 },
      { type: 'sine', freq: 1200, gain: 0.5, attack: 0.002, decay: 0.04 },
    ],
  },
  hit_normal: {
    volume: 0.7,
    notes: [
      // 低頻衝擊 — 拳頭打進腐肉的悶響
      { type: 'sawtooth', freq: 65, gain: 1, attack: 0.001, decay: 0.18, filterFreq: 350 },
      // 中頻濕黏音 — 水分被擠壓的「噗啾」感
      { type: 'square', freq: 120, gain: 0.5, attack: 0.002, decay: 0.12, filterFreq: 500 },
      // 高頻碎裂微響 — 骨肉分離的細節
      { type: 'sawtooth', freq: 320, gain: 0.2, attack: 0.001, decay: 0.06, filterFreq: 600, delay: 0.01 },
    ],
  },
  hit_critical: {
    volume: 0.9,
    notes: [
      // 重擊悶響 — 更深更大力的肉體衝擊
      { type: 'sawtooth', freq: 50, gain: 1, attack: 0.001, decay: 0.25, filterFreq: 400 },
      // 濕裂聲 — 爆漿般的撕裂
      { type: 'square', freq: 95, gain: 0.7, attack: 0.001, decay: 0.15, filterFreq: 550 },
      // 肉碎飛濺 — 高頻碎屑尾音
      { type: 'sawtooth', freq: 250, gain: 0.35, attack: 0.003, decay: 0.1, filterFreq: 800, delay: 0.02 },
      // 迴盪低鳴 — 暴擊特有的震動感
      { type: 'sine', freq: 40, gain: 0.4, attack: 0.01, decay: 0.3, delay: 0.05 },
    ],
  },
  skill_cast: {
    volume: 0.9,
    notes: [
      // ── KOF98 風格絕招音效 ──
      // 1) 超閃光「ピキーン」— 金屬高音開場，格鬥天王 Super Flash 的標誌聲
      { type: 'square', freq: 1400, gain: 0.9, attack: 0.001, decay: 0.12, filterFreq: 2000 },
      // 2) 第二層閃光泛音 — 強化金屬質感厚度
      { type: 'square', freq: 880, gain: 0.55, attack: 0.002, decay: 0.15, filterFreq: 1500 },
      // 3) 斬擊氣勁波 — 中頻鋸齒波模擬能量噴發
      { type: 'sawtooth', freq: 350, gain: 0.7, attack: 0.005, decay: 0.2, filterFreq: 800, delay: 0.03 },
      // 4) 低頻衝擊 — 絕招釋放的重量感與壓迫力
      { type: 'sine', freq: 70, gain: 0.8, attack: 0.01, decay: 0.3, delay: 0.02 },
      // 5) 電弧殘響 — 能量放出後的嘶嘶餘韻
      { type: 'sawtooth', freq: 600, gain: 0.3, attack: 0.01, decay: 0.25, filterFreq: 1000, delay: 0.08 },
      // 6) 尾音迴盪 — 遠方雷鳴般的絕招收尾
      { type: 'sine', freq: 150, gain: 0.4, attack: 0.02, decay: 0.35, delay: 0.15 },
    ],
  },
  death: {
    volume: 0.75,
    notes: [
      // 身體倒地的沉重撞擊
      { type: 'sawtooth', freq: 45, gain: 1, attack: 0.001, decay: 0.35, filterFreq: 250 },
      // 骨架散落的碎裂聲
      { type: 'square', freq: 90, gain: 0.5, attack: 0.003, decay: 0.2, filterFreq: 400, delay: 0.04 },
      // 喉間最後的低吼氣息
      { type: 'sawtooth', freq: 70, gain: 0.6, attack: 0.02, decay: 0.5, filterFreq: 200, delay: 0.08 },
      // 地面震動迴盪 — 屍體重物落地的餘韻
      { type: 'sine', freq: 30, gain: 0.4, attack: 0.05, decay: 0.6, delay: 0.15 },
    ],
  },
  gacha_pull: {
    volume: 0.7,
    notes: [
      { type: 'sine', freq: 300, gain: 0.6, attack: 0.01, decay: 0.15 },
      { type: 'sine', freq: 450, gain: 0.5, attack: 0.01, decay: 0.15, delay: 0.08 },
      { type: 'sine', freq: 600, gain: 0.4, attack: 0.01, decay: 0.15, delay: 0.16 },
      { type: 'sine', freq: 800, gain: 0.3, attack: 0.01, decay: 0.2, delay: 0.24 },
    ],
  },
  gacha_ssr: {
    volume: 1.0,
    notes: [
      { type: 'sine', freq: 523, gain: 0.8, attack: 0.01, decay: 0.15 },
      { type: 'sine', freq: 659, gain: 0.7, attack: 0.01, decay: 0.15, delay: 0.1 },
      { type: 'sine', freq: 784, gain: 0.6, attack: 0.01, decay: 0.15, delay: 0.2 },
      { type: 'sine', freq: 1047, gain: 0.8, attack: 0.01, decay: 0.3, delay: 0.3 },
    ],
  },
  reward_claim: {
    volume: 0.6,
    notes: [
      { type: 'sine', freq: 500, gain: 0.7, attack: 0.005, decay: 0.12 },
      { type: 'sine', freq: 750, gain: 0.5, attack: 0.005, decay: 0.12, delay: 0.06 },
    ],
  },
  level_up: {
    volume: 0.8,
    notes: [
      { type: 'sine', freq: 400, gain: 0.7, attack: 0.01, decay: 0.15 },
      { type: 'sine', freq: 500, gain: 0.6, attack: 0.01, decay: 0.15, delay: 0.08 },
      { type: 'sine', freq: 600, gain: 0.5, attack: 0.01, decay: 0.15, delay: 0.16 },
      { type: 'sine', freq: 800, gain: 0.7, attack: 0.01, decay: 0.25, delay: 0.24 },
    ],
  },
}

/* ════════════════════════════════════
   Export singleton
   ════════════════════════════════════ */

export const audioManager = new AudioManager()
