const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  const { category, status } = req.query;
  let query = 'SELECT * FROM items WHERE 1=1';
  const params = [];
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (status)   { query += ' AND status = ?';   params.push(status); }
  query += ' ORDER BY updated_at DESC';
  try {
    res.json(db.prepare(query).all(params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get([req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

router.post('/', (req, res) => {
  const {
    title, subtitle, category, cover, author, platform,
    genre, synopsis, year, is_series, total_pages, total_episodes,
    runtime, steam_app_id, book_type, audio_duration_minutes, total_seasons, episodes_per_season, game_platform
  } = req.body;
  try {
    const epsJson = Array.isArray(episodes_per_season)
      ? JSON.stringify(episodes_per_season)
      : (episodes_per_season || null);

    const result = db.prepare(`
      INSERT INTO items
        (title, subtitle, category, cover, author, platform, genre, synopsis, year, is_series,
         total_pages, total_episodes, runtime, steam_app_id, book_type, audio_duration_minutes, total_seasons, episodes_per_season, game_platform)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run([
      title,
      subtitle   || null,
      category,
      cover      || null,
      author     || null,
      platform   || null,
      genre      || null,
      synopsis   || null,
      year       || null,
      is_series  ? 1 : 0,
      total_pages          || null,
      total_episodes       || null,
      runtime              || null,
      steam_app_id         || null,
      book_type            || 'book',
      audio_duration_minutes || null,
      total_seasons        || null,
      epsJson,
      game_platform        || null,
    ]);
    res.json(db.prepare('SELECT * FROM items WHERE id = ?').get([result.lastInsertRowid]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Conta o nº absoluto de episódios (temporadas anteriores + episódio atual)
function absEpisode(item, season, episode) {
  let eps = [];
  try { eps = item.episodes_per_season ? JSON.parse(item.episodes_per_season) : []; } catch {}
  let before = 0;
  for (let s = 0; s < (season || 1) - 1; s++) before += (eps[s] || 0);
  return before + (episode || 1);
}

router.put('/:id', (req, res) => {
  const { status, current_page, hours_played, current_season, current_episode, rating, notes, steam_app_id, cover, manual_achievements } = req.body;
  try {
    const maJson = manual_achievements === undefined
      ? null
      : (Array.isArray(manual_achievements) ? JSON.stringify(manual_achievements) : manual_achievements);

    // Estado anterior (para calcular o ganho exato)
    const prev = db.prepare('SELECT * FROM items WHERE id = ?').get([req.params.id]);

    // Campos opcionais: só atualizados se vierem no body (preserva caso contrário)
    const optSet = [];
    const optParams = [];
    if ('start_date' in req.body)   { optSet.push('start_date=?');   optParams.push(req.body.start_date || null); }
    if ('end_date'   in req.body)   { optSet.push('end_date=?');     optParams.push(req.body.end_date   || null); }
    // steam_app_id: presente no body → define (inclui null para desligar); ausente → preserva
    if ('steam_app_id' in req.body) { optSet.push('steam_app_id=?'); optParams.push(req.body.steam_app_id || null); }
    if ('total_pages'  in req.body) { optSet.push('total_pages=?');  optParams.push(req.body.total_pages  || null); }
    if ('ach_unlocked' in req.body) { optSet.push('ach_unlocked=?'); optParams.push(req.body.ach_unlocked ?? null); }
    if ('ach_total'    in req.body) { optSet.push('ach_total=?');    optParams.push(req.body.ach_total    ?? null); }
    const optClause = optSet.length ? ', ' + optSet.join(', ') : '';

    db.prepare(`
      UPDATE items
      SET status=?, current_page=?, hours_played=?,
          current_season=?, current_episode=?,
          rating=?, notes=?,
          cover=COALESCE(?, cover),
          manual_achievements=COALESCE(?, manual_achievements)${optClause},
          updated_at=datetime('now')
      WHERE id=?
    `).run([
      status,
      current_page  ?? 0,
      hours_played  ?? 0,
      current_season ?? 1,
      current_episode ?? 1,
      rating ?? null,
      notes  ?? null,
      cover  ?? null,
      maJson,
      ...optParams,
      req.params.id,
    ]);

    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get([req.params.id]);

    // ── Regista o ganho exato (delta) desta atualização ──
    if (prev) {
      const log = (field, delta, note) => {
        db.prepare('INSERT INTO activity_log (item_id, category, title, field, delta, note) VALUES (?,?,?,?,?,?)')
          .run([updated.id, updated.category, updated.title, field, delta ?? null, note ?? null]);
      };

      // Páginas / minutos de audiobook (current_page)
      if ('current_page' in req.body) {
        const d = (current_page ?? 0) - (prev.current_page || 0);
        if (d > 0) log(updated.book_type === 'audiobook' ? 'minutes' : 'pages', d, null);
      }
      // Horas jogadas
      if ('hours_played' in req.body) {
        const d = parseFloat(((hours_played ?? 0) - (prev.hours_played || 0)).toFixed(2));
        if (d > 0) log('hours', d, null);
      }
      // Episódios (séries)
      if (('current_season' in req.body) || ('current_episode' in req.body)) {
        const before = absEpisode(prev, prev.current_season, prev.current_episode);
        const after  = absEpisode(updated, updated.current_season, updated.current_episode);
        const d = after - before;
        if (d > 0) log('episodes', d, `T${updated.current_season} E${updated.current_episode}`);
      }
      // Mudanças de estado relevantes
      if (status && status !== prev.status) {
        if (status === 'in_progress' && prev.status === 'wishlist') log('status', null, 'started');
        if (status === 'completed') log('status', null, 'completed');
        if (status === 'abandoned') log('status', null, 'abandoned');
      }
    }

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Registo de atividade — opcionalmente filtrado por prefixo de data (ex: 2026-05)
router.get('/activity/log', (req, res) => {
  const { prefix } = req.query;
  try {
    let rows;
    if (prefix) {
      rows = db.prepare("SELECT * FROM activity_log WHERE created_at LIKE ? ORDER BY created_at DESC")
        .all([`${prefix}%`]);
    } else {
      rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 500').all();
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM items WHERE id = ?').run([req.params.id]);
    db.prepare('DELETE FROM activity_log WHERE item_id = ?').run([req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
