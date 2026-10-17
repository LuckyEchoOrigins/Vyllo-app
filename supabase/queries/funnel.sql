-- Funil do Vyllo por semana. SÓ LEITURA: só selects, não muda nada.
--
-- Correr no SQL editor do Supabase (corre como postgres, que lê auth.users e as
-- tabelas sem SELECT para o cliente). Cada bloco é uma query independente:
-- selecionar um bloco e correr.
--
-- Semana = segunda-feira, hora de Lisboa. "Coorte" = a semana em que a conta
-- foi criada: as contas de uma campanha comparam-se com as das outras semanas.
-- As tabelas vêm de migrations/20260807000000_search_cache_and_metrics.sql
-- (paywall_events) e migrations/20261019000000_funnel_events.sql.
--
-- Para tirar contas de teste, acrescentar ao "users" de cada bloco:
--   and u.email not in ('conta-de-teste@exemplo.com')
--
-- Notas de leitura:
-- - Ativação: 1.º item. Vem de activation_events (item_1); as contas de antes
--   da migration usam o 1.º item em items (um item apagado entretanto perde-se).
-- - 'converted' inclui o início dos 7 dias grátis (as lojas tratam-no como
--   compra). Pagamento confirmado: premium_now (profiles) uns dias depois.
-- - acquisition_sources: '(not asked)' = conta que nunca viu a pergunta
--   (versão antiga da app ou onboarding feito antes desta versão).


-- ── 1. Coortes semanais: contas, ativação, Premium ───────────────────────────
with users as (
  select u.id,
         u.created_at,
         date_trunc('week', u.created_at at time zone 'Europe/Lisbon')::date as week
    from auth.users u
   where true
),
items_by_user as (
  select i.user_id,
         min(i.created_at) as first_item_at,
         min(i.created_at) filter (where i.n = 5) as fifth_item_at
    from (
      select user_id, created_at,
             row_number() over (partition by user_id order by created_at) as n
        from public.items
    ) i
   group by i.user_id
),
milestones as (
  select user_id,
         min(created_at) filter (where event = 'item_1') as item_1_at,
         min(created_at) filter (where event = 'item_5') as item_5_at,
         bool_or(event = 'steam_linked') as steam,
         bool_or(event in ('share_image', 'wrapped_share')) as shared,
         bool_or(event = 'wrapped_share') as wrapped
    from public.activation_events
   group by user_id
),
per_user as (
  select u.week,
         coalesce(m.item_1_at, i.first_item_at) - u.created_at as to_first_item,
         coalesce(m.item_5_at, i.fifth_item_at) - u.created_at as to_fifth_item,
         coalesce(m.steam, false) or p.steam_id is not null as steam,
         coalesce(m.shared, false) as shared,
         coalesce(m.wrapped, false) as wrapped,
         coalesce(p.is_premium, false) as premium
    from users u
    left join items_by_user i on i.user_id = u.id
    left join milestones m on m.user_id = u.id
    left join public.profiles p on p.id = u.id
)
select week,
       count(*)                                                    as signups,
       count(*) filter (where to_first_item < interval '1 day')    as first_item_1d,
       count(*) filter (where to_first_item < interval '7 days')   as first_item_7d,
       round(100.0 * count(*) filter (where to_first_item < interval '7 days')
             / count(*), 1)                                        as activation_7d_pct,
       count(*) filter (where to_fifth_item < interval '7 days')   as five_items_7d,
       round(100.0 * count(*) filter (where to_fifth_item < interval '7 days')
             / count(*), 1)                                        as five_items_7d_pct,
       count(*) filter (where to_first_item is not null)           as first_item_ever,
       count(*) filter (where steam)                               as steam_linked,
       count(*) filter (where shared)                              as shared_image,
       count(*) filter (where wrapped)                             as shared_wrapped,
       count(*) filter (where premium)                             as premium_now,
       round(100.0 * count(*) filter (where premium) / count(*), 1) as premium_pct
  from per_user
 group by week
 order by week desc;


-- ── 2. Paywall por semana e funcionalidade ───────────────────────────────────
-- Semana do evento (não da conta). Contas distintas em cada passo: de quem viu
-- o paywall aberto por X, quantas escolheram plano, abriram a loja, compraram.
select date_trunc('week', e.created_at at time zone 'Europe/Lisbon')::date as week,
       coalesce(e.feature, '(none)')                                      as feature,
       count(*) filter (where e.event = 'shown')                          as views,
       count(distinct e.user_id) filter (where e.event = 'shown')         as users_shown,
       count(distinct e.user_id) filter (where e.event = 'plan_selected') as users_plan_selected,
       count(distinct e.user_id) filter (where e.event = 'purchase_started') as users_purchase_started,
       count(distinct e.user_id) filter (where e.event = 'converted')     as users_converted,
       count(distinct e.user_id) filter (where e.event = 'restore')       as users_restore
  from public.paywall_events e
 group by 1, 2
 order by 1 desc, views desc;


-- ── 3. Conversões por semana e plano ─────────────────────────────────────────
-- paywall_events: a compra na app, com a funcionalidade que abriu o paywall.
-- profiles: o Premium que as lojas confirmaram, pela semana da conta (inclui
-- as compras de antes de a app registar eventos).
select 'paywall_events'                                                 as source,
       date_trunc('week', e.created_at at time zone 'Europe/Lisbon')::date as week,
       coalesce(e.plan, '(unknown)')                                    as plan,
       count(distinct e.user_id)                                        as users
  from public.paywall_events e
 where e.event = 'converted'
 group by 1, 2, 3
union all
select 'profiles (premium_now, signup week)',
       date_trunc('week', u.created_at at time zone 'Europe/Lisbon')::date,
       case
         when coalesce(p.apple_product_id, p.google_product_id, '') like '%monthly%'
           or p.stripe_plan = 'monthly' then 'monthly'
         when coalesce(p.apple_product_id, p.google_product_id, '') like '%annual%'
           or p.stripe_plan = 'annual' then 'annual'
         when coalesce(p.apple_product_id, p.google_product_id, '') like '%lifetime%'
           or p.stripe_plan = 'lifetime' then 'lifetime'
         else '(unknown)'
       end,
       count(*)
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.is_premium
 group by 1, 2, 3
 order by 1, 2 desc, 3;


-- ── 4. Por origem ("Como conheceste o Vyllo?") e semana da conta ─────────────
with users as (
  select u.id,
         u.created_at,
         date_trunc('week', u.created_at at time zone 'Europe/Lisbon')::date as week
    from auth.users u
   where true
),
first_items as (
  select user_id, min(created_at) as first_item_at
    from public.items
   group by user_id
),
paywall as (
  select user_id,
         bool_or(event = 'shown')     as shown,
         bool_or(event = 'converted') as converted
    from public.paywall_events
   group by user_id
)
select u.week,
       coalesce(s.source, '(not asked)')                         as source,
       count(*)                                                  as signups,
       count(*) filter (where coalesce(a.created_at, f.first_item_at)
                              < u.created_at + interval '7 days') as first_item_7d,
       round(100.0 * count(*) filter (where coalesce(a.created_at, f.first_item_at)
                              < u.created_at + interval '7 days')
             / count(*), 1)                                      as activation_7d_pct,
       count(*) filter (where pw.shown)                          as saw_paywall,
       count(*) filter (where pw.converted)                      as converted,
       count(*) filter (where p.is_premium)                      as premium_now
  from users u
  left join public.acquisition_sources s on s.user_id = u.id
  left join public.activation_events a on a.user_id = u.id and a.event = 'item_1'
  left join first_items f on f.user_id = u.id
  left join paywall pw on pw.user_id = u.id
  left join public.profiles p on p.id = u.id
 group by 1, 2
 order by 1 desc, signups desc;


-- ── 5. Origem, todas as semanas juntas ───────────────────────────────────────
-- O mesmo que o 4 sem a semana: com poucas contas por semana, é este que se lê.
select coalesce(s.source, '(not asked)')                           as source,
       count(*)                                                    as signups,
       count(*) filter (where exists (
         select 1 from public.items i where i.user_id = u.id))     as with_items,
       count(*) filter (where exists (
         select 1 from public.paywall_events e
          where e.user_id = u.id and e.event = 'converted'))       as converted,
       count(*) filter (where p.is_premium)                        as premium_now
  from auth.users u
  left join public.acquisition_sources s on s.user_id = u.id
  left join public.profiles p on p.id = u.id
 group by 1
 order by signups desc;
