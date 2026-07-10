-- Blindagem do flag is_admin (user_settings) contra escalação de privilégio.
--
-- Contexto: a política de UPDATE em user_settings deixa o usuário escrever a
-- própria linha INTEIRA — incluindo is_admin. Sem proteção, qualquer assinante
-- vira admin com uma chamada REST e passa a ler a telemetria e os leads de
-- todos (as políticas de user_events/landing_events e o painel Admin confiam
-- nesse flag). A fonte de verdade de quem é admin é a tabela support_admins,
-- que o cliente não consegue escrever.

-- 1. Trigger: cliente logado não altera is_admin. Só bloqueamos quando existe
--    um usuário autenticado de verdade na requisição (auth.uid() IS NOT NULL) —
--    migração/superusuário e service_role não têm auth.uid() e passam livres,
--    senão o próprio UPDATE de correção de dados abaixo seria revertido.
--    Coerção silenciosa em vez de exceção: o app salva a linha inteira das
--    configurações e não pode quebrar num save normal.
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

DROP TRIGGER IF EXISTS trg_protect_is_admin ON public.user_settings;
CREATE TRIGGER trg_protect_is_admin
BEFORE INSERT OR UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.protect_is_admin();

-- 2. Corrige os dados: a migração anterior marcou TODOS os usuários como
--    admin (UPDATE sem WHERE). Admin de verdade é quem está em support_admins.
UPDATE public.user_settings us
SET is_admin = EXISTS (
  SELECT 1 FROM public.support_admins sa WHERE sa.user_id = us.user_id
);

-- 3. Admins leem todas as linhas de user_settings — sem isso a aba CRM do
--    painel Admin Analytics recebia só a própria linha (RLS filtrava em
--    silêncio) e a lista de leads mostrava apenas o próprio admin.
DROP POLICY IF EXISTS "Admins can read all settings" ON public.user_settings;
CREATE POLICY "Admins can read all settings"
ON public.user_settings FOR SELECT
USING (public.is_support_admin(auth.uid()));
