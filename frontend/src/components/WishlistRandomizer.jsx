import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CoverImage from './CoverImage'
import Icon from './Icon'
import { CAT_COLOR } from '../utils'

export default function WishlistRandomizer({ items, color = 'var(--accent)', onClose, onPick }) {
  const [current, setCurrent] = useState(0)
  const [spinning, setSpinning] = useState(true)
  const [final, setFinal] = useState(null)
  const timerRef = useRef(null)
  const root = (typeof document !== 'undefined' && document.getElementById('root')) || null

  const start = () => {
    if (!items.length) return
    setSpinning(true)
    setFinal(null)
    const len = items.length
    const target = Math.floor(Math.random() * len)
    const loops = len <= 2 ? 4 : 3
    const totalSteps = loops * len + target   // termina exatamente em `target`
    let step = 0
    let idx = 0
    setCurrent(0)

    const tick = () => {
      idx = (idx + 1) % len
      step++
      setCurrent(idx)
      if (step >= totalSteps) {
        setFinal(items[idx])
        setSpinning(false)
        return
      }
      const t = step / totalSteps
      const delay = 45 + Math.pow(t, 3) * 280   // desacelera no fim
      timerRef.current = setTimeout(tick, delay)
    }
    timerRef.current = setTimeout(tick, 45)
  }

  useEffect(() => {
    start()
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = final || items[current]
  if (!item) return null
  const itColor = CAT_COLOR[item.category] || color

  const overlay = (
    <div onClick={e => e.target === e.currentTarget && !spinning && onClose()}
      style={{
        position: 'absolute', inset: 0, zIndex: 450, borderRadius: 'inherit', overflow: 'hidden',
        background: 'rgba(10,8,18,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 28, animation: 'fadeIn 0.25s ease both',
      }}>
      <p style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1, color: 'rgba(255,255,255,0.92)', marginBottom: 8 }}>
        O que vem aí?
      </p>

      {/* Capa com borda de luz à volta do item escolhido */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '34px 0' }}>
        <div key={final ? 'final' : current} style={{
          position: 'relative', width: 168,
          animation: spinning ? 'popIn 0.12s ease both' : 'popIn 0.45s cubic-bezier(.34,1.56,.64,1) both',
        }}>
          <div style={{
            width: '100%', aspectRatio: '2/3', borderRadius: 16,
            boxShadow: spinning
              ? '0 12px 30px rgba(0,0,0,0.5)'
              : `0 0 0 3px ${itColor}, 0 0 16px ${itColor}, 0 0 42px ${itColor}aa, 0 14px 34px rgba(0,0,0,0.45)`,
            transition: 'box-shadow 0.4s ease',
          }}>
            <CoverImage src={item.cover} category={item.category} radius={16} fill title={item.title} />
          </div>
        </div>
      </div>

      {/* Título */}
      <p style={{ fontSize: 16, fontWeight: 800, color: 'white', marginTop: 18, textAlign: 'center', maxWidth: 260, lineHeight: 1.25 }}>
        {item.title}
      </p>
      {item.subtitle && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 3, textAlign: 'center' }}>{item.subtitle}</p>
      )}

      {/* Ações (só no fim) */}
      {!spinning && (
        <div style={{ display: 'flex', gap: 10, marginTop: 24, animation: 'fadeInUp 0.3s ease 0.1s both' }}>
          <button onClick={start}
            style={{ padding: '11px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: final ? CAT_COLOR[final.category] : color, display: 'inline-flex' }}><Icon name="dice" size={16} strokeWidth={2.2} /></span> De novo
          </button>
          <button onClick={() => onPick(final)}
            style={{ padding: '11px 22px', borderRadius: 14, background: itColor, color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', boxShadow: `0 6px 18px ${itColor}88` }}>
            Ver detalhes
          </button>
        </div>
      )}

      {!spinning && (
        <button onClick={onClose} style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)', background: 'none', fontFamily: 'Nunito', fontWeight: 700 }}>
          Fechar
        </button>
      )}
    </div>
  )

  return root ? createPortal(overlay, root) : overlay
}
