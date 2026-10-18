-- Jogos que faltam no catálogo do Vyllo Playtime. SÓ LEITURA.
--
-- Um jogo criado à mão no PC ("Criar «X»" em "Que jogo é este?") quer dizer que
-- a pesquisa no catálogo (IGDB) não o encontrou. Estão aqui os que ainda não
-- foram juntados a um jogo oficial (merged_into vazio), com quanto foram
-- jogados, para decidir o que acrescentar primeiro. Os emails "Não encontras o
-- jogo? Avisa-nos" chegam a support@vyllo-app.com com o mesmo nome.
--
-- Correr no SQL editor do Supabase (como postgres). Tira as contas de
-- public.analytics_excluded_users; para ver também essas (ex.: os jogos que o
-- dono criou a testar), apagar a linha marcada com "excluídas".

select g.title,
       g.created_at::date                                     as created,
       coalesce(string_agg(distinct s.source, ', '), '-')      as launcher,
       count(s.id)                                            as sessions,
       round(coalesce(sum(s.duration_seconds), 0) / 3600.0, 1) as hours,
       max(s.ended_at)::date                                  as last_played,
       coalesce(string_agg(distinct e.source || ':' || e.external_id, ', '), '-') as store_ids
  from public.games g
  left join public.playtime_sessions s on s.game_id = g.id
  left join public.game_external_ids e on e.game_id = g.id
 where g.created_by is not null
   and g.merged_into is null
   and not exists (select 1 from public.analytics_excluded_users x where x.user_id = g.created_by)  -- excluídas
 group by g.id, g.title, g.created_at
 order by hours desc, sessions desc, g.created_at desc;
