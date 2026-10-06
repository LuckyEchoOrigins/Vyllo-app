-- Sincronizacao da Steam em segundo plano (sem abrir a app).
--
-- A app guarda aqui o SteamID quando o utilizador liga a conta (pela funcao
-- steam, com a chave de servico: os utilizadores so leem o seu perfil). A
-- funcao steam-cron corre de hora a hora, le a biblioteca de cada
-- utilizador Premium com Steam ligada e grava as horas novas.

alter table public.profiles add column if not exists steam_id text;
alter table public.profiles add column if not exists steam_synced_at timestamptz;

create index if not exists profiles_steam_id_idx
  on public.profiles (steam_synced_at nulls first)
  where steam_id is not null;

create extension if not exists pg_cron;
create extension if not exists pg_net;
