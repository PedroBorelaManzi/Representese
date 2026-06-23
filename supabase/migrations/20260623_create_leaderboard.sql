-- Ranking anônimo (gamificação): cada usuário publica SÓ um apelido + dois
-- percentuais (clientes inativos e clientes visitados). Nenhum dado bruto
-- (clientes, faturamento, nomes reais) sai do dono. Opt-in = existir a linha.
CREATE TABLE IF NOT EXISTS public.leaderboard (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  apelido text NOT NULL,
  total_clients int NOT NULL DEFAULT 0,
  pct_inativos numeric NOT NULL DEFAULT 0,
  pct_visitados numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lb_select_all" ON public.leaderboard;
CREATE POLICY "lb_select_all" ON public.leaderboard FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lb_insert_own" ON public.leaderboard;
CREATE POLICY "lb_insert_own" ON public.leaderboard FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "lb_update_own" ON public.leaderboard;
CREATE POLICY "lb_update_own" ON public.leaderboard FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "lb_delete_own" ON public.leaderboard;
CREATE POLICY "lb_delete_own" ON public.leaderboard FOR DELETE TO authenticated USING (auth.uid() = user_id);
