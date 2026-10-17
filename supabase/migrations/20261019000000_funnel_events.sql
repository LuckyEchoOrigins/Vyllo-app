-- Funil de aquisição e ativação: de onde vêm as contas, quantas chegam a usar a
-- app e o que as leva ao paywall. Para julgar uma campanha com números reais.
-- ADITIVO: duas tabelas novas, um trigger em items que nunca falha o insert e
-- uma FK em paywall_events. A leitura está em supabase/queries/funnel.sql.
--
-- Sem dados pessoais: só o id da conta, o nome do evento e uma origem escolhida
-- numa lista fechada. Nada do que o utilizador escreve, nem títulos. Tudo sai
-- com a conta (on delete cascade a partir de auth.users, que o delete-account
-- apaga).

-- ── acquisition_sources ──────────────────────────────────────────────────────
-- Resposta a "Como conheceste o Vyllo?", a última página do onboarding. Uma
-- linha por conta: fica a primeira resposta (a chave primária recusa as
-- seguintes, ex.: o onboarding num segundo telemóvel). 'skipped' = viu a
-- pergunta e saltou-a; sem linha = nunca a viu (versões antigas da app).
-- Escrito pelo CLIENTE, por isso o RLS só deixa inserir a própria linha. Sem
-- SELECT: a análise corre com a service role.
create table if not exists public.acquisition_sources (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  source      text        not null check (source in (
                'tiktok', 'instagram', 'reddit', 'youtube',
                'store_search', 'friend', 'other', 'skipped')),
  created_at  timestamptz not null default now()
);

create index if not exists acquisition_sources_created_idx
  on public.acquisition_sources (created_at);

alter table public.acquisition_sources enable row level security;

create policy "acquisition_sources insert own"
  on public.acquisition_sources for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── activation_events ────────────────────────────────────────────────────────
-- A PRIMEIRA vez que cada conta fez cada coisa: uma linha por (conta, evento),
-- por isso conta-se com count(*) sem deduplicar. Um evento novo é só um nome
-- novo, sem migration. Os de agora:
--   item_1        primeiro item na coleção      (trigger abaixo)
--   item_5        quinto item                   (trigger abaixo)
--   steam_linked  conta Steam ligada no perfil  (cliente)
--   share_image   imagem partilhada ou guardada (cliente: item, stats, ano)
--   wrapped_share Wrapped partilhado ou guardado (cliente)
-- O cliente insere as suas; um repetido falha na unique e é ignorado
-- (fire-and-forget).
create table if not exists public.activation_events (
  id          bigint      generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  event       text        not null,
  unique (user_id, event)
);

create index if not exists activation_events_created_idx
  on public.activation_events (created_at);

alter table public.activation_events enable row level security;

create policy "activation_events insert own"
  on public.activation_events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── item_1 / item_5 no servidor ──────────────────────────────────────────────
-- No servidor e não no cliente: apanha todos os caminhos que criam itens (folha
-- de adicionar, jogos novos da Steam, jogos do PC, importação, fila offline) e
-- também as versões da app que já estão nas lojas.
--
-- Por instrução (não por linha), com a tabela das linhas novas: uma importação
-- de 50 itens numa conta vazia cruza o 1 e o 5 de uma vez. Antes = total -
-- inseridos; regista quem passou de abaixo do limite para o limite ou acima.
-- Uma conta antiga com 30 itens não regista nada; apagar e voltar a adicionar
-- não repete (on conflict do nothing).
create or replace function public.log_item_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activation_events (user_id, event)
  select added.user_id, m.event
    from (
      select n.user_id, count(*) as n
        from new_items n
       where n.user_id is not null
       group by n.user_id
    ) added
    cross join lateral (
      select count(*) as n from public.items i where i.user_id = added.user_id
    ) total
    join (values ('item_1', 1), ('item_5', 5)) as m (event, threshold)
      on total.n - added.n < m.threshold and total.n >= m.threshold
  on conflict (user_id, event) do nothing;
  return null;
exception when others then
  -- As métricas nunca podem impedir que um item seja guardado.
  return null;
end;
$$;

drop trigger if exists items_log_milestones on public.items;
create trigger items_log_milestones
  after insert on public.items
  referencing new table as new_items
  for each statement
  execute function public.log_item_milestones();

-- ── paywall_events: sai com a conta ──────────────────────────────────────────
-- A tabela existe desde 20260807 sem FK e a app passa agora a escrever nela
-- (shown, plan_selected, purchase_started, converted, restore). Sem FK, as
-- linhas ficavam depois de apagar a conta. Em 2026-10-17 tinha 0 linhas; as
-- órfãs (se houver) saem antes de criar a FK.
delete from public.paywall_events p
 where p.user_id is not null
   and not exists (select 1 from auth.users u where u.id = p.user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'paywall_events_user_id_fkey'
  ) then
    alter table public.paywall_events
      add constraint paywall_events_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end;
$$;

create index if not exists paywall_events_user_idx
  on public.paywall_events (user_id);
