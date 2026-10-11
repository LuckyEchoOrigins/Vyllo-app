// Vyllo Playtime (a app do PC, Windows): ligar o PC à conta e ler o estado dele.
//
// O PC não usa a sessão Supabase do utilizador. Tem um token próprio (vpt_...),
// que só serve para estas rotas e que o utilizador revoga na app Vyllo. Por isso
// esta função é publicada com --no-verify-jwt e o token é verificado aqui
// (só o hash sha256 está guardado na base de dados).
//
//   POST   /playtime/pairings        → código para introduzir na app Vyllo
//   POST   /playtime/pairings/poll   → o PC espera pela aprovação e recebe o token
//   GET    /playtime/config          → estado do PC (Premium, tracking ligado)
//   DELETE /playtime/device          → desligar este PC ("Sign out" no PC)
//   POST   /playtime/games/resolve   → jogos instalados → jogos da Vyllo (Premium)
//   POST   /playtime/sessions/batch  → sessões de jogo acabadas (Premium)
//
// Desenho: repositório "Vyllo Playtime", DESIGN.md (secções 5, 11, 13 e 14).
// Publicar: supabase functions deploy playtime --no-verify-jwt --use-api

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gamesBySteamAppId } from './igdb.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const PAIRING_TTL_SECONDS = 600
const POLL_INTERVAL_SECONDS = 3
// Sem vogais nem caracteres que se confundem (0/O, 1/I), como na RFC 8628.
const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
const MIN_CLIENT_VERSION = '0.1.0'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const fail = (code: string, status: number) => json({ error: { code } }, status)

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, max)
}

function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const base64 = btoa(String.fromCharCode(...bytes))
  return prefix + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// 8 letras ao acaso, 'KTRV-BQXM'. Bytes >= 240 são descartados para todas as
// letras terem a mesma probabilidade (256 não é múltiplo de 20).
function userCode(): string {
  let code = ''
  while (code.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 240 && code.length < 8) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

async function createPairing(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null)
  const deviceName = text(body?.device_name, 64)
  if (!deviceName) return fail('bad_request', 400)

  // Limpeza de passagem: pedidos com mais de um dia já não servem para nada.
  await supabase
    .from('playtime_pairings')
    .delete()
    .lt('expires_at', new Date(Date.now() - 86_400_000).toISOString())

  const deviceCode = randomToken('dc_')
  const deviceCodeHash = await sha256Hex(deviceCode)
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = userCode()
    const { error } = await supabase.from('playtime_pairings').insert({
      device_code_hash: deviceCodeHash,
      user_code: code,
      device_name: deviceName,
      os_version: text(body?.os_version, 64),
      app_version: text(body?.app_version, 32),
      expires_at: new Date(Date.now() + PAIRING_TTL_SECONDS * 1000).toISOString(),
    })
    if (!error) {
      return json({
        device_code: deviceCode,
        user_code: code,
        expires_in: PAIRING_TTL_SECONDS,
        interval: POLL_INTERVAL_SECONDS,
      }, 201)
    }
    // 23505: o código já existe; tenta outro.
    if (error.code !== '23505') {
      console.error('playtime pairing insert', error.message)
      return fail('server_error', 500)
    }
  }
  return fail('server_error', 500)
}

async function pollPairing(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null)
  const deviceCode = text(body?.device_code, 100)
  if (!deviceCode?.startsWith('dc_')) return fail('bad_request', 400)

  // O token só é guardado (o hash) se o pedido já foi aprovado.
  const token = randomToken('vpt_')
  const { data, error } = await supabase.rpc('playtime_pairing_claim', {
    p_device_code_hash: await sha256Hex(deviceCode),
    p_token_hash: await sha256Hex(token),
  })
  if (error) {
    console.error('playtime pairing claim', error.message)
    return fail('server_error', 500)
  }
  switch (data?.status) {
    case 'pending':
      return json({ status: 'pending' }, 202)
    case 'approved':
      return json({
        status: 'approved',
        device_id: data.device_id,
        device_token: token,
        user_display: data.user_display ?? null,
      })
    case 'denied':
      return fail('denied', 403)
    default:
      return fail('expired', 410)
  }
}

type Device = {
  id: string
  user_id: string
  name: string
  premium: boolean
  tracking_enabled: boolean
  tracking_changed_at: string
}

// O PC pelo token. undefined = erro do servidor (o PC não pode concluir que foi
// removido só porque a base de dados falhou); null = token que não vale.
async function authenticate(req: Request): Promise<Device | null | undefined> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token.startsWith('vpt_')) return null
  const { data, error } = await supabase.rpc('playtime_device_session', {
    p_token_hash: await sha256Hex(token),
  })
  if (error) {
    console.error('playtime device session', error.message)
    return undefined
  }
  return (data as Device | null) ?? null
}

async function withDevice(req: Request, handler: (device: Device) => Promise<Response>) {
  const device = await authenticate(req)
  if (device === undefined) return fail('server_error', 500)
  if (device === null) return fail('device_revoked', 401)
  return handler(device)
}

const config = (device: Device) =>
  Promise.resolve(json({
    device: {
      id: device.id,
      name: device.name,
      premium: device.premium,
      tracking_enabled: device.tracking_enabled,
      tracking_changed_at: device.tracking_changed_at,
    },
    min_client_version: MIN_CLIENT_VERSION,
    server_time: new Date().toISOString(),
  }))

async function unlink(device: Device): Promise<Response> {
  const { error } = await supabase
    .from('playtime_devices')
    .update({ token_hash: null, revoked_at: new Date().toISOString() })
    .eq('id', device.id)
  if (error) {
    console.error('playtime unlink', error.message)
    return fail('server_error', 500)
  }
  return new Response(null, { status: 204 })
}

// ── Jogos ───────────────────────────────────────────────────────────────────

type Candidate = { ref?: unknown; source?: unknown; ids?: { steam_app_id?: unknown } }
type GameRow = { id: string; igdb_id: number | null; title: string; cover_url: string | null; release_year: number | null }

const gameJson = (g: GameRow) => ({
  id: g.id,
  title: g.title,
  cover_url: g.cover_url,
  release_year: g.release_year,
  igdb_id: g.igdb_id,
})

// Fase 1: jogos da Steam, pelo AppID (IGDB external_games). Os que o IGDB não
// conhece ficam "unknown" (ex.: Wallpaper Engine) e não são medidos. A
// correspondência por título, com confirmação do utilizador, vem na Fase 2.
async function resolveGames(req: Request, device: Device): Promise<Response> {
  if (!device.premium) return fail('premium_required', 402)
  const body = await req.json().catch(() => null)
  const candidates: Candidate[] = Array.isArray(body?.candidates) ? body.candidates : []
  if (candidates.length === 0 || candidates.length > 100) return fail('bad_request', 400)

  const steamIds = [...new Set(candidates
    .filter((c) => c.source === 'steam')
    .map((c) => String(c.ids?.steam_app_id ?? '').replace(/[^0-9]/g, ''))
    .filter((id) => id.length > 0))]
  const found = new Map<string, GameRow>()

  if (steamIds.length > 0) {
    // 1. O que já está no catálogo.
    const { data: known } = await supabase
      .from('game_external_ids')
      .select('external_id, games(id, igdb_id, title, cover_url, release_year)')
      .eq('source', 'steam')
      .in('external_id', steamIds)
    for (const row of (known ?? []) as unknown as { external_id: string; games: GameRow }[]) {
      if (row.games) found.set(row.external_id, row.games)
    }

    // 2. O resto ao IGDB, exceto o que falhou há menos de um dia.
    const { data: misses } = await supabase
      .from('game_resolve_misses')
      .select('external_id')
      .eq('source', 'steam')
      .in('external_id', steamIds)
      .gt('checked_at', new Date(Date.now() - 86_400_000).toISOString())
    const skip = new Set((misses ?? []).map((m: { external_id: string }) => m.external_id))
    const ask = steamIds.filter((id) => !found.has(id) && !skip.has(id))
    if (ask.length > 0) {
      const igdb = await gamesBySteamAppId(ask)
      if (igdb !== null) {
        if (igdb.size > 0) {
          const { data: games, error } = await supabase
            .from('games')
            .upsert(
              [...new Map([...igdb.values()].map((g) => [g.igdbId, g])).values()].map((g) => ({
                igdb_id: g.igdbId,
                title: g.title,
                cover_url: g.coverUrl,
                release_year: g.releaseYear,
              })),
              { onConflict: 'igdb_id' },
            )
            .select('id, igdb_id, title, cover_url, release_year')
          if (error) {
            console.error('playtime games upsert', error.message)
            return fail('server_error', 500)
          }
          const byIgdb = new Map((games as GameRow[]).map((g) => [g.igdb_id, g]))
          const links = []
          for (const [appId, g] of igdb) {
            const game = byIgdb.get(g.igdbId)
            if (!game) continue
            found.set(appId, game)
            links.push({ source: 'steam', external_id: appId, game_id: game.id, method: 'igdb_external', confidence: 97 })
          }
          await supabase.from('game_external_ids').upsert(links, { onConflict: 'source,external_id' })
        }
        const missed = ask.filter((id) => !igdb.has(id))
        if (missed.length > 0) {
          await supabase.from('game_resolve_misses').upsert(
            missed.map((id) => ({ source: 'steam', external_id: id, checked_at: new Date().toISOString() })),
            { onConflict: 'source,external_id' },
          )
        }
      }
    }
  }

  const results = candidates.map((c) => {
    const appId = String(c.ids?.steam_app_id ?? '').replace(/[^0-9]/g, '')
    const game = c.source === 'steam' ? found.get(appId) : undefined
    return game
      ? { ref: c.ref, decision: 'auto', confidence: 97, method: 'igdb_external', game: gameJson(game) }
      : { ref: c.ref, decision: 'unknown', confidence: 0 }
  })
  return json({ results })
}

// ── Sessões ─────────────────────────────────────────────────────────────────

async function ingestSessions(req: Request, device: Device): Promise<Response> {
  if (!device.premium) return fail('premium_required', 402)
  const body = await req.json().catch(() => null)
  const sessions = Array.isArray(body?.sessions) ? body.sessions : null
  if (!sessions || sessions.length === 0 || sessions.length > 100) return fail('bad_request', 400)

  // Relógio do PC muito desacertado (mais de 2 min): corrige as horas das sessões.
  const sentAt = Date.parse(String(body?.sent_at ?? ''))
  const skew = Number.isNaN(sentAt) ? 0 : Math.round((Date.now() - sentAt) / 1000)
  const { data, error } = await supabase.rpc('playtime_ingest_sessions', {
    p_device_id: device.id,
    p_sessions: sessions,
    p_skew_seconds: Math.abs(skew) > 120 ? skew : 0,
  })
  if (error) {
    if (error.message.includes('premium_required')) return fail('premium_required', 402)
    if (error.message.includes('device_revoked')) return fail('device_revoked', 401)
    console.error('playtime ingest', error.message)
    return fail('server_error', 500)
  }
  return json({ results: data ?? [], server_time: new Date().toISOString() })
}

Deno.serve(async (req) => {
  // '/functions/v1/playtime/pairings' ou '/playtime/pairings' → '/pairings'
  const path = new URL(req.url).pathname.replace(/^.*?\/playtime(?=\/|$)/, '') || '/'
  try {
    if (req.method === 'POST' && path === '/pairings') return await createPairing(req)
    if (req.method === 'POST' && path === '/pairings/poll') return await pollPairing(req)
    if (req.method === 'GET' && path === '/config') return await withDevice(req, config)
    if (req.method === 'DELETE' && path === '/device') return await withDevice(req, unlink)
    if (req.method === 'POST' && path === '/games/resolve') {
      return await withDevice(req, (device) => resolveGames(req, device))
    }
    if (req.method === 'POST' && path === '/sessions/batch') {
      return await withDevice(req, (device) => ingestSessions(req, device))
    }
    return fail('not_found', 404)
  } catch (e) {
    console.error('playtime', (e as Error).message)
    return fail('server_error', 500)
  }
})
