-- Rede de clientes: matriz + filiais que compram por um lugar só.
-- Cadastros com o mesmo network_name (normalizado) passam a compartilhar a
-- atividade de compra no cálculo de alertas de inatividade (clientAlerts.ts),
-- em vez de depender de terem exatamente o mesmo "name" cadastrado.
alter table public.clients
  add column if not exists network_name text;
