-- Mudar a data de uma linha do histórico de um item (long press na app). A
-- linha junta o registo de um dia (várias entradas) e, nas horas, as sessões
-- do Vyllo Playtime (PC) desse dia, que a app não pode alterar diretamente.
-- Tudo anda p_days dias, mantendo a hora; só do próprio utilizador.
create or replace function public.history_move_day(
  p_item_id bigint,
  p_log_ids bigint[],
  p_days    int,
  p_from    timestamptz default null,   -- dia (local) das sessões a mover
  p_to      timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift interval := make_interval(days => p_days);
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_days = 0 then
    return;
  end if;

  update public.activity_log
     set created_at = created_at + v_shift
   where id = any(p_log_ids)
     and user_id = auth.uid()
     and item_id = p_item_id;

  -- O id da sessão vem do PC: se ele a reenviar, on conflict (id) ignora-a,
  -- por isso a data nova fica.
  if p_from is not null and p_to is not null then
    update public.playtime_sessions
       set started_at = started_at + v_shift,
           ended_at   = ended_at + v_shift
     where user_id = auth.uid()
       and item_id = p_item_id
       and started_at >= p_from
       and started_at < p_to;
  end if;
end $$;

revoke all on function public.history_move_day(bigint, bigint[], int, timestamptz, timestamptz) from public, anon;
grant execute on function public.history_move_day(bigint, bigint[], int, timestamptz, timestamptz) to authenticated;
