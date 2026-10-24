-- Simulacao da recuperacao de datas de conclusao (SO LEITURA: so selects).
-- Ver supabase/pending/20261025000000_completion_dates_backfill.sql.
--
-- end_date e TEXTO: vazio ('') conta como sem data, como null.
-- Candidato: item concluido, sem end_date, com pelo menos um evento
-- 'completed' no activity_log do MESMO item e do MESMO utilizador. A data
-- proposta e o dia (hora de Lisboa) do ultimo desses eventos.
-- "real" = contas fora de public.analytics_excluded_users; "excluded" = dono,
-- testes, familia.

-- ── 1. Resumo ────────────────────────────────────────────────────────────────
with base as (
  select i.id, i.user_id, i.created_at, i.updated_at,
         exists (select 1 from public.analytics_excluded_users x where x.user_id = i.user_id) as excluded
    from public.items i
   where i.status = 'completed' and nullif(btrim(i.end_date), '') is null
),
events as (
  select l.item_id, l.user_id,
         count(*) as n_events,
         max(l.created_at) as last_event,
         min(l.created_at) as first_event
    from public.activity_log l
   where l.field = 'status' and l.note = 'completed'
   group by l.item_id, l.user_id
),
later_status as (
  -- Mudancas de estado depois do ultimo 'completed' (reaberto, abandonado).
  select l.item_id, l.user_id, count(*) as n
    from public.activity_log l
    join events e on e.item_id = l.item_id and e.user_id = l.user_id
   where l.field = 'status' and l.note <> 'completed' and l.created_at > e.last_event
   group by l.item_id, l.user_id
),
joined as (
  select b.*, e.n_events, e.last_event,
         coalesce(s.n, 0) as later_status_changes
    from base b
    left join events e on e.item_id = b.id and e.user_id = b.user_id
    left join later_status s on s.item_id = b.id and s.user_id = b.user_id
)
select case when excluded then 'excluded' else 'real' end as accounts,
       count(*)                                                   as completed_without_end_date,
       count(*) filter (where last_event is not null)             as recoverable,
       count(*) filter (where last_event is null)                 as stay_without_date,
       count(distinct user_id)                                    as users,
       -- Ambiguos (recuperaveis, mas a ver):
       count(*) filter (where n_events > 1)                       as amb_completed_more_than_once,
       count(*) filter (where last_event is not null
                          and updated_at > last_event + interval '1 day') as amb_edited_after_event,
       count(*) filter (where later_status_changes > 0)          as amb_status_changed_after,
       count(*) filter (where last_event is not null
                          and last_event < created_at - interval '1 minute') as amb_event_before_item
  from joined
 group by 1
 order by 1;


-- ── 2. Exemplos (sem titulos): o que mudaria ─────────────────────────────────
select i.id as item_id,
       i.category,
       case when exists (select 1 from public.analytics_excluded_users x where x.user_id = i.user_id)
            then 'excluded' else 'real' end as accounts,
       (i.created_at at time zone 'Europe/Lisbon')::date as added_on,
       (i.updated_at at time zone 'Europe/Lisbon')::date as last_edit,
       e.n_events,
       (e.last_event at time zone 'Europe/Lisbon')::date  as proposed_end_date
  from public.items i
  join (
    select item_id, user_id, count(*) as n_events, max(created_at) as last_event
      from public.activity_log
     where field = 'status' and note = 'completed'
     group by item_id, user_id
  ) e on e.item_id = i.id and e.user_id = i.user_id
 where i.status = 'completed' and nullif(btrim(i.end_date), '') is null
 order by e.last_event desc
 limit 15;


-- ── 3. Importacoes antigas a rever (nao se muda nada) ────────────────────────
-- Concluidos com end_date criados em lote (10+ itens no mesmo minuto da
-- mesma conta: uma importacao). Antes de 2026-10-25 a importacao gravava a
-- data em que foi adicionado na outra app quando faltava a data de leitura,
-- por isso parte destas datas pode nao ser de conclusao. Nao ha forma segura
-- de as separar: so se contam.
with batches as (
  select user_id, date_trunc('minute', created_at) as minute
    from public.items
   group by 1, 2
  having count(*) >= 10
)
select case when exists (select 1 from public.analytics_excluded_users x where x.user_id = i.user_id)
            then 'excluded' else 'real' end as accounts,
       count(*) as imported_completed_with_end_date,
       count(distinct i.user_id) as users
  from public.items i
  join batches b on b.user_id = i.user_id and b.minute = date_trunc('minute', i.created_at)
 where i.status = 'completed' and nullif(btrim(i.end_date), '') is not null
 group by 1
 order by 1;
