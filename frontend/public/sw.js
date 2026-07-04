// Service worker — cache do app shell para funcionar offline
const CACHE = 'vyllo-v4'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'reload' })))
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return   // ignora origens externas (CDNs, etc.)
  if (url.pathname.startsWith('/api/')) return  // a API é sempre da rede (dados dinâmicos)
  if (url.pathname === '/sw.js') return         // nunca cachear o próprio SW

  // Stale-while-revalidate: serve da cache e atualiza em segundo plano
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      const network = fetch(req)
        .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res })
        .catch(() => cached || caches.match('/index.html'))
      return cached || network
    })
  )
})
