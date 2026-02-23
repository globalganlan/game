# Copilot 專案指引 — GlobalGanLan

> 本檔案在每次新對話時自動載入，確保 AI 助手保有專案知識。
> 詳細知識點請參閱 `docs/Three.js場景與模型整合筆記.md`。

## 專案概覽

- **名稱**：全球感染 (GlobalGanLan) — 3D 喪屍對戰競技場
- **技術棧**：React 18 + Vite + @react-three/fiber + @react-three/drei + Three.js + TypeScript
- **主程式**：`src/App.tsx`（遊戲邏輯）+ `src/components/`（3D 元件拆分）
- **樣式**：`src/App.css`（HUD、按鈕、RWD media queries）
- **模型**：`public/models/zombie_1/` ~ `zombie_6/`（FBX 原始 + GLB 壓縮）

## 架構重點

1. **模型格式**：GLB（Draco 壓縮 + JPEG 貼圖），由 FBX 透過 Blender 批次轉換而來
   - `zombie_X.glb` — Mesh + 骨架（Draco 壓縮）
   - `zombie_X_{idle|attack|hurt|dying}.glb` — 只含動畫（無幾何體，~100 KB）
   - 前端使用 `GLTFLoader` + `DRACOLoader`（本地 WASM 解碼器在 `public/draco/`）
   - 載入器：`src/loaders/glbLoader.ts`（全域快取 + Suspense 整合）
2. **克隆**：`SkeletonUtils.clone()`（不可用 `.clone()`，SkinnedMesh 必用前者）
2. **動畫**：切換用 `crossFadeTo()`，不可用 `stop()→play()`（會 bind-pose 閃現）
3. **場景要素**（五者連動，改一個必全調）：
   - Ground: `PlaneGeometry(60, 60, 64, 64)`
   - Debris: 80 個, spread 35, 12 面牆
   - Rain: 1200 條 `LineSegments`, area 30
   - Sparkles: 80 個, scale 20
   - Fog: `['#1a0e06', 8, 35]`
4. **RWD**：`useResponsive()` hook 偵測 mobile/tablet/desktop + 直式/橫式，動態調整 FOV、鏡頭位置、DPR
5. **過場幕**：`TransitionOverlay` — 初載 + 重啟時遮蔽不合理畫面
6. **CSS**：**`import './App.css'` 絕對不可省略**，否則全部 HUD/按鈕樣式消失

## 關鍵陷阱（每次修改前請回顧）

- `idle.clone()` ≠ `SkeletonUtils.clone(idle)`（SkinnedMesh 必用後者）
- GLB Armature 保留 Blender Z-up 座標系 — `Box3` 站立高度在 **Z 軸** 而非 Y 軸
- GLB 匯入需 `global_scale=100.0` 抵消 FBX 的 cm→m 0.01 縮放
- Draco WASM 解碼器必須本地（`public/draco/`），不可用 CDN
- `PointsMaterial` 只渲染方塊，雨用 `LineSegments` + `LineBasicMaterial`
- PlaneGeometry X/Y → 世界 X/Z，Z → 世界 Y（高度）
- Debris Y 要 `scale.y * 0.5`，否則漂浮
- resetGame 必須先拉過場幕 → 等不透明 → 重置狀態 → 收幕
- **修改場景大小時，ground / debris / rain / sparkles / fog 五者必須連動**
- fog 遠端 ≤ 地面半徑，否則露出邊緣
- `import './App.css'` 漏掉 → 整個 UI 消失
- async 函數中用 `useRef` 讀即時值，避免閉包陷阱
- `orientationchange` 事件需 `setTimeout(150ms)` 才能拿到正確尺寸

## 效能原則

- 只渲染鏡頭可視範圍（fog 外的幾何體是浪費）
- 修改場景時先決定 fog far → 其他元素 spread/area ≤ fog far
- mobile DPR 限 `[1, 1.5]`，desktop `[1, 2]`

## 文件索引

| 文件 | 內容 |
|------|------|
| `docs/FBX轉GLB壓縮指南.md` | FBX→GLB 批次轉換流程、Draco/Decimate/JPEG 壓縮、前端載入架構 |
| `docs/大頭照生成指南.md` | Puppeteer + Three.js 離線渲染角色大頭照 |
| `docs/2D-to-3D-Model-Generation-Guide.md` | TripoSR 模型生成流程 |
| `docs/Mixamo使用指南.md` | Mixamo 動畫下載與整合 |

## 工具腳本索引

| 腳本 | 用途 | 使用方式 |
|------|------|----------|
| `scripts/fbx_to_glb.py` | FBX→GLB 批次轉換（Blender Python） | `blender --background --python scripts/fbx_to_glb.py` |
| `scripts/convert_models.ps1` | 上述腳本的 PowerShell 包裝器 | `.\scripts\convert_models.ps1` |
| `scripts/generate_thumbnails.js` | 角色大頭照生成（Puppeteer） | `node scripts/generate_thumbnails.js` |
