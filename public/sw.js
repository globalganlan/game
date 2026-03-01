/**
 * Service Worker — 全球感染 PWA
 *
 * 快取策略：
 *   HTML / JS / CSS → Network First（確保每次拿到最新版本）
 *   GLB / 圖片 / WASM → Cache First（大檔案優先快取，hash 不同時自動更新）
 *
 * 版本更新機制：
 *   每次 build 會產生不同的 asset hash（如 index-BjVK6_Nq.css）
 *   SW 版號變更 → install → activate → 清除舊快取 → clients.claim()
 *   前端 main.tsx 偵測到新 SW 等待中 → 彈出「有新版本」提示 → 使用者點擊時 skipWaiting
 */

const CACHE_VERSION = 'v3'
const CACHE_NAME = `globalganlan-${CACHE_VERSION}`
const STATIC_CACHE = `globalganlan-static-${CACHE_VERSION}`

// 預快取核心檔案
const PRECACHE_URLS = [
  '/game/',
  '/game/index.html',
]

// 大型靜態資源（Cache First — 透過檔名 hash 自然失效）
const STATIC_EXTENSIONS = ['.glb', '.png', '.jpg', '.jpeg', '.svg', '.wasm', '.woff', '.woff2', '.ttf']

/* ── Install ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

/* ── Activate ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  )
})

/* ── Fetch ── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 不快取 GAS API 呼叫
  if (url.hostname === 'script.google.com') return

  // 不快取 POST 請求
  if (event.request.method !== 'GET') return

  // manifest.json 不快取（避免殘留壞檔導致 Syntax error）
  if (url.pathname.endsWith('manifest.json')) return

  // 大型靜態資源（GLB/圖片/WASM/字型）→ Cache First
  // Vite 產出的 JS/CSS 有 hash 檔名，但仍走 Network First 確保最新
  const isLargeStatic = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))
  if (isLargeStatic) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone())
            return response
          })
        })
      )
    )
    return
  }

  // HTML / JS / CSS / 其他 → Network First（確保每次部署都能拿到最新版本）
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

/* ── 接收前端 skipWaiting 訊息 ── */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
