-- Gravar uma alteração a um item e o registo de atividade numa só transação.
--
-- A app gravava o item e depois, noutro pedido, o registo (páginas, episódios,
-- horas, estado). Se a ligação falhasse entre os dois, a app guardava a
-- alteração para reenviar, mas no reenvio o item já estava atualizado: não
-- havia diferença e o registo perdia-se (ex.: um episódio que não contava
-- para a sequência). Aqui as duas coisas acontecem juntas; um reenvio não
-- muda nada e não regista outra vez.
--
-- p_fields: só as colunas que mudaram (as de MediaItem.updateColumns).
-- Horas: p_hours_set substitui (Steam), senão p_hours_delta soma às do
-- servidor. As horas da Steam passam por steam_log_hours, que desconta as que
-- o Vyllo Playtime (PC) já registou. p_at: hora das alterações feitas sem
-- internet. Devolve {item, logged}: a linha nova e quantas entradas registou.

-- Episódio absoluto (temporadas anteriores + episódio), como na app.
create or replace function public.item_absolute_episode(
  p_per_season text, p_season int, p_episode int)
returns int
language plpgsql
immutable
as $$
declare
  v_before int := 0;
begin
  begin
    select coalesce(sum(value::int), 0) into v_before
      from jsonb_array_elements_text(nullif(p_per_season, '')::jsonb)
           with ordinality as t(value, n)
     where n < p_season;
  exception when others then
    v_before := 0;
  end;
  return v_before + coalesce(p_episode, 0);
end $$;

create or replace function public.item_update(
  p_item_id     bigint,
  p_fields      jsonb default '{}',
  p_hours_delta numeric default 0,
  p_hours_set   numeric default null,
  p_hours_note  text default null,
  p_at          timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_prev    public.items;
  v_new     public.items;
  v_allowed text[] := array[
    'status', 'current_page', 'current_season', 'current_episode', 'rating',
    'notes', 'synopsis', 'cover', 'is_series', 'total_episodes',
    'total_seasons', 'episodes_per_season', 'start_date', 'end_date',
    'steam_app_id', 'total_pages', 'ach_unlocked', 'ach_total',
    'manual_achievements', 'hidden_from_home'];
  v_key     text;
  v_cols    text;
  v_hours   numeric;
  v_at      timestamptz := coalesce(p_at, now());
  v_delta   numeric;
  v_logged  int := 0;
  v_left    numeric;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_prev from public.items
   where id = p_item_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  p_fields := coalesce(p_fields, '{}');
  for v_key in select jsonb_object_keys(p_fields) loop
    if not v_key = any(v_allowed) then
      raise exception 'column_not_allowed: %', v_key;
    end if;
  end loop;

  select string_agg(format('%I', k), ', ') into v_cols
    from jsonb_object_keys(p_fields) as k;
  if v_cols is not null then
    -- As colunas dadas, com os tipos da tabela; as outras ficam.
    execute format(
      'update public.items set (%1$s) = (select %1$s from jsonb_populate_record($1, $2)) where id = $3',
      v_cols)
      using v_prev, p_fields, p_item_id;
  end if;

  v_hours := coalesce(
    p_hours_set,
    case when coalesce(p_hours_delta, 0) <> 0
         then v_prev.hours_played + p_hours_delta end);
  update public.items
     set updated_at = now(),
         hours_played = case when v_hours is null then hours_played
                             else round(greatest(v_hours, 0), 2) end
   where id = p_item_id
  returning * into v_new;

  -- Registo de atividade (o mesmo que a app fazia em _activityLogs).
  if v_new.current_page > v_prev.current_page then
    insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
    values (v_uid, v_new.id, v_new.category, v_new.title,
            case when v_new.book_type = 'audiobook' then 'minutes' else 'pages' end,
            v_new.current_page - v_prev.current_page, null, v_at);
    v_logged := v_logged + 1;
  end if;

  v_delta := round((v_new.hours_played - v_prev.hours_played)::numeric, 2);
  if v_delta > 0 then
    if p_hours_note = 'steam' then
      v_left := public.steam_log_hours(v_new.id, v_delta, 'steam', v_at);
      if v_left > 0 then v_logged := v_logged + 1; end if;
    else
      insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
      values (v_uid, v_new.id, v_new.category, v_new.title, 'hours', v_delta, p_hours_note, v_at);
      v_logged := v_logged + 1;
    end if;
  end if;

  if v_new.current_season is distinct from v_prev.current_season
     or v_new.current_episode is distinct from v_prev.current_episode then
    v_delta := public.item_absolute_episode(v_new.episodes_per_season, v_new.current_season, v_new.current_episode)
             - public.item_absolute_episode(v_prev.episodes_per_season, v_prev.current_season, v_prev.current_episode);
    if v_delta > 0 then
      insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
      values (v_uid, v_new.id, v_new.category, v_new.title, 'episodes', v_delta,
              format('T%s E%s', v_new.current_season, v_new.current_episode), v_at);
      v_logged := v_logged + 1;
    end if;
  end if;

  if v_new.status is distinct from v_prev.status then
    if v_new.status = 'in_progress' and v_prev.status = 'wishlist' then
      insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
      values (v_uid, v_new.id, v_new.category, v_new.title, 'status', null, 'started', v_at);
      v_logged := v_logged + 1;
    elsif v_new.status in ('completed', 'abandoned') then
      insert into public.activity_log (user_id, item_id, category, title, field, delta, note, created_at)
      values (v_uid, v_new.id, v_new.category, v_new.title, 'status', null, v_new.status, v_at);
      v_logged := v_logged + 1;
    end if;
  end if;

  return jsonb_build_object('item', to_jsonb(v_new), 'logged', v_logged);
end $$;

revoke all on function public.item_absolute_episode(text, int, int) from public, anon;
revoke all on function public.item_update(bigint, jsonb, numeric, numeric, text, timestamptz) from public, anon;
grant execute on function public.item_update(bigint, jsonb, numeric, numeric, text, timestamptz) to authenticated;
