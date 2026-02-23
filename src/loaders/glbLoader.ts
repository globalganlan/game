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
    throw error
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
