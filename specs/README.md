# 遊戲規格總索引 — Game Spec Registry

> **本檔案是遊戲所有系統規格的單一入口。每次新對話必須讀取此檔案以取得最新規格狀態。**
> 
> 最後更新：2026-02-26

## 規格架構原則

1. **模組化** — 每個遊戲系統一個獨立 spec 檔，互不耦合
2. **版本化** — 每個 spec 有版本號，每次修改必須 bump version + 記錄到 `memory/changelog.md`
3. **介面契約** — spec 之間透過明確定義的「依賴」與「輸出」欄位銜接
4. **向下相容** — 新 spec 或修改不可破壞既有系統，除非經過衝突審查流程

## Spec 清單

| 檔案 | 系統 | 版本 | 狀態 |
|------|------|------|------|
| `specs/core-combat.md` | 回合制戰鬥系統（含能量/Buff/被動觸發） | v2.0 | 🟡 草案 |
| `specs/hero-schema.md` | 英雄資料結構（含 DEF/Crit/星級） | v2.0 | 🟡 草案 |
| `specs/damage-formula.md` | 傷害公式（DEF 減傷/暴擊/DOT/護盾） | v0.1 | 🟡 草案 |
| `specs/skill-system.md` | 技能系統（能量大招 + 4 被動/星級解鎖） | v0.2 | 🟡 草案 |
| `specs/progression.md` | 養成系統（等級/突破/星級/裝備/套裝） | v0.2 | 🟡 草案 |
| `specs/tech-architecture.md` | 技術架構 | v1.0 | 🟢 定稿 |
| `specs/auth-system.md` | 帳號系統（訪客 + 綁定帳密） | v0.1 | 🟡 草案 |
| `specs/save-system.md` | 存檔系統（Google Sheets 存進度） | v0.1 | 🟡 草案 |
| `specs/stage-system.md` | 關卡系統（章節/爬塔/副本/PvP/Boss） | v0.1 | 🟡 草案 |
| `specs/gacha.md` | 抽卡系統 | v0.1 | 🟡 草案 |
| `specs/element-system.md` | 屬性剋制系統 | v0.1 | 🟡 草案 |
| `specs/ui-flow.md` | UI 流程與畫面定義 | — | ⚪ 待建立 |
| `specs/audio.md` | 音頻規格 | — | ⚪ 待建立 |
| `specs/narrative.md` | 世界觀與劇情架構 | — | ⚪ 待建立 |

> 狀態：🟢 定稿 ｜ 🟡 草案 ｜ 🔴 衝突待解 ｜ ⚪ 待建立

## Spec 檔案格式規範

每個 spec 檔案必須包含以下結構：

```markdown
# [系統名稱] Spec

> 版本：vX.Y ｜ 狀態：🟡 草案
> 最後更新：YYYY-MM-DD
> 負責角色：🎯 GAME_DESIGN / 🔧 CODING / ...

## 概述
（一段話說明這個系統是什麼、為什麼需要它）

## 依賴
（列出此 spec 依賴哪些其他 spec）

## 介面契約
（此 spec 對外暴露的資料結構、API、事件）

## 詳細規格
（正文）

## 擴展點
（預留的擴展介面，未來新功能可以從哪裡接入）

## 變更歷史
| 版本 | 日期 | 變更內容 |
|------|------|---------|
```

## 新增 / 修改 Spec 的流程

```
使用者提出新點子
       ↓
🎯 GAME_DESIGN 分析：
  1. 這是新 spec 還是修改既有 spec？
  2. 影響哪些現有 spec？（依賴掃描）
  3. 有無衝突？
       ↓
  ┌─ 無衝突 → 直接寫入/更新 spec → 更新本索引 → 記錄 changelog
  │
  └─ 有衝突 → 輸出衝突報告 → 提出解決方案（≥2 個選項）
              → 使用者選擇 或 AI 建議最佳方案
              → 修正所有受影響的 spec → 記錄 changelog + decision
```
