-- Vyllo Playtime (a app do PC, Windows), Fase 0: ligar um PC à conta.
--
-- O PC mostra um código (ex.: KTRV-BQXM); o utilizador introduz-o na app Vyllo,
-- que o aprova com a sessão normal dele. O PC recebe um token próprio (vpt_...),
-- que só serve para o Playtime e que o utilizador pode revogar na app. É
-- funcionalidade Premium: aprovar um PC exige Premium.
--
-- ADITIVO: tabelas e funções novas; não toca em items nem profiles.
-- Desenho: repositório "Vyllo Playtime", DESIGN.md (secções 5 e 14).
--
-- As tabelas não têm políticas RLS: nem o PC nem a app lhes tocam diretamente.
-- A app usa as funções playtime_* abaixo (verificam auth.uid()); a Edge Function
-- playtime usa a service role.

-- ── Premium ─────────────────────────────────────────────────────────────────
-- A mesma regra do steam-cron: Stripe (is_premium) ou uma subscrição da Apple /
-- Google ainda dentro do prazo.
create or replace function public.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_premium is true
        or (p.google_expires_at is not null and p.google_expires_at > now())
        or (p.apple_expires_at is not null and p.apple_expires_at > now())
    from public.profiles p
    where p.id = p_user
  ), false);
$$;

-- ── Dispositivos (PCs ligados) ──────────────────────────────────────────────
create table if not exists public.playtime_devices (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 64),
  platform            text not null default 'windows',
  os_version          text,
  app_version         text,
  -- sha256 (hex) do token do PC. Fica null quando o PC é removido: o token
  -- deixa de valer na hora. O histórico de sessões (Fase 1) fica.
  token_hash          text unique,
  tracking_enabled    boolean not null default true,
  tracking_changed_at timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz,
  revoked_at          timestamptz
);

create index if not exists playtime_devices_user_idx
  on public.playtime_devices (user_id) where revoked_at is null;

alter table public.playtime_devices enable row level security;

-- ── Pedidos de ligação (expiram em 10 minutos) ──────────────────────────────
create table if not exists public.playtime_pairings (
  device_code_hash text primary key,          -- sha256 (hex) do segredo que só o PC tem
  user_code        text not null unique,      -- 'KTRV-BQXM': o que se escreve na app
  device_name      text not null check (char_length(device_name) between 1 and 64),
  os_version       text,
  app_version      text,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'denied', 'consumed')),
  user_id          uuid references auth.users(id) on delete cascade,
  device_id        uuid references public.playtime_devices(id) on delete cascade,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);

alter table public.playtime_pairings enable row level security;

-- Tentativas de introduzir um código, para travar quem tente adivinhar códigos.
create table if not exists public.playtime_pairing_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists playtime_pairing_attempts_user_idx
  on public.playtime_pairing_attempts (user_id, attempted_at);

alter table public.playtime_pairing_attempts enable row level security;

-- ── Auxiliares internas ─────────────────────────────────────────────────────
-- 'ktrv bqxm' / 'KTRVBQXM' → 'KTRV-BQXM'
create or replace function public.playtime_normalize_code(p_code text)
returns text
language sql
immutable
as $$
  select case when char_length(c) = 8 then substr(c, 1, 4) || '-' || substr(c, 5, 4) else c end
  from (select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as c) s;
$$;

-- Regista uma tentativa do utilizador atual. False se já passou de 10 no último
-- minuto. Não lança exceção: a tentativa tem de ficar gravada mesmo quando o
-- código está errado.
create or replace function public.playtime_pairing_attempt()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recent int;
begin
  delete from public.playtime_pairing_attempts
   where user_id = v_user and attempted_at < now() - interval '1 hour';
  select count(*) into v_recent
    from public.playtime_pairing_attempts
   where user_id = v_user and attempted_at > now() - interval '1 minute';
  if v_recent >= 10 then
    return false;
  end if;
  insert into public.playtime_pairing_attempts (user_id) values (v_user);
  return true;
end $$;

-- ── Para a app Vyllo (utilizador autenticado) ───────────────────────────────
-- Todas devolvem jsonb com "status", em vez de lançar exceções, para a
-- tentativa ficar registada.

-- O que está à espera com este código: para a app mostrar "Gaming PC · Windows
-- 11 · pedido há 20 s" antes de aprovar.
create or replace function public.playtime_pairing_lookup(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pairing public.playtime_pairings;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  if not public.playtime_pairing_attempt() then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into v_pairing
    from public.playtime_pairings
   where user_code = public.playtime_normalize_code(p_code)
     and status = 'pending'
     and expires_at > now();
  if not found then
    return jsonb_build_object('status', 'invalid_code');
  end if;
  return jsonb_build_object(
    'status', 'found',
    'device_name', v_pairing.device_name,
    'os_version', v_pairing.os_version,
    'requested_at', v_pairing.created_at,
    'expires_at', v_pairing.expires_at
  );
end $$;

create or replace function public.playtime_pairing_approve(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pairing public.playtime_pairings;
  v_device uuid;
begin
  if v_user is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  if not public.playtime_pairing_attempt() then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not public.is_premium(v_user) then
    return jsonb_build_object('status', 'premium_required');
  end if;
  select * into v_pairing
    from public.playtime_pairings
   where user_code = public.playtime_normalize_code(p_code)
     and status = 'pending'
     and expires_at > now()
     for update;
  if not found then
    return jsonb_build_object('status', 'invalid_code');
  end if;

  insert into public.playtime_devices (user_id, name, os_version, app_version)
  values (v_user, v_pairing.device_name, v_pairing.os_version, v_pairing.app_version)
  returning id into v_device;

  update public.playtime_pairings
     set status = 'approved', user_id = v_user, device_id = v_device
   where device_code_hash = v_pairing.device_code_hash;

  return jsonb_build_object('status', 'approved', 'device_id', v_device);
end $$;

create or replace function public.playtime_pairing_deny(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;
  if not public.playtime_pairing_attempt() then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  update public.playtime_pairings
     set status = 'denied'
   where user_code = public.playtime_normalize_code(p_code)
     and status = 'pending'
     and expires_at > now();
  if not found then
    return jsonb_build_object('status', 'invalid_code');
  end if;
  return jsonb_build_object('status', 'denied');
end $$;

-- Os PCs ligados do utilizador (sem o hash do token).
create or replace function public.playtime_list_devices()
returns table (
  id uuid,
  name text,
  platform text,
  os_version text,
  app_version text,
  created_at timestamptz,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.name, d.platform, d.os_version, d.app_version, d.created_at, d.last_seen_at
    from public.playtime_devices d
   where d.user_id = auth.uid() and d.revoked_at is null
   order by d.created_at;
$$;

-- "Remove PC": o token deixa de valer; a linha fica, com revoked_at.
create or replace function public.playtime_device_revoke(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.playtime_devices
     set token_hash = null, revoked_at = now()
   where id = p_device_id and user_id = auth.uid() and revoked_at is null;
  return found;
end $$;

-- ── Para a Edge Function playtime (service role) ────────────────────────────

-- O PC pergunta se o código já foi aprovado. Se sim, guarda o hash do token
-- novo e entrega-o uma única vez (o pedido passa a 'consumed').
create or replace function public.playtime_pairing_claim(p_device_code_hash text, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pairing public.playtime_pairings;
  v_display text;
begin
  select * into v_pairing
    from public.playtime_pairings
   where device_code_hash = p_device_code_hash
     for update;
  if not found or v_pairing.status = 'consumed' then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_pairing.status = 'denied' then
    return jsonb_build_object('status', 'denied');
  end if;
  if v_pairing.status = 'pending' then
    if v_pairing.expires_at <= now() then
      return jsonb_build_object('status', 'expired');
    end if;
    return jsonb_build_object('status', 'pending');
  end if;

  update public.playtime_devices
     set token_hash = p_token_hash, last_seen_at = now()
   where id = v_pairing.device_id;
  update public.playtime_pairings
     set status = 'consumed'
   where device_code_hash = p_device_code_hash;

  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1))
    into v_display
    from auth.users u
   where u.id = v_pairing.user_id;

  return jsonb_build_object(
    'status', 'approved',
    'device_id', v_pairing.device_id,
    'user_display', v_display
  );
end $$;

-- Identifica o PC pelo hash do token e marca-o como visto agora. Null se o
-- token não vale (nunca existiu ou o PC foi removido).
create or replace function public.playtime_device_session(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.playtime_devices;
begin
  update public.playtime_devices
     set last_seen_at = now()
   where token_hash = p_token_hash and revoked_at is null
  returning * into v_device;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_device.id,
    'user_id', v_device.user_id,
    'name', v_device.name,
    'premium', public.is_premium(v_device.user_id),
    'tracking_enabled', v_device.tracking_enabled,
    'tracking_changed_at', v_device.tracking_changed_at
  );
end $$;

-- ── Permissões ──────────────────────────────────────────────────────────────
-- O Supabase dá EXECUTE a anon e authenticated por defeito: fechar tudo e abrir
-- só o que a app usa.
revoke all on function public.is_premium(uuid) from public, anon, authenticated;
revoke all on function public.playtime_normalize_code(text) from public, anon, authenticated;
revoke all on function public.playtime_pairing_attempt() from public, anon, authenticated;
revoke all on function public.playtime_pairing_claim(text, text) from public, anon, authenticated;
revoke all on function public.playtime_device_session(text) from public, anon, authenticated;

revoke all on function public.playtime_pairing_lookup(text) from public, anon;
revoke all on function public.playtime_pairing_approve(text) from public, anon;
revoke all on function public.playtime_pairing_deny(text) from public, anon;
revoke all on function public.playtime_list_devices() from public, anon;
revoke all on function public.playtime_device_revoke(uuid) from public, anon;
grant execute on function public.playtime_pairing_lookup(text) to authenticated;
grant execute on function public.playtime_pairing_approve(text) to authenticated;
grant execute on function public.playtime_pairing_deny(text) to authenticated;
grant execute on function public.playtime_list_devices() to authenticated;
grant execute on function public.playtime_device_revoke(uuid) to authenticated;
