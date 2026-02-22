# Three.js 場景與模型整合知識筆記

> 本文件記錄 React Three Fiber (R3F) 專案中，FBX 動畫載入、頂點色彩轉移、場景佈置、鏡頭控制等實作過程中遇到的關鍵知識點與注意事項。

---

## 🤖 AI 上下文提示（新對話請先讀此區塊）

> **專案**：D:\GlobalGanLan — 3D 喪屍對戰競技場（React + Three.js / R3F）
>
> **核心架構**（全在 `src/App.jsx` 單一檔案）：
> - OBJ（TripoSR 頂點色彩）+ FBX（Mixamo 骨骼動畫），用 `SkeletonUtils.clone()` 克隆
> - 動畫切換用 `crossFadeTo()`，不可用 `stop()→play()`（會 bind-pose 閃現）
> - 程序化廢墟 Debris（5 種幾何 + hash 噪波位移 + flatShading）— **80 個，spread 35**
> - 程序化地面（**60×60, 64×64** PlaneGeometry + edgeFade 中心壓平）
> - 雨粒子用 `LineSegments`（不是 Points），**1200 條，area 30**，傾斜落下
> - Sparkles **80 個，scale 20**
> - 過場幕 `TransitionOverlay`：初載 + 重啟時遮蔽不合理畫面
> - Sky：`sunPosition.y < 0` + 低 rayleigh + 高 turbidity = 暗天
> - fog `['#1a0e06', 8, 35]` — 近霧 8, 遠霧 35（配合縮小後的場地）
> - 鏡頭 `[0,3,10]` 注視 `[0,1.5,0]`，OrbitControls 全禁用
> - RWD：`useResponsive()` hook 偵測 mobile/tablet/desktop + 直式/橫式
> - CSS 全在 `src/App.css`，**必須在 App.jsx 內 `import './App.css'`**
>
> **效能原則**：
> - 場景只渲染鏡頭可見範圍（fog 外不需要幾何體）
> - 修改場景大小時，ground / debris / rain / sparkles / fog 五者必須連動
>
> **關鍵陷阱**：
> - `idle.clone()` ≠ `SkeletonUtils.clone(idle)`（SkinnedMesh 必用後者）
> - `pointsMaterial` 只能渲染方塊，雨用 `lineSegments` + `LineBasicMaterial`
> - PlaneGeometry 的 X/Y → 世界 X/Z，Z → 世界 Y（高度）
> - Debris Y 要 `scale.y * 0.5`，否則漂浮
> - resetGame 必須先拉起過場幕 → 等不透明 → 重置狀態 → 收幕
> - **`import './App.css'` 不可漏掉**，否則全部 HUD/按鈕樣式消失

---

## 目錄
1. [FBX + OBJ 頂點色彩整合](#1-fbx--obj-頂點色彩整合)
2. [SkeletonUtils.clone 正確克隆 SkinnedMesh](#2-skeletonutilsclone-正確克隆-skinnedmesh)
3. [動畫切換：crossFadeTo 避免 bind-pose 閃現](#3-動畫切換crossfadeto-避免-bind-pose-閃現)
4. [模型定位與朝向](#4-模型定位與朝向)
5. [程序化 Debris（廢墟碎石）生成](#5-程序化-debris廢墟碎石生成)
6. [程序化地面（廢土地形）](#6-程序化地面廢土地形)
7. [鏡頭鎖定與排除區設計](#7-鏡頭鎖定與排除區設計)
8. [遊戲邏輯注意事項](#8-遊戲邏輯注意事項)
9. [過場幕 TransitionOverlay](#9-過場幕-transitionoverlay)
10. [雨粒子效果（LineSegments）](#10-雨粒子效果linesegments)
11. [天空氛圍調整（Sky 組件）](#11-天空氛圍調整sky-組件)
12. [效能優化：戰場範圍縮減](#12-效能優化戰場範圍縮減)
13. [RWD 響應式與 CSS 注意事項](#13-rwd-響應式與-css-注意事項)

---

## 1. FBX + OBJ 頂點色彩整合

### 背景
- TripoSR 生成的 OBJ 檔有**嵌入式頂點色彩**（每行 `v x y z r g b`）
- Mixamo 下載的 FBX 有**骨骼動畫**但**沒有顏色**
- 兩者來自同一個 mesh，**頂點數完全一致**

### 做法：1:1 索引複製
```javascript
function transferVertexColors(fbxScene, objModel) {
  const objColors = []
  objModel.traverse((child) => {
    if (child.isMesh && child.geometry.attributes.color)
      objColors.push(child.geometry.attributes.color)
  })

  let colorIdx = 0
  fbxScene.traverse((child) => {
    if (!(child.isMesh || child.isSkinnedMesh)) return
    const fbxPos = child.geometry.attributes.position
    if (!fbxPos || colorIdx >= objColors.length) return

    const objCol = objColors[colorIdx]
    const count = Math.min(fbxPos.count, objCol.count)
    const colors = new Float32Array(fbxPos.count * 3)

    for (let i = 0; i < count; i++) {
      colors[i * 3]     = objCol.getX(i)
      colors[i * 3 + 1] = objCol.getY(i)
      colors[i * 3 + 2] = objCol.getZ(i)
    }

    child.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    child.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
    colorIdx++
  })
}
```

### ⚠️ 注意
- 只有 OBJ 和 FBX 來自**同一個 mesh**（頂點數相同）才能 1:1 複製
- 如果頂點數不同，需要用 **nearest-neighbor 匹配**（較慢且可能不準）
- Material 必須設 `vertexColors: true`，否則顏色不會顯示
- 記得 `child.isSkinnedMesh` 也要檢查，FBX 裡的 mesh 是 SkinnedMesh 不是普通 Mesh

---

## 2. SkeletonUtils.clone 正確克隆 SkinnedMesh

### 問題
```javascript
// ❌ 錯誤做法
const cloned = idle.clone()
```
`Object3D.clone()` 對 SkinnedMesh 只做淺拷貝，多個實例會**共享同一個 Skeleton**，導致：
- 兩個角色動作同步（控制一個，另一個也動）
- 位置擠在一起

### 正確做法
```javascript
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'

const cloned = SkeletonUtils.clone(idle)
```
`SkeletonUtils.clone()` 會：
- 深拷貝 SkinnedMesh
- 重建獨立的 Skeleton 和 Bone 層級
- 正確重綁 `bindMatrix` 和 `bindMatrixInverse`

### ⚠️ 注意
- 需要 `import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'`
- 必須在 `useMemo` 內執行，避免每次 render 重新克隆

---

## 3. 動畫切換：crossFadeTo 避免 bind-pose 閃現

### 問題：stop() → play() 會閃一下
```javascript
// ❌ 會出現 bind-pose 閃現（角色瞬間回到 T-pose 再跳到新動畫）
oldAction.stop()
newAction.reset().fadeIn(0.2).play()
```

### 正確做法：crossFadeTo
```javascript
if (prevActionRef.current && prevActionRef.current !== newAction) {
  newAction.reset()
  prevActionRef.current.crossFadeTo(newAction, 0.2, true)
  newAction.play()
} else {
  // 第一次播放，直接 play
  newAction.reset().fadeIn(0.2).play()
}

prevActionRef.current = newAction
```

### 原理
- `crossFadeTo()` 會同時混合舊動畫權重→0 和新動畫權重→1
- 過渡期間兩個動畫同時作用，不會出現 bind-pose 中間狀態
- 第三個參數 `true` 表示自動在交叉淡入完成後停止舊動畫

### 死亡動畫特殊處理
```javascript
if (state === 'DEAD') {
  newAction.setLoop(THREE.LoopOnce, 1)
  newAction.clampWhenFinished = true  // 停在最後一幀
}
```

---

## 4. 模型定位與朝向

### 動態縮放（統一角色高度）
```javascript
const bbox = new THREE.Box3().setFromObject(cloned)
const height = bbox.max.y - bbox.min.y
const scale = height > 0 ? 2.5 / height : 1
```

### Mixamo 模型朝向
- Mixamo 預設面朝 **+Z 方向**
- 玩家在左邊 (x=-3.5)，要面朝右 → `rotation.y = +π/2`
- 敵人在右邊 (x=3.5)，要面朝左 → `rotation.y = -π/2`

```javascript
rotation={[0, isPlayer ? Math.PI / 2 : -Math.PI / 2, 0]}
```

### ⚠️ 注意：不需要手動 yOffset
Mixamo 骨骼的 Hips 位置已經正確定位模型站在地面上（y≈0.5），不要額外加 `position.y = -bbox.min.y * scale` 之類的偏移，否則會浮空。

---

## 5. 程序化 Debris（廢墟碎石）生成

### 五種幾何形狀
| 類型 | 幾何體 | 適合用途 | 色調建議 |
|------|--------|----------|----------|
| `slab` | BoxGeometry (高細分) | 混凝土板、牆壁殘片 | 水泥灰 `#8a8078` |
| `pillar` | CylinderGeometry (上窄下寬) | 斷裂柱子 | 混凝土灰 `#707068` |
| `rock` | DodecahedronGeometry | 碎石堆 | 岩石灰褐 `#605848` |
| `chunk` | TetrahedronGeometry | 不規則碎塊 | 紅褐色 `#8b4513` |
| `rebar` | CylinderGeometry (極細) | 鏽蝕鋼筋 | 鏽橘色 `#b87333` |

### 關鍵技術：頂點位移 + hash 噪波

```javascript
// hash 函數：讓相鄰頂點有連貫的位移（不是純隨機）
const hash = (x, y, z) => {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return h - Math.floor(h)
}

// 沿法線方向位移 → 凹凸起伏
const noiseVal = (hash(px * 3, py * 3, pz * 3) - 0.5) * 2
const disp = noiseVal * strength
pos.setXYZ(i, px + nx * disp, py + ny * disp, pz + nz * disp)
```

### 為什麼沿法線方向位移？
- 純隨機位移（`pos += random`）會讓幾何體「散開」，看起來像 bug
- 沿法線方向位移只改變表面的凹凸，保持整體輪廓不變
- 配合 `flatShading: true`，每個面變得有稜角，像破碎的混凝土

### 頂點色多層噪波
```javascript
const coarse = hash(px * 1.5, py * 1.5, pz * 1.5)   // 大範圍明暗斑塊
const fine   = hash(px * 8, py * 8, pz * 8)           // 細紋理
const v = 0.45 + coarse * 0.35 + fine * 0.2

// 色相偏移（鏽蝕/苔蘚效果）
const hueShift = (hash(px * 5.3, pz * 5.3, py * 2.1) - 0.5) * 0.08
```

### ⚠️ 注意事項
1. **幾何細分要足夠**：`subdivision=2` 或 `segments=6` 以上，否則位移效果不明顯
2. **位移後必須 `computeVertexNormals()`**：否則光照計算會用舊的法線，陰影不對
3. **記得 `castShadow` 和 `receiveShadow`**：debris 要能投射和接收陰影才有立體感
4. **每種類型用不同色票**：如果所有 debris 都用相同棕色，遠看分辨不出來

### Y 軸定位：底部貼地
```javascript
// 幾何體中心在原點，底部 = -0.5*height
// 所以 position.y = scale.y * 0.5 才能讓底部貼在 y=0
const baseY = sy * 0.5
// 地面碎石略微嵌入地表，更自然
const groundY = baseY * 0.6 - 0.05
```

### ⚠️ 常見錯誤：Debris 飄在空中
- 原因：Y 座標用了固定值（如 `y: 2`）而非根據 scale 計算
- 解法：`position.y = scale.y * 0.5`

---

## 6. 程序化地面（廢土地形）

### 做法：高細分 PlaneGeometry + 頂點位移 + 頂點色
```javascript
// 只需覆蓋鏡頭可視範圍（fog 遠端 35 單位），60×60 足夠
const geo = new THREE.PlaneGeometry(60, 60, 64, 64)
```

### 戰場中心壓平
角色活動區域不能有地面起伏，否則動畫時會被遮住：
```javascript
const distX = Math.abs(px), distZ = Math.abs(py)  // PlaneGeometry 的 XY 就是世界的 XZ
const inArena = distX < 12 && distZ < 8
const edgeFade = inArena ? 0 : Math.min(1, (Math.max(distX - 12, distZ - 8, 0)) / 5)

pos.setZ(i, (n1 + n2 + n3) * edgeFade)  // 中心 = 0，外圍漸進到完整起伏
```

### 地面色調
- 基底色要夠深，否則在暗色場景中會「亮得不協調」
- 多層噪波混色：大斑塊明暗 + 細節紋理 + 隨機深色污漬
- `flatShading: true` 讓地面有粗糙泥土感

### ⚠️ 注意
- PlaneGeometry 預設在 XY 平面，需要 `rotation={[-Math.PI / 2, 0, 0]}` 轉到 XZ
- PlaneGeometry 的 `position` 屬性中，X/Y 對應世界的 X/Z，Z 對應世界的 Y（高度）
- 移除 `gridHelper` 後記得確認場景還有足夠的空間參考感（fog + debris 可以代替）

---

## 7. 鏡頭鎖定與排除區設計

### 鏡頭設定
```javascript
<Canvas camera={{ position: [0, 3, 10], fov: 45 }} shadows>
  <OrbitControls
    target={[0, 1.5, 0]}
    enableRotate={false}
    enablePan={false}
    enableZoom={false}
  />
```

### 鏡頭參數意義
| 參數 | 值 | 說明 |
|------|-----|------|
| position | `[0, 3, 10]` | 正前方偏高，俯瞰戰場 |
| target | `[0, 1.5, 0]` | 注視角色身體中心（非頭頂） |
| fov | `45` | 較窄視角，減少透視變形 |

### Debris 排除區
排除區 = 鏡頭可視範圍 + 一點餘裕，確保 debris 不遮擋角色：

```javascript
// 鏡頭在 z=10，角色在 z=0, x=±3.5（攻擊時到 ±7.5）
if (Math.abs(x) < 10 && z > -5 && z < 13) continue
```

- `|x| < 10`：比攻擊最遠位置（±7.5）多 2.5 單位
- `z > -5`：角色後方 5 單位
- `z < 13`：鏡頭位置（z=10）再多 3 單位

### ⚠️ 鏡頭與排除區必須配合調整
如果修改了鏡頭位置或 FOV，debris 排除區也要跟著改，否則：
- 排除區太小 → debris 擋住角色
- 排除區太大 → 場景空蕩蕩，沒有廢墟感

### 偵錯技巧：每秒刷新 debris
開發時可以暫時加上定時重新生成，觀察不同佈局效果：
```javascript
const [seed, setSeed] = useState(0)
useEffect(() => {
  const id = setInterval(() => setSeed(s => s + 1), 1000)
  return () => clearInterval(id)
}, [])

const debris = useMemo(() => { /* ... */ }, [seed])
```
確認效果後記得移除。

---

## 8. 遊戲邏輯注意事項

### 重置遊戲不要用 window.location.reload()
- 頁面重載會重新下載所有 FBX/OBJ 模型（幾 MB）
- 正確做法：重置所有 state，且**用過場幕包裹**（見第 9 節）

```javascript
const resetGame = () => {
  // 1. 先拉起過場幕（遮蔽死亡→idle 的不合理切換）
  setCurtainVisible(true)
  setCurtainFading(false)
  setCurtainText('重新啟動循環...')

  // 2. 幕完全不透明後再重置狀態
  setTimeout(() => {
    setGameState('FETCHING')
    setTurn(0)
    setPlayerDamage([])
    setEnemyDamage([])
    fetchData.current().finally(() => {
      // 3. 等 crossFade 動畫完成後再收幕
      setTimeout(() => {
        setCurtainFading(true)
        setTimeout(() => setCurtainVisible(false), 1000)
      }, 800)
    })
  }, 600)
}
```

### ⚠️ 時序很重要
- 600ms：確保幕完全不透明才開始重置
- 800ms：fetch 回來後等 crossFade 完成（DEAD→IDLE 平滑過渡）
- 1000ms：`curtainFadeOut` CSS 動畫長度

### 速度倍率用 useRef 避免閉包陷阱
`runBattleStep` 是 async 函數，如果直接讀 `speed` state，會讀到**發起時的舊值**：

```javascript
const speedRef = useRef(1)
useEffect(() => { speedRef.current = speed }, [speed])

// 在 async 函數中用 ref
const delay = (ms) => new Promise(r => setTimeout(r, ms / speedRef.current))
```

### Billboard 位置要高於模型
- 模型高度 2.5 單位
- 名字 Billboard: `y = 3.5`（模型頂 + 1）
- 傷害數字: `y = 4.5`（名字之上）

---

## 9. 過場幕 TransitionOverlay

### 背景
模型載入和重置遊戲時，會出現不合理的畫面：
- **初載**：模型尚未 render → 空場景、模型突然出現
- **重啟**：喪屍從死亡倒地姿態瞬間跳回站立

### 架構
```
TransitionOverlay（HTML overlay, z-index: 100）
  ├── 背景（radial-gradient 暗紅→黑）
  ├── CRT 掃描線（repeating-linear-gradient 4px 間距）
  ├── 移動掃描光條（scanDown 3s 動畫，上→下）
  ├── 暗角（radial-gradient vignette）
  ├── 閃爍文字（textFlicker 2s 動畫）
  └── 載入條（loadingSlide 1.5s 動畫）
```

### 狀態管理
```javascript
const [curtainVisible, setCurtainVisible] = useState(true)   // 整體顯示/隱藏
const [curtainFading, setCurtainFading] = useState(false)     // 正在淡出中
const [curtainText, setCurtainText] = useState('掃描倖存者中...')
```

### 初載流程
1. `curtainVisible = true`（一開始就蓋住）
2. 每個 `ZombieModel` mount 時呼叫 `onReady`
3. 兩個模型都 ready → 等 500ms → `setCurtainFading(true)` → 1s CSS 淡出 → `setCurtainVisible(false)`
4. **安全閥**：8 秒內未就緒 → 強制收起

```javascript
useEffect(() => { if (onReady) onReady() }, [])  // 在 ZombieModel 內
```

### 重啟流程
1. 按「重啟循環」→ 立刻 `setCurtainVisible(true)`, `setCurtainFading(false)`
2. 600ms 後（確保幕不透明）→ 重置 state + re-fetch
3. fetch 完成 → 800ms（等 crossFade）→ 淡出收幕

### CSS 動畫（在 App.css）
```css
@keyframes curtainFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes textFlicker { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } 92% { opacity: 1; } 94% { opacity: 0.2; } 96% { opacity: 1; } }
@keyframes loadingSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
@keyframes scanDown { 0% { transform: translateY(-120px); } 100% { transform: translateY(100vh); } }
```

### ⚠️ 注意
- `pointerEvents: fading ? 'none' : 'auto'` — 淡出時不要擋住底下的按鈕
- `opacity` 用 CSS `animation` 控制而非 React state，避免每幀重新渲染
- 安全閥 8 秒是為了防止網路超慢時使用者永遠看到黑幕

---

## 10. 雨粒子效果（LineSegments）

### 為什麼不用 Points？
`PointsMaterial` 只能渲染**方形點**（`size` 控制大小），無法做出細長雨絲。

| 方案 | 渲染 | 形狀 | 效能 |
|------|------|------|------|
| `Points` + `PointsMaterial` | 方形粒子 | ❌ 正方形 | 好 |
| `LineSegments` + `LineBasicMaterial` | 線段 | ✅ 細長雨絲 | 好 |
| `InstancedMesh` + 長方體 | 3D mesh | ✅ 但過重 | 差 |

### 架構：每條雨絲 = 2 個頂點
```javascript
// count 條雨絲 × 2 端點 × 3 分量 (xyz)
const pos = new Float32Array(count * 2 * 3)

// 第 i 條雨絲的索引
const bi = i * 6
pos[bi], pos[bi+1], pos[bi+2]       // 上端
pos[bi+3], pos[bi+4], pos[bi+5]     // 下端
```

### 傾斜角度 = 風速 / 落速
```javascript
const windX = 4, windZ = -1.5, speed = 14
// 雨絲方向向量 ≈ (windX/speed, -1, windZ/speed)
// 視覺傾斜角 ≈ atan(4/14) ≈ 16°
const dx = (windX / speed) * streakLen
const dz = (windZ / speed) * streakLen
pos[bi + 3] = x + dx   // 下端 X 偏移
pos[bi + 5] = z + dz   // 下端 Z 偏移
```

### useFrame 動畫邏輯
```javascript
useFrame((_, delta) => {
  const dy = speed * delta
  const dx = windX * delta
  const dz = windZ * delta
  for (let i = 0; i < count; i++) {
    const bi = i * 6
    // 兩端同時移動（保持雨絲形狀不變）
    pos[bi] += dx;  pos[bi+1] -= dy * velocities[i];  pos[bi+2] += dz
    pos[bi+3] += dx; pos[bi+4] -= dy * velocities[i]; pos[bi+5] += dz
    // 觸地重置到頂部
    if (pos[bi + 1] < -0.5) { /* 重新隨機生成位置 */ }
  }
  geometry.attributes.position.needsUpdate = true  // ← 必須！
})
```

### Material 設定
```javascript
new THREE.LineBasicMaterial({
  color: '#99aabb',        // 冷色調灰藍
  transparent: true,
  opacity: 0.35,           // 半透明
  depthWrite: false,       // 不寫深度 → 不遮擋後面的物體
  blending: THREE.AdditiveBlending,  // 加法混合 → 亮處更亮
})
```

### ⚠️ 注意
1. **`needsUpdate = true`**：修改 BufferAttribute 後必須設定，否則 GPU 不會更新
2. **`depthWrite: false`**：雨透明粒子寫入深度會遮擋後方物體，造成黑色方塊
3. **兩端必須同步移動**：如果只移動上端不移動下端，雨絲會越來越長
4. **`velocities` 用 `useMemo` 預計算**：在 `useFrame` 裡 `Math.random()` 每幀不同 → 速度不穩定
5. **與 fog 配合**：60 單位外的雨自然消失，不需要額外裁剪

---

## 11. 天空氛圍調整（Sky 組件）

### drei `<Sky>` 參數速查
| 參數 | 作用 | 亮天值 | 暗天值（本專案） |
|------|------|--------|------------------|
| `sunPosition` | 太陽方向向量 | `[0, 1, 0]` | `[0, -0.15, 0]` |
| `rayleigh` | 大氣散射強度（越高越藍/橘） | `2~6` | `0.2` |
| `turbidity` | 渾濁度（雲霧/灰塵感） | `1~5` | `20` |
| `inclination` | 太陽仰角（0=地平線） | — | `0`（配合 sunPosition） |
| `azimuth` | 太陽方位角 | — | `1.25` |

### 如何讓天空更暗？
```jsx
// 暗天配方：太陽在地平線下 + 低散射 + 高渾濁
<Sky
  sunPosition={[0, -0.15, 0]}  // y < 0 → 太陽在地平線以下
  rayleigh={0.2}                // 極低散射 → 天空不亮
  turbidity={20}                // 高渾濁 → 灰暗氛圍
/>
```

### 搭配 fog 和燈光
```jsx
<fog attach="fog" args={['#1a0e06', 10, 60]} />  // 暖棕色霧
<hemisphereLight skyColor="#ff4400" groundColor="#220000" />
```
- fog 顏色要和天空暗色調匹配，否則遠處物體「顏色斷層」
- hemisphereLight 的 skyColor 用暗橘紅，模擬末日大氣散射

### ⚠️ 注意
- `sunPosition.y` 從正轉負不是線性變暗，大約在 `y=0.05` 以下就非常暗了
- 如果天空全黑但場景需要環境光，記得 `ambientLight` / `hemisphereLight` 補光
- `<Sky>` 不影響光照，只影響天空盒視覺；實際照明要靠 directionalLight 等

---

## 檔案結構（最終狀態）

```
D:\GlobalGanLan\
├── public\models\
│   ├── zombie_1\
│   │   ├── mesh.obj                # TripoSR 生成（含頂點色彩）
│   │   ├── input.png               # 原始 2D 圖片
│   │   ├── zombie_1_idle.fbx       # Mixamo 動畫
│   │   ├── zombie_1_attack.fbx
│   │   ├── zombie_1_hurt.fbx
│   │   └── zombie_1_dying.fbx
│   └── zombie_2\
│       └── (同上結構)
├── src\
│   └── App.jsx                     # 主程式（所有元件）
└── docs\
    ├── 2D-to-3D-Model-Generation-Guide.md
    ├── Mixamo使用指南.md
    └── Three.js場景與模型整合筆記.md    ← 本文件
```

---

## 常見問題速查

| 問題 | 原因 | 解法 |
|------|------|------|
| 兩個角色動作同步 | `idle.clone()` 共享 Skeleton | 用 `SkeletonUtils.clone()` |
| 模型沒有顏色 | Material 沒開 `vertexColors` | `vertexColors: true` |
| 切換動畫時下蹲閃現 | `stop()` 回到 bind-pose | 用 `crossFadeTo()` |
| 模型浮空 | 多加了 yOffset | 移除，Mixamo Hips 已定位好 |
| 角色面對方向錯誤 | Mixamo 預設面朝 +Z | Player: `+π/2`, Enemy: `-π/2` |
| Debris 飄在空中 | Y 座標沒根據 scale 計算 | `y = scale.y * 0.5` |
| Debris 擋住角色 | 排除區太小 | 配合鏡頭可視範圍調整 |
| 地面起伏遮住角色 | 中心區沒壓平 | `edgeFade` 漸進遮罩 |
| 速度倍率無效 | async 閉包讀到舊 state | 用 `useRef` 同步 |
| 頁面重載慢 | `location.reload()` 重下載模型 | 用 `resetGame()` 重置 state |
| 重啟時喪屍從倒地跳起 | 直接重置 state | 先拉過場幕 → 等不透明 → 重置（見第 9 節） |
| 雨是方塊不是雨絲 | 用了 `Points` / `PointsMaterial` | 改用 `LineSegments` + `LineBasicMaterial` |
| 雨垂直落下不自然 | 沒有水平風偏移 | `windX=4` + 下端 dx 偏移 → 16° 傾斜 |
| 粒子修改後畫面沒變 | 沒設 `needsUpdate = true` | 每幀設 `attributes.position.needsUpdate = true` |
| 透明粒子出現黑色方塊 | `depthWrite: true` | 設 `depthWrite: false` |
| 天空太亮（末日感不足） | `sunPosition.y > 0` | `y < 0` + 低 rayleigh + 高 turbidity |
| 天空全黑但角色也黑 | Sky 不影響光照 | 額外加 `ambientLight` / `hemisphereLight` 補光 |
| HUD/按鈕全部消失 | `App.jsx` 沒有 `import './App.css'` | 在檔案頂部加回 `import './App.css'` |
| 場景邊緣露出空曠 | fog 遠端 > 地面半徑 | fog 遠端 ≤ 地面半徑（如 35 ≤ 30） |
| 效能低落 FPS 不足 | 場景元素超出可視範圍 | 見第 12 節：只渲染 fog 範圍內 |

---

## 12. 效能優化：戰場範圍縮減

### 核心原則
> **只渲染鏡頭看得到的範圍。fog 外面的東西都是浪費。**

鏡頭在 `[0, 3, 10]`，FOV 45°，fog 遠端 35 → 實際可視半徑 ≈ 30 單位。
任何超出此範圍的幾何體、粒子都不會被看到（被 fog 完全遮蔽），但仍會消耗 GPU/CPU。

### 連動清單：修改場景大小時，五者必須一起調

| 元素 | 參數 | 需配合 fog 遠端 | 說明 |
|------|------|-----------------|------|
| **Ground** | `PlaneGeometry(w, h, segW, segH)` | `w/2 ≥ fog far` | 地面要蓋過 fog 可見範圍 |
| **Debris** | `spread` + `count` | `spread/2 ≤ fog far` | debris 超出 fog 看不到 |
| **Rain** | `area` + `count` | `area/2 ≤ fog far` | 雨超出可視範圍浪費 |
| **Sparkles** | `scale` + `count` | `scale/2 ≤ fog far` | 同上 |
| **Fog** | `[near, far]` | — | 決定「可見邊界」，其他以此為準 |

### 優化前後對比

| 元素 | 優化前 | 優化後 | 減幅 |
|------|--------|--------|------|
| Ground | 200×200, 128×128 seg (16641 vertices) | 60×60, 64×64 seg (4225 vertices) | **−75%** |
| Rain | 4000 條, area 60 | 1200 條, area 30 | **−70%** |
| Debris | 200 個, spread 70 | 80 個, spread 35 | **−60%** |
| Walls | 30 個 | 12 個 | **−60%** |
| Sparkles | 200 個, scale 40 | 80 個, scale 20 | **−60%** |
| Fog | `[10, 60]` | `[8, 35]` | 收緊 |

### 如何決定合適的值

```
1. 先決定 fog far（可見最遠距離）
   - 太近：場景感覺小、壅擠
   - 太遠：能看到地面邊緣 → 穿幫
   → 建議：fog far = 地面半徑 × 1.0~1.2

2. 地面寬度 = fog far × 2 + 餘裕
   → 60 單位（半徑 30）足以配合 fog far=35

3. Rain area = fog far × 0.8~1.0
   → area 30 足以覆蓋可視範圍

4. Debris spread = fog far × 0.8~1.0

5. 細分數只需「看起來夠細」即可
   → 64×64 在 60×60 平面上 ≈ 每格 ~1 單位，夠用
```

### ⚠️ 注意事項
1. **fog 是關鍵錨點**：修改場景大小永遠從 fog 開始，其他跟著調
2. **不要單獨縮減某一項**：只縮 ground 但 debris 仍 spread 70 → debris 浮在空中（超出地面）
3. **排除區仍然有效**：debris 排除區 `|x|<5 && z>-5 && z<13` 不受 spread 縮減影響
4. **DPR 也影響效能**：`dpr: [1, 1.5]`（mobile）vs `dpr: [1, 2]`（desktop）已在 `useResponsive()` 內處理

---

## 13. RWD 響應式與 CSS 注意事項

### useResponsive() hook
偵測 `window.innerWidth` / `innerHeight` 並分級：

| 裝置 | 條件 | FOV | 鏡頭 | DPR |
|------|------|-----|------|-----|
| mobile (portrait) | w≤480 或 portrait w≤600 | 72 | `[0,5,15]` | `[1,1.5]` |
| mobile (landscape) | w≤480 | 60 | `[0,3.5,13]` | `[1,1.5]` |
| tablet (portrait) | w≤1024 或 portrait w≤800 | 62 | `[0,4.5,14]` | `[1,2]` |
| tablet (landscape) | w≤1024 | 50 | `[0,3.2,11]` | `[1,2]` |
| desktop | else | 45 | `[0,3,10]` | `[1,2]` |

### CSS import 必要性

```jsx
// src/App.jsx 頂部 — 絕對不可省略！
import './App.css'
```

所有 HUD 類別（`.game-hud`, `.btn-start`, `.hud-hero-hp` 等）定義在 `App.css`。
若漏掉 import，整個 UI 層會「看不見」（元素存在但沒樣式 → 堆在畫面角落或透明）。

### CSS 要點
- HUD 用 `clamp()` 做字體/間距自適應
- 直式手機（portrait + ≤480px）HUD 改為 `flex-wrap` 堆疊佈局
- 按鈕用 `touch-action: manipulation` 避免雙擊縮放
- `env(safe-area-inset-*)` 處理瀏海/圓角螢幕
- 過場幕 `z-index: 100`，HUD `z-index: 10`

### ⚠️ 陷阱
- 修改 RWD 邏輯後要測試：桌面、手機橫式、手機直式三種
- `orientationchange` 事件需要 `setTimeout(150ms)` 才能拿到正確的新尺寸

---

**最後更新**: 2026-02-22
**技術棧**: React 18 + @react-three/fiber + @react-three/drei + Three.js 0.183
