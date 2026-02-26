# 變更日誌 — Changelog

> 按時間倒序排列，最新的在最上面。

---

### [2026-02-26] 大批更新：技能/養成/傷害公式/英雄/戰鬥 specs

- **觸發者**：使用者要求 — 完整設計技能系統、裝備系統、傷害公式、能量大招
- **影響範圍**：`specs/skill-system.md`、`specs/progression.md`、`specs/damage-formula.md`、`specs/hero-schema.md`、`specs/core-combat.md`、`specs/README.md`
- **變更內容**：
  - `skill-system.md` v0.1→v0.2 — **重寫**：能量型主動技能（1000 門檻）、4 被動/星級解鎖（★1/★2/★4/★6）、模組化 skill_templates Google Sheet、14 英雄×4 被動完整設計、SkillEffect 介面、StatusType 列舉、Buff/Debuff 圖標規則
  - `progression.md` v0.1→v0.2 — **重寫**：等級 1~60、突破 0~5、星級 ★1~★6（重複抽碎片）、4 裝備欄位（武器/護甲/戒指/鞋子）、8 套裝效果、打造合成、**完整重置返還 100% 素材**
  - `damage-formula.md` v0.1 — **新建**：完整傷害/治療/暴擊/閃避/DOT/護盾/反彈公式、DEF 減傷曲線 `DEF/(100+DEF)`、暴擊系統、飄字顏色
  - `hero-schema.md` v1.0→v2.0 — 新增 DEF/CritRate/CritDmg/Element 欄位、14 隻角色新數值、HeroInstance + FinalStats 介面、星級系統、廢棄舊 Passive/PassiveDesc 欄位
  - `core-combat.md` v1.0→v2.0 — 新增能量系統（1000 門檻、獲取途徑）、Buff/Debuff 系統（3D 圖標顯示）、被動觸發點（10 種時機）、大招演出流程、新增 CASTING 狀態、BattleHero 擴展型別、多種目標策略
  - `specs/README.md` — 更新所有版本號與狀態
- **關鍵決策**：
  - heroes.tsv 舊 Passive/PassiveDesc 欄位**不再參考**，技能改為模組化技能表
  - 裝備重置返還 100% 素材（玩家友善設計）
  - 能量獲取：普攻+200、被攻擊+150、擊殺+100、回合+50
  - DEF 公式：`受到傷害 = 100/(100+DEF)`（收益遞減曲線）
  - CritRate/CritDmg 以裝備和 Buff 為主要培養途徑

---

### [2026-02-26] 新增 auth-system / save-system / stage-system specs

- **觸發者**：使用者要求 — 登入系統 + 存檔 + 關卡設計
- **影響範圍**：`specs/auth-system.md`、`specs/save-system.md`、`specs/stage-system.md`、`specs/README.md`
- **變更內容**：
  - `auth-system.md` v0.1 — 訪客 token + 綁定 email/密碼、Google Sheets players 表、SHA-256 hash、API 端點
  - `save-system.md` v0.1 — save_data / hero_instances / inventory 三表、寫入策略（debounce + 佇列）、體力系統、新手初始存檔
  - `stage-system.md` v0.1 — 5 種模式（主線章節 / 無盡爬塔 / 每日副本 / PvP 競技場 / Boss 戰）、解鎖條件、難度曲線、獎勵公式
  - 更新 specs/README.md 加入 3 個新規格
- **決策**：
  - 後端繼續用 Google Sheets（使用者偏好）
  - 登入方式：訪客 token + 綁定 email/密碼
  - 關卡：5 種模式全都要

---

### [2026-02-26] 新增 tech-architecture spec

- **觸發者**：使用者要求 — 將技術架構填入規格
- **影響範圍**：`specs/tech-architecture.md`、`specs/README.md`
- **變更內容**：
  - 新增 `tech-architecture.md` v1.0 — 完整記錄技術棧（React 19 + Three.js 0.183 + R3F 9 + drei 10 + Vite 5 + TypeScript 5.9）、3D 資產管線、載入器架構、元件樹、RWD 策略、效能策略、場景五要素連動規則、建構部署指令
  - 更新 `specs/README.md` 加入 tech-architecture 條目，core-combat / hero-schema 升為 v1.0 🟢 定稿

---

### [2026-02-26] 從現有程式碼逆向重寫 core-combat + hero-schema specs

- **觸發者**：使用者要求 — 規格必須反映實際程式碼，不可空想
- **影響範圍**：`specs/core-combat.md`、`specs/hero-schema.md`
- **變更內容**：
  - 刪除舊版假想 spec，從 App.tsx / types.ts / Hero.tsx / ZombieModel.tsx / heroes.tsv 逆向分析
  - `core-combat.md` v1.0 — 完整記錄 GameState 狀態機、ActorState 狀態機、6v6 格子座標、速度排序、TARGET_NORMAL 策略、傷害公式（純 ATK）、3D 演出流程、被動技能尚未實作清單
  - `hero-schema.md` v1.0 — 記錄 RawHeroData/SlotHero 介面、14 隻角色數值、模型/動畫資產結構、職業與稀有度分佈

---

### [2026-02-26] 建立 AI 團隊調度系統 + 規格驅動開發架構

- **觸發者**：使用者需求 — 建立可擴展、有記憶的 AI 開發團隊
- **影響範圍**：`agents/`、`specs/`、`memory/`、`.github/copilot-instructions.md`
- **變更內容**：
  - 建立 9 個 AI Agent 提示詞（`agents/01~09-*.md`）
  - 建立自動調度系統（`agents/README.md`）
  - 建立模組化規格系統（`specs/`），含 6 個初版 spec：
    - `core-combat.md` — 回合制戰鬥
    - `hero-schema.md` — 英雄資料結構
    - `skill-system.md` — 技能系統
    - `progression.md` — 養成系統
    - `gacha.md` — 抽卡系統
    - `element-system.md` — 屬性剋制
  - 建立記憶持久化系統（`memory/`）
  - 建立衝突偵測與解決協議
- **相關決策**：ADR-001
