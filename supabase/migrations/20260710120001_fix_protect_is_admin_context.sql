-- Correção do trigger protect_is_admin.
--
-- A primeira versão (migração anterior) bloqueava quando
-- auth.role() <> 'service_role'. Mas numa MIGRAÇÃO auth.role() é NULL
-- (não é 'service_role'), então o trigger revertia até o UPDATE de correção
-- de dados da própria migração — deixando usuários que já estavam marcados
-- como admin (pela migração sem WHERE do Antigravity) presos em is_admin=true.
--
-- Régua correta: só bloquear quando existe um usuário autenticado de verdade
-- na requisição (auth.uid() IS NOT NULL). Migração/superusuário e service_role
-- não têm auth.uid(), então passam livres; cliente logado é barrado.
CREATE OR REPLACE FUNCTION public.protect_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    IF TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      NEW.is_admin := OLD.is_admin;
    ELSIF TG_OP = 'INSERT' THEN
      NEW.is_admin := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-executa a correção de dados agora que o trigger não sabota mais.
UPDATE public.user_settings us
SET is_admin = EXISTS (
  SELECT 1 FROM public.support_admins sa WHERE sa.user_id = us.user_id
);
