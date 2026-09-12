-- Sistema de captura automática de pedidos das empresas representadas
-- (e-mail agora, Drive depois). Registro global de empresa por CNPJ (não por
-- vendedor — ver public.companies, tabela morta sem relação com esta),
-- vínculo N:N com representantes, resolução permanente de cliente ambíguo
-- entre vendedores da mesma representada, e fila/auditoria dos pedidos
-- capturados.

-- Checa se o usuário é admin da plataforma (Pedro), reaproveitando o mesmo
-- flag que já protege /dashboard/admin/analytics (user_settings.is_admin).
-- SECURITY DEFINER pelo mesmo motivo de is_support_admin: evita recursão de
-- RLS quando alguma policy precisar consultar isso.
CREATE OR REPLACE FUNCTION public.is_platform_admin(uid uuid)
RETURNS boolean AS $$
  SELECT COALESCE((SELECT is_admin FROM public.user_settings WHERE user_id = uid), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE TABLE IF NOT EXISTS public.represented_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    nome_fantasia TEXT,
    city TEXT,
    state TEXT,
    -- contato+{slug}@representese.com recebe os pedidos desta empresa por
    -- e-mail (plus-addressing — uma caixa só, sem conta nova por empresa).
    -- Único mesmo depois de arquivada: nunca reciclar um endereço que a
    -- empresa já pode ter salvo no email dela.
    intake_email_slug TEXT NOT NULL UNIQUE,
    drive_folder_id TEXT,
    drive_folder_link TEXT,
    drive_status TEXT NOT NULL DEFAULT 'not_configured'
        CHECK (drive_status IN ('not_configured', 'pending', 'active', 'error')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_represented_companies_cnpj ON public.represented_companies (cnpj);

DROP TRIGGER IF EXISTS set_updated_at ON public.represented_companies;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.represented_companies
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Vínculo N:N: quais representantes vendem para qual empresa representada.
-- category_name é a grafia exata que ESTE vendedor usa em
-- user_settings.categories pra essa empresa — cada vendedor pode ter
-- nomeado a categoria de um jeito levemente diferente, e é esse nome que vai
-- em orders.category quando um pedido capturado automaticamente é lançado
-- pra ele.
CREATE TABLE IF NOT EXISTS public.company_reps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.represented_companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_reps_user ON public.company_reps (user_id);
CREATE INDEX IF NOT EXISTS idx_company_reps_company ON public.company_reps (company_id);

-- Resolução permanente de cliente ambíguo: quando dois vendedores da MESMA
-- empresa representada têm o mesmo CNPJ de cliente cadastrado (ex.: dois
-- representantes da Cosimax que atendem o mesmo depósito), um admin escolhe
-- uma vez só quem fica com aquele cliente NESSA empresa, e todo pedido
-- futuro daquele CNPJ cai direto pro vendedor certo sem perguntar de novo.
CREATE TABLE IF NOT EXISTS public.company_client_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.represented_companies(id) ON DELETE CASCADE,
    client_cnpj TEXT NOT NULL,
    resolved_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, client_cnpj)
);

-- Fila/auditoria de tudo que chegou pelos canais automáticos. A maioria dos
-- pedidos passa reto por aqui e já nasce "imported" (order_id preenchido);
-- só fica pendente de verdade quando o cliente é ambíguo entre vendedores ou
-- não é encontrado em cadastro nenhum.
CREATE TABLE IF NOT EXISTS public.incoming_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.represented_companies(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('email', 'drive')),
    -- Identificador da origem (Message-Id do e-mail, id do arquivo no Drive)
    -- — usado só pra idempotência (não reprocessar o mesmo pedido 2x).
    source_ref TEXT NOT NULL,
    raw_file_name TEXT,
    raw_file_path TEXT,
    extracted JSONB,
    matched_client_cnpj TEXT,
    status TEXT NOT NULL DEFAULT 'pending_match'
        CHECK (status IN ('pending_match', 'ambiguous', 'assigned', 'imported', 'no_match', 'error')),
    assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, source, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_incoming_orders_company ON public.incoming_orders (company_id);
CREATE INDEX IF NOT EXISTS idx_incoming_orders_status ON public.incoming_orders (status);

DROP TRIGGER IF EXISTS set_updated_at ON public.incoming_orders;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.incoming_orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.represented_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_client_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incoming_orders ENABLE ROW LEVEL SECURITY;

-- represented_companies: só o admin (Pedro) enxerga a lista completa,
-- inclusive o link do Drive — o representante NUNCA acessa esta tabela
-- direto; toda interação dele passa pelas funções abaixo (SECURITY DEFINER).
DROP POLICY IF EXISTS "Admin gerencia empresas representadas" ON public.represented_companies;
CREATE POLICY "Admin gerencia empresas representadas"
ON public.represented_companies FOR ALL
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- company_reps: o vendedor pode ver SÓ os próprios vínculos (pra saber quais
-- das suas empresas já têm captura automática ativa) — nunca os de outro
-- vendedor. Escrita só pelo admin ou pelas funções abaixo.
DROP POLICY IF EXISTS "Vendedor ve os proprios vinculos" ON public.company_reps;
CREATE POLICY "Vendedor ve os proprios vinculos"
ON public.company_reps FOR SELECT
USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia vinculos" ON public.company_reps;
CREATE POLICY "Admin gerencia vinculos"
ON public.company_reps FOR ALL
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- company_client_resolutions e incoming_orders: só o admin — é um mecanismo
-- interno de roteamento; o vendedor não precisa (o pedido já resolvido
-- aparece pra ele como uma linha normal em `orders`).
DROP POLICY IF EXISTS "Admin gerencia resolucoes de cliente" ON public.company_client_resolutions;
CREATE POLICY "Admin gerencia resolucoes de cliente"
ON public.company_client_resolutions FOR ALL
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin ve fila de pedidos capturados" ON public.incoming_orders;
CREATE POLICY "Admin ve fila de pedidos capturados"
ON public.incoming_orders FOR SELECT
USING (public.is_platform_admin(auth.uid()));

-- ─────────────────── Funções chamadas pelo representante ───────────────────

-- Procura uma empresa representada pelo CNPJ, sem criar nada — usado pra
-- mostrar a confirmação ("já existe, é essa mesma?") ANTES de vincular.
-- SECURITY DEFINER: o representante comum não tem SELECT direto em
-- represented_companies (RLS é admin-only), mas pode chamar esta função, que
-- devolve só os campos de identidade — nunca o link do Drive, de propósito.
CREATE OR REPLACE FUNCTION public.find_represented_company(p_cnpj TEXT)
RETURNS TABLE (id UUID, cnpj TEXT, name TEXT, nome_fantasia TEXT, city TEXT, state TEXT) AS $$
DECLARE
  v_cnpj TEXT := regexp_replace(COALESCE(p_cnpj, ''), '\D', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF length(v_cnpj) <> 14 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT rc.id, rc.cnpj, rc.name, rc.nome_fantasia, rc.city, rc.state
    FROM public.represented_companies rc
    WHERE rc.cnpj = v_cnpj;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.find_represented_company(TEXT) TO authenticated;

-- Vincula o representante autenticado a uma empresa representada já
-- existente (fluxo de confirmação: "sim, é essa mesma empresa"). Idempotente
-- — reenviar não duplica, só atualiza o nome de categoria se ele mudou.
CREATE OR REPLACE FUNCTION public.link_rep_to_company(p_company_id UUID, p_category_name TEXT)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.represented_companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;

  INSERT INTO public.company_reps (company_id, user_id, category_name)
  VALUES (p_company_id, v_uid, COALESCE(NULLIF(trim(p_category_name), ''), 'Empresa'))
  ON CONFLICT (company_id, user_id) DO UPDATE SET category_name = EXCLUDED.category_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.link_rep_to_company(UUID, TEXT) TO authenticated;

-- Cria uma empresa representada NOVA (CNPJ ainda não cadastrado por
-- ninguém) e já vincula o representante autenticado a ela. p_base_slug já
-- vem pré-calculado do app (nome normalizado, sem acento/pontuação); esta
-- função só garante que o slug final é único, acrescentando um sufixo
-- numérico em caso de colisão (duas empresas de nome comercial igual).
CREATE OR REPLACE FUNCTION public.create_represented_company(
  p_cnpj TEXT,
  p_name TEXT,
  p_nome_fantasia TEXT,
  p_city TEXT,
  p_state TEXT,
  p_base_slug TEXT,
  p_category_name TEXT
)
RETURNS TABLE (id UUID, cnpj TEXT, name TEXT, nome_fantasia TEXT, city TEXT, state TEXT, intake_email_slug TEXT) AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cnpj TEXT := regexp_replace(COALESCE(p_cnpj, ''), '\D', '', 'g');
  v_base_slug TEXT := NULLIF(regexp_replace(lower(COALESCE(p_base_slug, '')), '[^a-z0-9-]', '', 'g'), '');
  v_slug TEXT;
  v_suffix INT := 1;
  v_company_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF length(v_cnpj) <> 14 THEN
    RAISE EXCEPTION 'CNPJ inválido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.represented_companies WHERE cnpj = v_cnpj) THEN
    RAISE EXCEPTION 'Esta empresa já está cadastrada';
  END IF;

  v_slug := COALESCE(v_base_slug, 'empresa');
  WHILE EXISTS (SELECT 1 FROM public.represented_companies WHERE intake_email_slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := COALESCE(v_base_slug, 'empresa') || '-' || v_suffix;
  END LOOP;

  BEGIN
    INSERT INTO public.represented_companies (cnpj, name, nome_fantasia, city, state, intake_email_slug, created_by)
    VALUES (
      v_cnpj,
      COALESCE(NULLIF(trim(p_name), ''), 'Empresa sem nome'),
      NULLIF(trim(p_nome_fantasia), ''),
      NULLIF(trim(p_city), ''),
      NULLIF(trim(p_state), ''),
      v_slug,
      v_uid
    )
    RETURNING represented_companies.id INTO v_company_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta empresa já está cadastrada';
  END;

  INSERT INTO public.company_reps (company_id, user_id, category_name)
  VALUES (v_company_id, v_uid, COALESCE(NULLIF(trim(p_category_name), ''), 'Empresa'));

  RETURN QUERY
    SELECT rc.id, rc.cnpj, rc.name, rc.nome_fantasia, rc.city, rc.state, rc.intake_email_slug
    FROM public.represented_companies rc WHERE rc.id = v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_represented_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- O advisor de segurança do Supabase aponta (corretamente) que funções
-- SECURITY DEFINER ficam executáveis por PUBLIC por padrão, incluindo o
-- papel "anon" (visitante sem login) — elas já se protegem checando
-- auth.uid() IS NULL, mas não faz sentido nenhum deixar a superfície
-- exposta a quem nem logou. Revoga o grant implícito de PUBLIC.
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_represented_company(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_rep_to_company(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_represented_company(text, text, text, text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_represented_company(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_rep_to_company(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_represented_company(text, text, text, text, text, text, text) TO authenticated;

-- Bucket privado só pra guardar o arquivo bruto de um pedido capturado por
-- e-mail/Drive ENQUANTO ele está pendente (ambíguo ou sem cliente
-- encontrado) — path: {company_id}/{source}_{source_ref}/{fileName}. Assim
-- que o admin resolve e o pedido vira uma linha de verdade em `orders`, o
-- arquivo é copiado pro client_vault (na estrutura userId/clientId/fileName,
-- que não pode mudar) e apagado daqui. Nunca é acessado pelo navegador do
-- representante — só pela function/admin, via service role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company_intake_staging', 'company_intake_staging', false, 26214400,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Só o admin (Pedro) pode ler/gerenciar pela API — a Edge Function grava
-- com a service role, que ignora RLS de qualquer forma.
DROP POLICY IF EXISTS "Admin acessa staging de pedidos capturados" ON storage.objects;
CREATE POLICY "Admin acessa staging de pedidos capturados"
ON storage.objects FOR ALL
USING (bucket_id = 'company_intake_staging' AND public.is_platform_admin(auth.uid()))
WITH CHECK (bucket_id = 'company_intake_staging' AND public.is_platform_admin(auth.uid()));
