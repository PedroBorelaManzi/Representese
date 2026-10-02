-- Aplicada em produção via MCP apply_migration em 2026-09-27.
-- Guarda de onde veio o resgate (web/android — os dois passam por aqui,
-- CLAUDE.md: "Cobrança no site/Android é via Asaas"). O webhook usa isso pra
-- gravar a plataforma certa em public.referrals quando o cupom é de
-- indicação (coupons.referrer_user_id preenchido).
alter table public.coupon_redemptions add column platform text not null default 'web' check (platform in ('web','android'));
