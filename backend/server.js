require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));  // listas grandes de conquistas (ex: Halo MCC tem 700)

app.get('/api/health', (_, res) => res.json({ ok: true }));

async function start() {
  try {
    await initDb();

    // Load routes AFTER db is ready
    const itemsRouter = require('./routes/items');
    const searchRouter = require('./routes/search');
    const steamRouter = require('./routes/steam');
    const tvRouter = require('./routes/tv');
    app.use('/api/items', itemsRouter);
    app.use('/api/search', searchRouter);
    app.use('/api/steam', steamRouter);
    app.use('/api/tv', tvRouter);

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`🚀 Minha Coleção backend na porta ${PORT}`));
  } catch (err) {
    console.error('Erro ao iniciar:', err);
    process.exit(1);
  }
}

start();
