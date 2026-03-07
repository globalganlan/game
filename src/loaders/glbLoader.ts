/**
 * GLB 共用載入器 — 全域快取 + Suspense 整合 + Draco 解壓
 *
 * 取代舊的 fbxLoader.ts，改用 GLTFLoader 載入 .glb 檔。
 *
 * - `loadGlbShared(url)`: 非同步載入，結果快取在 Map 中。
 * - `getGlbForSuspense(url)`: 若已快取直接回傳，否則 throw Promise 觸發 Suspense。
 *
 * 回傳的物件包含 `scene` (THREE.Group) 和 `animations` (THREE.AnimationClip[])。
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import * as THREE from 'three'

// 啟用 Three.js 內建 HTTP 快取
THREE.Cache.enabled = true

export interface GlbAsset {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
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

/**
 * 建立空的 fallback asset（載入失敗時使用）。
 * 避免 Suspense 無限重試導致 iOS 過場卡死。
 */
function createFallbackAsset(): GlbAsset {
  const group = new THREE.Group()
  group.name = '__glb_load_failed__'
  return { scene: group, animations: [] }
}

/** 非同步載入 GLB；重複 URL 只會請求一次 */
export function loadGlbShared(url: string): Promise<GlbAsset> {
  const cached = cache.get(url)
  if (cached) return Promise.resolve(cached)

  const inflight = pending.get(url)
  if (inflight) return inflight

  const task = loader.loadAsync(url).then((gltf) => {
    const asset: GlbAsset = {
      scene: gltf.scene,
      animations: gltf.animations || [],
    }
    cache.set(url, asset)
    pending.delete(url)
    return asset
  }).catch((error: unknown) => {
    pending.delete(url)
    // ★ 載入失敗 → 快取空 fallback，避免 Suspense 無限重試卡死（iOS 常見）
    console.warn('[glbLoader] Failed to load:', url, error)
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
 */
export function getGlbForSuspense(url: string): GlbAsset {
  const cached = cache.get(url)
  if (cached) return cached
  throw loadGlbShared(url)
}

/**
 * 預載入一個英雄的所有 GLB（mesh + 5 animations）。
 * 在 Canvas 掛載前呼叫，確保模型進入快取後 getGlbForSuspense 可同步讀取。
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

/**
 * 釋放 Draco WASM 解碼器佔用的記憶體。
 * 所有模型載入完成後呼叫，減少 iOS WKWebView 記憶體壓力。
 */
export function disposeDracoDecoder(): void {
  try { dracoLoader.dispose() } catch { /* ignore */ }
}
