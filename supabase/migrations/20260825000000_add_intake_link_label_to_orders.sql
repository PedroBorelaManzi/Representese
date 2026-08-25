-- Guarda o nome do link de "enviar pedido" (order_intake_links.label) no
-- momento do envio, pra dar pra saber qual funcionário mandou qual pedido
-- direto na listagem, sem precisar de join. É uma cópia (snapshot) do nome
-- de então, não uma referência viva: se o representante apagar ou renomear
-- o link depois, o pedido antigo continua mostrando o nome de quando foi
-- enviado — histórico não deve mudar de baixo pra cima.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS intake_link_label TEXT;
