require('dotenv').config()
const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const DB_PATH = path.join(__dirname, 'collection.db')

async function migrate(email) {
  // 1. Find user by email
  const { data: { users }, error: userErr } = await supabase.auth.admin.listUsers()
  if (userErr) throw new Error(userErr.message)
  const user = users.find(u => u.email === email)
  if (!user) throw new Error(`Utilizador não encontrado: ${email}`)
  const userId = user.id
  console.log(`✓ Utilizador encontrado: ${userId}`)

  // 2. Load SQLite
  const SQL = await initSqlJs()
  const buf = fs.readFileSync(DB_PATH)
  const db = new SQL.Database(buf)

  // 3. Read items
  const itemsRes = db.exec('SELECT * FROM items ORDER BY id')
  if (!itemsRes.length) { console.log('Sem itens no SQLite.'); return }
  const { columns: iCols, values: iRows } = itemsRes[0]
  const items = iRows.map(row => Object.fromEntries(iCols.map((c, i) => [c, row[i]])))
  console.log(`✓ ${items.length} itens encontrados`)

  // 4. Read activity_log
  const actRes = db.exec('SELECT * FROM activity_log ORDER BY id')
  const activities = actRes.length
    ? actRes[0].values.map(row => Object.fromEntries(actRes[0].columns.map((c, i) => [c, row[i]])))
    : []
  console.log(`✓ ${activities.length} entradas de atividade encontradas`)

  // 5. Insert items — map old integer id → new Supabase uuid
  const idMap = {}
  let ok = 0, fail = 0
  for (const item of items) {
    const { data, error } = await supabase.from('items').insert({
      user_id:                userId,
      title:                  item.title,
      subtitle:               item.subtitle        || null,
      category:               item.category,
      status:                 item.status          || 'wishlist',
      cover:                  item.cover           || null,
      author:                 item.author          || null,
      platform:               item.platform        || null,
      genre:                  item.genre           || null,
      synopsis:               item.synopsis        || null,
      year:                   item.year            || null,
      is_series:              item.is_series ? true : false,
      total_pages:            item.total_pages     || null,
      current_page:           item.current_page    || 0,
      hours_played:           item.hours_played    || 0,
      current_season:         item.current_season  || 1,
      current_episode:        item.current_episode || 1,
      total_episodes:         item.total_episodes  || null,
      rating:                 item.rating          ?? null,
      notes:                  item.notes           || null,
      runtime:                item.runtime         || null,
      steam_app_id:           item.steam_app_id    || null,
      book_type:              item.book_type       || 'book',
      audio_duration_minutes: item.audio_duration_minutes || null,
      total_seasons:          item.total_seasons   || null,
      episodes_per_season:    item.episodes_per_season || null,
      game_platform:          item.game_platform   || null,
      manual_achievements:    item.manual_achievements || null,
      start_date:             item.start_date      || null,
      end_date:               item.end_date        || null,
      ach_unlocked:           item.ach_unlocked    ?? null,
      ach_total:              item.ach_total       ?? null,
      created_at:             item.created_at,
      updated_at:             item.updated_at,
    }).select('id').single()

    if (error) {
      console.error(`  ✗ "${item.title}": ${error.message}`)
      fail++
    } else {
      idMap[item.id] = data.id
      console.log(`  ✓ ${item.title}`)
      ok++
    }
  }
  console.log(`\n✓ Itens: ${ok} migrados, ${fail} falharam`)

  // 6. Insert activity_log
  let actOk = 0
  for (const act of activities) {
    const newItemId = idMap[act.item_id]
    if (!newItemId) continue
    const { error } = await supabase.from('activity_log').insert({
      user_id:    userId,
      item_id:    newItemId,
      category:   act.category,
      title:      act.title,
      field:      act.field,
      delta:      act.delta  ?? null,
      note:       act.note   || null,
      created_at: act.created_at,
    })
    if (!error) actOk++
  }
  console.log(`✓ Atividade: ${actOk} entradas migradas`)
  console.log('\n🎉 Migração concluída!')
}

const email = process.argv[2]
if (!email) {
  console.error('Uso: node migrate.js <o-teu-email>')
  process.exit(1)
}

migrate(email).catch(err => {
  console.error('Erro na migração:', err.message)
  process.exit(1)
})
