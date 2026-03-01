# 音效與音樂系統 Spec

> 版本：v0.4 ｜ 狀態：🟢 已實作
> 最後更新：2026-03-02
> 負責角色：🎵 SOUND_MUSIC → 🔧 CODING

## 概述

使用 **Web Audio API 合成音效**（無需任何外部音檔），全部 BGM 與 SFX 透過振盪器 + 濾波器即時生成。
由 `audioService.ts` 中的 `AudioManager` 單例管理，自動根據 gameState / menuScreen 切換 BGM。

## 依賴

- `specs/ui-flow.md` — 畫面切換觸發 BGM 切換
- `specs/core-combat.md` — 戰鬥事件觸發 SFX

## 實作對照

| 原始碼 | 說明 |
|--------|------|
| `src/services/audioService.ts` | AudioManager 單例 — BGM 合成 + SFX 合成 + 音量控制 + localStorage 存設定（426 行） |
| `src/components/SettingsPanel.tsx` | UI — 主音量 / BGM / SFX 三條滑桿 + 靜音開關 |
| `src/App.tsx` | BGM 自動切換（useEffect 監聽 gameState / menuScreen / battleResult） |

---

## 一、BGM（背景音樂）

所有 BGM 使用 Web Audio API 振盪器（OscillatorNode）+ 濾波器（BiquadFilterNode）合成，無需載入外部檔案。

| BgmTrack | 場景 | 觸發時機 | 合成風格 |
|----------|------|----------|---------|
| `login` | 登入畫面 | `showGame = false` | 陰暗環境音 |
| `lobby` | 主選單大廳 | `gameState = 'MAIN_MENU'` | 低沉節奏 + 環境音效 |
| `battle` | 戰鬥中 | `gameState = 'BATTLE'` | 高強度戰鬥曲 |
| `victory` | 勝利結果 | `gameState = 'GAMEOVER'` + 勝利 | 勝利凱旋 |
| `defeat` | 失敗結果 | `gameState = 'GAMEOVER'` + 失敗 | 低沉哀傷 |
| `gacha` | 抽卡畫面 | `menuScreen = 'gacha'` | 神秘感 + 期待感 |
| `none` | 無音樂 | 手動停止 | — |

### BGM 自動切換邏輯（App.tsx useEffect）

```typescript
// showGame=false → login
// GAMEOVER + victory → victory
// GAMEOVER + defeat → defeat
// BATTLE → battle
// MAIN_MENU + gacha → gacha
// MAIN_MENU + 其他 → lobby
// IDLE → lobby
// PRE_BATTLE / FETCHING → 不觸發任何 BGM 變更（維持當前曲目）
```

> **註意**：`IDLE` 狀態會明確切換到 `lobby`，但 `PRE_BATTLE` 和 `FETCHING` 狀態不在 useEffect 的條件分支中，因此不會觸發 BGM 變更。只有當 `showGame=false` 時才會切到 `login`。

## 二、SFX（音效）

所有 SFX 使用短振盪器脈衝合成，無延遲。

| SfxType | 事件 | 觸發位置 |
|---------|------|---------|
| `click` | UI 按鈕點擊 | 所有按鈕 |
| `hit_normal` | 普通攻擊命中（3 層合成：sawtooth 65Hz + square 120Hz + sawtooth 320Hz，模擬腐肉撞擊） | App.tsx onAction（ATTACK） |
| `hit_critical` | 暴擊命中（4 層合成：深沉濕裂聲 + 地面震動，比 hit_normal 更厚重） | App.tsx onAction（isCrit） |
| `skill_cast` | 技能施放 | App.tsx onAction（ACTIVE_SKILL） |
| `death` | 角色死亡（4 層合成：sawtooth 45Hz + square 90Hz + sawtooth 70Hz + sine 30Hz，模擬殭屍倒地） | App.tsx onAction（HP ≤ 0） |
| `gacha_pull` | 抽卡動畫 | GachaScreen |
| `gacha_ssr` | SSR 出現 | GachaScreen |
| `reward_claim` | 領取獎勵 | MailboxPanel / 結算 |
| `level_up` | 升級成功 | HeroListPanel |

## 三、技術方案

| 項目 | 實作 |
|------|------|
| 格式 | **無外部音檔** — 全部 Web Audio API 合成 |
| API | `AudioContext` + `OscillatorNode` + `GainNode` + `BiquadFilterNode` |
| 架構 | `AudioManager` 單例（`src/services/audioService.ts`） |
| 音量控制 | 3 條獨立滑桿：主音量 / BGM / SFX（0~100%） |
| 靜音 | 全域靜音開關（`muted: boolean`） |
| BGM 切換 | `playBgm(track)` — 停止舊的振盪器 → 建立新振盪器組 |
| SFX 播放 | `playSfx(type)` — 建立短暫振盪器 → 自動 GC |
| 使用者互動 | `ensureContext()` — 首次互動時建立 AudioContext（瀏覽器原則） |
| 儲存 | `localStorage('globalganlan_audio_settings')` — 不上傳 GAS |

### AudioSettings 型別

```typescript
interface AudioSettings {
  masterVolume: number   // 0~1
  bgmVolume: number      // 0~1
  sfxVolume: number      // 0~1
  muted: boolean
}
```

### AudioManager 主要 API

| 方法 | 說明 |
|------|------|
| `ensureContext()` | 建立/恢復 AudioContext（需使用者互動） |
| `playBgm(track: BgmTrack)` | 切換 BGM 曲目 |
| `playSfx(type: SfxType)` | 播放一次性 SFX |
| `setMasterVolume(v)` | 設定主音量 0~1 |
| `setBgmVolume(v)` | 設定 BGM 音量 0~1 |
| `setSfxVolume(v)` | 設定 SFX 音量 0~1 |
| `toggleMute()` | 切換靜音 |
| `getSettings()` | 回傳當前 AudioSettings |
| `subscribe(fn: () => void)` | 訂閱設定變化 |

---

## 四、SettingsPanel 音效控制 UI

| 控件 | 說明 |
|------|------|
| 🎚️ 主音量滑桿 | 0~100%，即時調整 |
| 🎵 BGM 滑桿 | 0~100%，即時調整 |
| 🔊 SFX 滑桿 | 0~100%，即時調整 |
| 🔇 靜音按鈕 | 一鍵靜音/取消靜音 |

---

## 擴展點

- [ ] 每個英雄專屬攻擊/技能音效
- [ ] 環境音效（雨聲、風聲、喪屍低吼）
- [ ] 動態音樂（根據戰鬥激烈度調整 BGM 層次）
- [ ] 語音系統（角色台詞）
- [ ] 外部音檔支援（MP3/WAV 替換合成音效）

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-03-01 | 初版規劃：BGM/SFX 清單、技術方案、資源目錄結構 |
| v0.2 | 2026-02-28 | ✅ 全面實作：Web Audio API 合成 BGM（6 曲目）+ SFX（9 種）、AudioManager 單例、SettingsPanel 三條音量滑桿 + 靜音開關、localStorage 持久化、App.tsx BGM 自動切換、ensureContext 使用者互動處理、移除外部音檔依賴 |
| v0.3 | 2026-03-01 | 同步實際程式碼：`onSettingsChange` → `subscribe`、釘清 BGM 自動切換邏輯（IDLE → lobby、PRE_BATTLE/FETCHING 不觸發變更） |
| v0.4 | 2026-03-02 | **SFX 殭屍主題重設計**：`hit_normal` 改為 3 層合成（sawtooth 65Hz + square 120Hz + sawtooth 320Hz + low-pass 濾波），模擬腐肉撞擊；`hit_critical` 改為 4 層合成（深沉濕裂 + 地面震動）；`death` 改為 4 層合成（sawtooth 45Hz + square 90Hz + sawtooth 70Hz + sine 30Hz），模擬殭屍倒地 |
