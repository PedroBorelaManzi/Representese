-- Todo cadastro vira contato em public.leads (CRM & Leads) e a Ficha Completa passa a trazer
-- origem, plataforma, funil, dados da loja (RevenueCat) e atribuição de marketing.
--
-- 1) Antes só o formulário do site (rpc upsert_lead) gravava em leads; quem criava a conta pelo
--    app (supabase.auth.signUp direto, ver handleSubmitIOS em src/pages/Register.tsx) ficava de fora
--    do CRM & Leads, embora aparecesse em "Gerenciar Usuários" e na ficha.
-- 2) user_entitlements ganha os campos que o webhook do RevenueCat já recebe e descartava.
-- 3) admin_user_overview() (Ficha Completa) ganha colunas novas, no fim, sem tirar nenhuma.

-- ---------------------------------------------------------------------------
-- 1) Captura de contato em todo cadastro
-- ---------------------------------------------------------------------------
create or replace function public.capture_lead_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
begin
  -- Contas internas (revisores, testes) não são contato comercial.
  if v_email = '' or v_email like '%@representese.com' then
    return new;
  end if;
  begin
    insert into public.leads (name, email, phone, company)
    values (
      left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(v_email, '@', 1)), 200),
      v_email,
      left(coalesce(new.raw_user_meta_data->>'phone', ''), 40),
      left(nullif(trim(coalesce(new.raw_user_meta_data->>'company', '')), ''), 200)
    )
    on conflict (email) do update
      set phone = coalesce(nullif(public.leads.phone, ''), excluded.phone),
          company = coalesce(public.leads.company, excluded.company),
          updated_at = timezone('utc'::text, now());
  exception when others then
    -- Nunca pode impedir a criação da conta.
    raise warning 'capture_lead_on_signup: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.capture_lead_on_signup() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_capture_lead on auth.users;
create trigger on_auth_user_created_capture_lead
  after insert on auth.users
  for each row execute function public.capture_lead_on_signup();

-- Quem já criou conta e ficou de fora (exclui administradores, contas internas e de teste).
insert into public.leads (name, email, phone, company, created_at)
select
  left(coalesce(nullif(trim(au.raw_user_meta_data->>'full_name'), ''), split_part(lower(au.email), '@', 1)), 200),
  lower(au.email),
  left(coalesce(au.raw_user_meta_data->>'phone', ''), 40),
  left(nullif(trim(coalesce(au.raw_user_meta_data->>'company', '')), ''), 200),
  au.created_at
from auth.users au
left join public.user_settings us on us.user_id = au.id
where coalesce(us.is_admin, false) = false
  and au.email is not null
  and lower(au.email) not like '%@representese.com'
  and lower(au.email) not like '%@teste.com'
  and lower(au.email) not like '%@m4.com'
  and not exists (select 1 from public.leads l where l.email = lower(au.email))
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Dados da loja (RevenueCat) guardados no direito de cada usuário
-- ---------------------------------------------------------------------------
alter table public.user_entitlements
  add column if not exists iap_store text,
  add column if not exists iap_product_id text,
  add column if not exists iap_price numeric,
  add column if not exists iap_currency text,
  add column if not exists iap_country text,
  add column if not exists iap_period_type text,
  add column if not exists iap_environment text,
  add column if not exists iap_purchased_at timestamptz,
  add column if not exists iap_renewal_number integer,
  add column if not exists iap_offer_code text,
  add column if not exists iap_cancel_reason text,
  add column if not exists iap_last_event_type text,
  add column if not exists iap_last_event_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3) Ficha Completa: mesmas colunas de antes + as novas no fim
-- ---------------------------------------------------------------------------
drop function if exists public.admin_user_overview();

create function public.admin_user_overview()
returns table(
  user_id uuid, email text, phone text, created_at timestamptz, onboarding_ok boolean, is_admin boolean,
  cidade text, estado text, billing_cidade text, billing_estado text, billing_cep text,
  plano text, plan_id text, assinatura_status text, ciclo text, periodo_fim timestamptz, trial_fim timestamptz,
  cancela_no_fim boolean, asaas_id text,
  consent_analiticos boolean, consent_version integer, consent_action text, consent_em timestamptz,
  ultimo_acesso timestamptz, eventos_total bigint, eventos_30d bigint, rotas_distintas bigint, segundos_total bigint,
  ultima_localizacao text, gps_lat double precision, gps_lng double precision, gps_precisao_m double precision,
  gps_em timestamptz, compartilha_local boolean,
  clientes bigint, pedidos bigint, representadas integer, compromissos bigint, mensagens_ia bigint,
  ultima_acao_audit text, ultima_acao_audit_em timestamptz,
  ph_last_seen timestamptz, ph_total_events bigint, ph_pageviews bigint, ph_sessions_30d bigint,
  ph_properties jsonb, ph_top_events jsonb,
  st_errors_30d bigint, st_total_errors bigint, st_last_error_at timestamptz, st_last_error_title text, st_top_issues jsonb,
  -- novas
  nome text, empresa text, email_confirmado boolean, ultimo_login timestamptz,
  origem_cadastro text, plataforma text, sistema_operacional text, navegador text,
  provedor_pagamento text, iap_app_user_id text, iap_original_transaction_id text,
  iap_store text, iap_product_id text, iap_price numeric, iap_currency text, iap_country text,
  iap_period_type text, iap_environment text, iap_purchased_at timestamptz, iap_renewal_number integer,
  iap_offer_code text, iap_cancel_reason text, iap_last_event_type text, iap_last_event_at timestamptz,
  viu_planos_em timestamptz, viu_checkout_em timestamptz, funil_etapa text,
  lead_marketing_consent boolean, atribuicao jsonb, segmentos text,
  indicado_por text, indicacoes_feitas bigint, desconto_indicacao integer
)
language sql
security definer
set search_path to 'public'
as $function$
  with caller as (
    select coalesce((select s.is_admin from public.user_settings s where s.user_id = auth.uid()), false) as ok
  ),
  ev as (
    select user_id, max(created_at) as ultimo_acesso, count(*) as eventos_total,
      count(*) filter (where created_at > now() - interval '30 days') as eventos_30d,
      count(distinct route) as rotas_distintas,
      coalesce(sum(duration_seconds),0)::bigint as segundos_total,
      max(created_at) filter (where route like '/planos%') as viu_planos_em,
      max(created_at) filter (where route like '/checkout%') as viu_checkout_em
    from public.user_events group by user_id
  ),
  loc as (
    select distinct on (user_id) user_id,
      nullif(concat_ws(', ', metadata->>'city', metadata->>'region', metadata->>'country'),'') as ultima_localizacao,
      nullif(metadata->>'platform','') as plataforma,
      nullif(metadata->>'os','') as sistema_operacional,
      nullif(metadata->>'browser','') as navegador
    from public.user_events where event_type = 'session_open' order by user_id, created_at desc
  ),
  cons as (
    select distinct on (user_id) user_id, analiticos, consent_version, action, created_at
    from public.consent_log where user_id is not null order by user_id, created_at desc
  ),
  aud as (
    select distinct on (user_id) user_id, action, created_at
    from public.audit_logs order by user_id, created_at desc
  ),
  base as (
    select
      us.user_id, us.email, us.phone, us.created_at, us.has_completed_onboarding, us.is_admin,
      us.weather_city, us.weather_state, us.billing_city, us.billing_state, us.billing_cep,
      us.subscription_plan, ue.plan_id, coalesce(ue.subscription_status, us.subscription_status) as assinatura_status,
      ue.billing_cycle, ue.current_period_end, ue.trial_ends_at, ue.cancel_at_period_end, us.asaas_subscription_id,
      cons.analiticos, cons.consent_version, cons.action as consent_action, cons.created_at as consent_em,
      ev.ultimo_acesso, coalesce(ev.eventos_total,0) as eventos_total, coalesce(ev.eventos_30d,0) as eventos_30d,
      coalesce(ev.rotas_distintas,0) as rotas_distintas, coalesce(ev.segundos_total,0) as segundos_total,
      loc.ultima_localizacao, us.last_lat, us.last_lng, us.location_accuracy_m, us.last_location_at, us.share_location,
      (select count(*) from public.clients c where c.user_id = us.user_id) as clientes,
      (select count(*) from public.orders o where o.user_id = us.user_id) as pedidos,
      coalesce(array_length(us.categories, 1), 0) as representadas,
      (select count(*) from public.appointments a where a.user_id = us.user_id) as compromissos,
      (select count(*) from public.ai_chats ai where ai.user_id = us.user_id) as mensagens_ia,
      aud.action as ultima_acao_audit, aud.created_at as ultima_acao_audit_em,
      ph.last_seen, coalesce(ph.total_events,0) as ph_total_events, coalesce(ph.total_pageviews,0) as ph_pageviews,
      coalesce(ph.sessions_30d,0) as ph_sessions_30d, ph.properties, ph.top_events,
      coalesce(st.errors_30d,0) as st_errors_30d, coalesce(st.total_errors,0) as st_total_errors,
      st.last_error_at, st.last_error_title, st.top_issues,
      -- novas
      coalesce(nullif(trim(au.raw_user_meta_data->>'full_name'), ''), ld.name) as nome,
      coalesce(nullif(trim(au.raw_user_meta_data->>'company'), ''), ld.company) as empresa,
      (au.email_confirmed_at is not null) as email_confirmado,
      au.last_sign_in_at as ultimo_login,
      case when au.raw_user_meta_data ? 'termos_aceitos_em' then 'app' else 'site' end as origem_cadastro,
      loc.plataforma, loc.sistema_operacional, loc.navegador,
      ue.subscription_provider, ue.iap_app_user_id, ue.iap_original_transaction_id,
      ue.iap_store, ue.iap_product_id, ue.iap_price, ue.iap_currency, ue.iap_country,
      ue.iap_period_type, ue.iap_environment, ue.iap_purchased_at, ue.iap_renewal_number,
      ue.iap_offer_code, ue.iap_cancel_reason, ue.iap_last_event_type, ue.iap_last_event_at,
      ev.viu_planos_em, ev.viu_checkout_em,
      ue.subscription_status as ent_status,
      ld.marketing_consent as lead_marketing_consent, ld.attribution as atribuicao,
      nullif(concat_ws(', ', nullif(array_to_string(us.segments, ', '), ''), nullif(us.segment_other, '')), '') as segmentos,
      (select u2.email from public.referrals r join public.user_settings u2 on u2.user_id = r.referrer_user_id
        where r.referred_user_id = us.user_id limit 1) as indicado_por,
      (select count(*) from public.referrals r where r.referrer_user_id = us.user_id) as indicacoes_feitas,
      us.referral_discount_pct
    from public.user_settings us
    join auth.users au on au.id = us.user_id
    left join public.leads ld on lower(ld.email) = lower(us.email)
    left join public.user_entitlements ue on ue.user_id = us.user_id
    left join ev on ev.user_id = us.user_id
    left join loc on loc.user_id = us.user_id
    left join cons on cons.user_id = us.user_id
    left join aud on aud.user_id = us.user_id
    left join public.posthog_person_stats ph on ph.user_id = us.user_id
    left join public.sentry_user_stats st on st.user_id = us.user_id
    where (select ok from caller)
  )
  select
    b.user_id, b.email, b.phone, b.created_at, b.has_completed_onboarding, b.is_admin,
    b.weather_city, b.weather_state, b.billing_city, b.billing_state, b.billing_cep,
    b.subscription_plan, b.plan_id, b.assinatura_status,
    b.billing_cycle, b.current_period_end, b.trial_ends_at, b.cancel_at_period_end, b.asaas_subscription_id,
    b.analiticos, b.consent_version, b.consent_action, b.consent_em,
    b.ultimo_acesso, b.eventos_total, b.eventos_30d, b.rotas_distintas, b.segundos_total, b.ultima_localizacao,
    b.last_lat, b.last_lng, b.location_accuracy_m, b.last_location_at, b.share_location,
    b.clientes, b.pedidos, b.representadas, b.compromissos, b.mensagens_ia,
    b.ultima_acao_audit, b.ultima_acao_audit_em,
    b.last_seen, b.ph_total_events, b.ph_pageviews, b.ph_sessions_30d, b.properties, b.top_events,
    b.st_errors_30d, b.st_total_errors, b.last_error_at, b.last_error_title, b.top_issues,
    b.nome, b.empresa, b.email_confirmado, b.ultimo_login,
    b.origem_cadastro, b.plataforma, b.sistema_operacional, b.navegador,
    b.subscription_provider, b.iap_app_user_id, b.iap_original_transaction_id,
    b.iap_store, b.iap_product_id, b.iap_price, b.iap_currency, b.iap_country,
    b.iap_period_type, b.iap_environment, b.iap_purchased_at, b.iap_renewal_number,
    b.iap_offer_code, b.iap_cancel_reason, b.iap_last_event_type, b.iap_last_event_at,
    b.viu_planos_em, b.viu_checkout_em,
    -- Onde a pessoa está no caminho até virar assinante.
    case
      when b.ent_status = 'active' and coalesce(b.plan_id, 'none') <> 'none' then 'assinante'
      when b.ent_status = 'trialing' then 'teste grátis'
      when b.ent_status = 'past_due' then 'pagamento com problema'
      when b.ent_status in ('canceled', 'cancelled', 'expired')
        or (b.ent_status = 'inactive' and (b.iap_original_transaction_id is not null or b.asaas_subscription_id is not null))
        then 'cancelou ou expirou'
      when b.viu_checkout_em is not null or b.asaas_subscription_id is not null or b.iap_original_transaction_id is not null
        then 'começou o pagamento'
      when b.viu_planos_em is not null then 'escolhendo o plano'
      else 'só cadastro'
    end,
    b.lead_marketing_consent, b.atribuicao, b.segmentos,
    b.indicado_por, b.indicacoes_feitas, b.referral_discount_pct
  from base b
  order by b.ultimo_acesso desc nulls last, b.created_at desc;
$function$;

revoke all on function public.admin_user_overview() from public, anon;
grant execute on function public.admin_user_overview() to authenticated, service_role;
