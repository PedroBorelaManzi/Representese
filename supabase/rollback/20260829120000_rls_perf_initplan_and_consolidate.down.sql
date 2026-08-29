-- ROLLBACK de 20260829120000_rls_perf_initplan_and_consolidate.sql
--
-- Restaura as políticas EXATAMENTE como estavam antes (capturadas de pg_policies
-- em 2026-08-29). Rodar isto se, após aplicar a migração, algum usuário tomar
-- erro de permissão (dashboard não carrega, não salva config, etc.).
--
--   supabase db execute --file supabase/migrations/20260829120000_rls_perf_initplan_and_consolidate.down.sql
--   (ou colar no SQL Editor do painel)

-- ── Parte 1 — voltar auth.uid() "solto" ───────────────────────────────────

alter policy "Isolamento de Alert Dismissals" on public.alert_dismissals
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter policy "Users manage own installments" on public.order_installments
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter policy "Isolamento de Order Intake Links" on public.order_intake_links
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter policy "Isolamento de Order Items" on public.order_items
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter policy "Users manage own catalog" on public.product_catalog
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter policy "Admins can read leads" on public.leads
  using (exists (
    select 1 from public.user_settings
    where user_settings.user_id = auth.uid()
      and user_settings.is_admin = true
  ));

-- ── Parte 2 — desfazer a consolidação ─────────────────────────────────────

-- user_entitlements
drop policy if exists "user_entitlements_select" on public.user_entitlements;
create policy "owner can read entitlements" on public.user_entitlements
  for select using ((select auth.uid()) = user_id);
create policy "Admins can read all entitlements" on public.user_entitlements
  for select using (is_support_admin((select auth.uid())));

-- user_events
drop policy if exists "user_events_select" on public.user_events;
create policy "Users can read own events" on public.user_events
  for select using ((select auth.uid()) = user_id);
create policy "Admins can read all events" on public.user_events
  for select using (exists (
    select 1 from public.user_settings
    where user_settings.user_id = (select auth.uid())
      and user_settings.is_admin = true
  ));

-- user_settings
drop policy if exists "user_settings_select" on public.user_settings;
drop policy if exists "user_settings_insert" on public.user_settings;
drop policy if exists "user_settings_update" on public.user_settings;
drop policy if exists "user_settings_delete" on public.user_settings;
create policy "Isolamento de Configurações" on public.user_settings
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Admins can read all settings" on public.user_settings
  for select using (is_support_admin((select auth.uid())));

-- support_conversations
drop policy if exists "support_conversations_access" on public.support_conversations;
create policy "support_conversations_admin" on public.support_conversations
  for all
  using (is_support_admin((select auth.uid())))
  with check (is_support_admin((select auth.uid())));
create policy "support_conversations_owner" on public.support_conversations
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- support_messages
drop policy if exists "support_messages_access" on public.support_messages;
create policy "support_messages_admin" on public.support_messages
  for all
  using (is_support_admin((select auth.uid())))
  with check (
    is_support_admin((select auth.uid()))
    and sender_id = (select auth.uid())
    and sender_role = 'admin'
  );
create policy "support_messages_owner" on public.support_messages
  for all
  using (exists (
    select 1 from public.support_conversations c
    where c.id = support_messages.conversation_id
      and c.user_id = (select auth.uid())
  ))
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'user'
    and exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );
