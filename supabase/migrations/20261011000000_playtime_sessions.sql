-- Vyllo Playtime, Fase 1: identificar jogos e receber as sessões de jogo do PC.
--
-- ADITIVO. A única mudança numa tabela existente é items.game_id (coluna nova,
-- nula por omissão), que liga um item da biblioteca a um jogo do catálogo.
-- Desenho: repositório "Vyllo Playtime", DESIGN.md (secções 5, 11 e 13).

-- ── Catálogo de jogos (vyllo_game_id) ───────────────────────────────────────
-- A identidade do jogo na Vyllo; o IGDB é um atributo. Só o servidor escreve.
create table if not exists public.games (
  id           uuid primary key default gen_random_uuid(),
  igdb_id      bigint unique,
  title        text not null,
  cover_url    text,
  release_year int,
  kind         text not null default 'official' check (kind in ('official', 'user_created')),
  created_by   uuid references auth.users(id) on delete cascade,
  client_ref   uuid,
  merged_into  uuid references public.games(id),
  created_at   timestamptz not null default now(),
  check ((kind = 'user_created') = (created_by is not null)),
  unique (created_by, client_ref)
);

alter table public.games enable row level security;

create policy "games visible"
  on public.games for select
  to authenticated
  using (kind = 'official' or created_by = auth.uid());

-- Cache de resolução partilhada: só identificadores públicos (AppID da Steam,
-- …) e só escrita pelo servidor, para ninguém poder envenenar o mapeamento.
create table if not exists public.game_external_ids (
  source      text not null,
  external_id text not null,
  game_id     uuid not null references public.games(id),
  method      text not null,
  confidence  int  not null,
  created_at  timestamptz not null default now(),
  primary key (source, external_id)
);

alter table public.game_external_ids enable row level security;

-- Pedidos ao IGDB que não deram nada (ex.: o Wallpaper Engine): não repetir
-- durante um dia.
create table if not exists public.game_resolve_misses (
  source      text not null,
  external_id text not null,
  checked_at  timestamptz not null default now(),
  primary key (source, external_id)
);

alter table public.game_resolve_misses enable row level security;

-- ── Biblioteca ──────────────────────────────────────────────────────────────
alter table public.items add column if not exists game_id uuid references public.games(id);

create unique index if not exists items_user_game_uidx
  on public.items (user_id, game_id) where game_id is not null;

-- ── Sessões de jogo (a fonte de verdade do tempo medido pelo Playtime) ──────
create table if not exists public.playtime_sessions (
  id                   uuid primary key,                 -- gerado no PC (UUIDv7): idempotência
  user_id              uuid not null references auth.users(id) on delete cascade,
  device_id            uuid not null references public.playtime_devices(id),
  game_id              uuid not null references public.games(id),
  source               text not null,                    -- steam | epic | battlenet | manual
  started_at           timestamptz not null,
  ended_at             timestamptz not null,
  duration_seconds     int generated always as (extract(epoch from (ended_at - started_at))::int) stored,
  end_reason           text not null,
  client_version       text,
  -- Horas desta sessão que a próxima sincronização da Steam ainda não pode voltar
  -- a contar no registo de atividade (ver steam_log_hours).
  steam_credit_seconds int not null default 0,
  received_at          timestamptz not null default now(),
  check (ended_at > started_at),
  check (ended_at - started_at <= interval '7 days')
);

-- item_id com o mesmo tipo que items.id (a tabela items foi criada fora das
-- migrações).
do $$
declare
  v_type text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'playtime_sessions' and column_name = 'item_id'
  ) then
    select format_type(a.atttypid, a.atttypmod) into v_type
      from pg_attribute a
     where a.attrelid = 'public.items'::regclass and a.attname = 'id';
    execute format(
      'alter table public.playtime_sessions add column item_id %s references public.items(id) on delete set null',
      v_type);
  end if;
end $$;

create index if not exists playtime_sessions_user_game_idx
  on public.playtime_sessions (user_id, game_id, started_at desc);
create index if not exists playtime_sessions_device_idx
  on public.playtime_sessions (device_id, started_at desc);
create index if not exists playtime_sessions_item_idx
  on public.playtime_sessions (item_id, started_at desc);
create index if not exists playtime_sessions_steam_credit_idx
  on public.playtime_sessions (item_id) where steam_credit_seconds > 0;

alter table public.playtime_sessions enable row level security;

create policy "playtime_sessions read own"
  on public.playtime_sessions for select
  to authenticated
  using (user_id = auth.uid());

-- Totais por jogo e fonte, derivados das sessões (sem tabela agregada).
create or replace view public.playtime_totals with (security_invoker = true) as
  select user_id,
         game_id,
         source,
         count(*)              as sessions,
         sum(duration_seconds) as seconds,
         min(started_at)       as first_played_at,
         max(ended_at)         as last_played_at
    from public.playtime_sessions
   group by user_id, game_id, source;

-- ── Funções ─────────────────────────────────────────────────────────────────

-- Segue merged_into (um jogo criado pelo utilizador que passou a ter ficha oficial).
create or replace function public.game_canonical(p_game uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_game uuid := p_game;
  v_next uuid;
begin
  for i in 1..5 loop
    select merged_into into v_next from public.games where id = v_game;
    exit when v_next is null;
    v_game := v_next;
  end loop;
  return v_game;
end $$;

-- Horas da Steam no registo de atividade, sem contar duas vezes o que o
-- Playtime já registou: as sessões guardam um "crédito" que é gasto aqui, da
-- mais antiga para a mais recente, e expira em 48 h. Usada pela sincronização
-- da Steam do servidor (steam-cron) e da app. Devolve as horas registadas.
create or replace function public.steam_log_hours(
  p_item_id bigint,
  p_delta   numeric,
  p_note    text,
  p_at      timestamptz default now())
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   record;
  v_left   numeric := coalesce(p_delta, 0);
  v_credit record;
  v_take   int;
begin
  select id, user_id, title, category into v_item from public.items where id = p_item_id;
  if not found then
    return 0;
  end if;
  -- A app só pode registar nos seus itens; o steam-cron corre com a service role.
  if auth.uid() is not null and auth.uid() <> v_item.user_id then
    raise exception 'not_owner';
  end if;

  if p_note = 'steam' then
    for v_credit in
      select id, steam_credit_seconds
        from public.playtime_sessions
       where item_id = p_item_id
         and steam_credit_seconds > 0
         and ended_at > now() - interval '48 hours'
       order by ended_at
         for update
    loop
      exit when v_left <= 0;
      v_take := least(v_credit.steam_credit_seconds, ceil(v_left * 3600)::int);
      update public.playtime_sessions
         set steam_credit_seconds = steam_credit_seconds - v_take
       where id = v_credit.id;
      v_left := v_left - v_take / 3600.0;
    end loop;
  end if;

  v_left := round(greatest(v_left, 0), 2);
  if v_left >= 0.01 then
    insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
    values (v_item.user_id, v_item.id, v_item.category, v_item.title, 'hours', v_left, p_note, p_at);
  end if;
  return v_left;
end $$;

-- Os efeitos de uma sessão acabada de receber: item da biblioteca (encontrar,
-- ligar ou criar), horas, estado e registo de atividade. Só corre uma vez por
-- sessão (chamada apenas quando o insert inseriu de facto).
create or replace function public.playtime_apply_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   public.playtime_sessions;
  v_game      public.games;
  v_item      record;
  v_steam_app bigint;
  v_day       date;
  v_hours     numeric;
  v_already   numeric;
  v_log       numeric;
  v_managed   boolean;
begin
  select * into v_session from public.playtime_sessions where id = p_session_id;
  select * into v_game from public.games where id = v_session.game_id;
  v_day := (v_session.started_at at time zone 'UTC')::date;
  v_hours := round(v_session.duration_seconds / 3600.0, 2);

  select e.external_id::bigint into v_steam_app
    from public.game_external_ids e
   where e.game_id = v_game.id and e.source = 'steam'
   limit 1;

  -- 1. O item: já ligado ao jogo; senão um item de jogo ainda sem ligação com o
  --    mesmo AppID ou o mesmo título (passa a ficar ligado); senão um novo.
  select id, title, category, status, start_date, steam_app_id, game_platform into v_item
    from public.items
   where user_id = v_session.user_id and game_id = v_game.id
   limit 1;
  if v_item.id is null and v_steam_app is not null then
    select id, title, category, status, start_date, steam_app_id, game_platform into v_item
      from public.items
     where user_id = v_session.user_id and category = 'game' and game_id is null
       and steam_app_id = v_steam_app
     order by updated_at desc nulls last
     limit 1;
  end if;
  if v_item.id is null then
    select id, title, category, status, start_date, steam_app_id, game_platform into v_item
      from public.items
     where user_id = v_session.user_id and category = 'game' and game_id is null
       and lower(title) = lower(v_game.title)
     order by updated_at desc nulls last
     limit 1;
  end if;
  if v_item.id is not null then
    update public.items set game_id = v_game.id where id = v_item.id and game_id is null;
  else
    insert into public.items (
      user_id, title, category, cover, year, game_platform, steam_app_id,
      status, start_date, hours_played, game_id, created_at, updated_at)
    values (
      v_session.user_id, v_game.title, 'game', v_game.cover_url, v_game.release_year,
      case when v_session.source = 'steam' then 'steam' else 'pc' end,
      case when v_session.source = 'steam' then v_steam_app end,
      'in_progress', v_day, 0, v_game.id, now(), now())
    returning id, title, category, status, start_date, steam_app_id, game_platform into v_item;
  end if;

  update public.playtime_sessions set item_id = v_item.id where id = p_session_id;

  -- 2. Horas. Um jogo Steam com a conta Steam ligada (Premium) tem o total
  --    escrito pela sincronização da Steam, que já inclui esta sessão.
  v_managed := v_session.source = 'steam'
    and v_steam_app is not null
    and v_item.steam_app_id = v_steam_app
    and coalesce(v_item.game_platform, 'steam') = 'steam'
    and exists (select 1 from public.profiles p where p.id = v_session.user_id and p.steam_id is not null)
    and public.is_premium(v_session.user_id);

  if not v_managed then
    update public.items
       set hours_played = round((coalesce(hours_played, 0) + v_hours)::numeric, 2),
           updated_at = now()
     where id = v_item.id;
  end if;

  -- 3. Estado: um jogo jogado deixa de estar na lista de desejos.
  if v_item.status = 'wishlist' then
    update public.items set status = 'in_progress', updated_at = now() where id = v_item.id;
    insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
    values (v_session.user_id, v_item.id, 'game', v_item.title, 'status', null, 'started', v_session.started_at);
  end if;
  if v_item.start_date is null and coalesce(v_item.status, '') <> 'completed' then
    update public.items set start_date = v_day where id = v_item.id;
  end if;

  -- 4. Registo de atividade com a hora da sessão (não a da sincronização). Num
  --    jogo gerido pela Steam, desconta o que a sincronização da Steam já
  --    registou deste período, e o resto fica como crédito para a próxima.
  v_log := v_hours;
  if v_managed then
    select coalesce(sum(delta), 0) into v_already
      from public.activity_log
     where item_id = v_item.id and field = 'hours' and note = 'steam'
       and created_at between v_session.started_at and v_session.ended_at + interval '70 minutes';
    v_log := round(greatest(v_hours - v_already, 0), 2);
    update public.playtime_sessions
       set steam_credit_seconds = round(v_log * 3600)::int
     where id = p_session_id;
  end if;
  if v_log >= 0.01 then
    insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
    values (v_session.user_id, v_item.id, 'game', v_item.title, 'hours', v_log, 'playtime', v_session.started_at);
  end if;
end $$;

-- Recebe um lote de sessões de um PC. Idempotente: uma sessão já recebida volta
-- como 'duplicate' e não tem efeito. Devolve [{id, status, reason}].
create or replace function public.playtime_ingest_sessions(
  p_device_id    uuid,
  p_sessions     jsonb,
  p_skew_seconds int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device  public.playtime_devices;
  v_s       jsonb;
  v_id      uuid;
  v_game    uuid;
  v_start   timestamptz;
  v_end     timestamptz;
  v_reason  text;
  v_results jsonb := '[]'::jsonb;
  v_skew    interval := make_interval(secs => coalesce(p_skew_seconds, 0));
begin
  select * into v_device from public.playtime_devices where id = p_device_id and revoked_at is null;
  if not found then
    raise exception 'device_revoked';
  end if;
  if not public.is_premium(v_device.user_id) then
    raise exception 'premium_required';
  end if;

  for v_s in select value from jsonb_array_elements(p_sessions) loop
    v_reason := null;
    begin
      v_id    := (v_s ->> 'id')::uuid;
      v_start := (v_s ->> 'started_at')::timestamptz + v_skew;
      v_end   := (v_s ->> 'ended_at')::timestamptz + v_skew;
      v_game  := public.game_canonical((v_s ->> 'game_id')::uuid);
    exception when others then
      v_results := v_results || jsonb_build_object('id', v_s ->> 'id', 'status', 'rejected', 'reason', 'bad_request');
      continue;
    end;

    if exists (select 1 from public.playtime_sessions where id = v_id) then
      v_results := v_results || jsonb_build_object('id', v_id, 'status', 'duplicate');
      continue;
    end if;

    v_reason := case
      when v_end <= v_start or v_end > now() + interval '5 minutes' then 'invalid_time'
      when v_end - v_start > interval '7 days' then 'too_long'
      when v_game is null or not exists (
        select 1 from public.games g
         where g.id = v_game and (g.kind = 'official' or g.created_by = v_device.user_id)) then 'unknown_game'
      when not v_device.tracking_enabled and v_start >= v_device.tracking_changed_at then 'tracking_paused'
      when exists (
        select 1 from public.playtime_sessions x
         where x.device_id = v_device.id and x.game_id = v_game
           and least(x.ended_at, v_end) - greatest(x.started_at, v_start) > interval '1 minute') then 'overlap'
    end;
    if v_reason is not null then
      v_results := v_results || jsonb_build_object('id', v_id, 'status', 'rejected', 'reason', v_reason);
      continue;
    end if;

    insert into public.playtime_sessions (
      id, user_id, device_id, game_id, source, started_at, ended_at, end_reason, client_version)
    values (
      v_id, v_device.user_id, v_device.id, v_game, coalesce(v_s ->> 'source', 'manual'),
      v_start, v_end, coalesce(v_s ->> 'end_reason', 'process_exit'), v_s ->> 'client_version')
    on conflict (id) do nothing;

    if found then
      perform public.playtime_apply_session(v_id);
      v_results := v_results || jsonb_build_object('id', v_id, 'status', 'accepted');
    else
      v_results := v_results || jsonb_build_object('id', v_id, 'status', 'duplicate');
    end if;
  end loop;

  return v_results;
end $$;

-- As sessões do PC de um jogo, para a página do jogo na app.
create or replace function public.playtime_item_sessions(p_item_id bigint, p_limit int default 20)
returns table (
  id uuid,
  device_name text,
  source text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, d.name, s.source, s.started_at, s.ended_at, s.duration_seconds
    from public.playtime_sessions s
    join public.playtime_devices d on d.id = s.device_id
   where s.item_id = p_item_id and s.user_id = auth.uid()
   order by s.started_at desc
   limit least(coalesce(p_limit, 20), 100);
$$;

-- ── Permissões ──────────────────────────────────────────────────────────────
revoke all on function public.game_canonical(uuid) from public, anon, authenticated;
revoke all on function public.playtime_apply_session(uuid) from public, anon, authenticated;
revoke all on function public.playtime_ingest_sessions(uuid, jsonb, int) from public, anon, authenticated;

revoke all on function public.steam_log_hours(bigint, numeric, text, timestamptz) from public, anon;
revoke all on function public.playtime_item_sessions(bigint, int) from public, anon;
grant execute on function public.steam_log_hours(bigint, numeric, text, timestamptz) to authenticated;
grant execute on function public.playtime_item_sessions(bigint, int) to authenticated;
