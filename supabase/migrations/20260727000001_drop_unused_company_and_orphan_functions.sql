-- Limpeza de itens não usados encontrados numa varredura geral:

-- 1. Coluna "company" em user_settings: nada mais grava nela (Register.tsx não coleta mais
--    esse campo, e o Checkout nunca enviou) e nenhuma tela do app a exibe.
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS company;

CREATE OR REPLACE FUNCTION public.handle_new_user_entitlement()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_entitlements (user_id, plan_id, subscription_status, trial_ends_at)
  VALUES (new.id, 'none', 'inactive', NULL)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_settings (user_id, email, phone)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Functions órfãs (criadas fora de migration, sem nenhuma chamada em src/, supabase/functions/ ou api/):
--    check_cpf_phone_exists foi substituída pelo bloqueio via trigger de billing_identities no signUp.
--    list_user_files nunca chegou a ser usada; a listagem de arquivos hoje é via storage.from('client_vault') direto.
DROP FUNCTION IF EXISTS public.check_cpf_phone_exists(text, text);
DROP FUNCTION IF EXISTS public.list_user_files(uuid);
