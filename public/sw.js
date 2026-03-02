/**
 * Service Worker — 全球感染 PWA (v7)
 *
 * 快取策略：
 *   ★ Navigation（HTML）→ 不攔截，讓瀏覽器原生處理
 *   JS / CSS → Network First（Vite hash 檔名確保更新）
 *   GLB / 圖片 / WASM → Cache First（大檔案優先快取）
 *
 * 重要：
 *   - 導航請求（mode:'navigate'）不攔截
 *   - 跨域請求一律不攔截
 *   - Standalone 模式由 main.tsx 負責 unregister，此 SW 不會被註冊
 *   - install 呼叫 skipWaiting() 確保新版本立即接管（取代有 bug 的舊版 SW）
 *   - activate 不呼叫 clients.claim()（避免 iOS controllerchange 觸發）
 *   - main.tsx 已移除 controllerchange 監聽器，所以 skipWaiting 不會造成 reload 迴圈
 */

const CACHE_VERSION = 'v7'
const CACHE_NAME = `globalganlan-${CACHE_VERSION}`
const STATIC_CACHE = `globalganlan-static-${CACHE_VERSION}`

// 大型靜態資源（Cache First — 透過檔名 hash 自然失效）
const STATIC_EXTENSIONS = ['.glb', '.png', '.jpg', '.jpeg', '.svg', '.wasm', '.woff', '.woff2', '.ttf']

/* ── Install ── */
self.addEventListener('install', (event) => {
  // 立即接管：確保有 bug 的舊版 SW (v5/v6) 被替換。
  // 安全性：main.tsx 已移除 controllerchange → reload 監聽器，
  // 且 standalone 模式根本不會註冊 SW，所以不會造成 reload 迴圈。
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME)
  )
})

/* ── Activate ── */
self.addEventListener('activate', (event) => {
  // 清除所有舊版快取，不呼叫 clients.claim()。
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  )
})

/* ── Fetch ── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // ★ 導航請求（HTML 頁面）→ 完全不攔截，讓瀏覽器原生處理
  // 這是防止 iOS standalone reload 迴圈的關鍵
  if (event.request.mode === 'navigate') return

  // 跨域請求一律不攔截（API、CDN 等）
  if (url.origin !== self.location.origin) return

  // 不快取 POST 請求
  if (event.request.method !== 'GET') return

  // manifest.json 不快取
  if (url.pathname.endsWith('manifest.json')) return

  // service worker 本身不快取
  if (url.pathname.endsWith('sw.js')) return

  // 大型靜態資源（GLB/圖片/WASM/字型）→ Cache First
  const isLargeStatic = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))
  if (isLargeStatic) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone())
            return response
          }).catch(() => cached || new Response('', { status: 503 }))
        })
      )
    )
    return
  }

  // JS / CSS / 其他同域子資源 → Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) =>
          cached || new Response('', { status: 503 })
        )
      )
  )
})

/* ── 接收前端 skipWaiting 訊息 ── */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
