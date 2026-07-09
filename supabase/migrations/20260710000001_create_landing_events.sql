-- 1. Criar tabela landing_events para telemetria/analytics anônimo na landing page
CREATE TABLE IF NOT EXISTS public.landing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    section_id TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Configurar Row Level Security (RLS)
ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;

-- Visitantes anônimos e usuários podem inserir eventos livremente
CREATE POLICY "Anyone can insert landing events" 
ON public.landing_events 
FOR INSERT 
WITH CHECK (true);

-- Apenas admins podem ler os eventos da landing page
CREATE POLICY "Admins can read landing events" 
ON public.landing_events 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.user_settings 
        WHERE user_settings.user_id = auth.uid() AND user_settings.is_admin = true
    )
);
