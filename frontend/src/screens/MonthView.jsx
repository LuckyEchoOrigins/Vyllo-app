import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CAT_COLOR, CAT_LIGHT, CAT_EMOJI, formatProgress, formatMinutes, getShields, getAwardedMonths, awardMonthShield, isPremium, requirePremium } from '../utils'
import { fetchActivity } from '../api'
import CoverImage from '../components/CoverImage'
import StarRating from '../components/StarRating'
import ShareTimeline from '../components/ShareTimeline'
import CategoryIcon from '../components/CategoryIcon'
import StatusIcon from '../components/StatusIcon'
import Icon from '../components/Icon'
import { useLang } from '../i18n'

const pad2 = (n) => String(n).padStart(2, '0')

export default function MonthView({ items, onItemClick }) {
  const { t, lang } = useLang()
  const DAY_LETTERS = lang === 'pt'
    ? ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const now = new Date()
  // Mês em visualização (navegável)
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [selectedDay, setSelectedDay] = useState(null)   // dia clicado no heatmap
  const [showShare, setShowShare] = useState(false)      // modal de partilha da cronologia
  const [activity, setActivity] = useState([])           // registo de ganhos do mês
  const [openCat, setOpenCat] = useState(null)           // categoria expandida no resumo
  const [filmMode, setFilmMode] = useState('movies')      // 'movies' | 'series' no DETALHE de filmes
  const { year, month } = view
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const canGoNext = !isCurrentMonth

  const goPrev = () => { setSelectedDay(null); setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }) }
  const goNext = () => { if (canGoNext) { setSelectedDay(null); setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }) } }

  // Navegação de ano (mantém o mês; nunca avança para o futuro)
  const goPrevYear = () => { setSelectedDay(null); setView(v => ({ year: v.year - 1, month: v.month })) }
  const canGoNextYear = year < now.getFullYear()
  const goNextYear = () => { setSelectedDay(null); setView(v => {
    if (v.year >= now.getFullYear()) return v
    const ny = v.year + 1
    const nm = (ny === now.getFullYear() && v.month > now.getMonth()) ? now.getMonth() : v.month
    return { year: ny, month: nm }
  }) }

  const viewDate = new Date(year, month, 1)
  const monthName = viewDate.toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { month: 'long' })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthPrefix = `${year}-${pad2(month + 1)}-`

  // Busca o registo de ganhos exatos do mês
  useEffect(() => {
    let cancelled = false
    fetchActivity(`${year}-${pad2(month + 1)}`)
      .then(d => { if (!cancelled) setActivity(d) })
      .catch(() => { if (!cancelled) setActivity([]) })
    return () => { cancelled = true }
  }, [year, month])

  // Itens com atividade (progresso/conclusão) este mês
  const monthItems = items.filter(i =>
    i.status !== 'wishlist' && i.updated_at && i.updated_at.startsWith(monthPrefix)
  )

  const catCount = {
    book: monthItems.filter(i => i.category === 'book').length,
    game: monthItems.filter(i => i.category === 'game').length,
    film: monthItems.filter(i => i.category === 'film').length,
  }

  const completedThisMonth = monthItems.filter(i => i.status === 'completed')

  // ── Métricas do mês ──
  const pagesRead = monthItems
    .filter(i => i.category === 'book' && i.book_type !== 'audiobook')
    .reduce((s, i) => s + (i.current_page || 0), 0)
  const hoursPlayed = monthItems
    .filter(i => i.category === 'game')
    .reduce((s, i) => s + (i.hours_played || 0), 0)
  const cinemaMin = monthItems
    .filter(i => i.category === 'film' && !i.is_series && i.runtime && i.status === 'completed')
    .reduce((s, i) => s + i.runtime, 0)

  // ── Heatmap por dia ──
  const dayCount = {}
  monthItems.forEach(i => {
    const day = parseInt(i.updated_at.slice(8, 10))
    dayCount[day] = (dayCount[day] || 0) + 1
  })
  const maxDay = Math.max(1, ...Object.values(dayCount))
  const firstWeekday = new Date(year, month, 1).getDay() // 0=Dom

  // Episódios de séries vistos este mês (do registo de atividade)
  const seriesEpisodes = activity.filter(a => a.field === 'episodes').reduce((s, a) => s + (a.delta || 0), 0)

  // Total principal por categoria (mostrado ao carregar no card do resumo)
  const catMetric = (cat) => {
    if (cat === 'book') return { value: pagesRead.toLocaleString(), label: t('month.pages_read'), emoji: '📖' }
    if (cat === 'game') return { value: `${hoursPlayed.toFixed(1)}h`, label: t('month.hours_played'), emoji: '🎮' }
    // Films: toggles between cinema (films) and episodes (series)
    if (filmMode === 'series') return { value: `${seriesEpisodes}`, label: t('month.series_episodes'), emoji: '📺' }
    return { value: `${(cinemaMin / 60).toFixed(1)}h`, label: t('month.cinema_hours'), emoji: '🎬' }
  }


  // ── Objetivos (guardados em localStorage) ──
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('monthGoals')) || {} } catch { return {} }
  })
  const g = { books: 3, gameDay: 1, filmWeek: 2, epWeek: 5, ...goals }
  const setGoal = (key, val) => {
    const next = { ...g, [key]: Math.max(1, val) }
    setGoals(next)
    localStorage.setItem('monthGoals', JSON.stringify(next))
  }

  // Médias para objetivos "por dia" / "por semana"
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth
  const weeksElapsed = Math.max(1, daysElapsed / 7)
  const booksCompleted = completedThisMonth.filter(i => i.category === 'book').length
  const avgHoursDay = hoursPlayed / daysElapsed
  const avgFilmsWeek = completedThisMonth.filter(i => i.category === 'film').length / weeksElapsed
  const avgEpisodesWeek = seriesEpisodes / weeksElapsed

  // ── Escudos: cumprir todos os objetivos do mês → +1 escudo ──
  const [shields, setShieldsState] = useState(getShields())
  const monthKey = `${year}-${pad2(month + 1)}`
  const allGoalsMet = booksCompleted >= g.books && avgHoursDay >= g.gameDay
    && avgFilmsWeek >= g.filmWeek && avgEpisodesWeek >= g.epWeek
  const alreadyAwarded = getAwardedMonths().includes(monthKey)
  useEffect(() => {
    if (allGoalsMet && !getAwardedMonths().includes(monthKey)) {
      if (awardMonthShield(monthKey)) setShieldsState(getShields())
    }
  }, [allGoalsMet, monthKey])

  // ── Cronologia: eventos de início, conclusão e episódios vistos ──
  const itemById = {}
  items.forEach(it => { itemById[it.id] = it })
  const monthEvents = []
  for (const it of items) {
    if (it.status === 'wishlist') continue
    const sd = it.start_date
    const ed = it.end_date
    // Início
    if (sd && sd.startsWith(monthPrefix)) {
      monthEvents.push({ key: `${it.id}-s`, type: 'start', date: sd, item: it })
    }
    // Conclusão (data explícita ou, em falta, updated_at quando concluído)
    if (ed && ed.startsWith(monthPrefix)) {
      monthEvents.push({ key: `${it.id}-e`, type: 'end', date: ed, item: it })
    } else if (it.status === 'completed' && !ed && it.updated_at && it.updated_at.startsWith(monthPrefix)) {
      monthEvents.push({ key: `${it.id}-e`, type: 'end', date: it.updated_at.slice(0, 10), item: it })
    }
  }
  // Episódios de séries vistos — agregados por série e por dia (do registo de atividade)
  const epAgg = {}
  activity.filter(a => a.field === 'episodes' && (a.delta || 0) > 0).forEach(a => {
    const day = (a.created_at || '').slice(0, 10)
    if (!day) return
    const k = `${a.item_id}|${day}`
    if (!epAgg[k]) epAgg[k] = { item_id: a.item_id, date: day, count: 0, title: a.title }
    epAgg[k].count += a.delta
  })
  Object.values(epAgg).forEach(e => {
    const it = itemById[e.item_id]
    if (!it) return
    monthEvents.push({ key: `${e.item_id}-ep-${e.date}`, type: 'episode', date: e.date, count: e.count, item: it })
  })
  monthEvents.sort((a, b) => new Date(a.date) - new Date(b.date)
    || ((a.type === 'start' ? 0 : a.type === 'episode' ? 1 : 2) - (b.type === 'start' ? 0 : b.type === 'episode' ? 1 : 2)))

  return (
    <div style={{ padding: '0 20px' }}>

      {/* 1 — Header do mês (com navegação) */}
      <div style={{
        background: 'linear-gradient(135deg, var(--brand-1) 0%, var(--brand-2) 50%, var(--brand-3) 100%)', borderRadius: 16, padding: '18px 16px',
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeInUp 0.35s ease both',
      }}>
        <NavBtn onClick={goPrev} dir="left" />
        <div style={{ flex: 1, textAlign: 'center' }}>
          {/* Navegação de ano */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 2 }}>
            <button onClick={goPrevYear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 800, letterSpacing: 1 }}>{year}</span>
            <button onClick={goNextYear} disabled={!canGoNextYear} style={{ background: 'none', border: 'none', cursor: canGoNextYear ? 'pointer' : 'default', padding: 2, lineHeight: 0, opacity: canGoNextYear ? 1 : 0.35 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
          <h2 style={{ fontSize: 26, color: 'white', fontWeight: 900, textTransform: 'capitalize', lineHeight: 1.1 }}>{monthName}</h2>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginTop: 3 }}>
            {t('month.activities', { n: monthItems.length, suffix: lang === 'pt' ? (monthItems.length === 1 ? '' : 's') : (monthItems.length === 1 ? 'y' : 'ies') })} · {t('month.completed', { n: completedThisMonth.length })}
          </p>
        </div>
        <NavBtn onClick={goNext} dir="right" disabled={!canGoNext} />
      </div>

      {/* 2 — Resumo rápido (carregável → detalhes da categoria) */}
      <div style={{ marginBottom: 16, animation: 'fadeInUp 0.35s ease 0.05s both' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {(['book', 'game', 'film']).map(cat => {
            const active = openCat === cat
            return (
              <button key={cat} onClick={() => setOpenCat(active ? null : cat)}
                style={{
                  position: 'relative', overflow: 'hidden',
                  background: 'var(--surface)', borderRadius: 14, padding: '14px 8px 16px', textAlign: 'center', cursor: 'pointer',
                  border: `1.5px solid ${active ? CAT_COLOR[cat] : 'var(--border)'}`,
                  boxShadow: active ? `0 0 8px ${CAT_COLOR[cat]}99` : '0 2px 10px rgba(0,0,0,0.06)',
                  transition: 'all 0.15s', transform: active ? 'scale(1.03)' : 'scale(1)',
                }}>
                <span style={{ color: CAT_COLOR[cat], display: 'inline-flex' }}><CategoryIcon cat={cat} size={22} strokeWidth={2.1} /></span>
                <p style={{ fontSize: 22, fontWeight: 900, color: CAT_COLOR[cat], lineHeight: 1, marginTop: 4 }}>{catCount[cat]}</p>
                <p style={{ fontSize: 10, color: CAT_COLOR[cat], fontWeight: 700, marginTop: 2, opacity: 0.85 }}>
                  {cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film')}
                </p>
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: CAT_COLOR[cat], borderBottomLeftRadius: 14, borderBottomRightRadius: 14, boxShadow: `0 0 6px ${CAT_COLOR[cat]}` }} />
              </button>
            )
          })}
        </div>

        {/* Detalhes da categoria — extende para baixo com animação */}
        <div style={{
          maxHeight: openCat ? (openCat === 'film' ? 170 : 110) : 0,
          opacity: openCat ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.32s cubic-bezier(.22,1,.36,1), opacity 0.25s ease, margin-top 0.32s ease',
          marginTop: openCat ? 10 : 0,
        }}>
          {openCat && (() => {
            const m = catMetric(openCat)
            return (
              <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '16px 20px' }}>
                {/* Toggle Filmes / Séries (apenas na categoria filmes) */}
                {openCat === 'film' && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {[{ id: 'movies', label: '🎬 Films' }, { id: 'series', label: '📺 Series' }].map(opt => (
                      <button key={opt.id} onClick={() => setFilmMode(opt.id)}
                        style={{
                          flex: 1, padding: '6px 0', borderRadius: 10,
                          border: `1.5px solid ${filmMode === opt.id ? CAT_COLOR.film : 'var(--border)'}`,
                          background: 'var(--surface)',
                          boxShadow: filmMode === opt.id ? `0 0 8px ${CAT_COLOR.film}99` : 'none',
                          color: filmMode === opt.id ? CAT_COLOR.film : 'var(--text-muted)', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: CAT_COLOR[openCat], display: 'inline-flex' }}><CategoryIcon cat={openCat} size={32} /></span>
                  <div>
                    <p style={{ fontSize: 30, fontWeight: 900, color: CAT_COLOR[openCat], lineHeight: 1 }}>{m.value}</p>
                    <p style={{ fontSize: 12, color: CAT_COLOR[openCat], fontWeight: 700, marginTop: 3, opacity: 0.85 }}>{m.label} {t('month.this_month')}</p>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* 3 — Heatmap de atividade */}
      <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.1s both' }}>
        <h3 style={{ fontSize: 14, marginBottom: 14 }}>{t('month.monthly_activity')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {DAY_LETTERS.map((l, i) => (
            <span key={`h${i}`} style={{ fontSize: 9, color: '#B0B0BC', fontWeight: 700, textAlign: 'center' }}>{l}</span>
          ))}
          {[...Array(firstWeekday)].map((_, i) => <div key={`e${i}`} />)}
          {[...Array(daysInMonth)].map((_, idx) => {
            const day = idx + 1
            const count = dayCount[day] || 0
            const intensity = count ? 0.25 + 0.75 * (count / maxDay) : 0
            const isToday = isCurrentMonth && day === now.getDate()
            const isSelected = selectedDay === day
            return (
              <button
                key={day}
                onClick={() => count > 0 && setSelectedDay(isSelected ? null : day)}
                title={`${day}: ${count} activity(s)`}
                style={{
                  aspectRatio: '1', borderRadius: 6, padding: 0,
                  background: count ? `rgba(var(--accent-rgb),${intensity})` : 'var(--surface-2)',
                  border: isSelected ? '2px solid #1A1A2E' : isToday ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                  color: intensity > 0.6 ? 'white' : '#A0A0AC',
                  cursor: count > 0 ? 'pointer' : 'default',
                  transition: 'transform 0.1s',
                  transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                }}
              >
                {day}
              </button>
            )
          })}
        </div>

        {/* Atividade do dia selecionado — o cartão expande suavemente (grid 0fr→1fr) */}
        <div style={{
          display: 'grid',
          gridTemplateRows: selectedDay ? '1fr' : '0fr',
          opacity: selectedDay ? 1 : 0,
          transition: 'grid-template-rows 0.55s cubic-bezier(.22,1,.36,1), opacity 0.45s ease',
        }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
        {selectedDay && (() => {
          const dayKey = `${monthPrefix}${pad2(selectedDay)}`
          // Ganhos do dia — agregados por item (soma do mesmo campo num só total)
          const dayLog = activity.filter(a => a.created_at.slice(0, 10) === dayKey)
          const byItem = {}
          dayLog.forEach(a => {
            if (!byItem[a.item_id]) byItem[a.item_id] = {
              item_id: a.item_id, category: a.category, title: a.title,
              sums: { pages: 0, minutes: 0, hours: 0, episodes: 0 }, epNote: null, statuses: [],
            }
            const g = byItem[a.item_id]
            if (a.field === 'status') {
              if (a.note && !g.statuses.includes(a.note)) g.statuses.push(a.note)
            } else {
              g.sums[a.field] = (g.sums[a.field] || 0) + (a.delta || 0)
              if (a.field === 'episodes' && a.note) g.epNote = a.note
            }
          })
          const groups = Object.values(byItem)
          const coverOf = (id) => items.find(i => i.id === id)?.cover

          // Constrói os chips (totais) de um item
          const chipsOf = (g) => {
            const chips = []
            const cat = CAT_COLOR[g.category]
            if (g.sums.pages > 0)    chips.push({ label: t('month.pages', { n: g.sums.pages }), color: cat })
            if (g.sums.minutes > 0)  chips.push({ label: t('month.listened', { t: formatMinutes(g.sums.minutes) }), color: cat })
            if (g.sums.hours > 0)    chips.push({ label: t('month.played', { n: parseFloat(g.sums.hours.toFixed(1)) }), color: cat })
            if (g.sums.episodes > 0) chips.push({ label: t('month.episodes', { n: g.sums.episodes }) + (g.epNote ? ` (${g.epNote})` : ''), color: cat })
            if (g.statuses.includes('started'))   chips.push({ label: t('month.started'), color: 'var(--accent)', icon: 'in_progress' })
            if (g.statuses.includes('completed')) chips.push({ label: t('month.completed_chip'), color: '#2DB87A', icon: 'completed' })
            if (g.statuses.includes('abandoned')) chips.push({ label: t('month.abandoned_chip'), color: '#FF4757', icon: 'abandoned' })
            return chips
          }

          return (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', animation: 'fadeInUp 0.45s ease 0.2s both' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>
                  {selectedDay} <span style={{ textTransform: 'capitalize' }}>{monthName}</span> · {t('month.activities_label', { n: groups.length, suffix: lang === 'pt' ? (groups.length === 1 ? '' : 's') : (groups.length === 1 ? 'y' : 'ies') })}
                </p>
                <button onClick={() => setSelectedDay(null)} style={{ background: 'var(--surface-2)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              {groups.length === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>{t('month.no_progress')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {groups.map(grp => (
                    <div key={grp.item_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CoverImage src={coverOf(grp.item_id)} category={grp.category} size={34} radius={6} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{grp.title}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          {chipsOf(grp).map((c, gi) => (
                            <span key={gi} style={{ fontSize: 10, fontWeight: 800, color: c.color, background: c.color + '18', padding: '1px 7px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              {c.icon && <StatusIcon status={c.icon} size={11} strokeWidth={2.4} />}
                              {c.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span style={{ color: CAT_COLOR[grp.category], display: 'inline-flex' }}><CategoryIcon cat={grp.category} size={16} /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
        </div>
        </div>
      </div>

      {/* 4 — Destaques do mês */}
      <div style={{ marginBottom: 16, animation: 'fadeInUp 0.35s ease 0.15s both' }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>{t('month.month_highlights')}</h3>

        {/* Donut por categoria */}
        {monthItems.length > 0 && (
          <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: 16, marginBottom: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 18 }}>
            <Donut data={[
              { value: catCount.book, color: CAT_COLOR.book },
              { value: catCount.game, color: CAT_COLOR.game },
              { value: catCount.film, color: CAT_COLOR.film },
            ]} total={monthItems.length} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {(['book', 'game', 'film']).map(cat => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLOR[cat] }} />
                    {cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film')}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: CAT_COLOR[cat] }}>
                    {catCount[cat]}{monthItems.length ? ` · ${Math.round((catCount[cat] / monthItems.length) * 100)}%` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <BestOfMonth
          rated={completedThisMonth.filter(i => i.rating > 0)}
          monthKey={`${year}-${pad2(month + 1)}`}
          t={t}
        />
      </div>

      {/* 5 — Objetivos */}
      <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 18, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.2s both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14 }}>{t('month.monthly_goals')}</h3>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800,
            color: '#2DB87A', background: 'var(--green-light)', borderRadius: 20, padding: '4px 10px',
          }} title="Shields to protect your streak">
            <Icon name="shield" size={13} strokeWidth={2.3} /> {shields}
          </span>
        </div>
        <Goal cat="book" label={t('month.books_read')} current={booksCompleted} currentStr={String(booksCompleted)} target={g.books} suffix="" color={CAT_COLOR.book} onTarget={v => setGoal('books', v)} />
        <Goal cat="game" label={t('month.hours_per_day')} current={avgHoursDay} currentStr={avgHoursDay.toFixed(1)} target={g.gameDay} suffix="h" color={CAT_COLOR.game} onTarget={v => setGoal('gameDay', v)} />
        <Goal cat="film" label={t('month.films_per_week')} current={avgFilmsWeek} currentStr={avgFilmsWeek.toFixed(1)} target={g.filmWeek} suffix="" color={CAT_COLOR.film} onTarget={v => setGoal('filmWeek', v)} />
        <Goal cat="film" label={t('month.episodes_per_week')} current={avgEpisodesWeek} currentStr={avgEpisodesWeek.toFixed(1)} target={g.epWeek} suffix="" color={CAT_COLOR.film} onTarget={v => setGoal('epWeek', v)} last />
        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 12,
          background: allGoalsMet ? 'var(--green-light)' : 'var(--surface-2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>{allGoalsMet ? '🎉' : '🛡️'}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: allGoalsMet ? '#2DB87A' : 'var(--text-muted)', lineHeight: 1.4 }}>
            {allGoalsMet
              ? (alreadyAwarded ? t('month.goals_met') : t('month.goals_met_new'))
              : t('month.goals_not_met')}
          </span>
        </div>
      </div>

      {/* 6 — Cronologia horizontal (onda) */}
      {monthEvents.length > 0 && (
        <div style={{ marginBottom: 20, animation: 'fadeInUp 0.35s ease 0.25s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h3 style={{ fontSize: 14 }}>{t('month.timeline')}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t('month.swipe')}</span>
              <button onClick={() => { if (requirePremium('share')) setShowShare(true) }}
                title="Share timeline"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'linear-gradient(135deg,var(--brand-1),var(--brand-2),var(--brand-3))',
                  color: 'white', borderRadius: 20, padding: '5px 12px',
                  fontSize: 11, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer',
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                </svg>
                {t('month.share')} {!isPremium() && <Icon name="lock" size={11} strokeWidth={2.5} style={{ marginLeft: 1 }} />}
              </button>
            </div>
          </div>
          <WaveTimeline events={monthEvents} onItemClick={onItemClick} />
        </div>
      )}

      {showShare && (
        <ShareTimeline events={monthEvents} monthName={monthName} year={year} onClose={() => setShowShare(false)} />
      )}

      {monthItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>🗓️</p>
          <p style={{ fontSize: 14 }}>{t('month.no_activity')}</p>
        </div>
      )}
    </div>
  )
}

// ── Cronologia horizontal em onda ──────────────────────────────────────────
function WaveTimeline({ events, onItemClick }) {
  const { t, lang } = useLang()
  const SHOW_ITEMS = true
  const SLOT = 124, A = 24, MY = 98, H = 240, COVER_W = 58, COVER_H = 84
  const n = events.length
  const W = Math.max(n * SLOT, 1)
  const waveY = (x) => MY + A * Math.sin((Math.PI * x) / SLOT)

  // Caminho da onda (amostragem suave)
  let d = ''
  for (let x = 0; x <= W; x += 5) {
    d += (x === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + waveY(x).toFixed(1) + ' '
  }

  // Cada item mantém a sua cor sólida; junto ao item seguinte faz um pequeno
  // gradiente para a cor da categoria desse próximo item.
  const HALF = 42              // patamar de cor sólida à volta do centro de cada item
  const stops = []
  events.forEach((e, i) => {
    const c = i * SLOT + SLOT / 2
    const color = CAT_COLOR[e.item.category]
    stops.push({ off: x2off(c - HALF, W), color })   // fim da transição que chega a este item
    stops.push({ off: x2off(c + HALF, W), color })   // início da pequena transição p/ o próximo
  })

  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            <linearGradient id="waveGrad" x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={stops[0].color} />
              {stops.map((s, i) => <stop key={i} offset={s.off} stopColor={s.color} />)}
              <stop offset="1" stopColor={stops[stops.length - 1].color} />
            </linearGradient>
            <filter id="waveGlow" x="-10%" y="-60%" width="120%" height="220%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Linha nítida (sem brilho) */}
          <path d={d} fill="none" stroke="url(#waveGrad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="1" />
          {/* Bolas de início e fim da linha */}
          <circle cx="0" cy={waveY(0)} r="6" fill={stops[0].color} />
          <circle cx="0" cy={waveY(0)} r="2.5" fill="#fff" />
          <circle cx={W} cy={waveY(W)} r="6" fill={stops[stops.length - 1].color} />
          <circle cx={W} cy={waveY(W)} r="2.5" fill="#fff" />
        </svg>

        {SHOW_ITEMS && events.map((e, i) => {
          const x = i * SLOT + SLOT / 2
          const y = waveY(x)
          const color = CAT_COLOR[e.item.category]
          const label = e.type === 'start' ? t('month.started')
            : e.type === 'episode' ? (e.count > 1 ? `+${e.count} eps` : '+1 ep')
            : t('month.completed_chip')
          return (
            <div key={e.key} style={{
              position: 'absolute', left: x - 40, top: y - COVER_H / 2,
              transform: 'translateX(-50%)', width: 88, textAlign: 'center',
              animation: `fadeInUp 0.3s ease ${0.28 + i * 0.05}s both`,
            }}>
              <button
                onClick={() => onItemClick && onItemClick(e.item)}
                onPointerDown={ev => { ev.currentTarget.style.transform = 'scale(1.12)'; ev.currentTarget.style.boxShadow = `0 0 20px ${color}, 0 8px 18px rgba(0,0,0,0.3), 0 0 0 3px ${color}` }}
                onPointerUp={ev => { ev.currentTarget.style.transform = 'scale(1)'; ev.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.18), 0 0 0 3px ${color}` }}
                onPointerLeave={ev => { ev.currentTarget.style.transform = 'scale(1)'; ev.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.18), 0 0 0 3px ${color}` }}
                style={{
                  position: 'relative', width: COVER_W, height: COVER_H, margin: '0 auto', padding: 0,
                  borderRadius: 10, overflow: 'hidden', border: 'none', cursor: 'pointer',
                  background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                  boxShadow: `0 4px 12px rgba(0,0,0,0.18), 0 0 0 3px ${color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}>
                {e.item.cover
                  ? <img src={e.item.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <span style={{ color: CAT_COLOR[e.item.category], display: 'inline-flex' }}><CategoryIcon cat={e.item.category} size={26} /></span>
                }
              </button>
              <p style={{ fontSize: 10, fontWeight: 800, color, marginTop: 6, lineHeight: 1 }}>
                {label}
              </p>
              <p style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
                {new Date(e.date).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short' })}
              </p>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', marginTop: 2, lineHeight: 1.2,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {e.item.title}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const x2off = (x, W) => Math.min(Math.max(x / W, 0), 1)

export function NavBtn({ onClick, dir, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: disabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)',
        border: 'none', cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1, transition: 'background 0.15s',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  )
}

// Um destaque por categoria — empates resolvidos com "Spotlight battle"
function BestOfMonth({ rated, monthKey, t }) {
  const [winners, setWinners] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`bestWinners_${monthKey}`)) || {} } catch { return {} }
  })
  const [battle, setBattle] = useState(null)   // { cat, items } da batalha ativa

  if (!rated.length) return null

  // Top de cada categoria (todas as 3 são sempre mostradas)
  const CAT_NAME = { book: t('cat.book'), game: t('cat.game'), film: t('cat.film') }
  const cats = (['book', 'game', 'film']).map(cat => {
    const inCat = rated.filter(i => i.category === cat)
    if (!inCat.length) return { cat, empty: true }
    const max = Math.max(...inCat.map(i => i.rating))
    const tied = inCat.filter(i => i.rating === max)
    let winner = tied.length === 1 ? tied[0] : tied.find(i => i.id === winners[cat]) || null
    return { cat, tied, winner, isTie: tied.length > 1 }
  })

  const setWinner = (cat, id) => {
    const next = { ...winners, [cat]: id }
    setWinners(next)
    localStorage.setItem(`bestWinners_${monthKey}`, JSON.stringify(next))
    setBattle(null)
  }

  return (
    <div>
      <p style={{ fontSize: 10, color: '#F5A623', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {t('month.best_of_category')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {cats.map(({ cat, tied, winner, isTie, empty }, i) => (
          empty ? (
            // Categoria sem items avaliados → incentivo a adicionar
            <div key={cat} style={{
              minWidth: 0, aspectRatio: '2/3.4', borderRadius: 12,
              border: '1.5px dashed var(--item-glass-border)',
              background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
              backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              textAlign: 'center', padding: '10px 8px',
              animation: `fadeInScale 0.3s ease ${i * 0.05}s both`,
            }}>
              <span style={{ color: CAT_COLOR[cat], opacity: 0.85, display: 'inline-flex' }}><CategoryIcon cat={cat} size={26} /></span>
              <p style={{ fontSize: 11, fontWeight: 800, color: CAT_COLOR[cat] }}>{CAT_NAME[cat]}</p>
              <p style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--item-label)', lineHeight: 1.4 }}>
                {t('month.rate_to_feature', { cat: CAT_NAME[cat].toLowerCase() })}
              </p>
            </div>
          ) : winner ? (
            <div key={cat} style={{ position: 'relative', minWidth: 0 }}>
              <BestCard item={winner} delay={i * 0.05} />
              {isTie && (
                <button onClick={() => setBattle({ cat, items: tied })}
                  title="Refazer batalha"
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  ⚔️
                </button>
              )}
            </div>
          ) : (
            // Empate por resolver → gatilho da batalha
            <button key={cat} onClick={() => setBattle({ cat, items: tied })}
              style={{
                borderRadius: 12, border: 'none', cursor: 'pointer', overflow: 'hidden', minWidth: 0,
                background: 'linear-gradient(160deg,#1A1A2E,#3A2A5E)',
                aspectRatio: '2/3.4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                animation: `fadeInScale 0.3s ease ${i * 0.05}s both`,
              }}>
              <span style={{ fontSize: 26 }}>⚔️</span>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'white' }}>{t('month.tied', { n: tied.length })}</p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{CAT_NAME[cat]} · {t('month.tap')}</p>
            </button>
          )
        ))}
      </div>

      {/* Spotlight battle */}
      {battle && (
        <SpotlightBattle
          cat={battle.cat}
          items={battle.items}
          catName={CAT_NAME[battle.cat]}
          onWin={(id) => setWinner(battle.cat, id)}
          onClose={() => setBattle(null)}
          t={t}
        />
      )}
    </div>
  )
}

// Batalha de holofotes — cada item recebe um foco; o utilizador decide o vencedor
function SpotlightBattle({ cat, items, catName, onWin, onClose, t }) {
  const [winnerId, setWinnerId] = useState(null)

  const choose = (id) => {
    if (winnerId) return
    setWinnerId(id)
    setTimeout(() => onWin(id), 2600)   // deixa o holofote brilhar uns segundos
  }

  const root = (typeof document !== 'undefined' && document.getElementById('root')) || null
  const overlay = (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'absolute', inset: 0, zIndex: 400, borderRadius: 'inherit', overflow: 'hidden',
        background: 'radial-gradient(ellipse at center, #1A1530 0%, #08060F 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 0.3s ease both',
      }}>
      <p style={{ fontSize: 11, color: '#F5A623', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2 }}>{t('month.spotlight')}</p>
      <h2 style={{ fontSize: 22, color: 'white', fontWeight: 900, marginBottom: 4 }}>{catName}</h2>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 28 }}>
        {winnerId ? t('month.winner') : t('month.choose_spotlight')}
      </p>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center' }}>
        {items.map((it, i) => {
          const isWinner = winnerId === it.id
          const isLoser = winnerId && !isWinner
          return (
            <button key={it.id} onClick={() => choose(it.id)} disabled={!!winnerId}
              style={{
                position: 'relative', background: 'none', border: 'none', cursor: winnerId ? 'default' : 'pointer',
                width: 110, transition: 'transform 0.5s cubic-bezier(.34,1.56,.64,1), filter 0.5s ease, opacity 0.5s',
                transform: isWinner ? 'scale(1.2) translateY(-10px)' : isLoser ? 'scale(0.8)' : 'scale(1)',
                filter: isLoser ? 'brightness(0.1) grayscale(0.9)' : 'none',
                opacity: isLoser ? 0.18 : 1,
                animation: winnerId ? 'none' : `spotIn 0.5s cubic-bezier(.34,1.56,.64,1) ${i * 0.12}s backwards`,
              }}>
              {/* Holofote — raios de luz a irradiar por trás da capa */}
              {isWinner && (
                <div style={{
                  position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)',
                  width: 460, height: 460, zIndex: -1, pointerEvents: 'none',
                  animation: 'spotBeam 0.5s ease both',
                }}>
                  <div style={{
                    width: '100%', height: '100%', borderRadius: '50%',
                    background: 'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.5) 0deg 4deg, transparent 4deg 15deg)',
                    WebkitMaskImage: 'radial-gradient(circle, #000 14%, rgba(0,0,0,0.55) 36%, transparent 66%)',
                    maskImage: 'radial-gradient(circle, #000 14%, rgba(0,0,0,0.55) 36%, transparent 66%)',
                    animation: 'rayspin 18s linear infinite',
                  }} />
                  {/* brilho central suave */}
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.45) 0%, transparent 40%)',
                  }} />
                </div>
              )}
              {/* Brilho atrás (antes da escolha) */}
              <div style={{
                position: 'absolute', inset: -14, borderRadius: 16, pointerEvents: 'none',
                background: (isWinner || isLoser) ? 'transparent'
                  : 'radial-gradient(circle, rgba(255,245,200,0.18), transparent 70%)',
                transition: 'background 0.4s',
              }} />
              {/* Capa */}
              <div style={{
                position: 'relative', width: '100%', aspectRatio: '2/3', borderRadius: 10, overflow: 'hidden',
                boxShadow: isWinner ? '0 0 28px rgba(255,255,255,0.9)' : '0 10px 30px rgba(0,0,0,0.6)',
                border: isWinner ? '2px solid #fff' : '2px solid transparent',
              }}>
                <CoverImage src={it.cover} category={it.category} radius={0} fill title={it.title} isMovie={it.category === 'film' && !it.is_series} />
              </div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'white', marginTop: 8, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isWinner && '🏆 '}{it.title}
              </p>
              <p style={{ fontSize: 11, color: '#F5A623', fontWeight: 700, textAlign: 'center' }}>{'★'.repeat(it.rating)}</p>
            </button>
          )
        })}
      </div>

      {!winnerId && (
        <button onClick={onClose} style={{ marginTop: 30, fontSize: 13, color: 'rgba(255,255,255,0.6)', background: 'none', fontFamily: 'Nunito', fontWeight: 700 }}>
          {t('month.cancel')}
        </button>
      )}

      {/* Cortinado vermelho a abrir */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, overflow: 'hidden', borderRadius: 'inherit' }}>
        {[ 'left', 'right' ].map(side => (
          <div key={side} style={{
            position: 'absolute', top: 0, bottom: 0, [side]: 0, width: '51%',
            background: `repeating-linear-gradient(90deg, rgba(0,0,0,0.32) 0 7px, rgba(255,255,255,0.05) 7px 26px), linear-gradient(${side === 'left' ? '90deg' : '270deg'}, #3d080b, #7d1419 35%, #5c0f13 60%, #8b1a20 85%, #2e0608)`,
            boxShadow: `inset ${side === 'left' ? '-' : ''}24px 0 50px rgba(0,0,0,0.55)`,
            // Borda interna curva só na parte de baixo (pano drapeado)
            ...(side === 'left'
              ? { borderBottomRightRadius: '140px 200px' }
              : { borderBottomLeftRadius: '140px 200px' }),
            animation: `curtain${side === 'left' ? 'Left' : 'Right'} 1.25s cubic-bezier(.72,0,.28,1) 0.2s both`,
          }} />
        ))}
      </div>
    </div>
  )
  return root ? createPortal(overlay, root) : overlay
}

function BestCard({ item, delay = 0 }) {
  return (
    <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', animation: `fadeInUp 0.3s ease ${delay}s both` }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '2/3' }}>
        <CoverImage src={item.cover} category={item.category} radius={0} fill title={item.title} isMovie={item.category === 'film' && !item.is_series} />
      </div>
      <div style={{ padding: '7px 8px 9px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
        <p style={{ fontSize: 11, color: '#F5A623', fontWeight: 700, marginTop: 2 }}>{'★'.repeat(item.rating)}</p>
      </div>
    </div>
  )
}

function Donut({ data, total }) {
  const size = 96, cx = 48, cy = 48, r = 36, inner = 22
  const parts = data.filter(d => d.value > 0)
  let start = -Math.PI / 2
  const arcs = parts.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI
    // arco completo (1 só categoria) → desenha anel cheio
    if (parts.length === 1) {
      start += angle
      return <circle key={i} cx={cx} cy={cy} r={(r + inner) / 2} fill="none" stroke={d.color} strokeWidth={r - inner} />
    }
    const end = start + angle - 0.03
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end)
    const ix1 = cx + inner * Math.cos(start), iy1 = cy + inner * Math.sin(start)
    const ix2 = cx + inner * Math.cos(end),   iy2 = cy + inner * Math.sin(end)
    const la = angle > Math.PI ? 1 : 0
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${la} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${la} 0 ${ix1} ${iy1} Z`
    start += angle
    return <path key={i} d={path} fill={d.color} />
  })
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {total === 0 && <circle cx={cx} cy={cy} r={(r + inner) / 2} fill="none" stroke="var(--surface-2)" strokeWidth={r - inner} />}
      {arcs}
      <text x={cx} y={cy - 3} textAnchor="middle" style={{ fontSize: 20, fontWeight: 900, fill: 'var(--text)', fontFamily: 'Nunito' }}>{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'Nunito' }}>items</text>
    </svg>
  )
}

function MiniStat({ emoji, value, label, color }) {
  return (
    <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 12, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 20, fontWeight: 900, color }}>{value}</p>
        <span style={{ fontSize: 16 }}>{emoji}</span>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{label}</p>
    </div>
  )
}

function Goal({ label, current, currentStr, target, suffix = '', color, onTarget, last, cat }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(target))
  const pct = Math.min((current / target) * 100, 100)
  const done = current >= target
  const curr = currentStr ?? String(current)

  return (
    <div style={{ marginBottom: last ? 0 : 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{done ? '🏅 ' : ''}{cat && <span style={{ color: CAT_COLOR[cat], display: 'inline-flex' }}><CategoryIcon cat={cat} size={15} /></span>}{label}</span>
        {editing ? (
          <input
            type="number" value={draft} autoFocus
            onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => { onTarget(parseInt(draft) || target); setEditing(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { onTarget(parseInt(draft) || target); setEditing(false) } }}
            style={{ width: 64, textAlign: 'right', fontSize: 12, fontWeight: 700, padding: '2px 6px', border: `1.5px solid ${color}`, borderRadius: 8 }}
          />
        ) : (
          <button onClick={() => { setDraft(String(target)); setEditing(true) }} style={{ background: 'none', fontSize: 12, fontWeight: 700, color }}>
            {curr}{suffix} / {target}{suffix} ✏️
          </button>
        )}
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease', animation: 'progressFill 0.8s ease both' }} />
      </div>
    </div>
  )
}
