-- Permite "ignorar" o aviso de inatividade de uma representada específica
-- para um cliente (ex.: o cliente trocou de fornecedor e não vai comprar mais
-- dessa marca). O aviso some até o cliente comprar de novo dessa representada
-- depois da data em que o aviso foi ignorado — aí ele reaparece naturalmente
-- se ficar inativo outra vez.
--
-- client_name_key é a chave normalizada do nome do cliente (mesma usada para
-- agrupar matriz e filiais nos alertas), não o client_id: assim ignorar o
-- aviso em qualquer cadastro do grupo vale para o grupo todo.
CREATE TABLE IF NOT EXISTS public.alert_dismissals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name_key TEXT NOT NULL,
    company TEXT NOT NULL,
    -- data do último pedido no momento em que o aviso foi ignorado; se o
    -- cliente comprar de novo depois disso, o aviso volta a valer.
    last_order_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS alert_dismissals_user_client_company_uniq
  ON public.alert_dismissals (user_id, client_name_key, company);

ALTER TABLE public.alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Isolamento de Alert Dismissals"
ON public.alert_dismissals
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
