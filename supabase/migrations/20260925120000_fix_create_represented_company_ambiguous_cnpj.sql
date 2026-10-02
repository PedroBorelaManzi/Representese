-- create_represented_company falhava com 'column reference "cnpj" is ambiguous':
-- RETURNS TABLE(id, cnpj, ..., intake_email_slug) cria variáveis de saída com o
-- mesmo nome das colunas, e os EXISTS sem alias (WHERE cnpj = ..., WHERE
-- intake_email_slug = ...) ficavam ambíguos. Só qualifica as colunas com alias —
-- comportamento idêntico. CREATE OR REPLACE preserva os GRANTs existentes.
CREATE OR REPLACE FUNCTION public.create_represented_company(
  p_cnpj text, p_name text, p_nome_fantasia text, p_city text, p_state text,
  p_base_slug text, p_category_name text
)
RETURNS TABLE(id uuid, cnpj text, name text, nome_fantasia text, city text, state text, intake_email_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF EXISTS (SELECT 1 FROM public.represented_companies rc0 WHERE rc0.cnpj = v_cnpj) THEN
    RAISE EXCEPTION 'Esta empresa já está cadastrada';
  END IF;

  v_slug := COALESCE(v_base_slug, 'empresa');
  WHILE EXISTS (SELECT 1 FROM public.represented_companies rc1 WHERE rc1.intake_email_slug = v_slug) LOOP
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
$function$;
