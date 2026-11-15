-- Receita só de clientes reais: pagamentos de contas de teste (administrador, família, revisão da Apple, @representese.com) ficam fora.
-- Os e-mails de teste ficam na tabela revenue_test_emails (preenchida direto no banco, não neste arquivo).
create table if not exists public.revenue_test_emails (email text primary key);
alter table public.revenue_test_emails enable row level security;
create policy "revenue_test_emails admin read" on public.revenue_test_emails
  for select to authenticated
  using (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true));

update public.subscription_payments
   set is_test = true
 where gross_brl < 20
    or lower(coalesce(email, '')) like '%@representese.com'
    or lower(coalesce(email, '')) in (select email from public.revenue_test_emails);

create or replace function public.log_iap_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  prov text;
  pct numeric;
  gross numeric;
  extid text;
  v_email text;
  v_name text;
  v_admin boolean;
  v_test boolean;
begin
  if new.iap_last_event_type in ('INITIAL_PURCHASE', 'RENEWAL')
     and coalesce(new.iap_price, 0) > 0
     and coalesce(new.iap_currency, 'BRL') = 'BRL'
     and coalesce(new.iap_environment, 'PRODUCTION') <> 'SANDBOX'
     and coalesce(new.iap_period_type, 'NORMAL') <> 'TRIAL'
     and (tg_op = 'INSERT' or new.iap_last_event_at is distinct from old.iap_last_event_at) then
    prov := case when new.iap_store = 'PLAY_STORE' then 'google' else 'apple' end;
    pct := case when prov = 'google' then 15 else 30 end;
    gross := new.iap_price;
    extid := coalesce(new.iap_original_transaction_id, new.user_id::text) || ':' || coalesce(new.iap_renewal_number, 0)::text
             || ':' || to_char(coalesce(new.iap_purchased_at, now()), 'YYYYMMDD');
    select u.email, coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name')
      into v_email, v_name from auth.users u where u.id = new.user_id;
    select coalesce(bool_or(s.is_admin), false) into v_admin from public.user_settings s where s.user_id = new.user_id;
    v_test := v_admin
              or lower(coalesce(v_email, '')) like '%@representese.com'
              or lower(coalesce(v_email, '')) in (select email from public.revenue_test_emails);
    insert into public.subscription_payments (provider, external_id, user_id, email, customer_name, plan_id, gross_brl, fee_brl, net_brl, fee_pct, paid_at, is_test, note)
    values (prov, extid, new.user_id, lower(v_email), v_name, new.plan_id, gross, round(gross * pct / 100, 2), round(gross * (100 - pct) / 100, 2), pct,
            (coalesce(new.iap_purchased_at, now()) at time zone 'America/Sao_Paulo')::date, v_test,
            new.iap_store || ' · ' || new.iap_last_event_type || ' · comissão estimada ' || pct || '%')
    on conflict (provider, external_id) do nothing;
  end if;
  return new;
exception when others then
  return new;
end;
$$;


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
           count(distinct coalesce(p.user_id::text, lower(p.email)))::int as payers
    from public.subscription_payments p where not p.is_test group by 1
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
         round(coalesce(pay.g, 0), 2),
         round(coalesce(pay.n, 0), 2),
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
