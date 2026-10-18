-- Etapas do funil (anônimas, sem identificador) e resposta de 1 clique "o que falta para assinar".

alter table public.ads_anon_visits add column if not exists step text not null default 'visit';
alter table public.ads_anon_visits drop constraint if exists ads_anon_visits_step_check;
alter table public.ads_anon_visits add constraint ads_anon_visits_step_check
  check (step in ('visit','register_view','planos_view','checkout_view','checkout_step2','checkout_submit','checkout_success'));
create index if not exists ads_anon_visits_step_idx on public.ads_anon_visits (step, created_at desc);

-- admin_ads_funnel passa a contar só visitas de verdade em 'anon_visits'
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
    'leads',          (select count(*) from ld where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'accounts',       (select count(*) from ac where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'paid',           (select count(*) from pd where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)),
    'paid_value',     coalesce((select sum(value) from pd where src is not null and (p_source = 'todos' or src = p_source) and (p_campaign is null or campaign = p_campaign)), 0),
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

-- Resposta de 1 clique (sem dado pessoal)
create table if not exists public.funnel_feedback (
  id bigint generated always as identity primary key,
  choice text not null check (choice in ('preco','quero_testar','nao_sei_se_serve','falta_funcao','so_pesquisando','outro')),
  page text not null default 'planos',
  source text,
  campaign text,
  created_at timestamptz not null default now()
);
alter table public.funnel_feedback enable row level security;
drop policy if exists "funnel_feedback insert publico" on public.funnel_feedback;
create policy "funnel_feedback insert publico" on public.funnel_feedback for insert to anon, authenticated with check (true);
drop policy if exists "funnel_feedback admin le" on public.funnel_feedback;
create policy "funnel_feedback admin le" on public.funnel_feedback for select to authenticated using (
  exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true));

create or replace function public.enforce_funnel_feedback_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.funnel_feedback where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limit exceeded for funnel_feedback';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_funnel_feedback_rate_limit on public.funnel_feedback;
create trigger trg_funnel_feedback_rate_limit before insert on public.funnel_feedback for each row execute function public.enforce_funnel_feedback_rate_limit();
revoke execute on function public.enforce_funnel_feedback_rate_limit() from public, anon, authenticated;

-- Resumo das etapas e das respostas, por origem
create or replace function public.admin_funnel_steps(p_since timestamptz default (now() - interval '30 days'), p_source text default 'todos')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not exists (select 1 from public.user_settings s where s.user_id = auth.uid() and s.is_admin = true) then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'steps', coalesce((select jsonb_object_agg(step, n) from (
        select step, count(*) n from public.ads_anon_visits
        where created_at >= p_since and (p_source = 'todos' or source = p_source) group by step) x), '{}'::jsonb),
    'feedback', coalesce((select jsonb_object_agg(choice, n) from (
        select choice, count(*) n from public.funnel_feedback
        where created_at >= p_since and (p_source = 'todos' or source = p_source) group by choice) y), '{}'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke all on function public.admin_funnel_steps(timestamptz, text) from public, anon;
grant execute on function public.admin_funnel_steps(timestamptz, text) to authenticated;
