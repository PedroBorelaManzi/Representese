-- Visitas / roteiro do dia: cada linha é um cliente programado para uma data,
-- com status (planned | visited | skipped). Visita confirmada atualiza
-- clients.last_contact e conta para o ranking de visitas (gamificação).
CREATE TABLE IF NOT EXISTS public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  planned_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'planned',
  visited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visits_select_own" ON public.visits;
CREATE POLICY "visits_select_own" ON public.visits FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "visits_insert_own" ON public.visits;
CREATE POLICY "visits_insert_own" ON public.visits FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "visits_update_own" ON public.visits;
CREATE POLICY "visits_update_own" ON public.visits FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "visits_delete_own" ON public.visits;
CREATE POLICY "visits_delete_own" ON public.visits FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_visits_user_date ON public.visits(user_id, planned_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_visit_client_day ON public.visits(user_id, client_id, planned_date);
