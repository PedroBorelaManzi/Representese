-- Área "Entregas": data de entrega, nº da NF, data de faturamento e condição
-- de pagamento em cada pedido, mais a tabela de parcelas geradas a partir da
-- condição de pagamento (ex.: "30/60/90"). A geração das parcelas roda num
-- trigger no banco (não em TypeScript) porque existem 3 caminhos que criam
-- pedido hoje — upload manual (online e offline via syncQueue), lote e o
-- link do colaborador (api/order-intake.ts, Node/Vercel) — um trigger único
-- garante que os três (inclusive quando uma inserção offline é sincronizada
-- depois) gerem parcela do mesmo jeito, sem duplicar o parse em TS em dois
-- lugares.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS nf_number text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS payment_terms text;

CREATE TABLE IF NOT EXISTS public.order_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  installment_number int NOT NULL,
  due_date date NOT NULL,
  value numeric(12,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_installments_order ON public.order_installments(order_id);
-- É por este índice que a tela de Comissões filtra por mês (due_date).
CREATE INDEX IF NOT EXISTS idx_order_installments_user_due ON public.order_installments(user_id, due_date);

ALTER TABLE public.order_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own installments" ON public.order_installments;
CREATE POLICY "Users manage own installments" ON public.order_installments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Recalcula as parcelas de um pedido a partir de payment_terms/value/invoice_date.
-- Texto vazio, "à vista" ou não reconhecido → 1 parcela só, valor cheio, no
-- vencimento da data-base — é exatamente o comportamento de hoje (comissão
-- inteira no mês do pedido), por isso pedidos sem condição de pagamento
-- explícita não mudam nada no relatório de Comissões.
CREATE OR REPLACE FUNCTION public.regenerate_order_installments()
RETURNS TRIGGER AS $$
DECLARE
  base_date date;
  tokens text[];
  cleaned text;
  n int;
  i int;
  day_offset int;
  per_value numeric(12,2);
  remaining numeric(12,2);
BEGIN
  DELETE FROM public.order_installments WHERE order_id = NEW.id;

  base_date := COALESCE(NEW.invoice_date, NEW.created_at::date, CURRENT_DATE);

  -- Só dígitos e separadores (/ ou ,) sobrevivem — "30/60/90 dias" vira "30/60/90".
  cleaned := NULLIF(regexp_replace(COALESCE(NEW.payment_terms, ''), '[^0-9/,]', '', 'g'), '');
  IF cleaned IS NULL THEN
    tokens := NULL;
  ELSIF cleaned LIKE '%,%' AND cleaned NOT LIKE '%/%' THEN
    tokens := string_to_array(cleaned, ',');
  ELSE
    tokens := string_to_array(cleaned, '/');
  END IF;

  n := COALESCE(array_length(tokens, 1), 0);

  IF n = 0 THEN
    INSERT INTO public.order_installments (order_id, user_id, installment_number, due_date, value)
    VALUES (NEW.id, NEW.user_id, 1, base_date, NEW.value);
    RETURN NEW;
  END IF;

  per_value := round(NEW.value / n, 2);
  remaining := NEW.value;
  FOR i IN 1..n LOOP
    day_offset := NULLIF(tokens[i], '')::int;
    IF day_offset IS NULL THEN
      day_offset := 0;
    END IF;
    INSERT INTO public.order_installments (order_id, user_id, installment_number, due_date, value)
    VALUES (
      NEW.id, NEW.user_id, i, base_date + day_offset,
      CASE WHEN i = n THEN remaining ELSE per_value END
    );
    remaining := remaining - per_value;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_regenerate_order_installments ON public.orders;
CREATE TRIGGER trg_regenerate_order_installments
  AFTER INSERT OR UPDATE OF value, payment_terms, invoice_date, created_at ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.regenerate_order_installments();

-- Backfill: todo pedido já existente ganha sua parcela única na própria
-- data do pedido — preserva os números de Comissões de meses passados.
INSERT INTO public.order_installments (order_id, user_id, installment_number, due_date, value)
SELECT o.id, o.user_id, 1, o.created_at::date, o.value
FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_installments oi WHERE oi.order_id = o.id);
