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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'reload') window.location.reload()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
