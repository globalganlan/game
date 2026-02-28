/**
 * Service Worker — 全球感染 PWA
 *
 * 快取策略：Network First（優先網路，離線時退回快取）
 * 靜態資源：Cache First（GLB/圖片等大檔案優先快取）
 */

const CACHE_NAME = 'globalganlan-v2'
const STATIC_CACHE = 'globalganlan-static-v2'

// 預快取核心檔案
const PRECACHE_URLS = [
  '/game/',
  '/game/index.html',
]

// 靜態資源匹配規則（大檔案 Cache First）
const STATIC_EXTENSIONS = ['.glb', '.png', '.jpg', '.jpeg', '.svg', '.wasm', '.js', '.css']

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

  // 靜態資源 → Cache First
  const isStatic = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))
  if (isStatic) {
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

  // HTML / 其他 → Network First
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
