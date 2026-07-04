import { useState, useEffect, useRef } from 'react'
import { CAT_COLOR, isPremium } from '../utils'
import { optimizeImageUrl } from '../utils/cloudinary'
import CategoryIcon from './CategoryIcon'

// CDNs alternativos da Steam (se um falhar/for bloqueado, tenta o seguinte)
const STEAM_CDNS = [
  'cdn.akamai.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'cdn.steamstatic.com',
]

function steamFallback(url, attempt) {
  for (const host of STEAM_CDNS) {
    if (url.includes(host)) {
      const next = STEAM_CDNS[STEAM_CDNS.indexOf(host) + 1]
      return next ? url.replace(host, next) : null
    }
  }
  return null
}

export default function CoverImage({ src, category, size = 56, radius = 10, fill = false, title, isMovie = false }) {
  const isManual = typeof src === 'string' && src.startsWith('data:')
  const baseSrc = (isMovie && !isPremium() && !isManual) ? null : src
  const effectiveSrc = baseSrc ? optimizeImageUrl(baseSrc) : null
  const [current, setCurrent] = useState(effectiveSrc)
  const [err, setErr] = useState(false)
  const [visible, setVisible] = useState(false)
  const prevSrc = useRef(null)

  useEffect(() => {
    if (effectiveSrc !== prevSrc.current) {
      prevSrc.current = effectiveSrc
      setCurrent(effectiveSrc)
      setErr(false)
      setVisible(false)
    }
  }, [effectiveSrc])

  // Modo fill → preenche 100% do contentor (posição absoluta, à prova de flexbox)
  const dims = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%' }
    : { width: size, height: size * 1.4, flexShrink: 0, display: 'block' }

  if (!effectiveSrc || err) {
    const color = CAT_COLOR[category]
    const big = fill || size >= 76   // espaço suficiente para mostrar o título

    // "Poster tipográfico" — placeholder premium e intencional quando não há capa
    if (big && title) {
      const titleSize = fill ? 15 : Math.max(11, Math.round(size * 0.135))
      const wmSize = fill ? 150 : Math.round(size * 1.5)
      return (
        <div style={{
          ...dims,
          ...(fill ? {} : { position: 'relative' }),
          borderRadius: radius,
          background: `linear-gradient(150deg, ${color} 0%, ${color}E6 38%, #15151F 150%)`,
          overflow: 'hidden', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Marca de água — ícone grande, muito subtil */}
          <span style={{ position: 'absolute', right: '-16%', bottom: '-14%', color: 'rgba(255,255,255,0.10)', display: 'flex', pointerEvents: 'none' }}>
            <CategoryIcon cat={category} size={wmSize} strokeWidth={1.5} />
          </span>
          {/* Brilho superior */}
          <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.12), transparent 40%)', pointerEvents: 'none' }} />
          {/* Conteúdo */}
          <div style={{ position: 'relative', zIndex: 1, padding: '0 12%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
            <span style={{ color: 'rgba(255,255,255,0.92)', display: 'flex' }}>
              <CategoryIcon cat={category} size={fill ? 22 : 18} strokeWidth={2.2} />
            </span>
            <p style={{
              color: '#fff', fontWeight: 800, textAlign: 'center', lineHeight: 1.28,
              fontSize: titleSize, letterSpacing: 0.2,
              textShadow: '0 1px 6px rgba(0,0,0,0.4)',
              display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {title}
            </p>
            <span style={{ width: 22, height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.55)' }} />
          </div>
        </div>
      )
    }

    // Placeholder compacto (thumbnails pequenos)
    return (
      <div style={{
        ...dims,
        borderRadius: radius,
        background: color + '22',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
      }}>
        <CategoryIcon cat={category} size={fill ? 44 : Math.round(size * 0.42)} />
      </div>
    )
  }

  return (
    <img
      src={current}
      alt=""
      decoding="async"
      loading="lazy"
      onLoad={() => setVisible(true)}
      onError={() => {
        const next = steamFallback(current)
        if (next) { setCurrent(next); setVisible(false) }
        else setErr(true)
      }}
      style={{
        ...dims,
        borderRadius: radius,
        objectFit: 'cover',
        display: 'block',
        background: 'var(--surface-2)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.18s ease',
      }}
    />
  )
}
