import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

// Host global de toasts + diálogos de confirmação. Montar uma vez na App.
export default function Feedback() {
  const [toasts, setToasts] = useState([])
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 2800)
    }
    const onConfirm = (e) => setConfirm(e.detail)
    window.addEventListener('vyllo-toast', onToast)
    window.addEventListener('vyllo-confirm', onConfirm)
    return () => {
      window.removeEventListener('vyllo-toast', onToast)
      window.removeEventListener('vyllo-confirm', onConfirm)
    }
  }, [])

  const resolveConfirm = (ok) => {
    window.dispatchEvent(new CustomEvent('vyllo-confirm-result', { detail: { id: confirm.id, ok } }))
    setConfirm(null)
  }

  const TONE = {
    success: { color: '#2DB87A', icon: 'check' },
    error:   { color: '#FF4757', icon: 'alert' },
    info:    { color: 'var(--accent)', icon: 'info' },
  }

  return createPortal(
    <>
      {/* Toasts */}
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0, zIndex: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', padding: '0 16px' }}>
        {toasts.map(t => {
          const tone = TONE[t.type] || TONE.info
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '11px 15px', boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
              animation: 'toastIn 0.28s cubic-bezier(.34,1.56,.64,1) both',
            }}>
              <span style={{ color: tone.color, display: 'flex', flexShrink: 0 }}><FeedbackIcon name={tone.icon} /></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>{t.message}</span>
            </div>
          )
        })}
      </div>

      {/* Diálogo de confirmação */}
      {confirm && (
        <div onClick={e => e.target === e.currentTarget && resolveConfirm(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 650, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fadeIn 0.18s ease both' }}>
          <div style={{ width: '100%', maxWidth: 320, background: 'var(--surface)', borderRadius: 18, padding: 22, boxShadow: '0 16px 44px rgba(0,0,0,0.35)', animation: 'fadeInScale 0.2s ease both' }}>
            <h2 style={{ fontSize: 17, color: 'var(--text)', marginBottom: 8 }}>{confirm.title}</h2>
            {confirm.message && (
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 18 }}>{confirm.message}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => resolveConfirm(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer' }}>
                {confirm.cancelLabel}
              </button>
              <button onClick={() => resolveConfirm(true)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: confirm.danger ? '#FF4757' : 'var(--accent)', color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer' }}>
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.getElementById('root')
  )
}

function FeedbackIcon({ name }) {
  if (name === 'check') return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></svg>
  if (name === 'alert') return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16.5" x2="12" y2="16.5" /></svg>
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12" y2="8" /></svg>
}
