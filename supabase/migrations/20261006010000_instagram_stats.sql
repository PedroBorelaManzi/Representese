-- Métricas do Instagram (@represente_se_) trazidas do Meta Business Suite, só admin.
-- Aplicada no projeto via MCP apply_migration em 2026-10-06, já com a série diária de 08/09 a 05/10/2026.

create table if not exists public.instagram_daily_stats (
  day date primary key,
  views integer not null default 0,
  viewers integer not null default 0,
  interactions integer not null default 0,
  link_clicks integer not null default 0,
  profile_visits integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_posts (
  post_id text primary key,
  permalink text,
  posted_at timestamptz,
  media_type text,
  caption text,
  views integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  link_clicks integer,
  updated_at timestamptz not null default now()
);

alter table public.instagram_daily_stats enable row level security;
alter table public.instagram_posts enable row level security;

drop policy if exists "instagram_daily_stats admin tudo" on public.instagram_daily_stats;
create policy "instagram_daily_stats admin tudo" on public.instagram_daily_stats
  for all to authenticated
  using (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true))
  with check (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true));

drop policy if exists "instagram_posts admin tudo" on public.instagram_posts;
create policy "instagram_posts admin tudo" on public.instagram_posts
  for all to authenticated
  using (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true))
  with check (exists (select 1 from public.user_settings s where s.user_id = (select auth.uid()) and s.is_admin = true));
