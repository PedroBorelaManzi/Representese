-- Aplicada em produção pelo SQL Editor do Supabase (2026-10-19), a pedido do Pedro.
-- pg_net não é relocável (extrelocatable=false): foi preciso recriar. As funções net.http_*
-- seguem no schema `net`; só o registro da extensão saiu de `public`. O cron
-- error-alert-hourly continua igual. Testado: net.http_get -> 200.
drop extension pg_net;
create extension pg_net with schema extensions;
