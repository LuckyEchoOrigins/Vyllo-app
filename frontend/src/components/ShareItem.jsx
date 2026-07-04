import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CAT_COLOR, CAT_EMOJI } from '../utils'

function loadImg(src) {
  if (!src) return Promise.resolve(null)
  const tryUrl = (url) => new Promise(res => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })
  // Try direct first (works for TMDB); fallback via proxy for non-CORS sources (TVmaze, etc.)
  return tryUrl(src).then(img => img || tryUrl(`/api/imgproxy?url=${encodeURIComponent(src)}`))
}

async function render(item, canvas, brand = ['#F7901E', '#E0459E', '#7C3AED']) {
  const W = 540, H = 960
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  const cover = await loadImg(item.cover)
  const color = CAT_COLOR[item.category] || '#7C3AED'

  // ── Fundo ────────────────────────────────────────────────────────────────
  if (cover) {
    ctx.save()
    ctx.filter = 'blur(40px) brightness(0.35) saturate(1.6)'
    const ir = cover.width / cover.height
    const fr = W / H
    let sx = 0, sy = 0, sw = cover.width, sh = cover.height
    if (ir > fr) { sw = cover.height * fr; sx = (cover.width - sw) / 2 }
    else          { sh = cover.width / fr; sy = (cover.height - sh) / 2 }
    ctx.drawImage(cover, sx, sy, sw, sh, -40, -40, W + 80, H + 80)
    ctx.restore()
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#1a0533')
    grad.addColorStop(1, '#08060e')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  // ── Capa centrada ─────────────────────────────────────────────────────────
  const CW = 280, CH = 420
  const contentH = CH + 42 + 28 + 50 + 68 + 28
  const CY = Math.round((H - contentH) / 2)
  const CX = (W - CW) / 2

  // Gradiente escuro a partir do terço inferior da capa para tornar o texto legível
  const overlay = ctx.createLinearGradient(0, CY + CH * 0.5, 0, H)
  overlay.addColorStop(0, 'rgba(0,0,0,0)')
  overlay.addColorStop(1, 'rgba(0,0,0,0.92)')
  ctx.fillStyle = overlay
  ctx.fillRect(0, 0, W, H)

  // ── Linha fina + "Vyllo" mesmo acima da capa ─────────────────────────────
  const LINE_Y = CY - 20
  const lineGrad = ctx.createLinearGradient(CX, 0, CX + CW, 0)
  lineGrad.addColorStop(0, brand[0]); lineGrad.addColorStop(0.5, brand[1]); lineGrad.addColorStop(1, brand[2])
  ctx.fillStyle = lineGrad
  ctx.fillRect(CX, LINE_Y, CW, 3)

  // "Vyllo" acima da linha, na mesma cor (gradiente)
  ctx.save()
  const textGrad = ctx.createLinearGradient(W * 0.3, 0, W * 0.7, 0)
  textGrad.addColorStop(0, brand[0]); textGrad.addColorStop(0.5, brand[1]); textGrad.addColorStop(1, brand[2])
  ctx.fillStyle = textGrad
  ctx.font = 'bold 18px Nunito, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Vyllo', W / 2, LINE_Y - 8)
  ctx.restore()

  if (cover) {
    // Sombra
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur  = 50
    ctx.shadowOffsetY = 20
    ctx.beginPath()
    ctx.roundRect(CX, CY, CW, CH, 16)
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.restore()

    // Imagem
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(CX, CY, CW, CH, 16)
    ctx.clip()
    const ir = cover.width / cover.height
    const tr = CW / CH
    let sx = 0, sy = 0, sw = cover.width, sh = cover.height
    if (ir > tr) { sw = cover.height * tr; sx = (cover.width - sw) / 2 }
    else         { sh = cover.width / tr; sy = (cover.height - sh) / 2 }
    ctx.drawImage(cover, sx, sy, sw, sh, CX, CY, CW, CH)
    ctx.restore()
  } else {
    // Placeholder com emoji da categoria
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(CX, CY, CW, CH, 16)
    ctx.fillStyle = color + '33'
    ctx.fill()
    ctx.font = '80px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(CAT_EMOJI[item.category] || '📽', CX + CW / 2, CY + CH / 2)
    ctx.restore()
  }

  // ── Estrelas ──────────────────────────────────────────────────────────────
  const rating = item.rating || 0
  const starY  = CY + CH + 42
  const starSize = 28, starGap = 6
  const totalStarW = 5 * starSize + 4 * starGap
  let sx2 = (W - totalStarW) / 2

  for (let i = 1; i <= 5; i++) {
    const filled = rating >= i
    const half   = !filled && rating >= i - 0.5
    ctx.save()
    ctx.font = `${starSize}px serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = filled || half ? 1 : 0.25
    ctx.fillStyle = filled || half ? '#FFD700' : '#ffffff'
    ctx.fillText(filled ? '★' : half ? '⯨' : '☆', sx2, starY)
    ctx.restore()
    sx2 += starSize + starGap
  }

  // ── Título ───────────────────────────────────────────────────────────────
  const title = item.title || ''
  const titleY = starY + 50
  ctx.save()
  ctx.fillStyle = 'white'
  ctx.font = 'bold 26px Nunito, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  // Quebrar título se for longo
  const maxW = W - 60
  const words = title.split(' ')
  let line = '', lines = []
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w }
    else line = test
  }
  if (line) lines.push(line)
  lines = lines.slice(0, 2)
  lines.forEach((l, i) => ctx.fillText(l, W / 2, titleY + i * 34))
  ctx.restore()

  // Ano
  if (item.year || item.release_year) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '16px Nunito, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(String(item.year || item.release_year), W / 2, titleY + lines.length * 34 + 8)
    ctx.restore()
  }


  return canvas.toDataURL('image/png')
}

export default function ShareItem({ item, onClose }) {
  const canvasRef = useRef(null)
  const [imgUrl, setImgUrl]  = useState(null)
  const [busy,   setBusy]    = useState(true)
  const root = (typeof document !== 'undefined' && document.getElementById('root')) || null

  useEffect(() => {
    let cancelled = false
    const s = getComputedStyle(document.documentElement)
    const brand = [
      s.getPropertyValue('--brand-1').trim() || '#F7901E',
      s.getPropertyValue('--brand-2').trim() || '#E0459E',
      s.getPropertyValue('--brand-3').trim() || '#7C3AED',
    ]
    ;(async () => {
      const url = await render(item, canvasRef.current, brand)
      if (!cancelled) { setImgUrl(url); setBusy(false) }
    })()
    return () => { cancelled = true }
  }, [item])

  const filename = `${(item.title || 'item').replace(/\s+/g, '-').toLowerCase()}-vyllo.png`

  const download = () => {
    if (!imgUrl) return
    const a = document.createElement('a')
    a.href = imgUrl; a.download = filename; a.click()
  }

  const share = async () => {
    if (!imgUrl) return
    try {
      const blob = await (await fetch(imgUrl)).blob()
      const file = new File([blob], filename, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: item.title, text: `${item.title} — tracked on Vyllo` })
      } else {
        download()
      }
    } catch { download() }
  }

  const overlay = (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'absolute', inset: 0, zIndex: 500, borderRadius: 'inherit', overflow: 'hidden',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 0.22s ease both',
      }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ width: '100%', maxWidth: 320, background: 'var(--surface)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', animation: 'slideUp 0.3s cubic-bezier(.34,1.4,.64,1) both' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Partilhar</p>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: '0 16px', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {busy
            ? <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '40px 0', animation: 'pulse 1s infinite' }}>A gerar imagem…</p>
            : imgUrl
              ? <img src={imgUrl} alt="" style={{ maxWidth: '100%', maxHeight: 380, borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }} />
              : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0' }}>Não foi possível gerar a imagem.</p>}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: 16 }}>
          <button onClick={download} disabled={!imgUrl}
            style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', cursor: imgUrl ? 'pointer' : 'default', opacity: imgUrl ? 1 : 0.5 }}>
            ⬇ Guardar
          </button>
          <button onClick={share} disabled={!imgUrl}
            style={{ flex: 1.4, padding: '12px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#F7901E,#E0459E,#7C3AED)', color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', cursor: imgUrl ? 'pointer' : 'default', opacity: imgUrl ? 1 : 0.5 }}>
            Partilhar
          </button>
        </div>
      </div>
    </div>
  )

  return root ? createPortal(overlay, root) : overlay
}
