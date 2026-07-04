import { useState, useEffect } from 'react'
import { openPremium, isPremium } from '../utils'
import { useLang } from '../i18n'

// Botão Premium com luz a fluir nas 3 cores do logo
export default function PremiumButton({ onClick }) {
  const { t } = useLang()
  const [premium, setP] = useState(isPremium())
  useEffect(() => {
    const f = () => setP(isPremium())
    window.addEventListener('premium-change', f)
    return () => window.removeEventListener('premium-change', f)
  }, [])
  if (premium) return null

  return (
    <button
      onClick={onClick || (() => openPremium())}
      style={{
        position: 'relative', overflow: 'hidden', width: '100%', cursor: 'pointer', border: 'none',
        borderRadius: 16, padding: '14px 16px', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))',
        backgroundSize: '200% 100%',
        animation: 'premiumFlow 4s linear infinite, premiumGlow 3s ease-in-out infinite',
      }}
      onPointerDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
      onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
      onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      {/* Brilho a varrer */}
      <span style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
        animation: 'premiumShine 3.2s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <span style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>👑</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 900, color: 'white', fontFamily: 'Nunito', textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
          {t('premium.go_premium')}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginTop: 1 }}>
          {t('premium.unlock_more')}
        </span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}
