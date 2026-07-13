-- Higienização de RLS (auditoria 12/07/2026) — dois problemas apontados pelo
-- linter oficial do Supabase (262 achados de performance):
--
-- 1. multiple_permissive_policies: várias tabelas tinham políticas EXATAMENTE
--    duplicadas (ex.: clients tinha "Isolamento de Clientes" FOR ALL e mais 4
--    políticas por comando com a mesma expressão). Toda query avaliava as duas.
--    Aqui removemos as redundantes, mantendo uma política canônica por escopo.
--    Políticas duplas LEGÍTIMAS (dono + admin, ex. user_settings) são mantidas.
--
-- 2. auth_rls_initplan: auth.uid() sem SELECT é reavaliado POR LINHA. Com
--    (select auth.uid()) o Postgres avalia uma única vez por query (InitPlan).
--    Reescrevemos todas as políticas mantidas com essa forma.
--
-- Semântica de acesso INALTERADA — só remoção de duplicatas e otimização.

-- ==== ai_chats ====
DROP POLICY IF EXISTS "Users can insert their own chats" ON public.ai_chats;
CREATE POLICY "Users can insert their own chats" ON public.ai_chats
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can view their own chats" ON public.ai_chats;
CREATE POLICY "Users can view their own chats" ON public.ai_chats
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ==== appointments (duplicata: "Users can manage their own appointments") ====
DROP POLICY IF EXISTS "Users can manage their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Isolamento de Compromissos" ON public.appointments;
CREATE POLICY "Isolamento de Compromissos" ON public.appointments
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ==== audit_logs (duplicatas: "System can insert..." e "Users can only view...") ====
DROP POLICY IF EXISTS "System can insert logs for users" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can only view their own logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Isolamento de Logs (Apenas Inserção)" ON public.audit_logs;
CREATE POLICY "Isolamento de Logs (Apenas Inserção)" ON public.audit_logs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Isolamento de Logs (Leitura)" ON public.audit_logs;
CREATE POLICY "Isolamento de Logs (Leitura)" ON public.audit_logs
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ==== city_coords ====
DROP POLICY IF EXISTS "Authenticated can insert city_coords" ON public.city_coords;
CREATE POLICY "Authenticated can insert city_coords" ON public.city_coords
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');

-- ==== client_bank_details ====
DROP POLICY IF EXISTS "Users can only manage their own client bank details" ON public.client_bank_details;
CREATE POLICY "Users can only manage their own client bank details" ON public.client_bank_details
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ==== client_followup_logs ====
DROP POLICY IF EXISTS "followup_logs_select_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_select_own" ON public.client_followup_logs
  FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "followup_logs_insert_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_insert_own" ON public.client_followup_logs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "followup_logs_update_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_update_own" ON public.client_followup_logs
  FOR UPDATE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "followup_logs_delete_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_delete_own" ON public.client_followup_logs
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ==== client_location_audit ====
DROP POLICY IF EXISTS "Users can insert own client audits" ON public.client_location_audit;
CREATE POLICY "Users can insert own client audits" ON public.client_location_audit
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_location_audit.client_id AND c.user_id = (select auth.uid())
  ));
DROP POLICY IF EXISTS "Users can view own client audits" ON public.client_location_audit;
CREATE POLICY "Users can view own client audits" ON public.client_location_audit
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_location_audit.client_id AND c.user_id = (select auth.uid())
  ));

-- ==== clients (4 duplicatas por comando; a FOR ALL cobre tudo) ====
DROP POLICY IF EXISTS "Users can only view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can only insert their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can only update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can only delete their own clients" ON public.clients;
DROP POLICY IF EXISTS "Isolamento de Clientes" ON public.clients;
CREATE POLICY "Isolamento de Clientes" ON public.clients
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ==== companies ====
DROP POLICY IF EXISTS "Users can manage their own companies" ON public.companies;
CREATE POLICY "Users can manage their own companies" ON public.companies
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ==== daily_notes (4 duplicatas por comando) ====
DROP POLICY IF EXISTS "Users can view their own notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Users can insert their own notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Isolamento de Notas" ON public.daily_notes;
CREATE POLICY "Isolamento de Notas" ON public.daily_notes
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ==== landing_events (INSERT público de telemetria fica como está) ====
DROP POLICY IF EXISTS "Admins can read landing events" ON public.landing_events;
CREATE POLICY "Admins can read landing events" ON public.landing_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_settings
    WHERE user_settings.user_id = (select auth.uid()) AND user_settings.is_admin = true
  ));

-- ==== leaderboard ====
DROP POLICY IF EXISTS "lb_insert_own" ON public.leaderboard;
CREATE POLICY "lb_insert_own" ON public.leaderboard
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "lb_update_own" ON public.leaderboard;
CREATE POLICY "lb_update_own" ON public.leaderboard
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "lb_delete_own" ON public.leaderboard;
CREATE POLICY "lb_delete_own" ON public.leaderboard
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ==== orders (4 duplicatas por comando) ====
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete their own orders" ON public.orders;
DROP POLICY IF EXISTS "Isolamento de Pedidos" ON public.orders;
CREATE POLICY "Isolamento de Pedidos" ON public.orders
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ==== support_admins ====
DROP POLICY IF EXISTS "support_admins_select_self_or_admin" ON public.support_admins;
CREATE POLICY "support_admins_select_self_or_admin" ON public.support_admins
  FOR SELECT USING ((select auth.uid()) = user_id OR public.is_support_admin((select auth.uid())));

-- ==== support_conversations (dono + admin: duas políticas legítimas) ====
DROP POLICY IF EXISTS "support_conversations_owner" ON public.support_conversations;
CREATE POLICY "support_conversations_owner" ON public.support_conversations
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "support_conversations_admin" ON public.support_conversations;
CREATE POLICY "support_conversations_admin" ON public.support_conversations
  FOR ALL USING (public.is_support_admin((select auth.uid())))
  WITH CHECK (public.is_support_admin((select auth.uid())));

-- ==== support_messages (dono + admin) ====
DROP POLICY IF EXISTS "support_messages_owner" ON public.support_messages;
CREATE POLICY "support_messages_owner" ON public.support_messages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = support_messages.conversation_id AND c.user_id = (select auth.uid())
  )) WITH CHECK (
    sender_id = (select auth.uid()) AND sender_role = 'user'
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = support_messages.conversation_id AND c.user_id = (select auth.uid())
    )
  );
DROP POLICY IF EXISTS "support_messages_admin" ON public.support_messages;
CREATE POLICY "support_messages_admin" ON public.support_messages
  FOR ALL USING (public.is_support_admin((select auth.uid())))
  WITH CHECK (
    public.is_support_admin((select auth.uid()))
    AND sender_id = (select auth.uid()) AND sender_role = 'admin'
  );

-- ==== user_email_tokens (SELECT redundante com a FOR ALL) ====
DROP POLICY IF EXISTS "Usuários podem ver seus próprios tokens de e-mail" ON public.user_email_tokens;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios tokens de e-mail" ON public.user_email_tokens;
CREATE POLICY "Usuários podem atualizar seus próprios tokens de e-mail" ON public.user_email_tokens
  FOR ALL USING ((select auth.uid()) = user_id);

-- ==== user_entitlements (dono + admin) ====
DROP POLICY IF EXISTS "owner can read entitlements" ON public.user_entitlements;
CREATE POLICY "owner can read entitlements" ON public.user_entitlements
  FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Admins can read all entitlements" ON public.user_entitlements;
CREATE POLICY "Admins can read all entitlements" ON public.user_entitlements
  FOR SELECT USING (public.is_support_admin((select auth.uid())));

-- ==== user_events (dono insere/lê + admin lê tudo) ====
DROP POLICY IF EXISTS "Users can insert their own events" ON public.user_events;
CREATE POLICY "Users can insert their own events" ON public.user_events
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can read own events" ON public.user_events;
CREATE POLICY "Users can read own events" ON public.user_events
  FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Admins can read all events" ON public.user_events;
CREATE POLICY "Admins can read all events" ON public.user_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_settings
    WHERE user_settings.user_id = (select auth.uid()) AND user_settings.is_admin = true
  ));

-- ==== user_google_tokens ====
DROP POLICY IF EXISTS "Users can only see their own google tokens" ON public.user_google_tokens;
CREATE POLICY "Users can only see their own google tokens" ON public.user_google_tokens
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can only insert their own google tokens" ON public.user_google_tokens;
CREATE POLICY "Users can only insert their own google tokens" ON public.user_google_tokens
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can only update their own google tokens" ON public.user_google_tokens;
CREATE POLICY "Users can only update their own google tokens" ON public.user_google_tokens
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id);

-- ==== user_settings (3 duplicatas por comando; mantém dono ALL + admin SELECT) ====
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Isolamento de Configurações" ON public.user_settings;
CREATE POLICY "Isolamento de Configurações" ON public.user_settings
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "Admins can read all settings" ON public.user_settings;
CREATE POLICY "Admins can read all settings" ON public.user_settings
  FOR SELECT USING (public.is_support_admin((select auth.uid())));

-- ==== visits ====
DROP POLICY IF EXISTS "visits_select_own" ON public.visits;
CREATE POLICY "visits_select_own" ON public.visits
  FOR SELECT USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "visits_insert_own" ON public.visits;
CREATE POLICY "visits_insert_own" ON public.visits
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "visits_update_own" ON public.visits;
CREATE POLICY "visits_update_own" ON public.visits
  FOR UPDATE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "visits_delete_own" ON public.visits;
CREATE POLICY "visits_delete_own" ON public.visits
  FOR DELETE USING ((select auth.uid()) = user_id);
