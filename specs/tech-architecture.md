# 技術架構 Spec

> 版本：v1.1 ｜ 狀態：🟢 定稿（含 Domain Engine + Services 層）
> 最後更新：2025-02-26
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
 App.tsx                     遊戲邏輯 + 3D 演出（onAction callback）
 App.css                     HUD / 按鈕 / RWD media queries
 types.ts                    表現層型別（RawHeroData, SlotHero）
 suppressWarnings.ts         console.warn 攔截

 domain/                      純邏輯層（零 React 依賴）
    index.ts                統一匯出
    types.ts                核心型別（BattleHero, BattleAction, SkillTemplate...）
    battleEngine.ts         戰鬥引擎主迴圈 + BattleHero 工廠
    damageFormula.ts        傷害 / 治療 / DOT / 反彈公式
    buffSystem.ts           Buff/Debuff 施加 / 結算 / 查詢
    energySystem.ts         能量獲取 / 消耗 / 大招判定
    targetStrategy.ts       目標選擇策略
    elementSystem.ts        屬性剋制矩陣

 services/                    資料服務層（無 React 依賴）
    index.ts                統一匯出
    sheetApi.ts             Google Sheets API 封裝 + 快取
    dataService.ts          Sheet  domain 型別轉換 + 中英對照

 components/
    Arena.tsx               場景（地面/碎片/雨/天空/霧）
    Hero.tsx                英雄容器（移動/動畫狀態機）
    ZombieModel.tsx         GLB 模型 + 受擊閃光
    SceneWidgets.tsx        血條/飄字/鏡頭/控制
    UIOverlay.tsx           HUD 元件

 hooks/
    useResponsive.ts        RWD 偵測 hook

 loaders/
     glbLoader.ts            GLB 載入器（全域快取 + Suspense）
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
     Blender Python（scripts/fbx_to_glb.py）
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
         <Canvas>                    R3F 根
            <Suspense>
               <Arena />           場景
               <SlotMarker /> 12  格子標記
               <Hero /> N         場上英雄
                  <ZombieModel />   GLB + 骨骼動畫
                  <HealthBar3D />   3D 血條
                  <DamagePopup />   飄字傷害
                  <Billboard><Text /></Billboard>
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

## 資料流（v1.1 更新）

```

                    Google Sheets                            
  heroes | skill_templates | hero_skills | element_matrix    

                  fetch (GET/POST)
                 

              src/services/sheetApi.ts                       
  readSheet<T>(sheetName) → T[]                             
  快取：Map<string, unknown[]>                               

                 
                 

            src/services/dataService.ts                      
  loadAllGameData() → 並行載入 4 表                          
  toElement() 中英對照                                       
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
| `scripts/fbx_to_glb.py` | Blender Python | FBX→GLB 批次轉換 |
| `scripts/convert_models.ps1` | PowerShell | fbx_to_glb.py 包裝器 |
| `scripts/generate_thumbnails.js` | Node.js + Puppeteer | 角色大頭照渲染 |
| `scripts/check_glb_tracks.mjs` | Node.js | 檢查 GLB 動畫 tracks |

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
| orientationchange | 需 `setTimeout(100~150ms)` |

---

## 擴展點

- [ ] **狀態管理庫**：若複雜度上升，可引入 Zustand 或 Jotai
- [ ] **後端**：目前純前端 + Google Sheets API，未來可接 Firebase / Supabase
- [ ] **音效引擎**：Howler.js 或 Web Audio API
- [ ] **Shader 特效**：自訂材質效果
- [ ] **PWA**：離線支援
- [ ] **多人對戰**：WebSocket / WebRTC

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2025-02-26 | 從現有程式碼逆向整理完整技術架構 |
| v1.1 | 2025-02-26 | 新增 `src/domain/` + `src/services/` 分層架構、更新資料流圖 |
