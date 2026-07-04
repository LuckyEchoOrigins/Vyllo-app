import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CAT_COLOR } from '../utils'
import { useLang } from '../i18n'

const ORDER = ['book', 'game', 'film']

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

export default function ShareShelf({ shelf, year, onClose }) {
  const { t } = useLang()
  const canvasRef = useRef(null)
  const [imgUrl, setImgUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  // null = picker step; 'all' | 'book' | 'game' | 'film' = poster step
  const [catFilter, setCatFilter] = useState(null)
  const root = (typeof document !== 'undefined' && document.getElementById('root')) || null

  const catName = (cat) => cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('share_shelf.films')

  useEffect(() => {
    if (catFilter === null) return
    let cancelled = false
    setBusy(true)
    setImgUrl(null)
    ;(async () => {
      const filtered = catFilter === 'all' ? shelf : shelf.filter(i => i.category === catFilter)
      const subtitle = catFilter === 'all' ? null : catName(catFilter)
      const labels = {
        myShelf: t('share_shelf.my_shelf'),
        completed: t('share_shelf.completed'),
      }
      const url = await render(filtered, year, canvasRef.current, subtitle, labels, catName)
      if (!cancelled) { setImgUrl(url); setBusy(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catFilter])

  const goBack = () => { setCatFilter(null); setImgUrl(null); setBusy(false) }

  const download = () => {
    if (!imgUrl) return
    const a = document.createElement('a')
    a.href = imgUrl
    const suffix = catFilter && catFilter !== 'all' ? `-${catFilter}` : ''
    a.download = `shelf-${year}${suffix}.png`
    a.click()
  }

  const share = async () => {
    if (!imgUrl) return
    const cn = catFilter && catFilter !== 'all' ? ` of ${catName(catFilter)}` : ''
    try {
      const blob = await (await fetch(imgUrl)).blob()
      const suffix = catFilter && catFilter !== 'all' ? `-${catFilter}` : ''
      const file = new File([blob], `shelf-${year}${suffix}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `My shelf${cn}`, text: `My shelf${cn} for ${year} on Vyllo` })
      } else { download() }
    } catch { download() }
  }

  // Available categories with counts
  const availableCats = ORDER.filter(cat => shelf.some(i => i.category === cat))
  const totalCount = shelf.length

  // ── Picker ──────────────────────────────────────────────────────────────────
  const pickerBody = (
    <div style={{ padding: '4px 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>
        {t('share_shelf.choose_what')}
      </p>

      {/* Tudo */}
      <button
        onClick={() => setCatFilter('all')}
        style={{
          width: '100%', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
          background: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))',
          color: 'white', fontSize: 15, fontWeight: 800, fontFamily: 'Nunito',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
        <span>{t('share_shelf.entire_shelf')}</span>
        <span style={{ opacity: 0.85, fontSize: 13, fontWeight: 700 }}>{t('share_shelf.items_arrow', { n: totalCount })}</span>
      </button>

      {/* Por categoria */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: availableCats.length === 1 ? '1fr' : '1fr 1fr',
        gap: 10
      }}>
        {availableCats.map((cat, idx) => {
          const count = shelf.filter(i => i.category === cat).length
          const color = CAT_COLOR[cat]
          const spanFull = availableCats.length % 2 !== 0 && idx === availableCats.length - 1
          return (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              style={{
                padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                background: `color-mix(in srgb, ${color} 14%, var(--surface-2))`,
                border: `1.5px solid color-mix(in srgb, ${color} 40%, transparent)`,
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                gridColumn: spanFull ? 'span 2' : 'auto'
              }}>
              <span style={{ color, fontWeight: 800, fontSize: 14, fontFamily: 'Nunito' }}>{catName(cat)}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'Nunito' }}>
                {count === 1 ? t('share_shelf.item_count', { n: count }) : t('share_shelf.items_count', { n: count })}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  // ── Poster ───────────────────────────────────────────────────────────────────
  const posterBody = (
    <>
      <div style={{ padding: '0 16px', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {busy
          ? <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '40px 0', animation: 'pulse 1s infinite' }}>{t('share_shelf.generating')}</p>
          : imgUrl
            ? <img src={imgUrl} alt="" style={{ maxWidth: '100%', maxHeight: 440, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }} />
            : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0' }}>{t('share_shelf.error')}</p>}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 16 }}>
        <button onClick={download} disabled={!imgUrl}
          style={{ flex: 1, padding: '12px 0', borderRadius: 14, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', opacity: imgUrl ? 1 : 0.5 }}>
          {t('share_shelf.save')}
        </button>
        <button onClick={share} disabled={!imgUrl}
          style={{ flex: 1.4, padding: '12px 0', borderRadius: 14, background: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))', color: 'white', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', opacity: imgUrl ? 1 : 0.5 }}>
          {t('share_shelf.share')}
        </button>
      </div>
    </>
  )

  const overlay = (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'absolute', inset: 0, zIndex: 500, borderRadius: 'inherit', overflow: 'hidden', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 0.25s ease both' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ width: '100%', maxWidth: 340, background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'slideIn 0.3s ease both' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {catFilter !== null && (
              <button onClick={goBack}
                style={{ background: 'var(--surface-2)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            )}
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{t('share_shelf.title')}</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {catFilter === null ? pickerBody : posterBody}
      </div>
    </div>
  )

  return root ? createPortal(overlay, root) : overlay
}

// Lê uma var CSS (cores do tema atual)
function cssVar(name, fallback) {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback } catch { return fallback }
}

function hexA(hex, a) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

// ── Desenho — poster vertical (formato story) ──────────────────────────────────
async function render(shelf, year, canvas, subtitle = null, labels = {}, catName) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch {}

  const brand = [cssVar('--brand-1', '#F7901E'), cssVar('--brand-2', '#E0459E'), cssVar('--brand-3', '#7C3AED')]

  const W = 1080, H = 1920
  const M = 80
  const contentW = W - 2 * M

  // Grupos por categoria (apenas itens concluídos), pela ordem definida
  const groups = ORDER
    .map(cat => ({ cat, all: shelf.filter(i => i.category === cat) }))
    .filter(g => g.all.length)

  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // ── Fundo: gradiente + brilhos radiais nas cores do tema ──
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#181225'); bg.addColorStop(0.5, '#100B1A'); bg.addColorStop(1, '#08060F')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

  const glow = (cx, cy, r, color) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, hexA(color, 0.45)); g.addColorStop(1, hexA(color, 0))
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
  glow(160, 120, 620, brand[0])
  glow(W - 140, 260, 680, brand[2])
  glow(W / 2, H - 120, 700, brand[1])

  const myShelf = (labels.myShelf || 'MY SHELF').toUpperCase()
  const completedLabel = labels.completed || 'completed'

  // ── Cabeçalho ──
  ctx.textAlign = 'center'
  if (subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '800 30px Nunito, sans-serif'
    ctx.fillText(myShelf, W / 2, 140)

    const catColor = groups[0] ? (CAT_COLOR[groups[0].cat] || brand[1]) : brand[1]
    ctx.font = '900 38px Nunito, sans-serif'
    const sg = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0)
    sg.addColorStop(0, brand[0]); sg.addColorStop(0.5, catColor); sg.addColorStop(1, brand[2])
    ctx.fillStyle = sg
    ctx.fillText(subtitle.toUpperCase(), W / 2, 186)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '800 34px Nunito, sans-serif'
    ctx.fillText(myShelf, W / 2, 150)
  }

  // Ano gigante em gradiente
  ctx.font = '900 260px Nunito, sans-serif'
  const yt = `${year}`
  const tw = ctx.measureText(yt).width
  const yg = ctx.createLinearGradient((W - tw) / 2, 0, (W + tw) / 2, 0)
  yg.addColorStop(0, brand[0]); yg.addColorStop(0.5, brand[1]); yg.addColorStop(1, brand[2])
  ctx.save()
  ctx.shadowColor = hexA(brand[1], 0.5); ctx.shadowBlur = 50
  ctx.fillStyle = yg
  ctx.fillText(yt, W / 2, 400)
  ctx.restore()

  // Chips de contagem por categoria
  const total = groups.reduce((s, g) => s + g.all.length, 0)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '700 30px Nunito, sans-serif'
  const getCatFirst = (cat) => catName ? catName(cat).split(' ')[0] : cat
  const chips = groups.map(g => `${g.all.length} ${getCatFirst(g.cat)}`).join('   ·   ')
  ctx.fillText(`${total} ${completedLabel}`, W / 2, 470)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '600 26px Nunito, sans-serif'
  ctx.fillText(chips, W / 2, 512)

  // ── Layout adaptável das prateleiras ─────────────────────────────────────
  const G = groups.length
  const startY = 600
  const avail = H - startY - 130

  const maxRowsPerCat = G === 1 ? 4 : (G === 2 ? 3 : 2)
  const maxTotalRows  = G === 1 ? 4 : (G === 2 ? 5 : 4)

  const metricsFor = (cw) => {
    const coverH = Math.round(cw * 1.42)
    const gap = Math.max(10, Math.round(cw * 0.12))
    const perRow = Math.max(1, Math.floor((contentW + gap) / (cw + gap)))
    const labelFont = Math.min(34, Math.max(20, Math.round(cw * 0.21)))
    const labelH = labelFont + 20
    const rowVGap = Math.round(coverH * 0.20)
    const reflH = Math.round(coverH * 0.36)
    const catGap = Math.round(coverH * 0.30)
    return { cw, coverH, gap, perRow, labelFont, labelH, rowVGap, reflH, catGap }
  }

  const blockHeight = (rows, m) => m.labelH + rows * m.coverH + (rows - 1) * m.rowVGap + m.reflH
  const totalHeight = (rowsArr, m) =>
    rowsArr.reduce((s, r) => s + blockHeight(r, m), 0) + (G - 1) * m.catGap

  const planRows = (m) => {
    const need = groups.map(g => Math.min(maxRowsPerCat, Math.ceil(g.all.length / m.perRow)))
    const rows = need.map(() => 1)
    let used = rows.length
    let guard = 0
    while (used < maxTotalRows && guard++ < 999) {
      let best = -1, bestHidden = 0
      groups.forEach((g, i) => {
        if (rows[i] < need[i]) {
          const hidden = g.all.length - rows[i] * m.perRow
          if (hidden > bestHidden) { bestHidden = hidden; best = i }
        }
      })
      if (best < 0) break
      rows[best]++; used++
    }
    return rows
  }

  const SIZES = [150, 138, 126, 114]
  let m = null, rowsArr = null
  for (const cw of SIZES) {
    const mm = metricsFor(cw)
    const rr = planRows(mm)
    if (totalHeight(rr, mm) <= avail) { m = mm; rowsArr = rr; break }
  }
  if (!m) {
    m = metricsFor(SIZES[SIZES.length - 1])
    rowsArr = planRows(m)
  }

  const shownByCat = groups.map((g, i) => {
    const cap = rowsArr[i] * m.perRow
    return { covers: g.all.slice(0, cap), more: Math.max(0, g.all.length - cap) }
  })

  // ── Carregar capas (todas as visíveis) ──
  const flat = shownByCat.flatMap(s => s.covers)
  const imgMap = new Map()
  await Promise.all(flat.map(async it => imgMap.set(it.id, await loadImg(it.cover))))

  // ── Desenhar prateleiras (centrado verticalmente no espaço disponível) ──
  const usedH = totalHeight(rowsArr, m)
  let blockY = startY + Math.max(0, (avail - usedH) / 2)
  const radius = Math.max(7, Math.round(m.cw * 0.08))

  groups.forEach((g, gi) => {
    const color = CAT_COLOR[g.cat] || '#888'
    const rows = rowsArr[gi]
    const { covers, more } = shownByCat[gi]

    // Etiqueta + "+N"
    ctx.textAlign = 'left'
    ctx.fillStyle = color
    ctx.font = `800 ${m.labelFont}px Nunito, sans-serif`
    const label = (catName ? catName(g.cat) : g.cat).toUpperCase()
    ctx.fillText(label, M, blockY + m.labelFont)
    if (more > 0) {
      const lblW = ctx.measureText(label).width
      ctx.fillStyle = hexA(color, 0.55)
      ctx.font = `700 ${Math.round(m.labelFont * 0.8)}px Nunito, sans-serif`
      ctx.fillText(`+${more}`, M + lblW + 16, blockY + m.labelFont)
    }

    for (let r = 0; r < rows; r++) {
      const rowCovers = covers.slice(r * m.perRow, (r + 1) * m.perRow)
      if (!rowCovers.length) break
      const cy = blockY + m.labelH + r * (m.coverH + m.rowVGap)
      const shelfY = cy + m.coverH
      const isLastRow = r === rows - 1

      ctx.save()
      const lg = ctx.createLinearGradient(M, 0, W - M, 0)
      lg.addColorStop(0, hexA(color, 0)); lg.addColorStop(0.5, hexA(color, 0.9)); lg.addColorStop(1, hexA(color, 0))
      ctx.fillStyle = lg
      ctx.shadowColor = color; ctx.shadowBlur = Math.round(m.cw * 0.16)
      ctx.fillRect(M, shelfY + 6, contentW, Math.max(4, Math.round(m.coverH * 0.025)))
      ctx.restore()

      const n = rowCovers.length
      const rowW = n * m.cw + (n - 1) * m.gap
      let x = M + (contentW - rowW) / 2

      rowCovers.forEach(it => {
        const img = imgMap.get(it.id)

        if (img && isLastRow) {
          const reflGap = Math.max(8, Math.round(m.coverH * 0.045))
          const reflTopY = shelfY + reflGap

          const ir2 = img.width / img.height, tr2 = m.cw / m.coverH
          let rsx = 0, rsy = 0, rsw = img.width, rsh = img.height
          if (ir2 > tr2) { rsw = img.height * tr2; rsx = (img.width - rsw) / 2 }
          else { rsh = img.width / tr2; rsy = (img.height - rsh) / 2 }

          const ofc = document.createElement('canvas')
          ofc.width = m.cw; ofc.height = m.reflH
          const ofctx = ofc.getContext('2d')

          const srcTopFrac = (m.coverH - reflGap - m.reflH) / m.coverH
          ofctx.save()
          ofctx.translate(0, m.reflH)
          ofctx.scale(1, -1)
          ofctx.globalAlpha = 0.72
          ofctx.drawImage(img, rsx, rsy + srcTopFrac * rsh, rsw, m.reflH * rsh / m.coverH, 0, 0, m.cw, m.reflH)
          ofctx.restore()

          ofctx.globalCompositeOperation = 'destination-out'
          const ograd = ofctx.createLinearGradient(0, 0, 0, m.reflH)
          ograd.addColorStop(0.00, 'rgba(0,0,0,0)')
          ograd.addColorStop(0.40, 'rgba(0,0,0,0.30)')
          ograd.addColorStop(0.72, 'rgba(0,0,0,0.82)')
          ograd.addColorStop(1.00, 'rgba(0,0,0,1)')
          ofctx.fillStyle = ograd
          ofctx.fillRect(0, 0, m.cw, m.reflH)

          ctx.drawImage(ofc, x, reflTopY)
        }

        ctx.save()
        ctx.beginPath(); ctx.roundRect(x, cy, m.cw, m.coverH, radius)
        ctx.shadowColor = hexA(color, 0.6); ctx.shadowBlur = Math.round(m.cw * 0.22); ctx.shadowOffsetY = Math.round(m.cw * 0.07)
        ctx.fillStyle = '#000'; ctx.fill()
        ctx.restore()

        if (img) drawCover(ctx, img, x, cy, m.cw, m.coverH, radius)
        else {
          ctx.save(); ctx.beginPath(); ctx.roundRect(x, cy, m.cw, m.coverH, radius); ctx.clip()
          const cg = ctx.createLinearGradient(x, cy, x, cy + m.coverH)
          cg.addColorStop(0, color); cg.addColorStop(1, '#15151F')
          ctx.fillStyle = cg; ctx.fillRect(x, cy, m.cw, m.coverH)
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
          ctx.font = `700 ${Math.max(13, Math.round(m.cw * 0.13))}px Nunito, sans-serif`
          let tt = it.title || ''
          while (ctx.measureText(tt).width > m.cw - 18 && tt.length > 1) tt = tt.slice(0, -1)
          ctx.fillText(tt, x + m.cw / 2, cy + m.coverH / 2 + 8)
          ctx.restore()
        }

        ctx.save(); ctx.beginPath(); ctx.roundRect(x, cy, m.cw, m.coverH, radius); ctx.clip()
        const tg = ctx.createLinearGradient(0, cy, 0, cy + m.coverH * 0.5)
        tg.addColorStop(0, 'rgba(255,255,255,0.18)'); tg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = tg; ctx.fillRect(x, cy, m.cw, m.coverH * 0.5)
        ctx.restore()

        x += m.cw + m.gap
      })
    }

    blockY += blockHeight(rows, m) + m.catGap
  })

  // ── Rodapé: marca ──
  ctx.textAlign = 'center'
  ctx.font = '900 50px Nunito, sans-serif'
  const vg = ctx.createLinearGradient(W / 2 - 90, 0, W / 2 + 90, 0)
  vg.addColorStop(0, brand[0]); vg.addColorStop(0.5, brand[1]); vg.addColorStop(1, brand[2])
  ctx.fillStyle = vg
  ctx.fillText('Vyllo', W / 2, H - 48)

  return new Promise(resolve => {
    try { canvas.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), 'image/png') }
    catch { resolve(null) }
  })
}
