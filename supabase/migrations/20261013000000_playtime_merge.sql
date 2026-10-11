-- Vyllo Playtime, Fase 4: um jogo criado pelo utilizador ("Criar «Project Zeta»")
-- que mais tarde aparece no catálogo oficial.
--
-- Um job (função playtime, /jobs/merge-suggestions) volta a procurar esses jogos
-- pelo título e, quando tem a certeza (≥ 85), deixa uma sugestão. A app Vyllo
-- mostra "Encontrámos a ficha oficial de Project Zeta" [Juntar] [Não é este], e
-- juntar passa as sessões, as escolhas do PC e o item da biblioteca para o jogo
-- oficial. Os PCs recebem a troca em GET /config (game_remaps).
--
-- ADITIVO: uma coluna nova em games, uma tabela nova e duas funções.
-- Desenho: repositório "Vyllo Playtime", DESIGN.md (secção 12.3).

alter table public.games add column if not exists merge_checked_at timestamptz;

create table if not exists public.game_merge_suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  from_game   uuid not null references public.games(id) on delete cascade,
  to_game     uuid not null references public.games(id),
  confidence  int not null,
  status      text not null default 'pending' check (status in ('pending', 'merged', 'dismissed')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  unique (from_game, to_game)
);

create index if not exists game_merge_suggestions_pending
  on public.game_merge_suggestions (user_id) where status = 'pending';

alter table public.game_merge_suggestions enable row level security;

create policy "game_merge_suggestions read own"
  on public.game_merge_suggestions for select
  to authenticated
  using (user_id = auth.uid());

-- Juntar o jogo do utilizador [p_from] ao jogo oficial [p_to], numa só transação.
-- Devolve o id do item da biblioteca que fica (null se não havia nenhum).
create or replace function public.playtime_merge_game(p_from uuid, p_to uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_from  public.games;
  v_to    public.games;
  v_a     public.items;  -- o item do jogo do utilizador
  v_b     public.items;  -- o item do jogo oficial
  v_keep  public.items;
  v_other public.items;
  v_rank  constant jsonb := '{"wishlist": 0, "abandoned": 1, "in_progress": 2, "completed": 3}';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_from from public.games where id = p_from for update;
  select * into v_to from public.games where id = p_to;
  if v_from.id is null or v_to.id is null then
    raise exception 'unknown_game';
  end if;
  if v_from.kind <> 'user_created' or v_from.created_by <> v_uid then
    raise exception 'not_owner';
  end if;
  if v_to.kind <> 'official' then
    raise exception 'not_official';
  end if;
  if v_from.merged_into is not null then
    raise exception 'already_merged';
  end if;

  update public.playtime_sessions set game_id = p_to where game_id = p_from and user_id = v_uid;
  update public.playtime_user_mappings set game_id = p_to where game_id = p_from and user_id = v_uid;

  select * into v_a from public.items where user_id = v_uid and game_id = p_from order by created_at limit 1;
  select * into v_b from public.items where user_id = v_uid and game_id = p_to order by created_at limit 1;

  if v_a.id is not null and v_b.id is null then
    -- Só o item do jogo do utilizador: passa a ser o oficial, com tudo o que tinha.
    update public.items
       set game_id = p_to,
           title = v_to.title,
           cover = coalesce(v_to.cover_url, cover),
           year = coalesce(v_to.release_year, year),
           updated_at = now()
     where id = v_a.id;
    v_keep := v_a;
  elsif v_a.id is not null and v_b.id is not null then
    -- Os dois: fica o mais antigo, com o estado mais avançado, as horas somadas,
    -- o rating e as notas que houver, e as datas que abrangem os dois.
    if v_a.created_at <= v_b.created_at then
      v_keep := v_a; v_other := v_b;
    else
      v_keep := v_b; v_other := v_a;
    end if;
    update public.items
       set game_id = p_to,
           title = v_to.title,
           cover = coalesce(v_to.cover_url, v_keep.cover, v_other.cover),
           year = coalesce(v_to.release_year, v_keep.year, v_other.year),
           status = case
             when coalesce((v_rank ->> v_other.status)::int, 0) > coalesce((v_rank ->> v_keep.status)::int, 0)
               then v_other.status else v_keep.status end,
           rating = coalesce(v_keep.rating, v_other.rating),
           notes = case
             when v_keep.notes is not null and v_other.notes is not null and v_keep.notes <> v_other.notes
               then v_keep.notes || E'\n\n' || v_other.notes
             else coalesce(v_keep.notes, v_other.notes) end,
           start_date = case
             when v_keep.start_date is null then v_other.start_date
             when v_other.start_date is null then v_keep.start_date
             else least(v_keep.start_date, v_other.start_date) end,
           end_date = case
             when v_keep.end_date is null then v_other.end_date
             when v_other.end_date is null then v_keep.end_date
             else greatest(v_keep.end_date, v_other.end_date) end,
           hours_played = round((coalesce(v_keep.hours_played, 0) + coalesce(v_other.hours_played, 0))::numeric, 2),
           updated_at = now()
     where id = v_keep.id;
    update public.activity_log set item_id = v_keep.id, title = v_to.title where item_id = v_other.id;
    update public.playtime_sessions set item_id = v_keep.id where item_id = v_other.id;
    delete from public.items where id = v_other.id;
  end if;

  update public.games set merged_into = p_to where id = p_from;
  update public.game_merge_suggestions
     set status = 'merged', decided_at = now()
   where user_id = v_uid and from_game = p_from and status = 'pending';
  return v_keep.id;
end $$;

-- "Não é este": a sugestão não volta a aparecer.
create or replace function public.playtime_dismiss_merge(p_suggestion uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.game_merge_suggestions
     set status = 'dismissed', decided_at = now()
   where id = p_suggestion and user_id = auth.uid() and status = 'pending';
$$;

revoke all on function public.playtime_merge_game(uuid, uuid) from public, anon;
revoke all on function public.playtime_dismiss_merge(uuid) from public, anon;
grant execute on function public.playtime_merge_game(uuid, uuid) to authenticated;
grant execute on function public.playtime_dismiss_merge(uuid) to authenticated;

-- O job das sugestões corre uma vez por dia. Cada chamada vê no máximo 50 jogos,
-- e cada jogo no máximo uma vez por semana, por isso a chave pública chega (como
-- no steam-cron).
select cron.unschedule('playtime-merge-suggestions')
where exists (select 1 from cron.job where jobname = 'playtime-merge-suggestions');

select cron.schedule(
  'playtime-merge-suggestions',
  '23 4 * * *',
  $$
  select net.http_post(
    url := 'https://awlluazqkdvfpqzbwyfe.supabase.co/functions/v1/playtime/jobs/merge-suggestions',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_8nyEN62rg2i_DVHB3KdwfQ_G-_Lp-ci", "Authorization": "Bearer sb_publishable_8nyEN62rg2i_DVHB3KdwfQ_G-_Lp-ci"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
