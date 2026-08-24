-- Guarda o refresh_token do Sign in with Apple para o poder revogar quando o
-- utilizador elimina a conta (Apple Guideline 5.1.1(v)).
--
-- Aditivo. A tabela profiles já tem RLS com política de SELECT (o próprio vê o
-- seu perfil), mas SEM política de UPDATE para o cliente — por isso só a service
-- role (edge functions) escreve nesta coluna. O token nunca é exposto ao cliente.
alter table profiles
  add column if not exists apple_refresh_token text;
