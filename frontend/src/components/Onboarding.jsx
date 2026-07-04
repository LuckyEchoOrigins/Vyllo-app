import { useState } from 'react'
import { createPortal } from 'react-dom'
import CategoryIcon from './CategoryIcon'
import Icon from './Icon'
import { useLang } from '../i18n'

export default function Onboarding({ onDone }) {
  const { t } = useLang()
  const [i, setI] = useState(0)

  const SLIDES = [
    {
      art: (
        <img src="/web-app-manifest-512x512.png" alt="Vyllo" width={104} height={104} style={{ borderRadius: 26, boxShadow: '0 14px 40px rgba(0,0,0,0.45)' }} />
      ),
      title: t('onboarding.slide1_title'),
      text: t('onboarding.slide1_text'),
    },
    {
      art: (
        <div style={{ display: 'flex', gap: 14 }}>
          {['book', 'game', 'film'].map((c, idx) => (
            <div key={c} style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ['var(--brand-3)', 'var(--brand-2)', 'var(--brand-1)'][idx], animation: `fadeInScale 0.4s ease ${idx * 0.1}s both` }}>
              <CategoryIcon cat={c} size={28} />
            </div>
          ))}
        </div>
      ),
      title: t('onboarding.slide2_title'),
      text: t('onboarding.slide2_text'),
    },
    {
      art: (
        <div style={{ width: 96, height: 96, borderRadius: 28, background: 'var(--purple-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chart" size={44} strokeWidth={2} />
        </div>
      ),
      title: t('onboarding.slide3_title'),
      text: t('onboarding.slide3_text'),
    },
  ]

  const last = i === SLIDES.length - 1
  const finish = () => { try { localStorage.setItem('onboarded', '1') } catch {}; onDone() }

  const s = SLIDES[i]
  return createPortal(
    <div style={{ position: 'absolute', inset: 0, zIndex: 700, background: 'var(--bg)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.25s ease both' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 18px 0' }}>
        {!last && (
          <button onClick={finish} style={{ background: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer' }}>{t('onboarding.skip')}</button>
        )}
      </div>

      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 36px', animation: 'fadeInUp 0.35s ease both' }}>
        <div style={{ marginBottom: 28 }}>{s.art}</div>
        <h1 style={{ fontSize: 24, color: 'var(--text)', marginBottom: 10 }}>{s.title}</h1>
        <p style={{ fontSize: 14.5, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 300 }}>{s.text}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 20 }}>
        {SLIDES.map((_, n) => (
          <span key={n} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 4, background: n === i ? 'var(--accent)' : 'var(--border)', transition: 'all 0.25s' }} />
        ))}
      </div>

      <div style={{ padding: '0 24px 28px' }}>
        <button onClick={() => last ? finish() : setI(i + 1)} className="btn-primary" style={{ width: '100%' }}>
          {last ? t('onboarding.get_started') : t('onboarding.next')}
        </button>
      </div>
    </div>,
    document.getElementById('root')
  )
}
