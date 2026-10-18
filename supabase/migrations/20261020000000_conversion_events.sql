-- Conversão: o que antecede uma compra real. Completa o funil de
-- 20261019000000_funnel_events.sql. ADITIVO: uma coluna nova em
-- activation_events, duas tabelas novas, triggers que nunca falham a escrita
-- que os dispara, e o preenchimento do que já existia.
--
-- Sem dados pessoais: ids de conta, nomes de eventos, categorias, plataforma e
-- referências de transação das lojas (que já estão em profiles). Tudo sai com a
-- conta (on delete cascade a partir de auth.users).

-- ── activation_events.detail ─────────────────────────────────────────────────
-- Um pormenor do marco, de uma lista fechada:
--   item_1           categoria do primeiro item ('book', 'game', 'film')
--   second_category  as duas primeiras categorias, por ordem ('book+game')
--   premium_activated  como ficou Premium ('apple', 'google', 'stripe',
--                      'manual', ou 'before_tracking' no preenchimento)
--   free_limit_*     (sem detalhe: o tipo vai no nome do evento)
alter table public.activation_events add column if not exists detail text;

-- ── item_1 com categoria, e second_category ──────────────────────────────────
-- second_category: a primeira vez que a conta passa a ter itens em duas
-- categorias. Uma vez por conta (unique em activation_events): apagar e voltar a
-- adicionar não repete.
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
           select i.category from public.items i
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
         string_agg(firsts.category, '+' order by firsts.first_at)
    from (
      select i.user_id, i.category, min(i.created_at) as first_at,
             row_number() over (partition by i.user_id order by min(i.created_at)) as n
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

-- Preenchimento: a categoria dos item_1 que já existem, e second_category das
-- contas que já têm duas categorias (com a data do primeiro item da segunda).
update public.activation_events e
   set detail = (
     select i.category from public.items i
      where i.user_id = e.user_id
      order by i.created_at, i.id
      limit 1)
 where e.event = 'item_1' and e.detail is null;

insert into public.activation_events (user_id, event, detail, created_at)
select firsts.user_id, 'second_category',
       string_agg(firsts.category, '+' order by firsts.first_at),
       max(firsts.first_at)
  from (
    select i.user_id, i.category, min(i.created_at) as first_at,
           row_number() over (partition by i.user_id order by min(i.created_at)) as n
      from public.items i
     where i.user_id is not null
     group by i.user_id, i.category
  ) firsts
 where firsts.n <= 2
 group by firsts.user_id
having count(*) = 2
on conflict (user_id, event) do nothing;

-- ── premium_activated ────────────────────────────────────────────────────────
-- A primeira vez que a conta fica Premium, seja como for (compra, 7 dias
-- grátis, restauro, acesso dado à mão). NÃO é uma venda: as vendas estão em
-- purchase_events. Uma vez por conta.
create or replace function public.log_premium_activated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_premium, false)
     and (tg_op = 'INSERT' or not coalesce(old.is_premium, false)) then
    insert into public.activation_events (user_id, event, detail)
    values (new.id, 'premium_activated',
            case
              when new.apple_original_transaction_id is not null then 'apple'
              when new.google_purchase_token is not null then 'google'
              when new.stripe_subscription_id is not null or new.stripe_plan is not null then 'stripe'
              else 'manual'
            end)
    on conflict (user_id, event) do nothing;
  end if;
  return null;
exception when others then
  -- As métricas nunca podem impedir que o Premium seja ativado.
  return null;
end;
$$;

drop trigger if exists profiles_log_premium_activated on public.profiles;
create trigger profiles_log_premium_activated
  after insert or update of is_premium on public.profiles
  for each row
  execute function public.log_premium_activated();

-- Contas que já eram Premium: ficam marcadas, sem data real de ativação.
insert into public.activation_events (user_id, event, detail)
select p.id, 'premium_activated', 'before_tracking'
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.is_premium
on conflict (user_id, event) do nothing;

-- ── purchase_events ──────────────────────────────────────────────────────────
-- As vendas, confirmadas pela loja (escritas pelas edge functions de
-- verificação e de notificações, com a service role). Uma linha por transação:
-- a unique (store, transaction_ref) faz com que uma verificação repetida, um
-- restauro ou uma notificação repetida da loja não contem duas vezes.
--   purchase         compra paga (subscrição ou vitalício)
--   trial            início dos dias grátis: ainda NÃO é uma venda
--   trial_converted  os dias grátis passaram a pagamento (ref = '<ref>:paid')
--   existing         compra de antes desta tabela (preenchimento): não conta
--                    como venda nova quando a conta a restaura
create table if not exists public.purchase_events (
  id               bigint      generated always as identity primary key,
  created_at       timestamptz not null default now(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  store            text        not null check (store in ('apple', 'google', 'stripe')),
  kind             text        not null check (kind in ('purchase', 'trial', 'trial_converted', 'existing')),
  plan             text,
  product_id       text,
  transaction_ref  text        not null,
  unique (store, transaction_ref)
);

create index if not exists purchase_events_user_idx on public.purchase_events (user_id);
create index if not exists purchase_events_created_idx on public.purchase_events (created_at);

-- Sem políticas: só a service role (edge functions e análise) lê e escreve.
alter table public.purchase_events enable row level security;

insert into public.purchase_events (user_id, store, kind, product_id, transaction_ref)
select p.id, 'apple', 'existing', p.apple_product_id, p.apple_original_transaction_id
  from public.profiles p join auth.users u on u.id = p.id
 where p.apple_original_transaction_id is not null
on conflict (store, transaction_ref) do nothing;

insert into public.purchase_events (user_id, store, kind, product_id, transaction_ref)
select p.id, 'google', 'existing', p.google_product_id, p.google_purchase_token
  from public.profiles p join auth.users u on u.id = p.id
 where p.google_purchase_token is not null
on conflict (store, transaction_ref) do nothing;

insert into public.purchase_events (user_id, store, kind, plan, transaction_ref)
select p.id, 'stripe', 'existing', p.stripe_plan, p.stripe_subscription_id
  from public.profiles p join auth.users u on u.id = p.id
 where p.stripe_subscription_id is not null
on conflict (store, transaction_ref) do nothing;

-- ── account_attributes ───────────────────────────────────────────────────────
-- Atributos de aquisição de cada conta, a juntar a acquisition_sources: a
-- plataforma onde a conta foi usada pela primeira vez. Uma linha por conta
-- (fica a primeira). Escrita pelo cliente; sem SELECT para o cliente.
create table if not exists public.account_attributes (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  platform    text        not null check (platform in ('ios', 'android', 'web', 'other')),
  created_at  timestamptz not null default now()
);

alter table public.account_attributes enable row level security;

create policy "account_attributes insert own"
  on public.account_attributes for insert
  to authenticated
  with check (auth.uid() = user_id);
