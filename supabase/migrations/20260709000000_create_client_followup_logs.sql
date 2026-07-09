-- Histórico de follow-ups: cada linha é um contato registrado manualmente pelo
-- representante (ligação, e-mail, WhatsApp, visita). Ao registrar, o app também
-- atualiza clients.last_contact — esta tabela guarda o detalhe (método, notas,
-- resultado, próxima data sugerida) que last_contact sozinho não captura.
CREATE TABLE IF NOT EXISTS public.client_followup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'call',
  notes text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'pending',
  next_followup date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_followup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "followup_logs_select_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_select_own" ON public.client_followup_logs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "followup_logs_insert_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_insert_own" ON public.client_followup_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "followup_logs_update_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_update_own" ON public.client_followup_logs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "followup_logs_delete_own" ON public.client_followup_logs;
CREATE POLICY "followup_logs_delete_own" ON public.client_followup_logs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_followup_logs_client ON public.client_followup_logs(user_id, client_id, created_at DESC);
