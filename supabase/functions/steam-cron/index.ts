// Sincronizacao da Steam em segundo plano, chamada de hora a hora pelo
// pg_cron (ver a migracao 20261006000000_steam_background_sync.sql).
//
// Para cada utilizador Premium com o SteamID guardado no perfil, le a
// biblioteca numa so chamada e atualiza as horas dos jogos Steam que
// mudaram, como a app faz ao abrir. As horas novas vao para o registo de
// atividade: 'steam' se cabem no tempo desde a sincronizacao anterior (e
// nunca acima de 24h), senao 'steam_import' (historico, fora do mapa).
//
// Nao guarda segredos: e chamada com a chave anon (publica). Para nao poder
// ser usada para gastar a quota da Steam, cada utilizador so e sincronizado
// de 50 em 50 minutos, e no maximo MAX_USERS por chamada.

const URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const STEAM_KEY = Deno.env.get('STEAM_API_KEY') ?? ''
const MAX_USERS = 100
const MIN_INTERVAL_MS = 50 * 60 * 1000

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10000),
  })

type Profile = {
  id: string
  steam_id: string
  steam_synced_at: string | null
  is_premium: boolean | null
  google_expires_at: string | null
  apple_expires_at: string | null
}

type Game = {
  id: number
  title: string
  status: string
  hours_played: number | null
  steam_app_id: number | null
  game_platform: string | null
  start_date: string | null
}

const premium = (p: Profile, now: number) =>
  p.is_premium === true ||
  (p.google_expires_at != null && Date.parse(p.google_expires_at) > now) ||
  (p.apple_expires_at != null && Date.parse(p.apple_expires_at) > now)

async function syncUser(profile: Profile, now: number): Promise<number> {
  const owned = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_KEY}&steamid=${profile.steam_id}&include_played_free_games=1&format=json`,
    { signal: AbortSignal.timeout(10000) },
  )
  if (!owned.ok) return 0
  const library = (await owned.json()).response
  // Detalhes de jogo privados: nada a fazer (a app avisa).
  if (typeof library?.game_count !== 'number') return 0
  const minutes = new Map<number, number>()
  for (const g of (library.games ?? []) as { appid: number; playtime_forever?: number }[]) {
    minutes.set(g.appid, g.playtime_forever ?? 0)
  }

  const r = await db(
    `items?select=id,title,status,hours_played,steam_app_id,game_platform,start_date&user_id=eq.${profile.id}&category=eq.game&steam_app_id=not.is.null`,
  )
  if (!r.ok) return 0
  const games = (await r.json()) as Game[]

  const lastSync = profile.steam_synced_at ? Date.parse(profile.steam_synced_at) : null
  const elapsedHours = lastSync == null ? null : (now - lastSync) / 3_600_000
  const today = new Date(now).toISOString().slice(0, 10)
  const logs: Record<string, unknown>[] = []
  let changed = 0

  for (const game of games) {
    if (game.game_platform != null && game.game_platform !== 'steam') continue
    const appId = Math.round(Number(game.steam_app_id))
    if (!minutes.has(appId)) continue // Fora desta conta: horas manuais.
    const hours = Math.round((minutes.get(appId)! / 60) * 10) / 10
    const before = Number(game.hours_played ?? 0)
    if (Math.abs(hours - before) < 0.05) continue
    // Um 0 da Steam nunca apaga horas ja registadas.
    if (hours <= 0 && before > 0) continue

    const patch: Record<string, unknown> = { hours_played: hours, updated_at: new Date(now).toISOString() }
    const started = game.status === 'wishlist' && hours > 0
    if (started) patch.status = 'in_progress'
    if (hours > 0 && !game.start_date && game.status !== 'completed') patch.start_date = today
    const u = await db(`items?id=eq.${game.id}&user_id=eq.${profile.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    if (!u.ok) continue
    changed++

    const delta = Math.round((hours - before) * 100) / 100
    if (delta > 0) {
      const plausible = elapsedHours != null && delta <= 24 && delta <= elapsedHours + 0.25
      if (plausible) {
        // Horas jogadas agora: a função desconta o que o Vyllo Playtime (PC) já
        // registou destas mesmas horas, para não contarem duas vezes.
        await db('rpc/steam_log_hours', {
          method: 'POST',
          body: JSON.stringify({ p_item_id: game.id, p_delta: delta, p_note: 'steam' }),
        })
      } else {
        logs.push({
          user_id: profile.id,
          item_id: game.id,
          category: 'game',
          title: game.title,
          field: 'hours',
          delta,
          note: 'steam_import',
        })
      }
    }
    if (started) {
      logs.push({
        user_id: profile.id,
        item_id: game.id,
        category: 'game',
        title: game.title,
        field: 'status',
        delta: null,
        note: 'started',
      })
    }
  }

  if (logs.length) await db('activity_log', { method: 'POST', body: JSON.stringify(logs) })
  await db(`profiles?id=eq.${profile.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ steam_synced_at: new Date(now).toISOString() }),
  })
  return changed
}

Deno.serve(async () => {
  if (!STEAM_KEY || !SERVICE) {
    return new Response(JSON.stringify({ error: 'not configured' }), { status: 500 })
  }
  const now = Date.now()
  const cutoff = new Date(now - MIN_INTERVAL_MS).toISOString()
  const nowIso = new Date(now).toISOString()
  // Premium (qualquer das origens) e nao sincronizado nos ultimos 50 min.
  const r = await db(
    `profiles?select=id,steam_id,steam_synced_at,is_premium,google_expires_at,apple_expires_at&steam_id=not.is.null` +
      `&and=(or(steam_synced_at.is.null,steam_synced_at.lt.${cutoff}),or(is_premium.is.true,google_expires_at.gt.${nowIso},apple_expires_at.gt.${nowIso}))` +
      `&order=steam_synced_at.asc.nullsfirst&limit=${MAX_USERS}`,
  )
  if (!r.ok) return new Response(JSON.stringify({ error: 'profiles' }), { status: 500 })
  const profiles = ((await r.json()) as Profile[]).filter((p) => premium(p, now))

  let users = 0
  let games = 0
  for (const profile of profiles) {
    try {
      games += await syncUser(profile, now)
      users++
    } catch (error) {
      console.error('steam-cron', profile.id, String(error))
    }
  }
  return new Response(JSON.stringify({ users, games }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
