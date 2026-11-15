-- Receita de assinaturas por pagamento (Asaas, App Store, Google Play) com taxa/comissão e líquido.
-- Alimentada pela Edge Function sync-revenue (Asaas) e pelo handle-revenuecat-webhook (Apple/Google).
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('asaas', 'apple', 'google')),
  external_id text not null,
  user_id uuid,
  email text,
  customer_name text,
  plan_id text,
  gross_brl numeric(12, 2) not null,
  fee_brl numeric(12, 2) not null default 0,
  net_brl numeric(12, 2) not null,
  fee_pct numeric(5, 2),
  paid_at date not null,
  is_test boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
alter table public.subscription_payments enable row level security;
create policy "subscription_payments admin read" on public.subscription_payments
  for select to authenticated
  using (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true));

-- Compra Apple já confirmada no App Store Connect (1 compra do Exclusivo mensal, R$ 65,90, comissão 30%).
insert into public.subscription_payments (provider, external_id, user_id, email, customer_name, plan_id, gross_brl, fee_brl, net_brl, fee_pct, paid_at, is_test, note)
select 'apple', 'asc-2026-11-09-exclusivo', u.id, u.email, 'Paula Cristina dos Santos', 'exclusivo', 65.90, 19.77, 46.13, 30, date '2026-11-09', false,
       'Conferido no App Store Connect (1 compra, vendas US$ 12,36). Valor pelo preço da loja; confirmar em Pagamentos e relatórios financeiros.'
from auth.users u where lower(u.email) = 'paulinhaangelgus@gmail.com'
on conflict (provider, external_id) do nothing;

create or replace function public.admin_monthly_report_v3(p_usd_rate numeric default 5.56)
returns table(month date, leads integer, leads_converted integer, accounts integer, ads_meta numeric, ads_google numeric, fixed_costs numeric,
              rev_gross numeric, rev_fees numeric, rev_net numeric, rev_real_gross numeric, rev_real_net numeric, payers integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
begin
  if not exists (select 1 from public.user_settings s where s.user_id = auth.uid() and s.is_admin = true) then
    raise exception 'forbidden';
  end if;
  if p_usd_rate is null or p_usd_rate <= 0 or p_usd_rate > 50 then
    raise exception 'cotação inválida';
  end if;

  return query
  with months as (
    select g::date as m
    from generate_series(date '2026-03-01', date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, interval '1 month') g
  ),
  camp as (
    select c.platform, (c.spend / ((c.period_to - c.period_from) + 1)) as per_day, d::date as day
    from public.ads_campaigns c
    cross join lateral generate_series(c.period_from, c.period_to, interval '1 day') d
    where c.spend is not null and c.period_from is not null and c.period_to is not null and c.period_to >= c.period_from
  ),
  ads as (
    select date_trunc('month', day::timestamp)::date as m,
           sum(per_day) filter (where platform = 'meta') as meta,
           sum(per_day) filter (where platform = 'google') as google
    from camp group by 1
  ),
  ld as (
    select date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as m, count(*)::int as n
    from public.leads group by 1
  ),
  ac as (
    select date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as m, count(*)::int as n
    from auth.users group by 1
  ),
  fc as (
    select f.*, coalesce(f.amount_usd * p_usd_rate, f.amount_brl) as eff
    from public.finance_costs f
  ),
  fin as (
    select mo.m,
      sum(case when f.kind = 'custo' then (case
        when f.eff is null or f.started_on is null then 0
        when f.cycle = 'monthly' and date_trunc('month', f.started_on::timestamp)::date <= mo.m and (f.ends_on is null or f.ends_on >= mo.m) then f.eff
        when f.cycle = 'annual' and mo.m >= date_trunc('month', f.started_on::timestamp)::date and mo.m < (date_trunc('month', f.started_on::timestamp) + interval '12 months')::date then f.eff / 12
        when f.cycle = 'biennial' and mo.m >= date_trunc('month', f.started_on::timestamp)::date and mo.m < (date_trunc('month', f.started_on::timestamp) + interval '24 months')::date then f.eff / 24
        when f.cycle = 'one_time' and date_trunc('month', f.started_on::timestamp)::date = mo.m then f.eff
        else 0 end) else 0 end) as custo
    from months mo cross join fc f
    group by mo.m
  ),
  pay as (
    select date_trunc('month', p.paid_at::timestamp)::date as m,
           sum(p.gross_brl) as g, sum(p.fee_brl) as f, sum(p.net_brl) as n,
           sum(p.gross_brl) filter (where not p.is_test) as rg,
           sum(p.net_brl) filter (where not p.is_test) as rn,
           count(distinct coalesce(p.user_id::text, lower(p.email))) filter (where not p.is_test)::int as payers
    from public.subscription_payments p group by 1
  ),
  firstpay as (
    select lower(p.email) as em, min(p.paid_at) as d
    from public.subscription_payments p where not p.is_test and p.email is not null group by 1
  ),
  conv as (
    select date_trunc('month', fp.d::timestamp)::date as m, count(*)::int as n
    from firstpay fp where exists (select 1 from public.leads l where lower(l.email) = fp.em) group by 1
  )
  select months.m,
         coalesce(ld.n, 0),
         coalesce(conv.n, 0),
         coalesce(ac.n, 0),
         round(coalesce(ads.meta, 0), 2),
         round(coalesce(ads.google, 0), 2),
         round(coalesce(fin.custo, 0), 2),
         round(coalesce(pay.g, 0), 2),
         round(coalesce(pay.f, 0), 2),
         round(coalesce(pay.n, 0), 2),
         round(coalesce(pay.rg, 0), 2),
         round(coalesce(pay.rn, 0), 2),
         coalesce(pay.payers, 0)
  from months
  left join ld on ld.m = months.m
  left join ac on ac.m = months.m
  left join ads on ads.m = months.m
  left join fin on fin.m = months.m
  left join pay on pay.m = months.m
  left join conv on conv.m = months.m
  order by months.m;
end;
$function$;
