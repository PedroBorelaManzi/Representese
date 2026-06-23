-- Comissões: percentual que o representante ganha por empresa representada.
-- Formato: { "Empresa A": 5, "Empresa B": 7.5 } (percentual sobre o faturamento)
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS commissions JSONB DEFAULT '{}'::jsonb;
