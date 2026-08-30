-- Localização do dispositivo do usuário (ver src/lib/geoTracking.ts).
--
-- APLICADO MANUALMENTE no projeto wdtftftwdqtihupbtlxk em 2026-08-30 — arquivo
-- só como registro (pasta de migrations fora de sincronia). NÃO rodar db push.
--
-- Finalidades declaradas na Política de Privacidade › Localização:
--   1. centralizar o mapa de clientes na posição do usuário;
--   2. o Represente-Se avaliar a cobertura geográfica da rede de representantes.
-- Coleta só com app/site aberto (1x ao abrir + a cada ~10 min), nunca em
-- segundo plano. Web e nativo. O usuário pode desligar em Configs › Privacidade.

alter table public.user_settings add column if not exists last_lat double precision;
alter table public.user_settings add column if not exists last_lng double precision;
alter table public.user_settings add column if not exists last_location_at timestamptz;
alter table public.user_settings add column if not exists location_accuracy_m double precision;
alter table public.user_settings add column if not exists share_location boolean not null default true;

-- admin_user_overview() recriada para devolver também os campos de GPS.
-- Esta é a definição ATUAL da função (substitui a de 20260830120000).
drop function if exists public.admin_user_overview();
create function public.admin_user_overview()
returns table (
  user_id uuid, email text, phone text, created_at timestamptz, onboarding_ok boolean, is_admin boolean,
  cidade text, estado text, billing_cidade text, billing_estado text, billing_cep text,
  plano text, plan_id text, assinatura_status text, ciclo text, periodo_fim timestamptz, trial_fim timestamptz,
  cancela_no_fim boolean, asaas_id text,
  consent_analiticos boolean, consent_version integer, consent_action text, consent_em timestamptz,
  ultimo_acesso timestamptz, eventos_total bigint, eventos_30d bigint, rotas_distintas bigint,
  segundos_total bigint, ultima_localizacao text,
  gps_lat double precision, gps_lng double precision, gps_precisao_m double precision, gps_em timestamptz, compartilha_local boolean,
  clientes bigint, pedidos bigint, representadas integer, compromissos bigint, mensagens_ia bigint,
  ultima_acao_audit text, ultima_acao_audit_em timestamptz,
  ph_last_seen timestamptz, ph_total_events bigint, ph_pageviews bigint, ph_sessions_30d bigint,
  ph_properties jsonb, ph_top_events jsonb,
  st_errors_30d bigint, st_total_errors bigint, st_last_error_at timestamptz, st_last_error_title text, st_top_issues jsonb
)
language sql security definer set search_path = public as $$
  with caller as (
    select coalesce((select s.is_admin from public.user_settings s where s.user_id = auth.uid()), false) as ok
  ),
  ev as (
    select user_id, max(created_at) as ultimo_acesso, count(*) as eventos_total,
      count(*) filter (where created_at > now() - interval '30 days') as eventos_30d,
      count(distinct route) as rotas_distintas,
      coalesce(sum(duration_seconds),0)::bigint as segundos_total
    from public.user_events group by user_id
  ),
  loc as (
    select distinct on (user_id) user_id,
      nullif(concat_ws(', ', metadata->>'city', metadata->>'region', metadata->>'country'),'') as ultima_localizacao
    from public.user_events where event_type = 'session_open' order by user_id, created_at desc
  ),
  cons as (
    select distinct on (user_id) user_id, analiticos, consent_version, action, created_at
    from public.consent_log where user_id is not null order by user_id, created_at desc
  ),
  aud as (
    select distinct on (user_id) user_id, action, created_at
    from public.audit_logs order by user_id, created_at desc
  )
  select
    us.user_id, us.email, us.phone, us.created_at, us.has_completed_onboarding, us.is_admin,
    us.weather_city, us.weather_state, us.billing_city, us.billing_state, us.billing_cep,
    us.subscription_plan, ue.plan_id, coalesce(ue.subscription_status, us.subscription_status),
    ue.billing_cycle, ue.current_period_end, ue.trial_ends_at, ue.cancel_at_period_end, us.asaas_subscription_id,
    cons.analiticos, cons.consent_version, cons.action, cons.created_at,
    ev.ultimo_acesso, coalesce(ev.eventos_total,0), coalesce(ev.eventos_30d,0),
    coalesce(ev.rotas_distintas,0), coalesce(ev.segundos_total,0), loc.ultima_localizacao,
    us.last_lat, us.last_lng, us.location_accuracy_m, us.last_location_at, us.share_location,
    (select count(*) from public.clients c where c.user_id = us.user_id),
    (select count(*) from public.orders o where o.user_id = us.user_id),
    coalesce(array_length(us.categories, 1), 0),
    (select count(*) from public.appointments a where a.user_id = us.user_id),
    (select count(*) from public.ai_chats ai where ai.user_id = us.user_id),
    aud.action, aud.created_at,
    ph.last_seen, coalesce(ph.total_events,0), coalesce(ph.total_pageviews,0), coalesce(ph.sessions_30d,0),
    ph.properties, ph.top_events,
    coalesce(st.errors_30d,0), coalesce(st.total_errors,0), st.last_error_at, st.last_error_title, st.top_issues
  from public.user_settings us
  left join public.user_entitlements ue on ue.user_id = us.user_id
  left join ev on ev.user_id = us.user_id
  left join loc on loc.user_id = us.user_id
  left join cons on cons.user_id = us.user_id
  left join aud on aud.user_id = us.user_id
  left join public.posthog_person_stats ph on ph.user_id = us.user_id
  left join public.sentry_user_stats st on st.user_id = us.user_id
  where (select ok from caller)
  order by ev.ultimo_acesso desc nulls last;
$$;
revoke all on function public.admin_user_overview() from anon;
grant execute on function public.admin_user_overview() to authenticated;
