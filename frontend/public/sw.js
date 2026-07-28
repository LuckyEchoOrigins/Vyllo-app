// Service worker de auto-destruição.
//
// As versões antigas (vyllo-v5) cacheavam o app shell e, em dispositivos que já
// as tinham registado — sobretudo o TWA Android via Chrome —, serviam código
// obsoleto no arranque, antes de o main.jsx sequer correr. Como o código antigo
// não sabe cancelar o SW, o dispositivo ficava preso numa versão velha.
//
// Este SW não cacheia nada. O browser volta a buscar o sw.js a cada navegação;
// ao ver que mudou, instala este, que apaga todas as caches, cancela o próprio
// registo e recarrega as janelas — libertando os dispositivos presos. Fica de
// pé (em vez de removermos o ficheiro) precisamente para os alcançar; um 404 no
// sw.js não desregista um SW já instalado.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    await self.registration.unregister()
    const clients = await self.clients.matchAll({ type: 'window' })
    clients.forEach((c) => c.navigate(c.url))
  })())
})

// Sem handler de fetch: todos os pedidos vão à rede, nunca à cache.
