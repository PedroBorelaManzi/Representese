-- Produtos de cada pedido, pra área de Produtos (unidades vendidas por
-- representada, ao longo do tempo). Escrito uma vez junto com o pedido
-- (src/lib/orderItems.ts) — sem edição depois; apagado em cascata quando o
-- pedido é apagado.
--
-- category e order_date são desnormalizados (já existem em orders) de
-- propósito: é o que permite filtrar "quantas peças vendi da empresa X" e
-- agrupar por mês sem precisar de join em toda consulta do ranking.

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_key TEXT NOT NULL,
    product_code TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    unit_value NUMERIC,
    total_value NUMERIC,
    order_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_user_date ON public.order_items(user_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_user_product ON public.order_items(user_id, product_key);
CREATE INDEX IF NOT EXISTS idx_order_items_user_category ON public.order_items(user_id, category);
CREATE INDEX IF NOT EXISTS idx_order_items_client ON public.order_items(client_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Isolamento de Order Items" ON public.order_items
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
