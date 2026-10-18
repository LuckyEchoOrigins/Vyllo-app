-- Funil até ao primeiro item: aberturas por dia e pesquisas que não encontram
-- nada. ADITIVO: duas tabelas escritas pelo cliente (só pode inserir as suas
-- linhas, sem SELECT; a análise corre com a service role) e o item_1 a separar
-- filmes de séries. Sem o texto pesquisado nem títulos. Tudo sai com a conta.

-- ── app_opens ────────────────────────────────────────────────────────────────
-- Uma linha por conta e por dia (hora de Lisboa, decidida pela app) em que a
-- app foi aberta: retenção no dia 1, 7, 30 sem guardar cada abertura.
create table if not exists public.app_opens (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.app_opens enable row level security;

create policy "app_opens insert own"
  on public.app_opens for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── search_misses ────────────────────────────────────────────────────────────
-- Pesquisas sem resultado, no máximo uma por conta, dia, categoria e motivo:
--   empty  a pesquisa respondeu, mas sem nenhum título
--   error  falhou (rede, servidor, serviço externo)
-- Mede quantas contas/dias foram afetados por categoria, não quantas pesquisas.
-- Nunca guarda o que foi escrito.
create table if not exists public.search_misses (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  day         date        not null,
  category    text        not null check (category in ('book', 'game', 'film')),
  outcome     text        not null check (outcome in ('empty', 'error')),
  created_at  timestamptz not null default now(),
  primary key (user_id, day, category, outcome)
);

create index if not exists search_misses_day_idx on public.search_misses (day);

alter table public.search_misses enable row level security;

create policy "search_misses insert own"
  on public.search_misses for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── item_1: série em vez de filme ────────────────────────────────────────────
-- Filmes e séries partilham a categoria 'film'; no primeiro item conta saber
-- qual foi ('series' quando is_series). Mesma função de 20261020000001, só o
-- detalhe do item_1 muda.
create or replace function public.item_first_kind(p_category text, p_is_series boolean)
returns text
language sql
immutable
as $$
  select case when p_category = 'film' and coalesce(p_is_series, false) then 'series'
              else p_category end
$$;

create or replace function public.log_item_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activation_events (user_id, event, detail)
  select added.user_id, m.event,
         case when m.event = 'item_1' then (
           select public.item_first_kind(i.category, i.is_series) from public.items i
            where i.user_id = added.user_id
            order by i.created_at, i.id
            limit 1)
         end
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

  insert into public.activation_events (user_id, event, detail)
  select firsts.user_id, 'second_category',
         string_agg(firsts.category, '+' order by firsts.first_at, firsts.first_id)
    from (
      select i.user_id, i.category, min(i.created_at) as first_at, min(i.id) as first_id,
             row_number() over (partition by i.user_id order by min(i.created_at), min(i.id)) as n
        from public.items i
       where i.user_id in (select distinct user_id from new_items where user_id is not null)
       group by i.user_id, i.category
    ) firsts
   where firsts.n <= 2
     and not exists (
       select 1 from public.activation_events e
        where e.user_id = firsts.user_id and e.event = 'second_category')
   group by firsts.user_id
  having count(*) = 2
  on conflict (user_id, event) do nothing;
  return null;
exception when others then
  -- As métricas nunca podem impedir que um item seja guardado.
  return null;
end;
$$;

-- Os item_1 que já existem: série quando o primeiro item é uma série.
update public.activation_events e
   set detail = 'series'
 where e.event = 'item_1' and e.detail = 'film'
   and (select i.is_series from public.items i
         where i.user_id = e.user_id
         order by i.created_at, i.id limit 1);
