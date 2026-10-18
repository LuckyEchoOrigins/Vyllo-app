-- second_category: com dois itens criados no mesmo instante (ex.: uma importação),
-- a ordem das categorias segue também o primeiro id, não fica ao acaso.
create or replace function public.log_item_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activation_events (user_id, event, detail)
  select added.user_id, m.event,
         case when m.event = 'item_1' then (
           select i.category from public.items i
            where i.user_id = added.user_id
            order by i.created_at, i.id
            limit 1)
         end
    from (
      select n.user_id, count(*) as n
        from new_items n
       where n.user_id is not null
       group by n.user_id
    ) added
    cross join lateral (
      select count(*) as n from public.items i where i.user_id = added.user_id
    ) total
    join (values ('item_1', 1), ('item_5', 5)) as m (event, threshold)
      on total.n - added.n < m.threshold and total.n >= m.threshold
  on conflict (user_id, event) do nothing;

  insert into public.activation_events (user_id, event, detail)
  select firsts.user_id, 'second_category',
         string_agg(firsts.category, '+' order by firsts.first_at, firsts.first_id)
    from (
      select i.user_id, i.category, min(i.created_at) as first_at, min(i.id) as first_id,
             row_number() over (partition by i.user_id order by min(i.created_at), min(i.id)) as n
        from public.items i
       where i.user_id in (select distinct user_id from new_items where user_id is not null)
       group by i.user_id, i.category
    ) firsts
   where firsts.n <= 2
     and not exists (
       select 1 from public.activation_events e
        where e.user_id = firsts.user_id and e.event = 'second_category')
   group by firsts.user_id
  having count(*) = 2
  on conflict (user_id, event) do nothing;
  return null;
exception when others then
  -- As métricas nunca podem impedir que um item seja guardado.
  return null;
end;
$$;
