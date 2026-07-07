import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import CoverImage from '../components/CoverImage'
import PlatinumBadge from '../components/PlatinumBadge'
import WishlistRandomizer from '../components/WishlistRandomizer'
import CategoryIcon from '../components/CategoryIcon'
import Icon from '../components/Icon'
import { CAT_COLOR, CAT_LIGHT, CAT_EMOJI, formatProgress, getProgress, hasAllAchievements, isPremium, requirePremium, getLists, deleteList } from '../utils'
import { confirmDialog, showToast } from '../feedback'
import { useLang } from '../i18n'

const ALL_COLOR = '#8E8EA0'

export default function Library({ items, onItemClick, initialCat = 'all', initialStatus = 'all', enabledCats = ['book', 'game', 'film'] }) {
  const { t } = useLang()

  const STATUSES = [
    { id: 'all', label: t('status.all') },
    { id: 'wishlist', label: t('library.waiting') },
    { id: 'in_progress', label: t('status.in_progress') },
    { id: 'completed', label: t('status.completed') },
    { id: 'abandoned', label: t('status.abandoned') },
  ]

  // Construído no render → lê as cores de categoria atuais (acompanham o tema)
  const CATS = [
    { id: 'all', label: t('cat.all'), color: ALL_COLOR },
    { id: 'book', label: t('cat.book'), color: CAT_COLOR.book },
    { id: 'game', label: t('cat.game'), color: CAT_COLOR.game },
    { id: 'film', label: t('cat.film_series'), color: CAT_COLOR.film },
  ]
  // Só mostra as abas das categorias ativas (esconde 'Todos' se só houver 1)
  const visibleCats = CATS.filter(c => c.id === 'all' ? enabledCats.length > 1 : enabledCats.includes(c.id))
  const [cat, setCat] = useState(initialCat)
  const [status, setStatus] = useState(initialStatus)
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [randomizing, setRandomizing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [subFilter, setSubFilter] = useState('all')      // tipo/plataforma (depende da categoria)
  const [genreFilter, setGenreFilter] = useState('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [trophyFilter, setTrophyFilter] = useState('all')  // 'all' | 'platinum'
  const [sort, setSort] = useState('recent')             // ordenação
  const [lists, setLists] = useState(() => getLists())
  const [activeList, setActiveList] = useState(null)
  const [showLists, setShowLists] = useState(false)
  const listsRef = useRef(null)
  useEffect(() => {
    if (!showLists) return
    const onDoc = (e) => { if (listsRef.current && !listsRef.current.contains(e.target)) setShowLists(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [showLists])

  const changeCat = (id) => { setCat(id); setSubFilter('all'); setGenreFilter('all') }
  const activeFilters = (subFilter !== 'all' ? 1 : 0) + (genreFilter !== 'all' ? 1 : 0) + (ratingFilter !== 'all' ? 1 : 0) + (trophyFilter !== 'all' ? 1 : 0)

  const filterRef = useRef(null)
  useEffect(() => {
    if (!showFilters) return
    const onDoc = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilters(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [showFilters])

  const searchRef = useRef(null)
  useEffect(() => {
    if (!showSearch) return
    const onDoc = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) { setShowSearch(false); setQuery('') } }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [showSearch])

  // Sub-filtro consoante a categoria principal
  const subGroup = cat === 'book'
    ? { label: t('library.filter_type'), options: [
        { id: 'all', l: t('status.all') },
        { id: 'book', l: <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>{t('library.book_type')}</> },
        { id: 'ebook', l: <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>{t('library.ebook_type')}</> },
        { id: 'audiobook', l: <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>{t('library.audiobook_type')}</> },
      ] }
    : cat === 'game'
    ? { label: t('library.filter_platform'), options: [{ id: 'all', l: t('status.all') }, { id: 'steam', l: 'Steam' }, { id: 'playstation', l: 'PlayStation' }, { id: 'xbox', l: 'Xbox' }, { id: 'nintendo', l: 'Nintendo' }] }
    : cat === 'film'
    ? { label: t('library.filter_type'), options: [{ id: 'all', l: t('status.all') }, { id: 'movie', l: `🎬 ${t('library.movie_type')}` }, { id: 'series', l: `📺 ${t('library.series_type')}` }] }
    : null

  // Géneros disponíveis na categoria atual
  const genres = [...new Set(items.filter(i => cat === 'all' || i.category === cat).map(i => i.genre).filter(Boolean))].sort()

  const rollDice = () => {
    if (rolling) return
    if (!requirePremium('randomizer')) return
    setRolling(true)
    setTimeout(() => { setRolling(false); setRandomizing(true) }, 520)
  }

  const catColor = CATS.find(c => c.id === cat)?.color || ALL_COLOR
  const catActiveBg = catColor

  const activeListObj = activeList ? lists.find(l => l.id === activeList) : null
  const listItemIds = activeListObj ? new Set(activeListObj.itemIds) : null

  const q = query.trim().toLowerCase()
  const filtered = items.filter(i => {
    if (listItemIds && !listItemIds.has(i.id)) return false
    const catOk = cat === 'all' || i.category === cat
    // "Em espera" inclui itens sem estado definido (wishlist ou vazio)
    const statusOk = status === 'all'
      ? true
      : status === 'wishlist'
        ? (!i.status || i.status === 'wishlist')
        : i.status === status
    const searchOk = !q ||
      (i.title && i.title.toLowerCase().includes(q)) ||
      (i.subtitle && i.subtitle.toLowerCase().includes(q)) ||
      (i.author && i.author.toLowerCase().includes(q))
    const subOk = subFilter === 'all' || (
      cat === 'book' ? (i.book_type || 'book') === subFilter
      : cat === 'game' ? (i.game_platform || 'steam') === subFilter
      : cat === 'film' ? (subFilter === 'series' ? !!i.is_series : !i.is_series)
      : true
    )
    const genreOk = genreFilter === 'all' || i.genre === genreFilter
    const ratingOk = ratingFilter === 'all' || (i.rating || 0) >= parseInt(ratingFilter)
    const trophyOk = trophyFilter === 'all' || (i.category === 'game' && hasAllAchievements(i))
    return catOk && statusOk && searchOk && subOk && genreOk && ratingOk && trophyOk
  })

  // Ordenação
  const SORTERS = {
    recent:   (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    oldest:   (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
    name:     (a, b) => (a.title || '').localeCompare(b.title || '', 'pt', { sensitivity: 'base' }),
    rating:   (a, b) => (b.rating || 0) - (a.rating || 0),
    hours:    (a, b) => (b.hours_played || 0) - (a.hours_played || 0),
    trophies: (a, b) => (b.ach_unlocked || 0) - (a.ach_unlocked || 0),
  }
  const sorted = [...filtered].sort(SORTERS[sort] || SORTERS.recent)

  return (
    <div className="screen" style={{ animation: 'screenEnter 0.3s ease both' }}>
      <div className="screen-content">
        {/* Header */}
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 20px) 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>{t('library.title')}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{t('library.items_in_collection', { n: items.length })}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {/* Listas + popover */}
            <div ref={listsRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setLists(getLists()); setShowLists(s => !s) }}
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (showLists || activeList) ? 'var(--purple-light)' : 'var(--surface-2)',
                  border: '1.5px solid var(--border)', cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={(showLists || activeList) ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
              {showLists && (
                <div style={{
                  position: 'absolute', top: 46, right: 0, zIndex: 60, width: 230,
                  background: 'var(--surface)', borderRadius: 14, padding: 8,
                  boxShadow: '0 12px 34px rgba(0,0,0,0.28)', border: '1px solid var(--border)',
                  animation: 'fadeInScale 0.16s ease both', transformOrigin: 'top right',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 8px 6px' }}>{t('library.your_lists')}</p>
                  {lists.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 8px 10px', lineHeight: 1.5 }}>
                      {t('library.no_lists')}
                    </p>
                  ) : lists.map(l => {
                    const on = activeList === l.id
                    return (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => { setActiveList(on ? null : l.id); setShowLists(false) }}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 8px', borderRadius: 9, background: on ? 'var(--purple-light)' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{l.itemIds.length}</span>
                        </button>
                        <button onClick={async () => { if (await confirmDialog({ title: t('library.delete_list_title'), message: t('library.delete_list_message', { name: l.name }), confirmLabel: t('library.delete_list_confirm'), danger: true })) { deleteList(l.id); setLists(getLists()); if (activeList === l.id) setActiveList(null); showToast(t('library.list_deleted'), 'success') } }}
                          style={{ background: 'none', padding: 6, display: 'flex', flexShrink: 0, cursor: 'pointer' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF4757" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Filtro + popover */}
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFilters(s => !s)}
                style={{
                  position: 'relative', width: 38, height: 38, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (showFilters || activeFilters) ? 'var(--purple-light)' : 'var(--surface-2)',
                  border: '1.5px solid var(--border)', cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={(showFilters || activeFilters) ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                {activeFilters > 0 && (
                  <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilters}</span>
                )}
              </button>

              {showFilters && (
                <div style={{
                  position: 'absolute', top: 46, right: 0, zIndex: 60, width: 210,
                  background: 'var(--surface)', borderRadius: 14, padding: 14,
                  boxShadow: '0 12px 34px rgba(0,0,0,0.28)', border: '1px solid var(--border)',
                  animation: 'fadeInScale 0.16s ease both', transformOrigin: 'top right',
                }}>
                  <FilterGroup
                    label={t('library.sort_by')}
                    options={[
                      { id: 'recent', l: t('library.sort_recent') },
                      { id: 'oldest', l: t('library.sort_oldest') },
                      { id: 'name', l: t('library.sort_name') },
                      { id: 'rating', l: t('library.sort_rating') },
                      ...(cat === 'all' || cat === 'game' ? [{ id: 'hours', l: t('library.sort_hours') }, { id: 'trophies', l: t('library.sort_trophies') }] : []),
                    ]}
                    value={sort} onChange={setSort} color={catColor}
                  />
                  {subGroup && (
                    <FilterGroup label={subGroup.label} options={subGroup.options} value={subFilter} onChange={setSubFilter} color={catColor} />
                  )}
                  <FilterGroup
                    label={t('library.filter_rating')}
                    options={[{ id: 'all', l: t('status.all') }, { id: '5', l: '★5' }, { id: '4', l: '★4+' }, { id: '3', l: '★3+' }]}
                    value={ratingFilter} onChange={setRatingFilter} color={catColor}
                  />
                  {(cat === 'all' || cat === 'game') && (
                    <FilterGroup
                      label={t('library.sort_trophies')}
                      options={[{ id: 'all', l: t('status.all') }, { id: 'platinum', l: t('library.filter_100') }]}
                      value={trophyFilter} onChange={setTrophyFilter} color={catColor}
                    />
                  )}
                  {(activeFilters > 0 || sort !== 'recent') && (
                    <button onClick={() => { setSubFilter('all'); setGenreFilter('all'); setRatingFilter('all'); setTrophyFilter('all'); setSort('recent') }}
                      style={{ width: '100%', padding: '6px 0 2px', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer' }}>
                      {t('library.filter_clear')}
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Lupa + popover de pesquisa */}
            <div ref={searchRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowSearch(s => !s); if (showSearch) setQuery('') }}
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: showSearch ? 'var(--purple-light)' : 'var(--surface-2)',
                  border: '1.5px solid var(--border)', cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={showSearch ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </button>

              {showSearch && (
                <div style={{
                  position: 'absolute', top: 46, right: 0, zIndex: 60, width: 230,
                  background: 'var(--surface)', borderRadius: 14, padding: 10,
                  boxShadow: '0 12px 34px rgba(0,0,0,0.28)', border: '1px solid var(--border)',
                  animation: 'fadeInScale 0.16s ease both', transformOrigin: 'top right',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px',
                    border: '1.5px solid var(--border)',
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder={t('library.search_placeholder')}
                      autoFocus
                      style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: 0, fontSize: 14, color: 'var(--text)' }}
                    />
                    {query && (
                      <button onClick={() => setQuery('')} style={{ background: 'none', padding: 0, display: 'flex', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Banner da lista ativa */}
        {activeListObj && (
          <div style={{ margin: '0 20px 8px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--purple-light)', borderRadius: 12, padding: '8px 12px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{t('library.list_label', { name: activeListObj.name })}</span>
            <button onClick={() => setActiveList(null)} style={{ background: 'none', padding: 2, display: 'flex', cursor: 'pointer' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 20px', overflowX: 'auto', marginBottom: 4 }}>
          {visibleCats.map(c => {
            const on = cat === c.id
            return (
              <button
                key={c.id}
                onClick={() => changeCat(c.id)}
                className="chip"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  ...(on ? { borderColor: c.color, color: c.color, boxShadow: `0 0 8px ${c.color}99` } : {}),
                }}
              >
                <CategoryIcon cat={c.id} size={15} strokeWidth={2.2} />
                {c.label}
              </button>
            )
          })}
        </div>

        {/* Status filter — deslizável na horizontal */}
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, padding: '8px 20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 8 }}>
          {STATUSES.map(s => {
            const on = status === s.id
            return (
            <button
              key={s.id}
              onClick={() => setStatus(s.id)}
              style={{
                flexShrink: 0,
                padding: '5px 12px',
                borderRadius: 20,
                border: `1.5px solid ${on ? catColor : 'var(--border)'}`,
                background: 'var(--surface)',
                color: on ? catColor : 'var(--text-muted)',
                boxShadow: on ? `0 0 8px ${catColor}99` : 'none',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'Nunito',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label}
            </button>
            )
          })}
        </div>

        {/* Items list */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '52px 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 14px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
              </div>
              <h3 style={{ color: 'var(--text)', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                {q || activeList || activeFilters > 0 ? t('library.empty_matches') : t('library.empty_yet')}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, maxWidth: 240, margin: '0 auto' }}>
                {q ? t('library.empty_search') : activeList ? t('library.empty_list') : activeFilters > 0 ? t('library.empty_filters') : t('library.empty_add')}
              </p>
            </div>
          ) : (
            sorted.map((item, i) => (
              <div key={item.id} style={i < 8 ? { animation: 'fadeInUp 0.25s ease both', willChange: 'transform, opacity' } : undefined}>
                <LibraryItem item={item} onClick={() => onItemClick(item)} t={t} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Botão flutuante de sorteio — só na lista "Em espera" */}
      {status === 'wishlist' && filtered.length > 0 && typeof document !== 'undefined' && document.getElementById('root') && createPortal(
        <button
          onClick={rollDice}
          title={t('home.view_all')}
          style={{
            position: 'absolute', right: 16, bottom: 86, zIndex: 80,
            width: 42, height: 42, borderRadius: '50%', cursor: 'pointer', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            background: cat === 'all' ? 'linear-gradient(135deg,var(--brand-1),var(--brand-2),var(--brand-3))' : catColor,
            boxShadow: `0 5px 16px ${cat === 'all' ? CAT_COLOR.game : catColor}99, 0 2px 6px rgba(0,0,0,0.3)`,
            animation: 'popIn 0.35s cubic-bezier(.34,1.56,.64,1) both',
          }}
        >
          <span style={{ display: 'inline-flex', color: 'white', animation: rolling ? 'diceRoll 0.5s ease' : 'none' }}><Icon name="dice" size={20} strokeWidth={2} /></span>
          {!isPremium() && (
            <span style={{ position: 'absolute', top: -3, right: -3, width: 15, height: 15, borderRadius: '50%', background: 'var(--surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}><Icon name="lock" size={9} strokeWidth={2.4} /></span>
          )}
        </button>,
        document.getElementById('root')
      )}

      {randomizing && (
        <WishlistRandomizer
          items={filtered}
          color={cat === 'all' ? 'var(--accent)' : catColor}
          onClose={() => setRandomizing(false)}
          onPick={(it) => { setRandomizing(false); onItemClick(it) }}
        />
      )}
    </div>
  )
}

function FilterGroup({ label, options, value, onChange, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const on = value === o.id
          return (
            <button key={o.id} onClick={() => onChange(o.id)}
              style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'Nunito',
                border: `1.5px solid ${on ? color : 'var(--border)'}`,
                background: 'var(--surface-2)',
                color: on ? color : 'var(--text-muted)',
                boxShadow: on ? `0 0 8px ${color}99` : 'none',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              {o.l}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LibraryItem({ item, onClick, t }) {
  const catColor = CAT_COLOR[item.category] || '#6C47FF'
  const color = `var(--cat-${item.category})`
  // Itens concluídos não mostram barra/percentagem (estariam sempre a 100%)
  const showProgress = item.status !== 'wishlist' && item.status !== 'completed'
  const pct = getProgress(item)

  const statusLabel = {
    wishlist: item.category === 'book' ? t('home.want_to_read') : item.category === 'game' ? t('home.want_to_play') : t('home.want_to_watch'),
    in_progress: t('status.in_progress'),
    completed: t('status.completed'),
    abandoned: t('status.abandoned'),
  }
  const statusBg = {
    wishlist: 'var(--surface-2)',
    in_progress: 'var(--purple-light)',
    completed: 'var(--green-light)',
    abandoned: 'var(--red-light)',
  }
  const statusColor = {
    wishlist: '#8E8EA0',
    in_progress: 'var(--accent)',
    completed: '#2DB87A',
    abandoned: '#FF4757',
  }

  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '14px 14px 16px',
        boxShadow: `0 2px 8px rgba(0,0,0,0.05), 0 -2px 8px ${(color || catColor)}60`,
        textAlign: 'left', width: '100%',
        borderBottom: `3px solid ${color || catColor}`,
        transition: 'border-bottom 0.15s, all 0.15s',
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0, width: 50, height: 70, overflow: 'hidden' }}>
        <CoverImage src={item.cover} category={item.category} size={50} radius={10} isMovie={item.category === 'film' && !item.is_series} />
        {hasAllAchievements(item) && <PlatinumBadge size={20} style={{ top: -6, right: -6 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.subtitle || item.genre}
            </p>
          </div>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 8, background: statusBg[item.status], color: statusColor[item.status], fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
            {statusLabel[item.status]}
          </span>
        </div>

        {/* Progress info */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
              {formatProgress(item, t) || (item.genre || '')}
            </span>
            {showProgress && pct !== null && (
              <span style={{ fontSize: 11, color, fontWeight: 700 }}>{Math.round(pct)}%</span>
            )}
            {item.rating > 0 && item.status === 'completed' && (
              <span style={{ fontSize: 11, color: '#F5A623', fontWeight: 700 }}>{'★'.repeat(item.rating)}</span>
            )}
          </div>
          {showProgress && pct !== null && (
            <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
