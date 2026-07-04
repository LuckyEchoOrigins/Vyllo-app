// ── Metas anuais ────────────────────────────────────────────────────────────
export const getYearGoals = () => { try { return JSON.parse(localStorage.getItem('yearGoals') || '{}') } catch { return {} } }
export const saveYearGoals = (g) => { try { localStorage.setItem('yearGoals', JSON.stringify(g)) } catch {} }

// Itens concluídos neste ano civil para uma categoria
export const goalDoneThisYear = (items, cat) => {
  const year = new Date().getFullYear()
  return items.filter(i =>
    i.category === cat && i.status === 'completed' &&
    new Date(i.end_date || i.updated_at || i.created_at).getFullYear() === year
  ).length
}

// Retorna { done, goal, pct, behind, onTrack, achieved } ou null
export const goalStatus = (done, goal) => {
  if (!goal || goal <= 0) return null
  const now = new Date()
  const dayOfYear = Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 86400000)
  const expected = Math.round(goal * dayOfYear / 365)
  const behind = Math.max(0, expected - done)
  return {
    done, goal,
    pct: Math.min(100, Math.round(done / goal * 100)),
    behind,
    onTrack: behind === 0,
    achieved: done >= goal,
  }
}

// Cores das categorias — extraídas do "V" do logo (roxo, magenta, laranja)
export const CAT_COLOR = {
  book: '#7C3AED',   // roxo
  game: '#E0459E',   // magenta/rosa
  film: '#F7901E',   // laranja
}

// ── Premium (feature flags) ─────────────────────────────────────────────────
export const isPremium = () => { try { return localStorage.getItem('premium') === '1' } catch { return false } }
export const setPremium = (v) => {
  try { localStorage.setItem('premium', v ? '1' : '0') } catch {}
  window.dispatchEvent(new Event('premium-change'))
}
// Abre o modal de upsell para uma feature específica
export const openPremium = (feature = '') => {
  window.dispatchEvent(new CustomEvent('open-premium', { detail: { feature } }))
}
// Usar para "trancar" features: devolve true se já é premium; senão abre o upsell e devolve false
export const requirePremium = (feature = '') => {
  if (isPremium()) return true
  openPremium(feature)
  return false
}

// Jogo com 100% das proezas/conquistas desbloqueadas (Steam persistido ou consola manual)
export function hasAllAchievements(item) {
  if (!item || item.category !== 'game') return false
  if (item.manual_achievements) {
    try {
      const a = JSON.parse(item.manual_achievements)
      if (Array.isArray(a) && a.length > 0) return a.every(x => x.unlocked)
    } catch {}
  }
  if (item.ach_total > 0) return item.ach_unlocked >= item.ach_total
  return false
}

export const CAT_LIGHT = {
  book: '#EDE8FF',   // roxo claro
  game: '#FCE3F0',   // magenta claro
  film: '#FEF3E0',   // laranja claro
}

export const CAT_EMOJI = {
  book: '📖',
  game: '🎮',
  film: '🎬',
}

export const BOOK_TYPE_INFO = {
  book:      { emoji: '📖', label: 'Book' },
  ebook:     { emoji: '📱', label: 'Ebook' },
  audiobook: { emoji: '🎧', label: 'Audiobook' },
}

export const CAT_LABEL = {
  book: 'Book',
  game: 'Game',
  film: 'Film/Series',
}

// ── Normalização de géneros — canonical key is English ──
const GENRE_MAP = {
  'action': 'Action', 'ação': 'Action',
  'adventure': 'Adventure', 'aventura': 'Adventure',
  'rpg': 'RPG', 'role-playing': 'RPG', 'role playing games (rpg)': 'RPG', 'role-playing games (rpg)': 'RPG', 'jrpg': 'RPG',
  'shooter': 'Shooter', 'tiros': 'Shooter', 'fps': 'Shooter', 'first-person shooter': 'Shooter', 'third-person shooter': 'Shooter', 'atirador em primeira pessoa': 'Shooter', 'atirador': 'Shooter',
  'strategy': 'Strategy', 'estratégia': 'Strategy',
  'indie': 'Indie',
  'sports': 'Sports', 'desporto': 'Sports',
  'racing': 'Racing', 'corridas': 'Racing',
  'puzzle': 'Puzzle',
  'platformer': 'Platformer', 'platform': 'Platformer', 'plataformas': 'Platformer',
  'fighting': 'Fighting', 'luta': 'Fighting',
  'simulation': 'Simulation', 'simulação': 'Simulation',
  'casual': 'Casual',
  'arcade': 'Arcade',
  'sandbox': 'Sandbox', 'sandbox 2d': 'Sandbox',
  'metroidvania': 'Metroidvania',
  'survival': 'Survival', 'sobrevivência': 'Survival',
  'horror': 'Horror', 'terror': 'Horror',
  'comedy': 'Comedy', 'comédia': 'Comedy',
  'crime': 'Crime',
  'documentary': 'Documentary', 'documentário': 'Documentary',
  'drama': 'Drama',
  'family': 'Family', 'família': 'Family',
  'fantasy': 'Fantasy', 'fantasia': 'Fantasy',
  'history': 'History', 'história': 'History',
  'music': 'Music', 'música': 'Music', 'musical': 'Music',
  'mystery': 'Mystery', 'mistério': 'Mystery',
  'romance': 'Romance',
  'science fiction': 'Sci-Fi', 'sci-fi': 'Sci-Fi', 'sci fi': 'Sci-Fi', 'ficção científica': 'Sci-Fi', 'ficção-científica': 'Sci-Fi',
  'thriller': 'Thriller', 'suspense': 'Thriller',
  'war': 'War', 'guerra': 'War',
  'western': 'Western', 'faroeste': 'Western',
  'animation': 'Animation', 'animação': 'Animation', 'anime': 'Animation',
  'biography': 'Biography', 'biografia': 'Biography',
  'co-op': 'Co-op', 'cooperativo': 'Co-op', 'multiplayer': 'Multiplayer', 'massively multiplayer': 'Multiplayer',
}

const GENRE_PT = {
  'Action': 'Ação', 'Adventure': 'Aventura', 'RPG': 'RPG', 'Shooter': 'Tiros',
  'Strategy': 'Estratégia', 'Indie': 'Indie', 'Sports': 'Desporto', 'Racing': 'Corridas',
  'Puzzle': 'Puzzle', 'Platformer': 'Plataformas', 'Fighting': 'Luta', 'Simulation': 'Simulação',
  'Casual': 'Casual', 'Arcade': 'Arcade', 'Sandbox': 'Sandbox', 'Metroidvania': 'Metroidvania',
  'Survival': 'Sobrevivência', 'Horror': 'Terror', 'Comedy': 'Comédia', 'Crime': 'Crime',
  'Documentary': 'Documentário', 'Drama': 'Drama', 'Family': 'Família', 'Fantasy': 'Fantasia',
  'History': 'História', 'Music': 'Música', 'Mystery': 'Mistério', 'Romance': 'Romance',
  'Sci-Fi': 'Ficção Científica', 'Thriller': 'Thriller', 'War': 'Guerra', 'Western': 'Western',
  'Animation': 'Animação', 'Biography': 'Biografia', 'Co-op': 'Cooperativo', 'Multiplayer': 'Multijogador',
}

const capWords = (s) => s.trim().replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1))

export function normalizeGenre(g) {
  if (!g) return g
  const key = g.trim().toLowerCase()
  if (GENRE_MAP[key]) return GENRE_MAP[key]
  const parts = key.split(/\s*[/,&-]\s*|\s+e\s+/).map(p => p.trim()).filter(Boolean)
  const mapped = [...new Set(parts.map(p => GENRE_MAP[p] || capWords(p)))].sort()
  return mapped.join('/')
}

export function translateGenre(g, lang) {
  if (!g || lang !== 'pt') return g
  return g.split('/').map(part => GENRE_PT[part] || part).join('/')
}

// ── Categorias ativas (o utilizador pode esconder as que não usa) ──
export const CATEGORY_IDS = ['book', 'game', 'film']

export function getEnabledCategories() {
  try {
    const v = JSON.parse(localStorage.getItem('enabledCategories'))
    if (Array.isArray(v) && v.length) return v.filter(c => CATEGORY_IDS.includes(c))
  } catch {}
  return [...CATEGORY_IDS]
}

export function setEnabledCategories(arr) {
  const clean = CATEGORY_IDS.filter(c => arr.includes(c))
  const final = clean.length ? clean : [...CATEGORY_IDS]   // nunca menos de 1
  localStorage.setItem('enabledCategories', JSON.stringify(final))
  return final
}

// ── Listas personalizadas (guardadas localmente) ──
// Modelo: [{ id, name, itemIds: [] }]
export function getLists() {
  try {
    const v = JSON.parse(localStorage.getItem('customLists'))
    if (Array.isArray(v)) return v
  } catch {}
  return []
}

export function saveLists(lists) {
  localStorage.setItem('customLists', JSON.stringify(lists))
  return lists
}

export function createList(name) {
  const lists = getLists()
  const list = { id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || 'Nova lista', itemIds: [] }
  saveLists([...lists, list])
  return list
}

export function deleteList(id) {
  return saveLists(getLists().filter(l => l.id !== id))
}

export function renameList(id, name) {
  return saveLists(getLists().map(l => l.id === id ? { ...l, name: name.trim() || l.name } : l))
}

export function toggleItemInList(listId, itemId) {
  return saveLists(getLists().map(l => {
    if (l.id !== listId) return l
    const has = l.itemIds.includes(itemId)
    return { ...l, itemIds: has ? l.itemIds.filter(x => x !== itemId) : [...l.itemIds, itemId] }
  }))
}

export function getListsForItem(itemId) {
  return getLists().filter(l => l.itemIds.includes(itemId)).map(l => l.id)
}

export const STATUS_LABEL = {
  wishlist: 'Waiting',
  in_progress: 'In progress',
  completed: 'Completed',
  abandoned: 'Abandoned',
}

export const STATUS_COLOR = {
  wishlist: { bg: 'var(--surface-2)', text: '#8E8EA0' },
  in_progress: { bg: 'var(--purple-light)', text: '#6C47FF' },
  completed: { bg: 'var(--green-light)', text: '#2DB87A' },
  abandoned: { bg: 'var(--red-light)', text: '#FF4757' },
}

export const wishlistLabel = (cat, bookType) => {
  if (cat === 'book') {
    if (bookType === 'audiobook') return 'Want to listen'
    if (bookType === 'ebook') return 'Want to read (ebook)'
    return 'Want to read'
  }
  if (cat === 'game') return 'Want to play'
  return 'Want to watch'
}

export const inProgressLabel = (cat, bookType) => {
  if (cat === 'book') {
    if (bookType === 'audiobook') return 'Listening'
    return 'Reading'
  }
  if (cat === 'game') return 'Playing'
  return 'Watching'
}

// Formata minutos como "Xh Ymin"
export const formatMinutes = (minutes) => {
  if (!minutes && minutes !== 0) return '0min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

export const getProgress = (item) => {
  if (item.category === 'book') {
    // Audiobook: current_page = minutos ouvidos
    if (item.book_type === 'audiobook' && item.audio_duration_minutes > 0) {
      return Math.min(((item.current_page || 0) / item.audio_duration_minutes) * 100, 100)
    }
    if (item.total_pages > 0) {
      return Math.min(((item.current_page || 0) / item.total_pages) * 100, 100)
    }
  }
  if (item.category === 'film' && item.is_series) {
    const eps = parseEpisodesPerSeason(item)
    const total = eps.length ? eps.reduce((a, b) => a + b, 0) : (item.total_episodes || 0)
    if (total > 0) {
      const abs = absoluteEpisode(item, eps)
      return Math.min((abs / total) * 100, 100)
    }
  }
  return null
}

// Parse do array de episódios por temporada (vem como JSON string da BD)
export const parseEpisodesPerSeason = (item) => {
  try {
    if (Array.isArray(item.episodes_per_season)) return item.episodes_per_season
    if (item.episodes_per_season) return JSON.parse(item.episodes_per_season)
  } catch {}
  return []
}

// Nº absoluto de episódios já vistos (temporadas anteriores completas + episódio atual)
export const absoluteEpisode = (item, eps) => {
  const season = item.current_season || 1
  const episode = item.current_episode || 1
  const arr = eps || parseEpisodesPerSeason(item)
  let before = 0
  for (let s = 0; s < season - 1; s++) before += (arr[s] || 0)
  return before + episode
}

export const formatProgress = (item, t) => {
  if (item.category === 'book') {
    if (item.book_type === 'audiobook') {
      const curr  = formatMinutes(item.current_page || 0)
      const total = item.audio_duration_minutes ? formatMinutes(item.audio_duration_minutes) : null
      return total ? `${curr} / ${total}` : curr
    }
    return item.total_pages
      ? `${item.current_page || 0} / ${item.total_pages} pg.`
      : `${item.current_page || 0} pg.`
  }
  if (item.category === 'game') {
    const hoursLabel = t ? t('detail.hours_played') : 'hours played'
    return `${item.hours_played || 0}h ${hoursLabel}`
  }
  if (item.category === 'film') {
    if (item.is_series) return `T${item.current_season || 1} E${item.current_episode || 1}`
    return ''
  }
  return ''
}

export const formatRuntime = (minutes) => {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

// Datas de atividade: dia em que houve progresso/conclusão (updated_at de itens não-wishlist).
// Adicionar à lista de espera NÃO conta — só atualizações reais (páginas, horas, conclusão).
const activityDateSet = (items) => new Set(
  items
    .filter(i => i.status !== 'wishlist' && i.updated_at)
    .map(i => i.updated_at.slice(0, 10))
)

const toKey = (d) => d.toISOString().split('T')[0]

// ── Modo Férias: períodos guardados em localStorage ──
// Formato: [{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null }] (end null = férias a decorrer)
export const getVacations = () => {
  try { return JSON.parse(localStorage.getItem('vacations')) || [] } catch { return [] }
}
// Dia coberto por férias (não quebra a sequência)
const inVacation = (key, vacs) => vacs.some(v => key >= v.start && (v.end == null || key <= v.end))

// ── Escudos: ganham-se cumprindo todos os objetivos do mês; protegem a sequência ──
export const getShields = () => { try { return parseInt(localStorage.getItem('streakShields')) || 0 } catch { return 0 } }
const setShields = (n) => localStorage.setItem('streakShields', String(Math.max(0, n)))
export const getProtectedDays = () => { try { return JSON.parse(localStorage.getItem('shieldProtectedDays')) || [] } catch { return [] } }
export const getAwardedMonths = () => { try { return JSON.parse(localStorage.getItem('shieldAwardedMonths')) || [] } catch { return [] } }

// Atribui 1 escudo por cumprir todos os objetivos de um mês (uma única vez por mês)
export const awardMonthShield = (monthKey) => {
  const awarded = getAwardedMonths()
  if (awarded.includes(monthKey)) return false
  awarded.push(monthKey)
  localStorage.setItem('shieldAwardedMonths', JSON.stringify(awarded))
  setShields(getShields() + 1)
  return true
}

// Dia coberto (férias ou protegido por escudo)
const isCovered = (key, vacs, prot) => inVacation(key, vacs) || prot.has(key)

// Consome escudos para proteger dias falhados recentes e manter a sequência viva.
// Deve ser chamado no arranque da app.
export const reconcileShields = (items) => {
  let shields = getShields()
  if (shields <= 0) return
  const set = activityDateSet(items)
  if (set.size === 0) return
  const vacs = getVacations()
  const prot = new Set(getProtectedDays())

  // Recolhe dias falhados a partir de ontem até reconectar a uma sequência existente
  const candidates = []
  let connected = false
  let d = new Date(Date.now() - 86400000)
  for (let steps = 0; steps < 90; steps++) {
    const k = toKey(d)
    if (set.has(k) || isCovered(k, vacs, prot)) { connected = true; break }
    candidates.push(k)
    d = new Date(d.getTime() - 86400000)
  }
  // Só protege se a lacuna liga a atividade anterior e há escudos suficientes para a cobrir toda
  if (connected && candidates.length > 0 && candidates.length <= shields) {
    candidates.forEach(k => prot.add(k))
    localStorage.setItem('shieldProtectedDays', JSON.stringify([...prot]))
    setShields(shields - candidates.length)
  }
}

export const calculateStreak = (items) => {
  const set = activityDateSet(items)
  if (set.size === 0) return 0
  const vacs = getVacations()
  const prot = new Set(getProtectedDays())

  const todayKey = toKey(new Date())
  const ydayKey  = toKey(new Date(Date.now() - 86400000))
  // A sequência só está "viva" se houve atividade hoje/ontem, ou esse dia está coberto
  if (!set.has(todayKey) && !set.has(ydayKey) && !isCovered(todayKey, vacs, prot)) return 0

  let streak = 0
  let d = new Date()
  // Limite de segurança (10 anos)
  for (let guard = 0; guard < 3660; guard++) {
    const k = toKey(d)
    if (set.has(k)) streak++                       // dia com atividade → conta
    else if (isCovered(k, vacs, prot)) { /* férias/escudo → não conta nem quebra */ }
    else if (k === todayKey) { /* hoje ainda sem atividade → permitido, não quebra */ }
    else break                                     // lacuna real → termina
    d = new Date(d.getTime() - 86400000)
  }
  return streak
}

// Melhor sequência de sempre (dias consecutivos com atividade; férias fazem ponte)
export const bestStreak = (items) => {
  const dates = [...activityDateSet(items)].sort()
  if (!dates.length) return 0
  const vacs = getVacations()
  const prot = new Set(getProtectedDays())
  // Todos os dias entre a e b (exclusivo) estão cobertos (férias/escudo)?
  const gapAllCovered = (aKey, bKey) => {
    const a = new Date(aKey), b = new Date(bKey)
    for (let t = a.getTime() + 86400000; t < b.getTime(); t += 86400000) {
      if (!isCovered(toKey(new Date(t)), vacs, prot)) return false
    }
    return true
  }
  let best = 1, cur = 1
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000
    if (diff === 1) cur++
    else if (diff > 1 && gapAllCovered(dates[i - 1], dates[i])) cur++  // férias/escudo fazem ponte
    else cur = 1
    if (cur > best) best = cur
  }
  return best
}

// Atividade dos últimos 7 dias: categorias com progresso/conclusão nesse dia (não wishlist)
// Início da semana: 0 = Domingo (padrão) · 1 = Segunda (opção nas definições)
export const getWeekStart = () => (localStorage.getItem('weekStart') === 'monday' ? 1 : 0)

// Semana de calendário atual (começa no dia escolhido), 7 dias
export const weekActivity = (items) => {
  const startDay = getWeekStart()
  const vacs = getVacations()
  const now = new Date()
  const diff = (now.getDay() - startDay + 7) % 7   // posição de hoje dentro da semana
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + (i - diff) * 86400000)
    const key = d.toISOString().split('T')[0]
    const cats = [...new Set(
      items
        .filter(it => it.status !== 'wishlist' && it.updated_at && it.updated_at.slice(0, 10) === key)
        .map(it => it.category)
    )]
    days.push({ date: d, key, cats, isToday: i === diff, isVacation: inVacation(key, vacs), dow: (startDay + i) % 7 })
  }
  return days
}
