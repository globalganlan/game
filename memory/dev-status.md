# 開發狀態快照 — Dev Status

> 最後更新：2026-02-26（第二次更新）

## 截至 2026-02-26 的開發狀態

### 已完成
- [x] 3D 喪屍對戰場景（React 19 + Vite 5 + R3F 9 + Three.js 0.183 + TypeScript 5.9）
- [x] 14 隻 zombie 模型（GLB + Draco 壓縮 + 5 動畫分離）
- [x] GLB 載入器（全域快取 + Suspense）（`src/loaders/glbLoader.ts`）
- [x] RWD 響應式設計（mobile/tablet/desktop）（`src/hooks/useResponsive.ts`）
- [x] AI 團隊調度系統（11 個 Agent，含 🏗️ TECH_LEAD + 📋 SPEC_MAINTAINER）
- [x] 提示詞模板集（`agents/prompt-playbook.md`，P-01~P-07）
- [x] 模組化規格系統（specs/）
- [x] 記憶持久化系統（memory/）
- [x] **Google Sheets 讀寫能力** — GET 讀取 + POST 寫入（doPost API 已部署）
- [x] **heroes.tsv + Google Sheet 已同步更新** — 新增 DEF / CritRate / CritDmg / Element 欄位

### Spec 狀態

| Spec | 版本 | 狀態 |
|------|------|------|
| core-combat.md | v2.0 | 🟡 新增能量/Buff/被動觸發 |
| hero-schema.md | v2.0 | 🟡 新增 DEF/Crit/星級 |
| damage-formula.md | v0.1 | 🟡 完整傷害公式 |
| skill-system.md | v0.2 | 🟡 能量大招 + 4被動/星級解鎖 |
| progression.md | v0.2 | 🟡 等級/突破/星級/裝備/套裝 |
| tech-architecture.md | v1.0 | 🟢 定稿 |
| auth-system.md | v0.1 | 🟡 草案 |
| save-system.md | v0.1 | 🟡 草案 |
| stage-system.md | v0.1 | 🟡 草案 |
| gacha.md | v0.1 | 🟡 草案 |
| element-system.md | v0.1 | 🟡 草案 |

### 現有戰鬥系統已實作功能
- [x] GameState 5 態狀態機（PRE_BATTLE→FETCHING→IDLE→BATTLE→GAMEOVER）
- [x] 6v6 格子陣型（前排 3 + 後排 3，支援拖曳換位）
- [x] 速度排序回合制（SPD DESC → slot ASC → 玩家優先）
- [x] TARGET_NORMAL 目標策略（前排對位優先）
- [x] 3D 演出（前進→攻擊→受擊/死亡→後退 + 閃光 + 飄字）
- [x] 速度控制（x1 / x2 / x4）
- [x] 過場幕（TransitionOverlay）

### 尚未實作（已有 spec 設計）
- [ ] 傷害公式（DEF 減傷 / 暴擊 / 屬性剋制 / DOT）→ `damage-formula.md`
- [ ] 能量系統 + 大招（1000 門檻）→ `core-combat.md` v2.0
- [ ] 4 被動技能 / 星級解鎖 → `skill-system.md` v0.2
- [ ] Buff/Debuff 系統 + 3D 圖標 → `core-combat.md` v2.0
- [ ] 等級/突破/星級/裝備/套裝 → `progression.md` v0.2
- [ ] 抽卡系統 → `gacha.md`
- [ ] 帳號 + 存檔 → `auth-system.md` + `save-system.md`
- [ ] 關卡系統（5 模式）→ `stage-system.md`

### Google Sheets API

| 用途 | 方法 | 端點 |
|------|------|------|
| 讀取英雄資料 | GET | `AKfycbxXdy3QCv...exec` |
| 寫入/更新資料 | POST | `AKfycbzy3EHTCy...exec` |

POST 格式：`{ action: "updateHeroes", newColumns: [...], data: [{HeroID:N, ...}] }`
回傳：`{ success: true, updated: N }`

### 下一步（建議優先順序）
1. 實作 domain 層傷害公式（純函式，可測試）
2. 實作能量系統 + 大招施放
3. 實作被動技能觸發（10 種時機點）
4. 實作 Buff/Debuff 系統 + 3D 圖標
5. 養成系統（等級 + 裝備 UI）

### 技術債
- `getHeroSpeed()` 多重 fallback 欄位名（Speed/SPD/SPEED/AGI/ATK）— 應在 API 層統一
- 敵方陣型隨機生成較簡陋（隨機 1~6 隻）
- App.tsx 1021 行，需拆分到 domain/service 層（見 `agents/10-tech-lead-agent.md` 的分層架構）
