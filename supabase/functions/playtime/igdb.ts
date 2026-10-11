// IGDB para o Vyllo Playtime: AppID da Steam → jogo. É a mesma conta (Twitch
// client credentials) e o mesmo formato de capas que a função search usa.

let token: { value: string; exp: number } | null = null

async function accessToken(): Promise<string | null> {
  const id = Deno.env.get('TWITCH_CLIENT_ID')
  const secret = Deno.env.get('TWITCH_CLIENT_SECRET')
  if (!id || !secret) return null
  if (token && token.exp > Date.now() + 60_000) return token.value
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST', signal: AbortSignal.timeout(5000) },
  )
  if (!r.ok) return null
  const d = await r.json()
  if (!d.access_token) return null
  token = { value: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 }
  return token.value
}

async function query<T>(endpoint: string, body: string): Promise<T[] | null> {
  const id = Deno.env.get('TWITCH_CLIENT_ID')
  const bearer = await accessToken()
  if (!id || !bearer) return null
  const r = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': id, Authorization: `Bearer ${bearer}` },
    body,
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) {
    console.error('igdb', endpoint, r.status, await r.text().catch(() => ''))
    return null
  }
  return (await r.json()) as T[]
}

export type IgdbGame = {
  igdbId: number
  title: string
  coverUrl: string | null
  releaseYear: number | null
}

// Steam é a fonte 1 nos external_games do IGDB (campo novo external_game_source;
// o antigo, category, fica como alternativa).
const STEAM_SOURCE = 1

/** AppID da Steam → jogo do IGDB, para os que o IGDB conhece. null = IGDB indisponível. */
export async function gamesBySteamAppId(appIds: string[]): Promise<Map<string, IgdbGame> | null> {
  const result = new Map<string, IgdbGame>()
  if (appIds.length === 0) return result
  const uids = appIds.map((id) => `"${id.replace(/[^0-9]/g, '')}"`).join(',')
  type External = { game?: number; uid?: string }
  let externals = await query<External>(
    'external_games',
    `fields game,uid; where external_game_source = ${STEAM_SOURCE} & uid = (${uids}); limit 500;`,
  )
  externals ??= await query<External>(
    'external_games',
    `fields game,uid; where category = ${STEAM_SOURCE} & uid = (${uids}); limit 500;`,
  )
  if (externals === null) return null

  const gameIds = [...new Set(externals.map((e) => e.game).filter((g): g is number => typeof g === 'number'))]
  if (gameIds.length === 0) return result
  type Game = { id: number; name?: string; cover?: { image_id?: string }; first_release_date?: number }
  const games = await query<Game>(
    'games',
    `fields id,name,cover.image_id,first_release_date; where id = (${gameIds.join(',')}); limit 500;`,
  )
  if (games === null) return null
  const byId = new Map(games.map((g) => [g.id, g]))
  for (const external of externals) {
    const game = external.game === undefined ? undefined : byId.get(external.game)
    if (!external.uid || !game?.name) continue
    result.set(external.uid, {
      igdbId: game.id,
      title: game.name,
      coverUrl: game.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${game.cover.image_id}.jpg`
        : null,
      releaseYear: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
    })
  }
  return result
}
