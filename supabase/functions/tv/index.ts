const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE = new Map<string, { t: number; data: unknown }>()
const TTL = 1000 * 60 * 60 * 12

function cacheGet(k: string) {
  const v = CACHE.get(k)
  return v && Date.now() - v.t < TTL ? v.data : null
}
function cacheSet(k: string, data: unknown) {
  if (CACHE.size >= 400) CACHE.delete(CACHE.keys().next().value)
  CACHE.set(k, { t: Date.now(), data })
}

async function nextEpisodeOf(title: string) {
  const ck = `tv:${(title || '').toLowerCase()}`
  const hit = cacheGet(ck)
  if (hit !== null) return hit

  let out = null
  try {
    const r = await fetch(
      `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}&embed=nextepisode`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (r.ok) {
      const show = await r.json()
      const ep = show?._embedded?.nextepisode
      if (ep && ep.airdate) {
        out = { season: ep.season, number: ep.number, name: ep.name || '', airDate: ep.airdate, status: show.status || null }
      } else {
        out = { status: show?.status || null }
      }
    }
  } catch { /* timeout or network error */ }
  cacheSet(ck, out)
  return out
}

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

    if (body.action === 'next') {
      const { title } = body
      if (!title) return json({ error: 'title required' }, 400)
      const data = await nextEpisodeOf(title)
      return json(data || { status: null })
    }

    if (body.action === 'upcoming') {
      const shows = Array.isArray(body.shows) ? body.shows.slice(0, 20) : []
      const results = await Promise.all(shows.map(async (s: { title: string; itemId?: string; cover?: string }) => {
        const ep = await nextEpisodeOf(s.title) as { airDate?: string; season?: number; number?: number; name?: string } | null
        if (!ep || !ep.airDate) return null
        return { itemId: s.itemId ?? null, title: s.title, cover: s.cover ?? null, season: ep.season, number: ep.number, name: ep.name, airDate: ep.airDate }
      }))
      const upcoming = results.filter(Boolean).sort((a, b) => ((a as { airDate: string }).airDate || '').localeCompare((b as { airDate: string }).airDate || ''))
      return json(upcoming)
    }

    return json({ error: 'action required (next | upcoming)' }, 400)
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
