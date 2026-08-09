-- Cache persistente de pesquisas + instrumentação de custo/uso.
-- ADITIVO: cria tabelas novas, não toca em items nem profiles. Risco zero.

-- ── search_cache ─────────────────────────────────────────────────────────────
-- L2 da cache (o L1 é um Map em memória na edge function, por instância). A chave
-- já inclui categoria + idioma + query normalizada, por isso não há colunas para
-- esses campos. expires_at NULL = permanente (livros/jogos/filmes, que não mudam);
-- definido = expira (pesquisas que trouxeram séries → now() + 7 dias).
create table if not exists public.search_cache (
  key         text primary key,
  payload     jsonb       not null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.search_cache enable row level security;

-- Leitura para utilizadores autenticados. Escrita: SEM política → só a service
-- role (que ignora o RLS) escreve. Impede que um utilizador envenene a cache e
-- sirva metadados falsos a toda a gente.
create policy "search_cache read for authenticated"
  on public.search_cache for select
  to authenticated
  using (true);

-- ── search_events ────────────────────────────────────────────────────────────
-- Uma linha por pedido de search/translate/synopsis. Captura o custo real (tokens)
-- e o nível onde foi servido (l1/l2/ai). Escrito pela edge function com a service
-- role; nunca acedido pelo cliente (RLS sem políticas = locked down).
--
-- Rate limit (a LIGAR mais tarde, ~10 linhas na edge function, NÃO agora):
-- contar as linhas de HOJE de um user_id com cache_level = 'ai' e action = 'search'
-- dá os misses PAGOS do dia — é isso que se limita, não os pedidos (um hit de
-- cache custa zero). O índice abaixo suporta essa contagem.
create table if not exists public.search_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  user_id       uuid,
  action        text        not null,         -- search | translate | synopsis
  cache_level   text        not null,         -- l1 | l2 | ai
  input_tokens  integer     not null default 0,
  output_tokens integer     not null default 0
);

create index if not exists search_events_user_created_idx
  on public.search_events (user_id, created_at);

alter table public.search_events enable row level security;
-- (sem políticas: só a service role acede)

-- ── paywall_events ───────────────────────────────────────────────────────────
-- Paywall mostrado / convertido. Escrito pelo CLIENTE, fire-and-forget, por isso
-- o RLS deixa o utilizador inserir apenas as SUAS linhas. Sem SELECT: ninguém lê
-- do cliente (a análise corre com a service role). Autopoluição é o único risco,
-- aceitável para métricas de produto.
create table if not exists public.paywall_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  event       text        not null,           -- shown | converted
  feature     text,                           -- library | search | goals | year | share | ...
  plan        text                            -- monthly | annual | lifetime (só em converted)
);

create index if not exists paywall_events_created_idx
  on public.paywall_events (created_at);

alter table public.paywall_events enable row level security;

create policy "paywall_events insert own"
  on public.paywall_events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── Itens por utilizador — NÃO precisa de tabela ─────────────────────────────
-- Já é consultável a partir de items (tem user_id + created_at). A distribuição
-- e o "quanto tempo demoram a lá chegar" saem desta query:
--   select user_id,
--          count(*)          as itens,
--          min(created_at)   as primeiro_item,
--          max(created_at)   as ultimo_item
--   from public.items
--   group by user_id
--   order by itens desc;
