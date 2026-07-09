-- 1. Adicionar coluna is_admin em user_settings
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Tornar os usuários existentes admins (ajuste útil para o dono do projeto no ambiente atual)
UPDATE public.user_settings SET is_admin = true;

-- 2. Criar tabela user_events para telemetria/analytics
CREATE TABLE IF NOT EXISTS public.user_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    route TEXT,
    duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Configurar Row Level Security (RLS)
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Usuários podem inserir seus próprios eventos
CREATE POLICY "Users can insert their own events" 
ON public.user_events 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Usuários podem ler seus próprios eventos
CREATE POLICY "Users can read own events" 
ON public.user_events 
FOR SELECT 
USING (auth.uid() = user_id);

-- Admins podem ler todos os eventos
CREATE POLICY "Admins can read all events" 
ON public.user_events 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.user_settings 
        WHERE user_settings.user_id = auth.uid() AND user_settings.is_admin = true
    )
);
