-- Logo da representação (data URL já redimensionada no app) — aparece no
-- cabeçalho do PDF do pedido (src/lib/orderPdf.ts).
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS logo_url text;
