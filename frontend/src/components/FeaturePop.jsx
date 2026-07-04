import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

const FEATURES = [
  {
    icon: 'trophy',
    title: 'Synced achievements',
    text: 'Link your Steam account and import all your achievements automatically.',
  },
  {
    icon: 'chart',
    title: 'In-depth stats',
    text: 'Daily heatmaps, top favourites and complete history for every year.',
  },
  {
    icon: 'sparkles',
    title: 'Animated Wrapped',
    text: 'A shareable year retrospective — your annual taste badge.',
  },
]

export default function FeaturePop({ onClose }) {
  const startY = useRef(null)
  const [dragY, setDragY] = useState(0)

  const onTouchStart = e => { startY.current = e.touches[0].clientY; setDragY(0) }
  const onTouchMove = e => { const dy = e.touches[0].clientY - startY.current; if (dy > 0) setDragY(dy) }
  const onTouchEnd = () => { if (dragY > 80) onClose(); else setDragY(0) }

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.48)', animation: 'fadeIn 0.25s ease both' }} />

      {/* Sheet */}
      <div style={{
        position: 'relative', background: 'var(--bg)', borderRadius: '22px 22px 0 0',
        animation: 'slideUp 0.38s cubic-bezier(.22,1,.36,1) both',
        transform: `translateY(${dragY}px)`,
        transition: dragY === 0 ? 'transform 0.3s cubic-bezier(.22,1,.36,1)' : 'none',
        willChange: 'transform',
      }}>
        {/* Swipe handle */}
        <div
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0', touchAction: 'none' }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Gradient header */}
        <div
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{
            position: 'relative', overflow: 'hidden', margin: '14px 16px 12px', borderRadius: 16,
            padding: '18px 20px', touchAction: 'none',
            background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))',
            backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite',
          }}
        >
          <span style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.38), transparent)',
            animation: 'premiumShine 3.2s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Nunito', marginBottom: 5 }}>
            Discover more
          </p>
          <h2 style={{ color: 'white', fontSize: 19, fontWeight: 900, textShadow: '0 1px 4px rgba(0,0,0,0.22)', lineHeight: 1.2 }}>
            What Vyllo has for you
          </h2>
        </div>

        {/* Feature rows */}
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FEATURES.map((f, idx) => (
            <div key={f.title} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'var(--surface)', borderRadius: 14, padding: '13px 14px',
              animation: `fadeInUp 0.28s ease ${0.08 + idx * 0.07}s both`,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--brand-1), var(--brand-3))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white',
              }}>
                <Icon name={f.icon} size={22} strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>{f.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{f.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ padding: '4px 16px 32px' }}>
          <button onClick={onClose} style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
            color: 'white', fontSize: 15, fontWeight: 900, fontFamily: 'Nunito',
            background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))',
            backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite',
          }}>
            Great, let's go! 🚀
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('root')
  )
}
