-- Agenda da entrega: texto livre pra anotar quando/como a entrega foi
-- combinada (ex.: "Manhã, portão B", "14h com o motorista") — complementa
-- delivery_date (que é só a data) sem forçar um formato específico.
alter table public.orders
  add column if not exists delivery_schedule text;
