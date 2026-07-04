import { supabase } from './supabase'

const uid = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

// Dev-only fallback: when running locally with no Supabase session, items live in
// localStorage instead of the database so the UI is still usable without logging in.
const DEMO_KEY = 'demoItems'
const isDemo = async () => {
  if (!import.meta.env.DEV) return false
  const { data: { user } } = await supabase.auth.getUser()
  return !user
}
const getDemoItems = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]') } catch { return [] } }
const setDemoItems = (items) => localStorage.setItem(DEMO_KEY, JSON.stringify(items))

function absEpisode(item, season, episode) {
  let eps = []
  try { eps = item.episodes_per_season ? JSON.parse(item.episodes_per_season) : [] } catch {}
  let before = 0
  for (let s = 0; s < (season || 1) - 1; s++) before += (eps[s] || 0)
  return before + (episode || 1)
}

export const fetchItems = async () => {
  if (await isDemo()) return getDemoItems()
  const userId = await uid()
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

export const addItem = async (data) => {
  const epsJson = Array.isArray(data.episodes_per_season)
    ? JSON.stringify(data.episodes_per_season)
    : (data.episodes_per_season || null)

  if (await isDemo()) {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      user_id: 'demo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      title: data.title,
      subtitle: data.subtitle || null,
      category: data.category,
      cover: data.cover || null,
      author: data.author || null,
      platform: data.platform || null,
      genre: data.genre || null,
      synopsis: data.synopsis || null,
      year: data.year || null,
      is_series: data.is_series ? true : false,
      total_pages: data.total_pages || null,
      total_episodes: data.total_episodes || null,
      runtime: data.runtime || null,
      steam_app_id: data.steam_app_id || null,
      book_type: data.book_type || 'book',
      audio_duration_minutes: data.audio_duration_minutes || null,
      total_seasons: data.total_seasons || null,
      episodes_per_season: epsJson,
      game_platform: data.game_platform || null,
      status: data.status || 'not_started',
      current_page: 0, hours_played: 0, current_season: 1, current_episode: 1,
      rating: null, notes: null, manual_achievements: null,
      start_date: null, end_date: null, ach_unlocked: null, ach_total: null,
    }
    setDemoItems([item, ...getDemoItems()])
    return item
  }

  const userId = await uid()
  const { data: item, error } = await supabase
    .from('items')
    .insert({
      user_id: userId,
      title: data.title,
      subtitle: data.subtitle || null,
      category: data.category,
      cover: data.cover || null,
      author: data.author || null,
      platform: data.platform || null,
      genre: data.genre || null,
      synopsis: data.synopsis || null,
      year: data.year || null,
      is_series: data.is_series ? true : false,
      total_pages: data.total_pages || null,
      total_episodes: data.total_episodes || null,
      runtime: data.runtime || null,
      steam_app_id: data.steam_app_id || null,
      book_type: data.book_type || 'book',
      audio_duration_minutes: data.audio_duration_minutes || null,
      total_seasons: data.total_seasons || null,
      episodes_per_season: epsJson,
      game_platform: data.game_platform || null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return item
}

export const updateItem = async (id, data) => {
  if (await isDemo()) {
    const items = getDemoItems()
    const idx = items.findIndex(i => i.id === id)
    if (idx === -1) throw new Error('Item not found')
    const prev = items[idx]
    const maJson = data.manual_achievements === undefined
      ? prev.manual_achievements
      : (Array.isArray(data.manual_achievements) ? JSON.stringify(data.manual_achievements) : data.manual_achievements)
    const updated = {
      ...prev,
      updated_at: new Date().toISOString(),
      manual_achievements: maJson,
    }
    if ('status' in data)          updated.status          = data.status
    if ('current_page' in data)    updated.current_page    = data.current_page ?? 0
    if ('hours_played' in data)    updated.hours_played    = data.hours_played ?? 0
    if ('current_season' in data)  updated.current_season  = data.current_season ?? 1
    if ('current_episode' in data) updated.current_episode = data.current_episode ?? 1
    if ('rating' in data)          updated.rating          = data.rating ?? null
    if ('notes' in data)           updated.notes           = data.notes ?? null
    if ('cover' in data && data.cover != null) updated.cover = data.cover
    if ('start_date' in data)      updated.start_date      = data.start_date || null
    if ('end_date' in data)        updated.end_date        = data.end_date || null
    if ('steam_app_id' in data)    updated.steam_app_id    = data.steam_app_id || null
    if ('total_pages' in data)     updated.total_pages     = data.total_pages || null
    if ('ach_unlocked' in data)    updated.ach_unlocked    = data.ach_unlocked ?? null
    if ('ach_total' in data)       updated.ach_total       = data.ach_total ?? null
    items[idx] = updated
    setDemoItems(items)
    return updated
  }

  const userId = await uid()

  const { data: prev } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single()

  const maJson = data.manual_achievements === undefined
    ? undefined
    : (Array.isArray(data.manual_achievements) ? JSON.stringify(data.manual_achievements) : data.manual_achievements)

  const update = { updated_at: new Date().toISOString() }
  if ('status' in data)          update.status          = data.status
  if ('current_page' in data)    update.current_page    = data.current_page ?? 0
  if ('hours_played' in data)    update.hours_played    = data.hours_played ?? 0
  if ('current_season' in data)  update.current_season  = data.current_season ?? 1
  if ('current_episode' in data) update.current_episode = data.current_episode ?? 1
  if ('rating' in data)          update.rating          = data.rating ?? null
  if ('notes' in data)           update.notes           = data.notes ?? null
  if ('cover' in data && data.cover != null) update.cover = data.cover
  if (maJson !== undefined)      update.manual_achievements = maJson
  if ('start_date' in data)      update.start_date      = data.start_date || null
  if ('end_date' in data)        update.end_date        = data.end_date || null
  if ('steam_app_id' in data)    update.steam_app_id    = data.steam_app_id || null
  if ('total_pages' in data)     update.total_pages     = data.total_pages || null
  if ('ach_unlocked' in data)    update.ach_unlocked    = data.ach_unlocked ?? null
  if ('ach_total' in data)       update.ach_total       = data.ach_total ?? null

  const { data: updated, error } = await supabase
    .from('items')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)

  if (prev) {
    const logs = []
    if ('current_page' in data) {
      const d = (data.current_page ?? 0) - (prev.current_page || 0)
      if (d > 0) logs.push({ field: updated.book_type === 'audiobook' ? 'minutes' : 'pages', delta: d, note: null })
    }
    if ('hours_played' in data) {
      const d = parseFloat(((data.hours_played ?? 0) - (prev.hours_played || 0)).toFixed(2))
      if (d > 0) logs.push({ field: 'hours', delta: d, note: null })
    }
    if (('current_season' in data) || ('current_episode' in data)) {
      const before = absEpisode(prev, prev.current_season, prev.current_episode)
      const after  = absEpisode(updated, updated.current_season, updated.current_episode)
      const d = after - before
      if (d > 0) logs.push({ field: 'episodes', delta: d, note: `T${updated.current_season} E${updated.current_episode}` })
    }
    if (data.status && data.status !== prev.status) {
      if (data.status === 'in_progress' && prev.status === 'wishlist') logs.push({ field: 'status', delta: null, note: 'started' })
      if (data.status === 'completed') logs.push({ field: 'status', delta: null, note: 'completed' })
      if (data.status === 'abandoned') logs.push({ field: 'status', delta: null, note: 'abandoned' })
    }
    if (logs.length > 0) {
      await supabase.from('activity_log').insert(
        logs.map(l => ({
          user_id: userId,
          item_id: updated.id,
          category: updated.category,
          title: updated.title,
          field: l.field,
          delta: l.delta,
          note: l.note,
        }))
      )
    }
  }

  return updated
}

export const deleteItem = async (id) => {
  if (await isDemo()) {
    setDemoItems(getDemoItems().filter(i => i.id !== id))
    return { success: true }
  }
  const userId = await uid()
  await supabase.from('activity_log').delete().eq('item_id', id).eq('user_id', userId)
  const { error } = await supabase.from('items').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(error.message)
  return { success: true }
}

export const fetchActivity = async (prefix) => {
  if (await isDemo()) return []
  const userId = await uid()
  let query = supabase
    .from('activity_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (prefix) {
    query = query.like('created_at', `${prefix}%`)
  } else {
    query = query.limit(500)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

const invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    let msg = error.message
    try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error } catch {}
    throw new Error(msg)
  }
  return data
}

export const fetchNextEpisode = ({ title }) => invoke('tv', { action: 'next', title })
export const fetchUpcoming = (shows) => invoke('tv', { action: 'upcoming', shows })
export const searchMedia = (query, cat, lang = 'pt') => invoke('search', { query, cat, lang })
export const translateSynopsis = (text, targetLang) => invoke('search', { action: 'translate', text, targetLang })
export const generateSynopsis = (title, cat, lang) => invoke('search', { action: 'synopsis', title, cat, lang })

// Steam — called directly by components
export const steamSearch = (q) => invoke('steam', { action: 'search', q })
export const steamDefinitions = (appid, q) => invoke('steam', { action: 'definitions', appid, q })
export const steamResolve = (vanity) => invoke('steam', { action: 'resolve', vanity })
export const steamPlaytime = (appid, steamid) => invoke('steam', { action: 'playtime', appid, steamid })
export const steamAchievements = (appid, steamid) => invoke('steam', { action: 'achievements', appid, steamid })
