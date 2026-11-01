-- Relatórios financeiros (aba "Relatórios" do Analytics Global): custos fixos/assinaturas e histórico mensal.
-- finance_costs: um lançamento por assinatura/serviço. kind = 'custo' | 'receita'.
-- cycle: monthly | annual | biennial | one_time | free. Anuais e bienais são rateados por mês (competência).
-- status: confirmado (tem recibo) | estimado | a_confirmar (amount_brl nulo; não entra nas somas).

create table if not exists public.finance_costs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'custo' check (kind in ('custo', 'receita')),
  name text not null,
  category text not null check (category in ('assinatura', 'infra', 'dominio', 'loja', 'anuncios', 'outro')),
  cycle text not null check (cycle in ('monthly', 'annual', 'biennial', 'one_time', 'free')),
  amount_brl numeric(12, 2),
  started_on date,
  ends_on date,
  status text not null default 'confirmado' check (status in ('confirmado', 'estimado', 'a_confirmar')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.finance_costs enable row level security;

create policy "finance_costs admin" on public.finance_costs
  for all to authenticated
  using (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true))
  with check (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true));

insert into public.finance_costs (name, category, cycle, amount_brl, started_on, status, note) values
  ('Google AI Pro 5 TB (Google One)', 'assinatura', 'monthly', 96.99, '2026-03-27', 'confirmado',
   'Recibos mensais do Google Play desde 27/03/2026; valor conferido no recibo de 27/10/2026.'),
  ('Claude Pro (Claude Code)', 'assinatura', 'annual', 1100.00, '2026-06-15', 'confirmado',
   'Recibo Anthropic #2529-2433-7893, de 15/06/2026 a 15/06/2027. Se o plano do Claude Code for maior que o Pro, o valor muda.'),
  ('Google Workspace (contato@representese.com)', 'assinatura', 'monthly', null, '2026-07-01', 'a_confirmar',
   'Teste gratuito de 30 dias; a cobrança começou em 01/07/2026. O valor não aparece nos e-mails: ver Admin Console > Faturamento.'),
  ('Canva Pro+', 'assinatura', 'annual', 490.00, '2026-06-09', 'estimado',
   'Teste grátis de 30 dias; cobrança anual de R$ 490 agendada para 09/06/2026 (e-mail de 10/05). Recibo não localizado.'),
  ('ElevenLabs Starter (1º mês, promoção)', 'assinatura', 'one_time', 5.56, '2026-10-27', 'confirmado',
   'Primeiro mês cobrado US$ 1 (promoção) = R$ 5,56.'),
  ('ElevenLabs Starter (voz dos vídeos)', 'assinatura', 'monthly', 33.36, '2026-11-27', 'estimado',
   'US$ 6/mês a R$ 5,56 por dólar. Renova em 27/11/2026.'),
  ('Domínio representese.com (Cloudflare)', 'dominio', 'biennial', 116.32, '2026-06-03', 'estimado',
   'Fatura Cloudflare IN-67147821: US$ 20,92 em 03/06/2026, valor que parece cobrir 2 anos; convertido a R$ 5,56 por dólar.'),
  ('Domínio representese.com.br (Registro.br)', 'dominio', 'biennial', 76.00, '2026-06-03', 'confirmado',
   'R$ 76 por 2 anos (03/06/2026 a 02/06/2028).'),
  ('Apple Developer Program', 'loja', 'annual', null, null, 'a_confirmar',
   'Anuidade (US$ 99 de tabela). Não há recibo no e-mail e o painel da Apple pede login: informar o valor e a data.'),
  ('Google Play Console (taxa de registro)', 'loja', 'one_time', null, null, 'a_confirmar',
   'Taxa única (US$ 25 de tabela). Não há recibo no e-mail: informar o valor e a data.'),
  ('Vercel (Hobby)', 'infra', 'free', 0, null, 'confirmado',
   'Plano gratuito. Hobby é para uso não comercial: migrar para o Pro (US$ 20/mês) é uma pendência.'),
  ('Supabase (Free)', 'infra', 'free', 0, null, 'confirmado',
   'Plano gratuito, sem backup. O Pro custa US$ 25/mês.'),
  ('Outros serviços gratuitos (Mailgun, Cloudflare DNS, PostHog, Sentry, Upstash)', 'infra', 'free', 0, null, 'confirmado',
   'Todos no plano gratuito.'),
  ('Gemini API (IA do app e da Re)', 'infra', 'free', 0, null, 'confirmado',
   'Nível gratuito, com limite diário baixo.');

-- Histórico mês a mês (só admin). Anúncios: o gasto de cada campanha é dividido igualmente pelos dias do período.
create or replace function public.admin_monthly_report()
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
  fin as (
    select mo.m,
      sum(case when f.kind = 'custo' then (case
        when f.amount_brl is null or f.started_on is null then 0
        when f.cycle = 'monthly' and date_trunc('month', f.started_on::timestamp)::date <= mo.m and (f.ends_on is null or f.ends_on >= mo.m) then f.amount_brl
        when f.cycle = 'annual' and mo.m >= date_trunc('month', f.started_on::timestamp)::date and mo.m < (date_trunc('month', f.started_on::timestamp) + interval '12 months')::date then f.amount_brl / 12
        when f.cycle = 'biennial' and mo.m >= date_trunc('month', f.started_on::timestamp)::date and mo.m < (date_trunc('month', f.started_on::timestamp) + interval '24 months')::date then f.amount_brl / 24
        when f.cycle = 'one_time' and date_trunc('month', f.started_on::timestamp)::date = mo.m then f.amount_brl
        else 0 end) else 0 end) as custo,
      sum(case when f.kind = 'receita' and f.amount_brl is not null and f.started_on is not null
               and date_trunc('month', f.started_on::timestamp)::date = mo.m then f.amount_brl else 0 end) as receita
    from months mo cross join public.finance_costs f
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

revoke all on function public.admin_monthly_report() from public, anon;
grant execute on function public.admin_monthly_report() to authenticated;
