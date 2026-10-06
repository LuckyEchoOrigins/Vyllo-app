-- Corre a funcao steam-cron de hora a hora (ao minuto 7). A chave usada e a
-- publishable (publica, a mesma da app): a funcao nao confia nela para nada
-- e limita-se a um utilizador de 50 em 50 minutos.
select cron.unschedule('steam-hourly-sync')
where exists (select 1 from cron.job where jobname = 'steam-hourly-sync');

select cron.schedule(
  'steam-hourly-sync',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://awlluazqkdvfpqzbwyfe.supabase.co/functions/v1/steam-cron',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_8nyEN62rg2i_DVHB3KdwfQ_G-_Lp-ci", "Authorization": "Bearer sb_publishable_8nyEN62rg2i_DVHB3KdwfQ_G-_Lp-ci"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
