-- Contexto dos eventos do funil e ambiente das compras. ADITIVO: colunas novas,
-- vazias nas linhas que já existiam (não se sabe de que versão vieram).
--
-- Nos eventos da app (activation_events, paywall_events, app_opens,
-- search_misses):
--   app_version  versão da app que enviou ('1.0.44+30'): separa "não aconteceu"
--                de "estava numa versão sem registo"
--   platform     ios, android, web, windows, macos, linux, other
--   session_id   uma por abertura da app (hex aleatório, nada pessoal): junta
--                os passos de um mesmo percurso
--   received_at  hora do servidor ao receber. created_at pode ser a hora do
--                telemóvel (eventos guardados sem rede e enviados depois)
--
-- Em purchase_events:
--   environment  production ou sandbox, dito pela loja (Apple environment,
--                Google testPurchase/purchaseType, Stripe livemode). Vazio nas
--                linhas de antes: tratar como desconhecido.

do $$
declare
  t text;
begin
  foreach t in array array['activation_events', 'paywall_events', 'app_opens', 'search_misses'] loop
    execute format('alter table public.%I add column if not exists app_version text', t);
    execute format('alter table public.%I add column if not exists platform text', t);
    execute format('alter table public.%I add column if not exists session_id text', t);
    -- Sem default no add column: as linhas antigas ficam vazias, não com a
    -- hora desta migration.
    execute format('alter table public.%I add column if not exists received_at timestamptz', t);
    execute format('alter table public.%I alter column received_at set default now()', t);

    execute format('alter table public.%I drop constraint if exists %I', t, t || '_app_version_check');
    execute format(
      'alter table public.%I add constraint %I check (app_version ~ ''^[0-9A-Za-z.+-]{1,24}$'')',
      t, t || '_app_version_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_platform_check');
    execute format(
      'alter table public.%I add constraint %I check (platform in (''ios'', ''android'', ''web'', ''windows'', ''macos'', ''linux'', ''other''))',
      t, t || '_platform_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_session_id_check');
    execute format(
      'alter table public.%I add constraint %I check (session_id ~ ''^[0-9a-f]{16,32}$'')',
      t, t || '_session_id_check');
  end loop;
end $$;

alter table public.purchase_events add column if not exists environment text;
alter table public.purchase_events drop constraint if exists purchase_events_environment_check;
alter table public.purchase_events
  add constraint purchase_events_environment_check
  check (environment in ('production', 'sandbox'));
