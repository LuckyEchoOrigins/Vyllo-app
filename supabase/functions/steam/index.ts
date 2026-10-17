const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

async function findAppIds(title: string): Promise<number[]> {
  const headers = { 'User-Agent': UA }
  const ids: number[] = []
  try {
    const r = await fetch(
      `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(title)}&f=games&cc=PT&realm=1&l=english`,
      { headers, signal: AbortSignal.timeout(5000) }
    )
    const html = await r.text()
    const regex = /data-ds-appid="(\d+)"/g
    let m
    while ((m = regex.exec(html)) !== null && ids.length < 6) {
      const id = parseInt(m[1])
      if (!ids.includes(id)) ids.push(id)
    }
  } catch { /* ignore */ }
  return ids
}

async function fetchSchema(appid: number, key: string) {
  try {
    const [schemaRes, globalRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${key}&appid=${appid}&l=portuguese`, { signal: AbortSignal.timeout(8000) }),
      fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}`, { signal: AbortSignal.timeout(6000) }),
    ])
    const [schema, global] = await Promise.all([schemaRes.json(), globalRes.json()])
    const schemaList = schema.game?.availableGameStats?.achievements || []
    if (!schemaList.length) return null
    const globalMap: Record<string, number> = {}
    ;(global.achievementpercentages?.achievements || []).forEach((a: { name: string; percent: string }) => { globalMap[a.name] = parseFloat(a.percent) })
    const achievements = schemaList.map((a: { name: string; displayName?: string; description?: string; icon?: string }) => ({
      id: a.name,
      name: a.displayName || a.name,
      description: a.description || '',
      icon: a.icon,
      globalPercent: globalMap[a.name] != null ? Math.round(globalMap[a.name] * 10) / 10 : null,
      unlocked: false,
    })).sort((a: { globalPercent: number | null }, b: { globalPercent: number | null }) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
    return { appid, gameName: schema.game?.gameName || '', achievements }
  } catch { return null }
}

const RAWG_DIA = /[̀-ͯ]/g
const rawgNorm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(RAWG_DIA, '').replace(/[^a-z0-9]+/g, ' ').trim()

async function fetchRawgAchievements(title: string) {
  const key = Deno.env.get('RAWG_KEY')
  if (!key) return null
  try {
    const sr = await fetch(`https://api.rawg.io/api/games?key=${key}&search=${encodeURIComponent(title)}&search_precise=true&page_size=3`, { signal: AbortSignal.timeout(6000) })
    const sd = await sr.json()
    const games = sd.results || []
    if (!games.length) return null
    const want = rawgNorm(title)
    const game = games.find((g: { name: string }) => rawgNorm(g.name) === want) || games[0]
    const all: unknown[] = []
    let url: string | null = `https://api.rawg.io/api/games/${game.id}/achievements?key=${key}&page_size=40`
    for (let page = 0; page < 10 && url; page++) {
      const ar = await fetch(url, { signal: AbortSignal.timeout(7000) })
      const ad = await ar.json()
      ;(ad.results || []).forEach((a: unknown) => all.push(a))
      url = ad.next || null
    }
    if (!all.length) return null
    const achievements = all.map((a: unknown, i: number) => {
      const ach = a as { id?: number; name?: string; description?: string; image?: string; percent?: string }
      return { id: String(ach.id || `rawg_${i}`), name: ach.name || '', description: ach.description || '', icon: ach.image || null, globalPercent: ach.percent != null ? Math.round(parseFloat(ach.percent) * 10) / 10 : null, unlocked: false }
    }).sort((a: { globalPercent: number | null }, b: { globalPercent: number | null }) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
    return { appid: null, gameName: game.name, achievements }
  } catch { return null }
}

/** Igual ao normalizeGameTitle da app: sem maiusculas, ™ ® nem pontuacao. */
function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’™®©]/g, '')
    .replace(/[:\-–—.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Id do utilizador autenticado, ou null. */
async function verifyAuth(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
      signal: AbortSignal.timeout(3000),
    })
    if (!r.ok) return null
    const user = await r.json()
    return typeof user?.id === 'string' ? user.id : null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const userId = await verifyAuth(req)
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const { action } = body
    const key = Deno.env.get('STEAM_API_KEY') || ''
    const headers = { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' }

    // ── search ────────────────────────────────────────────────────────────────
    if (action === 'search') {
      const { q } = body
      if (!q) return json({ error: 'q required' }, 400)
      const items: unknown[] = []
      try {
        const r = await fetch(
          `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(q)}&f=games&cc=PT&realm=1&l=portuguese`,
          { headers, signal: AbortSignal.timeout(6000) }
        )
        const html = await r.text()
        const regex = /<a[^>]*data-ds-appid="(\d+)"[^>]*>[\s\S]*?<div class="match_name">(.*?)<\/div>/g
        let m
        while ((m = regex.exec(html)) !== null && items.length < 8) {
          const appid = parseInt(m[1])
          const name = m[2].replace(/<[^>]+>/g, '').trim()
          items.push({ appid, name, image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_sm_120.jpg` })
        }
        if (items.length === 0) {
          const r2 = await fetch(`https://store.steampowered.com/api/storeapsearch/?term=${encodeURIComponent(q)}&l=portuguese`, { headers, signal: AbortSignal.timeout(5000) })
          const d2 = await r2.json()
          ;(d2.items || []).slice(0, 8).forEach((it: { id: number; name: string }) => items.push({ appid: it.id, name: it.name, image: `https://cdn.akamai.steamstatic.com/steam/apps/${it.id}/capsule_sm_120.jpg` }))
        }
      } catch { /* ignore */ }
      return json(items)
    }

    // ── definitions ──────────────────────────────────────────────────────────
    if (action === 'definitions') {
      if (!key) return json({ error: 'STEAM_API_KEY not configured' }, 500)
      const { appid, q } = body
      const candidates = appid ? [parseInt(appid)] : await findAppIds(q || '')
      for (const id of candidates) {
        const result = await fetchSchema(id, key)
        if (result && result.achievements.length) return json(result)
      }
      // fallback: RAWG (seja por título ou quando a Steam retornou vazio)
      if (q) {
        const rawg = await fetchRawgAchievements(q)
        if (rawg && rawg.achievements.length) return json(rawg)
      }
      return json({ appid: candidates[0] || null, gameName: q || '', achievements: [] })
    }

    // ── resolve ───────────────────────────────────────────────────────────────
    if (action === 'resolve') {
      if (!key) return json({ error: 'STEAM_API_KEY not configured' }, 500)
      const { vanity } = body
      if (!vanity) return json({ error: 'vanity required' }, 400)
      const r = await fetch(`https://api.steampowered.com/ISteamWebAPIUtil/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`, { signal: AbortSignal.timeout(5000) })
      const data = await r.json()
      if (data.response?.success === 1) return json({ steamid: data.response.steamid })
      return json({ error: 'Perfil não encontrado' }, 404)
    }

    // ── profile ───────────────────────────────────────────────────────────────
    // Confirma a conta ligada: nome, se o perfil e publico e quantos jogos a
    // Steam deixa ver (null com os detalhes de jogo privados).
    if (action === 'profile') {
      if (!key) return json({ error: 'STEAM_API_KEY not configured' }, 500)
      const { steamid } = body
      if (!steamid) return json({ error: 'steamid obrigatório' }, 400)
      const [summary, library] = await Promise.all([
        fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamid}`, { signal: AbortSignal.timeout(8000) }),
        fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamid}&include_played_free_games=1&format=json`, { signal: AbortSignal.timeout(8000) }),
      ])
      if (!summary.ok) return json({ error: 'steam_unavailable', status: summary.status })
      const player = (await summary.json()).response?.players?.[0]
      if (!player) return json({ error: 'not_found' })
      const owned = library.ok ? await library.json() : null
      const count = owned?.response?.game_count
      return json({
        name: player.personaname ?? '',
        public: player.communityvisibilitystate === 3,
        games: typeof count === 'number' ? count : null,
      })
    }

    // ── link ──────────────────────────────────────────────────────────────────
    // Guarda (ou apaga, com steamid null) o SteamID no perfil, para a
    // sincronizacao de hora a hora (steam-cron) funcionar sem abrir a app.
    // Os utilizadores so leem o perfil: escreve-se com a chave de servico.
    if (action === 'link') {
      const steamid = body.steamid == null ? null : String(body.steamid)
      if (steamid !== null && !/^\d{17}$/.test(steamid)) return json({ error: 'steamid inválido' }, 400)
      const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          apikey: service,
          Authorization: `Bearer ${service}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        // Conta nova (ou trocada): a proxima sincronizacao trata as horas
        // como historico, nao como jogadas nesse dia.
        body: JSON.stringify({ steam_id: steamid, steam_synced_at: null }),
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) return json({ error: 'save_failed' }, 500)
      return json({ ok: true })
    }

    // ── library ───────────────────────────────────────────────────────────────
    // Biblioteca da conta (para a app perguntar pelos jogos novos).
    if (action === 'library') {
      if (!key) return json({ error: 'STEAM_API_KEY not configured' }, 500)
      const { steamid } = body
      if (!steamid) return json({ error: 'steamid obrigatório' }, 400)
      const r = await fetch(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1&format=json`,
        { signal: AbortSignal.timeout(8000) },
      )
      if (!r.ok) return json({ error: 'steam_unavailable' })
      const d = await r.json()
      if (typeof d.response?.game_count !== 'number') return json({ error: 'private' })
      type Owned = { appid: number; name?: string; playtime_forever?: number; playtime_2weeks?: number }
      return json({
        games: ((d.response.games as Owned[] | undefined) ?? []).map((g) => ({
          appid: g.appid,
          name: g.name ?? '',
          hours: parseFloat(((g.playtime_forever || 0) / 60).toFixed(1)),
          // Minutos exatos: com as horas arredondadas, um jogo aberto 2
          // minutos contaria como nunca jogado no backlog da app.
          minutes: g.playtime_forever || 0,
          // Jogado nas ultimas 2 semanas (para a app perguntar por jogos que
          // estas a jogar e ainda nao estao na colecao).
          recent: parseFloat(((g.playtime_2weeks || 0) / 60).toFixed(1)),
        })),
      })
    }

    // ── playtime ──────────────────────────────────────────────────────────────
    if (action === 'playtime') {
      if (!key) return json({ error: 'STEAM_API_KEY not configured' }, 500)
      const { appid, steamid, title } = body
      if (!appid || !steamid) return json({ error: 'appid e steamid obrigatórios' }, 400)
      const id = Number(appid)
      const owned = async (filter: boolean) => {
        const r = await fetch(
          `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamid}&include_played_free_games=1&format=json` +
            (filter ? `&appids_filter[0]=${id}` : '&include_appinfo=1'),
          { signal: AbortSignal.timeout(8000) },
        )
        return r.ok ? await r.json() : null
      }
      let d = await owned(true)
      if (!d) return json({ error: 'steam_unavailable' })
      // Com os detalhes de jogo privados a Steam devolve "response": {} (sem
      // game_count). Nao e o mesmo que 0 horas: as apps nao devem apagar nada.
      if (typeof d.response?.game_count !== 'number') return json({ error: 'private' })
      type Owned = { appid: number; name?: string; playtime_forever?: number }
      const games = (data: typeof d) => (data?.response?.games as Owned[] | undefined) ?? []
      // O jogo procura-se pelo AppID (nunca o primeiro da lista); se o filtro
      // falhar, procura-se na biblioteca inteira.
      let game = games(d).find((g) => g.appid === id)
      if (!game) {
        d = await owned(false)
        const library = games(d)
        game = library.find((g) => g.appid === id)
        // Outra edicao do mesmo jogo na biblioteca (ex.: "Ori and the Blind
        // Forest: Definitive Edition" em vez do original): mesmo nome, ou o
        // nome seguido de ":"/"-" e do nome da edicao. Ganha a mais jogada.
        const wanted = normalizeTitle(String(title ?? ''))
        if (!game && wanted) {
          game = library
            .filter((g) => {
              const name = normalizeTitle(g.name ?? '')
              return name === wanted || name.startsWith(`${wanted} `)
            })
            .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))[0]
        }
      }
      // Jogo fora desta conta (ex.: emprestado pela Partilha Familiar).
      if (!game) return json({ hours: 0, owned: false })
      return json({
        hours: parseFloat(((game.playtime_forever || 0) / 60).toFixed(1)),
        owned: true,
        appid: game.appid,
      })
    }

    // ── achievements ──────────────────────────────────────────────────────────
    if (action === 'achievements') {
      if (!key) return json({ error: 'STEAM_API_KEY not configured' }, 500)
      const { appid, steamid } = body
      if (!appid || !steamid) return json({ error: 'appid e steamid obrigatórios' }, 400)
      const [schemaRes, playerRes, globalRes] = await Promise.all([
        fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${key}&appid=${appid}&l=portuguese`, { signal: AbortSignal.timeout(8000) }),
        fetch(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${key}&steamid=${steamid}&l=portuguese`, { signal: AbortSignal.timeout(8000) }),
        fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}`, { signal: AbortSignal.timeout(6000) }),
      ])
      const [schema, player, global] = await Promise.all([schemaRes.json(), playerRes.json(), globalRes.json()])
      if (player.playerstats?.error) return json({ error: player.playerstats.error }, 400)
      const schemaList = schema.game?.availableGameStats?.achievements || []
      const playerMap: Record<string, { achieved: number; unlocktime: number }> = {}
      ;(player.playerstats?.achievements || []).forEach((a: { apiname: string; achieved: number; unlocktime: number }) => { playerMap[a.apiname] = a })
      const globalMap: Record<string, number> = {}
      ;(global.achievementpercentages?.achievements || []).forEach((a: { name: string; percent: string }) => { globalMap[a.name] = parseFloat(a.percent) })
      const achievements = schemaList.map((a: { name: string; displayName?: string; description?: string; icon?: string; icongray?: string }) => ({
        id: a.name, name: a.displayName || a.name, description: a.description || '',
        icon: a.icon, iconGray: a.icongray,
        achieved: playerMap[a.name]?.achieved === 1,
        unlockTime: playerMap[a.name]?.unlocktime || 0,
        globalPercent: globalMap[a.name] != null ? Math.round(globalMap[a.name] * 10) / 10 : null,
      })).sort((a: { globalPercent: number | null }, b: { globalPercent: number | null }) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
      return json({ total: achievements.length, unlocked: achievements.filter((a: { achieved: boolean }) => a.achieved).length, gameName: player.playerstats?.gameName || '', achievements })
    }

    return json({ error: 'action required' }, 400)
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
