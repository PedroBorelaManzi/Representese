-- Aplicada em produção via MCP apply_migration em 2026-10-01.
-- Força troca de senha no próximo login — usado quando o Pedro cria uma
-- conta manual com uma senha provisória dele (ex.: conta de cortesia pra um
-- amigo) e quer que a pessoa defina a própria senha assim que entrar.
alter table public.user_settings add column must_change_password boolean not null default false;
