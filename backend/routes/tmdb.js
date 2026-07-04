const express = require('express');
const router = express.Router();

const IMG = 'https://image.tmdb.org/t/p/original';
const REGION = 'PT';

// Cache simples (episódios/onde-ver mudam pouco)
const CACHE = new Map();
const TTL = 1000 * 60 * 60 * 12;   // 12 horas
function cacheGet(k) { const v = CACHE.get(k); return v && Date.now() - v.t < TTL ? v.data : null; }
function cacheSet(k, data) { if (CACHE.size >= 400) CACHE.delete(CACHE.keys().next().value); CACHE.set(k, { t: Date.now(), data }); }

// Procura o id TMDB a partir do título
async function findId(title, year, isSeries, key) {
  const type = isSeries ? 'tv' : 'movie';
  const yearQ = year ? (isSeries ? `&first_air_date_year=${year}` : `&year=${year}`) : '';
  const r = await fetch(
    `https://api.themoviedb.org/3/search/${type}?api_key=${key}&query=${encodeURIComponent(title)}&language=pt-PT${yearQ}`,
    { signal: AbortSignal.timeout(6000) }
  );
  const d = await r.json();
  return d.results?.[0]?.id || null;
}

// Onde ver (JustWatch via TMDB) para uma região
async function fetchProviders(type, id, key) {
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${key}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const d = await r.json();
    const reg = d.results?.[REGION];
    if (!reg) return { link: null, flatrate: [], rent: [], buy: [] };
    const map = (arr) => (arr || []).map(p => ({
      name: p.provider_name,
      logo: p.logo_path ? IMG + p.logo_path : null,
    }));
    return {
      link: reg.link || null,
      flatrate: map(reg.flatrate),
      rent: map(reg.rent),
      buy: map(reg.buy),
    };
  } catch { return { link: null, flatrate: [], rent: [], buy: [] }; }
}

// Detalhes da série (próximo/último episódio + estado)
async function fetchTvDetails(id, key) {
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/tv/${id}?api_key=${key}&language=pt-PT`,
      { signal: AbortSignal.timeout(6000) }
    );
    const d = await r.json();
    const ep = (e) => e ? {
      airDate: e.air_date || null,
      season: e.season_number,
      number: e.episode_number,
      name: e.name || '',
    } : null;
    return {
      status: d.status || null,            // "Returning Series", "Ended", "Canceled"...
      nextEpisode: ep(d.next_episode_to_air),
      lastEpisode: ep(d.last_episode_to_air),
    };
  } catch { return { status: null, nextEpisode: null, lastEpisode: null }; }
}

// ── Info de um título: onde ver + (se série) próximos episódios ───────────────
router.get('/info', async (req, res) => {
  const { title, year, series } = req.query;
  const key = process.env.TMDB_KEY;
  if (!key) return res.status(500).json({ error: 'TMDB_KEY não configurada' });
  if (!title) return res.status(400).json({ error: 'title é obrigatório' });

  const isSeries = series === '1' || series === 'true';
  const ck = `info:${isSeries ? 'tv' : 'movie'}:${title.toLowerCase()}:${year || ''}`;
  const hit = cacheGet(ck);
  if (hit) return res.json(hit);

  try {
    const id = await findId(title, year, isSeries, key);
    if (!id) { cacheSet(ck, { found: false }); return res.json({ found: false }); }

    const type = isSeries ? 'tv' : 'movie';
    const [providers, tv] = await Promise.all([
      fetchProviders(type, id, key),
      isSeries ? fetchTvDetails(id, key) : Promise.resolve(null),
    ]);

    const payload = { found: true, tmdbId: id, providers, ...(tv || {}) };
    cacheSet(ck, payload);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Próximos episódios de várias séries (calendário) ──────────────────────────
router.post('/upcoming', async (req, res) => {
  const key = process.env.TMDB_KEY;
  if (!key) return res.status(500).json({ error: 'TMDB_KEY não configurada' });

  const shows = Array.isArray(req.body?.shows) ? req.body.shows.slice(0, 16) : [];
  try {
    const results = await Promise.all(shows.map(async (s) => {
      try {
        const id = await findId(s.title, s.year, true, key);
        if (!id) return null;
        const tv = await fetchTvDetails(id, key);
        if (!tv.nextEpisode?.airDate) return null;
        return {
          itemId: s.itemId ?? null,
          title: s.title,
          cover: s.cover ?? null,
          ...tv.nextEpisode,
        };
      } catch { return null; }
    }));
    const upcoming = results.filter(Boolean).sort((a, b) => (a.airDate || '').localeCompare(b.airDate || ''));
    res.json(upcoming);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
