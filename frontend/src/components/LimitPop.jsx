import { createPortal } from 'react-dom'
import { openPremium } from '../utils'
import Icon from './Icon'

const PERKS = [
  { icon: 'infinity', label: 'Unlimited items in your collection' },
  { icon: 'trophy',   label: 'Synced achievements and trophies' },
  { icon: 'chart',    label: 'Annual stats + Wrapped' },
]

export default function LimitPop({ onClose, limit = 40 }) {
  const handleUpgrade = () => {
    onClose()
    openPremium('limit')
  }

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, zIndex: 400, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', animation: 'fadeIn 0.22s ease both' }} />

      <div style={{
        position: 'relative', background: 'var(--bg)', borderRadius: '22px 22px 0 0',
        animation: 'slideUp 0.35s cubic-bezier(.22,1,.36,1) both', overflow: 'hidden',
      }}>
        {/* Topo gradiente */}
        <div style={{
          position: 'relative', overflow: 'hidden', padding: '28px 24px 22px', textAlign: 'center',
          background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))',
          backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite',
        }}>
          <span style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
            animation: 'premiumShine 3.2s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Icon name="lock" size={26} strokeWidth={2.2} />
            </div>
          </div>
          <h2 style={{ color: 'white', fontSize: 20, fontWeight: 900, textShadow: '0 1px 4px rgba(0,0,0,0.2)', marginBottom: 6 }}>
            Limit reached!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
            You've reached the <strong>{limit}-item limit</strong> of the free plan.
          </p>
        </div>

        {/* Comparação */}
        <div style={{ padding: '20px 20px 8px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Free</p>
            <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{limit}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>items</p>
          </div>
          <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <Icon name="upload" size={18} strokeWidth={2} style={{ transform: 'rotate(90deg)' }} />
          </div>
          <div style={{
            flex: 1, borderRadius: 14, padding: '14px 12px', textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(var(--accent-rgb),0.05))',
            border: '1.5px solid rgba(var(--accent-rgb),0.3)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Premium</p>
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)', marginBottom: 2 }}>
              <Icon name="infinity" size={28} strokeWidth={2.5} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>unlimited</p>
          </div>
        </div>

        {/* Perks */}
        <div style={{ padding: '8px 20px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PERKS.map(p => (
            <div key={p.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0 }}>
                <Icon name={p.icon} size={17} strokeWidth={2.2} />
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.label}</span>
            </div>
          ))}
        </div>

        {/* Ações */}
        <div style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleUpgrade} style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
            color: 'white', fontSize: 15, fontWeight: 900, fontFamily: 'Nunito',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))',
            backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite',
          }}>
            <Icon name="crown" size={18} strokeWidth={2.2} />
            Go Premium
          </button>
          <button onClick={onClose} style={{
            width: '100%', padding: '10px 0', background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
          }}>
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('root')
  )
}
