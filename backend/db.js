const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'collection.db');

let _sqlDb = null;

// Persist the in-memory database to disk
function save() {
  if (!_sqlDb) return;
  const data = _sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Thin wrapper that mimics better-sqlite3's synchronous API
class Stmt {
  constructor(sql) {
    this._sql = sql;
  }

  all(...args) {
    const params = args.flat();
    try {
      const result = _sqlDb.exec(this._sql, params);
      if (!result.length) return [];
      const { columns, values } = result[0];
      return values.map(row =>
        Object.fromEntries(columns.map((col, i) => [col, row[i]]))
      );
    } catch (e) {
      console.error('SQL all() error:', e.message, '\n', this._sql);
      throw e;
    }
  }

  get(...args) {
    return this.all(...args)[0] ?? null;
  }

  run(...args) {
    const params = args.flat();
    try {
      _sqlDb.run(this._sql, params);
      const idRows = _sqlDb.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowid = idRows[0]?.values[0][0] ?? 0;
      save();
      return { lastInsertRowid, changes: _sqlDb.getRowsModified() };
    } catch (e) {
      console.error('SQL run() error:', e.message, '\n', this._sql);
      throw e;
    }
  }
}

const db = {
  prepare: (sql) => new Stmt(sql),

  exec: (sql) => {
    try {
      _sqlDb.run(sql);
      save();
    } catch (e) {
      console.error('SQL exec() error:', e.message);
      throw e;
    }
  },
};

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _sqlDb = new SQL.Database(buf);
    console.log('📂 Base de dados carregada:', DB_PATH);
  } else {
    _sqlDb = new SQL.Database();
    console.log('✨ Nova base de dados criada:', DB_PATH);
  }

  // Schema
  _sqlDb.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      category TEXT NOT NULL,
      status TEXT DEFAULT 'wishlist',
      cover TEXT,
      author TEXT,
      platform TEXT,
      genre TEXT,
      synopsis TEXT,
      year INTEGER,
      is_series INTEGER DEFAULT 0,
      total_pages INTEGER,
      current_page INTEGER DEFAULT 0,
      hours_played REAL DEFAULT 0,
      current_season INTEGER DEFAULT 1,
      current_episode INTEGER DEFAULT 1,
      total_episodes INTEGER,
      rating INTEGER,
      notes TEXT,
      runtime INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Registo de atividade (ganho exato por dia)
  _sqlDb.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      category TEXT,
      title TEXT,
      field TEXT,
      delta REAL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migrations
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN runtime INTEGER'); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN steam_app_id INTEGER'); } catch {}
  try { _sqlDb.run("ALTER TABLE items ADD COLUMN book_type TEXT DEFAULT 'book'"); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN audio_duration_minutes INTEGER'); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN total_seasons INTEGER'); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN episodes_per_season TEXT'); } catch {}
  try { _sqlDb.run("ALTER TABLE items ADD COLUMN game_platform TEXT DEFAULT 'steam'"); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN manual_achievements TEXT'); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN start_date TEXT'); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN end_date TEXT'); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN ach_unlocked INTEGER'); } catch {}
  try { _sqlDb.run('ALTER TABLE items ADD COLUMN ach_total INTEGER'); } catch {}

  save();

  return db;
}

module.exports = { db, initDb };
