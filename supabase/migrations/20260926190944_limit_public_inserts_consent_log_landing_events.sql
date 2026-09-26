-- Aplicada em produção via MCP apply_migration em 2026-09-26.
-- consent_log: insert público continua (visitante sem login), mas com tamanho limitado
-- e sem forjar consentimento em nome de outro usuário.
alter table public.consent_log drop constraint if exists consent_log_field_limits;
alter table public.consent_log add constraint consent_log_field_limits check (
  char_length(coalesce(anon_id, '')) <= 100
  and char_length(coalesce(action, '')) <= 50
  and char_length(coalesce(user_agent, '')) <= 500
  and char_length(coalesce(page_url, '')) <= 500
  and consent_version between 0 and 1000
) not valid;

drop policy if exists "consent_log insert publico" on public.consent_log;
create policy "consent_log insert publico" on public.consent_log
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- landing_events: tamanho/valores plausíveis.
alter table public.landing_events drop constraint if exists landing_events_field_limits;
alter table public.landing_events add constraint landing_events_field_limits check (
  char_length(coalesce(section_id, '')) <= 100
  and coalesce(duration_seconds, 0) between 0 and 86400
) not valid;
