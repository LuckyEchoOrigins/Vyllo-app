import { haptic } from '../feedback'
import { useLang } from '../i18n'

export default function BottomNav({ activeTab, onTabChange }) {
  const { t } = useLang()
  const go = (i) => { haptic(i === 2 ? 14 : 6); onTabChange(i) }
  const tabs = [
    { icon: <HomeIcon />, label: t('nav.home') },
    { icon: <LibIcon />, label: t('nav.library') },
    { icon: null, label: '' },
    { icon: <StatsIcon />, label: t('nav.stats') },
    { icon: <ProfileIcon />, label: t('nav.profile') },
  ]

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      width: '100%',
      height: 72,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '0 8px',
      paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      zIndex: 40,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
    }}>
      {tabs.map((tab, i) => {
        if (i === 2) return (
          <button
            key={i}
            onClick={() => go(2)}
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px var(--accent-glow)',
              transform: 'translateY(-10px)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              flexShrink: 0,
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'translateY(-8px) scale(0.95)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(-10px)'}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        )

        const isActive = activeTab === i
        return (
          <button
            key={i}
            onClick={() => go(i)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '8px 12px',
              background: 'none',
              color: isActive ? 'var(--accent)' : '#8E8EA0',
              flex: 1,
              transition: 'color 0.15s',
            }}
          >
            <span style={{ transition: 'transform 0.15s, filter 0.15s', transform: isActive ? 'scale(1.12)' : 'scale(1)', filter: isActive ? 'drop-shadow(0 0 7px var(--accent))' : 'none' }}>
              {tab.icon}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito' }}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function LibIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
