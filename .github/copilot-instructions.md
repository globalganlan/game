# Copilot 專案指引 — GlobalGanLan

> 本檔案在每次新對話時自動載入，確保 AI 助手保有專案知識。
> 詳細知識點請參閱 `docs/Three.js場景與模型整合筆記.md`。

## ❗ 強制規則（每次任務必讀）

1. **使用者只提需求，AI 團隊負責全部實現**（前端/後端/GAS/部署/測試）。絕對不要要求使用者手動操作。
2. **完成功能後必須執行完整測試**，確認遊戲可正常運行再回報完成：
   - `npx tsc --noEmit`（零錯誤）
   - `npx vite build`（編譯成功）
   - API 端點測試（若有改 GAS）
   - 確認遊戲流程不會壞：登入 → 載入 → 選英雄 → 戰鬥 → 結果 → 重啟
   - 有 bug 就修，不能把壞掉的狀態交給使用者
3. **GAS 修改後自行部署**：改 `gas/程式碼.js` → `clasp push` → `clasp deploy -i <ID>`
4. **Google Sheets 中文亂碼防護**：每次新增（createSheet）、修改（updateSheet / appendRows）、或讀取（readSheet）Google Sheet 時，必須做以下檢查：
   - **寫入前**：POST body 必須使用 `[System.Text.Encoding]::UTF8.GetBytes()` 編碼，ContentType 為 `text/plain; charset=utf-8`
   - **寫入後**：立即用 GET API 讀回資料，抽樣檢查中文欄位是否正確（不可含 `?`、方塊字亂碼如 `撣賊`、`銋`、`璉格` 等）
   - **發現亂碼**：立即修正 — deleteSheet → createSheet 重建正確資料
   - **日期自動轉換防護**：含 `X-Y` 格式的欄位（如 stageId "1-1"）必須在 createSheet 時使用 `textColumns` 參數，GAS 會對該欄設 `setNumberFormat('@')` 防止自動轉為日期
   - **根因**：PowerShell `ConvertTo-Json` 在 Windows Big5 環境下可能產生編碼錯誤，務必用 `UTF8.GetBytes()` 確保 UTF-8

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
- **Google Sheets 寫入後必須驗證中文不是亂碼**（讀回抽查），發現亂碼立即 deleteSheet → createSheet 修復
- **stageId "1-1" 格式會被 Sheets 自動轉日期** — createSheet 時用 `textColumns:["stageId"]` 參數防護

## 效能原則

- 只渲染鏡頭可視範圍（fog 外的幾何體是浪費）
- 修改場景時先決定 fog far → 其他元素 spread/area ≤ fog far
- mobile DPR 限 `[1, 1.5]`，desktop `[1, 2]`

## Google Sheets 讀寫能力

本專案以 Google Sheets 作為後端資料庫，AI 可直接讀寫。

- **讀取（GET）**：`https://script.google.com/macros/s/AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw/exec`
- **寫入（POST）**：`https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec`

### 寫入格式（POST JSON）

```json
{
  "action": "updateHeroes",
  "newColumns": ["DEF", "CritRate"],
  "data": [
    { "HeroID": 1, "DEF": 15, "CritRate": 5 }
  ]
}
```

### PowerShell 範例

```powershell
$url = "https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec"
$body = @{ action="updateHeroes"; newColumns=@("NewCol"); data=@(@{HeroID=1; NewCol="value"}) } | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri $url -Method Post -ContentType "text/plain; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

- 回傳 `{ "success": true, "updated": N }` 表示成功
- `newColumns` 會自動在 Sheet 建立不存在的欄位
- `data` 陣列中每個物件以 `HeroID` 為 key 定位行，其餘欄位直接寫入對應欄
- **當需要更新 Google Sheet 時，直接用 PowerShell POST，不需要請使用者手動操作**

## Apps Script 部署能力（clasp）

**AI 團隊可自行修改 GAS 程式碼並部署，不需要使用者介入。**

- **GAS 原始碼**：`gas/程式碼.js`（完整 doGet + doPost + 所有 handler）
- **clasp 設定**：`gas/.clasp.json`（scriptId: `1nTjW3rZftAlH3XcbYvg3fP5nrm3TeAkEXFpWDmdcRqbgKEm6HQg7BU5J`）
- **已登入**：`~/.clasprc.json` 存在，Apps Script API 已啟用

### 部署流程

```powershell
# 1. 修改 gas/程式碼.js
# 2. Push + 更新現有部署
Push-Location d:\GlobalGanLan\gas
npx @google/clasp push
npx @google/clasp deploy -i "AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg" --description "描述"
npx @google/clasp deploy -i "AKfycbxXdy3QCvgX7knCCnxfmVY0CMqmUgcG422nVgFDlx5l9CsyldFZ4bwLVHPHxbtXp0LaTw" --description "描述"
Pop-Location
```

### 重要原則

- **使用者只負責提需求，AI 團隊負責全部實現（前端、後端、GAS、部署、測試）**
- 需要新增 GAS API → 直接改 `gas/程式碼.js` 的 doPost switch-case + 加 handler → clasp push + deploy
- 需要改 Google Sheet 結構 → 用 POST API（createSheet / updateSheet / appendRows）
- **絕對不要要求使用者手動貼程式碼、手動部署、或手動操作 Google Sheet**

## AI 團隊調度

- **調度中心**：`agents/README.md` — 自動分析需求、分配角色、各司其職
- **規格系統**：`specs/README.md` — 模組化遊戲規格，可擴展、有版本、有衝突偵測
- **記憶系統**：`memory/` — 跨對話持久化（changelog / decisions / dev-status / backlog）
- **提示詞模板**：`agents/prompt-playbook.md` — 7 套常用提示詞（P-01~P-07），已標注對應角色
- 收到需求時先讀取 `agents/README.md` 的調度規則，自動判斷要啟動哪些角色
- 新對話啟動時先讀取 `memory/dev-status.md` + `specs/README.md` 恢復記憶
- 各角色的專業提示詞：`agents/01~11-*.md`（11 位角色）

## 文件索引

| 文件 | 內容 |
|------|------|
| `agents/README.md` | AI 團隊自動調度系統（11 位角色的路由與協作規則） |
| `specs/README.md` | 遊戲規格總索引（模組化 spec 清單、格式規範、衝突處理流程） |
| `memory/README.md` | 記憶持久化機制說明 |
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
| `scripts/update_heroes_sheet.gs` | Google Sheet heroes 表結構更新 | 貼入 Apps Script 執行（或用 POST API） |
