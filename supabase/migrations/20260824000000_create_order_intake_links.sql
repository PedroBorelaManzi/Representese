-- Link compartilhável + PIN para um funcionário lançar pedidos em nome do
-- representante, sem nunca logar na conta real dele (sem cliente, sem
-- faturamento, sem nenhuma outra tela — só o formulário de anexar pedido).
--
-- pin_hash NUNCA é gravado pelo cliente diretamente: só a action 'set_pin'
-- de api/order-intake.ts grava aqui, usando a service role key, depois de
-- fazer o hash com scrypt. Por isso esta tabela não precisa de nenhuma
-- policy pública/anônima: a verificação (token+PIN) roda inteiramente no
-- servidor, com a service role key, contornando RLS de propósito.
CREATE TABLE IF NOT EXISTS public.order_intake_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'Link para pedidos',
    pin_hash TEXT,                     -- formato scrypt$N$r$p$salt$hash; null até o rep definir o PIN
    active BOOLEAN NOT NULL DEFAULT true,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    -- Incrementado a cada troca de PIN. Entra assinado dentro do sessionToken
    -- emitido no 'verify'; se não bater com o valor atual da linha, a sessão
    -- é tratada como revogada — troca de PIN derruba sessões abertas na hora,
    -- mesmo sem um token store no servidor.
    session_epoch INT NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS order_intake_links_token_uniq
  ON public.order_intake_links (token);

CREATE INDEX IF NOT EXISTS order_intake_links_user_id_idx
  ON public.order_intake_links (user_id);

ALTER TABLE public.order_intake_links ENABLE ROW LEVEL SECURITY;

-- O dono gerencia os próprios links pelo app normal (criar, listar, renomear,
-- ativar/desativar, apagar) com a sessão autenticada dele. Definir/trocar o
-- PIN é a única operação que passa OBRIGATORIAMENTE pelo endpoint no servidor
-- (api/order-intake.ts, action 'set_pin') — a policy abaixo não impede o dono
-- de tentar gravar pin_hash direto, mas o app nunca faz isso; é uma disciplina
-- de código, não uma trava extra no banco (manter simples aqui).
CREATE POLICY "Isolamento de Order Intake Links"
ON public.order_intake_links
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
