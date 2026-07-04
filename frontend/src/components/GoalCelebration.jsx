import { useEffect, useRef } from 'react'
import { haptic } from '../feedback'
import { createPortal } from 'react-dom'
import CategoryIcon from './CategoryIcon'
import Icon from './Icon'
import { CAT_COLOR } from '../utils'
import { useLang } from '../i18n'

const CONFETTI_COLORS = [
  '#7C3AED', '#E0459E', '#F7901E', '#FFD700',
  '#2DB87A', '#3B82F6', '#FF6B6B', '#FBBF24', '#A78BFA', '#F472B6',
]


function ConfettiCanvas() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const parent = canvas.parentElement
    const W = parent.offsetWidth
    const H = parent.offsetHeight
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')

    const make = () => ({
      x: Math.random() * W,
      y: -(Math.random() * H * 0.6),
      w: Math.random() * 10 + 5,
      h: Math.random() * 5 + 3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      speed: Math.random() * 3.5 + 1.5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.2,
      drift: (Math.random() - 0.5) * 2,
      shape: Math.random() > 0.7 ? 'circle' : 'rect',
    })

    const particles = Array.from({ length: 160 }, make)

    const DURATION = 5000
    const start = Date.now()
    let raf

    const draw = () => {
      const elapsed = Date.now() - start
      const t = Math.min(elapsed / DURATION, 1)
      ctx.clearRect(0, 0, W, H)

      particles.forEach(p => {
        p.y += p.speed
        p.x += p.drift
        p.angle += p.spin

        // recicla partículas na primeira metade da animação
        if (p.y > H + 20 && t < 0.5) {
          p.y = -20
          p.x = Math.random() * W
          p.speed = Math.random() * 3.5 + 1.5
          p.drift = (Math.random() - 0.5) * 2
        }

        const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
        ctx.globalAlpha = alpha

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        if (p.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      })

      ctx.globalAlpha = 1
      if (t < 1) raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none',
    }} />
  )
}

export default function GoalCelebration({ cat, done, goal, onClose }) {
  const { t } = useLang()
  useEffect(() => {
    haptic([12, 50, 8, 50, 16])
    const timer = setTimeout(onClose, 5500)
    return () => clearTimeout(timer)
  }, [onClose])

  const cv = `var(--cat-${cat}, var(--accent))`
  const plural = cat === 'book' ? t('goal_celebration.books') : cat === 'game' ? t('goal_celebration.games') : t('goal_celebration.films')
  const mix = (pct) => `color-mix(in srgb, ${cv} ${pct}%, transparent)`

  return createPortal(
    <div style={{
      position: 'absolute', inset: 0, zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.25s ease both',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.65)',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 2,
        background: 'var(--bg)', borderRadius: 28,
        width: 'calc(100% - 48px)', maxWidth: 340,
        textAlign: 'center', overflow: 'hidden',
        animation: 'popIn 0.5s cubic-bezier(.34,1.56,.64,1) 0.1s both',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        {/* Barra de cor no topo */}
        <div style={{
          height: 6,
          background: `linear-gradient(90deg, ${mix(80)}, ${cv}, ${mix(80)})`,
          backgroundSize: '200% 100%',
          animation: 'premiumFlow 3s linear infinite',
        }} />

        <div style={{ padding: '28px 28px 32px' }}>
          {/* Ícone troféu */}
          <div style={{
            width: 86, height: 86, borderRadius: '50%', margin: '0 auto 18px',
            background: mix(10),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: cv,
            animation: 'popIn 0.55s cubic-bezier(.34,1.56,.64,1) 0.25s both',
          }}>
            <Icon name="trophy" size={42} strokeWidth={1.7} />
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', marginBottom: 8 }}>
            {t('goal_celebration.title')}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
            {t('goal_celebration.message', { done, plural })}<br />
            {t('goal_celebration.congrats')}
          </p>

          {/* Contador */}
          <div style={{
            background: mix(8),
            border: `1.5px solid ${mix(20)}`,
            borderRadius: 18, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            marginBottom: 22,
          }}>
            <span style={{ color: cv, display: 'flex' }}>
              <CategoryIcon cat={cat} size={22} strokeWidth={2.1} />
            </span>
            <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{done}</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 700 }}>
              / {goal} {plural}
            </span>
          </div>

          <button onClick={onClose} style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none',
            cursor: 'pointer', color: 'white', fontSize: 15, fontWeight: 900,
            fontFamily: 'Nunito', background: cv,
            boxShadow: `0 8px 24px ${mix(33)}`,
          }}>
            {t('goal_celebration.continue')}
          </button>
        </div>
      </div>

      {/* Confetti — por cima do card */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3,
        pointerEvents: 'none', overflow: 'hidden',
      }}>
        <ConfettiCanvas />
      </div>
    </div>,
    document.getElementById('root')
  )
}
