-- Funil de anúncios (Google): eventos anônimos das etapas de topo + RPC admin que junta
-- tudo com os números exatos (leads, contas criadas no checkout, assinaturas pagas).
--
-- Os eventos de topo (visita, tela de cadastro, tela de checkout) só são gravados com
-- aceite de cookies de análise (LGPD), então esses números são um PISO. Leads, contas e
-- assinaturas vêm do banco e são exatos.

create table if not exists public.ads_funnel_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  step text not null check (step in ('visit', 'register_view', 'checkout_view')),
  source text not null,
  campaign text,
  created_at timestamptz not null default now(),
  constraint ads_funnel_events_field_limits check (
    char_length(source) <= 100 and char_length(coalesce(campaign, '')) <= 200
  )
);

create unique index if not exists ads_funnel_events_session_step_key
  on public.ads_funnel_events (session_id, step);
create index if not exists ads_funnel_events_created_idx
  on public.ads_funnel_events (created_at desc);

alter table public.ads_funnel_events enable row level security;

drop policy if exists "ads_funnel_events insert publico" on public.ads_funnel_events;
create policy "ads_funnel_events insert publico" on public.ads_funnel_events
  for insert to anon, authenticated with check (true);

drop policy if exists "ads_funnel_events admin le" on public.ads_funnel_events;
create policy "ads_funnel_events admin le" on public.ads_funnel_events
  for select to authenticated using (
    exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true)
  );

-- Rate limit: no máximo 10 linhas por sessão em 10 minutos (são só 3 etapas possíveis).
create or replace function public.enforce_ads_funnel_events_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.ads_funnel_events
  where session_id = new.session_id
    and created_at > now() - interval '10 minutes';

  if recent_count >= 10 then
    raise exception 'rate limit exceeded for ads_funnel_events';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ads_funnel_events_rate_limit on public.ads_funnel_events;
create trigger trg_ads_funnel_events_rate_limit
  before insert on public.ads_funnel_events
  for each row execute function public.enforce_ads_funnel_events_rate_limit();

-- Origem "Google Ads": tem ID de clique (gclid/gbraid/wbraid) ou utm_source=google.
create or replace function public.attribution_is_google(a jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select a is not null and (
    a->>'gclid' is not null
    or a->>'gbraid' is not null
    or a->>'wbraid' is not null
    or lower(coalesce(a->>'utm_source', '')) = 'google'
  );
$$;

-- Números do funil para o painel admin. SECURITY DEFINER porque lê auth.users e
-- ads_conversions (só service_role); a checagem de admin é feita aqui dentro.
create or replace function public.admin_ads_funnel(p_since timestamptz default (now() - interval '30 days'))
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r jsonb;
begin
  if not exists (
    select 1 from public.user_settings s where s.user_id = auth.uid() and s.is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'since', p_since,
    'visits',         (select count(*) from public.ads_funnel_events e where e.step = 'visit' and e.source = 'google' and e.created_at >= p_since),
    'register_views', (select count(*) from public.ads_funnel_events e where e.step = 'register_view' and e.source = 'google' and e.created_at >= p_since),
    'checkout_views', (select count(*) from public.ads_funnel_events e where e.step = 'checkout_view' and e.source = 'google' and e.created_at >= p_since),
    'leads',          (select count(*) from public.leads l where l.created_at >= p_since and public.attribution_is_google(l.attribution)),
    'accounts',       (select count(*) from auth.users u where u.created_at >= p_since and public.attribution_is_google(u.raw_user_meta_data->'attribution')),
    'paid',           (select count(*) from public.ads_conversions c where c.created_at >= p_since and public.attribution_is_google(c.attribution)),
    'paid_value',     coalesce((select sum(c.value) from public.ads_conversions c where c.created_at >= p_since and public.attribution_is_google(c.attribution)), 0)
  ) into r;

  return r;
end;
$$;

revoke all on function public.admin_ads_funnel(timestamptz) from public, anon;
grant execute on function public.admin_ads_funnel(timestamptz) to authenticated;
