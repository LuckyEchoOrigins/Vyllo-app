-- NAO APLICADA. Fica fora de supabase/migrations de proposito: um `db push`
-- nao a corre. So com aprovacao, depois de ver a simulacao
-- (supabase/queries/completion_dates_simulation.sql).
--
-- Recupera a data de conclusao (end_date, TEXTO 'YYYY-MM-DD') de itens
-- concluidos que a nao tem, a partir do ultimo evento 'completed' do
-- activity_log do MESMO item e do MESMO utilizador (o dia, hora de Lisboa).
--
-- So mexe em itens que:
--   - estao concluidos agora;
--   - nao tem end_date (null ou texto vazio);
--   - tem pelo menos um evento 'completed' desse item e utilizador;
--   - NAO foram editados mais de 1 dia depois desse evento, nem mudaram de
--     estado depois dele (ambiguos: a data pode ter sido apagada de
--     proposito; ficam como estao e aparecem na simulacao).
-- Nao toca em updated_at (nao ha gatilho de UPDATE em items).
--
-- Copia de seguranca: public.end_date_backfill_20261025 guarda, por item,
-- o valor antigo e o novo. Reverter: ver o fim deste ficheiro.
--
-- Idempotente: correr de novo nao muda nada. Os itens ja preenchidos deixam
-- de ser candidatos (ja tem end_date) e a copia tem chave no item (on
-- conflict do nothing): a segunda vez da "INSERT 0 0" e "UPDATE 0".

begin;

create table if not exists public.end_date_backfill_20261025 (
  item_id       bigint      primary key,
  user_id       uuid        not null,
  old_end_date  text,
  new_end_date  text        not null,
  event_at      timestamptz not null,
  n_events      integer     not null,
  applied_at    timestamptz not null default now()
);

-- So a service role le e escreve (sem politicas para o cliente).
alter table public.end_date_backfill_20261025 enable row level security;

with events as (
  select l.item_id, l.user_id,
         count(*)          as n_events,
         max(l.created_at) as last_event
    from public.activity_log l
   where l.field = 'status' and l.note = 'completed'
   group by l.item_id, l.user_id
),
later_status as (
  select l.item_id, l.user_id
    from public.activity_log l
    join events e on e.item_id = l.item_id and e.user_id = l.user_id
   where l.field = 'status' and l.note <> 'completed'
     and l.created_at > e.last_event
   group by l.item_id, l.user_id
)
insert into public.end_date_backfill_20261025
       (item_id, user_id, old_end_date, new_end_date, event_at, n_events)
select i.id, i.user_id, i.end_date,
       to_char(e.last_event at time zone 'Europe/Lisbon', 'YYYY-MM-DD'),
       e.last_event, e.n_events
  from public.items i
  join events e on e.item_id = i.id and e.user_id = i.user_id
 where i.status = 'completed'
   and nullif(btrim(i.end_date), '') is null
   and i.updated_at <= e.last_event + interval '1 day'
   and not exists (
     select 1 from later_status s
      where s.item_id = i.id and s.user_id = i.user_id)
on conflict (item_id) do nothing;

update public.items i
   set end_date = b.new_end_date
  from public.end_date_backfill_20261025 b
 where b.item_id = i.id
   and b.user_id = i.user_id
   and i.status = 'completed'
   and nullif(btrim(i.end_date), '') is null;

commit;

-- ── Verificar depois de aplicar ─────────────────────────────────────────────
-- select count(*) from public.end_date_backfill_20261025;           -- alterados
-- select count(*) from public.items i
--   join public.end_date_backfill_20261025 b on b.item_id = i.id
--  where i.end_date is distinct from b.new_end_date;                 -- deve dar 0

-- ── Reverter ────────────────────────────────────────────────────────────────
-- Repoe o valor antigo so onde a data ainda e a que a migracao pos (se o
-- utilizador ja a mudou entretanto, fica a dele):
--
-- begin;
-- update public.items i
--    set end_date = b.old_end_date
--   from public.end_date_backfill_20261025 b
--  where b.item_id = i.id and i.end_date = b.new_end_date;
-- commit;
-- -- So depois de confirmar: drop table public.end_date_backfill_20261025;
