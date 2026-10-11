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

// Fontes nos external_games do IGDB (campo novo external_game_source; o antigo,
// category, fica como alternativa): Steam = 1, Epic Games Store = 26.
const STEAM_SOURCE = 1
const EPIC_SOURCE = 26

type Game = { id: number; name?: string; cover?: { image_id?: string }; first_release_date?: number }

const GAME_FIELDS = 'id,name,cover.image_id,first_release_date'

const toGame = (game: Game): IgdbGame => ({
  igdbId: game.id,
  title: game.name ?? '',
  coverUrl: game.cover?.image_id
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${game.cover.image_id}.jpg`
    : null,
  releaseYear: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
})

const quoted = (values: string[]) => values.map((v) => `"${v.replace(/["\\]/g, '')}"`).join(',')

/** uid de uma loja → jogo do IGDB, para os que o IGDB conhece. null = IGDB indisponível. */
async function gamesByExternalUid(source: number, uids: string[]): Promise<Map<string, IgdbGame> | null> {
  const result = new Map<string, IgdbGame>()
  if (uids.length === 0) return result
  type External = { game?: number; uid?: string }
  let externals = await query<External>(
    'external_games',
    `fields game,uid; where external_game_source = ${source} & uid = (${quoted(uids)}); limit 500;`,
  )
  externals ??= await query<External>(
    'external_games',
    `fields game,uid; where category = ${source} & uid = (${quoted(uids)}); limit 500;`,
  )
  if (externals === null) return null

  const gameIds = [...new Set(externals.map((e) => e.game).filter((g): g is number => typeof g === 'number'))]
  if (gameIds.length === 0) return result
  const games = await query<Game>('games', `fields ${GAME_FIELDS}; where id = (${gameIds.join(',')}); limit 500;`)
  if (games === null) return null
  const byId = new Map(games.map((g) => [g.id, g]))
  for (const external of externals) {
    const game = external.game === undefined ? undefined : byId.get(external.game)
    if (external.uid && game?.name) result.set(external.uid, toGame(game))
  }
  return result
}

export const gamesBySteamAppId = (appIds: string[]) =>
  gamesByExternalUid(STEAM_SOURCE, appIds.map((id) => id.replace(/[^0-9]/g, '')))

/**
 * Ids da Epic (namespace, catalog item, app name) → jogo. O IGDB guarda poucos
 * jogos da Epic, e nem sempre com o mesmo id, por isso tenta-se os três.
 */
export const gamesByEpicIds = (ids: string[]) => gamesByExternalUid(EPIC_SOURCE, ids)

/** Pesquisa por titulo (so jogos principais; com pcOnly, so os que saíram para PC). */
export async function searchGames(title: string, pcOnly: boolean, limit = 10): Promise<IgdbGame[] | null> {
  const text = title.replace(/["\\]/g, '').trim()
  if (!text) return []
  const where = pcOnly ? 'where platforms = (6) & version_parent = null;' : 'where version_parent = null;'
  const games = await query<Game>('games', `search "${text}"; fields ${GAME_FIELDS}; ${where} limit ${limit};`)
  return games === null ? null : games.filter((g) => g.name).map(toGame)
}

export async function gameById(igdbId: number): Promise<IgdbGame | null> {
  const games = await query<Game>('games', `fields ${GAME_FIELDS}; where id = ${Math.trunc(igdbId)};`)
  return games?.[0]?.name ? toGame(games[0]) : null
}
