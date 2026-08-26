-- Guarda o ciclo de cobrança (MONTHLY/SEMIANNUAL/ANNUAL) junto do plan_id —
-- antes só existia embutido na descrição da cobrança lá no Asaas
-- ("Plano X - CICLO"), nunca persistido aqui. Sem isso, a regularização
-- (regularize-subscription) não tinha como saber se devia cobrar o valor
-- mensal ou anual de quem estava vencido, e sempre cobrava o preço mensal
-- mesmo de assinantes anuais.
ALTER TABLE public.user_entitlements
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
