-- Eliminar atividade (long press no histórico de um item ou no heatmap das
-- estatísticas). Apaga as linhas do registo dadas e, se vierem p_item_ids e o
-- intervalo, as sessões do Vyllo Playtime (PC) desses itens nesse intervalo:
-- nos dias com sessões, as horas jogadas são as das sessões. O PC só reenvia
-- sessões por enviar, por isso uma sessão apagada não volta. O progresso dos
-- itens (página, horas, episódio) não muda. Só do próprio utilizador.
create or replace function public.activity_delete(
  p_log_ids  bigint[],
  p_item_ids bigint[] default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.activity_log
   where id = any(coalesce(p_log_ids, '{}'))
     and user_id = auth.uid();

  if p_item_ids is not null and p_from is not null and p_to is not null then
    delete from public.playtime_sessions
     where user_id = auth.uid()
       and item_id = any(p_item_ids)
       and started_at >= p_from
       and started_at < p_to;
  end if;
end $$;

revoke all on function public.activity_delete(bigint[], bigint[], timestamptz, timestamptz) from public, anon;
grant execute on function public.activity_delete(bigint[], bigint[], timestamptz, timestamptz) to authenticated;
