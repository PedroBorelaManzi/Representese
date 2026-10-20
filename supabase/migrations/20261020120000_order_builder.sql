-- Criador de pedidos (Empresas & Pedidos › Novo pedido): o usuário monta o
-- pedido item a item, com desconto por item e/ou no pedido todo, impostos e
-- frete (em % ou R$). O PDF é gerado a qualquer momento a partir destes dados.
--
-- orders.pricing guarda só as ENTRADAS do usuário (modo + valor digitado de
-- desconto geral, impostos e frete); os totais são sempre recalculados a
-- partir dos itens (src/lib/orderBuilder.ts) — assim editar um item não deixa
-- número velho gravado. orders.value continua sendo o total final.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pricing jsonb;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2);
