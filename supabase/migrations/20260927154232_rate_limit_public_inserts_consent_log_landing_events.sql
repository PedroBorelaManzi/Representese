-- Aplicada em produção via MCP apply_migration em 2026-09-27.
-- Rate limit de verdade (contagem por janela de tempo) nos dois inserts
-- públicos (anon), complementando os limites de tamanho de campo já
-- aplicados em 20260926190927. Sem isso um script podia inundar as duas
-- tabelas sem limite de frequência.

create or replace function public.enforce_consent_log_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.consent_log
  where anon_id = new.anon_id
    and created_at > now() - interval '5 minutes';

  if recent_count >= 20 then
    raise exception 'rate limit exceeded for consent_log';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_consent_log_rate_limit on public.consent_log;
create trigger trg_consent_log_rate_limit
  before insert on public.consent_log
  for each row execute function public.enforce_consent_log_rate_limit();

create or replace function public.enforce_landing_events_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.landing_events
  where session_id = new.session_id
    and created_at > now() - interval '10 minutes';

  if recent_count >= 100 then
    raise exception 'rate limit exceeded for landing_events';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_landing_events_rate_limit on public.landing_events;
create trigger trg_landing_events_rate_limit
  before insert on public.landing_events
  for each row execute function public.enforce_landing_events_rate_limit();
