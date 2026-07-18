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
