# 音效與音樂系統 Spec

> 版本：v0.1 ｜ 狀態：⬜ 未實作（規劃中）
> 最後更新：2026-03-01
> 負責角色：🎵 SOUND_MUSIC → 🔧 CODING

## 概述

遊戲音效與背景音樂系統。目前專案尚未整合任何音訊資源，本 spec 為未來實作規劃。

## 依賴

- `specs/ui-flow.md` — 畫面切換觸發 BGM 切換
- `specs/core-combat.md` — 戰鬥事件觸發 SFX

---

## 一、BGM（背景音樂）規劃

| 場景 | 曲風 | 觸發時機 |
|------|------|----------|
| 登入畫面 | 陰暗環境音 | `showGame = false` |
| 主選單大廳 | 低沉節奏 + 環境音效 | `gameState = 'MAIN_MENU'` |
| 關卡選擇 | 緊張預備感 | `menuScreen = 'stages'` |
| 戰鬥中 | 高強度戰鬥曲 | `gameState = 'BATTLE'` |
| 勝利結果 | 勝利凱旋 | `gameState = 'GAMEOVER'` + 勝利 |
| 失敗結果 | 低沉哀傷 | `gameState = 'GAMEOVER'` + 失敗 |
| 抽卡畫面 | 神秘感 + 期待感 | `menuScreen = 'gacha'` |

## 二、SFX（音效）規劃

| 事件 | 音效 | 說明 |
|------|------|------|
| 按鈕點擊 | click.mp3 | 所有 UI 按鈕 |
| 攻擊命中 | hit_normal.mp3 | 普通攻擊 |
| 暴擊命中 | hit_critical.mp3 | 暴擊攻擊 |
| 技能施放 | skill_cast.mp3 | 主動技能 |
| 角色死亡 | death.mp3 | HP 歸零 |
| 抽卡 | gacha_pull.mp3 | 抽卡動畫 |
| SSR 出現 | gacha_ssr.mp3 | 高稀有度結果 |
| 領取獎勵 | reward_claim.mp3 | 信件/關卡獎勵 |
| 升級 | level_up.mp3 | 英雄升級成功 |

## 三、技術方案

| 項目 | 方案 |
|------|------|
| 格式 | MP3（BGM）/ WAV（SFX，低延遲） |
| API | Web Audio API（`AudioContext`） |
| 音量控制 | SettingsPanel 提供 BGM / SFX 獨立音量滑桿 |
| 靜音 | 全域靜音開關 |
| 淡入淡出 | BGM 切換時 crossfade 1s |
| 預載 | 戰鬥 SFX 在 FETCHING 階段預載 |
| 儲存 | 音量設定存 localStorage（不上傳 GAS） |

## 四、資源目錄（規劃）

```
public/
  audio/
    bgm/
      login.mp3
      lobby.mp3
      battle.mp3
      victory.mp3
      defeat.mp3
    sfx/
      click.wav
      hit_normal.wav
      hit_critical.wav
      skill_cast.wav
      death.wav
      gacha_pull.wav
      gacha_ssr.wav
      reward_claim.wav
      level_up.wav
```

---

## 擴展點

- [ ] 每個英雄專屬攻擊/技能音效
- [ ] 環境音效（雨聲、風聲、喪屍低吼）
- [ ] 動態音樂（根據戰鬥激烈度調整 BGM 層次）
- [ ] 語音系統（角色台詞）

---

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v0.1 | 2026-03-01 | 初版規劃：BGM/SFX 清單、技術方案、資源目錄結構 |
