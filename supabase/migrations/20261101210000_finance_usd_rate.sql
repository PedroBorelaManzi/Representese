-- Custos em dólar passam a usar a cotação do dia (buscada pela tela de Relatórios).
-- amount_usd: valor em US$ (Apple Developer, Cloudflare, ElevenLabs, taxa do Google Play).
-- Quando amount_usd existe, o valor em reais é amount_usd × cotação; senão vale amount_brl.

alter table public.finance_costs add column if not exists amount_usd numeric(12, 2);

update public.finance_costs set amount_usd = 99.00,
  note = 'Painel da Apple: taxa anual de US$ 99, renovação em 31/08/2027. Convertida pela cotação do dia. Rateio: ÷ 12 por mês.'
  where name = 'Apple Developer Program';
update public.finance_costs set amount_usd = 20.92,
  note = 'Cloudflare: US$ 20,92 pagos em 03/06/2026 por 2 anos (2 × US$ 10,46), domínio ativo até 03/06/2028. Convertido pela cotação do dia. Rateio: ÷ 24 por mês. A renovação a partir de nov/2026 será US$ 11,17 por ano.'
  where name like 'Domínio representese.com (Cloudflare)';
update public.finance_costs set amount_usd = 6.00,
  note = 'US$ 6 por mês, plano Starter, renova em 27/11/2026 (painel da ElevenLabs). Convertido pela cotação do dia.'
  where name = 'ElevenLabs Starter (voz dos vídeos)';
update public.finance_costs set amount_usd = 25.00,
  note = 'Developer Registration Fee do Google: US$ 25,00 cobrados uma única vez em 28/07/2026 (pedido PDS.0806-3949-0485-41905). Convertido pela cotação do dia. Entra só no mês da cobrança (julho).'
  where name like 'Google Play Console%';

-- Canva: o histórico de compras mostra uma única compra, R$ 35 pagos em 12/10/2026.
update public.finance_costs set started_on = '2026-10-12', status = 'confirmado',
  note = 'Canva Pro, R$ 35 por mês. Histórico de compras do Canva: pagamento de R$ 35 em 12/10/2026 (pedido 05032-31661560); renova em 12/11/2026.'
  where name = 'Canva Pro';

-- Nova RPC (v2) que recebe a cotação do dia. A antiga admin_monthly_report() continua existindo, sem uso.
create or replace function public.admin_monthly_report_v2(p_usd_rate numeric default 5.56)
returns table (
  month date,
  leads int,
  accounts int,
  ads_meta numeric,
  ads_google numeric,
  fixed_costs numeric,
  revenue numeric
)
language plpgsql
security definer
set search_path = public, auth
as $$
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
      sum(case when f.kind = 'receita' and f.eff is not null and f.started_on is not null
               and date_trunc('month', f.started_on::timestamp)::date = mo.m then f.eff else 0 end) as receita
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
$$;

revoke all on function public.admin_monthly_report_v2(numeric) from public, anon;
grant execute on function public.admin_monthly_report_v2(numeric) to authenticated;
