# FBX → GLB 批次轉換與壓縮指南

> 本文件說明如何將 FBX 模型批次轉換為 Draco 壓縮的 GLB，以及前端如何載入。

## 1. 概述

專案的 3D 模型來源是 FBX 格式（Mixamo 骨骼動畫），但 FBX 檔案體積巨大且 Three.js 的 FBXLoader 有諸多限制。
因此我們建立了一套 **Blender 背景批次轉換** 流程：

| 階段      | 格式 | 總大小 | Loader |
|-----------|------|--------|--------|
| 原始      | FBX  | ~737 MB | FBXLoader |
| 轉換後    | GLB (Draco + JPEG) | ~29 MB | GLTFLoader + DRACOLoader |
| **壓縮率** |      | **-96%** | |

## 2. 檔案結構

### 2.1 腳本

| 檔案 | 說明 |
|------|------|
| `scripts/fbx_to_glb.py` | Blender Python 主腳本 — FBX 匯入、Decimate、貼圖縮放、GLB 匯出 |
| `scripts/convert_models.ps1` | PowerShell 包裝器 — 自動偵測 Blender 路徑並呼叫主腳本 |

### 2.2 輸出結構

每個 zombie 資料夾轉換後會產生 6 個 GLB：

```
public/models/zombie_X/
├── idle.fbx              ← 原始 FBX（保留不刪）
├── attack.fbx
├── hurt.fbx
├── dying.fbx
├── run.fbx
├── zombie_X.glb          ← Mesh + 骨架 (Draco 壓縮 + JPEG 貼圖)
├── zombie_X_idle.glb     ← 動畫 only（無幾何體，~100-170 KB）
├── zombie_X_attack.glb   ← 動畫 only
├── zombie_X_hurt.glb     ← 動畫 only
├── zombie_X_dying.glb    ← 動畫 only
└── zombie_X_run.glb      ← 動畫 only（跑步，用於前進/後退）
```

### 2.3 前端載入器

| 檔案 | 說明 |
|------|------|
| `src/loaders/glbLoader.ts` | GLTFLoader + DRACOLoader 載入器，含全域快取與 Suspense 整合 |
| `public/draco/` | 本地 Draco WASM 解碼器（從 `three/examples/jsm/libs/draco/gltf/` 複製而來） |

## 3. 使用方式

### 3.1 前置需求

- **Blender 3.6+**（內建 glTF exporter 含 Draco 支援）
- 本專案在 `D:\Blender\blender.exe` 安裝 Blender 5.0.1（透過 `winget install BlenderFoundation.Blender`）

### 3.2 轉換所有 zombie

```powershell
# 方法一：PowerShell 包裝器（自動找 Blender）
.\scripts\convert_models.ps1

# 方法二：直接呼叫 Blender
& "D:\Blender\blender.exe" --background --python scripts/fbx_to_glb.py
```

### 3.3 轉換單一 zombie

```powershell
# PowerShell 包裝器
.\scripts\convert_models.ps1 -Only zombie_6

# 直接呼叫
& "D:\Blender\blender.exe" --background --python scripts/fbx_to_glb.py -- --only zombie_6
```

### 3.4 其他參數

```powershell
# 自訂模型目錄
.\scripts\convert_models.ps1 -Only zombie_1 -OutputDir "D:\output"

# 停用 Draco
.\scripts\convert_models.ps1 -NoDraco

# 指定從哪個 FBX 取 Mesh（預設 idle）
.\scripts\convert_models.ps1 -MeshFrom "attack"

# 轉換成功後刪除原始 FBX 檔案（釋放磁碟空間）
.\scripts\convert_models.ps1 -CleanFbx
```

## 4. 轉換流程技術細節

### 4.1 FBX 匯入

```python
bpy.ops.import_scene.fbx(
    filepath=fbx_path,
    use_anim=True,
    ignore_leaf_bones=False,
    automatic_bone_orientation=True,
    global_scale=100.0,  # 抵消 FBX cm→m 的 0.01 縮放
)
```

**關鍵**：`global_scale=100.0` 是必要的。FBX 匯入器自動在 Armature 上套用 `scale=0.01`（cm→m 單位轉換），
`GLTFLoader` 不像 `FBXLoader` 會自動處理這個縮放，所以必須在匯入時用 `global_scale=100` 抵消。

### 4.2 面數最佳化（Decimate）

- 門檻：`MAX_TOTAL_FACES = 15,000`（其他 zombie 最高 ~12K）
- 超過門檻時自動套用 `Decimate Modifier`（COLLAPSE 模式）
- 為 SkinnedMesh 骨骼權重限制預留 0.8× 裕度
- 範例：zombie_6 從 25,040 → 16,679 faces（-33%）

### 4.3 貼圖最佳化

- **解析度上限**：`MAX_TEXTURE_SIZE = 2048`（zombie_6 原本 8 張 4096² → 2048²）
- **格式**：匯出為 JPEG（quality=85），大幅縮小貼圖體積
- 範例：zombie_6 從 113 MB → 3.46 MB

### 4.4 Draco 壓縮參數

```python
export_draco_mesh_compression_level = 6
export_draco_position_quantization  = 14
export_draco_normal_quantization    = 10
export_draco_texcoord_quantization  = 12
```

### 4.5 Mesh GLB vs Animation GLB

| | Mesh GLB | Animation GLB |
|---|---|---|
| 內容 | 幾何體 + 骨架 + 材質/貼圖 | 只有 Armature + AnimationClip |
| Draco | ✅ | ❌（無幾何體） |
| 大小 | 1~7 MB | 65~175 KB |
| 動畫 | 移除 | 保留 |
| Mesh | 保留 | 移除 |

## 5. 前端載入架構

### 5.1 glbLoader.ts

```typescript
// Draco 解碼器使用本地 WASM（public/draco/）
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
dracoLoader.setDecoderConfig({ type: 'wasm' })

const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)
```

- `loadGlbShared(url)`: 非同步載入，結果存入全域 Map 快取
- `getGlbForSuspense(url)`: Suspense 整合，已快取就回傳，否則 throw Promise

### 5.2 ZombieModel.tsx 載入方式

```typescript
// 載入 1 個 Mesh GLB + 5 個 Animation GLB
const meshAsset  = getGlbForSuspense(`${folder}/${zombieId}.glb`)
const idleAnim   = getGlbForSuspense(`${folder}/${zombieId}_idle.glb`)
const attackAnim = getGlbForSuspense(`${folder}/${zombieId}_attack.glb`)
const hurtAnim   = getGlbForSuspense(`${folder}/${zombieId}_hurt.glb`)
const dyingAnim  = getGlbForSuspense(`${folder}/${zombieId}_dying.glb`)
const runAnim    = getGlbForSuspense(`${folder}/${zombieId}_run.glb`)
```

### 5.3 重要注意：Bbox 高度沿 Z 軸

GLB 模型的 Armature 保留了 Blender 的 Z-up 座標系（帶 90°X 旋轉），
因此 `Box3.setFromObject()` 量到的站立高度在 **Z 軸**而非 Y 軸：

```typescript
const bbox = new THREE.Box3().setFromObject(cloned)
const height = bbox.max.z - bbox.min.z  // ⚠ 是 Z 不是 Y
const modelScale = height > 0 ? 2.5 / height : 1
```

### 5.4 Draco 解碼器本地化

Draco WASM 檔案放在 `public/draco/`，包含：
- `draco_decoder.js`
- `draco_decoder.wasm`
- `draco_encoder.js`
- `draco_wasm_wrapper.js`

來源：`node_modules/three/examples/jsm/libs/draco/gltf/`

> 不可使用 CDN（gstatic.com），因為部分環境無法連線。

## 6. 新增 zombie 的完整流程

1. 在 `public/models/zombie_N/` 放入 5 個 FBX：`idle.fbx`、`attack.fbx`、`hurt.fbx`、`dying.fbx`、`run.fbx`
2. 執行轉換：
   ```powershell
   .\scripts\convert_models.ps1 -Only zombie_N
   ```
3. 產生大頭照（見 `docs/大頭照生成指南.md`）
4. 前端 `App.tsx` 的 `ZOMBIE_IDS` 陣列加入新 ID
5. 完成 — `ZombieModel.tsx` 會自動根據 ID 載入對應 GLB

## 7. 常見問題

### Q: 模型太大 / 太小
FBX 匯入的 `global_scale` 沒設對。必須是 `100.0` 來抵消 Blender 的 cm→m 0.01 縮放。

### Q: 模型看不見
1. 檢查 `public/draco/` 是否存在 WASM 檔案
2. 檢查 DevTools Network — Draco 解碼器載入是否 404
3. 確認 Vite base path 一致（`vite.config.js` 的 `base: '/game/'`）

### Q: 模型沉入地面
`global_scale` 和動畫 keyframe 不同步。不要手動 `apply_all_transforms()`，
應使用 `global_scale=100.0` 讓 Blender 在匯入時同時縮放頂點和動畫。

### Q: 動畫播放異常（T-pose 閃現）
- 切換動畫必須用 `crossFadeTo()`，不可 `stop()→play()`
- HURT / DEAD 例外：需要 `reset() + fadeOut()` 強制覆蓋

### Q: Blender 找不到
- 安裝：`winget install BlenderFoundation.Blender`
- 或手動指定路徑：`.\scripts\convert_models.ps1 -BlenderPath "C:\path\to\blender.exe"`

## 8. 各 zombie 轉換結果參考

| Zombie | 面數 | 貼圖 | 原始 FBX | 轉換後 GLB | 備註 |
|--------|------|------|----------|-----------|------|
| zombie_1 | 3,996 | 8× 2048² | ~62 MB | 6.38 MB | |
| zombie_2 | 6,994 | 2× 2048² | ~76 MB | 1.81 MB | |
| zombie_3 | 12,626 | 3× 2048² | ~40 MB | 1.04 MB | |
| zombie_4 | 12,486 | 6× 2048² | ~62 MB | 6.65 MB | |
| zombie_5 | 5,628 | 5× 2048² | ~62 MB | 6.46 MB | |
| zombie_6 | 25,040→16.7K | 8× 4096²→2048² | ~435 MB | 3.46 MB | 自動 Decimate + 縮圖 |
| **合計** | | | **~737 MB** | **~29 MB** | **-96%** |
