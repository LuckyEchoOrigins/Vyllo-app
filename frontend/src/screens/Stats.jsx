import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CAT_EMOJI, calculateStreak, bestStreak, weekActivity, formatRuntime, getShields, isPremium, requirePremium } from '../utils'
import StarRating from '../components/StarRating'
import CoverImage from '../components/CoverImage'
import CategoryIcon from '../components/CategoryIcon'
import StatusIcon from '../components/StatusIcon'
import Icon from '../components/Icon'
import MonthView from './MonthView'
import YearView from './YearView'
import { useLang } from '../i18n'

// DAY_LETTERS is now computed inside the component using t() — removed from module level

function itemDate(item) {
  return item.end_date || item.updated_at || item.created_at
}

function inPeriod(item, period) {
  if (period === 'all') return true
  const d = new Date(itemDate(item))
  const now = new Date()
  if (period === 'year')  return d.getFullYear() === now.getFullYear()
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  return true
}

export default function Stats({ items, onItemClick, onNavigate, enabledCats = ['book', 'game', 'film'], onEditGoals }) {
  const { t } = useLang()

  const DAY_LETTERS = [
    t('stats_days.sun'), t('stats_days.mon'), t('stats_days.tue'), t('stats_days.wed'),
    t('stats_days.thu'), t('stats_days.fri'), t('stats_days.sat'),
  ]

  const PERIODS = [
    { id: 'all',   label: t('stats.period_total') },
    { id: 'year',  label: t('stats.period_year') },
    { id: 'month', label: t('stats.period_month') },
  ]

  const CATS = [
    { id: 'all',  label: t('cat.all') },
    { id: 'book', label: t('cat.book') },
    { id: 'game', label: t('cat.game') },
    { id: 'film', label: t('cat.film') },
  ]

  const visibleCats = CATS.filter(c => c.id === 'all' ? enabledCats.length > 1 : enabledCats.includes(c.id))
  const [period, setPeriod] = useState('all')
  const [cat, setCat] = useState('all')
  const [selRating, setSelRating] = useState(null)
  const [selYear, setSelYear] = useState(null)

  // Filtra por período e categoria
  const byPeriod = period === 'all'
    ? items
    : items.filter(i => inPeriod(i, period) && i.status !== 'wishlist')
  const filtered = cat === 'all' ? byPeriod : byPeriod.filter(i => i.category === cat)

  const total      = filtered.length
  const completed  = filtered.filter(i => i.status === 'completed').length
  const inProgress = filtered.filter(i => i.status === 'in_progress').length
  const wishlist   = period === 'all'
    ? items.filter(i => i.status === 'wishlist' && (cat === 'all' || i.category === cat)).length
    : 0
  const abandoned  = filtered.filter(i => i.status === 'abandoned').length
  const streak     = calculateStreak(items) // sequência usa sempre todos os itens
  const maxStreak  = bestStreak(items)
  const week       = weekActivity(items)
  const shields    = getShields()

  const catCounts = {
    book: filtered.filter(i => i.category === 'book').length,
    game: filtered.filter(i => i.category === 'game').length,
    film: filtered.filter(i => i.category === 'film').length,
  }

  const totalFilmMinutes = filtered
    .filter(i => i.category === 'film' && !i.is_series && i.runtime &&
      (i.status === 'completed' || i.status === 'in_progress'))
    .reduce((s, i) => s + (i.status === 'completed' ? i.runtime : Math.round(i.runtime / 2)), 0)
  const totalFilmHours = (totalFilmMinutes / 60).toFixed(1)

  const recentReviews = items
    .filter(i => i.status === 'completed' && i.rating > 0 && (cat === 'all' || i.category === cat))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 4)

  // Top 5 de sempre
  const allTop5 = items
    .filter(i => i.status === 'completed' && i.rating > 0 && (cat === 'all' || i.category === cat))
    .sort((a, b) => b.rating - a.rating || new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5)

  // Histórico por ano — sempre 6 colunas (ano atual + 5 anteriores)
  const currentYear = new Date().getFullYear()
  const displayYears = Array.from({ length: 6 }, (_, i) => String(currentYear - 5 + i))
  const yearHistory = {}
  items
    .filter(i => i.status === 'completed' && i.updated_at && (cat === 'all' || i.category === cat))
    .forEach(i => { const y = i.updated_at.slice(0, 4); yearHistory[y] = (yearHistory[y] || 0) + 1 })
  const maxHistCount = Math.max(1, ...displayYears.map(y => yearHistory[y] || 0))

  // Distribuição de avaliações
  const ratingDist = [5, 4, 3, 2, 1].map(r => ({
    stars: r,
    count: filtered.filter(i => i.status === 'completed' && i.rating === r).length,
  }))
  const maxRatingCount = Math.max(1, ...ratingDist.map(r => r.count))

  // Donut
  const svgSize = 140, cx = 70, cy = 70, r = 52, innerR = 32
  const donutParts = [
    { cat: 'book', count: catCounts.book, color: 'var(--cat-book)' },
    { cat: 'game', count: catCounts.game, color: 'var(--cat-game)' },
    { cat: 'film', count: catCounts.film, color: 'var(--cat-film)' },
  ].filter(p => p.count > 0)

  const renderDonut = () => {
    if (total === 0) return null
    let startAngle = -Math.PI / 2
    return donutParts.map(({ count, color, cat }) => {
      const angle = (count / total) * 2 * Math.PI
      const endAngle = startAngle + angle - 0.02
      const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
      const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle)
      const ix1 = cx + innerR * Math.cos(startAngle), iy1 = cy + innerR * Math.sin(startAngle)
      const ix2 = cx + innerR * Math.cos(endAngle),   iy2 = cy + innerR * Math.sin(endAngle)
      const la = angle > Math.PI ? 1 : 0
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${la} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${la} 0 ${ix1} ${iy1} Z`
      startAngle += angle
      return <path key={cat} d={d} style={{ fill: color, transition: 'd 0.5s ease' }} />
    })
  }

  const periodLabel = period === 'month' ? t('stats.this_month') : period === 'year' ? t('stats.this_year') : ''

  return (
    <div className="screen">
      <div className="screen-content">

        {/* Header */}
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 20px) 20px 12px', animation: 'fadeInUp 0.3s ease both' }}>
          <h1 style={{ fontSize: 22 }}>{t('stats.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{t('stats.subtitle')}</p>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 8, padding: '0 20px', marginBottom: 16, animation: 'fadeInUp 0.3s ease 0.05s both' }}>
          {PERIODS.map(p => {
            const locked = p.id === 'year' && !isPremium()
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (locked) { requirePremium('year'); return }
                  setPeriod(p.id)
                }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 12,
                  border: `1.5px solid ${period === p.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: 'var(--surface)',
                  color: period === p.id ? 'var(--accent)' : 'var(--text-muted)',
                  boxShadow: period === p.id ? '0 0 8px var(--accent)99' : 'none',
                  fontSize: 12, fontWeight: 700, fontFamily: 'Nunito',
                  transition: 'all 0.2s cubic-bezier(.22,1,.36,1)',
                  position: 'relative',
                }}
              >
                {p.label}
                {locked && (
                  <span style={{ position: 'absolute', top: 3, right: 5, fontSize: 9, color: 'var(--accent)', opacity: 0.8 }}>
                    <Icon name="lock" size={9} strokeWidth={2.5} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Vistas dedicadas ── */}
        {period === 'month' && <MonthView items={items} onItemClick={onItemClick} />}
        {period === 'year' && <YearView items={items} onItemClick={onItemClick} onEditGoals={onEditGoals} />}

        {/* ── Vista padrão (Total) ── */}
        {period === 'all' && <>

        {/* Category selector */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 20px', overflowX: 'auto', marginBottom: 10, animation: 'fadeInUp 0.3s ease 0.08s both' }}>
          {visibleCats.map(c => {
            const on = cat === c.id
            const cc = c.id === 'all' ? 'var(--accent)' : `var(--cat-${c.id})`
            return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              style={{
                flexShrink: 0,
                padding: '6px 14px', borderRadius: 20,
                border: `1.5px solid ${on ? cc : 'var(--border)'}`,
                background: 'var(--surface)',
                color: on ? cc : 'var(--text-muted)',
                boxShadow: on ? `0 0 8px color-mix(in srgb, ${cc} 60%, transparent)` : 'none',
                fontSize: 12, fontWeight: 700, fontFamily: 'Nunito',
                cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <CategoryIcon cat={c.id} size={14} strokeWidth={2.2} />
              {c.label}
            </button>
            )
          })}
        </div>

        {/* Summary cards */}
        <div
          key={`${period}-${cat}`}   // re-mounts on period/category change → triggers animation
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 20px', marginBottom: 20 }}
        >
          <StatCard value={total}      label={period === 'all' ? t('stats.total') : t('stats.active')}  status="all"         color="var(--accent)" delay={0} onClick={() => onNavigate && onNavigate(cat, 'all')} />
          <StatCard value={completed}  label={t('stats.completed')}    status="completed"   color="#2DB87A" delay={1} onClick={() => onNavigate && onNavigate(cat, 'completed')} />
          <StatCard value={inProgress} label={t('stats.in_progress')}  status="in_progress" color="var(--accent)" delay={2} onClick={() => onNavigate && onNavigate(cat, 'in_progress')} />
          {period === 'all'
            ? <StatCard value={wishlist} label={t('stats.waiting_list')} status="wishlist" color="#F5A623" delay={3} onClick={() => onNavigate && onNavigate(cat, 'wishlist')} />
            : <StatCard value={abandoned} label={t('stats.abandoned')} status="abandoned" color="#FF4757" delay={3} onClick={() => onNavigate && onNavigate(cat, 'abandoned')} />
          }
        </div>

        {/* Streak */}
        <div style={{ margin: '0 20px 16px', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', borderRadius: 16, padding: 20, animation: 'fadeInUp 0.35s ease 0.2s both' }}>
          {/* Sequência atual + melhor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ color: 'white', display: 'flex' }}><Icon name="flame" size={38} strokeWidth={2} /></div>
            <div>
              <p style={{ fontSize: 32, fontWeight: 900, color: 'white', lineHeight: 1 }}>{streak}</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                {t('stats.day_streak')}
              </p>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: 'white', lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="trophy" size={18} strokeWidth={2.3} /> {maxStreak}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginTop: 3 }}>{t('stats.best_streak')}</p>
            </div>
          </div>

          {/* Escudos disponíveis */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px' }}>
            <span style={{ color: 'white', display: 'flex' }}><Icon name="shield" size={17} strokeWidth={2.2} /></span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'white' }}>{shields}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
              {shields === 1 ? t('stats.shield_singular') : t('stats.shield_plural')}
            </span>
          </div>

          {/* Demonstração da semana */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginTop: 18 }}>
            {week.map((d, i) => (
              <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                {/* Ícones das categorias do dia */}
                <div style={{
                  height: 40, width: '100%', borderRadius: 10,
                  background: d.cats.length ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                  border: d.isToday ? '1.5px solid rgba(255,255,255,0.9)' : '1.5px solid transparent',
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 1,
                  padding: 2,
                }}>
                  {d.cats.length
                    ? d.cats.map(c => <span key={c} style={{ color: 'white', display: 'inline-flex' }}><CategoryIcon cat={c} size={11} strokeWidth={2.4} /></span>)
                    : d.isVacation
                      ? <span style={{ color: 'white', display: 'inline-flex' }}><Icon name="beach" size={14} strokeWidth={2.2} /></span>
                      : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>·</span>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: d.isToday ? 'white' : 'rgba(255,255,255,0.6)' }}>
                  {DAY_LETTERS[d.dow]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Horas de cinema — só quando a categoria "Filmes" está selecionada */}
        {cat === 'film' && totalFilmMinutes > 0 && (
          <div style={{ margin: '0 20px 16px', background: 'linear-gradient(135deg, #F5A623, #f7b84b)', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeInUp 0.35s ease 0.25s both' }}>
            <div style={{ color: 'white', display: 'flex' }}><CategoryIcon cat="film" size={34} strokeWidth={1.9} /></div>
            <div>
              <p style={{ fontSize: 32, fontWeight: 900, color: 'white', lineHeight: 1 }}>{totalFilmHours}h</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                {t('stats.of_cinema', { period: periodLabel ? periodLabel + ' ' : '' })}
              </p>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
                {filtered.filter(i => i.category === 'film' && !i.is_series && i.status === 'completed' && i.runtime).length}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{t('stats.completed_label')}</p>
            </div>
          </div>
        )}

        {/* Donut chart — só quando "Todas" as categorias */}
        {total > 0 && cat === 'all' && (
          <div style={{ margin: '0 20px 16px', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.3s both' }}>
            <h2 style={{ fontSize: 15, marginBottom: 16 }}>{t('stats.by_category')}{periodLabel ? ` (${periodLabel})` : ''}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ flexShrink: 0 }}>
                <svg width={svgSize} height={svgSize}>
                  {renderDonut()}
                  {total === 0 && <circle cx={cx} cy={cy} r={r} fill="var(--border)" />}
                  <text x={cx} y={cy - 6}  textAnchor="middle" style={{ fontSize: 22, fontWeight: 900, fill: 'var(--text)', fontFamily: 'Nunito' }}>{total}</text>
                  <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'Nunito' }}>{t('stats.items_label')}</text>
                </svg>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['book', 'game', 'film']).map(cat => (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: `var(--cat-${cat})`, display: 'flex' }}><CategoryIcon cat={cat} size={15} strokeWidth={2.2} /></span>
                        {cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film')}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: `var(--cat-${cat})` }}>{catCounts[cat]}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${total > 0 ? (catCounts[cat] / total) * 100 : 0}%`,
                        background: `var(--cat-${cat})`, borderRadius: 3,
                        transition: 'width 0.6s cubic-bezier(.22,1,.36,1)',
                        animation: 'progressFill 0.8s ease both',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Taxa de conclusão */}
        {total > 0 && (
          <div style={{ margin: '0 20px 16px', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.35s both' }}>
            <h2 style={{ fontSize: 15, marginBottom: 16 }}>{t('stats.completion_rate')}</h2>
            {(['book', 'game', 'film']).map(cat => {
              const tc = filtered.filter(i => i.category === cat).length
              const done = filtered.filter(i => i.category === cat && i.status === 'completed').length
              const pct = tc > 0 ? (done / tc) * 100 : 0
              if (tc === 0) return null
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                      <span style={{ color: `var(--cat-${cat})`, display: 'flex' }}><CategoryIcon cat={cat} size={15} strokeWidth={2.2} /></span>
                      {cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film')}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: `var(--cat-${cat})` }}>
                      {done}/{tc} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `linear-gradient(90deg, var(--cat-${cat}), color-mix(in srgb, var(--cat-${cat}) 73%, transparent))`,
                      borderRadius: 5,
                      transition: 'width 0.7s cubic-bezier(.22,1,.36,1)',
                      animation: 'progressFill 0.9s ease both',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Top 5 de sempre */}
        {allTop5.length > 0 && (
          <div style={{ margin: '0 20px 16px', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.38s both' }}>
            <h2 style={{ fontSize: 15, marginBottom: 14 }}>{t('stats.all_time_top5')}</h2>
            {allTop5.map((it, i) => (
              <div key={it.id} onClick={() => onItemClick?.(it)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 6px', margin: i === allTop5.length - 1 ? '0 -6px' : '0 -6px 10px', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? '#F5A623' : 'var(--text-muted)', width: 22, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                <CoverImage src={it.cover} category={it.category} size={40} radius={8} isMovie={it.category === 'film' && !it.is_series} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                  <StarRating value={it.rating} readonly />
                </div>
                <span style={{ color: `var(--cat-${it.category})`, display: 'flex', flexShrink: 0 }}><CategoryIcon cat={it.category} size={16} strokeWidth={2.2} /></span>
              </div>
            ))}
          </div>
        )}

        {/* Histórico por ano */}
        <div style={{ margin: '0 20px 16px', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.4s both' }}>
          <h2 style={{ fontSize: 15, marginBottom: 16 }}>{t('stats.history_by_year')}</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
            {displayYears.map((y, i) => {
              const count = yearHistory[y] || 0
              const barH = count > 0 ? Math.max(6, Math.round((count / maxHistCount) * 64)) : 0
              const isCurrentYear = y === String(currentYear)
              const isEmpty = count === 0
              return (
                <button key={y} onClick={() => !isEmpty && (requirePremium('year') && setSelYear(y))}
                  disabled={isEmpty}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', padding: 0, cursor: isEmpty ? 'default' : 'pointer' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: isCurrentYear ? 'var(--accent)' : isEmpty ? 'transparent' : 'var(--text-muted)', minHeight: 14 }}>{count || ''}</span>
                  <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                    {count > 0
                      ? <div style={{ width: '100%', height: barH, background: isCurrentYear ? 'var(--accent)' : 'var(--accent)88', borderRadius: '4px 4px 0 0', animation: `progressFill 0.6s cubic-bezier(.22,1,.36,1) ${0.42 + i * 0.04}s both` }} />
                      : <div style={{ width: '100%', height: 3, background: 'var(--surface-2)', borderRadius: 2 }} />
                    }
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: isCurrentYear ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{y}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Distribuição de avaliações */}
        {ratingDist.some(r => r.count > 0) && (
          <div style={{ margin: '0 20px 16px', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', animation: 'fadeInUp 0.35s ease 0.42s both' }}>
            <h2 style={{ fontSize: 15, marginBottom: 14 }}>{t('stats.rating_distribution')}</h2>
            {ratingDist.map(({ stars, count }, i) => (
              <button key={stars} onClick={() => count > 0 && setSelRating(stars)}
                disabled={count === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'calc(100% + 12px)', margin: `0 -6px ${i === ratingDist.length - 1 ? 0 : 9}px`, background: 'none', borderRadius: 8, padding: '4px 6px', cursor: count > 0 ? 'pointer' : 'default', transition: 'background 0.15s' }}
                onMouseEnter={e => count > 0 && (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#F5A623', width: 8, flexShrink: 0 }}>{stars}</span>
                <span style={{ fontSize: 11, color: '#F5A623', flexShrink: 0 }}>★</span>
                <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${maxRatingCount > 0 ? (count / maxRatingCount) * 100 : 0}%`, background: `rgba(245,166,35,${0.5 + 0.5 * (stars / 5)})`, borderRadius: 4, animation: `progressFill 0.7s cubic-bezier(.22,1,.36,1) ${0.44 + i * 0.05}s both` }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: count > 0 ? '#F5A623' : 'var(--text-muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                {count > 0 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>}
              </button>
            ))}
          </div>
        )}

        {/* Bottom sheet — itens por avaliação */}
        {selRating !== null && <RatingSheet stars={selRating} items={filtered} onClose={() => setSelRating(null)} onItemClick={onItemClick} t={t} />}
        {/* Bottom sheet — itens por ano */}
        {selYear !== null && <YearSheet year={selYear} items={items} initialCat={cat} onClose={() => setSelYear(null)} onItemClick={onItemClick} t={t} />}

        {/* Últimas reviews */}
        {recentReviews.length > 0 && (
          <div style={{ margin: '0 20px 20px', animation: 'fadeInUp 0.35s ease 0.4s both' }}>
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>{t('stats.recent_reviews')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentReviews.map((item, i) => (
                <div key={item.id} onClick={() => onItemClick?.(item)}
                  style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', animation: `fadeInUp 0.3s ease ${0.42 + i * 0.05}s both`, cursor: 'pointer' }}>
                  <CoverImage src={item.cover} category={item.category} size={40} radius={8} isMovie={item.category === 'film' && !item.is_series} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                    <StarRating value={item.rating} readonly />
                  </div>
                  <span style={{ color: `var(--cat-${item.category})`, display: 'flex' }}><CategoryIcon cat={item.category} size={17} strokeWidth={2.1} /></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {total === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 32px', animation: 'fadeInUp 0.3s ease both' }}>
            <p style={{ fontSize: 48, marginBottom: 16 }}>📊</p>
            <h2 style={{ marginBottom: 8 }}>
              {period === 'all' ? t('stats.no_data') : t('stats.no_activity', { period: periodLabel })}
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              {period === 'all' ? t('stats.add_items') : t('stats.try_total')}
            </p>
          </div>
        )}

        </>}
      </div>
    </div>
  )
}

function RatingSheet({ stars, items, onClose, onItemClick, t }) {
  const ratingItems = items.filter(it => it.status === 'completed' && it.rating === stars)
  const startY = useRef(null)
  const [dragY, setDragY] = useState(0)

  const onTouchStart = e => { startY.current = e.touches[0].clientY; setDragY(0) }
  const onTouchMove = e => { const dy = e.touches[0].clientY - startY.current; if (dy > 0) setDragY(dy) }
  const onTouchEnd = () => { if (dragY > 100) onClose(); else setDragY(0) }

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', animation: 'fadeIn 0.22s ease both' }} />
      {/* Sheet */}
      <div style={{ position: 'relative', height: '80%', background: 'var(--bg)', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s cubic-bezier(.22,1,.36,1) both', transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.3s cubic-bezier(.22,1,.36,1)' : 'none', willChange: 'transform' }}>
        {/* Handle — zona de swipe */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0, touchAction: 'none' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        {/* Header — também arrasta */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 14px', flexShrink: 0, touchAction: 'none' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#F5A623' }}>{'★'.repeat(stars)}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ratingItems.length} {t('stats.items_label')}</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ratingItems.map((it, i) => (
            <div key={it.id} onClick={() => { onClose(); onItemClick?.(it) }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer', boxShadow: `0 2px 8px rgba(0,0,0,0.06), inset 0 -3px 8px var(--cat-${it.category})40`, animation: `fadeInUp 0.22s ease ${i * 0.04}s both`, borderBottom: `3px solid var(--cat-${it.category})` }}>
              <CoverImage src={it.cover} category={it.category} size={48} radius={10} isMovie={it.category === 'film' && !it.is_series} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                <StarRating value={it.rating} readonly />
              </div>
              <span style={{ color: `var(--cat-${it.category})`, display: 'flex', flexShrink: 0 }}><CategoryIcon cat={it.category} size={18} strokeWidth={2.1} /></span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.getElementById('root')
  )
}

function YearSheet({ year, items, initialCat = 'all', onClose, onItemClick, t }) {
  const startY = useRef(null)
  const [dragY, setDragY] = useState(0)
  const [sheetCat, setSheetCat] = useState(initialCat)

  const onTouchStart = e => { startY.current = e.touches[0].clientY; setDragY(0) }
  const onTouchMove = e => { const dy = e.touches[0].clientY - startY.current; if (dy > 0) setDragY(dy) }
  const onTouchEnd = () => { if (dragY > 100) onClose(); else setDragY(0) }

  const yearItems = items.filter(i =>
    i.status === 'completed' && i.updated_at?.startsWith(year) &&
    (sheetCat === 'all' || i.category === sheetCat)
  ).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  const catOptions = [
    { id: 'all', label: t('cat.all') },
    { id: 'book', label: t('cat.book') },
    { id: 'game', label: t('cat.game') },
    { id: 'film', label: t('cat.film') },
  ]

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', animation: 'fadeIn 0.22s ease both' }} />
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ position: 'relative', height: '80%', background: 'var(--bg)', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s cubic-bezier(.22,1,.36,1) both', transform: `translateY(${dragY}px)`, transition: dragY === 0 ? 'transform 0.3s cubic-bezier(.22,1,.36,1)' : 'none', willChange: 'transform' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0, touchAction: 'none' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        {/* Header */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 10px', flexShrink: 0, touchAction: 'none' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900 }}>{year}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{yearItems.length} {t('stats.completed_label')}</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {/* Filtro de categoria */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px', flexShrink: 0, overflowX: 'auto' }}>
          {catOptions.map(c => {
            const on = sheetCat === c.id
            const color = c.id === 'all' ? 'var(--accent)' : `var(--cat-${c.id})`
            return (
              <button key={c.id} onClick={() => setSheetCat(c.id)}
                style={{ flexShrink: 0, padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer', transition: 'all 0.15s', border: `1.5px solid ${on ? color : 'var(--border)'}`, background: on ? `color-mix(in srgb, ${color} 10%, transparent)` : 'var(--surface)', color: on ? color : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {c.id !== 'all' && <CategoryIcon cat={c.id} size={12} strokeWidth={2.2} />}
                {c.label}
              </button>
            )
          })}
        </div>
        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {yearItems.length === 0
            ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 32 }}>{t('stats.no_completed')}</p>
            : yearItems.map((it, i) => (
              <div key={it.id} onClick={() => { onClose(); onItemClick?.(it) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer', boxShadow: `0 2px 8px rgba(0,0,0,0.06), inset 0 -3px 8px var(--cat-${it.category})40`, animation: `fadeInUp 0.22s ease ${i * 0.03}s both`, borderBottom: `3px solid var(--cat-${it.category})` }}>
                <CoverImage src={it.cover} category={it.category} size={48} radius={10} isMovie={it.category === 'film' && !it.is_series} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</p>
                </div>
                <span style={{ color: `var(--cat-${it.category})`, display: 'flex', flexShrink: 0 }}><CategoryIcon cat={it.category} size={18} strokeWidth={2.1} /></span>
              </div>
            ))
          }
        </div>
      </div>
    </div>,
    document.getElementById('root')
  )
}

function StatCard({ value, label, status, color, delay = 0, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--surface)', borderRadius: 14, padding: '14px 16px 16px', cursor: 'pointer', textAlign: 'left',
        border: '1px solid var(--border)', boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        animation: `fadeInUp 0.35s cubic-bezier(.22,1,.36,1) ${0.1 + delay * 0.06}s both`,
        transition: 'transform 0.12s',
      }}
      onPointerDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
      onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
      onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ fontSize: 28, fontWeight: 900, color, animation: 'countUp 0.4s ease both' }}>{value}</p>
        <span style={{ color, display: 'flex' }}><StatusIcon status={status} size={20} strokeWidth={2.2} /></span>
      </div>
      <p style={{ fontSize: 12, color, fontWeight: 700, marginTop: 4, opacity: 0.85 }}>{label}</p>
      {/* linha de acento (mesma linguagem dos cartões da Biblioteca) */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: color, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, boxShadow: `0 0 6px ${color}` }} />
    </button>
  )
}
