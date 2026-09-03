-- Nome fantasia do cliente (vem da BrasilAPI junto com a razão social).
-- `name` continua sendo a razão social (usada pra casar com a NF); o nome
-- fantasia é o "apelido comercial" que o representante usa no dia a dia.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS nome_fantasia text;

COMMENT ON COLUMN public.clients.nome_fantasia IS 'Nome fantasia / apelido comercial (BrasilAPI). name = razão social.';
