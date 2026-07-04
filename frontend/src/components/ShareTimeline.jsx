import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CAT_COLOR, CAT_EMOJI } from '../utils'

// Carrega uma imagem com CORS (se falhar devolve null → desenha-se um placeholder)
function loadImg(src) {
  return new Promise(res => {
    if (!src) return res(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

// Desenha a imagem em modo "cover" dentro de um retângulo arredondado
function drawCover(ctx, img, x, y, w, h, r) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.clip()
  const ir = img.width / img.height
  const tr = w / h
  let sx = 0, sy = 0, sw = img.width, sh = img.height
  if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2 }
  else { sh = img.width / tr; sy = (img.height - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

function eventLabel(e) {
  if (e.type === 'start') return 'Started'
  if (e.type === 'episode') return e.count > 1 ? `+${e.count} eps` : '+1 ep'
  return 'Completed'
}

export default function ShareTimeline({ events, monthName, year, onClose }) {
  const canvasRef = useRef(null)
  const [imgUrl, setImgUrl] = useState(null)
  const [busy, setBusy] = useState(true)
  const root = (typeof document !== 'undefined' && document.getElementById('root')) || null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const url = await render(events, monthName, year, canvasRef.current)
      if (!cancelled) { setImgUrl(url); setBusy(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const download = () => {
    if (!imgUrl) return
    const a = document.createElement('a')
    a.href = imgUrl
    a.download = `timeline-${monthName}-${year}.png`
    a.click()
  }

  const share = async () => {
    if (!imgUrl) return
    try {
      const blob = await (await fetch(imgUrl)).blob()
      const file = new File([blob], `timeline-${monthName}-${year}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My timeline', text: `My timeline for ${monthName} ${year}` })
      } else {
        download()
      }
    } catch { download() }
  }

  const overlay = (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'absolute', inset: 0, zIndex: 500, borderRadius: 'inherit', overflow: 'hidden',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn 0.25s ease both',
      }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ width: '100%', maxWidth: 340, background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'slideIn 0.3s ease both' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Share timeline</p>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ padding: '0 16px', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {busy
            ? <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '40px 0', animation: 'pulse 1s infinite' }}>Generating image…</p>
            : imgUrl
              ? <img src={imgUrl} alt="" style={{ maxWidth: '100%', maxHeight: 440, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }} />
              : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0' }}>Could not generate the image.</p>}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: 16 }}>
          <button onClick={download} disabled={!imgUrl}
            style={{ flex: 1, padding: '12px 0', borderRadius: 14, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', opacity: imgUrl ? 1 : 0.5 }}>
            ⬇ Save
          </button>
          <button onClick={share} disabled={!imgUrl}
            style={{ flex: 1.4, padding: '12px 0', borderRadius: 14, background: 'linear-gradient(135deg,#F7901E,#E0459E,#7C3AED)', color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', opacity: imgUrl ? 1 : 0.5 }}>
            Share
          </button>
        </div>
      </div>
    </div>
  )

  return root ? createPortal(overlay, root) : overlay
}

// ── Desenho da imagem ───────────────────────────────────────────────────────
async function render(events, monthName, year, canvas) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch {}
  const W = 1080
  const M = 96
  const cols = 4
  const stepX = (W - 2 * M) / cols
  const coverW = Math.min(stepX * 0.6, 150)
  const coverH = coverW * 1.34
  const labelH = 96
  const rowH = coverH + labelH
  const headerH = 230
  const footerH = 90
  const n = events.length
  const rows = Math.max(1, Math.ceil(n / cols))
  const naturalH = headerH + rows * rowH + footerH
  const H = 1920  // fixo 9:16

  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Fundo preenche o canvas completo (9:16)
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#17131F')
  bg.addColorStop(1, '#0C0A14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Centra o conteúdo verticalmente; escala se houver muitos itens
  const scale = naturalH > H ? H / naturalH : 1
  const offsetY = Math.round((H - naturalH * scale) / 2)
  ctx.save()
  ctx.translate(0, offsetY)
  if (scale < 1) ctx.scale(scale, scale)

  // Cabeçalho
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '900 58px Nunito, sans-serif'
  ctx.fillText('My Timeline', W / 2, 110)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '700 30px Nunito, sans-serif'
  const cap = monthName ? `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}` : `${year}`
  ctx.fillText(cap, W / 2, 158)

  // Posições (serpentina: linhas alternam direção)
  const lineY = (r) => headerH + r * rowH + coverH / 2 + 8
  const leftX = M, rightX = W - M
  const pos = events.map((e, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    const colPos = row % 2 === 0 ? col : (cols - 1 - col)
    return { cx: M + colPos * stepX + stepX / 2, cy: lineY(row), row }
  })

  // ── Linha serpentina (curvas suaves + cor por categoria dos items) ──
  ctx.lineWidth = 13
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const R = 46   // raio das curvas
  const colorOf = (i) => CAT_COLOR[events[i].item.category] || '#888888'

  const strokeSeg = (pts, c1, c2) => {
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1])
    g.addColorStop(0, c1); g.addColorStop(1, c2)
    ctx.strokeStyle = g
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let k = 1; k < pts.length - 1; k++) ctx.arcTo(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], R)
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    ctx.stroke()
  }

  const edgeAfterRow = (r) => (r % 2 === 0 ? rightX : leftX)

  if (pos.length) {
    // cauda inicial: do canto superior esquerdo até ao 1º item
    strokeSeg([[leftX, lineY(0)], [pos[0].cx, pos[0].cy]], colorOf(0), colorOf(0))
    // segmentos entre items consecutivos (cor A → cor B)
    for (let i = 0; i < pos.length - 1; i++) {
      const a = pos[i], b = pos[i + 1]
      const pts = a.row === b.row
        ? [[a.cx, a.cy], [b.cx, b.cy]]
        : [[a.cx, a.cy], [edgeAfterRow(a.row), a.cy], [edgeAfterRow(a.row), b.cy], [b.cx, b.cy]]
      strokeSeg(pts, colorOf(i), colorOf(i + 1))
    }
    // cauda final: do último item até à borda
    const last = pos[pos.length - 1]
    strokeSeg([[last.cx, last.cy], [edgeAfterRow(last.row), lineY(last.row)]], colorOf(pos.length - 1), colorOf(pos.length - 1))
  }

  // Bolas nas pontas
  const dot = (x, y, color) => {
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
  }
  if (pos.length) {
    dot(leftX, lineY(0), colorOf(0))
    const last = pos[pos.length - 1]
    dot(edgeAfterRow(last.row), lineY(last.row), colorOf(pos.length - 1))
  }

  // ── Capas + etiquetas ──
  const imgs = await Promise.all(events.map(e => loadImg(e.item.cover)))

  events.forEach((e, i) => {
    const { cx, cy } = pos[i]
    const color = CAT_COLOR[e.item.category] || '#888'
    const x = cx - coverW / 2, y = cy - coverH / 2

    // anel da categoria
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x - 4, y - 4, coverW + 8, coverH + 8, 16)
    ctx.fillStyle = color
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 6
    ctx.fill()
    ctx.restore()

    if (imgs[i]) {
      drawCover(ctx, imgs[i], x, y, coverW, coverH, 12)
    } else {
      ctx.save()
      ctx.beginPath(); ctx.roundRect(x, y, coverW, coverH, 12); ctx.clip()
      ctx.fillStyle = '#FFFFFF14'; ctx.fillRect(x, y, coverW, coverH)
      ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = '48px sans-serif'
      ctx.fillText(CAT_EMOJI[e.item.category] || '🎬', cx, cy + 16)
      ctx.restore()
    }

    // etiqueta (tipo + data + título)
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.font = '800 22px Nunito, sans-serif'
    ctx.fillText(eventLabel(e), cx, y + coverH + 34)

    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '600 19px Nunito, sans-serif'
    const d = new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    ctx.fillText(d, cx, y + coverH + 58)

    ctx.fillStyle = '#FFFFFF'
    ctx.font = '700 20px Nunito, sans-serif'
    let title = e.item.title || ''
    const maxW = stepX - 16
    while (ctx.measureText(title).width > maxW && title.length > 1) title = title.slice(0, -1)
    if (title !== (e.item.title || '')) title = title.slice(0, -1) + '…'
    ctx.fillText(title, cx, y + coverH + 82)
  })

  // Rodapé
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '800 26px Nunito, sans-serif'
  ctx.fillText('Vyllo', W / 2, naturalH - 38)

  ctx.restore()

  return new Promise(resolve => {
    try { canvas.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), 'image/png') }
    catch { resolve(null) }
  })
}
