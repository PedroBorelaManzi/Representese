-- Performance de RLS (item 4 da auditoria de capacidade).
--
-- Dois problemas apontados pelos advisors do Supabase, sem mudança de semântica:
--
--   1. auth_rls_initplan — políticas que chamam auth.uid() / auth.role() "solto",
--      reavaliado LINHA A LINHA. Envolver em (select ...) faz o Postgres avaliar
--      UMA vez por query (initPlan). Resultado idêntico, custo de CPU muito menor.
--
--   2. multiple_permissive_policies — duas políticas PERMISSIVE para o mesmo
--      papel+ação obrigam o Postgres a avaliar as duas em toda linha. Fundir num
--      único predicado `A OR B` dá exatamente o mesmo resultado (permissive = OR).
--
-- Nada aqui muda QUEM pode ver/alterar O QUÊ.

-- ───────────────────────────────────────────────────────────────────────────
-- Parte 1 — envolver auth.uid() em (select auth.uid())  [só troca de forma]
-- ───────────────────────────────────────────────────────────────────────────

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

alter policy "Admins can read leads" on public.leads
  using (exists (
    select 1 from public.user_settings
    where user_settings.user_id = (select auth.uid())
      and user_settings.is_admin = true
  ));

-- ───────────────────────────────────────────────────────────────────────────
-- Parte 2 — fundir políticas permissivas duplicadas
-- ───────────────────────────────────────────────────────────────────────────

-- user_entitlements: "owner pode ler" + "admin pode ler tudo"  (ambas SELECT)
drop policy if exists "owner can read entitlements" on public.user_entitlements;
drop policy if exists "Admins can read all entitlements" on public.user_entitlements;
create policy "user_entitlements_select" on public.user_entitlements
  for select
  using (
    (select auth.uid()) = user_id
    or is_support_admin((select auth.uid()))
  );

-- user_events: "usuário lê os próprios" + "admin lê todos"  (ambas SELECT)
-- (a política de INSERT "Users can insert their own events" fica como está)
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

-- user_settings: "Isolamento" (ALL, dono) + "Admins can read all settings" (SELECT).
-- FOR ALL cobre SELECT, então sobrepõe a política de admin no SELECT.
-- Divide em: SELECT = dono OU admin; escrita = só o dono.
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

-- support_conversations: admin (ALL) + dono (ALL) → uma única política ALL.
drop policy if exists "support_conversations_admin" on public.support_conversations;
drop policy if exists "support_conversations_owner" on public.support_conversations;
create policy "support_conversations_access" on public.support_conversations
  for all
  using (
    is_support_admin((select auth.uid()))
    or (select auth.uid()) = user_id
  )
  with check (
    is_support_admin((select auth.uid()))
    or (select auth.uid()) = user_id
  );

-- support_messages: admin (ALL) + dono (ALL) → uma única política ALL.
-- USING  = admin OU dono da conversa
-- CHECK  = (admin escrevendo como 'admin')  OU  (dono escrevendo como 'user')
drop policy if exists "support_messages_admin" on public.support_messages;
drop policy if exists "support_messages_owner" on public.support_messages;
create policy "support_messages_access" on public.support_messages
  for all
  using (
    is_support_admin((select auth.uid()))
    or exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    (
      is_support_admin((select auth.uid()))
      and sender_id = (select auth.uid())
      and sender_role = 'admin'
    )
    or (
      sender_id = (select auth.uid())
      and sender_role = 'user'
      and exists (
        select 1 from public.support_conversations c
        where c.id = support_messages.conversation_id
          and c.user_id = (select auth.uid())
      )
    )
  );
