-- (1) Prazo de entrega padrão por empresa representada (dias), configurável
-- em Empresas & Pedidos > Gerenciar Empresa. Mesmo padrão de
-- user_settings.commissions (jsonb, chave = nome da empresa).
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS delivery_lead_days jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Preenche delivery_date automaticamente SÓ na criação do pedido (nunca em
-- UPDATE) quando: (a) a empresa tem um prazo padrão configurado, e (b) o
-- pedido não trouxe uma data de entrega já explícita (ex.: a IA leu um prazo
-- escrito no próprio documento — nesse caso o valor lido manda, e este
-- trigger nem mexe). Se a empresa não tem prazo configurado, fica em branco
-- mesmo — é a pessoa que preenche manualmente depois, de propósito.
CREATE OR REPLACE FUNCTION public.apply_default_delivery_date()
RETURNS TRIGGER AS $$
DECLARE
  lead_days int;
BEGIN
  IF NEW.delivery_date IS NULL THEN
    SELECT (delivery_lead_days->>NEW.category)::int INTO lead_days
    FROM public.user_settings WHERE user_id = NEW.user_id;
    IF lead_days IS NOT NULL THEN
      NEW.delivery_date := COALESCE(NEW.created_at::date, CURRENT_DATE) + lead_days;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_apply_default_delivery_date ON public.orders;
CREATE TRIGGER trg_apply_default_delivery_date
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.apply_default_delivery_date();

-- (2) O prazo de pagamento (30/60/90) conta a partir da ENTREGA, não da data
-- do pedido: se entrega em 10 dias e o prazo é 30, o recebimento real é em
-- 40 dias. Muda só a ordem de prioridade da data-base — sem entrega
-- definida ainda, cai pra faturamento, e sem isso, pra data do pedido (igual
-- era antes). Como este trigger roda DEPOIS do BEFORE INSERT acima, quando
-- ele lê NEW.delivery_date o valor já vem preenchido pelo prazo padrão da
-- empresa, se houver.
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

  base_date := COALESCE(NEW.delivery_date, NEW.invoice_date, NEW.created_at::date, CURRENT_DATE);

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
  AFTER INSERT OR UPDATE OF value, payment_terms, invoice_date, delivery_date, created_at ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.regenerate_order_installments();
