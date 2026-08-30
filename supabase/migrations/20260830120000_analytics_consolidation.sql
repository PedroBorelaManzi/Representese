-- Consolidação de analytics + registro de consentimento (LGPD).
--
-- ATENÇÃO: a pasta supabase/migrations está fora de sincronia com o banco
-- (ver ~/.claude memory representese-migrations-drift). Este arquivo foi
-- APLICADO MANUALMENTE via SQL no projeto wdtftftwdqtihupbtlxk em 2026-08-30 —
-- ele existe aqui só como registro. NÃO rodar `supabase db push`.
--
-- O que cria:
--   1. consent_log            — registro imutável de cada decisão de cookies
--   2. posthog_person_stats   — snapshot por usuário, preenchido pelo cron
--   3. sentry_user_stats      — snapshot por usuário, preenchido pelo cron
--   4. admin_user_overview()  — RPC que junta tudo por usuário (só admin)

-- ============================================================
-- 1. consent_log  (LGPD art. 8º §2º: precisa poder demonstrar o consentimento)
-- ============================================================
create table if not exists public.consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anon_id text not null,                         -- id aleatório do navegador (localStorage)
  consent_version integer not null,
  preferencias boolean not null default false,
  analiticos boolean not null default false,
  action text not null check (action in ('accept_all','reject','custom','settings_change','login_sync')),
  user_agent text,
  page_url text,
  created_at timestamptz not null default now()
);
create index if not exists consent_log_user_id_idx on public.consent_log(user_id);
create index if not exists consent_log_anon_id_idx on public.consent_log(anon_id);
create index if not exists consent_log_created_at_idx on public.consent_log(created_at desc);

alter table public.consent_log enable row level security;

drop policy if exists "consent_log insert publico" on public.consent_log;
create policy "consent_log insert publico" on public.consent_log
  for insert to anon, authenticated with check (true);

drop policy if exists "consent_log leitura admin" on public.consent_log;
create policy "consent_log leitura admin" on public.consent_log
  for select to authenticated
  using (exists (select 1 from public.user_settings s
                 where s.user_id = (select auth.uid()) and s.is_admin = true));
-- sem policy de update/delete → log imutável pelo cliente

-- ============================================================
-- 2. posthog_person_stats
-- ============================================================
create table if not exists public.posthog_person_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  distinct_id text,
  first_seen timestamptz,
  last_seen timestamptz,
  total_events bigint not null default 0,
  total_pageviews bigint not null default 0,
  sessions_30d bigint not null default 0,
  top_events jsonb,
  properties jsonb,
  synced_at timestamptz not null default now()
);
alter table public.posthog_person_stats enable row level security;
drop policy if exists "posthog_person_stats leitura admin" on public.posthog_person_stats;
create policy "posthog_person_stats leitura admin" on public.posthog_person_stats
  for select to authenticated
  using (exists (select 1 from public.user_settings s
                 where s.user_id = (select auth.uid()) and s.is_admin = true));

-- ============================================================
-- 3. sentry_user_stats
-- ============================================================
create table if not exists public.sentry_user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_errors bigint not null default 0,
  errors_30d bigint not null default 0,
  last_error_at timestamptz,
  last_error_title text,
  top_issues jsonb,
  synced_at timestamptz not null default now()
);
alter table public.sentry_user_stats enable row level security;
drop policy if exists "sentry_user_stats leitura admin" on public.sentry_user_stats;
create policy "sentry_user_stats leitura admin" on public.sentry_user_stats
  for select to authenticated
  using (exists (select 1 from public.user_settings s
                 where s.user_id = (select auth.uid()) and s.is_admin = true));

-- ============================================================
-- 4. admin_user_overview()  — uma linha por usuário, tudo junto
-- security definer + checagem de is_admin dentro: não-admin recebe 0 linhas
-- ============================================================
drop function if exists public.admin_user_overview();
create function public.admin_user_overview()
returns table (
  user_id uuid,
  -- identidade / contato
  email text,
  phone text,
  created_at timestamptz,
  onboarding_ok boolean,
  is_admin boolean,
  -- localização
  cidade text,
  estado text,
  billing_cidade text,
  billing_estado text,
  billing_cep text,
  -- plano / assinatura
  plano text,
  plan_id text,
  assinatura_status text,
  ciclo text,
  periodo_fim timestamptz,
  trial_fim timestamptz,
  cancela_no_fim boolean,
  asaas_id text,
  -- consentimento (LGPD)
  consent_analiticos boolean,
  consent_version integer,
  consent_action text,
  consent_em timestamptz,
  -- atividade (user_events)
  ultimo_acesso timestamptz,
  eventos_total bigint,
  eventos_30d bigint,
  rotas_distintas bigint,
  segundos_total bigint,
  ultima_localizacao text,
  -- volume de dados
  clientes bigint,
  pedidos bigint,
  representadas integer,
  compromissos bigint,
  mensagens_ia bigint,
  -- auditoria
  ultima_acao_audit text,
  ultima_acao_audit_em timestamptz,
  -- posthog
  ph_last_seen timestamptz,
  ph_total_events bigint,
  ph_pageviews bigint,
  ph_sessions_30d bigint,
  ph_properties jsonb,
  ph_top_events jsonb,
  -- sentry
  st_errors_30d bigint,
  st_total_errors bigint,
  st_last_error_at timestamptz,
  st_last_error_title text,
  st_top_issues jsonb
)
language sql
security definer
set search_path = public
as $$
  with caller as (
    select coalesce((select s.is_admin from public.user_settings s where s.user_id = auth.uid()), false) as ok
  ),
  ev as (
    select
      user_id,
      max(created_at) as ultimo_acesso,
      count(*) as eventos_total,
      count(*) filter (where created_at > now() - interval '30 days') as eventos_30d,
      count(distinct route) as rotas_distintas,
      coalesce(sum(duration_seconds), 0)::bigint as segundos_total
    from public.user_events
    group by user_id
  ),
  loc as (
    select distinct on (user_id)
      user_id,
      nullif(concat_ws(', ',
        metadata->>'city', metadata->>'region', metadata->>'country'), '') as ultima_localizacao
    from public.user_events
    where event_type = 'session_open'
    order by user_id, created_at desc
  ),
  cons as (
    select distinct on (user_id)
      user_id, analiticos, consent_version, action, created_at
    from public.consent_log
    where user_id is not null
    order by user_id, created_at desc
  ),
  aud as (
    select distinct on (user_id) user_id, action, created_at
    from public.audit_logs
    order by user_id, created_at desc
  )
  select
    us.user_id,
    us.email,
    us.phone,
    us.created_at,
    us.has_completed_onboarding,
    us.is_admin,
    us.weather_city,
    us.weather_state,
    us.billing_city,
    us.billing_state,
    us.billing_cep,
    us.subscription_plan,
    ue.plan_id,
    coalesce(ue.subscription_status, us.subscription_status),
    ue.billing_cycle,
    ue.current_period_end,
    ue.trial_ends_at,
    ue.cancel_at_period_end,
    us.asaas_subscription_id,
    cons.analiticos,
    cons.consent_version,
    cons.action,
    cons.created_at,
    ev.ultimo_acesso,
    coalesce(ev.eventos_total, 0),
    coalesce(ev.eventos_30d, 0),
    coalesce(ev.rotas_distintas, 0),
    coalesce(ev.segundos_total, 0),
    loc.ultima_localizacao,
    (select count(*) from public.clients c where c.user_id = us.user_id),
    (select count(*) from public.orders o where o.user_id = us.user_id),
    coalesce(array_length(us.categories, 1), 0),
    (select count(*) from public.appointments a where a.user_id = us.user_id),
    (select count(*) from public.ai_chats ai where ai.user_id = us.user_id),
    aud.action,
    aud.created_at,
    ph.last_seen,
    coalesce(ph.total_events, 0),
    coalesce(ph.total_pageviews, 0),
    coalesce(ph.sessions_30d, 0),
    ph.properties,
    ph.top_events,
    coalesce(st.errors_30d, 0),
    coalesce(st.total_errors, 0),
    st.last_error_at,
    st.last_error_title,
    st.top_issues
  from public.user_settings us
  left join public.user_entitlements ue on ue.user_id = us.user_id
  left join ev  on ev.user_id  = us.user_id
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
