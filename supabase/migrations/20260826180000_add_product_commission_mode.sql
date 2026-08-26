-- Comissão por produto (opcional, por empresa): algumas fábricas pagam um %
-- fixo sobre tudo (comportamento de hoje), outras variam o % por produto.
-- commission_mode: { "Cozimax": "fixed" | "per_product" } — ausente = "fixed"
-- (nenhuma empresa existente muda de comportamento com esta migração).
-- product_commissions: { "Empresa::chave_do_produto": 8.5 } — mesma chave de
-- agrupamento já usada em productAnalytics.ts (aggregateProductRanking),
-- "chave_do_produto" = normalizar(nome_do_produto) de src/lib/orderExtractionCore.ts.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS commission_mode jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS product_commissions jsonb NOT NULL DEFAULT '{}'::jsonb;
