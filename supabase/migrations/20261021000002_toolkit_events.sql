-- PC Playtime Toolkit (vyllo-app.com/tools/pc-playtime): o funil do questionario
-- do site. ADITIVO: uma tabela sem conta, escrita so pela funcao abaixo (o anon
-- nao tem INSERT nem SELECT; a analise corre com a service role).
--
-- Sem email, IP, user agent nem texto livre: um id de sessao aleatorio que a
-- pagina so guarda em memoria, o evento, o resultado, as respostas como
-- categorias fixas e a campanha (utm_source/utm_campaign) quando o link a tiver.
create table if not exists public.toolkit_events (
  id          bigint      generated always as identity primary key,
  session_id  uuid        not null,
  event       text        not null check (event in (
                'toolkit_viewed', 'quiz_started', 'quiz_completed', 'result_viewed',
                'playtime_cta_clicked', 'store_clicked')),
  result      text        check (result in ('steam', 'multi', 'simple')),
  answers     jsonb,
  detail      text        check (detail ~ '^[a-z_]{1,20}$'),
  source      text        check (source ~ '^[a-z0-9_.-]{1,40}(/[a-z0-9_.-]{1,40})?$'),
  created_at  timestamptz not null default now()
);

-- Cada evento conta uma vez por sessao (e por detalhe, como a loja escolhida):
-- repetir um clique nao enche a tabela, e uma sessao tem no maximo umas 15 linhas.
create unique index if not exists toolkit_events_once_idx
  on public.toolkit_events (session_id, event, coalesce(detail, ''));
create index if not exists toolkit_events_created_idx on public.toolkit_events (created_at);

alter table public.toolkit_events enable row level security;

-- As respostas aceites, por pergunta. A pagina usa exatamente estes valores.
create or replace function public.toolkit_answers_valid(p_answers jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_answers) = 'object'
     and not exists (
       select 1 from jsonb_each(p_answers) a
        where jsonb_typeof(a.value) <> 'string'
           or (a.key, a.value #>> '{}') not in (
                ('where', 'steam'), ('where', 'multiple'), ('where', 'non_steam'),
                ('track', 'steam'), ('track', 'tracker'), ('track', 'manual'), ('track', 'none'),
                ('pain', 'missing_hours'), ('pain', 'manual'), ('pain', 'scattered'),
                ('pain', 'no_mobile'), ('pain', 'nothing'),
                ('phone', 'yes'), ('phone', 'maybe'), ('phone', 'no'),
                ('often', 'daily'), ('often', 'weekly'), ('often', 'occasionally')))
$$;

-- A unica porta de entrada. Valores invalidos sao ignorados em silencio (a
-- pagina nunca mostra erros de metricas) e, se chegarem mais de 3000 eventos em
-- 10 minutos de todo o site, o resto e ignorado ate a janela passar.
create or replace function public.log_toolkit_event(
  p_session uuid,
  p_event   text,
  p_result  text  default null,
  p_answers jsonb default null,
  p_detail  text  default null,
  p_source  text  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session is null
     or (p_answers is not null and not public.toolkit_answers_valid(p_answers)) then
    return;
  end if;
  if (select count(*) from public.toolkit_events
       where created_at > now() - interval '10 minutes') >= 3000 then
    return;
  end if;
  insert into public.toolkit_events (session_id, event, result, answers, detail, source)
  values (p_session, p_event, p_result, p_answers, p_detail, p_source)
  on conflict do nothing;
exception when check_violation or invalid_text_representation then
  return;
end;
$$;

-- A politica de privacidade promete no maximo 24 meses: limpeza diaria.
select cron.unschedule('toolkit-events-retention')
where exists (select 1 from cron.job where jobname = 'toolkit-events-retention');

select cron.schedule(
  'toolkit-events-retention',
  '41 4 * * *',
  $$ delete from public.toolkit_events where created_at < now() - interval '24 months' $$
);

revoke all on function public.log_toolkit_event(uuid, text, text, jsonb, text, text) from public;
grant execute on function public.log_toolkit_event(uuid, text, text, jsonb, text, text) to anon, authenticated;
