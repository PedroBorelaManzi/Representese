-- Anúncio (utm_content) nas etapas anônimas + resumo por anúncio + campanha Meta do ciclo 1.

alter table public.ads_anon_visits add column if not exists ad text;
create index if not exists ads_anon_visits_ad_idx on public.ads_anon_visits (campaign, ad, step);

create or replace function public.admin_funnel_by_ad(p_since timestamptz default (now() - interval '30 days'), p_campaign text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare r jsonb;
begin
  if not exists (select 1 from public.user_settings s where s.user_id = auth.uid() and s.is_admin = true) then
    raise exception 'forbidden';
  end if;
  with
  st as (
    select coalesce(a.ad, '(sem anúncio)') ad, a.step, count(*) n
    from public.ads_anon_visits a
    where a.created_at >= p_since and a.source = 'meta' and (p_campaign is null or a.campaign = p_campaign)
    group by 1, 2),
  ld as (
    select coalesce(l.attribution->>'utm_content', '(sem anúncio)') ad, count(*) n
    from public.leads l
    where l.created_at >= p_since and public.attribution_source(l.attribution) = 'meta'
      and (p_campaign is null or l.attribution->>'utm_campaign' = p_campaign)
    group by 1),
  ac as (
    select coalesce(u.raw_user_meta_data->'attribution'->>'utm_content', '(sem anúncio)') ad, count(*) n
    from auth.users u
    where u.created_at >= p_since and public.attribution_source(u.raw_user_meta_data->'attribution') = 'meta'
      and (p_campaign is null or u.raw_user_meta_data->'attribution'->>'utm_campaign' = p_campaign)
    group by 1),
  ads as (select ad from st union select ad from ld union select ad from ac)
  select jsonb_build_object('ads', coalesce(jsonb_agg(jsonb_build_object(
    'ad', ads.ad,
    'steps', coalesce((select jsonb_object_agg(st.step, st.n) from st where st.ad = ads.ad), '{}'::jsonb),
    'leads', coalesce((select ld.n from ld where ld.ad = ads.ad), 0),
    'accounts', coalesce((select ac.n from ac where ac.ad = ads.ad), 0)
  ) order by ads.ad), '[]'::jsonb)) into r from ads;
  return r;
end;
$$;
revoke all on function public.admin_funnel_by_ad(timestamptz, text) from public, anon;
grant execute on function public.admin_funnel_by_ad(timestamptz, text) to authenticated;

insert into public.ads_campaigns (platform, name, status, period_from, period_to, dates_estimated, spend, result_label, note)
select 'meta', 'ciclo1-trafego-ig-out26', 'Rascunho (não publicada)', '2026-10-10', '2026-10-16', false, 0, 'Visualizações da página',
  'Só Instagram. R$ 125 no total. Anúncio A-register-caderno (→ /register) contra B-planos-caderno (→ /planos). Pixel 1807570517102801.'
where not exists (select 1 from public.ads_campaigns where name = 'ciclo1-trafego-ig-out26');
