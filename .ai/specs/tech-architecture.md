# 技術架構 Spec

> 版本：v2.9 ｜ 狀態：🟢 定稿（含 Domain Engine + Services 層 + Optimistic Queue + Audio Engine + CurrencyIcon 統一 icon + PWA + App 模組化拆分 + D1 原子批次寫入 + InfoTip/RedDot/ClickableItemIcon 新元件 + 獎勵一致性修復 + 大廳/戰鬥場景分離架構 + 英雄名稱 HTML Overlay + iOS WebGL 深度紋理修復 + 戰力系統 + 競技場 + 字型預載）
> 最後更新：2026-03-15
> 負責角色：🔧 CODING → 🏗️ ARCHITECT

## 概述

全球感染 (GlobalGanLan) 使用 React + Three.js 技術棧，
以 Vite 為建構工具，在瀏覽器中渲染 3D 回合制對戰場景。
部署目標為靜態站台（base path: `/game/`）。

**v1.1 更新**：新增 `src/domain/` 純邏輯層 + `src/services/` 資料服務層。

---

## 核心技術棧

| 層級 | 技術 | 版本 | 角色 |
|------|------|------|------|
| **UI 框架** | React | ^19.2.0 | 元件化 UI + 狀態管理 |
| **3D 引擎** | Three.js | ^0.183.1 | WebGL 渲染核心 |
| **React ↔ Three 橋接** | @react-three/fiber (R3F) | ^9.5.0 | 宣告式 3D 場景 |
| **3D 輔助庫** | @react-three/drei | ^10.7.7 | 常用元件 |
| **語言** | TypeScript | ^5.9.3 | 靜態型別 |
| **建構工具** | Vite | ^5.4.21 | 開發伺服器 + 打包 |
| **Vite 插件** | @vitejs/plugin-react | ^4.7.0 | JSX 轉換 + Fast Refresh |

---

## 專案結構（v1.1 新增 domain + services）

```
src/
 main.tsx                    應用進入點
 App.tsx                     遊戲主元件（狀態管理 + 戰鬥迴圈 + 3D 演出）
 App.css                     HUD / 按鈕 / RWD media queries
 types.ts                    表現層型別（RawHeroData, SlotHero）
 suppressWarnings.ts         console.warn 攔截

 game/                        遊戲共用常數 & 工具（從 App.tsx 抽取）
    constants.ts             戰鬥時序、格子佈局、API 端點、waitFrames
    helpers.ts               normalizeModelId、clamp01、buildEnemySlotsFromStage

 domain/                      純邏輯層（零 React 依賴）
    index.ts                統一匯出
    types.ts                核心型別（BattleHero, BattleAction, SkillTemplate...）
    battleEngine.ts         戰鬥引擎主迴圈 + BattleHero 工廠
    damageFormula.ts        傷害 / 治療 / DOT / 反彈公式
    buffSystem.ts           Buff/Debuff 施加 / 結算 / 查詢
    energySystem.ts         能量獲取 / 消耗 / 大招判定
    targetStrategy.ts       目標選擇策略
    ~~elementSystem.ts~~    ~~屬性剋制矩陣~~（已移除 2026-03-11）
    gachaSystem.ts          抽卡系統（機率/保底/費用計算）
    equipmentGacha.ts       裝備抽卡 Domain 邏輯
    progressionSystem.ts    英雄養成系統（升級/突破/升星/裝備）
    seededRng.ts            確定性隨機數產生器
    stageSystem.ts          關卡/爬塔/副本設定與解鎖判定
    battleFlowValidator.ts  戰鬥流程驗證器
    combatPower.ts          戰力計算公式（六維加權）
    arenaSystem.ts          競技場排名系統
 services/                    資料服務層（無 React 依賴）
    index.ts                統一匯出
    sheetApi.ts             Google Sheets API 封裝 + 快取
    dataService.ts          Sheet  domain 型別轉換 + 中英對照
    audioService.ts         音效與背景音樂管理器（Web Audio API 合成）
    authService.ts          認證服務（訪客/帳號登入、綁定、改密碼）
    battleService.ts        戰鬥流程服務（開戰/結算/通關處理）
    gachaLocalPool.ts       本地抽卡池管理（初始化/抽取/同步）
    gachaPreloadService.ts  抽卡池預載服務
    inventoryService.ts     背包服務（裝備/解除/鎖定/擴容/使用）
    localStorageMigration.ts 本地儲存版本遷移
    mailService.ts          信箱服務（領取/全領/刪除/刪除已讀）
    progressionService.ts   英雄養成服務（升級/突破/升星/強化/鍛造/拆解/通關/爬塔/副本）
    pwaService.ts           PWA 服務（安裝偵測/平台指引/獎勵領取）
    saveService.ts          存檔服務（儲存陣型/收集資源）

 components/
    Arena.tsx               場景（地面/碎片/雨/天空/霧，13 種 SceneMode 主題）
    Hero.tsx                英雄容器（移動/動畫狀態機）
    ZombieModel.tsx         GLB 模型 + 受擊閃光
    SceneWidgets.tsx        血條/飄字/鏡頭/控制/SkillToast3D
    UIOverlay.tsx           HUD 元件（TransitionOverlay、ThumbnailList、useToast）
    LoginScreen.tsx         登入畫面
    MainMenu.tsx            主選單導航中心（7 功能卡片）
    HeroListPanel.tsx       英雄列表與詳情面板
    InventoryPanel.tsx      背包面板（9 分類 Tab）
    GachaScreen.tsx         召喚（抽卡）畫面
    StageSelect.tsx         關卡選擇面板（主線/爬塔/副本）
    BattleHUD.tsx           戰鬥增強 HUD（血條/能量/Buff/技能彈幕）
    ShopPanel.tsx           商店面板（4 類每日/素材/裝備/特殊 + 購買流程）
    SettingsPanel.tsx       設定面板（音量滑桿 + 靜音 + 帳號 + 清除快取）
    MailboxPanel.tsx        信箱面板（信件/獎勵/刪除/批量操作）
    CurrencyIcon.tsx        統一貨幣 icon 元件（CSS badge: gold/diamond/exp/stardust）
    MenuScreenRouter.tsx    主選單子畫面路由（heroes/inventory/gacha/stages/settings/mailbox/shop/checkin/arena）
    DragPlane.tsx           拖曳平面（R3F 子元件，投射到 y=1.25 平面）
    BattleStatsPanel.tsx    戰鬥統計面板（輸出/治療/承傷柱狀圖）
    VictoryPanel.tsx        勝利/敗北標語與獎勵面板
    GameOverButtons.tsx     GAMEOVER 按鈕群組（下一關/重試/回放/統計/回大廳）
    BattleSpeedControls.tsx 戰鬥倍速 + 跳過按鈕
    InfoTip.tsx             資源說明 Tooltip（min 300px / max 380px）
    RedDot.tsx              通知紅點 badge 元件
    ClickableItemIcon.tsx   道具可點擊 icon（自帶 ItemInfoPopup 彈窗）
    PanelInfoTip.tsx        面板標題 ℹ️ 說明浮窗（Portal popup）
    ArenaPanel.tsx          競技場面板（排名/防守陣型/挑戰/獎勵）
    CombatPowerHUD.tsx      戰力 HUD（敵我戰力對比 + 變化動畫）
    CheckinPanel.tsx        每日簽到面板（7 日循環獎勵）
    TutorialOverlay.tsx     新手引導覆蓋層（5 步教學）
    CodexPanel.tsx          圖鑑面板
    ChestLootPreview.tsx    寶箱開啟預覽
    AcquireToast.tsx        獲得物品動畫提示
    ItemInfoPopup.tsx       道具資訊彈窗
    SceneProps.tsx          場景道具元件

 hooks/
    useResponsive.ts        RWD 偵測 hook
    useAuth.ts              認證 hook（登入/登出/綁定/改密碼）
    useSave.ts              存檔 hook（載入/儲存/同步）
    useLogout.ts            登出 hook（auth logout + 9 快取清除 + onResetState 回呼）
    useCurtain.ts           過場幕狀態 hook
    useBattleHUD.ts         戰鬥 HUD 狀態 hook（buffs/energy/toasts/hints）
    useAnimationPromises.ts 動畫 Promise 系統 hook
    useDragFormation.ts     拖曳陣型 + 英雄上下陣 hook
    useSlots.ts             槽位管理 hook（6 格 × 雙方）
    useGameInit.ts          遊戲初始化 hook（fetchData/preload/PWA）
    useBattleFlow.ts        戰鬥流程 hook（loop/retry/replay/back）
    useStageHandlers.ts     關卡 handler hook
    useMail.ts              信箱 hook
    useBattleState.ts       戰鬥中介狀態 hook
    useBgm.ts               BGM 自動切換 hook
    useCombatPower.ts       戰力計算 hook（敵我戰力對比）
    useAcquireToast.ts      獲得物品動畫提示 hook

 loaders/
     glbLoader.ts            GLB 載入器（全域快取 + Suspense）

 constants/
     rarity.ts              道具 icon/名稱/稀有度共用常數（ITEM_ICONS、ITEM_NAMES、RARITY_CONFIG、getItemIcon/getItemName）
```

### 架構分層

```

  表現層 (Presentation)               
  App.tsx + components/ + hooks/      
  React + R3F + Three.js              

  服務層 (Services)                    
  services/sheetApi.ts                
  services/dataService.ts             
  Google Sheets API 封裝              

  領域層 (Domain)                      
  domain/battleEngine.ts              
  domain/damageFormula.ts             
  domain/buffSystem.ts ...            
  純 TypeScript，零外部依賴            

```

**關鍵設計原則**：
- Domain 層不 import 任何 React / Three.js
- Services 層不 import 任何 React（但依賴 domain types）
- 表現層消費 domain 的 `BattleAction` 指令（Command Pattern）

---

## 開發工具鏈

| 工具 | 版本 | 用途 |
|------|------|------|
| ESLint | ^9.39.1 | 程式碼品質檢查 |
| eslint-plugin-react-hooks | ^7.0.1 | React Hooks 規則 |
| eslint-plugin-react-refresh | ^0.4.24 | Fast Refresh 安全檢查 |
| Puppeteer | ^24.37.5 | 離線渲染角色大頭照 |
| Express | ^5.2.1 | 大頭照生成用臨時 HTTP server |

---

## TypeScript 配置

| 設定 | 值 | 說明 |
|------|-----|-----|
| target | ES2020 | 編譯目標 |
| module | ESNext | ES 模組 |
| moduleResolution | bundler | Vite bundler 模式 |
| jsx | react-jsx | 自動 JSX runtime |
| strict | true | 嚴格模式 |
| lib | ES2020, DOM, DOM.Iterable | 型別庫 |
| paths | `@/*` → `src/*` | 路徑別名 |

---

## 3D 資產管線

### 模型格式：GLB（Draco 壓縮）

```
原始 FBX（Mixamo）
     Blender Python（.ai/scripts/fbx_to_glb.py）
     global_scale=100.0（抵消 FBX cm→m 0.01）
     Draco 壓縮 + JPEG 貼圖
GLB 檔案 × 6（per model）
```

### 檔案結構

```
public/models/zombie_N/
 zombie_N.glb           Mesh + 骨架（Draco 壓縮）
 zombie_N_idle.glb      待機動畫（循環）
 zombie_N_attack.glb    攻擊動畫（單次）
 zombie_N_hurt.glb      受擊動畫（單次）
 zombie_N_dying.glb     死亡動畫（clamp）
 zombie_N_run.glb       跑步動畫（循環，已移除 root motion）
 thumbnail.png          大頭照縮圖
```

### 載入器架構（`src/loaders/glbLoader.ts`）

```
GLTFLoader + DRACOLoader (WASM, 本地 public/draco/)
        
loadGlbShared(url)         非同步載入，全域 Map 快取，去重複
        
getGlbForSuspense(url)     同步介面，配合 React Suspense
        
THREE.Cache.enabled = true  Three.js HTTP 快取
```

### Draco 解碼器

```
public/draco/
 draco_decoder.js
 draco_encoder.js
 draco_wasm_wrapper.js
```

- 解碼器路徑：`import.meta.env.BASE_URL + 'draco/'`
- 必須本地供應，**不可用 CDN**（離線可用 + 避免 CORS）

---

## 使用的 Three.js 子模組

| 模組 | 來源 | 用途 |
|------|------|------|
| `GLTFLoader` | `three/examples/jsm/loaders/GLTFLoader` | 載入 .glb 模型 |
| `DRACOLoader` | `three/examples/jsm/loaders/DRACOLoader` | Draco 壓縮解碼 |
| `SkeletonUtils` | `three/examples/jsm/utils/SkeletonUtils` | SkinnedMesh 克隆 |

---

## 使用的 @react-three/drei 元件

| 元件/Hook | 用途 | 使用位置 |
|-----------|------|---------|
| `Canvas` | R3F 根容器 | App.tsx |
| `useFrame` | 逐幀更新 | Hero, ZombieModel, Arena, SceneWidgets |
| `useThree` | 存取 Three.js 上下文 | App.tsx, SceneWidgets |
| `useAnimations` | 動畫管理 hook | ZombieModel |
| `OrbitControls` | 鏡頭控制 | SceneWidgets |
| `Billboard` | 始終面向鏡頭容器 | Hero, SceneWidgets |
| `Text` | 3D 文字渲染 | Hero, SceneWidgets |
| `Sky` | 天空盒 | Arena |
| `Sparkles` | 粒子火花效果 | Arena |

---

## React 架構

### 元件樹

```
main.tsx
 <StrictMode>
     <App>                           遊戲邏輯 + 狀態管理
         {!showBattleScene}           大廳模式（無 Canvas）
            <MainMenu />             主選單
            <MenuScreenRouter />     子畫面（英雄/背包/召喚/關卡…）
         {showBattleScene}            戰鬥場景（Canvas 常駐，內容條件掛載）
         <Canvas>                     R3F 根（常駐，CSS visibility 控制可見性）
            <Suspense>
               <Arena />           場景
               <SlotMarker /> 12  格子標記
               <Hero /> N         場上英雄（各自獨立 Suspense 邊界）
                  <ZombieModel />   GLB + 骨骼動畫 + visibilitychange 補時
                  <HealthBar3D />   3D 血條
                  <EnergyBar3D />   3D 能量條
                  <DamagePopup />   飄字傷害
                  <SkillToast3D />  技能名稱 3D 飄字
                  <Html /> (名稱 HTML Overlay，固定像素大小)
               <DragPlane />
            <ResponsiveCamera />
         HUD
         <ThumbnailList />
         Battle Result Banner
         Speed Button
         <TransitionOverlay />
```

### 狀態管理

- **無外部狀態庫**：純 `useState` + `useRef`
- 戰鬥迴圈中使用 `useRef` 讀即時值，避免 async 閉包陷阱
- 跨元件通訊：props 傳遞 + callback refs

---

## 資料流（v1.2 更新）

### 三階段載入架構

```
Phase 0（掛載即刻、登入前）：
  - 預取英雄列表（heroes API）
  - 預取 gameData（skill_templates / hero_skills）
  - 預載 GLB 模型 + 縮圖（fire-and-forget，不阻塞）

Phase 1（登入後）：
  - 載入存檔（load-save API）
  - 載入信箱（load-mail API）
  - 初始化抽卡池（initLocalPool）

Phase 2（進入遊戲 / fetchData）：
  - 復用 Phase 0 已 prefetch 的資料
  - 還原陣型（save.formation → playerSlots）
  - 設定 IDLE 狀態
載入進度簡化為 2 階（fetch 70% / finalize 30%）
```

### 樂觀更新架構（Optimistic Queue）

```
前端狀態變更
    ↓
立即更新 localStorage + React state（UI 立刻反映）
    ↓
fireOptimistic / fireOptimisticAsync
加入佇列（帶自動生成的 opId 確保媣等性）
    ↓
背景批次同步到 Google Sheets API
失敗 → 重試 → Toast 提示
```

**已採用 Optimistic Queue 的服務**：
| 服務 | 操作數 |
|------|--------|
| `inventoryService` | 1（useItem） |
| `progressionService` | 7+（upgrade/ascend/starUp/enhanceEquipment/equipGachaPull/completeStage/tower/daily） |
| `mailService` | 4（claimMailReward/claimAllMail/deleteMail/deleteAllRead） |
| `saveService` | 2（saveFormation/collectResources） |
| `gachaLocalPool` | 1（syncPool） |

### 資料流圖

```

              Cloudflare D1 (正規化表)
  heroes | skill_templates | hero_skills | item_definitions    

           Workers API  POST /readSheet
           (從專屬 D1 表查詢，回傳 JSON 陣列)

              src/services/sheetApi.ts                       
  readSheet<T>(sheetName) → callApi → T[]                   
  快取：Map<string, unknown[]>                               

                 
                 

            src/services/dataService.ts                      
  loadAllGameData() → 並行載入 3 表                          
  ~~toElement() 中英對照~~（已移除）                                       
  toSkillTemplate() 解析 effects JSON                        
  getHeroSkillSet() 查詢英雄技能                              

                  RawHeroInput[], Map<skillId, SkillTemplate>,
                  Map<heroId, HeroSkillConfig>
                 

            src/App.tsx (FETCHING → IDLE)                    
  heroInputsRef / skillsRef / heroSkillsRef                 
  preloadGlb() 預載所有模型                                   

                  開戰 → slotToInput → createBattleHero
                 

          src/domain/battleEngine.ts                         
  runBattle(players, enemies, { onAction })                  
  純邏輯迴圈 → 產生 BattleAction[]                            

                  cfg.onAction(action) → Command Pattern
                 

          src/App.tsx onAction callback                      
  消費 BattleAction → 3D 演出                                
  ADVANCING → ATTACKING → HURT/DEAD → RETREATING            
  同步 HP 到 React state → 更新血條                           

```

---

## 響應式設計（RWD）

### Hook：`useResponsive()`

| 裝置 | 判定條件 | DPR | FOV |
|------|---------|-----|-----|
| mobile | width ≤ 480 或 portrait width ≤ 600 | [1, 1.5] | 較大（廣角） |
| tablet | width ≤ 1024 或 portrait width ≤ 800 | [1, 1.5] | 中等 |
| desktop | 以上皆非 | [1, 2] | 標準 |

- 桌機使用 9:16 容器模擬直屏
- `orientationchange` 事件需 `setTimeout(100ms)` 取得正確尺寸

---

## 建構與部署

| 指令 | 說明 |
|------|------|
| `npm run dev` | Vite 開發伺服器（HMR） |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | 預覽打包結果 |
| `npm run lint` | ESLint 檢查 |
| `npm run generate:thumbnails` | Puppeteer 生成角色大頭照 |
| `npm run convert:models` | Blender FBX→GLB 批次轉換 |

### Vite 配置

```javascript
export default defineConfig({
  plugins: [react()],
  base: '/game/',
})
```

---

## 工具腳本

| 腳本 | 語言 | 用途 |
|------|------|------|
| `.ai/scripts/fbx_to_glb.py` | Blender Python | FBX→GLB 批次轉換 |
| `.ai/scripts/convert_models.ps1` | PowerShell | fbx_to_glb.py 包裝器 |
| `.ai/scripts/generate_thumbnails.js` | Node.js + Puppeteer | 角色大頭照渲染 |
| `.ai/scripts/check_glb_tracks.mjs` | Node.js | 檢查 GLB 動畫 tracks |

---

## 效能策略

| 策略 | 實作方式 |
|------|---------|
| GLB Draco 壓縮 | mesh GLB 體積大幅縮小 |
| 動畫分離 | 每動畫獨立 GLB（~100KB），按需載入 |
| 全域載入快取 | `loadGlbShared()` Map 去重複載入 |
| THREE.Cache | HTTP 層級快取 |
| SkeletonUtils.clone | 共享 geometry，低記憶體克隆 |
| 霧氣裁剪 | fog far  地面半徑 |
| DPR 限制 | mobile [1, 1.5]，desktop [1, 2] |
| Domain 純邏輯 | 戰鬥計算零 DOM/WebGL 開銷 |
| Sheets 快取 | 每張表只 fetch 一次（sheetApi + dataService 雙層快取） |

---

## 場景五要素（連動規則）

> **修改任一項，其餘四項必須同步調整。**

| 要素 | 目前值 | 參數 |
|------|--------|------|
| Ground | `PlaneGeometry(60, 60, 64, 64)` | 半徑 30 |
| Debris | 80 個 + 12 面牆 | spread=35 |
| Rain | 1200 條 `LineSegments` | area=30 |
| Sparkles | 80 個 | scale=20 |
| Fog | `['#1a0e06', 8, 35]` | near=8, far=35 |

規則：`fog far ≤ ground 半徑`

---

## 關鍵限制與陷阱

| 陷阱 | 說明 |
|------|------|
| SkinnedMesh 克隆 | 必須用 `SkeletonUtils.clone()`，不可用 `.clone()` |
| 動畫切換 | 必須用 `crossFadeTo()`，禁止 `stop()play()` |
| GLB Z-up | Blender 匯出保留 Z-up 座標系 |
| GLB 縮放 | 匯入需 `global_scale=100.0` |
| Draco 本地 | WASM 解碼器必須在 `public/draco/` |
| 雨效果 | 用 `LineSegments` + `LineBasicMaterial` |
| PlaneGeometry | X/Y 映射世界 X/Z |
| Debris 浮空 | Y 座標要 `scale.y * 0.5` |
| CSS 必載 | `import './App.css'` 不可省略 |
| 閉包陷阱 | async 函數中用 `useRef` 讀即時值 |
| orientationchange | 需 `setTimeout(100ms)` |

---

## 擴展點

- [ ] **狀態管理庫**：若複雜度上升，可引入 Zustand 或 Jotai

---

## D1 原子批次寫入（db.batch）

所有涉及多次寫入的後端路由，均使用 `db.batch()` 將全部 `D1PreparedStatement` 包成單一 SQLite 交易（all-or-nothing），避免中途 crash 導致部分寫入。

### 核心函式（`workers/src/routes/save.ts`）

| 函式 | 回傳型別 | 用途 |
|------|----------|------|
| `upsertItemStmt(db, playerId, itemId, delta)` | `D1PreparedStatement` | 單一 SQL `INSERT ... ON CONFLICT` 物品 upsert |
| `upsertItem(db, playerId, itemId, delta)` | `Promise<void>` | 向後相容包裝（內部呼叫 stmt.run()）|
| `grantRewardsStmts(db, playerId, rewards)` | `D1PreparedStatement[]` | 合併同欄資源增減為單一 UPDATE + 道具 upsert |
| `grantRewards(db, playerId, rewards)` | `Promise<void>` | 向後相容包裝（內部呼叫 batch）|

### 核心函式（`workers/src/routes/mail.ts`）

| 函式 | 回傳型別 | 用途 |
|------|----------|------|
| `insertMailStmt(db, mailId, playerId, title, body, rewards)` | `D1PreparedStatement` | 信件 INSERT 語句（不執行）|
| `insertMail(db, playerId, title, body, rewards)` | `Promise<string>` | 向後相容包裝（執行並回傳 mailId）|

### 已批次化路由

| 路由 | 檔案 | 批次內容 |
|------|------|----------|
| `init-save` | save.ts | INSERT save_data + 3× INSERT hero_instances（陣型內建）|
| `register-guest` | auth.ts | INSERT players + INSERT mailbox 歡迎信 |
| `bind-account` | auth.ts | UPDATE players + INSERT mailbox 獎勵信 |
| `add-items` | inventory.ts | N× upsertItemStmt |
| `remove-items` | inventory.ts | N× upsertItemStmt |
| `shop-buy` | inventory.ts | 扣貨幣 + 購買次數 + 發放獎勵 |
| `use-item` | inventory.ts | 扣道具 + 加資源 / 裝備 |
| `equip-item` | inventory.ts | 卸舊裝 + 穿新裝 |
| `gacha-pull` | gacha.ts | 扣鑽石 + INSERT 英雄 + upsert 碎片/星塵 + 更新 pity |
| `equip-gacha-pull` | gacha.ts | 扣貨幣 + INSERT 裝備 |
| `upgrade-hero` | progression.ts | 扣 EXP + 更新英雄等級 |
| `ascend-hero` | progression.ts | 扣碎片/職業石/金幣 + 更新覺醒 |
| `star-up-hero` | progression.ts | 扣碎片 + 更新星數 |
| `enhance-equipment` | progression.ts | 扣金幣 + 更新強化等級 |
| `claim-mail-reward` | mail.ts | 發放獎勵 + 標記已領 |
| `claim-all-mail` | mail.ts | 全部獎勵 + 全部標記 |
| `delete-all-read` | mail.ts | N× 軟刪除 |
| `send-mail` | mail.ts | N× INSERT mailbox |
| `claim-pwa-reward` | mail.ts | 標記已領 + INSERT 獎勵信 |
| `daily-checkin` | checkin.ts | UPDATE save_data + N× upsertItemStmt |
| `arena-challenge-complete` | arena.ts | 扣次數 + 排名交換 + 最高排名 + 金幣鑽石 + pvpCoin |

---

## GAS CacheService 快取層

後端 Google Apps Script 使用 [`CacheService.getScriptCache()`](https://developers.google.com/apps-script/reference/cache/cache-service) 進行伺服端快取，減少 SpreadsheetApp 讀取次數。

### 限制

| 項目 | 限制 |
|------|------|
| 每個 key-value | **100 KB** |
| 最長 TTL | **21600 秒（6 小時）** |
| ScriptCache | 全部署實例共用（全使用者共享） |

### 分片機制

當 JSON 超過 90KB 時，自動分片存儲：
- `meta:key` → chunk 數量
- `chunk:key:0`, `chunk:key:1`, … → 分片內容
- 讀取時自動組裝；任一 chunk miss 視為 cache miss

### 快取策略分級

| 級別 | 對象 | Cache Key | TTL | 說明 |
|------|------|-----------|-----|------|
| **A. 全域配表** | heroes, skill_templates, hero_skills, item_definitions | `sheet:{name}` | 6h | 所有玩家共用、極少變動 |
| **B. 衍生結果** | loadHeroPool_() | `heroPool` | 6h | 從 heroes 表衍生的抽卡池模板 |
| **C. 用戶映射** | resolvePlayerId_() | `pid:{guestToken}` | 6h | token→playerId 建立後不變 |
| **D. 道具配表** | handleLoadItemDefinitions_() | `itemDefs` | 6h | 道具定義表，極少變動 |

### 不快取的資料

| 資料 | 原因 |
|------|------|
| save_data (load-save) | 頻繁變動 |
| hero_instances | 抽卡/升級隨時新增修改 |
| inventory | 交易型資料，每次操作都會變 |
| mailbox | 每位玩家不同且隨時有新郵件 |
| 所有寫入操作 | save-progress, gacha-pull, complete-stage 等純寫入 |

### 自動失效

所有寫入 handler（`updateSheet`, `createSheet`, `deleteSheet`, `clearSheet`, `deleteRows`, `deleteColumn`, `appendRows`, `renameSheet`）在操作成功後自動呼叫 `invalidateSheetCache_(sheetName)` 清除對應快取。

特殊連動：修改 `heroes` 表 → 同時清除 `heroPool` 快取；修改 `item_definitions` 表 → 同時清除 `itemDefs` 快取。

### 手動清除

```
POST { "action": "invalidate-cache" }
→ { "success": true, "message": "All cache invalidated" }
```

### 快取命中標記

快取命中的回應會附加 `_cached: true` 欄位，供偵錯使用。
- [x] **音效引擎**：Web Audio API 合成 BGM + SFX（`audioService.ts`）
- [ ] **Shader 特效**：自訂材質效果
- [x] **PWA**：離線支援 + 安裝獎勵（v1.6 已實作）
- [ ] **多人對戰**：WebSocket / WebRTC

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2025-02-26 | 從現有程式碼逆向整理完整技術架構 |
| v1.1 | 2025-02-26 | 新增 `src/domain/` + `src/services/` 分層架構、更新資料流圖 |
| v1.2 | 2026-02-28 | 三階段載入架構（prefetch）、全面 Optimistic Queue、SkillToast3D 3D 元件、ZombieModel visibilitychange 補時、heroesListRef、資源 HUD 僅主選單顯示 |
| v1.3 | 2026-02-28 | 新增 GAS CacheService 快取層：全域配表快取（6h TTL）、resolvePlayerId_ 快取、loadHeroPool_ 快取、分片機制、自動/手動失效、invalidate-cache API |
| v1.4 | 2026-02-28 | 新增 audioService.ts（Web Audio API 合成 BGM 6 曲目 + SFX 9 種）、ShopPanel.tsx、SettingsPanel.tsx 音效控制 UI、標記音效引擎為已實作 |
| v1.5 | 2026-02-28 | 新增 `constants/rarity.ts` 共用常數層 + `CurrencyIcon.tsx` 統一貨幣 icon 元件，替代各元件散落的 CSS inline icon 和 emoji |
| v1.6 | 2026-03-01 | PWA 支援：manifest.json + service worker（Network/Cache First 策略）+ `pwaService.ts`（安裝偵測/平台指引/獎勵領取）+ 帳號綁定獎勵（💎200+🪙5000）+ PWA 安裝獎勵（💎100+🪙3000） |
| v1.7 | 2026-03-01 | 同步實際程式碼：完整更新 services/（16 檔）、domain/（13 檔）、components/（16 檔）、hooks/（3 檔）目錄列表；Optimistic Queue 操作數更新（mailService 4 ops、saveService 2 ops、新增 gachaLocalPool）；orientationchange timeout 修正為 100ms |
| v1.8 | 2026-06-15 | **配合裝備模板制 v2**：inventoryService Optimistic Queue 操作數 5→1（移除 equip/unequip/lock/expand）；progressionService 操作數 8+→7+（移除 forge/dismantle，新增 enhanceEquipment/equipGachaPull）；不快取資料表移除 equipment |
| v1.9 | 2026-03-02 | **useLogout hook**：hooks/ 目錄新增 `useLogout.ts`（auth logout + 9 快取清除）；新增 App.tsx Phase 4 抽出的 12 個 hooks 完整列表（useCurtain/useBattleHUD/useAnimationPromises/useDragFormation/useSlots/useGameInit/useBattleFlow/useStageHandlers/useMail/useBattleState/useBgm） |
| v2.0 | 2026-03-03 | **新元件 + Arena 擴展**：新增 `InfoTip.tsx`（資源說明 Tooltip，min 300px / max 380px）、`RedDot.tsx`（通知紅點 badge）；Arena.tsx SceneMode 從 5 擴展至 13 種（新增 8 個章節專屬場景主題：ruins/forest/desert/glacier/volcano/abyss/sky_temple/doomsday）；sceneTheme 與 stageMode 分離 |
| v2.1 | 2026-03-06 | **ClickableItemIcon 統一**：5 檔案 10 處 `getItemIcon` → `<ClickableItemIcon>`（App.tsx/StageSelect/CheckinPanel/ShopPanel/HeroListPanel）；CheckinPanel/ShopPanel 移除手動 `previewItemId` 狀態 + `ItemInfoPopup` 渲染（改由 ClickableItemIcon 自帶 popup）；PanelInfoTip 新增 `children?: ReactNode` prop；BattleHUD Boss 條 emoji → CurrencyIcon |
| v2.3 | 2026-03-06 | **iOS PWA Canvas GPU 紋理保活**：Canvas `visibility:hidden` → `pointerEvents:none`，避免 iOS WKWebView 在 Canvas 隱藏期間回收 GPU 紋理資源導致已載入模型變黑；還原 ZombieModel/HeroListPanel cloneMat metalness 覆寫（非根因） |
| v2.4 | 2026-03-06 | **英雄名稱 HTML Overlay**：Billboard Text → Html DOM，固定像素大小 |
| v2.5 | 2026-03-06 | **大廳/戰鬥場景分離架構**：新增 `showBattleScene` 狀態，Canvas（3D 場景）不再常駐掛載 — 大廳模式完全不載入 Canvas，僅在進入戰鬥準備（handleStageSelect/handleArenaStartBattle/handleArenaDefenseSetup）時才動態掛載，並以過場幕遮蔽載入過程；返回大廳時 Canvas 卸載釋放 GPU 資源。還原 v2.3 的 `visibility:hidden → pointerEvents:none` 修改（不再需要），根本解決 iOS WKWebView 紋理回收問題 |
| v2.6 | 2026-03-06 | **iOS WebGL 深度紋理修復**：(1) ZombieModel/HeroListPanel `cloneMat` 新增所有紋理貼圖 `needsUpdate=true`（map/normalMap/roughnessMap/metalnessMap/aoMap），diffuse map 強制 `SRGBColorSpace`；(2) Canvas iOS 強制 WebGL1 渲染器（WKWebView WebGL2 紋理分配 bug）、`shadows=false`、`flat` 模式、`NoToneMapping`（避免 ACES 壓暗）；(3) ZombieModel useEffect cleanup — unmount 時 dispose cloned materials 防止 VRAM 洩漏；(4) glbLoader 新增 `disposeDracoDecoder()` 釋放 WASM 記憶體；(5) Context restored handler 加入紋理 colorSpace 修正 |
| v2.7 | 2026-03-08 | **Canvas 常駐 + 過場幕等模型就緒**：(1) Canvas 改為常駐掛載（CSS visibility + frameloop 切換），避免 iOS Safari 反覆建立/銷毀 WebGL context；(2) 移除 `SceneReady` 元件 — 不再由外層 Suspense 觸發收幕，改由 `selectStage`/`enterArena`/`defenseSetup` 等 await `preloadPromise` 完成後才呼叫 `closeCurtain()`（25s 安全網），確保過場幕遮蓋所有 Suspense 載入佔位符；(3) `goNextStage` 預載超時從 12s 提升至 25s |
| v2.8 | 2026-03-08 | **Troika 字型預載修復**：(1) 根因：drei v10 `<Text>` 內部使用 `suspend-react.suspend()` 載入字型，key `['troika-text', font, characters]` — 戰鬥開始時 PassiveHint3D 首次渲染 `<Text>` → 字型未快取 → throw Promise → 觸發 per-hero `<Suspense>` fallback（旋轉方塊），即使模型已全部載入；(2) SceneWidgets.tsx 新增 `preloadTroikaFont()` 使用 `suspend-react.preload()` 非拋出 API 預熱快取；(3) App.tsx 新增 `FontPreloader` 元件在 Canvas 掛載時呼叫；(4) 先前嘗試 a9e97b7（改 curtain/preload 時序）已 revert |
| v2.9 | 2026-03-15 | **Spec 校正 — 文件清單對齊實際程式碼**：① domain/ 新增 combatPower.ts、arenaSystem.ts、equipmentGacha.ts ② components/ 新增 ArenaPanel.tsx、CombatPowerHUD.tsx、CheckinPanel.tsx、TutorialOverlay.tsx、CodexPanel.tsx、ChestLootPreview.tsx、AcquireToast.tsx、ItemInfoPopup.tsx、SceneProps.tsx ③ hooks/ 新增 useCombatPower.ts、useAcquireToast.ts ④ 修正 audioService/authService 兩條目合併問題 ⑤ 版本號從 v2.6 同步至 v2.9 |
