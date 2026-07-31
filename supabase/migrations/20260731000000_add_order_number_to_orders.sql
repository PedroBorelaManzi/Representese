-- Suporte à importação de relatórios de pedidos das fábricas (PDF).
-- order_number: número do pedido no relatório da representada — é o que permite
-- reimportar o mesmo relatório sem duplicar lançamentos.
-- source: de onde veio o pedido ('manual' = upload de arquivo único, 'report_import' = relatório).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

-- O número do pedido é único dentro de uma representada (duas fábricas podem
-- usar a mesma numeração), por isso a chave é user + category + order_number.
-- Índice NÃO parcial de propósito: o Postgres não consegue inferir índice
-- parcial num ON CONFLICT, e como NULL é sempre distinto de NULL, os pedidos
-- lançados manualmente (order_number nulo) continuam livres de restrição.
CREATE UNIQUE INDEX IF NOT EXISTS orders_user_category_order_number_uniq
  ON public.orders (user_id, category, order_number);
