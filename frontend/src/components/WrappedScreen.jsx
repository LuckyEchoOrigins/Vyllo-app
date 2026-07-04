import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CAT_EMOJI } from '../utils'
import { useLang } from '../i18n'

function getMonths(lang) {
  const locale = lang === 'pt' ? 'pt-PT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-GB'
  return Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2000, i, 1))
  )
}

// Cores por categoria
const FILM_BG = ['#F7901E', '#E0459E']
const BOOK_BG = ['var(--accent)', 'var(--accent-2)']
const GAME_BG = ['#E0459E', '#7C3AED']

const absEp = (it) => {
  let eps = []; try { eps = it.episodes_per_season ? JSON.parse(it.episodes_per_season) : [] } catch {}
  let before = 0
  for (let s = 0; s < (it.current_season || 1) - 1; s++) before += (eps[s] || 0)
  return before + (it.current_episode || 1)
}
const topKey = (arr, field) => {
  const m = {}; arr.forEach(i => { const v = i[field]; if (v) m[v] = (m[v] || 0) + 1 })
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0]
}
const bestOf = (arr) => [...arr].filter(i => i.rating > 0).sort((a, b) => b.rating - a.rating)[0]

// ── Estatísticas do ano → slides ────────────────────────────────────────────
function buildSlides(items, year, t, lang) {
  const yi = items.filter(i => i.status !== 'wishlist' && i.updated_at && i.updated_at.startsWith(`${year}-`))
  const done = yi.filter(i => i.status === 'completed')
  const byCat = (c) => yi.filter(i => i.category === c)
  const doneCat = (c) => done.filter(i => i.category === c)

  // ── Filmes & Séries ──
  const films = byCat('film')
  const filmsWatched = doneCat('film').filter(i => !i.is_series).length
  const epsWatched = films.filter(i => i.is_series).reduce((s, i) => s + absEp(i), 0)
  const seriesHours = Math.round(epsWatched * 40 / 60)
  const filmGenre = topKey(doneCat('film'), 'genre')
  const bestFilm = bestOf(doneCat('film').filter(i => !i.is_series))
  let longestSeries = null, longestDays = 0
  films.filter(i => i.is_series && i.start_date && i.end_date).forEach(i => {
    const d = (new Date(i.end_date) - new Date(i.start_date)) / 86400000
    if (d > longestDays) { longestDays = d; longestSeries = i }
  })

  // ── Livros ──
  const books = byCat('book')
  const booksRead = doneCat('book').length
  const pagesRead = books.filter(i => i.book_type !== 'audiobook').reduce((s, i) => s + (i.current_page || 0), 0)
  const bookGenre = topKey(doneCat('book'), 'genre')
  const topAuthor = topKey(books, 'author')
  const bestBook = bestOf(doneCat('book'))

  // ── Jogos ──
  const games = byCat('game')
  const hoursPlayed = games.reduce((s, i) => s + (i.hours_played || 0), 0)
  const topGame = [...games].sort((a, b) => (b.hours_played || 0) - (a.hours_played || 0))[0]
  const achUnlocked = games.reduce((s, i) => {
    if (i.ach_unlocked) return s + i.ach_unlocked
    if (i.manual_achievements) { try { return s + JSON.parse(i.manual_achievements).filter(x => x.unlocked).length } catch {} }
    return s
  }, 0)
  const gameGenre = topKey(games, 'genre')
  const bestGame = bestOf(doneCat('game'))

  // ── Geral ──
  const catCount = { book: books.length, game: games.length, film: films.length }
  const topCat = (['book', 'game', 'film']).sort((a, b) => catCount[b] - catCount[a])[0]
  const domPhrase = topCat === 'game' ? t('wrapped.gamer') : topCat === 'book' ? t('wrapped.reader') : t('wrapped.cinephile')
  const monthCount = Array(12).fill(0); yi.forEach(i => monthCount[parseInt(i.updated_at.slice(5, 7)) - 1]++)
  const topMonthIdx = monthCount.indexOf(Math.max(...monthCount))
  const totalConsumed = done.length
  const top5 = [...done].filter(i => i.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 5)
  const minutes = pagesRead + Math.round(hoursPlayed * 60) + filmsWatched * 100 + epsWatched * 40

  const S = []
  S.push({ type: 'intro', bg: ['var(--accent)', 'var(--accent-2)'], emoji: '✨', title: t('wrapped.year_in_review'), big: `${year}`, sub: t('wrapped.lets_look_back'), dur: 4200 })
  S.push({ bg: ['#7C3AED', 'var(--accent-2)'], emoji: '📦', num: totalConsumed, label: t('wrapped.items_completed'), sub: t('wrapped.out_of', { n: yi.length }) })
  S.push({ bg: ['#241B3D', '#3A2A5E'], emoji: CAT_EMOJI[topCat], big: domPhrase, label: t('wrapped.your_vibe'), dur: 5500 })

  if (films.length) {
    if (filmsWatched) S.push({ bg: FILM_BG, emoji: '🎬', num: filmsWatched, label: t('wrapped.films_watched') })
    if (seriesHours) S.push({ bg: FILM_BG, emoji: '📺', num: seriesHours, suffix: 'h', label: t('wrapped.in_series'), sub: t('wrapped.episodes', { n: epsWatched }) })
    if (filmGenre) S.push({ bg: FILM_BG, emoji: '🎭', big: filmGenre, label: t('wrapped.fav_film_genre') })
    if (bestFilm) S.push({ type: 'item', bg: FILM_BG, item: bestFilm, label: t('wrapped.top_rated_film') })
    if (longestSeries) S.push({ type: 'item', bg: FILM_BG, item: longestSeries, label: t('wrapped.longest_series'), stat: t('wrapped.days_label', { n: Math.round(longestDays) }) })
  }
  if (books.length) {
    if (booksRead) S.push({ bg: BOOK_BG, emoji: '📚', num: booksRead, label: t('wrapped.books_read') })
    if (pagesRead) S.push({ bg: BOOK_BG, emoji: '📖', num: pagesRead, label: t('wrapped.pages_read') })
    if (bookGenre) S.push({ bg: BOOK_BG, emoji: '✍️', big: bookGenre, label: t('wrapped.fav_lit_genre') })
    if (topAuthor) S.push({ bg: BOOK_BG, emoji: '🖋️', big: topAuthor, label: t('wrapped.most_read_author') })
    if (bestBook) S.push({ type: 'item', bg: BOOK_BG, item: bestBook, label: t('wrapped.top_rated_book') })
  }
  if (games.length) {
    if (hoursPlayed > 0) S.push({ bg: GAME_BG, emoji: '🎮', num: Math.round(hoursPlayed), suffix: 'h', label: t('wrapped.hours_played') })
    if (topGame && (topGame.hours_played || 0) > 0) S.push({ type: 'item', bg: GAME_BG, item: topGame, label: t('wrapped.most_played'), stat: `${(topGame.hours_played || 0).toFixed(0)}h` })
    if (achUnlocked) S.push({ bg: GAME_BG, emoji: '🏆', num: achUnlocked, label: t('wrapped.achievements') })
    if (gameGenre) S.push({ bg: GAME_BG, emoji: '🕹️', big: gameGenre, label: t('wrapped.fav_game_genre') })
    if (bestGame) S.push({ type: 'item', bg: GAME_BG, item: bestGame, label: t('wrapped.top_rated_game') })
  }

  S.push({ bg: ['#2DB87A', '#12B5C9'], emoji: '🔥', big: getMonths(lang)[topMonthIdx], label: t('wrapped.most_active_month') })
  if (top5.length) S.push({ type: 'top5', bg: ['#241B3D', '#3A2A5E'], emoji: '⭐', title: t('wrapped.your_favourites'), items: top5, dur: 6500 })
  S.push({ bg: ['#FF6B6B', '#7C3AED'], emoji: '⏱️', num: minutes, label: t('wrapped.minutes_dedication'), sub: t('wrapped.estimated') })
  S.push({ type: 'outro', bg: ['#F7901E', '#E0459E', '#7C3AED'], emoji: '👑', title: t('wrapped.what_a_year', { year }), sub: t('wrapped.share_wrapped'), dur: 7000 })
  return S
}

// ── Contador animado ─────────────────────────────────────────────────────────
function CountUp({ value, suffix = '', dur = 1300 }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf, start
    const step = (t) => { if (!start) start = t; const p = Math.min((t - start) / dur, 1); setV(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{v.toLocaleString()}{suffix}</>
}
const bigOf = (s) => s.num != null ? `${s.num.toLocaleString()}${s.suffix || ''}` : String(s.big || '')

// ── Imagem (canvas) ──────────────────────────────────────────────────────────
const loadImg = (src) => new Promise(res => {
  if (!src) return res(null)
  const img = new Image(); img.crossOrigin = 'anonymous'
  img.onload = () => res(img); img.onerror = () => res(null); img.src = src
})
function roundedImg(ctx, img, x, y, w, h, r) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip()
  const ir = img.width / img.height, tr = w / h
  let sx = 0, sy = 0, sw = img.width, sh = img.height
  if (ir > tr) { sw = img.height * tr; sx = (img.width - sw) / 2 } else { sh = img.width / tr; sy = (img.height - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h); ctx.restore()
}
function wrapText(ctx, text, cx, y, maxW, lineH, maxLines = 2) {
  const words = String(text).split(' '); const lines = []; let line = ''
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w } else line = t }
  if (line) lines.push(line)
  const show = lines.slice(0, maxLines)
  if (lines.length > maxLines) show[maxLines - 1] += '…'
  show.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH))
  return show.length
}
async function renderSlideImage(slide, year) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch {}
  const W = 1080, H = 1920
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, W, H)
  slide.bg.forEach((col, i) => grad.addColorStop(i / (slide.bg.length - 1), col))
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'soft-light'
  ;[[200, 400, 280, 'rgba(255,255,255,0.5)'], [880, 1500, 340, 'rgba(255,255,255,0.35)'], [820, 300, 200, 'rgba(255,255,255,0.4)']].forEach(([x, y, r, col]) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'transparent')
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  })
  ctx.globalCompositeOperation = 'source-over'
  ctx.textAlign = 'center'

  if (slide.type === 'top5') {
    ctx.fillStyle = 'white'; ctx.font = '900 72px Nunito, sans-serif'; ctx.fillText('⭐ ' + slide.title, W / 2, 210)
    const imgs = await Promise.all(slide.items.map(it => loadImg(it.cover)))
    slide.items.forEach((it, i) => {
      const y = 320 + i * 250
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.roundRect(80, y, W - 160, 210, 24); ctx.fill()
      if (imgs[i]) roundedImg(ctx, imgs[i], 110, y + 25, 110, 160, 12)
      ctx.textAlign = 'left'; ctx.fillStyle = '#FFD75E'; ctx.font = '900 56px Nunito'; ctx.fillText(String(i + 1), 250, y + 95)
      ctx.fillStyle = 'white'; ctx.font = '800 40px Nunito'
      let t = it.title || ''; while (ctx.measureText(t).width > W - 480 && t.length > 1) t = t.slice(0, -1); if (t !== (it.title || '')) t += '…'
      ctx.fillText(t, 320, y + 95)
      ctx.fillStyle = '#FFD75E'; ctx.font = '40px Nunito'; ctx.fillText('★'.repeat(it.rating), 320, y + 150)
      ctx.textAlign = 'center'
    })
  } else if (slide.type === 'item') {
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '800 50px Nunito'
    const ln = wrapText(ctx, slide.label, W / 2, 280, W - 200, 64, 2)
    const img = await loadImg(slide.item.cover)
    const cw = 440, ch = 660, cx = (W - cw) / 2, cy = 280 + ln * 64 + 30
    if (img) roundedImg(ctx, img, cx, cy, cw, ch, 28)
    else { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 28); ctx.fill() }
    ctx.fillStyle = 'white'; ctx.font = '900 56px Nunito'
    wrapText(ctx, slide.item.title, W / 2, cy + ch + 80, W - 160, 64, 2)
    if (slide.item.rating > 0) { ctx.fillStyle = '#FFD75E'; ctx.font = '54px Nunito'; ctx.fillText('★'.repeat(slide.item.rating), W / 2, cy + ch + 170) }
    if (slide.stat) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '800 48px Nunito'; ctx.fillText(slide.stat, W / 2, cy + ch + (slide.item.rating ? 240 : 170)) }
  } else {
    ctx.font = '130px sans-serif'; ctx.fillText(slide.emoji, W / 2, 580)
    if (slide.title) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '800 58px Nunito'; ctx.fillText(slide.title, W / 2, 720) }
    const big = bigOf(slide)
    ctx.fillStyle = 'white'; ctx.font = `900 ${big.length > 14 ? 90 : big.length > 9 ? 130 : 210}px Nunito, sans-serif`
    wrapText(ctx, big, W / 2, slide.title && slide.type !== 'intro' ? 920 : 1010, W - 120, big.length > 9 ? 130 : 220, 2)
    if (slide.label) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '700 54px Nunito'; wrapText(ctx, slide.label, W / 2, 1130, W - 160, 64, 2) }
    if (slide.sub) { ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '600 42px Nunito'; ctx.fillText(slide.sub, W / 2, 1230) }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '800 42px Nunito'; ctx.fillText(`Vyllo · ${year}`, W / 2, H - 95)
  return new Promise(r => { try { c.toBlob(b => r(b ? URL.createObjectURL(b) : null), 'image/png') } catch { r(null) } })
}

// ── Fundo com blobs ─────────────────────────────────────────────────────────
function Blobs({ colors }) {
  const spots = [
    { top: '12%', left: '-10%', size: 260, c: colors[0], d: '0s' },
    { top: '60%', left: '60%', size: 320, c: colors[colors.length - 1], d: '1.5s' },
    { top: '78%', left: '-5%', size: 220, c: colors[1] || colors[0], d: '3s' },
  ]
  return spots.map((s, i) => (
    <div key={i} style={{
      position: 'absolute', top: s.top, left: s.left, width: s.size, height: s.size, borderRadius: '50%',
      background: s.c, filter: 'blur(60px)', opacity: 0.55, pointerEvents: 'none',
      animation: `blobFloat ${9 + i * 2}s ease-in-out ${s.d} infinite`,
    }} />
  ))
}

// ── Conteúdo de um slide ─────────────────────────────────────────────────────
function SlideView({ slide }) {
  if (slide.type === 'top5') {
    return (
      <div style={{ width: '100%', padding: '0 26px', position: 'relative', zIndex: 2 }}>
        <p style={{ fontSize: 24, fontWeight: 900, color: 'white', textAlign: 'center', marginBottom: 22, animation: 'wrappedPop 0.5s ease both' }}>⭐ {slide.title}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {slide.items.map((it, i) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.13)', borderRadius: 14, padding: 10, animation: `wrappedIn 0.5s cubic-bezier(.22,1,.36,1) ${0.15 + i * 0.12}s both` }}>
              <div style={{ width: 42, height: 60, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                {it.cover && <img src={it.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#FFD75E', width: 22 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                <p style={{ fontSize: 13, color: '#FFD75E' }}>{'★'.repeat(it.rating)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (slide.type === 'item') {
    return (
      <div style={{ textAlign: 'center', padding: '0 34px', position: 'relative', zIndex: 2 }}>
        <p style={{ fontSize: 17, fontWeight: 800, color: 'rgba(255,255,255,0.95)', marginBottom: 16, animation: 'wrappedIn 0.5s ease 0.1s both' }}>{slide.label}</p>
        <div style={{ width: 150, margin: '0 auto', animation: 'wrappedPop 0.6s cubic-bezier(.34,1.56,.64,1) both' }}>
          <div style={{ width: '100%', aspectRatio: '2/3', borderRadius: 14, overflow: 'hidden', boxShadow: '0 0 40px rgba(255,255,255,0.35), 0 16px 36px rgba(0,0,0,0.4)', background: 'rgba(255,255,255,0.15)' }}>
            {slide.item.cover
              ? <img src={slide.item.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{CAT_EMOJI[slide.item.category]}</div>}
          </div>
        </div>
        <p style={{ fontSize: 20, fontWeight: 900, color: 'white', marginTop: 16, lineHeight: 1.2, animation: 'wrappedIn 0.5s ease 0.35s both' }}>{slide.item.title}</p>
        {slide.item.rating > 0 && <p style={{ fontSize: 18, color: '#FFD75E', marginTop: 4, animation: 'wrappedIn 0.5s ease 0.45s both' }}>{'★'.repeat(slide.item.rating)}</p>}
        {slide.stat && <p style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.95)', marginTop: 8, animation: 'wrappedIn 0.5s ease 0.5s both' }}>{slide.stat}</p>}
      </div>
    )
  }
  return (
    <div style={{ textAlign: 'center', padding: '0 30px', position: 'relative', zIndex: 2 }}>
      <div style={{ fontSize: 84, marginBottom: 16, animation: 'wrappedPop 0.6s cubic-bezier(.34,1.56,.64,1) both' }}>{slide.emoji}</div>
      {slide.title && <p style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.95)', marginBottom: 10, animation: 'wrappedIn 0.5s ease 0.15s both' }}>{slide.title}</p>}
      <p style={{ fontSize: bigOf(slide).length > 9 ? 34 : 66, fontWeight: 900, color: 'white', lineHeight: 1.08, letterSpacing: '-1.5px', textShadow: '0 4px 24px rgba(0,0,0,0.25)', animation: 'wrappedIn 0.6s cubic-bezier(.22,1,.36,1) 0.25s both' }}>
        {slide.num != null ? <CountUp value={slide.num} suffix={slide.suffix || ''} /> : slide.big}
      </p>
      {slide.label && <p style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.95)', marginTop: 12, animation: 'wrappedIn 0.5s ease 0.45s both' }}>{slide.label}</p>}
      {slide.sub && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 7, animation: 'wrappedIn 0.5s ease 0.6s both' }}>{slide.sub}</p>}
    </div>
  )
}

function Confetti() {
  const cols = ['#F7901E', '#E0459E', '#7C3AED', '#2DB87A', '#FFD75E', '#fff']
  const pieces = Array.from({ length: 44 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 2.5, dur: 2.6 + Math.random() * 2.2, size: 7 + Math.random() * 8, c: cols[i % cols.length], rot: Math.random() * 360 }))
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {pieces.map((p, i) => (
        <div key={i} style={{ position: 'absolute', top: -20, left: `${p.left}%`, width: p.size, height: p.size * 1.4, background: p.c, borderRadius: 2, transform: `rotate(${p.rot}deg)`, animation: `confettiFall ${p.dur}s linear ${p.delay}s infinite` }} />
      ))}
    </div>
  )
}

export default function WrappedScreen({ items, year, onClose }) {
  const { t, lang } = useLang()
  const slides = buildSlides(items, year, t, lang)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [exporting, setExporting] = useState(false)
  const down = useRef(null)
  const root = (typeof document !== 'undefined' && document.getElementById('root')) || null

  const n = slides.length
  const slide = slides[idx]
  const next = () => setIdx(i => Math.min(i + 1, n - 1))
  const prev = () => setIdx(i => Math.max(i - 1, 0))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDown = (e) => { down.current = { t: Date.now(), x: e.clientX, rect: e.currentTarget.getBoundingClientRect() }; setPaused(true) }
  const onUp = (e) => {
    setPaused(false)
    const d = down.current; down.current = null
    if (!d) return
    if (Date.now() - d.t < 220) { const rel = (e.clientX - d.rect.left) / d.rect.width; if (rel < 0.32) prev(); else next() }
  }

  const shareSlide = async () => {
    setPaused(true); setExporting(true)
    try {
      const url = await renderSlideImage(slide, year)
      if (!url) return
      const blob = await (await fetch(url)).blob()
      const file = new File([blob], `wrapped-${year}-${idx + 1}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `O meu Wrapped ${year}` })
      else { const a = document.createElement('a'); a.href = url; a.download = `wrapped-${year}-${idx + 1}.png`; a.click() }
    } catch { } finally { setExporting(false); setPaused(false) }
  }

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 650, borderRadius: 'inherit', overflow: 'hidden', animation: 'fadeIn 0.25s ease both' }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${slide.bg.join(', ')})`, transition: 'background 0.5s ease' }} />
      <Blobs colors={slide.bg} />
      {slide.type === 'outro' && <Confetti />}

      <div key={idx} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SlideView slide={slide} />
      </div>

      <div onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={() => { setPaused(false); down.current = null }}
        style={{ position: 'absolute', inset: 0, zIndex: 3 }} />

      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', gap: 4, zIndex: 5 }}>
        {slides.map((s, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
            {i < idx && <div style={{ height: '100%', width: '100%', background: 'white' }} />}
            {i === idx && (
              <div key={idx} onAnimationEnd={next}
                style={{ height: '100%', background: 'white', animation: `storyFill ${(slide.dur || 5000)}ms linear forwards`, animationPlayState: (paused || exporting) ? 'paused' : 'running' }} />
            )}
          </div>
        ))}
      </div>

      <button onClick={onClose} style={{ position: 'absolute', top: 24, right: 16, zIndex: 6, background: 'rgba(0,0,0,0.3)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>

      <button onClick={shareSlide} disabled={exporting} style={{
        position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
        display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 24, cursor: 'pointer', border: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#1A1A2E', fontSize: 14, fontWeight: 800, fontFamily: 'Nunito', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {exporting ? t('wrapped.sharing') : t('wrapped.share_btn')}
      </button>
    </div>
  )

  return root ? createPortal(overlay, root) : overlay
}
