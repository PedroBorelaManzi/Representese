-- Contagem anônima de visitas vindas de anúncio de quem AINDA não aceitou cookies de análise.
-- Sem identificador de sessão, sem IP, sem e-mail/telefone: só origem e campanha, para dar
-- ao painel o volume real de cliques que chegam ao site (hoje o funil só enxerga quem aceita).

create table if not exists public.ads_anon_visits (
  id bigint generated always as identity primary key,
  source text not null,
  campaign text,
  created_at timestamptz not null default now(),
  constraint ads_anon_visits_field_limits check (
    char_length(source) <= 100 and char_length(coalesce(campaign, '')) <= 200
  )
);
create index if not exists ads_anon_visits_created_idx on public.ads_anon_visits (created_at desc);

alter table public.ads_anon_visits enable row level security;

drop policy if exists "ads_anon_visits insert publico" on public.ads_anon_visits;
create policy "ads_anon_visits insert publico" on public.ads_anon_visits
  for insert to anon, authenticated with check (true);

drop policy if exists "ads_anon_visits admin le" on public.ads_anon_visits;
create policy "ads_anon_visits admin le" on public.ads_anon_visits
  for select to authenticated using (
    exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true)
  );

-- Sem identificador por visitante não dá para limitar por sessão: teto global (anti-spam).
create or replace function public.enforce_ads_anon_visits_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.ads_anon_visits where created_at > now() - interval '1 minute') >= 300 then
    raise exception 'rate limit exceeded for ads_anon_visits';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ads_anon_visits_rate_limit on public.ads_anon_visits;
create trigger trg_ads_anon_visits_rate_limit
  before insert on public.ads_anon_visits
  for each row execute function public.enforce_ads_anon_visits_rate_limit();

revoke execute on function public.enforce_ads_anon_visits_rate_limit() from public, anon, authenticated;

-- RPC: mesma de antes + 'anon_visits'.
create or replace function public.admin_ads_funnel(
  p_since timestamptz default (now() - interval '30 days'),
  p_source text default 'google',
  p_campaign text default null
)
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

  if p_source not in ('google', 'meta', 'outros', 'todos') then
    raise exception 'origem invalida';
  end if;

  with
  ev as (
    select e.step, e.source, e.campaign
    from public.ads_funnel_events e
    where e.created_at >= p_since
  ),
  an as (
    select a.source, a.campaign
    from public.ads_anon_visits a
    where a.created_at >= p_since
  ),
  ld as (
    select public.attribution_source(l.attribution) src, l.attribution->>'utm_campaign' campaign
    from public.leads l where l.created_at >= p_since
  ),
  ac as (
    select public.attribution_source(u.raw_user_meta_data->'attribution') src,
           u.raw_user_meta_data->'attribution'->>'utm_campaign' campaign
    from auth.users u where u.created_at >= p_since
  ),
  pd as (
    select public.attribution_source(c.attribution) src, c.attribution->>'utm_campaign' campaign, c.value
    from public.ads_conversions c where c.created_at >= p_since
  )
  select jsonb_build_object(
    'since', p_since,
    'source', p_source,
    'campaign', p_campaign,
    'visits',         (select count(*) from ev where step = 'visit'         and (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'anon_visits',    (select count(*) from an where (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'register_views', (select count(*) from ev where step = 'register_view' and (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'checkout_views', (select count(*) from ev where step = 'checkout_view' and (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'leads',          (select count(*) from ld where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'accounts',       (select count(*) from ac where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'paid',           (select count(*) from pd where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'paid_value',     coalesce((select sum(value) from pd where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)), 0),
    'campaigns',      coalesce((
      select jsonb_agg(distinct campaign) from (
        select campaign from ev where campaign is not null
        union all select campaign from an where campaign is not null
        union all select campaign from ld where campaign is not null and src is not null
        union all select campaign from ac where campaign is not null and src is not null
        union all select campaign from pd where campaign is not null and src is not null
      ) x
    ), '[]'::jsonb)
  ) into r;

  return r;
end;
$$;

revoke all on function public.admin_ads_funnel(timestamptz, text, text) from public, anon;
grant execute on function public.admin_ads_funnel(timestamptz, text, text) to authenticated;
