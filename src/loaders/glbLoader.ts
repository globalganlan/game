/**
 * GLB 共用載入器 — 全域快取 + Suspense 整合 + Draco 解壓
 *
 * 取代舊的 fbxLoader.ts，改用 GLTFLoader 載入 .glb 檔。
 *
 * - `loadGlbShared(url)`: 非同步載入，結果快取在 Map 中。
 * - `getGlbForSuspense(url)`: 若已快取直接回傳，否則 throw Promise 觸發 Suspense。
 *
 * 回傳的物件包含 `scene` (THREE.Group) 和 `animations` (THREE.AnimationClip[])。
 *
 * ★ 載入失敗時的重試策略：
 *   - 第一次失敗：不快取，允許 Suspense 或下次呼叫自動重試
 *   - 重試也失敗：快取 fallback（避免無限重試），但在 30 秒後過期可再試
 *   - iOS 特別加入 20 秒超時，防止 WASM 解碼/網路 hang 住
 */

import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import * as THREE from 'three'

// 啟用 Three.js 內建 HTTP 快取
THREE.Cache.enabled = true

export interface GlbAsset {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  /** 是否為載入失敗的空白替代品 */
  isFallback?: boolean
}

// Draco 解碼器（Draco 壓縮的 GLB 必須）
const dracoLoader = new DRACOLoader()
// 使用本地 Draco WASM 解碼器（從 public/draco/ 提供）
dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
dracoLoader.setDecoderConfig({ type: 'wasm' })

const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)

const cache = new Map<string, GlbAsset>()
const pending = new Map<string, Promise<GlbAsset>>()
/** 已失敗的 URL 記錄：url → { 失敗次數, 最後失敗時間 } */
const failedUrls = new Map<string, { count: number; lastFail: number }>()

const MAX_RETRIES = 2
const FALLBACK_EXPIRE_MS = 30_000 // fallback 快取 30 秒後過期可重試
const LOAD_TIMEOUT_MS = 20_000    // 單次載入超時（iOS WASM/4G 安全網）

/**
 * 建立空的 fallback asset（載入失敗時使用）。
 */
function createFallbackAsset(): GlbAsset {
  const group = new THREE.Group()
  group.name = '__glb_load_failed__'
  return { scene: group, animations: [], isFallback: true }
}

/** 帶超時的 loadAsync 包裝 */
function loadWithTimeout(url: string, timeoutMs: number): Promise<GLTF> {
  return new Promise<GLTF>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[glbLoader] Load timeout after ${timeoutMs}ms: ${url}`))
    }, timeoutMs)
    loader.loadAsync(url).then((gltf) => {
      clearTimeout(timer)
      resolve(gltf)
    }).catch((err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/** 非同步載入 GLB；重複 URL 只會請求一次，失敗自動重試 */
export function loadGlbShared(url: string): Promise<GlbAsset> {
  const cached = cache.get(url)
  if (cached) {
    // ★ 如果快取的是 fallback 且已過期，允許重試
    if (cached.isFallback) {
      const info = failedUrls.get(url)
      if (info && Date.now() - info.lastFail > FALLBACK_EXPIRE_MS) {
        cache.delete(url)
        failedUrls.delete(url)
        // 繼續向下執行載入
      } else {
        return Promise.resolve(cached)
      }
    } else {
      return Promise.resolve(cached)
    }
  }

  const inflight = pending.get(url)
  if (inflight) return inflight

  const task = loadWithTimeout(url, LOAD_TIMEOUT_MS).then((gltf) => {
    const asset: GlbAsset = {
      scene: gltf.scene,
      animations: gltf.animations || [],
    }
    cache.set(url, asset)
    pending.delete(url)
    failedUrls.delete(url)
    return asset
  }).catch((error: unknown) => {
    pending.delete(url)
    const info = failedUrls.get(url) || { count: 0, lastFail: 0 }
    info.count += 1
    info.lastFail = Date.now()
    failedUrls.set(url, info)

    if (info.count < MAX_RETRIES) {
      // ★ 重試前不快取 fallback — 讓下次 getGlbForSuspense 或 loadGlbShared 可自動重試
      console.warn(`[glbLoader] Load failed (attempt ${info.count}/${MAX_RETRIES}), will retry:`, url, error)
      // 不放入 cache，下次呼叫會觸發新的載入
      return createFallbackAsset() // 本次呼叫者拿到 fallback，但不影響 cache
    }

    // ★ 多次重試都失敗 → 快取 fallback 避免無限重試，但 30 秒後可過期重試
    console.warn(`[glbLoader] All ${MAX_RETRIES} retries failed, caching fallback:`, url, error)
    const fallback = createFallbackAsset()
    cache.set(url, fallback)
    return fallback
  })

  pending.set(url, task)
  return task
}

/**
 * Suspense 版本：同步讀快取，若未載入則 throw Promise。
 * 必須在 `<Suspense>` 內使用。
 * ★ 如果快取的是過期 fallback，會清除並重新載入。
 */
export function getGlbForSuspense(url: string): GlbAsset {
  const cached = cache.get(url)
  if (cached) {
    // 過期 fallback → 清除並重新載入
    if (cached.isFallback) {
      const info = failedUrls.get(url)
      if (info && Date.now() - info.lastFail > FALLBACK_EXPIRE_MS) {
        cache.delete(url)
        failedUrls.delete(url)
        throw loadGlbShared(url)
      }
    }
    return cached
  }
  throw loadGlbShared(url)
}

/**
 * 預載入一個英雄的所有 GLB（mesh + 5 animations）。
 * 在 Canvas 掛載前呼叫，確保模型進入快取後 getGlbForSuspense 可同步讀取。
 * ★ 並行載入所有檔案；每個檔案內建 20 秒超時 + 自動重試。
 */
export function preloadHeroModel(modelId: string): Promise<void> {
  const folder = `${import.meta.env.BASE_URL}models/${modelId}`
  return Promise.all([
    loadGlbShared(`${folder}/${modelId}.glb`),
    loadGlbShared(`${folder}/${modelId}_idle.glb`),
    loadGlbShared(`${folder}/${modelId}_attack.glb`),
    loadGlbShared(`${folder}/${modelId}_hurt.glb`),
    loadGlbShared(`${folder}/${modelId}_dying.glb`),
    loadGlbShared(`${folder}/${modelId}_run.glb`),
  ]).then(() => {})
}

/** 判斷一個 asset 是否為載入失敗的 fallback */
export function isGlbFallback(asset: GlbAsset): boolean {
  return !!asset.isFallback || asset.scene.name === '__glb_load_failed__'
}

/**
 * 釋放 Draco WASM 解碼器佔用的記憶體。
 * 所有模型載入完成後呼叫，減少 iOS WKWebView 記憶體壓力。
 */
export function disposeDracoDecoder(): void {
  try { dracoLoader.dispose() } catch { /* ignore */ }
}

/* ─── iOS 記憶體管理 ──────────────────────────────── */

/**
 * 深度釋放 GlbAsset 的所有 GPU 資源（geometry / texture / material）。
 * ⚠️ 呼叫後，任何仍在使用此 asset 的 clone 會失去紋理。
 * 只在所有使用此 asset 的元件 unmount 後才能呼叫。
 */
function deepDisposeAsset(asset: GlbAsset): void {
  asset.scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      // 釋放幾何體（Draco 解壓後的 BufferGeometry）
      mesh.geometry?.dispose()
      // 釋放材質及其所有紋理貼圖
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats) {
        if (!mat) continue
        // 遍歷材質上的所有紋理屬性（map / normalMap / roughnessMap ...）
        for (const key of Object.keys(mat)) {
          const val = (mat as unknown as Record<string, unknown>)[key]
          if (val && typeof val === 'object' && (val as THREE.Texture).isTexture) {
            ;(val as THREE.Texture).dispose()
          }
        }
        mat.dispose()
      }
    }
  })
}

/**
 * 釋放單一英雄的所有 GLB 快取（mesh + 5 個動畫檔），連同 GPU 資源。
 * ★ 只在所有使用此 modelId 的 Hero/ZombieModel 元件 unmount 之後才能呼叫。
 * 常見時機：離開戰鬥場景 → 敵方模型不再需要。
 */
export function releaseHeroModel(modelId: string): void {
  const folder = `${import.meta.env.BASE_URL}models/${modelId}`
  const urls = [
    `${folder}/${modelId}.glb`,
    `${folder}/${modelId}_idle.glb`,
    `${folder}/${modelId}_attack.glb`,
    `${folder}/${modelId}_hurt.glb`,
    `${folder}/${modelId}_dying.glb`,
    `${folder}/${modelId}_run.glb`,
  ]
  let released = false
  for (const url of urls) {
    const asset = cache.get(url)
    if (asset && !asset.isFallback) {
      deepDisposeAsset(asset)
      released = true
    }
    cache.delete(url)
    pending.delete(url)
    failedUrls.delete(url)
  }
  if (released) {
    console.info(`[glbLoader] Released ${modelId} (GPU resources freed)`)
  }
}

/**
 * 釋放所有快取的 GLB 模型 — 登出或硬重設時使用。
 */
export function releaseAllModels(): void {
  for (const [, asset] of cache) {
    if (!asset.isFallback) deepDisposeAsset(asset)
  }
  const count = cache.size
  cache.clear()
  pending.clear()
  failedUrls.clear()
  if (count > 0) console.info(`[glbLoader] Released all ${count} cached assets`)
}

/**
 * 批次預載多個英雄，限制同時載入的併發數（預設 2 個英雄並行）。
 * iOS 上同時載入太多 GLB（每個英雄 6 檔）會造成記憶體尖峰 → OOM kill。
 * @param modelIds  要預載的 modelId 陣列
 * @param concurrency 同時預載的最大英雄數（預設 2，即最多 12 個檔案並行）
 */
export async function preloadHeroModels(
  modelIds: string[],
  concurrency = 2,
): Promise<void> {
  const unique = [...new Set(modelIds)]
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency)
    await Promise.all(batch.map(mid => preloadHeroModel(mid).catch(() => {})))
  }
}

/**
 * 取得目前快取中的所有 modelId（診斷用途）。
 */
export function getCachedModelIds(): Set<string> {
  const ids = new Set<string>()
  for (const url of cache.keys()) {
    const match = url.match(/models\/(zombie_\d+)\//)
    if (match) ids.add(match[1])
  }
  return ids
}
