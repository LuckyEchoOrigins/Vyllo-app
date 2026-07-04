const express = require('express');
const router = express.Router();

// Cache simples
const CACHE = new Map();
const TTL = 1000 * 60 * 60 * 12;   // 12 horas
function cacheGet(k) { const v = CACHE.get(k); return v && Date.now() - v.t < TTL ? v.data : null; }
function cacheSet(k, data) { if (CACHE.size >= 400) CACHE.delete(CACHE.keys().next().value); CACHE.set(k, { t: Date.now(), data }); }

// Próximo episódio de uma série via TVmaze (grátis, sem chave)
async function nextEpisodeOf(title) {
  const ck = `tv:${(title || '').toLowerCase()}`;
  const hit = cacheGet(ck);
  if (hit !== null) return hit;

  let out = null;
  try {
    const r = await fetch(
      `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}&embed=nextepisode`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const show = await r.json();
      const ep = show?._embedded?.nextepisode;
      if (ep && ep.airdate) {
        out = {
          season: ep.season,
          number: ep.number,
          name: ep.name || '',
          airDate: ep.airdate,
          status: show.status || null,   // Running, Ended, To Be Determined...
        };
      } else {
        out = { status: show?.status || null };   // sem próximo episódio (terminada?)
      }
    }
  } catch {}
  cacheSet(ck, out);
  return out;
}

// ── Próximo episódio de UMA série ─────────────────────────────────────────────
router.get('/next', async (req, res) => {
  const { title } = req.query;
  if (!title) return res.status(400).json({ error: 'title é obrigatório' });
  try {
    const data = await nextEpisodeOf(title);
    res.json(data || { status: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Próximos episódios de VÁRIAS séries (calendário) ──────────────────────────
router.post('/upcoming', async (req, res) => {
  const shows = Array.isArray(req.body?.shows) ? req.body.shows.slice(0, 20) : [];
  try {
    const results = await Promise.all(shows.map(async (s) => {
      const ep = await nextEpisodeOf(s.title);
      if (!ep || !ep.airDate) return null;
      return { itemId: s.itemId ?? null, title: s.title, cover: s.cover ?? null, season: ep.season, number: ep.number, name: ep.name, airDate: ep.airDate };
    }));
    const upcoming = results.filter(Boolean).sort((a, b) => (a.airDate || '').localeCompare(b.airDate || ''));
    res.json(upcoming);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
