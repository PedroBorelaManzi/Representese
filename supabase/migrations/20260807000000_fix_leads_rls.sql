-- Auditoria 2026-08-07 · SEC-01
--
-- A policy "Anyone can upsert leads" liberava UPDATE na tabela leads para o
-- papel `public` (que inclui `anon`) com USING true / WITH CHECK true. Como a
-- chave anônima do Supabase vai no bundle JavaScript, qualquer visitante podia:
--   1. sobrescrever ou zerar a base de leads inteira;
--   2. ler os dados de volta via PATCH com `Prefer: return=representation`
--      (nome, e-mail, WhatsApp e empresa de todos os prospects).
--
-- Confirmado em teste: PATCH anônimo respondia HTTP 200, não 401/403.
--
-- A policy é redundante: o cadastro público em /register grava pelo RPC
-- upsert_lead, que é SECURITY DEFINER e faz o upsert com segurança sem
-- depender de permissão de UPDATE do chamador.
drop policy if exists "Anyone can upsert leads" on public.leads;

-- A leitura continua restrita a admins (policy "Admins can read leads") e a
-- inserção segue permitida para o formulário público ("Anyone can insert leads").
