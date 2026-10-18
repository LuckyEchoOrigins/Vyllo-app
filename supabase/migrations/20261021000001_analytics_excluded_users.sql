-- Contas que nunca entram nas análises (as do dono da app, testes, família e
-- amigos que testaram). Todas as queries de supabase/queries/funnel.sql as
-- tiram. Só ids, sem emails. Para acrescentar uma conta:
--   insert into public.analytics_excluded_users (user_id) values ('<id>');
-- Sem políticas: só a service role (análise) lê e escreve.
create table if not exists public.analytics_excluded_users (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.analytics_excluded_users enable row level security;

insert into public.analytics_excluded_users (user_id)
select u.id
  from auth.users u
 where u.id in (
   'b0a1c3f8-cedf-40b5-82b9-c972b05ecfc0',
   'ad1bae9b-7ad0-4a71-ba46-09c0a2b29647',
   '2e69cacc-9096-41f4-bb73-5ee2a76b3904',
   'bfec973e-b1a7-4afb-b5cd-31c1b0c3de81',
   'a17e4d24-b6e7-4af8-9d2c-1e8a5c35e0c6',
   '103f1b79-87f0-48ed-9b60-a93a14c8b086',
   '1aa72acf-fa2f-4221-affd-a6f979d23f8e',
   '63dd8e86-6094-41f5-a5ea-577a214dd501',
   '1476f4f7-bc30-4c85-a066-6a9968369bff',
   '0733f063-cf90-40b5-8d69-9bdd91120cc7',
   '97723638-1c5f-4351-a42f-0266299b5d82',
   '8e92c47f-4554-4202-bd23-71ebc41871c4')
on conflict (user_id) do nothing;
