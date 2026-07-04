const express = require('express');
const router  = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Livros → Google Books: capa + nº de páginas ───────────────────────────────
function gbCoverUrl(imgLinks) {
  const url = imgLinks?.extraLarge || imgLinks?.large || imgLinks?.medium
    || imgLinks?.small || imgLinks?.thumbnail || imgLinks?.smallThumbnail;
  if (!url) return null;
  return url.replace(/^http:/, 'https:').replace(/&zoom=\d/, '&zoom=3').replace(/&edge=\w+/, '');
}

async function fetchBookData(title, author) {
  const keyParam = process.env.GOOGLE_BOOKS_KEY ? `&key=${process.env.GOOGLE_BOOKS_KEY}` : '';
  const queries = [
    author ? `intitle:${title}+inauthor:${author}` : null,
    `intitle:${title}`,
    title,
  ].filter(Boolean);

  for (const q of queries) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&fields=items(volumeInfo/pageCount,volumeInfo/imageLinks)${keyParam}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const d = await r.json();
      const item = d.items?.[0];
      if (item) {
        const cover = gbCoverUrl(item.volumeInfo?.imageLinks);
        const pages = item.volumeInfo?.pageCount || null;
        if (cover || pages) return { cover, pages };
      }
    } catch {}
  }
  return { cover: null, pages: null };
}

// Normaliza títulos para comparação (sem acentos, pontuação, minúsculas)
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
function normGame(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ── Capas: Jogos → Steam (AppID + capa portrait) ─────────────────────────────
async function fetchGameCover(title) {
  const headers = { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8' };
  let appid = null;

  // 1. Steam suggest — escolhe o resultado cujo NOME melhor corresponde ao título
  try {
    const r = await fetch(
      `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(title)}&f=games&cc=PT&realm=1&l=english`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
    const html = await r.text();

    // Parse de todos os pares (appid, nome)
    const candidates = [];
    const re = /data-ds-appid="(\d+)"[\s\S]*?match_name">([^<]+)</g;
    let m;
    while ((m = re.exec(html)) !== null) {
      candidates.push({ id: parseInt(m[1]), name: m[2].trim() });
    }

    if (candidates.length) {
      const titleWords = normGame(title).split(' ').filter(Boolean);
      const tJoin = titleWords.join(' ');

      let best = null;
      for (const c of candidates) {
        const cw = normGame(c.name).split(' ').filter(Boolean);
        const cJoin = cw.join(' ');
        // Correspondência exacta a nível de palavras → escolha imediata
        if (cJoin === tJoin) { best = c; break; }
        // Prefixo a nível de PALAVRAS (evita "X" casar com "XIV")
        if (cw.length >= titleWords.length &&
            cw.slice(0, titleWords.length).join(' ') === tJoin) {
          // Entre prefixos, prefere o que tem menos palavras extra (mais próximo)
          if (!best || cw.length < normGame(best.name).split(' ').filter(Boolean).length) best = c;
        }
      }
      appid = (best || candidates[0]).id;
    }
  } catch {}

  // 2. Fallback: storeapsearch
  if (!appid) {
    try {
      const r2 = await fetch(
        `https://store.steampowered.com/api/storeapsearch/?term=${encodeURIComponent(title)}`,
        { headers, signal: AbortSignal.timeout(4000) }
      );
      const d2 = await r2.json();
      if (d2.items?.[0]?.id) appid = d2.items[0].id;
    } catch {}
  }

  if (appid) {
    // Valida que a imagem existe mesmo (alguns appids errados dão 404 em ambas)
    const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
    const headerUrl   = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;
    const exists = async (url) => {
      try { const c = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) }); return c.ok; }
      catch { return false; }
    };
    if (await exists(portraitUrl)) return { appid, cover: portraitUrl };
    if (await exists(headerUrl))   return { appid, cover: headerUrl };
    // Nenhuma imagem existe → AppID errado, ignora e tenta outras fontes
  }

  // 3. Não está na Steam (exclusivo PS/Xbox/Nintendo) → RAWG, depois Wikipedia
  const rawg = await fetchRawgCover(title);
  if (rawg) return { appid: null, cover: rawg };
  return { appid: null, cover: await fetchWikiCover(title, null, 'game') };
}

// ── Capas: RAWG (cobre PS/Xbox/Nintendo) — chave grátis em rawg.io ───────────
async function fetchRawgCover(title) {
  const key = process.env.RAWG_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.rawg.io/api/games?key=${key}&search=${encodeURIComponent(title)}&search_precise=true&page_size=3`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await r.json();
    const results = d.results || [];
    if (!results.length) return null;
    // Escolhe o melhor match de nome; senão o 1.º
    const want = normGame(title);
    const best = results.find(g => normGame(g.name) === want) || results[0];
    return best.background_image || null;
  } catch { return null; }
}

// ── Capas: Filmes/Séries ──────────────────────────────────────────────────────
async function fetchFilmCover(title, year, isSeries) {
  const tmdbKey = process.env.TMDB_KEY;

  // TMDB (melhor opção, se houver chave)
  if (tmdbKey) {
    try {
      const type  = isSeries ? 'tv' : 'movie';
      const yearQ = year ? (isSeries ? `&first_air_date_year=${year}` : `&year=${year}`) : '';
      const r = await fetch(
        `https://api.themoviedb.org/3/search/${type}?api_key=${tmdbKey}&query=${encodeURIComponent(title)}&language=pt-PT${yearQ}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const d = await r.json();
      const poster = d.results?.[0]?.poster_path;
      if (poster) return `https://image.tmdb.org/t/p/w500${poster}`;
    } catch {}
  }

  // Fallback final: Wikipedia (séries já são tratadas via TVmaze no enrich)
  const typeTerm = isSeries ? 'television series' : 'film';
  return wikiSearchCover(`${title} ${year || ''} ${typeTerm}`.trim());
}

// ── TMDB — poster + dados de um filme (uso comercial OK com atribuição) ───────
async function fetchTmdbMovieData(title, year) {
  const key = process.env.TMDB_KEY;
  if (!key) return null;
  try {
    const yearQ = year ? `&year=${year}` : '';
    const sr = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${encodeURIComponent(title)}&language=pt-PT${yearQ}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const sd = await sr.json();
    const hit = sd.results?.[0];
    if (!hit) return null;

    const out = {
      cover: hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null,
      year: hit.release_date ? parseInt(hit.release_date.slice(0, 4)) : null,
      genre: null,
      runtime: null,
    };
    // Detalhes (runtime + género)
    try {
      const dr = await fetch(
        `https://api.themoviedb.org/3/movie/${hit.id}?api_key=${key}&language=pt-PT`,
        { signal: AbortSignal.timeout(5000) }
      );
      const dd = await dr.json();
      if (Number.isFinite(dd.runtime) && dd.runtime > 0) out.runtime = dd.runtime;
      if (dd.genres?.[0]?.name) out.genre = dd.genres[0].name;
    } catch {}
    return out;
  } catch {}
  return null;
}

// ── TVmaze: séries (grátis, sem chave) → capa + episódios REAIS ───────────────
async function fetchTVmazeData(title, year) {
  try {
    const r = await fetch(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return null;

    // Escolhe o resultado cujo ano de estreia bate certo (desambigua US vs UK)
    let best = list[0];
    if (year) {
      const exact = list.find(x => x.show?.premiered?.startsWith(String(year)))
        || list.find(x => {
          const py = parseInt(x.show?.premiered?.slice(0, 4));
          return py && Math.abs(py - year) <= 1;
        });
      if (exact) best = exact;
    }

    const show = best.show;
    if (!show?.id) return null;

    const cover = show.image?.original || show.image?.medium || null;

    // Busca a lista real de episódios e conta por temporada (exclui specials)
    let episodesPerSeason = null, totalSeasons = null, totalEps = null;
    try {
      const epRes = await fetch(
        `https://api.tvmaze.com/shows/${show.id}/episodes`,
        { signal: AbortSignal.timeout(6000) }
      );
      const eps = await epRes.json();
      if (Array.isArray(eps) && eps.length) {
        const counts = {};
        for (const ep of eps) {
          if (ep.season && ep.season > 0) {
            counts[ep.season] = (counts[ep.season] || 0) + 1;
          }
        }
        const seasonNums = Object.keys(counts).map(Number).sort((a, b) => a - b);
        if (seasonNums.length) {
          episodesPerSeason = seasonNums.map(n => counts[n]);
          totalSeasons = seasonNums.length;
          totalEps = episodesPerSeason.reduce((a, b) => a + b, 0);
        }
      }
    } catch {}

    return { cover, episodesPerSeason, totalSeasons, totalEps };
  } catch {}
  return null;
}

// ── Wikipedia: pesquisa por termo e devolve imagem da melhor página ──────────
async function wikiSearchCover(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1` +
      `&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json&origin=*`;
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    const pages = d.query?.pages;
    if (pages) {
      const first = Object.values(pages)[0];
      if (first?.thumbnail?.source) return first.thumbnail.source;
    }
  } catch {}
  return null;
}

// ── Capas: Wikipedia fallback (jogos) ────────────────────────────────────────
async function fetchWikiCover(title, year, cat) {
  const typeTerm = cat === 'game' ? 'video game' : 'film';
  return wikiSearchCover(`${title} ${year || ''} ${typeTerm}`.trim());
}

// ── Prompt Claude (melhorado) ────────────────────────────────────────────────
function buildPrompt(query, cat) {
  const label = cat === 'book' ? 'livro' : cat === 'game' ? 'videojogo' : 'filme ou série';
  const gameExtra = cat === 'game' ? `
- Se a pesquisa incluir "remastered", "remake", "definitive edition", "enhanced" → devolve ESSA edição específica como 1.º resultado
- Se incluir um número ("1", "2", "3") → interpreta como a posição na série (ex: "1" = primeiro jogo)
- Usa o TÍTULO EXATO como aparece na Steam (ex: "Life is Strange Remastered", não "Life is Strange 1")
- Se o jogo tiver edições diferentes (base, remastered, definitive), coloca a pedida em 1.º lugar` : '';

  const filmExtra = cat === 'film' ? `
- DISTINGUE corretamente filme de série de TV:
  Filme: isSeries false, totalEps null, totalSeasons null, episodesPerSeason null, runtime em minutos
  Série: isSeries true, totalEps total de episodios, totalSeasons total de temporadas, runtime null
- Para series, indica episodesPerSeason: array com o numero de episodios de CADA temporada (ex: [7,13,13,13,16] para 5 temporadas)
- O comprimento de episodesPerSeason deve ser igual a totalSeasons` : '';

  const subtitleHint = cat === 'book'
    ? 'Nome do autor'
    : cat === 'game'
      ? 'Estúdio/editora do jogo (ex: Rockstar Games, FromSoftware) — NÃO as plataformas'
      : 'Realizador (filme) ou criador/estúdio (série)';

  return `Pesquisa: "${query}" (${label}).

Regras:
- O 1.º resultado DEVE ser o match mais próximo/exacto da pesquisa${gameExtra}${filmExtra}
- Inclui resultados em português E inglês
- Se a pesquisa for em português, procura também o título original
- Só resultados reais e conhecidos
- Ordena por relevância para a pesquisa

Responde APENAS com JSON array válido (sem markdown, sem texto extra):
[
  {
    "title": "Título exacto da obra",
    "subtitle": "${subtitleHint}",
    "author": ${cat === 'book' ? '"Nome do autor"' : 'null'},
    "platform": ${cat === 'game' ? '"Plataformas (ex: PC, PS5, Xbox)"' : 'null'},
    "genre": "Género principal",
    "synopsis": "Sinopse em português (2-3 frases)",
    "year": 2024,
    "totalPages": ${cat === 'book' ? 'número real de páginas ou null' : 'null'},
    "isSeries": ${cat === 'film' ? 'true se for série de TV, false se for filme' : 'false'},
    "totalEps": ${cat === 'film' ? 'número total de episódios (todas as temporadas) se série, null se filme' : 'null'},
    "totalSeasons": ${cat === 'film' ? 'número de temporadas se série, null se filme' : 'null'},
    "episodesPerSeason": ${cat === 'film' ? 'array de inteiros com episódios por temporada se série (ex: [7,13,13]), null se filme' : 'null'},
    "runtime": ${cat === 'film' ? 'duração em minutos se filme (ex: 148), null se série' : 'null'}
  }
]`;
}

// ── Route ────────────────────────────────────────────────────────────────────
// Cache de pesquisas (reduz custo da IA e chamadas externas repetidas)
const SEARCH_CACHE = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7;   // 7 dias
const CACHE_MAX = 500;

router.post('/', async (req, res) => {
  const { query, cat } = req.body;
  if (!query || !cat) return res.status(400).json({ error: 'query e cat são obrigatórios' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });

  // Cache hit → devolve sem chamar a IA/APIs
  const cacheKey = `${cat}::${query.trim().toLowerCase()}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.t < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    // 1. Claude devolve metadados
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1400,
      messages: [{ role: 'user', content: buildPrompt(query, cat) }],
    });

    const text = response.content[0]?.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.json([]);

    let results = JSON.parse(match[0]);
    if (!Array.isArray(results)) return res.json([]);
    results = results.slice(0, 5);

    // 2. Busca capas (e AppID da Steam / dados TVmaze) em paralelo
    const enriched = await Promise.all(results.map(async (item) => {
      let cover = null;
      let steam_app_id = null;
      const extra = {};
      try {
        if (cat === 'book') {
          const bd = await fetchBookData(item.title, item.author);
          cover = bd.cover;
          // Páginas reais da Open Library substituem o palpite do Claude (consistência)
          if (bd.pages) extra.totalPages = bd.pages;
        } else if (cat === 'game') {
          const sg = await fetchGameCover(item.title);
          cover        = sg.cover;
          steam_app_id = sg.appid;
        } else if (item.isSeries) {
          // Séries → TVmaze dá capa + episódios REAIS (substitui o palpite do Claude)
          const tv = await fetchTVmazeData(item.title, item.year);
          if (tv) {
            cover = tv.cover;
            if (tv.episodesPerSeason) extra.episodesPerSeason = tv.episodesPerSeason;
            if (tv.totalSeasons)      extra.totalSeasons      = tv.totalSeasons;
            if (tv.totalEps)          extra.totalEps          = tv.totalEps;
          }
          if (!cover) cover = await fetchFilmCover(item.title, item.year, true);
        } else {
          // Filmes → TMDB dá poster + dados reais; senão Wikipedia
          const tm = await fetchTmdbMovieData(item.title, item.year);
          if (tm) {
            if (tm.cover) cover = tm.cover;
            if (tm.genre) extra.genre = tm.genre;
            if (tm.year) extra.year = tm.year;
            if (tm.runtime) extra.runtime = tm.runtime;
            // sinopse mantém-se a do Claude (português)
          }
          if (!cover) cover = await fetchFilmCover(item.title, item.year, false);
        }
      } catch {}
      return { ...item, ...extra, cover: cover || null, steam_app_id: steam_app_id || null };
    }));

    // Guarda em cache (com limite simples de tamanho)
    if (SEARCH_CACHE.size >= CACHE_MAX) SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value);
    SEARCH_CACHE.set(cacheKey, { t: Date.now(), data: enriched });

    res.json(enriched);
  } catch (e) {
    console.error('Search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
