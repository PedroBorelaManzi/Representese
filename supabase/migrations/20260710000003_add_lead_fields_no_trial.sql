-- Adiciona campos de telefone e empresa (segmento) na tabela user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS company text;

-- Adiciona na tabela billing_identities, caso seja onde salvamos telefone normatizado
-- Já existe phone_normalized na billing_identities, mas company não, e phone cru tbm não

-- Atualiza a trigger para NÃO dar trial gratuito (7 dias) e sim iniciar como 'inactive'
CREATE OR REPLACE FUNCTION public.handle_new_user_entitlement()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_entitlements (user_id, plan_id, subscription_status, trial_ends_at)
  VALUES (new.id, 'none', 'inactive', NULL)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Aproveita a trigger para inserir na user_settings os metadados
  INSERT INTO public.user_settings (user_id, email, phone, company)
  VALUES (
    new.id, 
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'company'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
