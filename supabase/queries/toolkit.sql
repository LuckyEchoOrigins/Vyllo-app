-- PC Playtime Toolkit (vyllo-app.com/tools/pc-playtime). SÓ LEITURA.
--
-- Correr no SQL editor do Supabase. Cada bloco é uma query independente.
-- Tabela: migrations/20261021000002_toolkit_events.sql. Uma sessão = uma visita
-- (ou uma nova tentativa depois de "Start over"). Sem contas: as visitas do dono
-- e dos testes contam aqui, por isso testar com ?utm_source=test e filtrar.


-- ── 1. Funil por semana: visitas → início → fim → leu → Playtime → loja ─────
select date_trunc('week', created_at at time zone 'Europe/Lisbon')::date as week,
       count(distinct session_id) filter (where event = 'toolkit_viewed')       as viewed,
       count(distinct session_id) filter (where event = 'quiz_started')         as started,
       count(distinct session_id) filter (where event = 'quiz_completed')       as completed,
       count(distinct session_id) filter (where event = 'result_viewed')        as read_result,
       count(distinct session_id) filter (where event = 'playtime_cta_clicked') as playtime_cta,
       count(distinct session_id) filter (where event = 'store_clicked')        as store
  from public.toolkit_events
 where coalesce(source, '') not like 'test%'
 group by 1
 order by 1 desc;


-- ── 2. Por campanha (utm_source/utm_campaign): que vídeo traz quem conclui ──
select coalesce(source, '(direct)') as source,
       count(distinct session_id) filter (where event = 'toolkit_viewed')       as viewed,
       count(distinct session_id) filter (where event = 'quiz_completed')       as completed,
       count(distinct session_id) filter (where event = 'playtime_cta_clicked') as playtime_cta,
       count(distinct session_id) filter (where event = 'store_clicked')        as store
  from public.toolkit_events
 where coalesce(source, '') not like 'test%'
 group by 1
 order by viewed desc;


-- ── 3. Resultados e interesse na Playtime por resultado ──────────────────────
select c.result,
       count(*) as completed,
       count(*) filter (where exists (
         select 1 from public.toolkit_events e
          where e.session_id = c.session_id and e.event = 'playtime_cta_clicked')) as playtime_cta,
       count(*) filter (where exists (
         select 1 from public.toolkit_events e
          where e.session_id = c.session_id and e.event = 'store_clicked')) as store
  from public.toolkit_events c
 where c.event = 'quiz_completed'
   and coalesce(c.source, '') not like 'test%'
 group by 1
 order by 2 desc;


-- ── 4. Distribuição das respostas (a frustração mais escolhida, etc.) ───────
select a.key as question, a.value #>> '{}' as answer, count(*) as n,
       round(100.0 * count(*) / sum(count(*)) over (partition by a.key), 1) as pct
  from public.toolkit_events c
 cross join lateral jsonb_each(c.answers) a
 where c.event = 'quiz_completed'
   and coalesce(c.source, '') not like 'test%'
 group by 1, 2
 order by 1, 3 desc;


-- ── 5. Quem clica na Playtime: frustração × telemóvel ────────────────────────
select c.answers ->> 'pain' as pain, c.answers ->> 'phone' as phone,
       count(*) as completed,
       count(*) filter (where exists (
         select 1 from public.toolkit_events e
          where e.session_id = c.session_id and e.event = 'playtime_cta_clicked')) as playtime_cta
  from public.toolkit_events c
 where c.event = 'quiz_completed'
   and coalesce(c.source, '') not like 'test%'
 group by 1, 2
 order by playtime_cta desc, completed desc;
