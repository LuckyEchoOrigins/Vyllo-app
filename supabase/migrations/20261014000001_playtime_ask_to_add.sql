-- Vyllo Playtime: um jogo jogado no PC que não está na coleção já não é criado
-- sozinho. As sessões ficam guardadas sem item, e a app Vyllo pergunta "Jogaste
-- no PC: For Honor (1 h 5 min). Adicionar à coleção?" [Add] [Not this]. Adicionar
-- cria o item com as horas e o registo de atividade nos dias em que se jogou.
--
-- Muda playtime_apply_session (só o ramo "não há item": antes criava-o). O resto
-- é ADITIVO: uma tabela e três funções.

-- "Not this": o jogo não volta a ser perguntado (as sessões ficam na mesma).
create table if not exists public.playtime_game_prompts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game_id    uuid not null references public.games(id) on delete cascade,
  status     text not null default 'dismissed' check (status in ('dismissed')),
  decided_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.playtime_game_prompts enable row level security;

create policy "playtime_game_prompts read own"
  on public.playtime_game_prompts for select
  to authenticated
  using (user_id = auth.uid());

-- Igual à da Fase 1, exceto o passo 1: sem item na coleção, a sessão fica sem
-- item (e sem horas nem registo) até o utilizador escolher adicionar o jogo.
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
  if v_session.item_id is not null then
    return; -- já aplicada
  end if;
  select * into v_game from public.games where id = v_session.game_id;
  v_day := (v_session.started_at at time zone 'UTC')::date;
  v_hours := round(v_session.duration_seconds / 3600.0, 2);

  select e.external_id::bigint into v_steam_app
    from public.game_external_ids e
   where e.game_id = v_game.id and e.source = 'steam'
   limit 1;

  -- 1. O item: já ligado ao jogo; senão um item de jogo ainda sem ligação com o
  --    mesmo AppID ou o mesmo título (passa a ficar ligado). Sem item, a sessão
  --    espera que o utilizador adicione o jogo (playtime_add_game).
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
  if v_item.id is null then
    return;
  end if;
  update public.items set game_id = v_game.id where id = v_item.id and game_id is null;
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
    v_item.status := 'in_progress';
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

-- Os jogos jogados no PC que não estão na coleção, para a app perguntar. Antes
-- liga as sessões de jogos que entretanto entraram na coleção (ex.: adicionados
-- à mão na app, ou pela folha da Steam).
create or replace function public.playtime_unlisted_games()
returns table (
  game_id      uuid,
  title        text,
  cover_url    text,
  release_year int,
  seconds      bigint,
  sessions     int,
  last_played  timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  for v_id in
    select s.id from public.playtime_sessions s
     where s.user_id = v_uid and s.item_id is null
     order by s.started_at
  loop
    perform public.playtime_apply_session(v_id);
  end loop;

  return query
    select g.id, g.title, g.cover_url, g.release_year,
           sum(s.duration_seconds)::bigint, count(*)::int, max(s.ended_at)
      from public.playtime_sessions s
      join public.games g on g.id = s.game_id
     where s.user_id = v_uid and s.item_id is null
       and not exists (
         select 1 from public.playtime_game_prompts p where p.user_id = v_uid and p.game_id = s.game_id)
     group by g.id, g.title, g.cover_url, g.release_year
     order by max(s.ended_at) desc;
end $$;

-- "Add": o jogo entra na coleção com as sessões que já tinha (horas, estado e
-- registo nos dias em que se jogou). Devolve o id do item.
create or replace function public.playtime_add_game(p_game uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_game   public.games;
  v_first  public.playtime_sessions;
  v_steam  bigint;
  v_item   bigint;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_game from public.games where id = p_game;
  select * into v_first from public.playtime_sessions
   where user_id = v_uid and game_id = p_game and item_id is null
   order by started_at limit 1;
  if v_game.id is null or v_first.id is null then
    raise exception 'nothing_to_add';
  end if;
  select e.external_id::bigint into v_steam
    from public.game_external_ids e where e.game_id = p_game and e.source = 'steam' limit 1;

  select id into v_item from public.items where user_id = v_uid and game_id = p_game limit 1;
  if v_item is null then
    insert into public.items (
      user_id, title, category, cover, year, game_platform, steam_app_id,
      status, start_date, hours_played, game_id, created_at, updated_at)
    values (
      v_uid, v_game.title, 'game', v_game.cover_url, v_game.release_year,
      case when v_first.source = 'steam' then 'steam' else 'pc' end,
      case when v_first.source = 'steam' then v_steam end,
      'in_progress', (v_first.started_at at time zone 'UTC')::date, 0, p_game, now(), now())
    returning id into v_item;
  end if;

  for v_id in
    select id from public.playtime_sessions
     where user_id = v_uid and game_id = p_game and item_id is null
     order by started_at
  loop
    perform public.playtime_apply_session(v_id);
  end loop;
  delete from public.playtime_game_prompts where user_id = v_uid and game_id = p_game;
  return v_item;
end $$;

-- "Not this": não volta a perguntar por este jogo.
create or replace function public.playtime_dismiss_game(p_game uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.playtime_game_prompts (user_id, game_id)
  values (auth.uid(), p_game)
  on conflict (user_id, game_id) do update set decided_at = now();
$$;

revoke all on function public.playtime_unlisted_games() from public, anon;
revoke all on function public.playtime_add_game(uuid) from public, anon;
revoke all on function public.playtime_dismiss_game(uuid) from public, anon;
grant execute on function public.playtime_unlisted_games() to authenticated;
grant execute on function public.playtime_add_game(uuid) to authenticated;
grant execute on function public.playtime_dismiss_game(uuid) to authenticated;
