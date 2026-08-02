// Página mostrada a browsers normais quando BLOCK_WEB está ativo. As apps
// nativas nunca chegam aqui (passam em isNativeApp()). Sem dependências do
// resto da app, para carregar leve e rápido.

const APP_STORE_URL = '' // preencher quando a app estiver publicada
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.vyllo_app.twa'

export default function Landing() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24,
      background: '#0E0E14', color: '#ECEAF3', textAlign: 'center',
      fontFamily: 'Nunito, system-ui, sans-serif',
    }}>
      <img src="/web-app-manifest-192x192.png" alt="Vyllo" width={96} height={96}
        style={{ borderRadius: 21, border: '.7px solid rgba(255,255,255,.14)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-.02em' }}>Vyllo</h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: '#9C97AE', fontWeight: 600 }}>
          Organiza e acompanha a tua coleção de livros, jogos, filmes e séries.
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6E6A80', fontWeight: 700 }}>
          Disponível nas apps para iOS e Android.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        <StoreButton
          href={APP_STORE_URL}
          top="Descarrega na"
          bottom="App Store"
          icon={<AppleIcon />}
        />
        <StoreButton
          href={PLAY_STORE_URL}
          top="Disponível no"
          bottom="Google Play"
          icon={<PlayIcon />}
        />
      </div>
    </div>
  )
}

function StoreButton({ href, top, bottom, icon }) {
  const soon = !href
  return (
    <a
      href={href || undefined}
      onClick={soon ? (e) => e.preventDefault() : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '11px 18px', borderRadius: 14, textDecoration: 'none',
        background: '#17171F', border: '1px solid #2A2836', color: '#ECEAF3',
        cursor: soon ? 'default' : 'pointer', opacity: soon ? 0.55 : 1,
        minWidth: 168,
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ textAlign: 'left', lineHeight: 1.15 }}>
        <span style={{ display: 'block', fontSize: 10.5, color: '#9C97AE', fontWeight: 600 }}>
          {soon ? 'Brevemente na' : top}
        </span>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{bottom}</span>
      </span>
    </a>
  )
}

function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 1.5c.1 1-.3 2-1 2.8-.7.8-1.8 1.4-2.8 1.3-.1-1 .4-2 1-2.7.7-.8 1.9-1.3 2.8-1.4zM19.9 17c-.5 1.2-.8 1.7-1.5 2.7-1 1.5-2.4 3.3-4.1 3.3-1.5 0-1.9-1-4-1-2 0-2.5 1-4 1-1.7 0-3-1.6-4-3.1-2.8-4.2-3.1-9.1-1.4-11.7 1.2-1.9 3.1-3 4.9-3 1.8 0 3 1 4.5 1 1.5 0 2.4-1 4.5-1 1.6 0 3.3.9 4.5 2.4-4 2.2-3.3 7.9.6 9.4z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M3.6 2.4c-.3.3-.5.7-.5 1.3v16.6c0 .6.2 1 .5 1.3l.1.1L13 12.1v-.2L3.7 2.3z" fill="#00D4FF" />
      <path d="M16.3 15.4L13 12.1v-.2l3.3-3.3.1.1 3.9 2.2c1.1.6 1.1 1.7 0 2.3l-3.9 2.2z" fill="#FFCE00" />
      <path d="M16.4 15.3L13 12 3.6 21.6c.4.4 1 .4 1.7 0l11.1-6.3" fill="#FF3D44" />
      <path d="M16.4 8.7L5.3 2.4c-.7-.4-1.3-.4-1.7 0L13 12l3.4-3.3z" fill="#00F076" />
    </svg>
  )
}
