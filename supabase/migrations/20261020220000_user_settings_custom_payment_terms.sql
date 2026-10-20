-- Condições de pagamento que o usuário digita no Novo pedido ficam salvas
-- aqui e aparecem na lista nas próximas vezes.
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS custom_payment_terms jsonb NOT NULL DEFAULT '[]'::jsonb;
