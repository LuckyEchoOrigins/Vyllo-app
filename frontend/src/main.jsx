import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyAccent, getAccent } from './theme'

const resolveTheme = (pref) =>
  pref === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (pref || 'dark')

document.documentElement.dataset.theme = resolveTheme(localStorage.getItem('theme'))
applyAccent(getAccent())

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((localStorage.getItem('theme') || 'dark') === 'system') {
    document.documentElement.dataset.theme = resolveTheme('system')
    applyAccent(getAccent())
  }
})

try { screen.orientation.lock('portrait').catch(() => {}) } catch {}

// Service worker DESATIVADO. Estava a servir versões em cache e a mascarar
// atualizações — várias correções não chegavam ao dispositivo. Como a app
// depende de rede (Supabase), o ganho offline não compensava.
// Isto também limpa registos e caches antigos que ficaram nos dispositivos.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((rs) => rs.forEach((r) => r.unregister()))
    .catch(() => {})
}
if (typeof caches !== 'undefined') {
  caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Esconde o splash de arranque depois de o React montar (render é síncrono, por
// isso #root já tem conteúdo aqui). Estilo inline para o fade (vence a folha de
// estilos) e remoção por setTimeout. Nada de requestAnimationFrame: ele não
// dispara em separadores ocultos, o que deixaria o splash preso por cima da app.
{
  const boot = document.getElementById('boot-splash')
  if (boot) {
    boot.style.opacity = '0'
    boot.style.pointerEvents = 'none'
    setTimeout(() => boot.remove(), 400)   // > .35s do fade definido no CSS
  }
}
