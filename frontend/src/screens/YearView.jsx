import { useState, useEffect } from 'react'
import { CAT_COLOR, CAT_LIGHT, CAT_EMOJI, isPremium, openPremium, normalizeGenre, translateGenre, getYearGoals } from '../utils'
import CoverImage from '../components/CoverImage'
import StarRating from '../components/StarRating'
import WrappedScreen from '../components/WrappedScreen'
import ShareShelf from '../components/ShareShelf'
import CategoryIcon from '../components/CategoryIcon'
import Icon from '../components/Icon'
import { NavBtn } from './MonthView'
import { useLang } from '../i18n'

const pad2 = (n) => String(n).padStart(2, '0')

const absEp = (item) => {
  let eps = []
  try { eps = item.episodes_per_season ? JSON.parse(item.episodes_per_season) : [] } catch {}
  let before = 0
  for (let s = 0; s < (item.current_season || 1) - 1; s++) before += (eps[s] || 0)
  return before + (item.current_episode || 1)
}

export default function YearView({ items, onItemClick, onEditGoals }) {
  const { t, lang } = useLang()
  const MONTHS = lang === 'pt'
    ? ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [openCat, setOpenCat] = useState(null)
  const [selMonth, setSelMonth] = useState(null)   // mês selecionado no heatmap
  const [showWrapped, setShowWrapped] = useState(false)
  const [showShareShelf, setShowShareShelf] = useState(false)
  const canGoNext = year < now.getFullYear()
  const yearPrefix = `${year}-`

  // Objetivos do ano — lidos da fonte partilhada com Profile/GoalSetup
  const [yearGoals, setYearGoals] = useState(() => getYearGoals())
  useEffect(() => {
    const refresh = () => setYearGoals(getYearGoals())
    window.addEventListener('vyllo-goals', refresh)
    return () => window.removeEventListener('vyllo-goals', refresh)
  }, [])
  const yg = { book: 12, game: 12, film: 24, ...yearGoals }

  // Wrapped: evento de fim de ano. Anos passados sempre disponíveis; ano corrente só em dezembro.
  const isCurrentYear = year === now.getFullYear()
  const wrappedReady = !isCurrentYear || now.getMonth() === 11   // dezembro = 11
  const daysToDec = Math.max(0, Math.ceil((new Date(year, 11, 1) - now) / 86400000))

  const yearItems = items.filter(i =>
    i.status !== 'wishlist' && i.updated_at && i.updated_at.startsWith(yearPrefix)
  )
  const completed = yearItems.filter(i => i.status === 'completed')

  const catCount = {
    book: yearItems.filter(i => i.category === 'book').length,
    game: yearItems.filter(i => i.category === 'game').length,
    film: yearItems.filter(i => i.category === 'film').length,
  }

  // Métricas
  const pagesRead = yearItems
    .filter(i => i.category === 'book' && i.book_type !== 'audiobook')
    .reduce((s, i) => s + (i.current_page || 0), 0)
  const hoursPlayed = yearItems
    .filter(i => i.category === 'game')
    .reduce((s, i) => s + (i.hours_played || 0), 0)
  const cinemaHours = Math.round(yearItems
    .filter(i => i.category === 'film' && !i.is_series && i.runtime && i.status === 'completed')
    .reduce((s, i) => s + i.runtime, 0) / 60)

  // Concluídos (terminados) por categoria
  const doneCount = {
    book: completed.filter(i => i.category === 'book').length,
    game: completed.filter(i => i.category === 'game').length,
    film: completed.filter(i => i.category === 'film').length,
  }

  // Duração total em horas por categoria
  const audioHours = yearItems
    .filter(i => i.category === 'book' && i.book_type === 'audiobook')
    .reduce((s, i) => s + (i.current_page || 0), 0) / 60
  const seriesHours = yearItems
    .filter(i => i.category === 'film' && i.is_series)
    .reduce((s, i) => {
      const watched = i.status === 'completed' ? (i.total_episodes || absEp(i)) : absEp(i)
      return s + watched * (40 / 60)   // ~40 min por episódio
    }, 0)
  const durationHours = {
    book: pagesRead / 40 + audioHours,   // ~40 páginas/hora + audiobooks
    game: hoursPlayed,
    film: cinemaHours + seriesHours,
  }

  // Heatmap por dia
  const dayCount = {}
  yearItems.forEach(i => { const k = i.updated_at.slice(0, 10); dayCount[k] = (dayCount[k] || 0) + 1 })
  const maxDay = Math.max(1, ...Object.values(dayCount))

  // Heatmap estilo GitHub — 53 semanas × 7 dias
  const hmWeeks = []
  const monthFirstWeek = {}
  let hmCursor = new Date(year, 0, 1 - new Date(year, 0, 1).getDay())
  for (let w = 0; w < 53; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(hmCursor)
      const inYear = dt.getFullYear() === year
      const m = dt.getMonth()
      const key = `${dt.getFullYear()}-${pad2(m + 1)}-${pad2(dt.getDate())}`
      if (inYear && monthFirstWeek[m] === undefined) monthFirstWeek[m] = w
      col.push({ inYear, month: m, key, count: dayCount[key] || 0, isFuture: dt > now })
      hmCursor.setDate(hmCursor.getDate() + 1)
    }
    hmWeeks.push(col)
  }

  // Mês mais ativo
  const monthCount = Array(12).fill(0)
  yearItems.forEach(i => { monthCount[parseInt(i.updated_at.slice(5, 7)) - 1]++ })
  const topMonthIdx = monthCount.indexOf(Math.max(...monthCount))

  // Género favorito (concluídos) — normalizado (consolida inglês/português)
  const genreCount = {}
  completed.forEach(i => { if (i.genre) { const g = normalizeGenre(i.genre); genreCount[g] = (genreCount[g] || 0) + 1 } })
  const topGenre = translateGenre(Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—', lang)

  // Categoria favorita
  const topCat = (['book', 'game', 'film']).sort((a, b) => catCount[b] - catCount[a])[0]
  const topCatLabel = topCat === 'book' ? t('cat.book') : topCat === 'game' ? t('cat.game') : t('cat.film')

  // Prateleira (capas dos concluídos) + Top 5
  const shelf = [...completed].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  const top5 = [...completed].filter(i => i.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 5)

  // Timeline de destaques — melhor concluído de cada mês
  const highlights = []
  for (let m = 0; m < 12; m++) {
    const mItems = completed.filter(i => parseInt(i.updated_at.slice(5, 7)) - 1 === m)
    if (!mItems.length) continue
    const best = mItems.sort((a, b) => (b.rating || 0) - (a.rating || 0))[0]
    highlights.push({ month: m, item: best, count: mItems.length })
  }

  // ── Comparação com o ano anterior ──
  const prevPrefix = `${year - 1}-`
  const prevItems = items.filter(i => i.status !== 'wishlist' && i.updated_at && i.updated_at.startsWith(prevPrefix))
  const prevCompleted = prevItems.filter(i => i.status === 'completed').length
  const prevHours = prevItems.filter(i => i.category === 'game').reduce((s, i) => s + (i.hours_played || 0), 0)
  const hasPrev = prevItems.length > 0

  // ── Top géneros do ano (concluídos) ──
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxGenre = topGenres[0]?.[1] || 1


  // Estatísticas do mês selecionado
  const monthStats = (m) => {
    const pref = `${year}-${pad2(m + 1)}`
    const mi = yearItems.filter(i => i.updated_at.startsWith(pref))
    const cc = { book: 0, game: 0, film: 0 }
    mi.forEach(i => cc[i.category]++)
    const pages = mi.filter(i => i.category === 'book' && i.book_type !== 'audiobook').reduce((s, i) => s + (i.current_page || 0), 0)
    const audio = mi.filter(i => i.category === 'book' && i.book_type === 'audiobook').reduce((s, i) => s + (i.current_page || 0), 0) / 60
    const gh = mi.filter(i => i.category === 'game').reduce((s, i) => s + (i.hours_played || 0), 0)
    const cine = mi.filter(i => i.category === 'film' && !i.is_series && i.runtime && i.status === 'completed').reduce((s, i) => s + i.runtime, 0) / 60
    const ser = mi.filter(i => i.category === 'film' && i.is_series).reduce((s, i) => s + (i.status === 'completed' ? (i.total_episodes || absEp(i)) : absEp(i)) * (40 / 60), 0)
    const totalHours = pages / 40 + audio + gh + cine + ser
    return { counts: cc, totalHours, total: mi.length }
  }

  return (
    <div style={{ padding: '0 20px' }}>

      {/* 1 — Hero card do ano (com navegação) */}
      <div style={{
        background: 'linear-gradient(135deg, var(--brand-1) 0%, var(--brand-2) 50%, var(--brand-3) 100%)',
        borderRadius: 20, padding: '24px 16px', marginBottom: 16,
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', gap: 8,
        animation: 'fadeInUp 0.4s ease both',
      }}>
        <NavBtn onClick={() => { setSelMonth(null); setYear(y => y - 1) }} dir="left" />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{t('year.your_year_in')}</p>
          <h1 style={{ fontSize: 50, color: 'white', fontWeight: 900, lineHeight: 1, margin: '2px 0', textShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>{year}</h1>
          <p style={{ fontSize: 13, color: 'white', fontWeight: 700, marginTop: 4 }}>
            {t('year.completed_total', { done: completed.length, total: yearItems.length })}
          </p>
        </div>
        <NavBtn onClick={() => { if (canGoNext) { setSelMonth(null); setYear(y => y + 1) } }} dir="right" disabled={!canGoNext} />
      </div>

      {/* 2 — Terminados por categoria (carregável → duração total em horas) */}
      <div style={{ marginBottom: 16, animation: 'fadeInUp 0.35s ease 0.05s both' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {(['book', 'game', 'film']).map(cat => {
            const active = openCat === cat
            return (
              <button key={cat} onClick={() => setOpenCat(active ? null : cat)}
                style={{
                  position: 'relative', overflow: 'hidden',
                  background: 'var(--surface)', borderRadius: 14, padding: '16px 8px 18px', textAlign: 'center', cursor: 'pointer',
                  border: `1.5px solid ${active ? CAT_COLOR[cat] : 'var(--border)'}`,
                  boxShadow: active ? `0 0 8px ${CAT_COLOR[cat]}99` : '0 2px 10px rgba(0,0,0,0.06)',
                  transition: 'all 0.15s', transform: active ? 'scale(1.03)' : 'scale(1)',
                }}>
                <span style={{ color: CAT_COLOR[cat], display: 'inline-flex' }}><CategoryIcon cat={cat} size={24} strokeWidth={2.1} /></span>
                <p style={{ fontSize: 26, fontWeight: 900, color: CAT_COLOR[cat], lineHeight: 1, marginTop: 4 }}>{doneCount[cat]}</p>
                <p style={{ fontSize: 10, color: CAT_COLOR[cat], fontWeight: 700, marginTop: 3, opacity: 0.85 }}>
                  {cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film_series')}
                </p>
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: CAT_COLOR[cat], borderBottomLeftRadius: 14, borderBottomRightRadius: 14, boxShadow: `0 0 6px ${CAT_COLOR[cat]}` }} />
              </button>
            )
          })}
        </div>

        {/* Duração total da categoria — extende para baixo */}
        <div style={{
          maxHeight: openCat ? 100 : 0, opacity: openCat ? 1 : 0, overflow: 'hidden',
          transition: 'max-height 0.32s cubic-bezier(.22,1,.36,1), opacity 0.25s ease, margin-top 0.32s ease',
          marginTop: openCat ? 10 : 0,
        }}>
          {openCat && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ color: CAT_COLOR[openCat], display: 'inline-flex' }}><Icon name="clock" size={28} strokeWidth={2.1} /></span>
              <div>
                <p style={{ fontSize: 30, fontWeight: 900, color: CAT_COLOR[openCat], lineHeight: 1 }}>
                  {Math.round(durationHours[openCat])}h
                </p>
                <p style={{ fontSize: 12, color: CAT_COLOR[openCat], fontWeight: 700, marginTop: 3, opacity: 0.85 }}>
                  {openCat === 'book' ? t('year.reading_hours') : openCat === 'game' ? t('year.hours_played') : t('year.hours_watched')} {t('year.in_year', { year })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Objetivos do ano */}
      <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.07s both' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14 }}>{t('year.goals_for', { year })}</h3>
          {onEditGoals && <button onClick={onEditGoals} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, fontFamily: 'Nunito' }}><Icon name="pencil" size={13} strokeWidth={2.4} /> {t('profile.annual_goals')}</button>}
        </div>
        <YearGoal cat="book" label={t('year.books_read')} current={doneCount.book} target={yg.book} color={CAT_COLOR.book} />
        <YearGoal cat="game" label={t('year.games_finished')} current={doneCount.game} target={yg.game} color={CAT_COLOR.game} />
        <YearGoal cat="film" label={t('year.films_series')} current={doneCount.film} target={yg.film} color={CAT_COLOR.film} last />
      </div>

      {/* ── Estatísticas detalhadas (Premium) ── */}
      {!isPremium() ? (
        <button onClick={() => openPremium('year')}
          style={{
            width: '100%', textAlign: 'center', cursor: 'pointer', border: '1.5px dashed var(--item-glass-border)',
            background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
            borderRadius: 16, padding: '28px 20px', marginBottom: 16,
          }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--text-muted)' }}><Icon name="lock" size={28} strokeWidth={2.2} /></div>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{t('year.detailed_stats')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {t('year.detailed_stats_desc')}
          </p>
          <span style={{ display: 'inline-block', marginTop: 12, padding: '8px 18px', borderRadius: 20, color: 'white', fontSize: 13, fontWeight: 800, fontFamily: 'Nunito', background: 'linear-gradient(90deg,var(--brand-1),var(--brand-2),var(--brand-3))' }}>
            {t('year.unlock')}
          </span>
        </button>
      ) : (
      <>
      {/* Comparação com o ano anterior */}
      {hasPrev && (
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.05s both' }}>
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>{t('year.vs_prev', { year, prev: year - 1 })}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <CompareStat label={t('year.items')} value={yearItems.length} prev={prevItems.length} />
            <CompareStat label={t('year.completed')} value={completed.length} prev={prevCompleted} />
            <CompareStat label={t('year.gaming_hours')} value={Math.round(hoursPlayed)} prev={Math.round(prevHours)} suffix="h" />
          </div>
        </div>
      )}

      {/* Top géneros do ano */}
      {topGenres.length > 0 && (
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.08s both' }}>
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>{t('year.genres_of_year')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {topGenres.map(([g, c], i) => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 92, flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{translateGenre(g, lang)}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(c / maxGenre) * 100}%`, background: 'linear-gradient(90deg,var(--accent),var(--accent-2))', borderRadius: 4, animation: `progressFill 0.7s cubic-bezier(.22,1,.36,1) ${0.1 + i * 0.08}s both` }} />
                </div>
                <span style={{ width: 20, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3 — Heatmap anual — blocos por mês */}
      <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.1s both' }}>
        <h3 style={{ fontSize: 14, marginBottom: 6 }}>{t('year.activity_this_year')}</h3>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>{t('year.tap_month')}</p>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginLeft: -4, marginRight: -4, paddingLeft: 4, paddingRight: 4, paddingBottom: 2 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            {Array.from({ length: 12 }, (_, mi) => {
              const rawDow = new Date(year, mi, 1).getDay()
              const firstDow = (rawDow + 6) % 7
              const daysInMonth = new Date(year, mi + 1, 0).getDate()
              const isSelected = selMonth === mi
              const monthActivity = Array.from({ length: daysInMonth }, (_, di) =>
                dayCount[`${year}-${pad2(mi + 1)}-${pad2(di + 1)}`] || 0
              )
              const monthTotal = monthActivity.reduce((s, c) => s + c, 0)
              return (
                <div key={mi}
                  onClick={() => setSelMonth(isSelected ? null : mi)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 5px 5px',
                    borderRadius: 8,
                    background: isSelected ? `rgba(var(--accent-rgb),0.12)` : 'transparent',
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'Nunito', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {MONTHS[mi]}
                    </span>
                    {monthTotal > 0 && (
                      <span style={{ fontSize: 8, fontWeight: 700, fontFamily: 'Nunito', color: 'var(--accent)', marginLeft: 4, opacity: 0.9 }}>
                        {monthTotal}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 10px)', gap: 2 }}>
                    {Array.from({ length: firstDow }, (_, i) => (
                      <div key={`p${i}`} style={{ width: 10, height: 10 }} />
                    ))}
                    {monthActivity.map((count, di) => {
                      const isFutureDay = new Date(year, mi, di + 1) > now
                      return (
                        <div key={di} style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: count > 0
                            ? `rgba(var(--accent-rgb),${Math.min(1, 0.28 + 0.72 * (count / maxDay))})`
                            : 'var(--surface-2)',
                          outline: '1px solid rgba(var(--accent-rgb),0.15)',
                          outlineOffset: '-1px',
                          opacity: isFutureDay ? 0.35 : 1,
                        }} />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detalhe do mês selecionado */}
        {selMonth !== null ? (() => {
          const st = monthStats(selMonth)
          return (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', animation: 'fadeInUp 0.25s ease both' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{MONTHS[selMonth]} {year} · {t('year.activity_label', { n: st.total, suffix: lang === 'pt' ? (st.total !== 1 ? 's' : '') : (st.total !== 1 ? 'ies' : 'y') })}</p>
                <button onClick={() => setSelMonth(null)} style={{ background: 'var(--surface-2)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['book', 'game', 'film']).map(cat => (
                  <div key={cat} style={{ flex: 1, background: CAT_COLOR[cat] + '1F', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                    <span style={{ color: CAT_COLOR[cat], display: 'inline-flex' }}><CategoryIcon cat={cat} size={16} /></span>
                    <p style={{ fontSize: 18, fontWeight: 900, color: CAT_COLOR[cat], lineHeight: 1, marginTop: 2 }}>{st.counts[cat]}</p>
                  </div>
                ))}
                <div style={{ flex: 1.2, background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                  <span style={{ color: 'white', display: 'inline-flex' }}><Icon name="clock" size={16} strokeWidth={2.2} /></span>
                  <p style={{ fontSize: 18, fontWeight: 900, color: 'white', lineHeight: 1, marginTop: 2 }}>{Math.round(st.totalHours)}h</p>
                  <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{t('year.invested')}</p>
                </div>
              </div>
            </div>
          )
        })() : (
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>{t('year.most_active_month')}<strong style={{ color: 'var(--accent)' }}>{MONTHS[topMonthIdx]}</strong></p>
        )}
      </div>

      {/* 4 — Prateleira de capas — 3 prateleiras (por categoria), itens cronológicos por mês */}
      {shelf.length > 0 && (
        <div style={{ marginBottom: 16, animation: 'fadeInUp 0.35s ease 0.15s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>{t('year.your_shelf', { year })}</h3>
            <button onClick={() => setShowShareShelf(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 11px', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 800, fontFamily: 'Nunito' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
              {t('year.share')}
            </button>
          </div>
          {(['book', 'game', 'film']).map((cat, ci) => {
            const covers = shelf.filter(i => i.category === cat)
            if (!covers.length) return null
            return (
              <ShelfRow
                key={cat}
                cat={cat}
                covers={covers}
                direction={ci % 2 === 0 ? 'left' : 'right'}
                catName={cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film_series')}
                months={MONTHS}
              />
            )
          })}
        </div>
      )}

      {/* 5 — Top 5 favoritos */}
      {top5.length > 0 && (
        <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.2s both' }}>
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>{t('year.top5_favourites')}</h3>
          {top5.map((it, i) => (
            <div key={it.id} onClick={() => onItemClick?.(it)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i === top5.length - 1 ? 0 : 12, cursor: 'pointer', borderRadius: 10, padding: '4px 6px', margin: i === top5.length - 1 ? '0 -6px' : '0 -6px 8px', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? '#F5A623' : '#DADAE8', width: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
              <CoverImage src={it.cover} category={it.category} size={40} radius={8} isMovie={it.category === 'film' && !it.is_series} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                <StarRating value={it.rating} readonly />
              </div>
              <span style={{ color: CAT_COLOR[it.category], display: 'inline-flex' }}><CategoryIcon cat={it.category} size={16} /></span>
            </div>
          ))}
        </div>
      )}

      {/* 6 — Timeline dos destaques */}
      {highlights.length > 0 && (
        <div style={{ marginBottom: 16, animation: 'fadeInUp 0.35s ease 0.25s both' }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>{t('year.highlights')}</h3>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 5, top: 4, bottom: 4, width: 2, background: 'var(--border)' }} />
            {highlights.map(({ month, item, count }, i) => (
              <div key={month} style={{ position: 'relative', marginBottom: 12, animation: `fadeInUp 0.3s ease ${0.28 + i * 0.04}s both` }}>
                <div style={{ position: 'absolute', left: -19, top: 14, width: 10, height: 10, borderRadius: '50%', background: CAT_COLOR[item.category], border: '2px solid white', boxShadow: '0 0 0 1.5px ' + CAT_COLOR[item.category] }} />
                <div onClick={() => onItemClick?.(item)}
                  style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
                  <CoverImage src={item.cover} category={item.category} size={36} radius={6} isMovie={item.category === 'film' && !item.is_series} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>{MONTHS[month]} · {t('year.count_completed', { n: count })}</p>
                    <p style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                  </div>
                  {item.rating > 0 && <span style={{ fontSize: 11, color: '#F5A623', fontWeight: 700 }}>{'★'.repeat(item.rating)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7 — Wrapped do ano */}
      <div style={{ marginBottom: 20, animation: 'fadeInUp 0.35s ease 0.3s both' }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>{t('year.your_wrapped', { year })}</h3>
        {wrappedReady ? (
          <button onClick={() => setShowWrapped(true)}
            style={{
              position: 'relative', overflow: 'hidden', width: '100%', cursor: 'pointer', border: 'none',
              borderRadius: 16, padding: '16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
              background: 'linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-2), var(--brand-1))', backgroundSize: '200% 100%',
              animation: 'premiumFlow 4s linear infinite', textAlign: 'left',
            }}>
            <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)', animation: 'premiumShine 3.2s ease-in-out infinite', pointerEvents: 'none' }} />
            <span style={{ color: 'white', display: 'flex', flexShrink: 0 }}><Icon name="sparkles" size={24} strokeWidth={2.2} /></span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 900, color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>{t('year.open_wrapped', { year })}</span>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginTop: 1 }}>{t('year.wrapped_subtitle')}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        ) : (
          <div style={{ width: '100%', borderRadius: 16, padding: '16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1.5px dashed var(--border)' }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'var(--purple-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sparkles" size={22} strokeWidth={2.2} />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{t('year.wrapped_coming', { year })}</span>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>
                {daysToDec > 0 ? t('year.days_to_go', { n: daysToDec, suffix: lang === 'pt' ? (daysToDec === 1 ? '' : 's') : (daysToDec === 1 ? '' : 's') }) : t('year.almost_there')}
              </span>
            </span>
            <span style={{ color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}><Icon name="lock" size={16} strokeWidth={2.2} /></span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <WrappedCard cat={topCat} color={CAT_COLOR[topCat]} value={topCatLabel} label={t('year.category_of_year')} />
          <WrappedCard icon="masks" color="#F5A623" value={topGenre} label={t('year.favourite_genre')} />
          <WrappedCard icon="flame" color="#2DB87A" value={MONTHS[topMonthIdx]} label={t('year.most_active_month_label')} />
          <WrappedCard icon="clock" color="#FF6B6B" value={(pagesRead + Math.round(hoursPlayed * 30) + cinemaHours * 60).toLocaleString()} label={t('year.minutes_dedication')} />
        </div>
      </div>
      </>
      )}

      {yearItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>📅</p>
          <p style={{ fontSize: 14 }}>{t('year.no_activity', { year })}</p>
        </div>
      )}

      {showWrapped && <WrappedScreen items={items} year={year} onClose={() => setShowWrapped(false)} />}
      {showShareShelf && <ShareShelf shelf={shelf} year={year} onClose={() => setShowShareShelf(false)} />}
    </div>
  )
}

function ShelfRow({ cat, covers, direction, catName, months }) {
  const color = CAT_COLOR[cat]
  const MONTHS = months || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Ordena cronologicamente e agrupa por mês → sequência [mês, capas..., mês, capas...]
  const sorted = [...covers].sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
  const segments = []
  let lastM = -1
  sorted.forEach(it => {
    const m = parseInt(it.updated_at.slice(5, 7)) - 1
    if (m !== lastM) { segments.push({ type: 'month', label: MONTHS[m], key: `m${m}` }); lastM = m }
    segments.push({ type: 'cover', item: it })
  })
  const loop = [...segments, ...segments]
  const dur = Math.max(14, covers.length * 4)
  const anim = direction === 'left' ? 'marqueeLeft' : 'marqueeRight'

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}><CategoryIcon cat={cat} size={14} />{catName}</p>
      <div style={{ overflow: 'hidden', position: 'relative' }}>
        <div style={{
          display: 'flex', gap: 8, width: 'max-content', alignItems: 'flex-end',
          animation: `${anim} ${dur}s linear infinite`,
        }}>
          {loop.map((seg, i) => seg.type === 'month' ? (
            // Separador de mês
            <div key={`${seg.key}-${i}`} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: 118, padding: '0 2px' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color, writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: 1, opacity: 0.7 }}>{seg.label}</span>
              <div style={{ width: 2, height: 90, background: color + '33', borderRadius: 1, marginTop: 4 }} />
            </div>
          ) : (
            <div key={`${seg.item.id}-${i}`} style={{ flexShrink: 0, borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.2)' }}>
              <CoverImage src={seg.item.cover} category={seg.item.category} size={84} radius={10} title={seg.item.title} isMovie={seg.item.category === 'film' && !seg.item.is_series} />
            </div>
          ))}
        </div>
      </div>
      {/* base da prateleira */}
      <div style={{ height: 4, background: `linear-gradient(90deg, transparent, ${color}55, transparent)`, borderRadius: 2, marginTop: 6 }} />
    </div>
  )
}

function BigStat({ value, label, emoji, color }) {
  return (
    <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: '16px', borderBottom: `3px solid ${color}`, boxShadow: `0 2px 10px rgba(0,0,0,0.06), 0 -4px 12px ${color}70, 0 -2px 6px ${color}50` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 26, fontWeight: 900, color }}>{value}</p>
        <span style={{ fontSize: 20 }}>{emoji}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>{label}</p>
    </div>
  )
}

function YearGoal({ label, cat, current, target, color, last }) {
  const pct = Math.min((current / target) * 100, 100)
  const done = current >= target
  return (
    <div style={{ marginBottom: last ? 0 : 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {done && '🏅 '}<span style={{ color, display: 'inline-flex' }}><CategoryIcon cat={cat} size={15} /></span>{label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{current} / {target}</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function CompareStat({ label, value, prev, suffix = '' }) {
  const delta = value - prev
  const pct = prev > 0 ? Math.round((delta / prev) * 100) : null
  const up = delta > 0, down = delta < 0
  const color = up ? '#2DB87A' : down ? '#FF4757' : 'var(--text-muted)'
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--surface-2)', borderRadius: 12, padding: '12px 6px', textAlign: 'center' }}>
      <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', lineHeight: 1 }}>{value}{suffix}</p>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</p>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 6, fontSize: 10.5, fontWeight: 800, color }}>
        {delta === 0 ? '–' : up ? '▲' : '▼'} {delta === 0 ? '–' : `${delta > 0 ? '+' : ''}${delta}${pct !== null ? ` · ${pct > 0 ? '+' : ''}${pct}%` : ''}`}
      </span>
    </div>
  )
}

function WrappedCard({ value, label, color, icon, cat }) {
  return (
    <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 14px 15px', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
      <span style={{ color, display: 'flex', marginBottom: 8 }}>
        {cat ? <CategoryIcon cat={cat} size={20} /> : <Icon name={icon} size={20} strokeWidth={2.2} />}
      </span>
      <p style={{ fontSize: 19, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{label}</p>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: color, boxShadow: `0 0 6px ${color}` }} />
    </div>
  )
}
