-- Reverter atividade (long press no histórico de um item ou no heatmap):
-- desfaz o que as linhas do registo fizeram ao item e apaga-as, numa só
-- transação. Ex.: páginas, episódios ou horas adicionados sem querer.
--
-- Por item, das linhas dadas (só do próprio utilizador):
--   páginas / minutos  -> a página volta atrás (nunca abaixo de 0)
--   episódios          -> volta atrás esse número de episódios, entre temporadas
--   horas manuais      -> as horas descem (as da Steam e do PC não: a próxima
--                         sincronização voltava a pô-las; essas linhas ficam)
--   concluído          -> volta a "em curso", sem data de fim
--   começado           -> volta a "quero", sem data de início
--   abandonado         -> volta a "em curso"
-- Um livro que fica na página 0 volta a "quero"; um livro concluído que fica
-- antes do fim volta a "em curso". Devolve os itens atualizados.

-- O inverso de item_absolute_episode: o episódio absoluto em temporada e
-- episódio. Sem episódios por temporada, fica na temporada atual.
create or replace function public.item_episode_at(
  p_per_season text, p_absolute int, p_season int)
returns table (season int, episode int)
language plpgsql
immutable
as $$
declare
  v_counts int[];
  v_left   int := greatest(p_absolute, 1);
  v_i      int;
begin
  begin
    select array_agg(value::int order by n) into v_counts
      from jsonb_array_elements_text(nullif(p_per_season, '')::jsonb)
           with ordinality as t(value, n);
  exception when others then
    v_counts := null;
  end;
  if v_counts is null or array_length(v_counts, 1) is null then
    season := greatest(coalesce(p_season, 1), 1);
    episode := v_left;
    return next;
    return;
  end if;
  for v_i in 1 .. array_length(v_counts, 1) loop
    if v_left <= v_counts[v_i] or v_i = array_length(v_counts, 1) then
      season := v_i;
      episode := least(v_left, greatest(v_counts[v_i], 1));
      return next;
      return;
    end if;
    v_left := v_left - v_counts[v_i];
  end loop;
end $$;

create or replace function public.activity_revert(p_log_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_item_id  bigint;
  v_item     public.items;
  v_pages    numeric;
  v_hours    numeric;
  v_episodes numeric;
  v_notes    text[];
  v_page     int;
  v_status   text;
  v_start    text;
  v_end      text;
  v_abs      int;
  v_season   int;
  v_episode  int;
  v_total    int;
  v_result   jsonb := '[]';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  for v_item_id in
    select distinct item_id from public.activity_log
     where id = any(coalesce(p_log_ids, '{}')) and user_id = v_uid and item_id is not null
  loop
    select * into v_item from public.items
     where id = v_item_id and user_id = v_uid
     for update;
    if not found then continue; end if;

    select coalesce(sum(delta) filter (where field in ('pages', 'minutes') and delta > 0), 0),
           coalesce(sum(delta) filter (where field = 'hours' and note is null and delta > 0), 0),
           coalesce(sum(delta) filter (where field = 'episodes' and delta > 0), 0),
           coalesce(array_agg(note) filter (where field = 'status'), '{}')
      into v_pages, v_hours, v_episodes, v_notes
      from public.activity_log
     where id = any(p_log_ids) and user_id = v_uid and item_id = v_item_id;

    v_page := greatest(v_item.current_page - round(v_pages)::int, 0);
    v_status := v_item.status;
    v_start := v_item.start_date;
    v_end := v_item.end_date;
    v_season := v_item.current_season;
    v_episode := v_item.current_episode;

    if v_episodes > 0 then
      v_abs := public.item_absolute_episode(v_item.episodes_per_season, v_item.current_season, v_item.current_episode)
             - round(v_episodes)::int;
      select e.season, e.episode into v_season, v_episode
        from public.item_episode_at(v_item.episodes_per_season, v_abs, v_item.current_season) as e;
    end if;

    if 'completed' = any(v_notes) and v_status = 'completed' then
      v_status := 'in_progress';
      v_end := null;
    end if;
    if 'abandoned' = any(v_notes) and v_status = 'abandoned' then
      v_status := 'in_progress';
    end if;
    if 'started' = any(v_notes) and v_status = 'in_progress' then
      v_status := 'wishlist';
      v_start := null;
    end if;

    if v_item.category = 'book' and v_pages > 0 then
      v_total := case when v_item.book_type = 'audiobook' then v_item.audio_duration_minutes else v_item.total_pages end;
      if v_page <= 0 then
        v_status := 'wishlist';
      elsif v_status = 'completed' and v_total is not null and v_page < v_total then
        v_status := 'in_progress';
        v_end := null;
      end if;
    end if;

    update public.items
       set current_page = v_page,
           hours_played = round(greatest(hours_played - v_hours, 0)::numeric, 2),
           current_season = v_season,
           current_episode = v_episode,
           status = v_status,
           start_date = v_start,
           end_date = v_end,
           updated_at = now()
     where id = v_item_id
    returning * into v_item;

    -- As linhas desfeitas saem do registo; as da Steam e do PC ficam.
    delete from public.activity_log
     where id = any(p_log_ids) and user_id = v_uid and item_id = v_item_id
       and not (field = 'hours' and coalesce(note, '') in ('steam', 'steam_import', 'playtime'));

    v_result := v_result || jsonb_build_array(to_jsonb(v_item));
  end loop;

  return v_result;
end $$;

revoke all on function public.item_episode_at(text, int, int) from public, anon;
revoke all on function public.activity_revert(bigint[]) from public, anon;
grant execute on function public.activity_revert(bigint[]) to authenticated;
