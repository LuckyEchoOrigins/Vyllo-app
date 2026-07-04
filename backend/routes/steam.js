const express = require('express');
const router = express.Router();

// ── Steam Store search (sem chave) ───────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'pt-PT,pt;q=0.9',
    };

    // Steam storefront search (mais fiável)
    const url = `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(q)}&f=games&cc=PT&realm=1&l=portuguese`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    const html = await r.text();

    // Parse HTML returned by Steam suggest (returns HTML with <a> tags)
    const items = [];
    const regex = /<a[^>]*data-ds-appid="(\d+)"[^>]*>[\s\S]*?<div class="match_name">(.*?)<\/div>/g;
    let m;
    while ((m = regex.exec(html)) !== null && items.length < 8) {
      const appid = parseInt(m[1]);
      const name  = m[2].replace(/<[^>]+>/g, '').trim();
      items.push({
        appid,
        name,
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/capsule_sm_120.jpg`,
      });
    }

    // Fallback: storeapsearch API
    if (items.length === 0) {
      const r2 = await fetch(`https://store.steampowered.com/api/storeapsearch/?term=${encodeURIComponent(q)}&l=portuguese`, { headers, signal: AbortSignal.timeout(5000) });
      const d2  = await r2.json();
      (d2.items || []).slice(0, 8).forEach(it => items.push({
        appid: it.id,
        name:  it.name,
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${it.id}/capsule_sm_120.jpg`,
      }));
    }

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: encontra VÁRIOS AppIDs candidatos para um título
async function findAppIds(title) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
  const ids = [];
  try {
    const r = await fetch(
      `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(title)}&f=games&cc=PT&realm=1&l=english`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
    const html = await r.text();
    const regex = /data-ds-appid="(\d+)"/g;
    let m;
    while ((m = regex.exec(html)) !== null && ids.length < 6) {
      const id = parseInt(m[1]);
      if (!ids.includes(id)) ids.push(id);
    }
  } catch {}
  return ids;
}

// Busca o schema de conquistas de UM appid
async function fetchSchema(appid, key) {
  try {
    const [schemaRes, globalRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${key}&appid=${appid}&l=portuguese`, { signal: AbortSignal.timeout(8000) }),
      fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}`, { signal: AbortSignal.timeout(6000) }),
    ]);
    const [schema, global] = await Promise.all([schemaRes.json(), globalRes.json()]);

    const schemaList = schema.game?.availableGameStats?.achievements || [];
    if (!schemaList.length) return null;

    const globalMap = {};
    (global.achievementpercentages?.achievements || []).forEach(a => { globalMap[a.name] = a.percent; });

    const achievements = schemaList.map(a => ({
      id:            a.name,
      name:          a.displayName || a.name,
      description:   a.description || '',
      icon:          a.icon,
      globalPercent: globalMap[a.name] != null ? Math.round(parseFloat(globalMap[a.name]) * 10) / 10 : null,
      unlocked:      false,
    }))
    .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100));

    return { appid: parseInt(appid), gameName: schema.game?.gameName || '', achievements };
  } catch { return null; }
}

// ── RAWG: conquistas de jogos sem Steam (exclusivos PS/Xbox/Nintendo) ────────
const RAWG_DIA = new RegExp('[\\u0300-\\u036f]', 'g');
const rawgNorm = (s) => (s || '').toLowerCase().normalize('NFD').replace(RAWG_DIA, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function fetchRawgAchievements(title) {
  const key = process.env.RAWG_KEY;
  if (!key) return null;
  try {
    // 1. Encontra o jogo
    const sr = await fetch(
      `https://api.rawg.io/api/games?key=${key}&search=${encodeURIComponent(title)}&search_precise=true&page_size=3`,
      { signal: AbortSignal.timeout(6000) }
    );
    const sd = await sr.json();
    const games = sd.results || [];
    if (!games.length) return null;
    const want = rawgNorm(title);
    const game = games.find(g => rawgNorm(g.name) === want) || games[0];

    // 2. Busca as conquistas (paginadas)
    const all = [];
    let url = `https://api.rawg.io/api/games/${game.id}/achievements?key=${key}&page_size=40`;
    for (let page = 0; page < 10 && url; page++) {
      const ar = await fetch(url, { signal: AbortSignal.timeout(7000) });
      const ad = await ar.json();
      (ad.results || []).forEach(a => all.push(a));
      url = ad.next || null;
    }
    if (!all.length) return null;

    const achievements = all.map((a, i) => ({
      id:            String(a.id || `rawg_${i}`),
      name:          a.name || '',
      description:   a.description || '',
      icon:          a.image || null,
      globalPercent: a.percent != null ? Math.round(parseFloat(a.percent) * 10) / 10 : null,
      unlocked:      false,
    }))
    .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100));

    return { appid: null, gameName: game.name, achievements };
  } catch { return null; }
}

// ── Definições de conquistas de um jogo (lista completa, SEM precisar de utilizador) ──
// Steam (PC/multiplataforma) → RAWG (exclusivos de consola)
router.get('/definitions', async (req, res) => {
  let { appid, q } = req.query;
  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: 'STEAM_API_KEY não configurada' });

  try {
    // Lista de appids a tentar (o explícito, ou vários candidatos da pesquisa)
    const candidates = appid ? [parseInt(appid)] : await findAppIds(q || '');

    // 1. Tenta cada candidato Steam e usa o PRIMEIRO que tenha conquistas
    for (const id of candidates) {
      const result = await fetchSchema(id, key);
      if (result && result.achievements.length) return res.json(result);
    }

    // 2. Sem conquistas na Steam → tenta a RAWG (exclusivos de consola)
    if (q) {
      const rawg = await fetchRawgAchievements(q);
      if (rawg && rawg.achievements.length) return res.json(rawg);
    }

    // 3. Nada encontrado
    res.json({ appid: candidates[0] || null, gameName: '', achievements: [] });
  } catch (e) {
    console.error('Steam definitions error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Resolve Steam vanity URL → SteamID64 ────────────────────────────────────
router.get('/resolve', async (req, res) => {
  const { vanity } = req.query;
  if (!vanity) return res.status(400).json({ error: 'vanity required' });

  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: 'STEAM_API_KEY não configurada' });

  try {
    const url = `https://api.steampowered.com/ISteamWebAPIUtil/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await r.json();

    if (data.response?.success === 1) {
      res.json({ steamid: data.response.steamid });
    } else {
      res.status(404).json({ error: 'Perfil não encontrado' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Horas jogadas de um jogo específico ─────────────────────────────────────
router.get('/playtime', async (req, res) => {
  const { appid, steamid } = req.query;
  if (!appid || !steamid) return res.status(400).json({ error: 'appid e steamid são obrigatórios' });

  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: 'STEAM_API_KEY não configurada' });

  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamid}&appids_filter[0]=${appid}&include_appinfo=1&format=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();

    const game = d.response?.games?.[0];
    if (!game) return res.json({ hours: 0 });

    const hours = parseFloat((( game.playtime_forever || 0) / 60).toFixed(1));
    res.json({ hours });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Conquistas do utilizador para um jogo ────────────────────────────────────
router.get('/achievements', async (req, res) => {
  const { appid, steamid } = req.query;
  if (!appid)   return res.status(400).json({ error: 'appid required' });
  if (!steamid) return res.status(400).json({ error: 'steamid required' });

  const key = process.env.STEAM_API_KEY;
  if (!key) return res.status(500).json({ error: 'STEAM_API_KEY não configurada no .env' });

  try {
    const [schemaRes, playerRes, globalRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${key}&appid=${appid}&l=portuguese`, { signal: AbortSignal.timeout(8000) }),
      fetch(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${key}&steamid=${steamid}&l=portuguese`, { signal: AbortSignal.timeout(8000) }),
      fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}`, { signal: AbortSignal.timeout(6000) }),
    ]);

    const [schema, player, global] = await Promise.all([schemaRes.json(), playerRes.json(), globalRes.json()]);

    // Perfil privado ou jogo sem estatísticas
    if (player.playerstats?.error) {
      return res.status(400).json({ error: player.playerstats.error });
    }

    const schemaList = schema.game?.availableGameStats?.achievements || [];
    const playerList = player.playerstats?.achievements || [];

    // Mapa de conquistas do utilizador
    const playerMap = {};
    playerList.forEach(a => { playerMap[a.apiname] = a; });

    // Mapa de percentagens globais (raridade)
    const globalMap = {};
    (global.achievementpercentages?.achievements || []).forEach(a => {
      globalMap[a.name] = a.percent;
    });

    const achievements = schemaList.map(a => ({
      id:            a.name,
      name:          a.displayName || a.name,
      description:   a.description || '',
      icon:          a.icon,
      iconGray:      a.icongray,
      achieved:      playerMap[a.name]?.achieved === 1,
      unlockTime:    playerMap[a.name]?.unlocktime || 0,
      globalPercent: globalMap[a.name] != null ? Math.round(parseFloat(globalMap[a.name]) * 10) / 10 : null,
    }))
    // Da mais rara para a mais comum (globalPercent mais baixo = mais rara)
    .sort((a, b) => {
      const pa = a.globalPercent ?? 100;
      const pb = b.globalPercent ?? 100;
      return pa - pb;
    });

    res.json({
      total:    achievements.length,
      unlocked: achievements.filter(a => a.achieved).length,
      gameName: player.playerstats?.gameName || '',
      achievements,
    });
  } catch (e) {
    console.error('Steam achievements error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
