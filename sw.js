// Atlas service worker — offline app shell. The whole app is one index.html.
// The shell is served NETWORK-FIRST so a new deploy always reaches the device
// when online (a cache-first shell would pin users to a stale build); the cache
// is the offline fallback only. Static assets are cache-first.
const CACHE = 'atlas-shell-v4'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png']

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    // cache best-effort — a single 404 must not fail the whole install
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})))
    self.skipWaiting()
  })())
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

// Only these same-origin paths are ever cached (an allowlist, so dynamic data
// like the companion's /api/* and cloud calls are never frozen into the cache).
const STATIC = new Set(['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'])

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Never intercept dynamic APIs (companion sync) or cross-origin (Anthropic, cloud).
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return

  // App shell: NETWORK-FIRST so new deploys land immediately; cache is offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') { const clone = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', clone)) }
        return res
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    )
    return
  }
  // Static assets only (allowlist): cache-first.
  const isStatic = STATIC.has(url.pathname) || STATIC.has(url.pathname.replace(/^.*\//, '/'))
  if (!isStatic) return
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => cached || fetch(req).then(res => {
      if (res && res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)) }
      return res
    }).catch(() => cached))
  )
})
