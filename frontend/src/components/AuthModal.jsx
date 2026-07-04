import { useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { useLang } from '../i18n'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)


export default function AuthModal({ onClose, onSignIn, onSignUp, onSignInOAuth }) {
  const { t } = useLang()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    setError('')
    if (!email || !password) { setError(t('auth_modal.error_fill')); return }
    if (password.length < 6) { setError(t('auth_modal.error_short')); return }
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error: e } = await onSignIn(email, password)
        if (e) { setError(e.message === 'Invalid login credentials' ? t('auth_modal.error_invalid') : e.message); return }
        onClose()
      } else {
        const { error: e } = await onSignUp(email, password)
        if (e) { setError(e.message); return }
        setDone(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider) => {
    setOauthLoading(provider)
    try {
      const { error: e } = await onSignInOAuth(provider)
      if (e) setError(e.message)
    } finally {
      setOauthLoading(null)
    }
  }

  const content = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 400, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', animation: 'fadeIn 0.22s ease both' }} />
      <div style={{
        position: 'relative', background: 'var(--bg)', borderRadius: '22px 22px 0 0',
        animation: 'slideUp 0.35s cubic-bezier(.22,1,.36,1) both',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--surface-2)', margin: '12px auto 0' }} />

        {done ? (
          <div style={{ padding: '32px 24px 48px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#2DB87A22', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#2DB87A' }}>
              <Icon name="shield" size={30} strokeWidth={1.8} />
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>{t('auth_modal.confirm_email_title')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
              {t('auth_modal.confirm_email_body', { email })}
            </p>
            <button onClick={onClose} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'var(--accent)', color: 'white', fontSize: 15, fontWeight: 900, fontFamily: 'Nunito', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        ) : (
          <div style={{ padding: '20px 20px 40px' }}>
            {/* Logo + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <img src="/web-app-manifest-192x192.png" alt="Vyllo" style={{ width: 40, height: 40, borderRadius: 10 }} />
              <div>
                <h2 style={{ fontSize: 18, margin: 0 }}>
                  {mode === 'login' ? t('auth_modal.sign_in_title') : t('auth_modal.create_account_title')}
                </h2>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  {mode === 'login' ? t('auth_modal.sign_in_desc') : t('auth_modal.create_desc')}
                </p>
              </div>
            </div>

            {/* OAuth buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => handleOAuth('google')}
                disabled={!!oauthLoading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 0', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer', opacity: oauthLoading === 'google' ? 0.6 : 1 }}
              >
                <GoogleIcon />
                {oauthLoading === 'google' ? t('auth_modal.redirecting') : t('auth_modal.google_btn')}
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{t('auth_modal.or')}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Email/password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <input
                type="email" placeholder={t('auth_modal.email_placeholder')} value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ padding: '13px 14px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'Nunito', outline: 'none' }}
              />
              <input
                type="password" placeholder={t('auth_modal.password_placeholder')} value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                style={{ padding: '13px 14px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'Nunito', outline: 'none' }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 12, color: '#FF4757', marginBottom: 10, fontWeight: 700 }}>{error}</p>
            )}

            <button
              onClick={submit} disabled={loading}
              style={{ width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', cursor: loading ? 'default' : 'pointer', color: 'white', fontSize: 15, fontWeight: 900, fontFamily: 'Nunito', opacity: loading ? 0.7 : 1, background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))', backgroundSize: '200% 100%', animation: 'premiumFlow 4s linear infinite', marginBottom: 10 }}
            >
              {loading ? t('auth_modal.processing') : mode === 'login' ? t('auth_modal.sign_in_btn') : t('auth_modal.create_btn')}
            </button>

            <button
              onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError('') }}
              style={{ width: '100%', padding: '10px 0', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer' }}
            >
              {mode === 'login' ? `${t('auth_modal.no_account')} ${t('auth_modal.sign_up_link')}` : `${t('auth_modal.have_account')} ${t('auth_modal.sign_in_link')}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.getElementById('root'))
}
