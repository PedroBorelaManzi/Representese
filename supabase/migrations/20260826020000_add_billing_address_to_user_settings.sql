-- Endereço coletado no Checkout (passo "Confirme seus dados"), pra ficar
-- disponível na aba CRM & Leads do admin, junto do resto dos dados de quem
-- assinou. Prefixo "billing_" pra não colidir com weather_city/weather_state
-- (cidade usada só pra previsão do tempo, propósito totalmente diferente).
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS billing_cep TEXT,
  ADD COLUMN IF NOT EXISTS billing_street TEXT,
  ADD COLUMN IF NOT EXISTS billing_number TEXT,
  ADD COLUMN IF NOT EXISTS billing_complement TEXT,
  ADD COLUMN IF NOT EXISTS billing_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_state TEXT;
