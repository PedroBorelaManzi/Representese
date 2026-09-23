-- Auditoria geral do sistema (2026-09-23) — parte de banco de dados.
--
-- Achado importante: a migration 20260829120000_rls_perf_initplan_and_consolidate.sql
-- já existia no repositório com exatamente estas correções, mas nunca tinha sido
-- aplicada de fato neste projeto (os advisors continuavam acusando os mesmos
-- problemas que ela alega corrigir) — banco e Git estavam dessincronizados.
-- Esta migration reaplica tudo que faltava + os itens novos gerados pelas
-- tabelas de represented_companies (sessão anterior).
--
-- Nada aqui muda QUEM pode ver/alterar O QUÊ — só performance (RLS) e
-- integridade/velocidade de índice.

-- ─────────────────────────────────────────────────────────────────────────
-- Parte 1 — auth.uid() "solto" reavaliado linha a linha → (select auth.uid())
-- ─────────────────────────────────────────────────────────────────────────

alter policy "Isolamento de Alert Dismissals" on public.alert_dismissals
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own installments" on public.order_installments
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Isolamento de Order Intake Links" on public.order_intake_links
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Isolamento de Order Items" on public.order_items
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own catalog" on public.product_catalog
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own client product settings" on public.client_product_settings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Admins can read leads" on public.leads
  using (exists (
    select 1 from public.user_settings
    where user_settings.user_id = (select auth.uid())
      and user_settings.is_admin = true
  ));

alter policy "admin le feedback de exclusao" on public.account_deletion_feedback
  using (exists (
    select 1 from public.user_settings us
    where us.user_id = (select auth.uid())
      and us.is_admin = true
  ));

alter policy "Admin gerencia resolucoes de cliente" on public.company_client_resolutions
  using (is_platform_admin((select auth.uid())))
  with check (is_platform_admin((select auth.uid())));

alter policy "Admin ve fila de pedidos capturados" on public.incoming_orders
  using (is_platform_admin((select auth.uid())));

alter policy "Admin gerencia empresas representadas" on public.represented_companies
  using (is_platform_admin((select auth.uid())))
  with check (is_platform_admin((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────
-- Parte 2 — fundir políticas permissivas duplicadas (mesma ação+papel)
-- ─────────────────────────────────────────────────────────────────────────

-- user_entitlements: "owner" + "admin" (ambas SELECT) → uma só.
drop policy if exists "owner can read entitlements" on public.user_entitlements;
drop policy if exists "Admins can read all entitlements" on public.user_entitlements;
create policy "user_entitlements_select" on public.user_entitlements
  for select
  using (
    (select auth.uid()) = user_id
    or is_support_admin((select auth.uid()))
  );

-- user_events: "usuário lê os próprios" + "admin lê todos" (ambas SELECT) → uma só.
drop policy if exists "Users can read own events" on public.user_events;
drop policy if exists "Admins can read all events" on public.user_events;
create policy "user_events_select" on public.user_events
  for select
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.user_settings
      where user_settings.user_id = (select auth.uid())
        and user_settings.is_admin = true
    )
  );

-- user_settings: "Isolamento" (ALL, dono) + "Admins can read all settings" (SELECT)
-- se sobrepunham no SELECT. Divide em: SELECT = dono OU admin; escrita = só dono.
drop policy if exists "Isolamento de Configurações" on public.user_settings;
drop policy if exists "Admins can read all settings" on public.user_settings;

create policy "user_settings_select" on public.user_settings
  for select
  using (
    (select auth.uid()) = user_id
    or is_support_admin((select auth.uid()))
  );

create policy "user_settings_insert" on public.user_settings
  for insert
  with check ((select auth.uid()) = user_id);

create policy "user_settings_update" on public.user_settings
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_settings_delete" on public.user_settings
  for delete
  using ((select auth.uid()) = user_id);

-- company_reps: "Admin gerencia vinculos" (ALL) + "Vendedor ve os proprios
-- vinculos" (SELECT) se sobrepunham no SELECT. Divide igual ao padrão acima.
drop policy if exists "Admin gerencia vinculos" on public.company_reps;
drop policy if exists "Vendedor ve os proprios vinculos" on public.company_reps;

create policy "company_reps_select" on public.company_reps
  for select
  using (
    (select auth.uid()) = user_id
    or is_platform_admin((select auth.uid()))
  );

create policy "company_reps_insert" on public.company_reps
  for insert
  with check (is_platform_admin((select auth.uid())));

create policy "company_reps_update" on public.company_reps
  for update
  using (is_platform_admin((select auth.uid())))
  with check (is_platform_admin((select auth.uid())));

create policy "company_reps_delete" on public.company_reps
  for delete
  using (is_platform_admin((select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────
-- Parte 3 — índices faltando em foreign keys (consultas/joins mais rápidos)
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists idx_client_product_settings_client_id on public.client_product_settings (client_id);
create index if not exists idx_company_client_resolutions_resolved_by on public.company_client_resolutions (resolved_by);
create index if not exists idx_company_client_resolutions_resolved_user_id on public.company_client_resolutions (resolved_user_id);
create index if not exists idx_incoming_orders_assigned_user_id on public.incoming_orders (assigned_user_id);
create index if not exists idx_incoming_orders_order_id on public.incoming_orders (order_id);
create index if not exists idx_represented_companies_created_by on public.represented_companies (created_by);

-- ─────────────────────────────────────────────────────────────────────────
-- Parte 4 — admin_user_overview(): já se protege internamente (WHERE checa
-- is_admin do caller, então anon sempre recebe 0 linhas), mas não faz
-- sentido deixar a função executável por quem nem logou — reduz a
-- superfície exposta e evita alguém martelar essa query pesada sem sessão.
-- upsert_lead() fica como está: é o formulário público de lead da landing,
-- INTENCIONALMENTE aberto pra anon.
revoke execute on function public.admin_user_overview() from public;
revoke execute on function public.admin_user_overview() from anon;
grant execute on function public.admin_user_overview() to authenticated;
