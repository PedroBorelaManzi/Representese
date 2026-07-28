-- Tabela de leads: captura simples (nome, e-mail, telefone) antes de ver os planos.
-- Substitui o antigo fluxo de cadastro com senha na tela /register.
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    company TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- E-mail sempre normalizado (lowercase) na aplicação antes de gravar; constraint direta permite ON CONFLICT (email) no upsert
ALTER TABLE public.leads ADD CONSTRAINT leads_email_unique UNIQUE (email);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Qualquer visitante (chave anônima) pode registrar seu contato
CREATE POLICY "Anyone can insert leads"
ON public.leads
FOR INSERT
WITH CHECK (true);

-- Permite atualizar o próprio registro em caso de reenvio (upsert por e-mail)
CREATE POLICY "Anyone can upsert leads"
ON public.leads
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Apenas admins podem listar os leads capturados
CREATE POLICY "Admins can read leads"
ON public.leads
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_settings
        WHERE user_settings.user_id = auth.uid() AND user_settings.is_admin = true
    )
);

-- Upsert via função SECURITY DEFINER: evita expor SELECT/UPDATE de "leads" a anônimos
-- (ON CONFLICT exige visibilidade da linha, que a RLS de SELECT bloquearia para o anon).
CREATE OR REPLACE FUNCTION public.upsert_lead(p_name TEXT, p_email TEXT, p_phone TEXT, p_company TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO public.leads (name, email, phone, company)
  VALUES (p_name, lower(p_email), p_phone, NULLIF(p_company, ''))
  ON CONFLICT (email) DO UPDATE
  SET name = EXCLUDED.name, phone = EXCLUDED.phone, company = COALESCE(EXCLUDED.company, public.leads.company), updated_at = timezone('utc'::text, now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.upsert_lead(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
