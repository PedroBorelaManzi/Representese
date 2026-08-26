-- Observações livres por pedido — visíveis direto no card, sem precisar abrir.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notes text;
