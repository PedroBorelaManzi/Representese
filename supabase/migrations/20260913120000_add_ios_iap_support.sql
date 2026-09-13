-- Suporte a In-App Purchase no iOS (resolve rejeição Apple Guideline 3.1.1).
-- A perna de IAP usa RevenueCat como intermediário — este webhook precisa
-- saber, por usuário, se a assinatura ativa veio do Asaas (site/Android) ou
-- de uma compra via App Store, pra UI decidir "gerenciar no app" vs
-- "gerenciar no site" (ver subscription_provider em SettingsContext.tsx).
ALTER TABLE public.user_entitlements
  ADD COLUMN IF NOT EXISTS subscription_provider TEXT NOT NULL DEFAULT 'asaas',
  ADD COLUMN IF NOT EXISTS iap_app_user_id TEXT,
  ADD COLUMN IF NOT EXISTS iap_original_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_entitlements_iap_original_txn_idx
  ON public.user_entitlements (iap_original_transaction_id)
  WHERE iap_original_transaction_id IS NOT NULL;

-- Idempotência do webhook do RevenueCat — mesmo padrão de asaas_webhook_events,
-- em tabela separada pra não misturar os dois processadores de pagamento.
CREATE TABLE IF NOT EXISTS public.iap_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.iap_webhook_events ENABLE ROW LEVEL SECURITY;
