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
//   GET    /playtime/games/search    → pesquisa por título ("Choose another") (Premium)
//   PUT    /playtime/mappings        → "é este jogo": escolha do utilizador (Premium)
//   POST   /playtime/games/custom    → "Criar «X»": jogo só deste utilizador (Premium)
//   POST   /playtime/jobs/merge-suggestions → pg_cron: jogos do utilizador com ficha oficial
//   POST   /playtime/sessions/batch  → sessões de jogo acabadas (Premium)
//
// Desenho: repositório "Vyllo Playtime", DESIGN.md (secções 5, 11, 13 e 14).
// Publicar: supabase functions deploy playtime --no-verify-jwt --use-api

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gameById, gamesByEpicIds, gamesBySteamAppId, type IgdbGame, searchGames } from './igdb.ts'

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

const config = async (device: Device) =>
  json({
    device: {
      id: device.id,
      name: device.name,
      premium: device.premium,
      tracking_enabled: device.tracking_enabled,
      tracking_changed_at: device.tracking_changed_at,
    },
    game_remaps: await gameRemaps(device.user_id),
    min_client_version: MIN_CLIENT_VERSION,
    server_time: new Date().toISOString(),
  })

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

type Candidate = {
  ref?: unknown
  source?: unknown
  name?: unknown
  ids?: {
    steam_app_id?: unknown
    epic_namespace?: unknown
    epic_catalog_item_id?: unknown
    epic_app_name?: unknown
    manual_key?: unknown
    battlenet_uid?: unknown
  }
  // Jogos manuais: o nome da pasta e do exe e o ProductName (nunca o caminho).
  hints?: {
    folder?: unknown
    exe?: unknown
    product_name?: unknown
  }
}
type GameRow = { id: string; igdb_id: number | null; title: string; cover_url: string | null; release_year: number | null }
type Decision = {
  decision: 'auto' | 'ask' | 'unknown'
  confidence: number
  method: string
  // auto: o jogo da Vyllo (com id); ask: a sugestão (do IGDB, ainda sem id da Vyllo)
  game?: GameRow | IgdbGame
  alternatives?: IgdbGame[]
}

const GAME_COLUMNS = 'id, igdb_id, title, cover_url, release_year'
const DAY_MS = 86_400_000

const gameJson = (g: GameRow | IgdbGame) =>
  'igdbId' in g
    ? { igdb_id: g.igdbId, title: g.title, cover_url: g.coverUrl, release_year: g.releaseYear }
    : { id: g.id, igdb_id: g.igdb_id, title: g.title, cover_url: g.cover_url, release_year: g.release_year }

// O id do jogo no launcher: o AppID na Steam; namespace:catalogItemId na Epic;
// "pasta/exe" num jogo manual (só serve para as escolhas deste utilizador).
function launcherKey(c: Candidate): string | null {
  if (c.source === 'steam') {
    const id = String(c.ids?.steam_app_id ?? '').replace(/[^0-9]/g, '')
    return id || null
  }
  if (c.source === 'epic') {
    const ns = text(c.ids?.epic_namespace, 100)
    const item = text(c.ids?.epic_catalog_item_id, 100)
    return ns && item ? `${ns}:${item}` : null
  }
  if (c.source === 'manual') return text(c.ids?.manual_key, 300)?.toLowerCase() ?? null
  if (c.source === 'battlenet') {
    const uid = text(c.ids?.battlenet_uid, 100)?.toLowerCase()
    return uid ? battlenetProduct(uid) : null
  }
  return null
}

// Produtos da Battle.net (uid do desinstalador, sem a língua) → título oficial no
// IGDB (DESIGN.md, secção 8). Por validar numa máquina com a Battle.net; corrige-se
// aqui sem lançar uma versão nova do PC. O Call of Duty fica de fora: uma
// instalação do CoD HQ tem vários jogos, e o utilizador escolhe.
const BATTLENET_TITLES: Record<string, string> = {
  prometheus: 'Overwatch 2',
  fenris: 'Diablo IV',
  wow: 'World of Warcraft',
  wow_classic: 'World of Warcraft Classic',
  wow_classic_era: 'World of Warcraft Classic',
  hs_beta: 'Hearthstone',
  heroes: 'Heroes of the Storm',
  s2: 'StarCraft II: Wings of Liberty',
  s1: 'StarCraft: Remastered',
  osi: 'Diablo II: Resurrected',
  diablo3: 'Diablo III',
  w3: 'Warcraft III: Reforged',
  anbs: 'Diablo Immortal',
  gryphon: 'Warcraft Rumble',
}

// "wow_enus" → "wow"; "wow_classic_era" → "wow_classic_era"; um uid fora da
// tabela fica como está.
function battlenetProduct(uid: string): string {
  const known = Object.keys(BATTLENET_TITLES)
    .filter((key) => uid === key || uid.startsWith(key + '_'))
    .sort((a, b) => b.length - a.length)[0]
  return known ?? uid
}

// ProductNames que dizem o motor ou a empresa, não o jogo.
const GENERIC_PRODUCT = /^(unity|unreal engine|ue4|ue5|game|godot engine|gamemaker|launcher)$/i

// Os nomes a experimentar no IGDB, por ordem: o que o PC mostra, o ProductName
// do exe, a pasta e o nome do exe ("ProjectZeta.exe" → "Project Zeta").
function titleGuesses(c: Candidate, name: string): string[] {
  const product = text(c.hints?.product_name, 200)
  const exe = text(c.hints?.exe, 200)
    ?.replace(/\.exe$/i, '')
    .replace(/[-_](win64|win32|shipping|x64|dx1[12])/gi, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
  const guesses = [name, product && !GENERIC_PRODUCT.test(product) ? product : null, text(c.hints?.folder, 200), exe]
  const seen = new Set<string>()
  return guesses.filter((g): g is string => {
    if (!g) return false
    const key = normalizeTitle(g)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Os ids que o IGDB pode ter para o jogo nessa loja.
function storeUids(c: Candidate): string[] {
  if (c.source === 'steam') return [launcherKey(c)].filter((v): v is string => !!v)
  return [c.ids?.epic_catalog_item_id, c.ids?.epic_namespace, c.ids?.epic_app_name]
    .map((v) => text(v, 100))
    .filter((v): v is string => !!v)
}

// Para comparar títulos: minúsculas, sem acentos nem símbolos, numerais romanos
// em árabes, sem sufixos de edição ("Control Ultimate Edition" = "Control").
const EDITION =
  /\b(game of the year|goty|deluxe|definitive|ultimate|complete|standard|digital|enhanced|anniversary|director'?s cut)\b|\bedition\b/g
const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' }

function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(EDITION, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => ROMAN[word] ?? word)
    .join(' ')
}

// O mesmo título, com ou sem espaços: as pastas e os exes juntam as palavras
// ("ForHonor" é "For Honor"; "ShiftAtMidnight" é "Shift at Midnight").
function sameTitle(a: string, b: string): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  return na === nb || (na.length > 0 && na.replace(/ /g, '') === nb.replace(/ /g, ''))
}

// Títulos parecidos: um contém o outro, ou partilham a maior parte das palavras.
function similar(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a.startsWith(b) || b.startsWith(a)) return true
  const wa = new Set(a.split(' '))
  const wb = new Set(b.split(' '))
  const common = [...wa].filter((w) => wb.has(w)).length
  return common / new Set([...wa, ...wb]).size >= 0.6
}

// O IGDB ordena a pesquisa à sua maneira ("Control" não vem em primeiro para
// "Control"): o título exato primeiro, depois os que começam por ele, depois os
// parecidos; dentro de cada grupo fica a ordem do IGDB.
function rankByTitle(games: IgdbGame[], query: string): IgdbGame[] {
  const wanted = normalizeTitle(query)
  const score = (g: IgdbGame) => {
    const title = normalizeTitle(g.title)
    if (sameTitle(g.title, query)) return 0
    if (title.startsWith(wanted)) return 1
    return similar(title, wanted) ? 2 : 3
  }
  return games
    .map((g, i) => ({ g, i, s: score(g) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.g)
}

/** Grava jogos do IGDB no catálogo (o id da Vyllo nasce aqui). null = erro. */
async function saveIgdbGames(games: IgdbGame[]): Promise<Map<number, GameRow> | null> {
  const unique = [...new Map(games.map((g) => [g.igdbId, g])).values()]
  if (unique.length === 0) return new Map()
  const { data, error } = await supabase
    .from('games')
    .upsert(
      unique.map((g) => ({ igdb_id: g.igdbId, title: g.title, cover_url: g.coverUrl, release_year: g.releaseYear })),
      { onConflict: 'igdb_id' },
    )
    .select(GAME_COLUMNS)
  if (error) {
    console.error('playtime games upsert', error.message)
    return null
  }
  return new Map((data as GameRow[]).map((g) => [g.igdb_id as number, g]))
}

/**
 * Pelo título (DESIGN.md, secção 11): exato e único entre os jogos de PC do
 * IGDB → auto (o launcher já garante que é um jogo com esse nome); exato mas
 * com homónimos, ou só parecido → ask; nada → unknown, com sugestões para a
 * pesquisa. null = IGDB indisponível.
 */
async function byTitle(name: string): Promise<Decision | null> {
  const results = await searchGames(name, true, 50)
  if (results === null) return null
  const found = rankByTitle(results, name)
  const wanted = normalizeTitle(name)
  const exact = found.filter((g) => sameTitle(g.title, name))
  const others = (picked: IgdbGame[]) => found.filter((g) => !picked.includes(g))

  if (exact.length === 1) {
    const saved = await saveIgdbGames(exact)
    const game = saved?.get(exact[0].igdbId)
    if (!game) return null
    return { decision: 'auto', confidence: 90, method: 'title_unique', game, alternatives: others(exact).slice(0, 4) }
  }
  if (exact.length > 1) {
    return {
      decision: 'ask',
      confidence: 84,
      method: 'title_ambiguous',
      game: exact[0],
      alternatives: [...exact.slice(1), ...others(exact)].slice(0, 5),
    }
  }
  // Entre os parecidos, o de tamanho mais próximo: "Tom Clancy's Rainbow Six
  // Siege" está mais perto de "... Siege X" do que de "... Siege: North Star".
  const close = found
    .filter((g) => similar(normalizeTitle(g.title), wanted))
    .sort((a, b) =>
      Math.abs(normalizeTitle(a.title).length - wanted.length) - Math.abs(normalizeTitle(b.title).length - wanted.length)
    )[0]
  if (close) {
    return { decision: 'ask', confidence: 70, method: 'title_similar', game: close, alternatives: others([close]).slice(0, 5) }
  }
  return { decision: 'unknown', confidence: 0, method: 'title_none', alternatives: found.slice(0, 5) }
}

async function resolveGames(req: Request, device: Device): Promise<Response> {
  if (!device.premium) return fail('premium_required', 402)
  const body = await req.json().catch(() => null)
  const candidates: Candidate[] = Array.isArray(body?.candidates) ? body.candidates : []
  if (candidates.length === 0 || candidates.length > 100) return fail('bad_request', 400)

  const items = candidates.map((c, i) => ({ c, i, source: String(c.source ?? ''), key: launcherKey(c), name: text(c.name, 200) }))
  const decisions = new Map<number, Decision>()
  const open = () => items.filter((it) => it.key && !decisions.has(it.i))

  // 1. O que este utilizador já confirmou ("é este jogo").
  if (open().length > 0) {
    const { data } = await supabase
      .from('playtime_user_mappings')
      .select(`source, match_key, games(${GAME_COLUMNS})`)
      .eq('user_id', device.user_id)
      .in('match_key', open().map((it) => it.key as string))
    for (const row of (data ?? []) as unknown as { source: string; match_key: string; games: GameRow }[]) {
      for (const it of open()) {
        if (row.games && it.source === row.source && it.key === row.match_key) {
          decisions.set(it.i, { decision: 'auto', confidence: 100, method: 'user', game: row.games })
        }
      }
    }
  }

  for (const source of ['steam', 'epic']) {
    // 2. O catálogo partilhado (só identificações feitas pelo servidor).
    const keys = open().filter((it) => it.source === source).map((it) => it.key as string)
    if (keys.length === 0) continue
    const { data: known } = await supabase
      .from('game_external_ids')
      .select(`external_id, method, confidence, games(${GAME_COLUMNS})`)
      .eq('source', source)
      .in('external_id', keys)
    for (const row of (known ?? []) as unknown as { external_id: string; method: string; confidence: number; games: GameRow }[]) {
      for (const it of open()) {
        if (row.games && it.source === source && it.key === row.external_id) {
          decisions.set(it.i, { decision: 'auto', confidence: row.confidence, method: row.method, game: row.games })
        }
      }
    }

    // 3. O IGDB pelo id da loja, exceto o que falhou há menos de um dia.
    const pending = open().filter((it) => it.source === source)
    if (pending.length === 0) continue
    const { data: misses } = await supabase
      .from('game_resolve_misses')
      .select('external_id')
      .eq('source', source)
      .in('external_id', pending.map((it) => it.key as string))
      .gt('checked_at', new Date(Date.now() - DAY_MS).toISOString())
    const skip = new Set((misses ?? []).map((m: { external_id: string }) => m.external_id))
    const ask = pending.filter((it) => !skip.has(it.key as string))
    if (ask.length === 0) continue
    const byUid = source === 'steam'
      ? await gamesBySteamAppId(ask.map((it) => it.key as string))
      : await gamesByEpicIds([...new Set(ask.flatMap((it) => storeUids(it.c)))])
    if (byUid === null) continue // IGDB indisponível: fica para a próxima procura
    const saved = await saveIgdbGames([...byUid.values()])
    if (saved === null) return fail('server_error', 500)
    const links = []
    const missed = []
    for (const it of ask) {
      const hit = storeUids(it.c).map((uid) => byUid.get(uid)).find((g) => g !== undefined)
      const game = hit ? saved.get(hit.igdbId) : undefined
      if (game) {
        decisions.set(it.i, { decision: 'auto', confidence: 97, method: 'igdb_external', game })
        links.push({ source, external_id: it.key, game_id: game.id, method: 'igdb_external', confidence: 97 })
      } else {
        missed.push(it.key as string)
      }
    }
    if (links.length > 0) await supabase.from('game_external_ids').upsert(links, { onConflict: 'source,external_id' })
    if (missed.length > 0) {
      await supabase.from('game_resolve_misses').upsert(
        missed.map((id) => ({ source, external_id: id, checked_at: new Date().toISOString() })),
        { onConflict: 'source,external_id' },
      )
    }
  }

  // 3b. Battle.net: o produto na tabela → o título oficial, exato e único no IGDB.
  //     A identificação fica na cache partilhada (o uid é público), com 97.
  const bnet = open().filter((it) => it.source === 'battlenet')
  if (bnet.length > 0) {
    const { data: known } = await supabase
      .from('game_external_ids')
      .select(`external_id, method, confidence, games(${GAME_COLUMNS})`)
      .eq('source', 'battlenet')
      .in('external_id', bnet.map((it) => it.key as string))
    for (const row of (known ?? []) as unknown as { external_id: string; method: string; confidence: number; games: GameRow }[]) {
      for (const it of bnet) {
        if (row.games && it.key === row.external_id) {
          decisions.set(it.i, { decision: 'auto', confidence: row.confidence, method: row.method, game: row.games })
        }
      }
    }
    for (const it of open().filter((it) => it.source === 'battlenet')) {
      const title = BATTLENET_TITLES[it.key as string]
      if (!title) continue
      const found = await searchGames(title, true, 50)
      if (found === null) break // IGDB indisponível: fica para a próxima procura
      const exact = found.filter((g) => sameTitle(g.title, title))
      if (exact.length !== 1) continue
      const game = (await saveIgdbGames(exact))?.get(exact[0].igdbId)
      if (!game) continue
      decisions.set(it.i, { decision: 'auto', confidence: 97, method: 'static_table', game })
      await supabase.from('game_external_ids').upsert(
        { source: 'battlenet', external_id: it.key, game_id: game.id, method: 'static_table', confidence: 97 },
        { onConflict: 'source,external_id' },
      )
    }
  }

  // 4. Pelo título. Não para a Steam: uma app da Steam que o IGDB não conhece
  //    pelo AppID não é um jogo (ex.: Wallpaper Engine).
  //    Num jogo manual experimenta os nomes que o PC mandou (pasta, exe, produto),
  //    e o resultado nunca vai para a cache partilhada: "pasta/exe" é só deste PC.
  //    Um produto da Battle.net fora da tabela nunca é identificado sozinho (o
  //    "Call of Duty" do CoD HQ tem vários jogos): no máximo, uma sugestão.
  for (const it of items) {
    if (decisions.has(it.i) || it.source === 'steam' || !it.name) continue
    let decision: Decision | null = null
    for (const guess of it.source === 'manual' ? titleGuesses(it.c, it.name) : [it.name]) {
      const attempt = await byTitle(guess)
      if (attempt === null) break // IGDB indisponível
      if (decision === null || (decision.decision === 'unknown' && attempt.decision !== 'unknown')) decision = attempt
      if (decision.decision !== 'unknown') break
    }
    if (decision === null) continue
    if (it.source === 'battlenet' && decision.decision === 'auto') {
      decision = { ...decision, decision: 'ask', confidence: Math.min(decision.confidence, 84), method: 'battlenet_title' }
    }
    decisions.set(it.i, decision)
    if (decision.decision === 'auto' && it.key && it.source !== 'manual' && decision.game && 'id' in decision.game) {
      await supabase.from('game_external_ids').upsert(
        { source: it.source, external_id: it.key, game_id: decision.game.id, method: decision.method, confidence: decision.confidence },
        { onConflict: 'source,external_id' },
      )
    }
  }

  const results = items.map((it) => {
    const d = decisions.get(it.i)
    return d
      ? {
        ref: it.c.ref,
        decision: d.decision,
        confidence: d.confidence,
        method: d.method,
        game: d.game ? gameJson(d.game) : undefined,
        alternatives: (d.alternatives ?? []).map(gameJson),
      }
      : { ref: it.c.ref, decision: 'unknown', confidence: 0, alternatives: [] }
  })
  return json({ results })
}

// "Choose another" / "Search Vyllo": jogos do IGDB por título (todas as plataformas).
async function searchCatalog(req: Request, device: Device): Promise<Response> {
  if (!device.premium) return fail('premium_required', 402)
  const q = text(new URL(req.url).searchParams.get('q'), 100)
  if (!q || q.length < 2) return fail('bad_request', 400)
  const found = await searchGames(q, false, 50)
  if (found === null) return fail('server_error', 503)
  return json({ results: rankByTitle(found, q).slice(0, 10).map(gameJson) })
}

const storedKey = (source: string, key: string) =>
  source === 'battlenet' ? battlenetProduct(key.toLowerCase()) : source === 'manual' ? key.toLowerCase() : key

// "É este jogo": guarda a escolha do utilizador (por igdb_id ou id da Vyllo).
async function saveMappings(req: Request, device: Device): Promise<Response> {
  if (!device.premium) return fail('premium_required', 402)
  const body = await req.json().catch(() => null)
  const mappings = Array.isArray(body?.mappings) ? body.mappings : null
  if (!mappings || mappings.length === 0 || mappings.length > 100) return fail('bad_request', 400)

  const results = []
  for (const m of mappings) {
    const source = text(m?.source, 20)
    const matchKey = text(m?.match_key, 300)
    if (!source || !matchKey) {
      results.push({ source, match_key: matchKey, status: 'bad_request' })
      continue
    }
    let game: GameRow | undefined
    const igdbId = Number(m?.igdb_id)
    if (Number.isInteger(igdbId) && igdbId > 0) {
      const { data: existing } = await supabase.from('games').select(GAME_COLUMNS).eq('igdb_id', igdbId).maybeSingle()
      if (existing) {
        game = existing as GameRow
      } else {
        const fromIgdb = await gameById(igdbId)
        if (fromIgdb) game = (await saveIgdbGames([fromIgdb]))?.get(igdbId)
      }
    } else if (typeof m?.game_id === 'string') {
      const { data } = await supabase
        .from('games')
        .select(`${GAME_COLUMNS}, kind, created_by`)
        .eq('id', m.game_id)
        .maybeSingle()
      if (data && (data.kind === 'official' || data.created_by === device.user_id)) game = data as GameRow
    }
    if (!game) {
      results.push({ source, match_key: matchKey, status: 'unknown_game' })
      continue
    }
    const { error } = await supabase.from('playtime_user_mappings').upsert(
      // Guardada com a mesma chave que a identificação procura (o produto da
      // Battle.net sem a língua, "wow_enus" → "wow"); a resposta devolve a do PC.
      { user_id: device.user_id, source, match_key: storedKey(source, matchKey), game_id: game.id },
      { onConflict: 'user_id,source,match_key' },
    )
    if (error) {
      console.error('playtime mapping', error.message)
      return fail('server_error', 500)
    }
    results.push({ source, match_key: matchKey, status: 'saved', game: gameJson(game) })
  }
  return json({ results })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "Criar «X»": um jogo que não está no catálogo, só deste utilizador (DESIGN.md,
// secção 12.2). O client_ref vem do PC: repetir o pedido devolve o mesmo jogo.
async function createCustomGame(req: Request, device: Device): Promise<Response> {
  if (!device.premium) return fail('premium_required', 402)
  const body = await req.json().catch(() => null)
  const clientRef = text(body?.client_ref, 36)
  const title = text(body?.title, 200)
  if (!clientRef || !UUID.test(clientRef) || !title) return fail('bad_request', 400)

  const { error } = await supabase.from('games').upsert(
    { kind: 'user_created', created_by: device.user_id, client_ref: clientRef.toLowerCase(), title },
    { onConflict: 'created_by,client_ref', ignoreDuplicates: true },
  )
  if (error) {
    console.error('playtime custom game', error.message)
    return fail('server_error', 500)
  }
  const { data: game, error: readError } = await supabase
    .from('games')
    .select(GAME_COLUMNS)
    .eq('created_by', device.user_id)
    .eq('client_ref', clientRef.toLowerCase())
    .single()
  if (readError || !game) {
    console.error('playtime custom game read', readError?.message)
    return fail('server_error', 500)
  }
  return json({ game: gameJson(game as GameRow) }, 201)
}

// Uma vez por dia (pg_cron): jogos criados pelos utilizadores que entretanto
// apareceram no catálogo oficial. Só sugere com título exato e único entre os
// jogos de PC (90); o utilizador decide na app (secção 12.3). Cada chamada vê no
// máximo 50 jogos, e cada jogo uma vez por semana: chamar mais vezes não custa.
async function mergeSuggestionsJob(): Promise<Response> {
  const { data: pending, error } = await supabase
    .from('games')
    .select('id, title, created_by')
    .eq('kind', 'user_created')
    .is('merged_into', null)
    .or(`merge_checked_at.is.null,merge_checked_at.lt.${new Date(Date.now() - 7 * DAY_MS).toISOString()}`)
    .limit(50)
  if (error) {
    console.error('playtime merge job', error.message)
    return fail('server_error', 500)
  }
  let suggested = 0
  for (const game of (pending ?? []) as { id: string; title: string; created_by: string }[]) {
    // Um jogo que nenhum PC nem nenhuma sessão usa (o utilizador escolheu outro
    // entretanto) não precisa de ser juntado a nada.
    const [{ data: mapped }, { data: played }] = await Promise.all([
      supabase.from('playtime_user_mappings').select('game_id').eq('game_id', game.id).limit(1),
      supabase.from('playtime_sessions').select('id').eq('game_id', game.id).limit(1),
    ])
    const inUse = (mapped?.length ?? 0) > 0 || (played?.length ?? 0) > 0
    const found = inUse ? await searchGames(game.title, true, 50) : []
    if (found === null) break // IGDB indisponível: fica para amanhã
    const exact = found.filter((g) => sameTitle(g.title, game.title))
    if (exact.length === 1) {
      const official = (await saveIgdbGames(exact))?.get(exact[0].igdbId)
      if (official) {
        const { error: insertError } = await supabase.from('game_merge_suggestions').upsert(
          { user_id: game.created_by, from_game: game.id, to_game: official.id, confidence: 90 },
          { onConflict: 'from_game,to_game', ignoreDuplicates: true },
        )
        if (!insertError) suggested++
      }
    }
    await supabase.from('games').update({ merge_checked_at: new Date().toISOString() }).eq('id', game.id)
  }
  return json({ checked: pending?.length ?? 0, suggested })
}

// Jogos do utilizador que passaram a ter ficha oficial: o PC troca o id (secção 12.3).
async function gameRemaps(userId: string): Promise<{ from: string; to: string }[]> {
  const { data, error } = await supabase
    .from('games')
    .select('id, merged_into')
    .eq('created_by', userId)
    .not('merged_into', 'is', null)
  if (error) {
    console.error('playtime remaps', error.message)
    return []
  }
  const rows = (data ?? []) as { id: string; merged_into: string }[]
  const next = new Map<string, string>(rows.map((g) => [g.id, g.merged_into]))
  return [...next.keys()].map((from) => {
    let to = next.get(from)!
    for (let hops = 0; next.has(to) && hops < 10; hops++) to = next.get(to)!
    return { from, to }
  })
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
    if (req.method === 'GET' && path === '/games/search') {
      return await withDevice(req, (device) => searchCatalog(req, device))
    }
    if (req.method === 'PUT' && path === '/mappings') {
      return await withDevice(req, (device) => saveMappings(req, device))
    }
    if (req.method === 'POST' && path === '/games/custom') {
      return await withDevice(req, (device) => createCustomGame(req, device))
    }
    if (req.method === 'POST' && path === '/jobs/merge-suggestions') return await mergeSuggestionsJob()
    if (req.method === 'POST' && path === '/sessions/batch') {
      return await withDevice(req, (device) => ingestSessions(req, device))
    }
    return fail('not_found', 404)
  } catch (e) {
    console.error('playtime', (e as Error).message)
    return fail('server_error', 500)
  }
})
