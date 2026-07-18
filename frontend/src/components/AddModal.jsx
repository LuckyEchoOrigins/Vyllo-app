import { useState, useRef, useEffect } from 'react'
import { haptic } from '../feedback'
import { searchMedia, addItem } from '../api'
import { CAT_COLOR, formatRuntime, formatMinutes, isPremium, openPremium } from '../utils'
import CoverImage from './CoverImage'
import BookCoverPicker from './BookCoverPicker'
import ManualCoverPicker from './ManualCoverPicker'
import PlatformIcon from './PlatformIcon'
import CategoryIcon from './CategoryIcon'
import Icon from './Icon'
import { useLang } from '../i18n'

const CATS = [
  { id: 'book', labelKey: 'add.book_label', emoji: '📖' },
  { id: 'game', labelKey: 'add.game_label', emoji: '🎮' },
  { id: 'film', labelKey: 'add.film_label', emoji: '🎬' },
]

const BOOK_TYPE_DEFS = [
  { id: 'book',      icon: 'book',        labelKey: 'add.book_type' },
  { id: 'ebook',     icon: 'smartphone',  labelKey: 'add.ebook_type' },
  { id: 'audiobook', icon: 'headphones',  labelKey: 'add.audiobook_type' },
]

const GAME_PLATFORMS = [
  { id: 'steam',       label: 'Steam' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox',        label: 'Xbox' },
  { id: 'nintendo',    label: 'Nintendo' },
]

const SEARCH_LIMIT  = 20
const LIBRARY_LIMIT = 100

function getSearchKey()    { return `sc_${new Date().toISOString().slice(0, 7)}` }
function getSearchCount()  { return parseInt(localStorage.getItem(getSearchKey()) || '0') }
function incrementSearch() { localStorage.setItem(getSearchKey(), String(getSearchCount() + 1)) }

export default function AddModal({ onClose, onAdd, enabledCats = ['book', 'game', 'film'], itemCount = 0 }) {
  const { t, lang } = useLang()
  const visibleCats = CATS.filter(c => enabledCats.includes(c.id))
  const BOOK_TYPES = BOOK_TYPE_DEFS.map(b => ({ ...b, label: t(b.labelKey) }))
  const [step, setStep]         = useState(1)
  const [cat, setCat]           = useState(visibleCats[0]?.id || 'book')
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [searchFocus, setSearchFocus] = useState(false)
  const inputRef = useRef()

  // Book type
  const [bookType, setBookType]   = useState('book')
  const [audioDurH, setAudioDurH] = useState(0)
  const [audioDurM, setAudioDurM] = useState(0)
  const [customCover, setCustomCover] = useState(null)
  // Game platform
  const [gamePlatform, setGamePlatform] = useState('steam')
  const [showCoverPicker, setShowCoverPicker]   = useState(false)
  const [showManualCover, setShowManualCover]   = useState(false)
  const [pages, setPages] = useState('')

  // Manual add
  const [manualMode, setManualMode]           = useState(false)
  const [manualTitle, setManualTitle]         = useState('')
  const [manualSubtitle, setManualSubtitle]   = useState('')
  const [manualYear, setManualYear]           = useState('')
  const [manualGenre, setManualGenre]         = useState('')
  const [manualIsSeries, setManualIsSeries]   = useState(false)
  const [manualSeasons, setManualSeasons]     = useState('')
  const [manualEpisodes, setManualEpisodes]   = useState('')

  // Levanta a sheet acima do teclado no iOS (o WKWebView não redimensiona sozinho)
  const [kb, setKb] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    onResize()
    return () => { vv.removeEventListener('resize', onResize); vv.removeEventListener('scroll', onResize) }
  }, [])

  // Trava o arrasto no passo de pesquisa (o conteúdo cabe todo, não precisa de
  // scroll). O touch-action/overflow não chegam: o iOS arrasta o viewport com o
  // teclado aberto. Cancelar o touchmove (listener não-passivo) trava mesmo.
  const overlayRef = useRef(null)
  const contentRef = useRef(null)
  const lockDrag = step === 1 && !manualMode
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const onTouchMove = (e) => {
      // Passo de pesquisa: cabe tudo → bloqueia sempre o arrasto.
      // Outros passos (manual/resultados): deixa passar o scroll legítimo dentro
      // do conteúdo, mas bloqueia o arrasto do viewport em tudo o resto.
      if (!lockDrag) {
        const sc = contentRef.current
        if (sc && sc.contains(e.target) && sc.scrollHeight > sc.clientHeight) return
      }
      e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [lockDrag])

  const resetManual = () => {
    setManualTitle(''); setManualSubtitle(''); setManualYear('')
    setManualGenre(''); setManualIsSeries(false)
    setManualSeasons(''); setManualEpisodes('')
    setCustomCover(null); setBookType('book')
    setAudioDurH(0); setAudioDurM(0); setPages('')
    setGamePlatform('steam')
  }

  const premium    = isPremium()
  const remaining  = premium ? Infinity : Math.max(0, SEARCH_LIMIT - getSearchCount())
  const limitHit   = !premium && remaining <= 0
  const libraryFull = !premium && itemCount >= LIBRARY_LIMIT

  const color = CAT_COLOR[cat]

  const doSearch = async () => {
    if (!query.trim()) return
    if (limitHit) { setManualMode(true); return }
    setLoading(true); setError(''); setResults([]); setStep(2)
    try {
      const data = await searchMedia(query.trim(), cat, lang)
      incrementSearch()
      setResults(data)
    } catch {
      setError(t('add.search_error'))
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (item) => {
    setSelected(item)
    setPages(item.totalPages ? String(item.totalPages) : '')
    setStep(3)
  }

  const handleManualContinue = () => {
    if (!manualTitle.trim()) return
    const isSeries = cat === 'film' ? manualIsSeries : false
    setSelected({
      title: manualTitle.trim(),
      subtitle: manualSubtitle.trim(),
      year: manualYear ? parseInt(manualYear) : null,
      genre: manualGenre.trim() || null,
      synopsis: null,
      cover: customCover || null,
      isSeries,
      totalSeasons: isSeries && manualSeasons ? parseInt(manualSeasons) : null,
      totalEps: isSeries && manualEpisodes ? parseInt(manualEpisodes) : null,
      runtime: null,
      steam_app_id: null,
    })
    setStep(3)
  }

  const handleConfirm = async () => {
    if (!selected) return
    if (libraryFull) { openPremium('library'); return }
    setLoading(true)
    try {
      const item = await addItem({
        title: selected.title,
        subtitle: selected.subtitle || '',
        category: cat,
        cover: customCover || selected.cover || '',
        author: selected.author || '',
        platform: selected.platform || '',
        genre: selected.genre || '',
        synopsis: selected.synopsis || '',
        year: selected.year || null,
        is_series: cat === 'film' ? (selected.isSeries || false) : false,
        total_pages: (cat === 'book' && bookType !== 'audiobook') ? (parseInt(pages, 10) || null) : null,
        total_episodes: selected.isSeries ? (selected.totalEps || null) : null,
        total_seasons: selected.isSeries ? (selected.totalSeasons || null) : null,
        episodes_per_season: selected.isSeries ? (selected.episodesPerSeason || null) : null,
        runtime: (cat === 'film' && !selected.isSeries) ? (selected.runtime || null) : null,
        steam_app_id: (cat === 'game' && gamePlatform === 'steam') ? (selected.steam_app_id || null) : null,
        book_type: cat === 'book' ? bookType : null,
        audio_duration_minutes: (cat === 'book' && bookType === 'audiobook') ? (audioDurH * 60 + audioDurM) || null : null,
        game_platform: cat === 'game' ? gamePlatform : null,
      })
      haptic([10, 60, 12])
      onAdd(item)
    } catch {
      setError(t('add.save_error'))
    } finally {
      setLoading(false)
    }
  }

  const subtitleLabel = cat === 'book' ? t('add.author_placeholder') : cat === 'game' ? t('add.developer_placeholder') : t('add.studio_placeholder')

  return (
    <div ref={overlayRef} className="overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{
      paddingBottom: kb,
      transition: 'padding-bottom 0.18s ease',
      // No passo de pesquisa o conteúdo cabe todo: bloqueia o gesto de arrasto
      // (o iOS arrasta o viewport com o teclado aberto, e isso o overflow não trava)
      touchAction: (step === 1 && !manualMode) ? 'none' : 'auto',
      overscrollBehavior: 'contain',
    }}>
      <div className="bottom-sheet" style={{ maxHeight: '90vh', overflowY: (step === 1 && !manualMode) ? 'hidden' : 'auto' }}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(step > 1 || manualMode) && (
              <button
                onClick={() => { if (manualMode) { setManualMode(false); setCustomCover(null) } else { setStep(s => s - 1) } }}
                style={{ background: 'none', padding: 4, marginRight: 4 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>
            )}
            <h2 style={{ fontSize: 18 }}>
              {manualMode ? t('add.add_manually') : step === 1 ? t('add.title') : step === 2 ? t('add.choose_result') : t('add.confirm_addition')}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', borderRadius: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: (manualMode ? (s !== 2) : step >= s) ? color : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        <div ref={contentRef} style={{ padding: '4px 20px 24px', overflowY: (step === 1 && !manualMode) ? 'hidden' : 'auto' }}>

          {/* ── Step 1: Search or Manual ── */}
          {step === 1 && !manualMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>{t('add.select_category')}</p>

              {/* Library full warning */}
              {libraryFull && (
                <div style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#FF4757' }}>{t('add.library_full', { limit: LIBRARY_LIMIT })}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                    {t('add.library_full_desc', { limit: LIBRARY_LIMIT })}
                  </p>
                  <button onClick={() => openPremium('library')}
                    style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'white', background: color, borderRadius: 8, padding: '7px 18px', fontFamily: 'Nunito' }}>
                    {t('add.upgrade')}
                  </button>
                </div>
              )}

              {/* Category pills */}
              <div style={{ display: 'flex', gap: 8 }}>
                {visibleCats.map(c => (
                  <button key={c.id} onClick={() => setCat(c.id)} style={{
                    flex: 1, padding: '10px 6px', borderRadius: 14,
                    border: `1.5px solid ${cat === c.id ? CAT_COLOR[c.id] : 'var(--border)'}`,
                    background: 'var(--surface)',
                    boxShadow: cat === c.id ? `0 0 8px ${CAT_COLOR[c.id]}99` : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ color: cat === c.id ? CAT_COLOR[c.id] : '#8E8EA0', display: 'flex' }}>
                      <CategoryIcon cat={c.id} size={22} strokeWidth={2} />
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cat === c.id ? CAT_COLOR[c.id] : '#8E8EA0', fontFamily: 'Nunito' }}>
                      {t(c.labelKey)}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setSearchFocus(false)}
                  placeholder={cat === 'book' ? t('add.search_book') : cat === 'game' ? t('add.search_game') : t('add.search_film')}
                  disabled={limitHit}
                  style={{ paddingRight: 48, borderColor: searchFocus ? color : 'var(--border)', boxShadow: searchFocus ? `0 0 8px ${color}99` : 'none', opacity: limitHit ? 0.5 : 1 }}
                />
                <button onClick={doSearch} disabled={limitHit} style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: limitHit ? 'var(--border)' : color, borderRadius: 10, width: 32, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </button>
              </div>

              {/* Search limit warning */}
              {!premium && remaining <= 5 && remaining > 0 && (
                <p style={{ fontSize: 12, color: '#F5A623', textAlign: 'center', fontWeight: 600 }}>
                  {t('add.searches_remaining', { n: remaining, suffix: remaining !== 1 ? t('add.search_plural') : t('add.search_singular'), s: remaining !== 1 ? 's' : '' })}
                </p>
              )}
              {limitHit && (
                <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#FF4757', marginBottom: 4 }}>{t('add.limit_reached', { n: SEARCH_LIMIT })}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('add.limit_desc')}
                  </p>
                  <button onClick={() => openPremium('search')}
                    style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'white', background: color, borderRadius: 8, padding: '7px 16px', fontFamily: 'Nunito' }}>
                    {t('add.upgrade')}
                  </button>
                </div>
              )}

              {error && <p style={{ color: '#FF4757', fontSize: 13, textAlign: 'center' }}>{error}</p>}

              <button
                className="btn-primary"
                onClick={doSearch}
                disabled={loading || !query.trim() || limitHit}
                style={{ background: (loading || !query.trim() || limitHit) ? 'var(--border)' : color, color: (loading || !query.trim() || limitHit) ? '#8E8EA0' : 'white', boxShadow: (loading || !query.trim() || limitHit) ? 'none' : `0 4px 18px ${color}80` }}
              >
                {loading ? t('add.searching') : t('add.search_btn')}
              </button>

              <button onClick={() => { resetManual(); setManualMode(true) }}
                style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', background: 'none', fontFamily: 'Nunito', padding: '4px 0' }}>
                {t('add.or_manually')}
              </button>
            </div>
          )}

          {/* ── Step 1: Manual form ── */}
          {step === 1 && manualMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Category pills */}
              <div style={{ display: 'flex', gap: 8 }}>
                {visibleCats.map(c => (
                  <button key={c.id} onClick={() => { setCat(c.id); setCustomCover(null) }} style={{
                    flex: 1, padding: '10px 6px', borderRadius: 14,
                    border: `1.5px solid ${cat === c.id ? CAT_COLOR[c.id] : 'var(--border)'}`,
                    background: 'var(--surface)',
                    boxShadow: cat === c.id ? `0 0 8px ${CAT_COLOR[c.id]}99` : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ color: cat === c.id ? CAT_COLOR[c.id] : '#8E8EA0', display: 'flex' }}>
                      <CategoryIcon cat={c.id} size={22} strokeWidth={2} />
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cat === c.id ? CAT_COLOR[c.id] : '#8E8EA0', fontFamily: 'Nunito' }}>
                      {t(c.labelKey)}
                    </span>
                  </button>
                ))}
              </div>

              {/* Capa + Título (lado a lado) */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <button
                  onClick={() => cat === 'book' ? setShowCoverPicker(true) : setShowManualCover(true)}
                  style={{
                    flexShrink: 0, width: 72, height: 96, borderRadius: 10,
                    border: `2px dashed ${customCover ? color : 'var(--border)'}`,
                    background: 'var(--surface-2)', overflow: 'hidden', padding: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    transition: 'border-color 0.2s',
                  }}
                >
                  {customCover ? (
                    <img src={customCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'Nunito' }}>COVER</span>
                    </>
                  )}
                </button>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    value={manualTitle}
                    onChange={e => setManualTitle(e.target.value)}
                    placeholder={cat === 'book' ? t('add.book_title') : cat === 'game' ? t('add.game_name') : t('add.film_title')}
                    style={{ borderColor: manualTitle ? color : 'var(--border)', boxShadow: manualTitle ? `0 0 6px ${color}55` : 'none' }}
                  />
                  <input
                    value={manualSubtitle}
                    onChange={e => setManualSubtitle(e.target.value)}
                    placeholder={cat === 'book' ? t('add.author_placeholder') : cat === 'game' ? t('add.developer_placeholder') : t('add.studio_placeholder')}
                  />
                </div>
              </div>

              {/* Capa pickers inline */}
              {showCoverPicker && cat === 'book' && (
                <BookCoverPicker
                  initialTitle={manualTitle} initialAuthor={manualSubtitle}
                  currentCover={customCover || ''}
                  onSelectUrl={url => { setCustomCover(url); setShowCoverPicker(false) }}
                  onClose={() => setShowCoverPicker(false)}
                />
              )}
              {showManualCover && cat !== 'book' && (
                <ManualCoverPicker
                  category={cat} initialCover={customCover || ''}
                  onSelectUrl={url => { setCustomCover(url); setShowManualCover(false) }}
                  onClose={() => setShowManualCover(false)}
                />
              )}

              {/* Ano + Género */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>{t('add.year_label')}</p>
                  <input type="number" inputMode="numeric" value={manualYear}
                    onChange={e => setManualYear(e.target.value)}
                    placeholder={String(new Date().getFullYear())}
                    min="1800" max={new Date().getFullYear() + 5}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>{t('add.genre_label')}</p>
                  <input value={manualGenre} onChange={e => setManualGenre(e.target.value)}
                    placeholder={cat === 'book' ? t('add.genre_book') : cat === 'game' ? t('add.genre_game') : t('add.genre_film')} />
                </div>
              </div>

              {/* ── Campos específicos por categoria ── */}

              {/* LIVRO: tipo + páginas / duração */}
              {cat === 'book' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('add.reading_type')}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {BOOK_TYPES.map(bt => (
                      <button key={bt.id} onClick={() => setBookType(bt.id)} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 10,
                        border: `2px solid ${bookType === bt.id ? color : 'var(--border)'}`,
                        background: bookType === bt.id ? color + '18' : 'var(--surface)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                      }}>
                        <span style={{ color: bookType === bt.id ? color : 'var(--text-muted)', display: 'flex' }}><Icon name={bt.icon} size={20} strokeWidth={2} /></span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: bookType === bt.id ? color : 'var(--text-muted)', fontFamily: 'Nunito' }}>{bt.label}</span>
                      </button>
                    ))}
                  </div>
                  {bookType !== 'audiobook' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)', display: 'flex' }}><Icon name="file" size={18} strokeWidth={2} /></span>
                      <input type="number" min="1" inputMode="numeric" value={pages}
                        onChange={e => setPages(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder={t('add.num_pages')}
                        style={{ flex: 1, borderColor: pages ? color : 'var(--border)' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" min="0" max="99" value={audioDurH}
                        onChange={e => setAudioDurH(Math.max(0, parseInt(e.target.value) || 0))}
                        style={{ flex: 1, textAlign: 'center', fontWeight: 700 }} placeholder="0" />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>h</span>
                      <input type="number" min="0" max="59" value={audioDurM}
                        onChange={e => setAudioDurM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                        style={{ flex: 1, textAlign: 'center', fontWeight: 700 }} placeholder="0" />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>min</span>
                    </div>
                  )}
                </div>
              )}

              {/* JOGO: plataforma */}
              {cat === 'game' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('add.platform')}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {GAME_PLATFORMS.map(p => (
                      <button key={p.id} onClick={() => setGamePlatform(p.id)} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 10,
                        border: `2px solid ${gamePlatform === p.id ? color : 'var(--border)'}`,
                        background: gamePlatform === p.id ? color + '18' : 'var(--surface)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                      }}>
                        <PlatformIcon platform={p.id} size={20} color={gamePlatform === p.id ? color : 'var(--text-muted)'} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: gamePlatform === p.id ? color : 'var(--text-muted)', fontFamily: 'Nunito' }}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* FILME/SÉRIE: tipo + temporadas/episódios */}
              {cat === 'film' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-2)', borderRadius: 12, padding: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{t('add.type_label')}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ id: false, labelKey: 'add.film_type', icon: 'film' }, { id: true, labelKey: 'add.series_type', icon: 'monitor' }].map(ft => (
                      <button key={String(ft.id)} onClick={() => setManualIsSeries(ft.id)} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 10,
                        border: `2px solid ${manualIsSeries === ft.id ? color : 'var(--border)'}`,
                        background: manualIsSeries === ft.id ? color + '18' : 'var(--surface)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                      }}>
                        <span style={{ color: manualIsSeries === ft.id ? color : 'var(--text-muted)', display: 'flex' }}><Icon name={ft.icon} size={22} strokeWidth={2} /></span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: manualIsSeries === ft.id ? color : 'var(--text-muted)', fontFamily: 'Nunito' }}>{t(ft.labelKey)}</span>
                      </button>
                    ))}
                  </div>
                  {manualIsSeries && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{t('add.seasons')}</p>
                        <input type="number" min="1" inputMode="numeric" value={manualSeasons}
                          onChange={e => setManualSeasons(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder={t('add.seasons_placeholder')} style={{ borderColor: manualSeasons ? color : 'var(--border)' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{t('add.total_episodes')}</p>
                        <input type="number" min="1" inputMode="numeric" value={manualEpisodes}
                          onChange={e => setManualEpisodes(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder={t('add.episodes_placeholder')} style={{ borderColor: manualEpisodes ? color : 'var(--border)' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleManualContinue}
                disabled={!manualTitle.trim()}
                style={{ background: !manualTitle.trim() ? 'var(--border)' : color, color: !manualTitle.trim() ? '#8E8EA0' : 'white', boxShadow: !manualTitle.trim() ? 'none' : `0 4px 18px ${color}80`, marginTop: 4 }}
              >
                {t('add.confirm_arrow')}
              </button>
            </div>
          )}

          {/* ── Step 2: Results ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading && results.length === 0 && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 4 }}>
                    {t('add.searching_for')} <strong style={{ color }}>{query}</strong>...
                  </p>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: 12,
                      border: '1.5px solid var(--border)',
                      animation: `pulse 1.4s ease-in-out ${i * 0.1}s infinite`,
                    }}>
                      <div style={{ width: 62, height: 62, borderRadius: 8, background: 'var(--surface-2)', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ height: 14, background: 'var(--surface-2)', borderRadius: 6, width: '70%' }} />
                        <div style={{ height: 11, background: 'var(--surface-2)', borderRadius: 6, width: '45%' }} />
                        <div style={{ height: 11, background: 'var(--surface-2)', borderRadius: 6, width: '30%' }} />
                      </div>
                    </div>
                  ))}
                  <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
                </>
              )}
              {!loading && results.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ fontSize: 32 }}>🔍</p>
                  <p style={{ marginTop: 8 }}>{t('add.no_results')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    <button onClick={() => setStep(1)} style={{ background: color, color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito' }}>
                      {t('add.new_search')}
                    </button>
                    <button onClick={() => { resetManual(); setStep(1); setManualMode(true) }}
                      style={{ background: 'none', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'Nunito' }}>
                      {t('add.or_manually')}
                    </button>
                  </div>
                </div>
              )}
              {results.map((item, i) => (
                <button key={i} onClick={() => handleSelect(item)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: 12,
                  border: '1.5px solid var(--border)', textAlign: 'left',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s',
                  animation: `slideIn 0.2s ease ${i * 0.05}s both`,
                }}>
                  <CoverImage src={item.cover} category={cat} size={44} radius={8} isMovie={cat === 'film' && !item.isSeries} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subtitle}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                      {item.year && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.year}</span>}
                      {item.genre && <span style={{ fontSize: 11, background: color + '22', color, padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{item.genre}</span>}
                      {cat === 'film' && item.isSeries && <span style={{ fontSize: 11, background: 'rgba(245,166,35,0.16)', color: '#F5A623', padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{t('add.series_badge')}</span>}
                    </div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DADAE8" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Preview card */}
              <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                <div style={{ background: `linear-gradient(135deg, ${color}22, ${color}11)`, padding: 20, display: 'flex', gap: 16 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <CoverImage src={customCover || selected.cover} category={cat} size={70} radius={12} isMovie={cat === 'film' && !selected.isSeries} />
                    {(cat === 'book' || cat === 'film') && (
                      <button
                        onClick={() => cat === 'book' ? setShowCoverPicker(true) : setShowManualCover(true)}
                        style={{
                          position: 'absolute', bottom: -6, right: -6,
                          background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: '50%',
                          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', border: `2px solid ${color}`,
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 16, lineHeight: 1.3 }}>{selected.title}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{selected.subtitle}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {selected.year && <span style={{ fontSize: 11, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>{selected.year}</span>}
                      {selected.genre && <span style={{ fontSize: 11, background: color + '22', color, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>{selected.genre}</span>}
                      {cat === 'film' && selected.isSeries && <span style={{ fontSize: 11, background: 'var(--orange-light)', color: '#F5A623', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>{t('add.series_badge')}</span>}
                      {cat === 'game' && selected.steam_app_id && (
                        <span style={{ fontSize: 11, background: '#171A21', color: '#C7D5E0', padding: '3px 8px', borderRadius: 6, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="#C7D5E0"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/></svg>
                          {selected.steam_app_id}
                        </span>
                      )}
                      {cat === 'game' && !selected.steam_app_id && (
                        <span style={{ fontSize: 11, background: 'var(--surface-2)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>{t('add.no_steam_id')}</span>
                      )}
                    </div>
                  </div>
                </div>
                {selected.synopsis && (
                  <div style={{ padding: '12px 20px 16px' }}>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>{selected.synopsis}</p>
                  </div>
                )}
                {(selected.totalPages || (selected.isSeries && (selected.totalEps || selected.totalSeasons)) || (!selected.isSeries && selected.runtime)) && (
                  <div style={{ padding: '0 20px 16px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {selected.totalPages && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color }}>{selected.totalPages}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('add.pages_label')}</p>
                      </div>
                    )}
                    {selected.isSeries && selected.totalSeasons && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color }}>{selected.totalSeasons}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{selected.totalSeasons === 1 ? t('add.season_singular') : t('add.season_plural')}</p>
                      </div>
                    )}
                    {selected.isSeries && selected.totalEps && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color }}>{selected.totalEps}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('add.episode_plural')}</p>
                      </div>
                    )}
                    {!selected.isSeries && selected.runtime && (
                      <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color }}>⏱ {formatRuntime(selected.runtime)}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('add.duration_label')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showCoverPicker && (
                <BookCoverPicker
                  initialTitle={selected.title} initialAuthor={selected.author}
                  currentCover={customCover || selected.cover}
                  onSelectUrl={(url) => setCustomCover(url)}
                  onClose={() => setShowCoverPicker(false)}
                />
              )}
              {showManualCover && (
                <ManualCoverPicker
                  category="film" initialCover={customCover || ''}
                  onSelectUrl={(url) => setCustomCover(url)}
                  onClose={() => setShowManualCover(false)}
                />
              )}

              {/* Plataforma (jogos) */}
              {cat === 'game' && (
                <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{t('add.platform')}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {GAME_PLATFORMS.map(p => (
                      <button key={p.id} onClick={() => setGamePlatform(p.id)} style={{
                        flex: 1, padding: '10px 4px', borderRadius: 12,
                        border: `2px solid ${gamePlatform === p.id ? color : 'var(--border)'}`,
                        background: 'var(--surface-2)',
                        boxShadow: gamePlatform === p.id ? `0 0 8px ${color}99` : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all 0.15s',
                        transform: gamePlatform === p.id ? 'scale(1.04)' : 'scale(1)',
                      }}>
                        <PlatformIcon platform={p.id} size={22} color={gamePlatform === p.id ? color : 'var(--text-muted)'} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: gamePlatform === p.id ? color : 'var(--text-muted)', fontFamily: 'Nunito' }}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: gamePlatform === 'steam' ? 'rgba(45,184,122,0.14)' : 'var(--surface-2)', border: gamePlatform === 'steam' ? '1px solid rgba(45,184,122,0.28)' : '1px solid var(--border)', borderRadius: 10 }}>
                    <span style={{ color: gamePlatform === 'steam' ? '#2DB87A' : 'var(--text-muted)', display: 'inline-flex' }}><Icon name="trophy" size={14} strokeWidth={2.4} /></span>
                    <p style={{ fontSize: 11, color: gamePlatform === 'steam' ? '#2DB87A' : 'var(--text-muted)', fontWeight: 700 }}>
                      {gamePlatform === 'steam' ? t('add.steam_achievements') : t('add.steam_achievements_other')}
                    </p>
                  </div>
                </div>
              )}

              {/* Tipo de leitura (livros) */}
              {cat === 'book' && (
                <div style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{t('add.reading_type')}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {BOOK_TYPES.map(bt => (
                      <button key={bt.id} onClick={() => setBookType(bt.id)} style={{
                        flex: 1, padding: '10px 6px', borderRadius: 12,
                        border: `2px solid ${bookType === bt.id ? color : 'var(--border)'}`,
                        background: 'var(--surface-2)',
                        boxShadow: bookType === bt.id ? `0 0 8px ${color}99` : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        transition: 'all 0.15s',
                        transform: bookType === bt.id ? 'scale(1.04)' : 'scale(1)',
                      }}>
                        <span style={{ color: bookType === bt.id ? color : 'var(--text-muted)', display: 'flex' }}><Icon name={bt.icon} size={22} strokeWidth={2} /></span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: bookType === bt.id ? color : 'var(--text-muted)', fontFamily: 'Nunito' }}>{bt.label}</span>
                      </button>
                    ))}
                  </div>
                  {bookType !== 'audiobook' && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{t('add.num_pages')}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text-muted)', display: 'flex' }}><Icon name="file" size={18} strokeWidth={2} /></span>
                        <input type="number" min="1" inputMode="numeric" value={pages}
                          onChange={e => setPages(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="ex: 320"
                          style={{ flex: 1, fontSize: 15, fontWeight: 700, padding: '10px 12px', border: `1.5px solid ${pages ? color : 'var(--border)'}`, borderRadius: 10 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{t('add.pages_suffix')}</span>
                      </div>
                    </div>
                  )}
                  {bookType === 'audiobook' && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{t('add.total_duration')}</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>{t('add.hours_label')}</p>
                          <input type="number" min="0" max="99" value={audioDurH}
                            onChange={e => setAudioDurH(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, padding: '10px 4px' }} />
                        </div>
                        <p style={{ fontSize: 22, color: '#DADAE8', fontWeight: 700, paddingBottom: 10 }}>:</p>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>{t('add.minutes_label')}</p>
                          <input type="number" min="0" max="59" value={audioDurM}
                            onChange={e => setAudioDurM(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                            style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, padding: '10px 4px' }} />
                        </div>
                        <div style={{ flex: 1, paddingBottom: 4 }}>
                          <p style={{ fontSize: 15, fontWeight: 800, color, textAlign: 'center' }}>{formatMinutes(audioDurH * 60 + audioDurM)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && <p style={{ color: '#FF4757', fontSize: 13, textAlign: 'center' }}>{error}</p>}

              {/* Library limit warning no confirm */}
              {libraryFull && (
                <div style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#FF4757' }}>{t('add.library_full_upgrade')}</p>
                  <button onClick={() => openPremium('library')}
                    style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'white', background: color, borderRadius: 8, padding: '7px 16px', fontFamily: 'Nunito' }}>
                    {t('add.upgrade')}
                  </button>
                </div>
              )}

              <button className="btn-primary" onClick={handleConfirm} disabled={loading || libraryFull}
                style={{ background: (loading || libraryFull) ? 'var(--border)' : color, color: (loading || libraryFull) ? '#8E8EA0' : 'white', boxShadow: (loading || libraryFull) ? 'none' : `0 4px 18px ${color}80` }}>
                {loading ? t('add.saving') : t('add.confirm_btn')}
              </button>
              <button className="btn-ghost" onClick={() => manualMode ? setManualMode(true) : setStep(2)} style={{ textAlign: 'center', width: '100%' }}>
                {manualMode ? t('add.edit_details') : t('add.choose_another')}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
