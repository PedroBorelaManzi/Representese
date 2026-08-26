-- Esconder valores de comissão na tela (proteção visual, não autenticação de
-- sistema — é tipo "app lock" contra alguém olhando por cima do ombro ou
-- pegando o celular emprestado). commission_password_hash é SHA-256(senha +
-- user_id) calculado no cliente (Web Crypto), nunca a senha em texto puro.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS hide_commissions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_password_hash text;
