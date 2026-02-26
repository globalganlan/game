# 技術架構 Spec（現有實作）

> 版本：v1.0 ｜ 狀態：🟢 定稿（與現有程式碼同步）
> 最後更新：2026-02-26
> 負責角色：🔧 CODING → 🏗️ ARCHITECT

## 概述

全球感染 (GlobalGanLan) 使用 React + Three.js 技術棧，
以 Vite 為建構工具，在瀏覽器中渲染 3D 回合制對戰場景。
部署目標為靜態站台（base path: `/game/`）。

---

## 核心技術棧

| 層級 | 技術 | 版本 | 角色 |
|------|------|------|------|
| **UI 框架** | React | ^19.2.0 | 元件化 UI + 狀態管理 |
| **3D 引擎** | Three.js | ^0.183.1 | WebGL 渲染核心 |
| **React ↔ Three 橋接** | @react-three/fiber (R3F) | ^9.5.0 | 宣告式 3D 場景 |
| **3D 輔助庫** | @react-three/drei | ^10.7.7 | 常用元件（OrbitControls, Billboard, Text, Sky, Sparkles, useAnimations） |
| **語言** | TypeScript | ^5.9.3 | 靜態型別 |
| **建構工具** | Vite | ^5.4.21 | 開發伺服器 + 打包 |
| **Vite 插件** | @vitejs/plugin-react | ^4.7.0 | JSX 轉換 + Fast Refresh |

---

## 開發工具鏈

| 工具 | 版本 | 用途 |
|------|------|------|
| ESLint | ^9.39.1 | 程式碼品質檢查 |
| eslint-plugin-react-hooks | ^7.0.1 | React Hooks 規則 |
| eslint-plugin-react-refresh | ^0.4.24 | Fast Refresh 安全檢查 |
| Puppeteer | ^24.37.5 | 離線渲染角色大頭照（`scripts/generate_thumbnails.js`） |
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
    ↓ Blender Python（scripts/fbx_to_glb.py）
    ↓ global_scale=100.0（抵消 FBX cm→m 0.01）
    ↓ Draco 壓縮 + JPEG 貼圖
GLB 檔案 × 6（per model）
```

### 檔案結構

```
public/models/zombie_N/
├── zombie_N.glb          ← Mesh + 骨架（Draco 壓縮）
├── zombie_N_idle.glb     ← 待機動畫（循環）
├── zombie_N_attack.glb   ← 攻擊動畫（單次）
├── zombie_N_hurt.glb     ← 受擊動畫（單次）
├── zombie_N_dying.glb    ← 死亡動畫（clamp）
├── zombie_N_run.glb      ← 跑步動畫（循環，已移除 root motion）
└── thumbnail.png         ← 大頭照縮圖
```

### 載入器架構（`src/loaders/glbLoader.ts`）

```
GLTFLoader + DRACOLoader (WASM, 本地 public/draco/)
        ↓
loadGlbShared(url)        ← 非同步載入，全域 Map 快取，去重複
        ↓
getGlbForSuspense(url)    ← 同步介面，配合 React Suspense
        ↓
THREE.Cache.enabled = true ← Three.js HTTP 快取
```

### Draco 解碼器

```
public/draco/
├── draco_decoder.js
├── draco_encoder.js
└── draco_wasm_wrapper.js
```

- 解碼器路徑：`import.meta.env.BASE_URL + 'draco/'`
- 必須本地供應，**不可用 CDN**（離線可用 + 避免 CORS）

---

## 使用的 Three.js 子模組

| 模組 | 來源 | 用途 |
|------|------|------|
| `GLTFLoader` | `three/examples/jsm/loaders/GLTFLoader` | 載入 .glb 模型 |
| `DRACOLoader` | `three/examples/jsm/loaders/DRACOLoader` | Draco 壓縮解碼 |
| `SkeletonUtils` | `three/examples/jsm/utils/SkeletonUtils` | SkinnedMesh 克隆（`.clone()` 不可用） |

---

## 使用的 @react-three/drei 元件

| 元件/Hook | 用途 | 使用位置 |
|-----------|------|---------|
| `Canvas` | R3F 根容器 | App.tsx |
| `useFrame` | 逐幀更新（移動 lerp、動畫） | Hero, ZombieModel, Arena, SceneWidgets |
| `useThree` | 存取 Three.js 上下文（camera, size） | App.tsx, SceneWidgets |
| `useAnimations` | 動畫管理 hook（clips + mixer） | ZombieModel |
| `OrbitControls` | 鏡頭控制（已鎖定旋轉/平移/縮放） | SceneWidgets |
| `Billboard` | 始終面向鏡頭的容器 | Hero（名稱）, SceneWidgets（血條/傷害數字）|
| `Text` | 3D 文字渲染（troika-three-text） | Hero, SceneWidgets |
| `Sky` | 天空盒 | Arena |
| `Sparkles` | 粒子火花效果 | Arena |

---

## React 架構

### 元件樹

```
main.tsx
└── <StrictMode>
    └── <App>                          ← 遊戲邏輯 + 狀態管理
        ├── <Canvas>                   ← R3F 根
        │   ├── <Suspense>
        │   │   ├── <Arena />          ← 場景（地面/碎片/雨/天空/霧）
        │   │   ├── <SlotMarker /> ×12 ← 格子標記
        │   │   ├── <Hero /> ×N        ← 場上英雄
        │   │   │   ├── <ZombieModel /> ← GLB 模型 + 骨骼動畫
        │   │   │   ├── <HealthBar3D /> ← 3D 血條
        │   │   │   ├── <DamagePopup /> ← 飄字傷害
        │   │   │   └── <Billboard><Text /></Billboard> ← 名稱
        │   │   └── <DragPlane />      ← 拖曳投射平面
        │   └── <ResponsiveCamera />   ← 自適應鏡頭
        ├── HUD                        ← 回合數
        ├── <ThumbnailList />          ← 英雄選擇欄
        ├── Battle Result Banner       ← VICTORY/DEFEAT
        ├── Speed Button               ← x1/x2/x4
        └── <TransitionOverlay />      ← 過場幕（CRT 掃描線）
```

### 狀態管理

- **無外部狀態庫**：純 `useState` + `useRef`
- 戰鬥迴圈中使用 `useRef` 讀即時值，避免 async 閉包陷阱
- 跨元件通訊：props 傳遞 + callback refs

### React 功能使用

| API | 用途 |
|-----|------|
| `useState` | 遊戲狀態、槽位、UI 狀態 |
| `useEffect` | 資料拉取、事件監聽、動畫 cleanup |
| `useRef` | 即時值（戰鬥迴圈）、DOM/Three 物件引用 |
| `useCallback` | 事件處理器穩定引用 |
| `useMemo` | 衍生計算快取 |
| `Suspense` | GLB 非同步載入 fallback |
| `startTransition` | 低優先度狀態更新 |

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

## 資料流

```
Google Sheets → Apps Script Web App (JSON API)
        ↓  fetch (FETCHING 狀態)
RawHeroData[] → 正規化 ModelID → SlotHero[]
        ↓
玩家陣型 (playerSlots[6])  ←→  拖曳/點擊 UI
敵方陣型 (enemySlots[6])   ←  隨機生成
        ↓  開戰
BattleActor[] → runBattleLoop() → GameOver
```

---

## 建構與部署

| 指令 | 說明 |
|------|------|
| `npm run dev` | Vite 開發伺服器（HMR） |
| `npm run build` | `tsc -b && vite build`（型別檢查 + 打包） |
| `npm run preview` | 預覽打包結果 |
| `npm run lint` | ESLint 檢查 |
| `npm run generate:thumbnails` | Puppeteer 生成角色大頭照 |
| `npm run convert:models` | Blender FBX→GLB 批次轉換 |

### Vite 配置

```javascript
export default defineConfig({
  plugins: [react()],
  base: '/game/',       // 部署子路徑
})
```

---

## 工具腳本

| 腳本 | 語言 | 用途 |
|------|------|------|
| `scripts/fbx_to_glb.py` | Blender Python | FBX→GLB 批次轉換（Draco 壓縮） |
| `scripts/convert_models.ps1` | PowerShell | fbx_to_glb.py 包裝器 |
| `scripts/generate_thumbnails.js` | Node.js + Puppeteer | 角色大頭照渲染 |
| `scripts/generate_heroes_tsv.mjs` | Node.js | 生成 heroes.tsv |
| `scripts/analyze_zombies.mjs` | Node.js | 分析 zombie 模型 |
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
| 霧氣裁剪 | fog far ≤ 地面半徑，裁剪遠處幾何體 |
| DPR 限制 | mobile [1, 1.5]，desktop [1, 2] |
| console.warn 攔截 | 抑制 Three.js 內部噪音，避免 console 垃圾 |

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

規則：`fog far ≤ ground 半徑`，所有 spread/area ≤ fog far。

---

## 關鍵限制與陷阱

| 陷阱 | 說明 |
|------|------|
| SkinnedMesh 克隆 | 必須用 `SkeletonUtils.clone()`，不可用 `.clone()` |
| 動畫切換 | 必須用 `crossFadeTo()`，禁止 `stop()→play()`（bind-pose 閃現） |
| GLB Z-up | Blender 匯出保留 Z-up 座標系，`Box3` 站立高度在 Z 軸 |
| GLB 縮放 | 匯入需 `global_scale=100.0` 抵消 FBX 的 cm→m |
| Draco 本地 | WASM 解碼器必須在 `public/draco/`，不可 CDN |
| 雨效果 | `PointsMaterial` 只渲染方塊，雨用 `LineSegments` + `LineBasicMaterial` |
| PlaneGeometry | X/Y 映射世界 X/Z，Z 映射世界 Y（高度） |
| Debris 浮空 | Y 座標要 `scale.y * 0.5` |
| CSS 必載 | `import './App.css'` 漏掉 → 全部 HUD/按鈕消失 |
| 閉包陷阱 | async 函數中用 `useRef` 讀即時值 |
| orientationchange | 需 `setTimeout(100~150ms)` 才能拿到正確尺寸 |

---

## 擴展點

- [ ] **狀態管理庫**：若複雜度上升，可引入 Zustand 或 Jotai
- [ ] **後端**：目前純前端 + Google Sheets API，未來可接 Firebase / Supabase
- [ ] **音效引擎**：尚無音效，可用 Howler.js 或 Web Audio API
- [ ] **Shader 特效**：自訂材質效果（受擊、技能特效）
- [ ] **PWA**：離線支援
- [ ] **多人對戰**：WebSocket / WebRTC

## 變更歷史

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| v1.0 | 2026-02-26 | 從現有程式碼逆向整理：完整記錄技術架構 |
