# 📚 Minha Coleção

Tracker pessoal de livros, jogos e filmes com pesquisa inteligente via Claude AI.

---

## ⚡ Instalação rápida (Windows)

### Pré-requisito: Node.js
Se ainda não tens Node.js instalado, vai a **https://nodejs.org** e instala a versão **LTS**.

### 1. Instalar dependências

Faz duplo-clique em **`instalar.bat`** ou abre um terminal na pasta e executa:

```bash
npm run install:all
```

### 2. Configurar a API Key

Abre o ficheiro **`backend\.env`** (criado automaticamente pelo instalar.bat) e adiciona a tua chave:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=3001
```

Obtém a tua API key em: https://console.anthropic.com

### 3. Iniciar a app

Faz duplo-clique em **`iniciar.bat`** ou executa:

```bash
npm run dev
```

Abre **http://localhost:5173** no browser.

---

## 🎮 Funcionalidades

| Categoria | Rastreio |
|-----------|---------|
| 📖 Livros | Páginas lidas (slider interativo) |
| 🎮 Jogos | Horas jogadas (contador +/−) |
| 🎬 Filmes | Estado (sem progresso detalhado) |
| 📺 Séries | Temporada + Episódio atual |

**Pesquisa inteligente**: Claude AI pesquisa metadados reais — capa, sinopse, autor, género, páginas, episódios.

**Estatísticas**: Gráfico donut, barras de progresso, racha de atividade diária, últimas avaliações.

**Avaliação por estrelas**: Disponível ao marcar como "Concluído".

**Persistência total**: Base de dados SQLite local (`backend/collection.db`).

---

## 🛠 Stack

- **Frontend**: React 18 + Vite · Nunito (Google Fonts) · Mobile-first (max 390px)
- **Backend**: Node.js + Express
- **BD**: SQLite via better-sqlite3
- **IA**: Anthropic Claude `claude-sonnet-4-6` com `web_search`

## 📁 Estrutura

```
Minha Coleção/
├── backend/
│   ├── server.js          # Express app (porta 3001)
│   ├── db.js              # SQLite setup e schema
│   ├── routes/
│   │   ├── items.js       # GET/POST/PUT/DELETE /api/items
│   │   └── search.js      # POST /api/search (Claude AI)
│   ├── collection.db      # Base de dados (gerada automaticamente)
│   └── .env               # Configuração (ANTHROPIC_API_KEY)
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── utils.js
│       ├── screens/
│       │   ├── Home.jsx
│       │   ├── Library.jsx
│       │   ├── Stats.jsx
│       │   └── Profile.jsx
│       └── components/
│           ├── BottomNav.jsx
│           ├── AddModal.jsx
│           ├── ItemDetail.jsx
│           ├── CoverImage.jsx
│           └── StarRating.jsx
├── instalar.bat           # Instalação automática (Windows)
└── iniciar.bat            # Arrancar a app (Windows)
```
