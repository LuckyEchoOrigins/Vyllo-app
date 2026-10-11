-- Vyllo Playtime, Fase 2: as escolhas do utilizador ("é este jogo").
--
-- Quando o servidor não tem a certeza (ex.: um jogo da Epic identificado só pelo
-- título), o PC pergunta. A resposta fica aqui, por utilizador: vale para esse
-- utilizador (num PC novo ou depois de reinstalar) e nunca para os outros, por
-- isso ninguém consegue estragar a identificação de um jogo para toda a gente.
--
-- ADITIVO: uma tabela nova. Desenho: repositório "Vyllo Playtime", DESIGN.md
-- (secções 5, 11 e 12).

create table if not exists public.playtime_user_mappings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  source     text not null,                 -- steam | epic | battlenet | manual
  match_key  text not null,                 -- o id do launcher, ex.: '<namespace>:<catalogItemId>'
  game_id    uuid not null references public.games(id),
  created_at timestamptz not null default now(),
  primary key (user_id, source, match_key)
);

alter table public.playtime_user_mappings enable row level security;

create policy "playtime_user_mappings read own"
  on public.playtime_user_mappings for select
  to authenticated
  using (user_id = auth.uid());
