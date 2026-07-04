# Vyllo — Checklist para comercialização

Este documento lista o que **já foi tratado no código** e o que **só tu podes resolver** (contas, contratos, registo legal) antes de vender a app.

---

## ✅ Já resolvido no código

- **Removido o OMDb/IMDb.** Era o maior risco legal (posters do IMDb não são licenciáveis comercialmente).
- **Modelo híbrido grátis para filmes/séries:** por omissão usa fontes grátis-comerciais (TVmaze para séries/episódios, Wikipedia para capas de filmes). O **TMDB é opcional** — se puseres a chave, melhora capas/dados automaticamente.
- **"Próximos episódios" via TVmaze** (grátis), não TMDB.
- **"Onde ver" (streaming) removido** no lançamento (dependia de dados pagos/limitados).
- **Atribuições na app** (Definições → Legal & Licenças → "Atribuições de dados"): TVmaze, TMDB (opcional), RAWG, Steam, Open Library, Wikipedia.
- **Política de Privacidade e Termos** reais e orientados ao RGPD (Definições → Legal).
- **Cache no servidor** das pesquisas (7 dias) e do TMDB (12h) — corta custo de IA e chamadas externas repetidas.
- Chaves de API só no backend (não expostas no cliente).

---

## ⚠️ Ação obrigatória da tua parte

### 1. TMDB (OPCIONAL — só se quiseres melhores capas)
- ⚠️ O tier **gratuito do TMDB é só não-comercial**. O uso **comercial custa $149 USD/mês** (Commercial) até $500k receita / 500k utilizadores ativos.
- A app **NÃO precisa do TMDB** para funcionar — por omissão usa TVmaze + Wikipedia (grátis-comercial).
- Se mais tarde quiseres capas/dados melhores e a receita justificar, paga o plano Commercial e mete a chave em `backend/.env`:
  ```
  TMDB_KEY=a_tua_chave
  ```
  A app ativa automaticamente os dados TMDB. Sem chave, continua a usar as fontes grátis.

### 2. RAWG (jogos) — **requer decisão**
- O plano gratuito da RAWG é **só para projetos não-comerciais**.
- Opções:
  - (a) Contactar a RAWG para um **acordo/plano comercial** (https://rawg.io/apidocs), **ou**
  - (b) Migrar para o **IGDB** (Twitch/Amazon), que tem termos comerciais claros e gratuitos. Requer criar uma app no Twitch Developer Console e usar OAuth (Client ID + Secret). — *pede-me para fazer esta migração quando tiveres as credenciais.*

### 3. Steam — remover scraping da loja
- A app faz *scraping* do HTML de `store.steampowered.com/search/suggest` para encontrar AppIDs. Isto viola os Termos da Steam e parte facilmente.
- A **Steam Web API oficial** (`api.steampowered.com`) e o CDN de imagens são aceitáveis (dados do próprio utilizador).
- Recomendado: substituir a pesquisa de jogos por **IGDB** (ver ponto 2b) e manter a Steam só para conquistas. — *posso fazer isto junto com a migração IGDB.*

### 4. Legal / RGPD (és de Portugal → aplica-se)
- Registar a **entidade** que opera a app (empresa/ENI) e indicá-la na Política de Privacidade (substituir "a entidade que opera a Vyllo").
- Rever a **Política de Privacidade e Termos** com um advogado antes do lançamento (os textos na app são um ponto de partida, não aconselhamento jurídico).
- Definir base legal RGPD e, se usares analytics/crash reporting, **consentimento de cookies/tracking**.
- Página de privacidade pública (URL) exigida pelas lojas (App Store / Google Play).

### 5. Lojas de aplicações
- Conta de developer (Apple 99€/ano, Google 25€ único).
- Configurar **subscrição Premium** via In-App Purchase da loja (não cobrar fora da loja em mobile).
- Preencher os formulários de privacidade ("App Privacy" / "Data Safety").

---

## Resumo de risco por fonte de dados

| Fonte | Estado | Ação |
|---|---|---|
| OMDb / IMDb | ❌ Removido | — |
| TVmaze (séries/episódios) | 🟢 Grátis c/ atribuição | Confirmar volume; atribuição já feita |
| Wikipedia (capas filmes) | 🟢 Grátis (CC) | Atribuição já feita |
| TMDB | 🟡 Opcional, 💸 $149/mês comercial | Só se quiseres melhores capas |
| "Onde ver" (JustWatch) | ❌ Removido | Reativar só com TMDB pago |
| RAWG | 🔴 Comercial precisa acordo | Plano comercial **ou** migrar p/ IGDB |
| Steam (store scraping) | 🔴 Contra ToS | Migrar p/ IGDB / API oficial |
| Steam Web API + CDN | 🟢 OK | — |
| Open Library | 🟢 OK c/ atribuição | Atribuição já feita |
| Anthropic (Claude) | 🟢 Legal, 💸 custo | Cache já adicionada |

> **Nota:** Isto é uma orientação técnica, não aconselhamento jurídico. Confirma sempre os Termos atuais de cada serviço e consulta um advogado para o RGPD e contratos.
