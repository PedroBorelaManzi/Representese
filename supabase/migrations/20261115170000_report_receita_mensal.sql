-- Relatórios: receita de assinatura recorrente. Lançamentos kind='receita' com cycle='monthly' agora contam em
-- todos os meses de started_on até ends_on (ou até hoje); os demais ciclos seguem contando só no mês de started_on.
create or replace function public.admin_monthly_report_v2(p_usd_rate numeric default 5.56)
returns table(month date, leads integer, accounts integer, ads_meta numeric, ads_google numeric, fixed_costs numeric, revenue numeric)
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
        else 0 end) else 0 end) as custo,
      sum(case when f.kind = 'receita' and f.eff is not null and f.started_on is not null and (
                (f.cycle = 'monthly' and date_trunc('month', f.started_on::timestamp)::date <= mo.m and (f.ends_on is null or f.ends_on >= mo.m))
                or (f.cycle <> 'monthly' and date_trunc('month', f.started_on::timestamp)::date = mo.m)
              ) then f.eff else 0 end) as receita
    from months mo cross join fc f
    group by mo.m
  )
  select months.m,
         coalesce(ld.n, 0),
         coalesce(ac.n, 0),
         round(coalesce(ads.meta, 0), 2),
         round(coalesce(ads.google, 0), 2),
         round(coalesce(fin.custo, 0), 2),
         round(coalesce(fin.receita, 0), 2)
  from months
  left join ld on ld.m = months.m
  left join ac on ac.m = months.m
  left join ads on ads.m = months.m
  left join fin on fin.m = months.m
  order by months.m;
end;
$function$;

-- Receita real conhecida: assinatura mensal do plano Profissional (Asaas), conta de teste da família (Fabio), paga em 12/11/2026.
insert into public.finance_costs (kind, name, category, cycle, amount_brl, started_on, status, note)
select 'receita', 'Assinatura Profissional (Asaas): conta de teste do Fabio', 'assinatura', 'monthly', 5.00, '2026-11-12', 'confirmado',
       'R$ 5,00/mês cobrado pelo Asaas desde 12/11/2026. É a assinatura de teste da família, não um cliente externo. Preencha "Termina em" se cancelar.'
where not exists (select 1 from public.finance_costs where kind = 'receita' and name like 'Assinatura Profissional (Asaas)%');
