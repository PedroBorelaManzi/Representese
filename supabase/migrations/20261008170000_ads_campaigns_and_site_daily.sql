-- Campanhas pagas (Meta/Instagram + Google) para cruzar com o Instagram e o site no painel admin,
-- e um resumo diário do site (sessões medidas, leads, contas) para a mesma janela de datas.

create table if not exists public.ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('meta', 'google')),
  name text not null,
  status text not null,
  period_from date,
  period_to date,
  dates_estimated boolean not null default false,
  spend numeric,
  impressions int,
  clicks int,
  result_label text,
  result_value int,
  note text,
  created_at timestamptz not null default now()
);
alter table public.ads_campaigns enable row level security;
drop policy if exists "ads_campaigns admin le" on public.ads_campaigns;
create policy "ads_campaigns admin le" on public.ads_campaigns
  for select to authenticated using (
    exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true)
  );

create or replace function public.admin_site_daily(p_from date, p_to date)
returns table (day date, landing_sessions int, leads int, accounts int, anon_visits int, ads_visits int)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.user_settings s where s.user_id = auth.uid() and s.is_admin = true) then
    raise exception 'forbidden';
  end if;
  return query
  with dias as (select generate_series(p_from, p_to, interval '1 day')::date d)
  select d.d,
    (select count(distinct e.session_id)::int from public.landing_events e where (e.created_at at time zone 'America/Sao_Paulo')::date = d.d),
    (select count(*)::int from public.leads l where (l.created_at at time zone 'America/Sao_Paulo')::date = d.d),
    (select count(*)::int from auth.users u where (u.created_at at time zone 'America/Sao_Paulo')::date = d.d and u.email not like 'applereview%'),
    (select count(*)::int from public.ads_anon_visits a where (a.created_at at time zone 'America/Sao_Paulo')::date = d.d),
    (select count(*)::int from public.ads_funnel_events f where f.step = 'visit' and (f.created_at at time zone 'America/Sao_Paulo')::date = d.d)
  from dias d order by d.d;
end;
$$;
revoke all on function public.admin_site_daily(date, date) from public, anon;
grant execute on function public.admin_site_daily(date, date) to authenticated;

insert into public.ads_campaigns (platform, name, status, period_from, period_to, dates_estimated, spend, impressions, clicks, result_label, result_value, note) values
 ('meta','Instagram Post (impulsionar post)','Concluída','2026-10-02','2026-10-05',true,124.86,15327,1511,'Cliques no link',1511,'R$ 0,08 por clique. Datas inferidas pelo pico de cliques em links (459 a 516/dia), junto com a campanha abaixo.'),
 ('meta','Post do Instagram: Sua rotina de vendas pode ser…','Concluída','2026-10-02','2026-10-05',true,124.75,10645,null,'Visitas ao perfil',885,'R$ 0,14 por visita. Datas inferidas pelas visitas ao perfil de 158 a 215/dia.'),
 ('meta','Campanha excluída A (877 visitas ao perfil)','Excluída','2026-09-14','2026-09-18',true,129.88,null,null,'Visitas ao perfil',877,'Apagada no Gerenciador; só restou gasto e resultado. Período inferido pelo pico de visitas ao perfil (196 a 222/dia) e cliques em links (99 a 216/dia).'),
 ('meta','Campanha excluída B (540 visitas ao perfil)','Excluída','2026-09-24','2026-09-29',true,124.85,null,null,'Visitas ao perfil',540,'Apagada no Gerenciador; só restou gasto e resultado. Período inferido pelo pico de visitas e visualizações (4 a 10 mil/dia).'),
 ('google','Campaign #1 (Performance Max)','Ativa','2026-10-03',null,false,57.92,3840,366,'Conversões reais (assinatura paga)',0,'R$ 0,16 por clique, CTR 9,5%. As 24 conversões que o Ads mostra vêm da ação antiga "Compra" (R$ 1 por carga de /register).'),
 ('google','Pesquisa – Vendas e Gestão de Clientes','Ativa (aprendizado)','2026-10-03',null,false,0,0,0,'Conversões reais (assinatura paga)',0,'Sem impressões ainda; palavras-chave novas adicionadas em 08/10.');
