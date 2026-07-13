-- Auditoria 12/07/2026 — índices e hardening pontual.
--
-- 1. O linter apontou 8 foreign keys sem índice de cobertura. Sem eles,
--    deletar um cliente (ON DELETE) e os joins do relatório mensal fazem
--    seq-scan em appointments/visits/followups. IF NOT EXISTS torna a
--    migration idempotente.
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON public.appointments (client_id);
CREATE INDEX IF NOT EXISTS idx_client_bank_details_client_id ON public.client_bank_details (client_id);
CREATE INDEX IF NOT EXISTS idx_client_bank_details_user_id ON public.client_bank_details (user_id);
CREATE INDEX IF NOT EXISTS idx_client_followup_logs_client_id ON public.client_followup_logs (client_id);
CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies (user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id ON public.support_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON public.user_events (user_id);
CREATE INDEX IF NOT EXISTS idx_visits_client_id ON public.visits (client_id);

-- 2. orders tinha dois índices idênticos em user_id (idx_orders_user_id e
--    orders_user_id_idx) — o linter marcou idx_orders_user_id como nunca usado.
DROP INDEX IF EXISTS public.idx_orders_user_id;

-- 3. is_support_admin é SECURITY DEFINER e estava executável por anon via
--    /rest/v1/rpc — permitia sondar quem é admin sem estar logado. O papel
--    authenticated PRECISA manter EXECUTE (as políticas de RLS de
--    user_settings/user_entitlements/support_* chamam a função).
REVOKE EXECUTE ON FUNCTION public.is_support_admin(uuid) FROM anon;
