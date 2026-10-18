-- Números das plataformas de anúncio (impressões, cliques, gasto) que o site não enxerga sozinho.
-- Preenchidos a partir do Google Ads e do Meta Business Suite; a aba "Funil de anúncios" do painel admin lê daqui.

create table if not exists public.ads_platform_stats (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('google', 'meta')),
  period_from date not null,
  period_to date not null,
  impressions integer not null default 0 check (impressions >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  spend numeric(12,2) check (spend is null or spend >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists ads_platform_stats_source_idx on public.ads_platform_stats (source, period_to desc, created_at desc);

alter table public.ads_platform_stats enable row level security;

drop policy if exists "ads_platform_stats admin tudo" on public.ads_platform_stats;
create policy "ads_platform_stats admin tudo" on public.ads_platform_stats
  for all to authenticated
  using (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true))
  with check (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true));
