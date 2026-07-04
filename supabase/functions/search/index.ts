const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const DIACRITICS = /[̀-ͯ]/g
function normGame(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(DIACRITICS, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

// ── Google Books ──────────────────────────────────────────────────────────────
function gbCoverUrl(imgLinks: Record<string, string> | null | undefined) {
  const url = imgLinks?.extraLarge || imgLinks?.large || imgLinks?.medium || imgLinks?.small || imgLinks?.thumbnail || imgLinks?.smallThumbnail
  if (!url) return null
  return url.replace(/^http:/, 'https:').replace(/&zoom=\d/, '&zoom=3').replace(/&edge=\w+/, '')
}

async function fetchBookData(title: string, author: string | null) {
  // Open Library — primary source (free, no key, no rate limit)
  try {
    const q = author ? `${title} ${author}` : title
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5`, { signal: AbortSignal.timeout(6000) })
    const d = await r.json()
    for (const doc of (d.docs || [])) {
      if (doc.cover_i) {
        return {
          cover: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
          pages: doc.number_of_pages_median || null,
        }
      }
    }
    // No cover but maybe we got pages
    const pages = d.docs?.[0]?.number_of_pages_median || null
    // Fall through to Google Books for cover
    if (!Deno.env.get('GOOGLE_BOOKS_KEY')) return { cover: null, pages }
  } catch { /* ignore */ }

  // Google Books — only used if API key is configured (avoids shared quota exhaustion)
  const key = Deno.env.get('GOOGLE_BOOKS_KEY')
  if (key) {
    const queries = [
      author ? `intitle:"${title}"+inauthor:"${author}"` : null,
      `intitle:"${title}"`,
      title,
    ].filter(Boolean) as string[]
    for (const q of queries) {
      try {
        const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=3&orderBy=relevance&key=${key}`, { signal: AbortSignal.timeout(4000) })
        const d = await r.json()
        for (const item of (d.items || [])) {
          const cover = gbCoverUrl(item.volumeInfo?.imageLinks)
          const pages = item.volumeInfo?.pageCount || null
          if (cover) return { cover, pages }
        }
      } catch { /* ignore */ }
    }
  }

  return { cover: null, pages: null }
}

// ── Steam game cover ──────────────────────────────────────────────────────────
async function fetchGameCover(title: string): Promise<{ appid: number | null; cover: string | null }> {
  const headers = { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' }
  let appid: number | null = null
  try {
    const r = await fetch(`https://store.steampowered.com/search/suggest?term=${encodeURIComponent(title)}&f=games&cc=PT&realm=1&l=english`, { headers, signal: AbortSignal.timeout(5000) })
    const html = await r.text()
    const candidates: { id: number; name: string }[] = []
    const re = /data-ds-appid="(\d+)"[\s\S]*?match_name">([^<]+)</g
    let m
    while ((m = re.exec(html)) !== null) candidates.push({ id: parseInt(m[1]), name: m[2].trim() })
    if (candidates.length) {
      const titleWords = normGame(title).split(' ').filter(Boolean)
      const tJoin = titleWords.join(' ')
      let best: { id: number; name: string } | null = null
      for (const c of candidates) {
        const cw = normGame(c.name).split(' ').filter(Boolean)
        const cJoin = cw.join(' ')
        if (cJoin === tJoin) { best = c; break }
        if (cw.length >= titleWords.length && cw.slice(0, titleWords.length).join(' ') === tJoin) {
          if (!best || cw.length < normGame(best.name).split(' ').filter(Boolean).length) best = c
        }
      }
      appid = (best || candidates[0]).id
    }
  } catch { /* ignore */ }

  if (!appid) {
    try {
      const r2 = await fetch(`https://store.steampowered.com/api/storeapsearch/?term=${encodeURIComponent(title)}`, { headers, signal: AbortSignal.timeout(4000) })
      const d2 = await r2.json()
      if (d2.items?.[0]?.id) appid = d2.items[0].id
    } catch { /* ignore */ }
  }

  if (appid) {
    const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
    const headerUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`
    const exists = async (url: string) => { try { const c = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) }); return c.ok } catch { return false } }
    if (await exists(portraitUrl)) return { appid, cover: portraitUrl }
    if (await exists(headerUrl)) return { appid, cover: headerUrl }
  }

  const rawg = await fetchRawgCover(title)
  if (rawg) return { appid: null, cover: rawg }
  return { appid: null, cover: await fetchWikiCover(title, null, 'game') }
}

// ── RAWG cover ────────────────────────────────────────────────────────────────
async function fetchRawgCover(title: string): Promise<string | null> {
  const key = Deno.env.get('RAWG_KEY')
  if (!key) return null
  try {
    const r = await fetch(`https://api.rawg.io/api/games?key=${key}&search=${encodeURIComponent(title)}&search_precise=true&page_size=3`, { signal: AbortSignal.timeout(5000) })
    const d = await r.json()
    const results = d.results || []
    if (!results.length) return null
    const want = normGame(title)
    const best = results.find((g: { name: string }) => normGame(g.name) === want) || results[0]
    return best.background_image || null
  } catch { return null }
}

// ── TMDB language map ─────────────────────────────────────────────────────────
const TMDB_LANG: Record<string, string> = { en: 'en-US', pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }

// ── TMDB movie data ───────────────────────────────────────────────────────────
async function fetchTmdbMovieData(title: string, year: number | null, lang = 'pt') {
  const key = Deno.env.get('TMDB_KEY')
  if (!key) return null
  const tmdbLang = TMDB_LANG[lang] || 'pt-PT'
  try {
    const yearQ = year ? `&year=${year}` : ''
    const sr = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(title)}&language=${tmdbLang}${yearQ}`, { signal: AbortSignal.timeout(5000) })
    const sd = await sr.json()
    const hit = sd.results?.[0]
    if (!hit) return null
    const out: { cover: string | null; year: number | null; genre: string | null; runtime: number | null; synopsis: string | null } = {
      cover: hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null,
      year: hit.release_date ? parseInt(hit.release_date.slice(0, 4)) : null,
      genre: null, runtime: null,
      synopsis: hit.overview || null,
    }
    try {
      const dr = await fetch(`https://api.themoviedb.org/3/movie/${hit.id}?api_key=${key}&language=${tmdbLang}`, { signal: AbortSignal.timeout(5000) })
      const dd = await dr.json()
      if (Number.isFinite(dd.runtime) && dd.runtime > 0) out.runtime = dd.runtime
      if (dd.genres?.[0]?.name) out.genre = dd.genres[0].name
      if (dd.overview) out.synopsis = dd.overview
    } catch { /* ignore */ }
    return out
  } catch { return null }
}

// ── TVmaze series data ────────────────────────────────────────────────────────
async function fetchTVmazeData(title: string, year: number | null) {
  try {
    const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(5000) })
    const list = await r.json()
    if (!Array.isArray(list) || !list.length) return null
    let best = list[0]
    if (year) {
      const exact = list.find((x: { show: { premiered?: string } }) => x.show?.premiered?.startsWith(String(year))) ||
        list.find((x: { show: { premiered?: string } }) => { const py = parseInt(x.show?.premiered?.slice(0, 4) || '0'); return py && Math.abs(py - year) <= 1 })
      if (exact) best = exact
    }
    const show = best.show
    if (!show?.id) return null
    const cover = show.image?.original || show.image?.medium || null
    let episodesPerSeason = null, totalSeasons = null, totalEps = null
    try {
      const epRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/episodes`, { signal: AbortSignal.timeout(6000) })
      const eps = await epRes.json()
      if (Array.isArray(eps) && eps.length) {
        const counts: Record<number, number> = {}
        for (const ep of eps) { if (ep.season && ep.season > 0) counts[ep.season] = (counts[ep.season] || 0) + 1 }
        const seasonNums = Object.keys(counts).map(Number).sort((a, b) => a - b)
        if (seasonNums.length) {
          episodesPerSeason = seasonNums.map(n => counts[n])
          totalSeasons = seasonNums.length
          totalEps = episodesPerSeason.reduce((a: number, b: number) => a + b, 0)
        }
      }
    } catch { /* ignore */ }
    const synopsis = show.summary ? show.summary.replace(/<[^>]+>/g, '').trim() : null
    return { cover, episodesPerSeason, totalSeasons, totalEps, synopsis }
  } catch { return null }
}

// ── Wikipedia cover ───────────────────────────────────────────────────────────
async function wikiSearchCover(query: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json&origin=*`
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000) })
    const d = await r.json()
    const pages = d.query?.pages
    if (pages) { const first = Object.values(pages)[0] as { thumbnail?: { source: string } }; if (first?.thumbnail?.source) return first.thumbnail.source }
  } catch { /* ignore */ }
  return null
}

async function fetchFilmCover(title: string, year: number | null, isSeries: boolean): Promise<string | null> {
  const tmdbKey = Deno.env.get('TMDB_KEY')
  if (tmdbKey) {
    try {
      const type = isSeries ? 'tv' : 'movie'
      const yearQ = year ? (isSeries ? `&first_air_date_year=${year}` : `&year=${year}`) : ''
      const r = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${tmdbKey}&query=${encodeURIComponent(title)}&language=pt-PT${yearQ}`, { signal: AbortSignal.timeout(5000) })
      const d = await r.json()
      const poster = d.results?.[0]?.poster_path
      if (poster) return `https://image.tmdb.org/t/p/w500${poster}`
    } catch { /* ignore */ }
  }
  return wikiSearchCover(`${title} ${year || ''} ${isSeries ? 'television series' : 'film'}`.trim())
}

async function fetchWikiCover(title: string, year: number | null, cat: string): Promise<string | null> {
  return wikiSearchCover(`${title} ${year || ''} ${cat === 'game' ? 'video game' : 'film'}`.trim())
}

// ── Language map ─────────────────────────────────────────────────────────────
const LANG_LABEL: Record<string, string> = { en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French', de: 'German' }

// ── Claude prompt ─────────────────────────────────────────────────────────────
function buildPrompt(query: string, cat: string, lang = 'pt'): string {
  const label = cat === 'book' ? 'livro' : cat === 'game' ? 'videojogo' : 'filme ou série'
  const synopsisLang = LANG_LABEL[lang] || 'Portuguese'
  const gameExtra = cat === 'game' ? `
- Se a pesquisa incluir "remastered", "remake", "definitive edition", "enhanced" → devolve ESSA edição específica como 1.º resultado
- Se incluir um número ("1", "2", "3") → interpreta como a posição na série
- Usa o TÍTULO EXATO como aparece na Steam
- Se o jogo tiver edições diferentes, coloca a pedida em 1.º lugar` : ''
  const filmExtra = cat === 'film' ? `
- DISTINGUE corretamente filme de série de TV:
  Filme: isSeries false, totalEps null, totalSeasons null, episodesPerSeason null, runtime em minutos
  Série: isSeries true, totalEps total de episodios, totalSeasons total de temporadas, runtime null
- Para series, indica episodesPerSeason: array com o numero de episodios de CADA temporada
- O comprimento de episodesPerSeason deve ser igual a totalSeasons` : ''
  const subtitleHint = cat === 'book' ? 'Nome do autor' : cat === 'game' ? 'Estúdio/editora do jogo — NÃO as plataformas' : 'Realizador (filme) ou criador/estúdio (série)'
  return `Pesquisa: "${query}" (${label}).

Regras:
- O 1.º resultado DEVE ser o match mais próximo/exacto da pesquisa${gameExtra}${filmExtra}
- Usa SEMPRE o título em INGLÊS (título original). Se a pesquisa for em português ou outro idioma, encontra a obra e usa o título em inglês
- NUNCA incluas a mesma obra duas vezes — mesmo que exista em português e inglês, inclui apenas UMA entrada com o título inglês
- Cada obra deve aparecer UMA única vez na lista
- Só resultados reais e conhecidos
- Ordena por relevância para a pesquisa

Responde APENAS com JSON array válido (sem markdown, sem texto extra):
[
  {
    "title": "Título exacto da obra",
    "subtitle": "${subtitleHint}",
    "author": ${cat === 'book' ? '"Nome do autor"' : 'null'},
    "platform": ${cat === 'game' ? '"Plataformas (ex: PC, PS5, Xbox)"' : 'null'},
    "genre": "Género principal",
    "synopsis": "Synopsis in ${synopsisLang} (2-3 sentences)",
    "year": 2024,
    "totalPages": ${cat === 'book' ? 'número real de páginas ou null' : 'null'},
    "isSeries": ${cat === 'film' ? 'true se for série de TV, false se for filme' : 'false'},
    "totalEps": ${cat === 'film' ? 'número total de episódios se série, null se filme' : 'null'},
    "totalSeasons": ${cat === 'film' ? 'número de temporadas se série, null se filme' : 'null'},
    "episodesPerSeason": ${cat === 'film' ? 'array de inteiros com episódios por temporada se série, null se filme' : 'null'},
    "runtime": ${cat === 'film' ? 'duração em minutos se filme, null se série' : 'null'}
  }
]`
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const SEARCH_CACHE = new Map<string, { t: number; data: unknown }>()
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7
const CACHE_MAX = 500

async function verifyAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
      signal: AbortSignal.timeout(3000),
    })
    return r.ok
  } catch { return false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (!await verifyAuth(req)) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const { action, query, cat, lang = 'pt' } = body

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY não configurada' }, 500)

    // ── Translate action ──────────────────────────────────────────────────────
    if (action === 'translate') {
      const { text, targetLang } = body
      if (!text || !targetLang) return json({ error: 'text and targetLang required' }, 400)
      const langName = LANG_LABEL[targetLang] || 'English'
      const tr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: `Translate the following text to ${langName}. Return ONLY the translated text, nothing else:\n\n${text}` }] }),
      })
      const td = await tr.json()
      return json({ translated: td.content?.[0]?.text?.trim() || text })
    }

    // ── Synopsis action (fetch synopsis for existing items without one) ────────
    if (action === 'synopsis') {
      const { title, cat: sCat, lang: sLang = 'pt' } = body
      if (!title || !sCat) return json({ error: 'title and cat required' }, 400)
      const langName = LANG_LABEL[sLang] || 'Portuguese'
      const label = sCat === 'book' ? 'book' : sCat === 'game' ? 'video game' : 'film or TV series'
      const tr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: `Write a 2-3 sentence synopsis of "${title}" (${label}) in ${langName}. Return ONLY the synopsis text, nothing else.` }] }),
      })
      const sd = await tr.json()
      return json({ synopsis: sd.content?.[0]?.text?.trim() || '' })
    }

    if (!query || !cat) return json({ error: 'query e cat são obrigatórios' }, 400)

    const cacheKey = `${cat}::${lang}::${query.trim().toLowerCase()}`
    const cached = SEARCH_CACHE.get(cacheKey)
    if (cached && Date.now() - cached.t < CACHE_TTL) return json(cached.data)

    // 1. Claude returns metadata
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1400, messages: [{ role: 'user', content: buildPrompt(query, cat, lang) }] }),
    })
    const anthropicData = await anthropicRes.json()
    if (!anthropicRes.ok) {
      console.error('Anthropic error:', JSON.stringify(anthropicData))
      return json({ error: `Anthropic API error: ${anthropicData.error?.message || anthropicRes.status}` }, 500)
    }
    const text = anthropicData.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return json([])
    let results = JSON.parse(match[0])
    if (!Array.isArray(results)) return json([])
    results = results.slice(0, 5)

    // 2. Enrich with covers in parallel
    const enriched = await Promise.all(results.map(async (item: {
      title: string; author?: string; year?: number; isSeries?: boolean; totalPages?: number;
      episodesPerSeason?: number[]; totalSeasons?: number; totalEps?: number; genre?: string; runtime?: number
    }) => {
      let cover: string | null = null
      let steam_app_id: number | null = null
      const extra: Record<string, unknown> = {}
      try {
        if (cat === 'book') {
          const bd = await fetchBookData(item.title, item.author || null)
          cover = bd.cover
          if (bd.pages) extra.totalPages = bd.pages
        } else if (cat === 'game') {
          const sg = await fetchGameCover(item.title)
          cover = sg.cover
          steam_app_id = sg.appid
        } else if (item.isSeries) {
          // Run TVmaze (episode data) and TMDB (CORS-safe cover) in parallel
          const [tv, tmdbCover] = await Promise.all([
            fetchTVmazeData(item.title, item.year || null),
            fetchFilmCover(item.title, item.year || null, true),
          ])
          if (tv) {
            cover = tmdbCover || tv.cover  // prefer TMDB (supports CORS in canvas)
            if (tv.episodesPerSeason) extra.episodesPerSeason = tv.episodesPerSeason
            if (tv.totalSeasons) extra.totalSeasons = tv.totalSeasons
            if (tv.totalEps) extra.totalEps = tv.totalEps
            if (tv.synopsis) extra.synopsis = tv.synopsis
          } else {
            cover = tmdbCover
          }
        } else {
          const tm = await fetchTmdbMovieData(item.title, item.year || null, lang)
          if (tm) {
            if (tm.cover) cover = tm.cover
            if (tm.genre) extra.genre = tm.genre
            if (tm.year) extra.year = tm.year
            if (tm.runtime) extra.runtime = tm.runtime
            if (tm.synopsis) extra.synopsis = tm.synopsis
          }
          if (!cover) cover = await fetchFilmCover(item.title, item.year || null, false)
        }
      } catch { /* ignore */ }
      return { ...item, ...extra, cover: cover || null, steam_app_id: steam_app_id || null }
    }))

    if (SEARCH_CACHE.size >= CACHE_MAX) SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value)
    SEARCH_CACHE.set(cacheKey, { t: Date.now(), data: enriched })
    return json(enriched)
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
