-- % de entrega do pedido: quanto do pedido foi de fato entregue.
-- Padrão 100 (entregue por completo); o representante ajusta pra baixo quando
-- a fábrica entrega parcial.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_pct smallint NOT NULL DEFAULT 100;

ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_pct_range
  CHECK (delivery_pct >= 0 AND delivery_pct <= 100);

COMMENT ON COLUMN public.orders.delivery_pct IS '% do pedido entregue (0-100). Default 100.';
