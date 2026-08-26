-- Meta mensal por empresa (gráfico "Faturamento por empresa" do Início) —
-- substitui o antigo revenue_ceiling (um teto único pra todo o gráfico,
-- coluna mantida no banco por segurança mas não lida mais pelo app) por uma
-- meta configurável empresa a empresa, mesmo padrão de commissions/
-- delivery_lead_days.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS monthly_goals jsonb NOT NULL DEFAULT '{}'::jsonb;
