-- Itens escondidos do "Continuar" do início da app (ex.: um jogo que nunca
-- acaba, como o Rocket League). Só tira o cartão do início: o item continua na
-- biblioteca, nas estatísticas e no Wrapped.
alter table public.items
  add column if not exists hidden_from_home boolean not null default false;
