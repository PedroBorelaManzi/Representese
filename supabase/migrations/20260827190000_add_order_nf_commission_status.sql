-- Controle de baixa de comissão por NF: vermelho (atrasado), amarelo
-- (pendente) ou verde (confirmado) — o usuário clica num símbolo ao lado do
-- número da NF e vai alternando entre os três. Sem valor = ainda não definido.
alter table public.orders
  add column if not exists nf_commission_status text
    check (nf_commission_status in ('atrasado', 'pendente', 'confirmado'));
