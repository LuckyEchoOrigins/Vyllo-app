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
-- Contas excluídas: todas as queries tiram as de public.analytics_excluded_users
-- (dono da app, testes, família e amigos que testaram). Para tirar outra:
--   insert into public.analytics_excluded_users (user_id) values ('<id>');
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
   where not exists (select 1 from public.analytics_excluded_users x where x.user_id = u.id)
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
 where not exists (select 1 from public.analytics_excluded_users x where x.user_id = e.user_id)
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
   and not exists (select 1 from public.analytics_excluded_users x where x.user_id = e.user_id)
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
   and not exists (select 1 from public.analytics_excluded_users x where x.user_id = u.id)
 group by 1, 2, 3
 order by 1, 2 desc, 3;


-- ── 4. Por origem ("Como conheceste o Vyllo?") e semana da conta ─────────────
with users as (
  select u.id,
         u.created_at,
         date_trunc('week', u.created_at at time zone 'Europe/Lisbon')::date as week
    from auth.users u
   where not exists (select 1 from public.analytics_excluded_users x where x.user_id = u.id)
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
 where not exists (select 1 from public.analytics_excluded_users x where x.user_id = u.id)
 group by 1
 order by signups desc;


-- ── 6. Que comportamentos antecedem uma compra ───────────────────────────────
-- Por comportamento: quantas contas o fizeram e quantas compraram nos 7 e nos 30
-- dias seguintes. Mesma janela para todos, para uma conta antiga não ganhar só
-- por ter tido mais tempo. "Compra" = venda confirmada pela loja
-- (purchase_events: compra paga ou dias grátis que passaram a pagamento); os
-- dias grátis sozinhos e as compras de antes (existing) não contam.
-- Os de 20261020000000_conversion_events.sql: second_category,
-- stats_first_viewed, free_limit_items / free_limit_ai_search /
-- free_limit_import, premium_activated.
with sales as (
  select user_id, min(created_at) as sold_at
    from public.purchase_events
   where kind in ('purchase', 'trial_converted')
   group by user_id
),
behaviours as (
  select user_id, event as behaviour, created_at as done_at
    from public.activation_events
   where event <> 'premium_activated'
  union all
  select user_id, 'free_limit_any', min(created_at)
    from public.activation_events
   where event like 'free_limit_%'
   group by user_id
  union all
  select user_id, 'paywall_shown', min(created_at)
    from public.paywall_events
   where event = 'shown' and user_id is not null
   group by user_id
)
select b.behaviour,
       count(*)                                                              as accounts,
       count(*) filter (where s.sold_at between b.done_at and b.done_at + interval '7 days')  as bought_7d,
       count(*) filter (where s.sold_at between b.done_at and b.done_at + interval '30 days') as bought_30d,
       round(100.0 * count(*) filter (where s.sold_at between b.done_at and b.done_at + interval '30 days')
             / nullif(count(*), 0), 1)                                         as pct_30d,
       -- Contas que ainda não tiveram 30 dias desde o comportamento: a taxa
       -- de 30 dias ainda vai subir.
       count(*) filter (where b.done_at > now() - interval '30 days')       as still_open
  from behaviours b
  left join sales s on s.user_id = b.user_id
 where not exists (select 1 from public.analytics_excluded_users x where x.user_id = b.user_id)
 group by b.behaviour
 order by pct_30d desc nulls last, accounts desc;


-- ── 7. Vendas por tipo e loja ────────────────────────────────────────────────
-- Uma linha por transação. 'trial' ainda não é venda; 'trial_converted' é.
select date_trunc('week', created_at at time zone 'Europe/Lisbon')::date as week,
       store,
       kind,
       plan,
       count(*) as n
  from public.purchase_events p
 where p.kind <> 'existing'
   and not exists (select 1 from public.analytics_excluded_users x where x.user_id = p.user_id)
 group by 1, 2, 3, 4
 order by 1 desc, 2, 3;


-- ── 8. Origem, plataforma e primeira categoria → compra ──────────────────────
-- Liga o marketing às compras: por origem ("Como conheceste o Vyllo?"),
-- plataforma e categoria do primeiro item, quantas contas compraram nos 30 dias
-- seguintes à criação da conta.
with sales as (
  select user_id, min(created_at) as sold_at
    from public.purchase_events
   where kind in ('purchase', 'trial_converted')
   group by user_id
)
select coalesce(s.source, '(not asked)')                     as source,
       coalesce(a.platform, '(unknown)')                     as platform,
       -- item_1 só existe desde 2026-10-17; antes disso, o primeiro item.
       coalesce(f.detail, (select i.category from public.items i
                            where i.user_id = u.id
                            order by i.created_at, i.id limit 1),
                '(no items)')                                as first_category,
       count(*)                                              as signups,
       count(*) filter (where e.user_id is not null)         as second_category,
       count(*) filter (where x.sold_at <= u.created_at + interval '30 days') as bought_30d
  from auth.users u
  left join public.acquisition_sources s on s.user_id = u.id
  left join public.account_attributes a on a.user_id = u.id
  left join public.activation_events f on f.user_id = u.id and f.event = 'item_1'
  left join public.activation_events e on e.user_id = u.id and e.event = 'second_category'
  left join sales x on x.user_id = u.id
 where not exists (select 1 from public.analytics_excluded_users x where x.user_id = u.id)
 group by 1, 2, 3
 order by signups desc;


-- ── 9. Do registo ao primeiro item, e quem volta ─────────────────────────────
-- Para cada passo, quantas contas lá chegaram (cada passo é a primeira vez da
-- conta). onboarding/pesquisa/escolha vêm da app (versões de 2026-10-18 em diante);
-- item_1 vem do servidor. Volta = abriu a app 1, 7 e 30 dias depois do registo
-- (app_opens, uma linha por dia), só para contas com idade para isso.
with users as (
  select u.id, u.created_at,
         (u.created_at at time zone 'Europe/Lisbon')::date as signup_day
    from auth.users u
   where not exists (select 1 from public.analytics_excluded_users x where x.user_id = u.id)
),
steps as (
  select user_id,
         bool_or(event = 'onboarding_completed')  as onboarding,
         bool_or(event = 'search_started')        as searched,
         bool_or(event = 'search_results_viewed') as got_results,
         bool_or(event = 'item_selected')         as selected,
         bool_or(event = 'item_1')                as first_item
    from public.activation_events
   group by user_id
)
select count(*)                                                     as signups,
       count(*) filter (where s.onboarding)                         as onboarding_completed,
       count(*) filter (where s.searched)                           as search_started,
       count(*) filter (where s.got_results)                        as search_results_viewed,
       count(*) filter (where s.selected)                           as item_selected,
       count(*) filter (where s.first_item)                         as first_item_added,
       count(*) filter (where u.signup_day <= current_date - 1)     as old_enough_d1,
       count(*) filter (where exists (select 1 from public.app_opens o
                         where o.user_id = u.id and o.day = u.signup_day + 1))  as back_d1,
       count(*) filter (where u.signup_day <= current_date - 7)     as old_enough_d7,
       count(*) filter (where exists (select 1 from public.app_opens o
                         where o.user_id = u.id and o.day = u.signup_day + 7))  as back_d7,
       count(*) filter (where u.signup_day <= current_date - 30)    as old_enough_d30,
       count(*) filter (where exists (select 1 from public.app_opens o
                         where o.user_id = u.id and o.day = u.signup_day + 30)) as back_d30
  from users u
  left join steps s on s.user_id = u.id;


-- ── 10. Pesquisas sem resultado, por categoria e semana ──────────────────────
-- Contas/dias afetados (não o número de pesquisas). empty = respondeu sem
-- nada (falta de títulos na base); error = falhou (rede, servidor, serviço).
select date_trunc('week', day)::date as week,
       category,
       count(*) filter (where outcome = 'empty') as empty,
       count(*) filter (where outcome = 'error') as error,
       count(distinct user_id)                   as accounts
  from public.search_misses m
 where not exists (select 1 from public.analytics_excluded_users x where x.user_id = m.user_id)
 group by 1, 2
 order by 1 desc, empty desc;
