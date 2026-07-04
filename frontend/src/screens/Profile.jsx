import { useState, useEffect } from 'react'
import { steamResolve } from '../api'
import PremiumButton from '../components/PremiumButton'
import Icon from '../components/Icon'
import StatusIcon from '../components/StatusIcon'
import CategoryIcon from '../components/CategoryIcon'
import { addItem } from '../api'
import { confirmDialog, showToast } from '../feedback'
import { ACCENT_LIST, getAccent, setAccent, applyAccent } from '../theme'
import { CAT_EMOJI, CAT_COLOR, CAT_LABEL, CATEGORY_IDS, setEnabledCategories, calculateStreak, getVacations, isPremium, setPremium, requirePremium } from '../utils'
import { useLang } from '../i18n'
import { supabase } from '../supabase'

function parseCSVLine(line) {
  const vals = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === ',' && !q) { vals.push(cur); cur = '' }
    else cur += c
  }
  vals.push(cur)
  return vals
}
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).map(l => {
    const vals = parseCSVLine(l).map(v => v.replace(/^"|"$/g, '').trim())
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

export default function Profile({ userName, setUserName, items, onNavigate, enabledCats = ['book', 'game', 'film'], onCategoriesChange, onEditGoals, user, onShowAuth, onSignOut }) {
  const { t, lang, setLang } = useLang()

  const toggleCategory = async (catId) => {
    const isOn = enabledCats.includes(catId)
    if (isOn) {
      if (enabledCats.length === 1) { showToast(t('profile.at_least_one_cat'), 'error'); return }
      const count = items.filter(i => i.category === catId).length
      if (count > 0 && !(await confirmDialog({ title: t('profile.hide_cat_title', { cat: CAT_LABEL[catId] }), message: t('profile.hide_cat_message', { n: count, suffix: count === 1 ? '' : 's' }), confirmLabel: t('profile.hide_cat_confirm'), danger: true }))) return
      onCategoriesChange && onCategoriesChange(setEnabledCategories(enabledCats.filter(c => c !== catId)))
      showToast(t('profile.cat_hidden', { cat: CAT_LABEL[catId] }), 'success')
    } else {
      onCategoriesChange && onCategoriesChange(setEnabledCategories([...enabledCats, catId]))
      showToast(t('profile.cat_enabled', { cat: CAT_LABEL[catId] }), 'success')
    }
  }
  const [premium, setPremiumState] = useState(isPremium())
  const togglePremium = () => { const v = !premium; setPremium(v); setPremiumState(v) }

  const manageSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
      )
      const { url, error } = await res.json()
      if (error) { showToast(error, 'error'); return }
      window.location.href = url
    } catch {
      showToast('Erro ao abrir portal de subscrição', 'error')
    }
  }
  const [subPage, setSubPage] = useState(null)   // null = lista · 'theme' = sub-página tema
  const [editing, setEditing]       = useState(false)
  const [draft, setDraft]           = useState(userName)
  const [steamId, setSteamId]       = useState(() => localStorage.getItem(`steamId_${user?.id}`) || '')
  const [steamDraft, setSteamDraft] = useState(() => localStorage.getItem(`steamId_${user?.id}`) || '')

  useEffect(() => {
    const id = localStorage.getItem(`steamId_${user?.id}`) || ''
    setSteamId(id)
    setSteamDraft(id)
  }, [user?.id])
  const [editingSteam, setEditingSteam] = useState(false)
  const [resolvingId, setResolvingId]   = useState(false)
  const [steamErr, setSteamErr]         = useState('')
  const [themePref, setThemePref]       = useState(() => localStorage.getItem('theme') || 'system')
  const [accent, setAccentState]        = useState(() => getAccent())

  const applyTheme = (pref) => {
    setThemePref(pref)
    localStorage.setItem('theme', pref)
    const resolved = pref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref
    document.documentElement.dataset.theme = resolved
    applyAccent(accent)   // reaplica o tom suave conforme o novo modo
  }

  const chooseAccent = (id) => {
    if (!requirePremium('themes')) return
    setAccent(id)
    setAccentState(id)
  }

  const [vacations, setVacations] = useState(() => getVacations())
  const activeVac = vacations.find(v => v.end == null)

  const [weekStart, setWeekStartState] = useState(() => localStorage.getItem('weekStart') || 'sunday')
  const setWeekStart = (v) => { setWeekStartState(v); localStorage.setItem('weekStart', v) }

  const [showPct, setShowPctState] = useState(() => localStorage.getItem('showPercent') !== '0')
  const toggleShowPct = () => { const v = !showPct; setShowPctState(v); localStorage.setItem('showPercent', v ? '1' : '0') }

  // Preferências de notificações (guardadas localmente)
  const [notif, setNotif] = useState(() => {
    try { return { daily: true, streak: true, news: false, ...JSON.parse(localStorage.getItem('notifPrefs') || '{}') } }
    catch { return { daily: true, streak: true, news: false } }
  })
  const toggleNotif = (key) => {
    setNotif(prev => { const next = { ...prev, [key]: !prev[key] }; localStorage.setItem('notifPrefs', JSON.stringify(next)); return next })
  }

  // Exportar a coleção como ficheiro JSON
  const exportData = () => {
    const payload = { app: 'Vyllo', version: '1.0.0', exportedAt: new Date().toISOString(), items }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vyllo-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast(t('profile.collection_exported'), 'success')
  }

  // Importar coleção a partir de um ficheiro JSON
  const [importing, setImporting] = useState(false)
  const importData = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const list = Array.isArray(data) ? data : (data.items || [])
      if (!list.length) throw new Error('vazio')
      for (const it of list) { const { id, created_at, ...rest } = it; await addItem(rest) }
      showToast(t('profile.items_imported', { n: list.length }), 'success')
      setTimeout(() => window.location.reload(), 900)
    } catch {
      showToast(t('profile.invalid_file'), 'error')
    } finally { setImporting(false) }
  }

  // Importação de apps concorrentes
  const [appImport, setAppImport] = useState({})

  const doImport = async (appId, rows, mapFn) => {
    const total = rows.length
    let done = 0, errors = 0
    setAppImport(s => ({ ...s, [appId]: { status: 'loading', done: 0, total, errors: 0 } }))
    for (const row of rows) {
      try {
        const item = mapFn(row)
        if (item && item.title) { await addItem(item); done++ }
        else errors++
      } catch { errors++ }
      setAppImport(s => ({ ...s, [appId]: { status: 'loading', done, total, errors } }))
    }
    setAppImport(s => ({ ...s, [appId]: { status: 'done', done, total, errors } }))
    if (done > 0) setTimeout(() => window.location.reload(), 2000)
  }

  const importGoodreads = async (file) => {
    try {
      const rows = parseCSV(await file.text())
      if (!rows.length) { showToast(t('profile.invalid_file_short'), 'error'); return }
      await doImport('goodreads', rows, row => {
        const shelf = (row['Exclusive Shelf'] || '').trim()
        const status = shelf === 'read' ? 'completed' : shelf === 'currently-reading' ? 'in_progress' : 'not_started'
        const rating = parseInt(row['My Rating'])
        const year = parseInt(row['Original Publication Year'] || row['Year Published'])
        const dateRead = row['Date Read'] ? (() => { try { return new Date(row['Date Read']).toISOString().split('T')[0] } catch { return null } })() : null
        return {
          title: row['Title'] || '', subtitle: row['Author'] || '',
          category: 'book', status, book_type: 'book',
          year: isNaN(year) ? null : year,
          total_pages: parseInt(row['Number of Pages']) || null,
          rating: rating > 0 ? rating : null,
          end_date: dateRead,
          cover: '', genre: '', synopsis: '', platform: '',
        }
      })
    } catch { showToast(t('profile.error_reading'), 'error') }
  }

  const importStorygraph = async (file) => {
    try {
      const rows = parseCSV(await file.text())
      if (!rows.length) { showToast(t('profile.invalid_file_short'), 'error'); return }
      await doImport('storygraph', rows, row => {
        const readStatus = (row['Read Status'] || row['Exclusive Shelf'] || '').toLowerCase()
        const status = readStatus === 'read' || readStatus === 'completed' ? 'completed'
          : readStatus.includes('reading') ? 'in_progress' : 'not_started'
        const ratingRaw = parseFloat(row['Star Rating'] || row['My Rating'] || '0')
        const year = parseInt(row['Year Published'] || row['Original Publication Year'])
        const dateRead = row['Date Read'] ? (() => { try { return new Date(row['Date Read']).toISOString().split('T')[0] } catch { return null } })() : null
        return {
          title: row['Title'] || '', subtitle: row['Author'] || row['Authors'] || '',
          category: 'book', status, book_type: 'book',
          year: isNaN(year) ? null : year,
          total_pages: parseInt(row['Number of Pages'] || row['Pages']) || null,
          rating: ratingRaw > 0 ? Math.round(ratingRaw) : null,
          end_date: dateRead,
          cover: '', genre: row['Genres'] || '', synopsis: '', platform: '',
        }
      })
    } catch { showToast(t('profile.error_reading'), 'error') }
  }

  const importTrakt = async (file) => {
    try {
      const rows = parseCSV(await file.text())
      if (!rows.length) { showToast(t('profile.invalid_file_short'), 'error'); return }
      // Detecta se são filmes ou séries pelo URL (trakt.tv/movies/ ou trakt.tv/shows/)
      const firstUrl = rows[0]?.['URL'] || ''
      const isSeries = firstUrl.includes('/shows/')
      await doImport('trakt', rows, row => {
        const year = parseInt(row['Year'])
        const ratingRaw = parseInt(row['Rating'] || '0') // Trakt usa escala 1-10
        const watchedAt = row['Watched At'] ? (() => { try { return new Date(row['Watched At']).toISOString().split('T')[0] } catch { return null } })() : null
        return {
          title: row['Title'] || '', subtitle: '',
          category: 'film', is_series: isSeries, status: 'completed',
          year: isNaN(year) ? null : year,
          rating: ratingRaw > 0 ? Math.round(ratingRaw / 2) : null, // 1-10 → 1-5
          end_date: watchedAt,
          cover: '', genre: '', synopsis: '', platform: '',
        }
      })
    } catch { showToast(t('profile.error_reading'), 'error') }
  }

  const importBackloggd = async (file) => {
    try {
      const rows = parseCSV(await file.text())
      if (!rows.length) { showToast(t('profile.invalid_file_short'), 'error'); return }
      await doImport('backloggd', rows, row => {
        const rawStatus = (row['Status'] || '').toLowerCase()
        const status = rawStatus === 'played' || rawStatus === 'completed' ? 'completed'
          : rawStatus === 'playing' ? 'in_progress'
          : 'not_started'
        const ratingRaw = parseFloat(row['Rating'] || '0') // Backloggd usa 1-5 ou 1-10
        const dateFinished = row['Date Finished'] || row['Finished'] ? (() => { try { return new Date(row['Date Finished'] || row['Finished']).toISOString().split('T')[0] } catch { return null } })() : null
        return {
          title: row['Game'] || row['Name'] || row['Title'] || '', subtitle: '',
          category: 'game',
          game_platform: (row['Platform'] || '').toLowerCase().includes('steam') ? 'steam' : (row['Platform'] || '').toLowerCase().includes('playstation') ? 'playstation' : (row['Platform'] || '').toLowerCase().includes('xbox') ? 'xbox' : (row['Platform'] || '').toLowerCase().includes('nintendo') ? 'nintendo' : '',
          status,
          rating: ratingRaw > 0 ? Math.round(ratingRaw) : null,
          end_date: dateFinished,
          cover: '', genre: '', synopsis: '', platform: '',
        }
      })
    } catch { showToast(t('profile.error_reading'), 'error') }
  }

  const importLetterboxd = async (file) => {
    try {
      const rows = parseCSV(await file.text())
      if (!rows.length) { showToast(t('profile.invalid_file_short'), 'error'); return }
      const hasWatchedDate = Object.keys(rows[0] || {}).includes('Watched Date')
      await doImport('letterboxd', rows, row => {
        const dateStr = hasWatchedDate ? row['Watched Date'] : row['Date']
        const ratingNum = parseFloat(row['Rating'] || '0')
        const year = parseInt(row['Year'])
        const endDate = dateStr ? (() => { try { return new Date(dateStr).toISOString().split('T')[0] } catch { return null } })() : null
        return {
          title: row['Name'] || '', subtitle: '',
          category: 'film', is_series: false, status: 'completed',
          year: isNaN(year) ? null : year,
          rating: ratingNum > 0 ? Math.round(ratingNum) : null,
          end_date: endDate,
          cover: '', genre: '', synopsis: '', platform: '',
        }
      })
    } catch { showToast(t('profile.error_reading'), 'error') }
  }

  const seedDemoData = async () => {
    const today = new Date()
    const d = (offsetDays) => {
      const dt = new Date(today)
      dt.setDate(dt.getDate() - offsetDays)
      return dt.toISOString().split('T')[0]
    }
    const DEMO = [
      // Books
      { title: 'The Name of the Wind', subtitle: 'Patrick Rothfuss', category: 'book', book_type: 'book', status: 'completed', rating: 5, total_pages: 662, current_page: 662, year: 2007, genre: 'Fantasy', cover: 'https://covers.openlibrary.org/b/id/8351541-L.jpg', end_date: d(5), start_date: d(22) },
      { title: 'Project Hail Mary', subtitle: 'Andy Weir', category: 'book', book_type: 'book', status: 'completed', rating: 5, total_pages: 476, current_page: 476, year: 2021, genre: 'Sci-Fi', cover: 'https://covers.openlibrary.org/b/id/12808930-L.jpg', end_date: d(30), start_date: d(45) },
      { title: 'Atomic Habits', subtitle: 'James Clear', category: 'book', book_type: 'book', status: 'in_progress', total_pages: 320, current_page: 187, year: 2018, genre: 'Self-help', cover: 'https://covers.openlibrary.org/b/id/10508183-L.jpg', start_date: d(8) },
      { title: 'Dune', subtitle: 'Frank Herbert', category: 'book', book_type: 'book', status: 'wishlist', total_pages: 688, year: 1965, genre: 'Sci-Fi', cover: 'https://covers.openlibrary.org/b/id/8832809-L.jpg' },
      { title: 'The Hitchhiker\'s Guide to the Galaxy', subtitle: 'Douglas Adams', category: 'book', book_type: 'book', status: 'completed', rating: 4, total_pages: 193, current_page: 193, year: 1979, genre: 'Sci-Fi Comedy', cover: 'https://covers.openlibrary.org/b/id/8269550-L.jpg', end_date: d(60) },
      { title: 'Fourth Wing', subtitle: 'Rebecca Yarros', category: 'book', book_type: 'book', status: 'completed', rating: 4, total_pages: 517, current_page: 517, year: 2023, genre: 'Fantasy Romance', cover: 'https://covers.openlibrary.org/b/id/13930547-L.jpg', end_date: d(15) },
      // Games
      { title: 'Elden Ring', subtitle: 'FromSoftware', category: 'game', game_platform: 'playstation', status: 'completed', rating: 5, hours_played: 87, year: 2022, genre: 'Action RPG', cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg', end_date: d(20) },
      { title: 'Hades', subtitle: 'Supergiant Games', category: 'game', game_platform: 'pc', status: 'completed', rating: 5, hours_played: 52, year: 2020, genre: 'Roguelike', cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1tmu.jpg', end_date: d(45) },
      { title: 'Baldur\'s Gate 3', subtitle: 'Larian Studios', category: 'game', game_platform: 'pc', status: 'in_progress', hours_played: 34, year: 2023, genre: 'RPG', cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co6ly2.jpg', start_date: d(12) },
      { title: 'Hollow Knight', subtitle: 'Team Cherry', category: 'game', game_platform: 'nintendo', status: 'wishlist', year: 2017, genre: 'Metroidvania', cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rgi.jpg' },
      { title: 'The Last of Us Part II', subtitle: 'Naughty Dog', category: 'game', game_platform: 'playstation', status: 'completed', rating: 4, hours_played: 25, year: 2020, genre: 'Action Adventure', cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5w2x.jpg', end_date: d(90) },
      // Films
      { title: 'Oppenheimer', subtitle: 'Christopher Nolan', category: 'film', is_series: false, status: 'completed', rating: 5, runtime: 180, year: 2023, genre: 'Drama', cover: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', end_date: d(10) },
      { title: 'Everything Everywhere All at Once', subtitle: 'Daniel Kwan, Daniel Scheinert', category: 'film', is_series: false, status: 'completed', rating: 5, runtime: 139, year: 2022, genre: 'Sci-Fi Comedy', cover: 'https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg', end_date: d(25) },
      { title: 'Dune: Part Two', subtitle: 'Denis Villeneuve', category: 'film', is_series: false, status: 'completed', rating: 4, runtime: 166, year: 2024, genre: 'Sci-Fi', cover: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', end_date: d(3) },
      { title: 'The Batman', subtitle: 'Matt Reeves', category: 'film', is_series: false, status: 'wishlist', runtime: 176, year: 2022, genre: 'Superhero', cover: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg' },
      // Series
      { title: 'The Bear', subtitle: 'FX', category: 'film', is_series: true, status: 'completed', rating: 5, year: 2022, genre: 'Drama', total_seasons: 2, current_season: 2, total_episodes: 18, current_episode: 18, cover: 'https://image.tmdb.org/t/p/w500/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg', end_date: d(7) },
      { title: 'Shogun', subtitle: 'FX', category: 'film', is_series: true, status: 'in_progress', rating: 5, year: 2024, genre: 'Historical Drama', total_seasons: 1, current_season: 1, total_episodes: 10, current_episode: 7, cover: 'https://image.tmdb.org/t/p/w500/tzMFBHlsJ2pT2FgC1FgRdm1aSv5.jpg', start_date: d(4) },
      { title: 'Arcane', subtitle: 'Netflix', category: 'film', is_series: true, status: 'completed', rating: 5, year: 2021, genre: 'Animation', total_seasons: 1, current_season: 1, total_episodes: 9, current_episode: 9, cover: 'https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg', end_date: d(50) },
    ]
    showToast(t('profile.adding_demo'), 'success')
    for (const item of DEMO) {
      try { await addItem(item) } catch {}
    }
    showToast(t('profile.demo_loaded'), 'success')
    setTimeout(() => window.location.reload(), 800)
  }

  const toggleVacation = () => {
    const todayKey = new Date().toISOString().split('T')[0]
    const next = activeVac
      ? vacations.map(v => (v.end == null ? { ...v, end: todayKey } : v))   // termina férias
      : [...vacations, { start: todayKey, end: null }]                      // inicia férias
    setVacations(next)
    localStorage.setItem('vacations', JSON.stringify(next))
  }

  const saveSteamId = async () => {
    const val = steamDraft.trim()
    setSteamErr('')

    // Se parecer um SteamID64 (17 dígitos numéricos) guarda directamente
    if (/^\d{17}$/.test(val)) {
      localStorage.setItem(`steamId_${user?.id}`, val)
      setSteamId(val)
      setEditingSteam(false)
      return
    }

    // Caso contrário, tenta resolver como vanity URL
    setResolvingId(true)
    try {
      // Extrai slug de URL completo ou usa directamente
      const slug = val.replace(/https?:\/\/steamcommunity\.com\/id\//i, '').replace(/\/$/, '')
      const d = await steamResolve(slug)
      if (d.error) throw new Error(d.error)
      localStorage.setItem(`steamId_${user?.id}`, d.steamid)
      setSteamId(d.steamid)
      setSteamDraft(d.steamid)
      setEditingSteam(false)
    } catch (e) {
      setSteamErr(t('profile.steam_error'))
    } finally {
      setResolvingId(false)
    }
  }

  const saveName = () => {
    const name = draft.trim() || 'User'
    setUserName(name)
    localStorage.setItem('userName', name)
    setEditing(false)
  }

  // Itens das categorias ativas (para as estatísticas do topo)
  const vItems = items.filter(i => enabledCats.includes(i.category))
  const completed = vItems.filter(i => i.status === 'completed').length
  const inProgress = vItems.filter(i => i.status === 'in_progress').length
  const streak = calculateStreak(vItems)

  const totalPages = items
    .filter(i => i.category === 'book')
    .reduce((s, i) => s + (i.current_page || 0), 0)
  const totalHours = items
    .filter(i => i.category === 'game')
    .reduce((s, i) => s + (i.hours_played || 0), 0)

  const totalFilmHours = (items
    .filter(i => i.category === 'film' && !i.is_series && i.runtime &&
      (i.status === 'completed' || i.status === 'in_progress'))
    .reduce((s, i) => s + (i.status === 'completed' ? i.runtime : Math.round(i.runtime / 2)), 0) / 60).toFixed(1)

  const memberSince = items.length > 0
    ? new Date(Math.min(...items.map(i => new Date(i.created_at)))).getFullYear()
    : new Date().getFullYear()

  // Sub-página de Tema (modo + cores + ícone)
  const renderTema = () => (
    <>
      <CatLabel>{t('profile.mode')}</CatLabel>
      <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 16, boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'light',  label: t('profile.light'),  icon: 'sun' },
            { id: 'dark',   label: t('profile.dark'),   icon: 'moon' },
            { id: 'system', label: t('profile.system'), icon: 'monitor' },
          ].map(opt => {
            const on = themePref === opt.id
            return (
              <button key={opt.id} onClick={() => applyTheme(opt.id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '12px 4px', borderRadius: 12, cursor: 'pointer',
                  background: 'var(--surface-2)',
                  border: `1.5px solid ${on ? 'var(--accent)' : 'transparent'}`,
                  boxShadow: on ? '0 0 8px rgba(var(--accent-rgb),0.55)' : 'none',
                  transition: 'all 0.15s',
                }}>
                <span style={{ color: on ? 'var(--accent)' : 'var(--text-muted)', display: 'flex' }}><Icon name={opt.icon} size={22} /></span>
                <span style={{ fontSize: 12, fontWeight: 800, color: on ? 'var(--accent)' : 'var(--text-muted)' }}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <CatLabel>{t('profile.theme_color')}</CatLabel>
      <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 16, boxShadow: 'var(--card-shadow)' }}>
        {!isPremium() && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{t('profile.premium_color_hint')}</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--purple-light)', padding: '3px 9px', borderRadius: 20 }}>👑 Premium</span>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {ACCENT_LIST.map(a => {
            const on = accent === a.id
            return (
              <button key={a.id} onClick={() => chooseAccent(a.id)}
                style={{ position: 'relative', width: 42, height: 42, borderRadius: '50%', cursor: 'pointer', border: 'none', padding: 0,
                  background: `linear-gradient(135deg, ${a.cat.film}, ${a.cat.game}, ${a.cat.book})`,
                  opacity: !isPremium() ? 0.5 : 1,
                  boxShadow: on ? `0 0 0 3px var(--surface), 0 0 0 5px ${a.accent}` : 'none',
                  transition: 'box-shadow 0.15s' }}>
                {on && isPremium() && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                )}
                {!isPremium() && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><Icon name="lock" size={13} strokeWidth={2.4} /></span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )

  // Sub-página de Idioma
  const renderIdioma = () => {
    const langs = [
      { id: 'en', label: 'English',   cc: 'gb', available: true },
      { id: 'pt', label: 'Português', cc: 'pt', available: true },
      { id: 'es', label: 'Español',   cc: 'es', available: true },
      { id: 'fr', label: 'Français',  cc: 'fr', available: true },
      { id: 'de', label: 'Deutsch',   cc: 'de', available: true },
    ]
    const selectLang = (l) => {
      if (!l.available) return
      setLang(l.id)
      const keyMap = { en: 'lang_set_en', pt: 'lang_set_pt', es: 'lang_set_es', fr: 'lang_set_fr', de: 'lang_set_de' }
      showToast(t(`profile.${keyMap[l.id]}`), 'success')
    }
    return (
      <>
        <CatLabel>{t('profile.choose_language')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
          {langs.map((l, i) => (
            <div key={l.id} onClick={() => selectLang(l)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              opacity: l.available ? 1 : 0.6,
              cursor: l.available ? 'pointer' : 'default',
            }}>
              <img src={`https://flagcdn.com/w40/${l.cc}.png`} width="28" height="20" style={{ borderRadius: 3, objectFit: 'cover' }} alt={l.label} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{l.label}</span>
              {!l.available
                ? <SoonBadge />
                : lang === l.id
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : null}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '14px 30px 0', lineHeight: 1.5 }}>
          {t('profile.languages_coming')}
        </p>
      </>
    )
  }

  // Sub-página de Notificações
  const renderNotificacoes = () => {
    const opts = [
      { key: 'daily',  icon: 'bell',     title: t('profile.notif_daily'),  desc: t('profile.notif_daily_desc') },
      { key: 'streak', icon: 'flame',    title: t('profile.notif_streak'), desc: t('profile.notif_streak_desc') },
      { key: 'news',   icon: 'sparkles', title: t('profile.notif_news'),   desc: t('profile.notif_news_desc') },
    ]
    return (
      <>
        <CatLabel>{t('profile.notif_preferences')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
          {opts.map((o, i) => (
            <button key={o.key} onClick={() => toggleNotif(o.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name={o.icon} size={20} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{o.title}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.4 }}>{o.desc}</span>
              </span>
              <Toggle on={notif[o.key]} />
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '14px 30px 0', lineHeight: 1.5 }}>
          {t('profile.notif_coming')}
        </p>
      </>
    )
  }

  // Sub-página de Dados & Nuvem
  const renderDados = () => (
    <>
      <CatLabel>{t('profile.backup')}</CatLabel>
      <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
        <button onClick={exportData}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="upload" size={20} /></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.export_data')}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t('profile.export_data_desc', { n: items.length })}</span>
          </span>
          <Chevron />
        </button>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', width: '100%', cursor: importing ? 'default' : 'pointer', textAlign: 'left', borderTop: '1px solid var(--border)', opacity: importing ? 0.6 : 1 }}>
          <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="download" size={20} /></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{importing ? t('profile.importing') : t('profile.import_data')}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t('profile.import_data_desc')}</span>
          </span>
          <Chevron />
          <input type="file" accept="application/json,.json" disabled={importing}
            onChange={e => importData(e.target.files?.[0])} style={{ display: 'none' }} />
        </label>
      </div>

      <CatLabel>{t('profile.cloud')}</CatLabel>
      <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: 20, boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="cloud" size={20} /></span>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{t('profile.cloud_sync')}</span>
          </span>
          <SoonBadge />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('profile.cloud_sync_desc')}
        </p>
      </div>
    </>
  )

  // Sub-página: Importar de outras apps
  const renderImportApps = () => {
    const APPS = [
      {
        id: 'goodreads', name: 'Goodreads', initial: 'G', color: '#382110', bg: '#F4ECD8',
        cat: 'book', catLabel: 'Books',
        desc: 'Import read, reading, and wishlist books.',
        instruction: 'goodreads.com → My Books → Import and export → Export Library',
        onImport: importGoodreads,
      },
      {
        id: 'storygraph', name: 'StoryGraph', initial: 'S', color: '#3B1F5E', bg: '#EDE8F6',
        cat: 'book', catLabel: 'Books',
        desc: 'Import your library and reading status.',
        instruction: 'app.thestorygraph.com → Account → Import/Export → Export',
        onImport: importStorygraph,
      },
      {
        id: 'letterboxd', name: 'Letterboxd', initial: 'L', color: '#00C030', bg: '#E6F9EC',
        cat: 'film', catLabel: 'Films',
        desc: 'Import watched films, ratings, and dates.',
        instruction: 'letterboxd.com → Settings → Import & Export → Export your data → extract films.csv from ZIP',
        onImport: importLetterboxd,
      },
      {
        id: 'trakt', name: 'Trakt', initial: 'T', color: '#ED1C24', bg: '#FDECEA',
        cat: 'film', catLabel: 'Films & Series',
        desc: 'Import watched films and series with ratings.',
        instruction: 'trakt.tv → Settings → Data → Export Data → use movies/watched.csv or shows/watched.csv',
        onImport: importTrakt,
      },
      {
        id: 'backloggd', name: 'Backloggd', initial: 'B', color: '#4A90D9', bg: '#E8F2FC',
        cat: 'game', catLabel: 'Games',
        desc: 'Import played, playing, and backlog games.',
        instruction: 'backloggd.com → Profile → Export → CSV',
        onImport: importBackloggd,
      },
    ]
    return (
      <>
        <CatLabel>{t('profile.supported_apps')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '4px 16px', boxShadow: 'var(--card-shadow)' }}>
          {APPS.map((app, i) => {
            const st = appImport[app.id]
            return (
              <label key={app.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                cursor: st?.status === 'loading' ? 'default' : 'pointer',
                opacity: st?.status === 'loading' ? 0.6 : 1,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: app.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: app.color, flexShrink: 0 }}>
                  {app.initial}
                </div>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{app.name}</span>
                {st?.status === 'loading' && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{st.done}/{st.total}</span>}
                {st?.status === 'done' && <span style={{ color: '#2DB87A', display: 'flex' }}><Icon name="trophy" size={16} strokeWidth={2.2} /></span>}
                {st?.status === 'error' && <span style={{ fontSize: 11, color: '#FF4757', fontWeight: 700 }}>Error</span>}
                {(!st || st.status === 'done') && <Chevron />}
                <input type="file" accept=".csv,text/csv" disabled={st?.status === 'loading'}
                  onChange={e => { if (e.target.files?.[0]) app.onImport(e.target.files[0]); e.target.value = '' }}
                  style={{ display: 'none' }} />
              </label>
            )
          })}
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '16px 30px 0', lineHeight: 1.5 }}>
          {t('profile.import_apps_contact')}
        </p>
      </>
    )
  }

  // Sub-página de Suporte
  const renderSuporte = () => {
    const rows = [
      { icon: 'mail', title: t('profile.contact_dev'), desc: t('profile.contact_dev_desc'), href: 'mailto:lucky.echo.origins@gmail.com?subject=Vyllo%20—%20Contact' },
      { icon: 'bug',  title: t('profile.report_bug'),  desc: t('profile.report_bug_desc'),  href: 'mailto:lucky.echo.origins@gmail.com?subject=Vyllo%20—%20Bug' },
      { icon: 'star', title: t('profile.rate_app'),    desc: t('profile.rate_app_desc'),    href: 'https://play.google.com/store/apps/details?id=com.vyllo_app.twa' },
    ]
    return (
      <>
        <CatLabel>{t('profile.help_feedback')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
          {rows.map((r, i) => (
            <a key={r.title} href={r.href} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', textDecoration: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name={r.icon} size={20} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{r.desc}</span>
              </span>
              <Chevron />
            </a>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '14px 30px 0', lineHeight: 1.5 }}>
          lucky.echo.origins@gmail.com
        </p>
      </>
    )
  }

  // Sub-página Legal & Licenças
  const renderLegal = () => {
    const rows = [
      { icon: 'lock', title: t('profile.privacy_policy'), desc: t('profile.privacy_policy_desc'), page: 'privacy' },
      { icon: 'file', title: t('profile.terms_of_use'),   desc: t('profile.terms_of_use_desc'),   page: 'terms' },
    ]
    return (
      <>
        <CatLabel>{t('profile.documents')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
          {rows.map((r, i) => (
            <button key={r.title} onClick={() => setSubPage(r.page)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name={r.icon} size={20} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{r.desc}</span>
              </span>
              <Chevron />
            </button>
          ))}
        </div>

        <CatLabel>{t('profile.data_attributions')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '16px', boxShadow: 'var(--card-shadow)' }}>
          <p style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, lineHeight: 1.6, marginBottom: 6 }}>
            Films & series
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            Series information and episode dates by TVmaze. When enabled, data and images by TMDB (this app uses the TMDB API but is not endorsed or certified by TMDB).
          </p>
          <p style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, lineHeight: 1.6, marginBottom: 6 }}>
            Games
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            Game data and images by RAWG and Steam. Steam achievements belong to Valve Corporation.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, lineHeight: 1.6, marginBottom: 6 }}>
            Books & other
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Book data by Open Library. Additional series information by TVmaze and Wikipedia (CC BY-SA). Covers and trademarks belong to their respective owners.
          </p>
        </div>

        <CatLabel>{t('profile.technology')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '16px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['React', 'Vite', 'Node/Express', 'sql.js', 'TVmaze', 'TMDB', 'RAWG', 'Steam', 'Open Library', 'Wikipedia'].map(l => (
              <span key={l} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--purple-light)', padding: '5px 12px', borderRadius: 20 }}>{l}</span>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '14px 30px 0', lineHeight: 1.5 }}>
          Vyllo · Version 1.0.0
        </p>
      </>
    )
  }

  // Sub-página: Privacy policy
  const renderPrivacy = () => (
    <div style={{ padding: '8px 24px 0' }}>
      <LegalText>
        {`Last updated: June 2026\n\n`}
        <b>1. Who we are</b>{`\nVyllo is a personal collection tracker for books, games, and films/series. The data controller is the entity operating Vyllo (contact: support@vyllo-app.com).\n\n`}
        <b>2. What data we collect</b>{`\n• Your collection content: titles, status, progress, ratings, notes and completion dates.\n• Preferences and settings: theme, language, active categories, annual goals — stored locally on your device.\n• SteamID (optional), only if you choose to connect your Steam account for achievement sync.\n• Anonymous, aggregated usage data to improve the app, not linked to your identity.\nWe do not collect your real name, address, phone number, or payment details within the app.\n\n`}
        <b>3. How and where we store your data</b>{`\nYour collection, settings, and goals are stored locally (on your device or the app's private server). We do not sell, share, or rent your personal data to third parties for advertising or commercial purposes.\n\n`}
        <b>4. Third-party services</b>{`\nTo fetch covers, titles, and metadata, the app queries third-party services: TVmaze, RAWG, Steam (Valve Corporation), Open Library, Wikipedia (CC BY-SA), and optionally TMDB. When you use AI search, an external service receives only the search term — never your account data. These services have their own privacy policies.\n\n`}
        <b>5. Premium subscription</b>{`\nIf you purchase Vyllo Premium, payment is processed by the app store (App Store / Google Play). Vyllo does not store credit card data. Subscription status is verified locally.\n\n`}
        <b>6. Your rights (GDPR)</b>{`\nIf you reside in the European Economic Area, you have the right to access, rectify, export, and delete your data. You can export your entire collection at Settings → Data & Cloud, and delete items individually at any time. For full deletion requests or other GDPR matters, contact support@vyllo-app.com.\n\n`}
        <b>7. Children</b>{`\nVyllo is not intended for children under 13. We do not knowingly collect data from children.\n\n`}
        <b>8. Cookies and tracking</b>{`\nThe app does not use tracking cookies or behavioral advertising.\n\n`}
        <b>9. Changes to this policy</b>{`\nWe may update this privacy policy. For material changes, we will notify you through the app. The revision date is shown at the top of this document.`}
      </LegalText>
    </div>
  )

  // Sub-página: Termos de utilização
  const renderTerms = () => (
    <div style={{ padding: '8px 24px 0' }}>
      <LegalText>
        {`Last updated: June 2026\n\n`}
        <b>1. Acceptance of terms</b>{`\nBy installing or using Vyllo, you fully accept these Terms of Use and our Privacy Policy. If you do not agree, you must stop using the app.\n\n`}
        <b>2. License</b>{`\nYou are granted a personal, non-exclusive, non-transferable, revocable license to use Vyllo solely for personal, non-commercial purposes, in accordance with these terms.\n\n`}
        <b>3. Third-party content</b>{`\nCovers, titles, logos, trademarks, and metadata displayed in the app belong to their respective rights holders (publishers, studios, distributors, etc.) and are used only to identify your personal collection. Vyllo makes no claim of ownership over such content.\n\n`}
        <b>4. Your data</b>{`\nYou are solely responsible for the content you enter (titles, ratings, notes, etc.). We recommend regular exports as backups. Vyllo cannot be held liable for data loss resulting from device or app failures.\n\n`}
        <b>5. Premium subscription</b>{`\nSome features (unlimited collection, annual goals, advanced stats, themes, achievements, sharing and shuffle) require a Vyllo Premium subscription. Available plans:\n• Monthly — €2.99/month, with a 7-day free trial.\n• Annual — €14.99/year (≈ €1.25/month), with 7 days free.\n• Lifetime — €34.99, one-time payment, permanent access.\nPayment is processed and managed by the app store (App Store or Google Play). Refunds follow that store's policy. You may cancel a recurring subscription at any time through the store settings; access continues until the end of the paid period.\n\n`}
        <b>6. Acceptable use</b>{`\nYou agree not to use Vyllo for illegal purposes, resale, reverse engineering, or to unduly overload the external services integrated in the app.\n\n`}
        <b>7. Updates and availability</b>{`\nVyllo may be updated or discontinued at any time. We do not guarantee uninterrupted availability or the full accuracy of data obtained from external sources.\n\n`}
        <b>8. Limitation of liability</b>{`\nThe app is provided "as is" and "as available," without warranties of any kind, express or implied. To the maximum extent permitted by law, Vyllo is not liable for indirect, incidental, or consequential damages arising from the use or inability to use the app.\n\n`}
        <b>9. Changes to these terms</b>{`\nWe may revise these terms periodically. We will notify users of material changes. Continued use of the app after new versions are published constitutes acceptance of the revised terms.\n\n`}
        <b>10. Contact</b>{`\nFor questions about these terms: support@vyllo-app.com`}
      </LegalText>
    </div>
  )

  return (
    <div className="screen">
      <div className="screen-content">
        {/* Header */}
        <div style={{ position: 'relative', background: 'linear-gradient(160deg, var(--accent), var(--accent-2))', padding: 'calc(env(safe-area-inset-top) + 32px) 20px 40px', textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, fontWeight: 900, color: 'white',
            margin: '0 auto 12px',
            border: '3px solid rgba(255,255,255,0.4)',
            backdropFilter: 'blur(4px)',
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>

          {editing ? (
            <div style={{ display: 'flex', gap: 8, maxWidth: 240, margin: '0 auto' }}>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                autoFocus
                style={{ flex: 1, textAlign: 'center', borderRadius: 10, border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 12px', fontSize: 15, fontWeight: 700 }}
              />
              <button onClick={saveName} style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', color: 'var(--accent)', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 13, fontFamily: 'Nunito' }}>
                OK
              </button>
            </div>
          ) : (
            <div>
              <h2 style={{ color: 'white', fontSize: 22 }}>{userName}</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>{t('profile.member_since', { year: memberSince })}</p>
              <button
                onClick={() => { setDraft(userName); setEditing(true) }}
                style={{ marginTop: 10, background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 20, padding: '6px 16px', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', border: '1px solid rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="pencil" size={13} strokeWidth={2.4} /> {t('profile.edit_name')}
              </button>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', margin: '-20px 20px 0', gap: 10, position: 'relative', zIndex: 1 }}>
          {[
            { value: vItems.length, label: t('profile.total'),       status: 'all',         color: 'var(--accent)' },
            { value: inProgress,   label: t('profile.in_progress'), status: 'in_progress', color: 'var(--accent)' },
            { value: completed,    label: t('profile.completed'),   status: 'completed',   color: '#2DB87A' },
          ].map(({ value, label, status, color }) => (
            <button key={label} onClick={() => onNavigate && onNavigate('all', status)}
              style={{ flex: 1, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 14, padding: '14px 8px', textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color }}><StatusIcon status={status} size={18} strokeWidth={2.2} /></div>
              <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>{value}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{label}</p>
            </button>
          ))}
        </div>

        {/* ── Definições (inline, na própria página) ── */}
        {subPage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px 4px' }}>
            <button onClick={() => setSubPage((subPage === 'privacy' || subPage === 'terms') ? 'legal' : null)} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <h1 style={{ fontSize: 19 }}>{{ theme: t('profile.subpage_theme'), language: t('profile.subpage_language'), notifications: t('profile.subpage_notifications'), data: t('profile.subpage_data'), 'import-apps': t('profile.subpage_import_apps'), support: t('profile.subpage_support'), legal: t('profile.subpage_legal'), privacy: t('profile.subpage_privacy'), terms: t('profile.subpage_terms') }[subPage]}</h1>
          </div>
        )}

          {/* ── Sub-página: Tema ── */}
          {subPage === 'theme' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderTema()}
          </div>
          )}

          {/* ── Sub-página: Idioma ── */}
          {subPage === 'language' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderIdioma()}
          </div>
          )}

          {/* ── Sub-página: Notificações ── */}
          {subPage === 'notifications' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderNotificacoes()}
          </div>
          )}

          {/* ── Sub-página: Importar de outras apps ── */}
          {subPage === 'import-apps' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderImportApps()}
          </div>
          )}

          {/* ── Sub-página: Dados & Nuvem ── */}
          {subPage === 'data' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderDados()}
          </div>
          )}

          {/* ── Sub-página: Suporte ── */}
          {subPage === 'support' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderSuporte()}
          </div>
          )}

          {/* ── Sub-página: Legal & Licenças ── */}
          {subPage === 'legal' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderLegal()}
          </div>
          )}

          {/* ── Sub-página: Privacidade ── */}
          {subPage === 'privacy' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderPrivacy()}
          </div>
          )}

          {/* ── Sub-página: Termos ── */}
          {subPage === 'terms' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
            {renderTerms()}
          </div>
          )}

          {/* ── Lista principal de definições ── */}
          {!subPage && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>

        <CatLabel>{t('profile.accounts')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
          {/* Vyllo */}
          {user ? (
            <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--purple-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Icon name="shield" size={17} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Vyllo</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                </div>
                <button onClick={onSignOut} style={{ padding: '6px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer', flexShrink: 0 }}>
                  {t('profile.sign_out')}
                </button>
              </div>
              {premium && (
                <button onClick={manageSubscription} style={{ marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 12, border: '1.5px solid var(--border)', background: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Icon name="crown" size={13} strokeWidth={2.2} />
                  👑 Gerir subscrição Premium
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--purple-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Icon name="shield" size={17} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Vyllo</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('profile.not_signed_in')}</p>
                </div>
                <button onClick={onShowAuth} style={{ padding: '6px 12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer', flexShrink: 0 }}>
                  {t('profile.sign_in')}
                </button>
              </div>
            </div>
          )}

          {/* Steam */}
          <div style={{ padding: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#171A21', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#C7D5E0">
                  <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Steam</p>
                <p style={{ fontSize: 11, color: steamId ? '#2DB87A' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {steamId ? `ID: ${steamId}` : t('profile.no_account_connected')}
                </p>
              </div>
              {steamId ? (
                <button onClick={() => { setSteamId(''); setSteamDraft(''); setEditingSteam(false); setSteamErr(''); localStorage.removeItem(`steamId_${user?.id}`) }}
                  style={{ padding: '6px 12px', borderRadius: 10, border: '1.5px solid #FF4757', background: 'none', color: '#FF4757', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer', flexShrink: 0 }}>
                  {t('profile.disconnect')}
                </button>
              ) : (
                <button onClick={() => setEditingSteam(true)}
                  style={{ padding: '6px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito', cursor: 'pointer', flexShrink: 0 }}>
                  {t('profile.connect')}
                </button>
              )}
            </div>
            {editingSteam && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={steamDraft} onChange={e => setSteamDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveSteamId()}
                  placeholder={t('profile.steam_placeholder')}
                  style={{ fontSize: 13 }} autoFocus
                />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {t('profile.steam_hint')}
                </p>
                {steamErr && <p style={{ color: '#FF4757', fontSize: 12 }}>{steamErr}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setEditingSteam(false); setSteamErr('') }} style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 12, padding: 10, color: 'var(--text-muted)', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito' }}>
                    {t('profile.cancel')}
                  </button>
                  <button onClick={saveSteamId} disabled={resolvingId || !steamDraft.trim()}
                    style={{ flex: 2, background: resolvingId ? 'var(--surface-2)' : '#171A21', color: resolvingId ? 'var(--text-muted)' : 'white', borderRadius: 12, padding: 10, fontSize: 13, fontWeight: 700, fontFamily: 'Nunito' }}>
                    {resolvingId ? t('profile.resolving') : t('profile.save')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <CatLabel>{t('profile.general')}</CatLabel>
        {/* Mostrar percentagem nas barras de progresso */}
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '14px 16px', boxShadow: 'var(--card-shadow)' }}>
          <button onClick={toggleShowPct}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', cursor: 'pointer' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="chart" size={20} /></span>
              <span style={{ textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.show_percentage')}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t('profile.show_percentage_desc')}</span>
              </span>
            </span>
            <span style={{ width: 46, height: 26, borderRadius: 14, flexShrink: 0, background: showPct ? 'var(--accent)' : '#C7C7D1', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 3, left: showPct ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.22s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
            </span>
          </button>
        </div>
        <NavRow icon="bell" title={t('profile.notifications')} desc={t('profile.notifications_desc')} onClick={() => setSubPage('notifications')} />
        <NavRow icon="target" title={t('profile.annual_goals')} desc={t('profile.annual_goals_desc')} onClick={() => { if (onEditGoals) onEditGoals() }} />

        {/* Categorias ativas */}
        <CatLabel>{t('profile.categories')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
          {CATEGORY_IDS.map((id, i) => {
            const on = enabledCats.includes(id)
            return (
              <button key={id} onClick={() => toggleCategory(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ color: CAT_COLOR[id], display: 'flex' }}><CategoryIcon cat={id} size={20} /></span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{CAT_LABEL[id]}</span>
                <Toggle on={on} />
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: '10px 30px 0', lineHeight: 1.5 }}>
          {t('profile.categories_hint')}
        </p>

        {/* Tab: Tema */}
        <CatLabel>{t('profile.appearance')}</CatLabel>
        <button onClick={() => setSubPage('theme')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: 'calc(100% - 40px)', margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--card-shadow)', cursor: 'pointer', textAlign: 'left', border: 'none' }}>
          <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="palette" size={22} /></span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{t('profile.theme')}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('profile.theme_desc')}</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>

        {/* Tab: Language */}
        <button onClick={() => setSubPage('language')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: 'calc(100% - 40px)', margin: '10px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--card-shadow)', cursor: 'pointer', textAlign: 'left', border: 'none' }}>
          <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="globe" size={22} /></span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{t('profile.language')}</p>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <img src={`https://flagcdn.com/w40/${{ en: 'gb', pt: 'pt', es: 'es', fr: 'fr', de: 'de' }[lang] || 'gb'}.png`} width="18" height="13" style={{ borderRadius: 2, objectFit: 'cover' }} alt="" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{{ en: 'English', pt: 'Português', es: 'Español', fr: 'Français', de: 'Deutsch' }[lang] || 'English'}</span>
            </span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>

        <CatLabel>{t('profile.streak')}</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '6px 16px', boxShadow: 'var(--card-shadow)' }}>
          {/* Week start */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.week_start')}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'sunday', label: t('profile.sunday') }, { id: 'monday', label: t('profile.monday') }].map(opt => {
                const on = weekStart === opt.id
                return (
                  <button key={opt.id} onClick={() => setWeekStart(opt.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 10, cursor: 'pointer',
                      fontSize: 12, fontWeight: 800, fontFamily: 'Nunito',
                      background: on ? 'var(--accent)' : 'var(--surface-2)',
                      color: on ? 'white' : 'var(--text-muted)',
                      border: 'none',
                    }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Vacation mode */}
          <button onClick={toggleVacation}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ color: activeVac ? '#2DB87A' : 'var(--accent)', display: 'flex' }}><Icon name="beach" size={20} strokeWidth={2.2} /></span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('profile.vacation_mode')}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {activeVac
                  ? t('profile.vacation_active_desc', { date: new Date(activeVac.start).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short' }) })
                  : t('profile.vacation_mode_desc')}
              </span>
            </span>
            <Toggle on={!!activeVac} />
          </button>
        </div>

        <CatLabel>Data</CatLabel>
        <NavRow icon="database" title="Data & Cloud" desc="Export, import and sync" onClick={() => setSubPage('data')} />
        <NavRow icon="download" title="Import from other apps" desc="Goodreads, StoryGraph, Letterboxd…" onClick={() => setSubPage('import-apps')} />

        <CatLabel>Help</CatLabel>
        <NavRow icon="message" title="Support" desc="Contact, issues and review" onClick={() => setSubPage('support')} />
        <NavRow icon="scroll" title="Legal & Licenses" desc="Privacy, terms and open-source" onClick={() => setSubPage('legal')} />

        <CatLabel>About</CatLabel>
        <div style={{ margin: '8px 20px 0', background: 'var(--purple-light)', borderRadius: 16, padding: 20 }}>
          <h2 style={{ fontSize: 15, color: 'var(--accent)', marginBottom: 8 }}>Vyllo</h2>
          <p style={{ fontSize: 13, color: 'var(--accent)', opacity: 0.8, lineHeight: 1.5 }}>
            Your personal tracker for books, games, and films. Follow your progress and build your collection.
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Version 1.0.0</p>
        </div>

        {/* Dev: seed demo data */}
        {import.meta.env.DEV && (
        <div style={{ margin: '10px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '14px 16px', boxShadow: 'var(--card-shadow)' }}>
          <button onClick={seedDemoData}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', cursor: 'pointer' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🌱</span>
              <span style={{ textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Load demo data</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Add sample items for screenshots</span>
              </span>
            </span>
          </button>
        </div>
        )}

          </div>
          )}
      </div>
    </div>
  )
}

function SoonBadge() {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
      color: 'var(--accent)', background: 'var(--purple-light)', padding: '3px 9px', borderRadius: 20,
    }}>
      Soon
    </span>
  )
}

function Toggle({ on }) {
  return (
    <span style={{ width: 46, height: 26, borderRadius: 14, flexShrink: 0, background: on ? 'var(--accent)' : '#C7C7D1', position: 'relative', transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.22s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
    </span>
  )
}

function LegalText({ children }) {
  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
      {children}
    </div>
  )
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
  )
}

// Linha de navegação para uma sub-página de definições
function NavRow({ icon, title, desc, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: 'calc(100% - 40px)', margin: '10px 20px 0', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--card-shadow)', cursor: 'pointer', textAlign: 'left', border: 'none' }}>
      <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name={icon} size={22} /></span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{title}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</p>
      </div>
      <Chevron />
    </button>
  )
}

function CatLabel({ children }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase',
      color: 'var(--text-muted)', margin: '22px 24px 4px',
    }}>
      {children}
    </p>
  )
}
