import { useState, useEffect } from 'react'
import CoverImage from '../components/CoverImage'
import PlatinumBadge from '../components/PlatinumBadge'
import PremiumButton from '../components/PremiumButton'
import CategoryIcon from '../components/CategoryIcon'
import { CAT_COLOR, CAT_LIGHT, CAT_EMOJI, formatProgress, getProgress, hasAllAchievements, goalStatus } from '../utils'
import { fetchUpcoming } from '../api'
import { useLang } from '../i18n'

export default function Home({ items, onItemClick, userName, onCategoryClick, enabledCats = ['book', 'game', 'film'], onReactivate, onNavigateProfile, goals = {}, onEditGoals }) {
  const { t, lang } = useLang()
  const wishlist = {
    book: items.filter(i => i.category === 'book' && i.status === 'wishlist').length,
    game: items.filter(i => i.category === 'game' && i.status === 'wishlist').length,
    film: items.filter(i => i.category === 'film' && i.status === 'wishlist').length,
  }

  const inProgress = items.filter(i => i.status === 'in_progress')

  // ── A seguir: próximos episódios das séries em acompanhamento ──
  // (inclui concluídas → se houver nova temporada anunciada, volta a "a ver")
  const [upcoming, setUpcoming] = useState([])
  const trackedSeries = items.filter(i => i.category === 'film' && i.is_series && (i.status === 'in_progress' || i.status === 'wishlist' || i.status === 'completed'))
  const seriesKey = trackedSeries.map(s => s.id).join(',')
  useEffect(() => {
    if (!trackedSeries.length) { setUpcoming([]); return }
    let alive = true
    // Cache de sessão (30 min) — não repete o pedido a cada entrada no Início
    try {
      const cached = JSON.parse(sessionStorage.getItem('upcomingCache') || 'null')
      if (cached && cached.key === seriesKey && Date.now() - cached.t < 1800000) {
        setUpcoming(cached.data)
        return
      }
    } catch {}
    fetchUpcoming(trackedSeries.map(s => ({ itemId: s.id, title: s.title, year: s.year, cover: s.cover })))
      .then(d => {
        if (!alive) return
        const list = Array.isArray(d) ? d : []
        setUpcoming(list)
        try { sessionStorage.setItem('upcomingCache', JSON.stringify({ key: seriesKey, t: Date.now(), data: list })) } catch {}
        // Reativa séries concluídas que têm novo episódio anunciado
        if (onReactivate) {
          list.forEach(ep => {
            const it = items.find(x => x.id === ep.itemId)
            if (it && it.status === 'completed') onReactivate(it.id)
          })
        }
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey])
  const recent = [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('greeting.morning') : hour < 18 ? t('greeting.afternoon') : t('greeting.evening')
  const showPct = (typeof localStorage !== 'undefined' && localStorage.getItem('showPercent')) !== '0'

  const currentYear = new Date().getFullYear()
  const activeGoals = enabledCats
    .filter(cat => goals[cat] > 0)
    .map(cat => {
      const done = items.filter(i =>
        i.category === cat && i.status === 'completed' &&
        new Date(i.end_date || i.updated_at || i.created_at).getFullYear() === currentYear
      ).length
      return { cat, done, status: goalStatus(done, goals[cat]) }
    })

  return (
    <div className="screen" style={{ animation: 'screenEnter 0.3s ease both' }}>
      <div className="screen-content">
        {/* Top bar */}
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 20px) 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeInUp 0.3s ease both' }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{greeting} 👋</p>
            <h1 style={{ fontSize: 22, lineHeight: 1.1, marginTop: 2 }}>{userName}!</h1>
          </div>
          <button onClick={onNavigateProfile} style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 18, fontWeight: 800, fontFamily: 'Nunito',
            animation: 'popIn 0.4s cubic-bezier(.34,1.56,.64,1) 0.1s both',
            border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
          }}>
            {userName.charAt(0).toUpperCase()}
          </button>
        </div>

        {/* Banner Premium */}
        <div style={{ padding: '4px 20px 0', animation: 'fadeInUp 0.3s ease 0.05s both' }}>
          <PremiumButton />
        </div>

        {/* Wishlist cards */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px', justifyContent: 'center' }}>
          {enabledCats.map((cat, i) => (
            <button
              key={cat}
              onClick={() => onCategoryClick && onCategoryClick(cat, 'wishlist')}
              style={{
                width: 110,
                background: 'var(--surface)',
                borderRadius: 16,
                padding: '14px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                border: `1.5px solid ${CAT_COLOR[cat]}`,
                boxShadow: `0 0 8px ${CAT_COLOR[cat]}99`,
                cursor: 'pointer',
                fontFamily: 'Nunito',
                transition: 'transform 0.12s',
                animation: `fadeInUp 0.35s ease ${0.08 + i * 0.07}s both`,
                flexShrink: 0,
              }}
              onPointerDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <span style={{ color: CAT_COLOR[cat], display: 'flex' }}><CategoryIcon cat={cat} size={26} strokeWidth={2.1} /></span>
              <p style={{ fontSize: 22, fontWeight: 900, color: CAT_COLOR[cat], lineHeight: 1 }}>{wishlist[cat]}</p>
              <p style={{ fontSize: 10, color: CAT_COLOR[cat], fontWeight: 700, textAlign: 'center', lineHeight: 1.3, opacity: 0.8 }}>
                {cat === 'book' ? t('home.want_to_read') : cat === 'game' ? t('home.want_to_play') : t('home.want_to_watch')}
              </p>
            </button>
          ))}
        </div>

        {/* Metas do ano */}
        {activeGoals.length > 0 && (
          <div style={{ padding: '4px 20px 0', animation: 'fadeInUp 0.35s ease 0.12s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ fontSize: 16 }}>{t('home.goals_for', { year: currentYear })}</h2>
              {onEditGoals && (
                <button onClick={onEditGoals} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 800, fontFamily: 'Nunito', padding: '4px 0' }}>
                  {t('home.edit')}
                </button>
              )}
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              {activeGoals.map(({ cat, status }, i) => (
                <div key={cat} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span style={{ color: `var(--cat-${cat})`, display: 'flex' }}>
                      <CategoryIcon cat={cat} size={15} strokeWidth={2.3} />
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{cat === 'book' ? t('cat.book') : cat === 'game' ? t('cat.game') : t('cat.film')}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
                      {status.done}/{status.goal}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                      background: status.achieved ? '#2DB87A22' : status.onTrack ? '#2DB87A22' : '#FF475722',
                      color: status.achieved ? '#2DB87A' : status.onTrack ? '#2DB87A' : '#FF4757',
                    }}>
                      {status.achieved ? t('home.achieved') : status.onTrack ? t('home.on_track') : t('home.behind', { n: status.behind })}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${status.pct}%`,
                      background: `var(--cat-${cat})`,
                      borderRadius: 3,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Continue reading/playing/watching */}
        {inProgress.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="section-header">
              <h2 style={{ fontSize: 16 }}>{t('home.continue')}</h2>
            </div>
            <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12, padding: '4px 20px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 12, animation: `scrollInfinite ${inProgress.length > 0 ? 20 : 10}s linear infinite` }}>
              {[...inProgress.slice(0, 4), ...inProgress.slice(0, 4)].map((item, idx) => {
                const pct = getProgress(item)
                const color = `var(--cat-${item.category})`
                const showBar = item.category !== 'game' && pct !== null
                return (
                  <div
                    key={`${item.id}-${idx}`}
                    style={{
                      flex: '0 0 auto',
                      width: 130,
                      display: 'flex', flexDirection: 'column',
                      background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                      textAlign: 'left',
                      borderBottom: `3px solid ${CAT_COLOR[item.category]}`,
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', height: 170, flexShrink: 0 }}>
                      <CoverImage src={item.cover} category={item.category} radius={0} fill title={item.title} isMovie={item.category === 'film' && !item.is_series} />
                      {hasAllAchievements(item) && <PlatinumBadge size={26} style={{ top: 8, right: 8 }} />}
                    </div>
                    <div style={{ padding: '10px 10px 12px' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatProgress(item, t)}
                      </p>
                      {/* Slot da barra — reservado em todos, visível só em livros/séries */}
                      <div style={{ marginTop: 8, height: 4 }}>
                        {showBar && (
                          <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              </div>
            </div>

            {/* Ver tudo — quando há mais de 4 em progresso */}
            {inProgress.length > 4 && (
              <button
                onClick={() => onCategoryClick && onCategoryClick('all', 'in_progress')}
                style={{
                  width: '100%', marginTop: 12, padding: '12px 20px',
                  background: 'var(--purple-light)', borderRadius: 14, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: 'Nunito' }}>{t('home.view_all')} (+{inProgress.length - 4})</span>
              </button>
            )}
          </div>
        )}

        {/* A seguir — próximos episódios */}
        {upcoming.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="section-header">
              <h2 style={{ fontSize: 16 }}>{t('home.up_next')}</h2>
            </div>
            <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.slice(0, 5).map((ep, i) => {
                const item = items.find(x => x.id === ep.itemId)
                return (
                  <button key={`${ep.itemId}-${ep.season}-${ep.number}`}
                    onClick={() => item && onItemClick(item)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'var(--surface)', borderRadius: 14, padding: 10, border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', animation: `fadeInUp 0.35s ease ${0.05 + i * 0.06}s both` }}>
                    <CoverImage src={ep.cover} category="film" size={40} radius={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>T{ep.season} E{ep.number}{ep.name ? ` · ${ep.name}` : ''}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: CAT_COLOR.film, flexShrink: 0, textAlign: 'right' }}>{formatShortDate(ep.airDate, t, lang)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Recently added */}
        {recent.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="section-header">
              <h2 style={{ fontSize: 16 }}>{t('home.recently_added')}</h2>
            </div>
            <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recent.map((item, i) => (
                <div key={item.id} style={{ animation: `fadeInUp 0.35s ease ${0.3 + i * 0.06}s both` }}>
                  <RecentItem item={item} onClick={() => onItemClick(item)} t={t} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 32px' }}>
            <div style={{ width: 84, height: 84, borderRadius: 24, margin: '0 auto 18px', background: 'linear-gradient(150deg, var(--brand-1), var(--brand-2), var(--brand-3))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 10px 28px rgba(var(--accent-rgb),0.35)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            </div>
            <h2 style={{ marginBottom: 8 }}>{t('home.empty_title')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>{t('home.empty_body')}</p>
          </div>
        )}
      </div>
    </div>
  )
}


function formatShortDate(d, t, lang) {
  if (!d) return ''
  try {
    const date = new Date(d + 'T00:00:00')
    const days = Math.ceil((date - new Date().setHours(0, 0, 0, 0)) / 86400000)
    if (days === 0) return t('home.today')
    if (days === 1) return t('home.tomorrow')
    if (days > 1 && days <= 7) return t('home.days', { n: days })
    return date.toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short' })
  } catch { return '' }
}

function RecentItem({ item, onClick, t }) {
  const color = CAT_COLOR[item.category] || '#6C47FF'
  const pct = getProgress(item)

  const statusColors = {
    not_started: { bg: 'var(--surface-2)', color: 'var(--text-muted)' },
    wishlist:    { bg: 'var(--surface-2)', color: 'var(--text-muted)' },
    in_progress: { bg: 'var(--purple-light)', color: 'var(--accent)' },
    completed:   { bg: 'var(--green-light)', color: '#2DB87A' },
    abandoned:   { bg: 'var(--red-light)', color: '#FF4757' },
  }
  const statusLabels = {
    not_started: t('status.not_started'),
    wishlist:    t('status.wishlist'),
    in_progress: t('status.in_progress'),
    completed:   t('status.completed'),
    abandoned:   t('status.abandoned'),
  }
  const sc = statusColors[item.status] ?? { bg: 'var(--surface-2)', color: 'var(--text-muted)' }

  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: '12px 12px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        textAlign: 'left', width: '100%',
        borderBottom: `3px solid ${color}`,
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <CoverImage src={item.cover} category={item.category} size={44} radius={10} isMovie={item.category === 'film' && !item.is_series} />
        {hasAllAchievements(item) && <PlatinumBadge size={18} style={{ top: -5, right: -5 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {item.title}
          </p>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 8, background: sc.bg, color: sc.color, fontWeight: 700, flexShrink: 0 }}>
            {statusLabels[item.status]}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.subtitle || item.genre || ''}
        </p>
      </div>
    </button>
  )
}
