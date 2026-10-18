-- Funil: em "Todas" passa a contar também cadastros, contas e assinaturas sem origem de anúncio reconhecida
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
  if not exists (select 1 from public.user_settings s where s.user_id = auth.uid() and s.is_admin = true) then
    raise exception 'forbidden';
  end if;
  if p_source not in ('google', 'meta', 'outros', 'todos') then
    raise exception 'origem invalida';
  end if;

  with
  ev as (select e.step, e.source, e.campaign from public.ads_funnel_events e where e.created_at >= p_since),
  an as (select a.source, a.campaign from public.ads_anon_visits a where a.created_at >= p_since and a.step = 'visit'),
  ld as (select public.attribution_source(l.attribution) src, l.attribution->>'utm_campaign' campaign from public.leads l where l.created_at >= p_since),
  ac as (select public.attribution_source(u.raw_user_meta_data->'attribution') src, u.raw_user_meta_data->'attribution'->>'utm_campaign' campaign from auth.users u where u.created_at >= p_since),
  pd as (select public.attribution_source(c.attribution) src, c.attribution->>'utm_campaign' campaign, c.value from public.ads_conversions c where c.created_at >= p_since)
  select jsonb_build_object(
    'since', p_since, 'source', p_source, 'campaign', p_campaign,
    'visits',         (select count(*) from ev where step = 'visit'         and (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'anon_visits',    (select count(*) from an where (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'register_views', (select count(*) from ev where step = 'register_view' and (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'checkout_views', (select count(*) from ev where step = 'checkout_view' and (p_source = 'todos' or source = p_source) and (p_campaign is null or campaign = p_campaign)),
    'leads',          (select count(*) from ld where (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'accounts',       (select count(*) from ac where (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'paid',           (select count(*) from pd where (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'paid_value',     coalesce((select sum(value) from pd where (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)), 0),
    'campaigns',      coalesce((select jsonb_agg(distinct campaign) from (
        select campaign from ev where campaign is not null
        union all select campaign from an where campaign is not null
        union all select campaign from ld where campaign is not null and src is not null
        union all select campaign from ac where campaign is not null and src is not null
        union all select campaign from pd where campaign is not null and src is not null) x), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke all on function public.admin_ads_funnel(timestamptz, text, text) from public, anon;
grant execute on function public.admin_ads_funnel(timestamptz, text, text) to authenticated;
