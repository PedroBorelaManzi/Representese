-- Consolida as policies duplicadas (admin + owner, ambas FOR ALL) de
-- support_conversations e support_messages em uma policy por comando,
-- preservando exatamente a mesma permissão efetiva de antes. Resolve o aviso
-- "multiple_permissive_policies" do linter de segurança do Supabase (cada
-- comando reavaliava 2 policies PERMISSIVE por linha).
--
-- Aplicada em produção via MCP apply_migration (Caminho A, ver
-- supabase/migrations/README ou memória do projeto) em 2026-09-22. Este
-- arquivo é só documentação — a fonte de verdade é o banco.

-- support_conversations: admin (is_support_admin) OU dono (user_id = auth.uid())
drop policy if exists "support_conversations_admin" on public.support_conversations;
drop policy if exists "support_conversations_owner" on public.support_conversations;

create policy "support_conversations_select" on public.support_conversations
  for select using (
    is_support_admin((select auth.uid())) or (select auth.uid()) = user_id
  );

create policy "support_conversations_insert" on public.support_conversations
  for insert with check (
    is_support_admin((select auth.uid())) or (select auth.uid()) = user_id
  );

create policy "support_conversations_update" on public.support_conversations
  for update using (
    is_support_admin((select auth.uid())) or (select auth.uid()) = user_id
  ) with check (
    is_support_admin((select auth.uid())) or (select auth.uid()) = user_id
  );

create policy "support_conversations_delete" on public.support_conversations
  for delete using (
    is_support_admin((select auth.uid())) or (select auth.uid()) = user_id
  );

-- support_messages: mesma lógica, mas com_check diferente pra admin
-- (sender_id = si mesmo, sender_role = 'admin') vs dono (sender_id = si
-- mesmo, sender_role = 'user', mensagem pertence a uma conversa própria).
drop policy if exists "support_messages_admin" on public.support_messages;
drop policy if exists "support_messages_owner" on public.support_messages;

create policy "support_messages_select" on public.support_messages
  for select using (
    is_support_admin((select auth.uid()))
    or exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "support_messages_insert" on public.support_messages
  for insert with check (
    (is_support_admin((select auth.uid()))
      and sender_id = (select auth.uid())
      and sender_role = 'admin')
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

create policy "support_messages_update" on public.support_messages
  for update using (
    is_support_admin((select auth.uid()))
    or exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  ) with check (
    (is_support_admin((select auth.uid()))
      and sender_id = (select auth.uid())
      and sender_role = 'admin')
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

create policy "support_messages_delete" on public.support_messages
  for delete using (
    is_support_admin((select auth.uid()))
    or exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );
