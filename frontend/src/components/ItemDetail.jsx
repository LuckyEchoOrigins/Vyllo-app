import { useState, useCallback, useRef, useEffect } from 'react'
import ShareItem from './ShareItem'
import { updateItem, deleteItem, fetchNextEpisode, steamSearch, steamPlaytime, translateSynopsis, generateSynopsis } from '../api'
import { CAT_COLOR, CAT_LIGHT, CAT_LABEL, STATUS_LABEL, formatRuntime, formatMinutes, BOOK_TYPE_INFO, parseEpisodesPerSeason, getListsForItem, isPremium, openPremium } from '../utils'
import { useLang } from '../i18n'
import { haptic } from '../feedback'
import AddToListSheet from './AddToListSheet'
import CoverImage from './CoverImage'
import StarRating from './StarRating'
import SteamAchievements from './SteamAchievements'
import ManualAchievements from './ManualAchievements'
import BookCoverPicker from './BookCoverPicker'
import ManualCoverPicker from './ManualCoverPicker'
import PlatformIcon from './PlatformIcon'
import StatusIcon from './StatusIcon'
import CategoryIcon from './CategoryIcon'
import Icon from './Icon'

const STATUSES = ['wishlist', 'in_progress', 'completed', 'abandoned']

const GAME_PLATFORM_LABEL = {
  steam:       { label: 'Steam' },
  playstation: { label: 'PlayStation' },
  xbox:        { label: 'Xbox' },
  nintendo:    { label: 'Nintendo' },
}

const statusConfig = {
  wishlist:   { color: '#8E8EA0', bg: 'var(--surface-2)',    emoji: '📋' },
  in_progress:{ color: 'var(--accent)', bg: 'var(--purple-light)', emoji: '▶️' },
  completed:  { color: '#2DB87A', bg: 'var(--green-light)',  emoji: '✅' },
  abandoned:  { color: '#FF4757', bg: 'var(--red-light)',    emoji: '🚫' },
}

export default function ItemDetail({ item, onClose, onUpdate, onDelete, user }) {
  const { t, lang } = useLang()
  const [form, setForm] = useState({
    status:          item.status,
    current_page:    item.current_page    || 0,
    hours_played:    item.hours_played    || 0,
    current_season:  item.current_season  || 1,
    current_episode: item.current_episode || 1,
    rating:          item.rating          || 0,
    notes:           item.notes           || '',
    start_date:      item.start_date      || '',
    end_date:        item.end_date        || '',
  })
  const [saving, setSaving]           = useState(false)
  const [showDelete, setShowDelete]   = useState(false)
  const [showShare, setShowShare]     = useState(false)
  const [coverErr, setCoverErr]       = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [showManualCover, setShowManualCover] = useState(false)
  const [steamHours, setSteamHours]   = useState(null)   // horas reais da Steam
  const [steamHoursLoading, setSteamHoursLoading] = useState(false)
  const [scrollY, setScrollY]         = useState(0)      // colapso do cabeçalho
  const [showListSheet, setShowListSheet] = useState(false)
  const [listCount, setListCount]     = useState(() => getListsForItem(item.id).length)
  const [nextEp, setNextEp] = useState(null)   // próximo episódio (séries)
  const [synopsisText, setSynopsisText] = useState(item.synopsis || '')

  // Próximo episódio (apenas séries) — via TVmaze
  useEffect(() => {
    if (item.category !== 'film' || !item.is_series) return
    let alive = true
    fetchNextEpisode({ title: item.title })
      .then(d => { if (alive) setNextEp(d?.airDate ? d : null) })
      .catch(() => {})
    return () => { alive = false }
  }, [item.id, item.category, item.title, item.is_series])

  // Série concluída + novo episódio anunciado (além do progresso) → volta a "a ver"
  useEffect(() => {
    if (!nextEp || !nextEp.airDate || form.status !== 'completed') return
    const cs = form.current_season || 1, ce = form.current_episode || 1
    const beyond = nextEp.season > cs || (nextEp.season === cs && nextEp.number > ce)
    if (beyond) {
      setForm(f => ({ ...f, status: 'in_progress', end_date: '' }))
      save({ status: 'in_progress', end_date: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextEp])

  // Auto-gera sinopse para itens que não têm (em background, guarda na BD)
  useEffect(() => {
    if (synopsisText) return
    let alive = true
    generateSynopsis(item.title, item.category, lang)
      .then(res => {
        if (!alive || !res?.synopsis) return
        setSynopsisText(res.synopsis)
        updateItem(item.id, { synopsis: res.synopsis }).catch(() => {})
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  // Cabeçalho colapsável: capa grande → encolhe ao fazer scroll
  const COLLAPSE = 180
  const collapseT = Math.min(scrollY / COLLAPSE, 1)      // 0 (topo) → 1 (colapsado)
  const coverSize = Math.round(170 - collapseT * 80)     // 170 → 90

  const steamId = (typeof localStorage !== 'undefined' && localStorage.getItem(`steamId_${user?.id}`)) || ''
  // Jogo da plataforma Steam → horas vêm da Steam, NUNCA contador manual
  const isSteamGame = item.category === 'game'
    && (item.game_platform === 'steam' || !item.game_platform)
  // Sincronização automática de horas: SteamID + Premium (free usa contador manual)
  const canSyncHours = isSteamGame && !!steamId && isPremium()

  const color = CAT_COLOR[item.category]
  const light = CAT_LIGHT[item.category]

  const save = useCallback(async (overrides = {}) => {
    const data = { ...form, ...overrides }
    setSaving(true)
    try {
      const updated = await updateItem(item.id, data)
      onUpdate(updated)
      setForm(f => ({ ...f, ...overrides }))
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }, [form, item.id, onUpdate])

  const today = () => new Date().toISOString().slice(0, 10)

  // Busca as horas reais da Steam (jogos Steam com SteamID) e atualiza o item
  useEffect(() => {
    if (!canSyncHours) return
    let cancelled = false
    ;(async () => {
      setSteamHoursLoading(true)
      try {
        // Resolve o AppID (recupera-o se estiver em falta)
        let appid = item.steam_app_id
        if (!appid) {
          const sd = await steamSearch(item.title)
          appid = Array.isArray(sd) && sd[0]?.appid ? sd[0].appid : null
        }
        if (!appid || cancelled) return

        const d = await steamPlaytime(appid, steamId)
        if (cancelled || d.error) return
        const hours = d.hours || 0
        setSteamHours(hours)

        // Sincroniza horas + AppID + estado (≥1h → a jogar; concluído mantém-se manual)
        const overrides = {}
        if (appid !== item.steam_app_id) overrides.steam_app_id = appid
        if (hours !== form.hours_played) overrides.hours_played = hours
        if (form.status !== 'completed') {
          const newStatus = hours <= 0 ? 'wishlist' : 'in_progress'
          if (newStatus !== form.status) {
            overrides.status = newStatus
            if (newStatus === 'in_progress' && !form.start_date) overrides.start_date = today()
          }
        }
        if (Object.keys(overrides).length) {
          setForm(f => ({ ...f, ...overrides }))
          save(overrides)
        }
      } catch {} finally {
        if (!cancelled) setSteamHoursLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, canSyncHours])

  const handleStatusChange = (status) => {
    haptic(status === 'completed' ? [10, 60, 12] : 8)
    // Mantém o rating guardado mesmo ao mudar de estado (só é mostrado quando concluído)
    const newForm = { ...form, status }
    // Auto-preenche datas (livros e jogos) nas transições de estado
    if (item.category === 'book' || item.category === 'game') {
      if (status === 'in_progress' && !newForm.start_date) newForm.start_date = today()
      if (status === 'completed') {
        if (!newForm.start_date) newForm.start_date = today()
        if (!newForm.end_date)   newForm.end_date   = today()
      }
    }
    // Filmes/séries: "Visto em" / conclusão = hoje
    if (item.category === 'film') {
      if (item.is_series && status === 'in_progress' && !newForm.start_date) newForm.start_date = today()
      if (status === 'completed' && !newForm.end_date) newForm.end_date = today()
    }
    setForm(newForm)
    save(newForm)
  }

  // Aplica um estado automático + datas correspondentes ao objeto de overrides
  const applyAutoStatus = (overrides, newStatus) => {
    if (newStatus === form.status) return
    overrides.status = newStatus
    if (newStatus === 'in_progress' && !form.start_date) overrides.start_date = today()
    if (newStatus === 'completed') {
      if (!form.start_date) overrides.start_date = today()
      if (!form.end_date)   overrides.end_date   = today()
    }
  }

  // Livros: 0 págs → quero ler · ≥1 → a ler · última pág → concluído
  const commitBookPage = (page) => {
    haptic(6)
    const total = item.book_type === 'audiobook' ? item.audio_duration_minutes : item.total_pages
    const overrides = { current_page: page }
    let newStatus
    if (page <= 0) newStatus = 'wishlist'
    else if (total > 0 && page >= total) newStatus = 'completed'
    else newStatus = 'in_progress'
    applyAutoStatus(overrides, newStatus)
    setForm(f => ({ ...f, ...overrides }))
    save(overrides)
  }

  // Jogos: 0h → quero jogar · ≥1 → a jogar · "concluído" mantém-se manual
  const commitGameHours = (hours) => {
    haptic(6)
    const overrides = { hours_played: hours }
    if (form.status !== 'completed') {
      applyAutoStatus(overrides, hours <= 0 ? 'wishlist' : 'in_progress')
    }
    setForm(f => ({ ...f, ...overrides }))
    save(overrides)
  }

  // ── Séries: temporada/episódio com carrossel + auto-conclusão ──────────────
  const seriesEps = parseEpisodesPerSeason(item)
  const epsForSeason = (season) => seriesEps[season - 1] || null

  const commitSeries = (season, episode) => {
    haptic(6)
    const overrides = { current_season: season, current_episode: episode }
    // Auto-conclusão: último episódio da última temporada disponível
    const lastEp = epsForSeason(season)
    const isLastSeason = item.total_seasons && season === item.total_seasons
    if (isLastSeason && lastEp && episode === lastEp && form.status !== 'completed') {
      overrides.status = 'completed'
      if (!form.start_date) overrides.start_date = today()
      if (!form.end_date)   overrides.end_date   = today()
    } else if (form.status !== 'completed' && form.status !== 'abandoned') {
      // qualquer progresso → a ver
      if (form.status !== 'in_progress') {
        overrides.status = 'in_progress'
        if (!form.start_date) overrides.start_date = today()
      }
    }
    setForm(f => ({ ...f, ...overrides }))
    save(overrides)
  }

  // Limite por estreia: último episódio já estreado (via TVmaze nextEp)
  const lastAired = () => {
    if (!nextEp || !nextEp.airDate) return null   // sem próximo episódio conhecido → sem limite
    let s = nextEp.season, e = nextEp.number - 1
    if (e < 1) {                                  // o próximo é o E1 de uma nova temporada
      s -= 1
      e = s >= 1 ? (epsForSeason(s) || 1) : 1
    }
    return { s, e }
  }
  const isAired = (s, e) => {
    const cap = lastAired()
    if (!cap) return true
    return s < cap.s || (s === cap.s && e <= cap.e)
  }

  // Carrossel: < 1 → máximo · > máximo → 1
  const changeSeason = (delta) => {
    const max = item.total_seasons || null
    let s = (form.current_season || 1) + delta
    if (max) { if (s < 1) s = max; else if (s > max) s = 1 }
    else if (s < 1) s = 1
    if (delta > 0 && !isAired(s, 1)) return   // temporada ainda não estreou
    commitSeries(s, 1) // muda de temporada → episódio volta a 1
  }

  const changeEpisode = (delta) => {
    const curS = form.current_season || 1
    const curE = form.current_episode || 1
    const max = epsForSeason(curS)
    const totalSeasons = item.total_seasons || null
    // Avanço só é permitido se o episódio já estreou
    const go = (s, e) => { if (delta > 0 && !isAired(s, e)) return; commitSeries(s, e) }

    // Fim da temporada + "+" → avança para a próxima temporada (episódio 1)
    if (delta > 0 && max && curE >= max) {
      if (!totalSeasons || curS < totalSeasons) { go(curS + 1, 1); return }
      go(curS, max)   // última temporada → mantém (trata da auto-conclusão)
      return
    }
    // Início da temporada + "−" → recua para a temporada anterior (último episódio)
    if (delta < 0 && curE <= 1) {
      if (curS > 1) { commitSeries(curS - 1, epsForSeason(curS - 1) || 1); return }
      commitSeries(curS, 1)
      return
    }
    let e = curE + delta
    if (max && e > max) e = max
    if (e < 1) e = 1
    go(curS, e)
  }

  const getStatusLabel = (s) => {
    if (s === 'wishlist') {
      if (item.category === 'book') {
        if (item.book_type === 'audiobook') return t('home.want_to_listen')
        if (item.book_type === 'ebook') return t('home.want_to_read_ebook')
        return t('home.want_to_read')
      }
      if (item.category === 'game') return t('home.want_to_play')
      return t('home.want_to_watch')
    }
    if (s === 'in_progress') {
      if (item.category === 'book') {
        if (item.book_type === 'audiobook') return t('home.listening')
        return t('home.reading')
      }
      if (item.category === 'game') return t('home.playing')
      return t('home.watching')
    }
    return t(`status.${s}`)
  }

  const progressPct = () => {
    if (item.category === 'book') {
      if (item.book_type === 'audiobook' && item.audio_duration_minutes > 0)
        return Math.min((form.current_page / item.audio_duration_minutes) * 100, 100)
      if (item.total_pages > 0)
        return Math.min((form.current_page / item.total_pages) * 100, 100)
    }
    if (item.category === 'film' && item.is_series) {
      const eps = parseEpisodesPerSeason(item)
      const total = eps.length ? eps.reduce((a, b) => a + b, 0) : (item.total_episodes || 0)
      if (total > 0) {
        // usa os valores atuais do form
        const season = form.current_season || 1
        let before = 0
        for (let s = 0; s < season - 1; s++) before += (eps[s] || 0)
        const abs = before + (form.current_episode || 1)
        return Math.min((abs / total) * 100, 100)
      }
    }
    return null
  }
  const pct = progressPct()
  const hasBlurBg = item.cover && !coverErr

  // Filme sem progresso (não é série) → não tem estado "Em progresso" nem secção de progresso
  const isMovie = item.category === 'film' && !item.is_series
  const statuses = isMovie ? STATUSES.filter(s => s !== 'in_progress') : STATUSES

  // Episódios por temporada (array) — da temporada atualmente selecionada
  const epsPerSeason = parseEpisodesPerSeason(item)
  const epsThisSeason = epsPerSeason[(form.current_season || 1) - 1] || null

  // No limite de episódios já estreados? (para mostrar aviso e bloquear "+")
  const airedCap = lastAired()
  const atAiredCap = !!airedCap && (form.current_season || 1) === airedCap.s && (form.current_episode || 1) >= airedCap.e

  return (
    <div className="overlay-full" style={{ animation: 'slideUp 0.3s cubic-bezier(.22,1,.36,1) both', paddingTop: '100px' }}>
      {showShare && <ShareItem item={item} onClose={() => setShowShare(false)} />}
      {showCoverPicker && (
        <BookCoverPicker
          item={item}
          onClose={() => setShowCoverPicker(false)}
          onUpdate={(updated) => { onUpdate(updated); setShowCoverPicker(false) }}
        />
      )}

      {showManualCover && (
        <ManualCoverPicker
          item={item}
          onClose={() => setShowManualCover(false)}
          onUpdate={(updated) => { onUpdate(updated); setShowManualCover(false) }}
        />
      )}

      {showListSheet && (
        <AddToListSheet
          item={item}
          onClose={() => { setShowListSheet(false); setListCount(getListsForItem(item.id).length) }}
        />
      )}

      {/* ── Fundo desfocado da capa — página inteira (fixo atrás de tudo) ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }} aria-hidden>
        {hasBlurBg ? (
          <img
            src={item.cover}
            onError={() => setCoverErr(true)}
            style={{
              position: 'absolute', inset: '-50px',
              width: 'calc(100% + 100px)', height: 'calc(100% + 100px)',
              objectFit: 'cover',
              filter: 'blur(34px) brightness(0.42) saturate(1.5)',
              transform: 'scale(1.1)', pointerEvents: 'none',
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${color}CC, ${color}55)` }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.6) 100%)' }} />
      </div>

      {/* ── Cabeçalho (sobre o fundo) ─────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
        <div style={{ position: 'relative', padding: '50px 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Back button + Share button */}
          <div style={{ width: '100%', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
                backdropFilter: 'blur(14px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.6)',
                borderRadius: 12, padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: 6,
                border: '1px solid var(--item-glass-border)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito' }}>{t('detail.back')}</span>
            </button>
            <button
              onClick={() => setShowShare(true)}
              style={{
                background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
                backdropFilter: 'blur(14px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.6)',
                borderRadius: 12, padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: 6,
                border: '1px solid var(--item-glass-border)',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
              </svg>
              <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito' }}>Share</span>
            </button>
          </div>

          {/* Centered cover with deep shadow */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
            <div
              style={{
                position: 'relative',
                boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
                borderRadius: 18,
                animation: 'popIn 0.45s cubic-bezier(.34,1.56,.64,1) 0.05s both',
              }}
            >
              <div style={{ borderRadius: 18, overflow: 'hidden' }}>
                <CoverImage src={item.cover} category={item.category} size={coverSize} radius={18} title={item.title} isMovie={item.category === 'film' && !item.is_series} />
              </div>


              {/* Ícone editar capa — canto inferior direito (livros: Open Library · filmes: manual) */}
              {(item.category === 'book' || item.category === 'film') && (
                <button
                  onClick={() => item.category === 'book' ? setShowCoverPicker(true) : setShowManualCover(true)}
                  title="Edit cover"
                  style={{
                    position: 'absolute', bottom: -8, right: -8,
                    width: 30, height: 30, borderRadius: '50%',
                    background: color,
                    border: '2.5px solid white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Metadata centrado (sem moldura de vidro) */}
          <div style={{ textAlign: 'center', width: '100%' }}>
            <h2 style={{ color: 'white', fontSize: 21, lineHeight: 1.25, fontWeight: 900, textShadow: '0 2px 12px rgba(0,0,0,0.4)', marginBottom: 6 }}>
              {item.title}
            </h2>
            {/* Subtítulo — criador / autor / estúdio */}
            {item.subtitle && (
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>
                {item.subtitle}
              </p>
            )}

            {/* Progress bar */}
            {pct !== null && form.status === 'in_progress' && (
              <div style={{ marginTop: 16, width: '100%' }}>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'white', borderRadius: 2, transition: 'width 0.6s ease', animation: 'progressFill 0.8s ease' }} />
                </div>
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 5, fontWeight: 600 }}>
                  {t('detail.pct_completed', { pct: Math.round(pct) })}
                </p>
              </div>
            )}
          </div>

          {/* Estado — dropdown por baixo do vidro, logo por cima do corpo */}
          <div style={{ width: '100%', marginTop: 16 }}>
            <StatusDropdown
              statuses={statuses}
              current={form.status}
              config={statusConfig}
              getLabel={getStatusLabel}
              onSelect={handleStatusChange}
            />
          </div>
        </div>
      </div>

      {/* ── Scrollable body — transparente, sobre o fundo desfocado ──── */}
      <div
        onScroll={e => setScrollY(e.currentTarget.scrollTop)}
        style={{
        flex: 1, overflowY: 'auto', padding: '12px 20px 20px', background: 'transparent',
        position: 'relative', zIndex: 1,
      }}>

        {/* Progresso — livros/jogos sempre visível (o progresso define o estado);
            séries só quando em curso; filmes nunca */}
        {(item.category === 'book' || item.category === 'game' ||
          (item.category === 'film' && !!item.is_series && form.status !== 'wishlist' && form.status !== 'completed')) && (
          <Section label={t('detail.progress')} delay={1}>
            {/* Book: page slider */}
            {item.category === 'book' && (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--item-label)', fontWeight: 700 }}>
                    {item.book_type === 'audiobook' ? t('detail.current_position') : t('detail.current_page')}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color }}>
                    {item.book_type === 'audiobook'
                      ? `${formatMinutes(form.current_page)}${item.audio_duration_minutes ? ` / ${formatMinutes(item.audio_duration_minutes)}` : ''}`
                      : `${form.current_page}${item.total_pages ? ` / ${item.total_pages}` : ''}`
                    }
                  </span>
                </div>

                {/* Audiobook: contador de tempo */}
                {item.book_type === 'audiobook' ? (
                  <>
                    {item.audio_duration_minutes > 0 && (
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
                        <div style={{ height: '100%', width: `${Math.min((form.current_page / item.audio_duration_minutes) * 100, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
                      </div>
                    )}
                    <StepperValue value={formatMinutes(form.current_page)} unit={t('detail.listened')} />
                    <Stepper color={color} segments={[
                      { label: '−10m', onClick: () => commitBookPage(Math.max(0, form.current_page - 10)) },
                      { label: '−1m',  onClick: () => commitBookPage(Math.max(0, form.current_page - 1)) },
                      { label: '+1m',  plus: true, onClick: () => commitBookPage(form.current_page + 1) },
                      { label: '+10m', plus: true, onClick: () => commitBookPage(form.current_page + 10) },
                    ]} />
                  </>
                ) : (
                  <>
                    {/* Livro/Ebook: slider de páginas estilo iOS */}
                    {item.total_pages > 0 && (
                      <AppleSlider
                        value={form.current_page}
                        max={item.total_pages}
                        color={color}
                        onChange={v => setForm(f => ({ ...f, current_page: v }))}
                        onCommit={v => commitBookPage(v)}
                      />
                    )}
                    {!item.total_pages && (
                      <>
                        <StepperValue value={form.current_page} unit={t('detail.pages_unit')} />
                        <Stepper color={color} segments={[
                          { label: '−10', onClick: () => commitBookPage(Math.max(0, form.current_page - 10)) },
                          { label: '−1',  onClick: () => commitBookPage(Math.max(0, form.current_page - 1)) },
                          { label: '+1',  plus: true, onClick: () => commitBookPage(form.current_page + 1) },
                          { label: '+10', plus: true, onClick: () => commitBookPage(form.current_page + 10) },
                        ]} />
                      </>
                    )}
                  </>
                )}
              </Card>
            )}

            {/* Game: horas — Steam (só leitura, sem botões) ou contador manual */}
            {item.category === 'game' && (
              <Card>
                {canSyncHours ? (
                  <>
                    <StepperValue value={form.hours_played} unit={t('detail.hours_played')} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#3D3D54"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/></svg>
                      <p style={{ fontSize: 11, color: 'var(--item-label)', fontWeight: 700 }}>
                        {steamHoursLoading ? t('detail.syncing_steam') : t('detail.synced_steam')}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <StepperValue value={form.hours_played} unit={t('detail.hours_played')} />
                    <Stepper color={color} segments={[
                      { label: '−1',   onClick: () => commitGameHours(Math.max(0, form.hours_played - 1)) },
                      { label: '−0.5', onClick: () => commitGameHours(parseFloat(Math.max(0, form.hours_played - 0.5).toFixed(1))) },
                      { label: '+0.5', plus: true, onClick: () => commitGameHours(parseFloat((form.hours_played + 0.5).toFixed(1))) },
                      { label: '+1',   plus: true, onClick: () => commitGameHours(form.hours_played + 1) },
                    ]} />
                    {isSteamGame && !isPremium() && (
                      <button onClick={() => openPremium('steamSync')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', marginTop: 10, background: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--item-label)' }}>
                        {t('detail.steam_sync_premium')}
                      </button>
                    )}
                  </>
                )}
              </Card>
            )}

            {/* Series: season + episode */}
            {item.category === 'film' && !!item.is_series && (
              <Card>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, color: 'var(--item-label)', fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>
                      {item.total_seasons ? t('detail.season_of', { n: item.total_seasons }) : t('detail.season')}
                    </p>
                    <StepperValue value={form.current_season} />
                    <Stepper color={color} height={42} segments={[
                      { label: '−', onClick: () => changeSeason(-1) },
                      { label: '+', plus: true, onClick: () => changeSeason(1) },
                    ]} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, color: 'var(--item-label)', fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>
                      {epsThisSeason ? t('detail.episode_of', { n: epsThisSeason }) : t('detail.episode')}
                    </p>
                    <StepperValue value={form.current_episode} />
                    <Stepper color={color} height={42} segments={[
                      { label: '−', onClick: () => changeEpisode(-1) },
                      { label: '+', plus: true, disabled: atAiredCap, onClick: () => changeEpisode(1) },
                    ]} />
                  </div>
                </div>
                {atAiredCap && nextEp && (
                  <p style={{ fontSize: 11, color: 'var(--item-label)', fontWeight: 600, marginTop: 10, textAlign: 'center', lineHeight: 1.4 }}>
                    {t('detail.up_to_date', { date: formatAirDate(nextEp.airDate, t, lang) })}
                  </p>
                )}
              </Card>
            )}
          </Section>
        )}

        {/* Rating */}
        {form.status === 'completed' && (
          <Section label={t('detail.rating')} delay={2}>
            <Card>
              <StarRating value={form.rating} onChange={v => { setForm(f => ({...f, rating: v})); save({rating: v}) }} />
            </Card>
          </Section>
        )}

        {/* Datas — livros e jogos (exceto na lista de espera) */}
        {(item.category === 'book' || item.category === 'game') && form.status !== 'wishlist' && (
          <Section label={t('detail.dates')} delay={2}>
            <Card>
              <div style={{ display: 'flex', gap: 12 }}>
                <DateField
                  label={item.category === 'book' ? t('detail.started_reading') : t('detail.started_playing')}
                  value={form.start_date}
                  color={color}
                  onChange={v => { setForm(f => ({ ...f, start_date: v })); save({ start_date: v }) }}
                />
                <DateField
                  label={t('detail.completed')}
                  value={form.end_date}
                  color={color}
                  onChange={v => { setForm(f => ({ ...f, end_date: v })); save({ end_date: v }) }}
                />
              </div>
            </Card>
          </Section>
        )}

        {/* Datas — filmes (visto em) e séries (início/fim) */}
        {item.category === 'film' && form.status !== 'wishlist' && (
          <Section label={t('detail.dates')} delay={2}>
            <Card>
              {item.is_series ? (
                <div style={{ display: 'flex', gap: 12 }}>
                  <DateField
                    label={t('detail.started_watching')}
                    value={form.start_date}
                    color={color}
                    onChange={v => { setForm(f => ({ ...f, start_date: v })); save({ start_date: v }) }}
                  />
                  <DateField
                    label={t('detail.completed')}
                    value={form.end_date}
                    color={color}
                    onChange={v => { setForm(f => ({ ...f, end_date: v })); save({ end_date: v }) }}
                  />
                </div>
              ) : (
                <DateField
                  label={t('detail.watched_on')}
                  value={form.end_date}
                  color={color}
                  onChange={v => { setForm(f => ({ ...f, end_date: v })); save({ end_date: v }) }}
                />
              )}
            </Card>
          </Section>
        )}

        {/* Conquistas — Steam (real) ou aviso para outras plataformas */}
        {item.category === 'game' && (item.game_platform === 'steam' || !item.game_platform) && (
          <Section label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="trophy" size={12} strokeWidth={2.4} />Steam — {t('manual_ach.title')}</span>} delay={3}>
            <SteamAchievements
              item={item}
              steamId={localStorage.getItem(`steamId_${user?.id}`) || ''}
              onUpdate={onUpdate}
            />
          </Section>
        )}
        {item.category === 'game' && item.game_platform && item.game_platform !== 'steam' && (
          <Section label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="trophy" size={12} strokeWidth={2.4} />{`${GAME_PLATFORM_LABEL[item.game_platform]?.label || ''} — ${t('manual_ach.title')}`}</span>} delay={3}>
            <ManualAchievements item={item} platform={item.game_platform} onUpdate={onUpdate} />
          </Section>
        )}

        {/* Próximo episódio (séries) */}
        {item.category === 'film' && !!item.is_series && nextEp && (
          <Section label={t('detail.next_episode')} delay={3.5}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: CAT_COLOR.film, display: 'flex' }}><Icon name="bell" size={18} strokeWidth={2.2} /></span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                    T{nextEp.season} E{nextEp.number}{nextEp.name ? ` · ${nextEp.name}` : ''}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--item-label)', fontWeight: 600, marginTop: 1 }}>{formatAirDate(nextEp.airDate, t, lang)}</p>
                </div>
              </div>
            </Card>
          </Section>
        )}

        {/* Adicionar a lista */}
        <Section label={t('detail.lists')} delay={3.8}>
          <button onClick={() => setShowListSheet(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderRadius: 14, border: '1px solid var(--item-glass-border)', background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="scroll" size={18} strokeWidth={2.2} /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {listCount > 0 ? t('detail.in_lists', { n: listCount, suffix: listCount > 1 ? 's' : '' }) : t('detail.add_to_list')}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--item-label)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </Section>

        {/* Detalhes — prioridade sobre a sinopse */}
        <Section label={t('detail.details')} delay={4}>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <DetailRow label={t('detail.category')} value={
                item.category === 'book' && item.book_type
                  ? `${BOOK_TYPE_INFO[item.book_type]?.emoji} ${BOOK_TYPE_INFO[item.book_type]?.label}`
                  : item.category === 'film'
                    ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CategoryIcon cat="film" size={15} />{item.is_series ? t('detail.series_label') : t('detail.film_label')}</span>)
                    : item.category === 'game'
                      ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <PlatformIcon platform={item.game_platform} size={15} color="var(--text)" />
                          {GAME_PLATFORM_LABEL[item.game_platform]?.label || t('cat.game')}
                        </span>
                      )
                      : CAT_LABEL[item.category]
              } />
              {item.year && <DetailRow label={t('detail.year')} value={item.year} />}
              {item.genre && <DetailRow label={t('detail.genre')} value={item.genre} />}
              {item.category === 'film' && !item.is_series && item.runtime > 0 && (
                <DetailRow label={t('detail.duration')} value={formatRuntime(item.runtime)} />
              )}
              {item.category === 'film' && !!item.is_series && item.total_seasons > 0 && (
                <DetailRow label={t('detail.seasons')} value={item.total_seasons} />
              )}
              {item.category === 'book' && item.book_type !== 'audiobook' && (
                <EditablePages
                  value={item.total_pages}
                  color={color}
                  onSave={(v) => save({ total_pages: v })}
                  label={t('detail.pages')}
                />
              )}
            </div>
          </Card>
        </Section>

        {/* Sinopse — o título "Sinopse" é o próprio botão (fechado por defeito) */}
        {synopsisText && (
          <CollapsibleSynopsis text={synopsisText} delay={5} label={t('detail.synopsis')} lang={lang} />
        )}

        {/* Notes */}
        <Section label={t('detail.personal_notes')} delay={6}>
          <Card>
            <textarea
              className="notes-glass"
              value={form.notes}
              onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              onBlur={() => save({ notes: form.notes })}
              placeholder={t('detail.notes_placeholder')}
              rows={4}
              style={{ resize: 'none', fontSize: 14, lineHeight: 1.6, border: 'none', padding: 0, width: '100%', background: 'transparent', outline: 'none', fontFamily: 'Nunito', color: 'var(--text)', fontWeight: 600 }}
            />
          </Card>
        </Section>

        {/* Delete */}
        <div style={{ marginBottom: 8 }}>
          {showDelete ? (
            <div style={{ background: 'rgba(255,71,87,0.12)', border: '1.5px solid rgba(255,71,87,0.3)', borderRadius: 14, padding: 16, textAlign: 'center', animation: 'fadeInScale 0.2s ease both' }}>
              <p style={{ color: '#FF4757', fontWeight: 700, marginBottom: 12 }}>{t('detail.delete_confirm')}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowDelete(false)} style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 12, padding: 10, color: 'var(--text-muted)', background: 'var(--surface)', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito' }}>
                  {t('detail.cancel')}
                </button>
                <button
                  onClick={async () => { await deleteItem(item.id); onDelete(item.id) }}
                  style={{ flex: 1, background: '#FF4757', color: 'white', borderRadius: 12, padding: 10, fontSize: 14, fontWeight: 700, fontFamily: 'Nunito' }}
                >
                  {t('detail.delete')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDelete(true)}
              style={{ width: '100%', padding: 12, borderRadius: 12, background: 'none', border: '1.5px solid var(--border)', color: '#FF4757', fontSize: 14, fontWeight: 700, fontFamily: 'Nunito', transition: 'background 0.15s' }}
            >
              {t('detail.remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

// Dropdown de estado que cresce para baixo com animação
function StatusDropdown({ statuses, current, config, getLabel, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const cfg = config[current]

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  const others = statuses.filter(s => s !== current)

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{
        background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
        backdropFilter: 'blur(24px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--item-glass-border)',
        boxShadow: open
          ? '0 16px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
          : '0 4px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18)',
        transition: 'box-shadow 0.25s ease',
      }}>
        {/* Botão atual (gatilho) */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '9px 16px',
            background: `${cfg.color}26`, border: 'none', cursor: 'pointer',
          }}
        >
          <span style={{ color: cfg.color, display: 'flex' }}><StatusIcon status={current} size={15} strokeWidth={2.3} /></span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'Nunito' }}>
            {getLabel(current)}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text)"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform 0.28s cubic-bezier(.22,1,.36,1)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Opções — expandem para baixo */}
        <div style={{
          maxHeight: open ? others.length * 46 : 0,
          opacity: open ? 1 : 0,
          transition: 'max-height 0.30s cubic-bezier(.22,1,.36,1), opacity 0.2s ease',
        }}>
          {others.map((s, i) => {
            const c = config[s]
            return (
              <button
                key={s}
                onClick={() => { onSelect(s); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '11px 16px',
                  background: 'var(--status-opt)', border: 'none',
                  borderTop: '1px solid var(--item-glass-border)', cursor: 'pointer',
                  animation: open ? `fadeInUp 0.25s ease ${0.04 + i * 0.05}s both` : 'none',
                }}
                onPointerDown={e => e.currentTarget.style.background = 'var(--status-opt-hover)'}
                onPointerUp={e => e.currentTarget.style.background = 'var(--status-opt)'}
                onPointerLeave={e => e.currentTarget.style.background = 'var(--status-opt)'}
              >
                <span style={{ color: c.color, display: 'flex' }}><StatusIcon status={s} size={15} strokeWidth={2.3} /></span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'Nunito' }}>
                  {getLabel(s)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Linha de "Páginas" editável — mantém o aspeto da DetailRow até ser tocada
function EditablePages({ value, onSave, color, label }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  const commit = () => {
    const n = parseInt(draft, 10)
    if (Number.isFinite(n) && n > 0 && n !== value) onSave(n)
    setEditing(false)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid #F0F0F5',
    }}>
      <span style={{ fontSize: 13, color: 'var(--item-label)', fontWeight: 700 }}>{label}</span>
      {editing ? (
        <input
          type="number"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            width: 80, textAlign: 'right', fontSize: 13, fontWeight: 700,
            color: 'var(--text)', fontFamily: 'Nunito', background: 'var(--item-input-bg)',
            border: `1.5px solid ${color}`, borderRadius: 8, padding: '3px 8px',
          }}
        />
      ) : (
        <button
          onClick={() => { setDraft(value || ''); setEditing(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', padding: 0 }}
        >
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 800 }}>
            {value || '—'}
          </span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#C7C7D1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// Sinopse colapsável — traduz automaticamente quando o idioma não é PT
function CollapsibleSynopsis({ text, delay = 0, label, lang }) {
  const [open, setOpen] = useState(false)
  const [displayText, setDisplayText] = useState(text)
  const [translating, setTranslating] = useState(false)
  const cacheRef = useRef({})

  useEffect(() => {
    if (!text || !lang || lang === 'pt') { setDisplayText(text); return }
    if (cacheRef.current[lang]) { setDisplayText(cacheRef.current[lang]); return }
    setTranslating(true)
    translateSynopsis(text, lang)
      .then(res => { const tr = res?.translated || text; cacheRef.current[lang] = tr; setDisplayText(tr) })
      .catch(() => setDisplayText(text))
      .finally(() => setTranslating(false))
  }, [text, lang])

  return (
    <div style={{ marginBottom: 20, animation: `fadeInUp 0.35s ease ${delay * 0.06}s both` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, marginBottom: 8, cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Nunito', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
          {label || 'Synopsis'}
        </span>
        {translating && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Nunito' }}>···</span>
        )}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform 0.28s cubic-bezier(.22,1,.36,1)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div style={{
        maxHeight: open ? 600 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s cubic-bezier(.22,1,.36,1), opacity 0.25s ease',
      }}>
        <Card>
          <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text)', fontWeight: 500 }}>{displayText}</p>
        </Card>
      </div>
    </div>
  )
}

function formatAirDate(d, t, lang) {
  if (!d) return ''
  try {
    const date = new Date(d + 'T00:00:00')
    const LOCALES = { pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', en: 'en-GB' }
    const locale = LOCALES[lang] || 'en-GB'
    const fmt = date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' })
    const days = Math.ceil((date - new Date().setHours(0, 0, 0, 0)) / 86400000)
    const rel = t
      ? (days === 0 ? t('home.today') : days === 1 ? t('home.tomorrow') : days > 1 ? t('home.days', { n: days }) : '')
      : (days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : '')
    return rel ? `${fmt} · ${rel}` : fmt
  } catch { return d }
}

function DetailRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid #F0F0F5',
    }}>
      <span style={{ fontSize: 13, color: 'var(--item-label)', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 800 }}>{value}</span>
    </div>
  )
}

function DateField({ label, value, onChange, color }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: 11, color: 'var(--item-label)', fontWeight: 800, marginBottom: 6 }}>{label}</p>
      <input
        type="date"
        value={value || ''}
        max={new Date().toISOString().slice(0, 10)}
        onChange={e => { if (e.target.value) onChange(e.target.value) }}
        style={{
          width: '100%', fontSize: 13, padding: '9px 10px',
          border: 'none',
          borderRadius: 10, color: value ? 'var(--text)' : 'var(--text-muted)',
          fontFamily: 'Nunito', background: 'var(--item-input-bg)',
        }}
      />
    </div>
  )
}

function Section({ label, children, delay = 0 }) {
  return (
    <div style={{ marginBottom: 20, animation: `fadeInUp 0.35s ease ${delay * 0.06}s both` }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>{label}</p>
      {children}
    </div>
  )
}

function Card({ children }) {
  return (
    <div style={{
      background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
      backdropFilter: 'blur(28px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
      borderRadius: 18, padding: 16,
      border: '1px solid var(--item-glass-border)',
      boxShadow: '0 10px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
    }}>
      {children}
    </div>
  )
}

// Slider estilo iOS — track fino, fill colorido, thumb branco circular
function AppleSlider({ value, max, color, onChange, onCommit }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0

  const valueFromX = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return Math.round(ratio * max)
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    draggingRef.current = true
    onChange(valueFromX(e.clientX))

    const move = (ev) => { if (draggingRef.current) onChange(valueFromX(ev.clientX)) }
    const up   = (ev) => {
      draggingRef.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onCommit(valueFromX(ev.clientX))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      style={{ position: 'relative', height: 28, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
    >
      {/* Track */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 5, borderRadius: 3, background: '#E4E4EA' }} />
      {/* Fill */}
      <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: 5, borderRadius: 3, background: color, transition: draggingRef.current ? 'none' : 'width 0.1s ease' }} />
      {/* Thumb */}
      <div style={{
        position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)',
        width: 26, height: 26, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 4px rgba(0,0,0,0.22), 0 4px 10px rgba(0,0,0,0.12)',
        border: '0.5px solid rgba(0,0,0,0.05)',
        transition: draggingRef.current ? 'none' : 'left 0.1s ease',
      }} />
    </div>
  )
}

// Valor grande em destaque (estilo Apple — números tabulares, peso forte)
function StepperValue({ value, unit, color }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 14 }}>
      <p style={{
        fontSize: 40, fontWeight: 800, color: 'var(--text)', lineHeight: 1,
        letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums',
        textShadow: '0 1px 1px rgba(255,255,255,0.6)',
      }}>
        {value}
      </p>
      {unit && <p style={{ fontSize: 12, color: 'var(--item-label)', fontWeight: 700, marginTop: 5 }}>{unit}</p>}
    </div>
  )
}

// Stepper segmentado estilo iOS — pill cinzenta única com hairlines
function Stepper({ segments, color, height = 46 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
      backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--item-glass-border)',
      borderRadius: 13, overflow: 'hidden', height,
    }}>
      {segments.map((seg, i) => (
        <div key={i} style={{ display: 'flex', flex: 1, minWidth: 0 }}>
          {i > 0 && <div style={{ width: 1, background: 'var(--item-glass-border)', margin: '9px 0', flexShrink: 0 }} />}
          <button
            onClick={seg.disabled ? undefined : seg.onClick}
            disabled={seg.disabled}
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none',
              fontSize: 16, fontWeight: 700, fontFamily: 'Nunito',
              color: seg.plus ? color : 'var(--text)',
              opacity: seg.disabled ? 0.35 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: seg.disabled ? 'default' : 'pointer', transition: 'background 0.12s, transform 0.08s',
              WebkitTapHighlightColor: 'transparent',
            }}
            onPointerDown={e => { if (seg.disabled) return; e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.transform = 'scale(0.96)' }}
            onPointerUp={e   => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)' }}
            onPointerLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            {seg.label}
          </button>
        </div>
      ))}
    </div>
  )
}
