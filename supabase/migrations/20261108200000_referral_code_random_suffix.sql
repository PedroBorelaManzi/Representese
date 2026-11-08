-- Código de indicação = primeiro nome + número aleatório (ex.: JOAO4821), em vez de só o nome.
-- Antes "JOAO" já nascia igual ao de qualquer outro João, e quem digitava o nome de um conhecido
-- podia cair no código errado. Com o número, ninguém acerta o código de outra pessoa por acaso.
-- Os códigos que já existirem continuam valendo como estão (a função devolve o existente).
create or replace function public.generate_my_referral_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing text;
  v_name text;
  v_base text;
  v_code text;
  v_tentativas int := 0;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select code into v_existing from public.coupons where referrer_user_id = v_user_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Só quem já pagou pelo menos uma vez pode indicar — sem isso dava pra
  -- criar conta grátis só pra gerar código e farmar desconto sem nunca ter
  -- sido cliente de verdade.
  if not exists (
    select 1 from public.user_entitlements
    where user_id = v_user_id and subscription_status in ('active', 'past_due')
  ) then
    raise exception 'apenas assinantes pagantes podem gerar código de indicação';
  end if;

  select raw_user_meta_data->>'full_name' into v_name from auth.users where id = v_user_id;
  v_base := upper(regexp_replace(coalesce(split_part(v_name, ' ', 1), 'REP'), '[^A-Za-z0-9]', '', 'g'));
  if length(v_base) < 3 then v_base := 'REP'; end if;
  v_base := left(v_base, 10);

  loop
    v_tentativas := v_tentativas + 1;
    -- 4 dígitos (1000–9999); se esbarrar muitas vezes no mesmo nome, passa a 5 dígitos (10000–99999).
    v_code := v_base || case
      when v_tentativas <= 20 then (1000 + floor(random() * 9000))::int::text
      else (10000 + floor(random() * 90000))::int::text
    end;
    exit when not exists (select 1 from public.coupons where upper(code) = v_code);
    if v_tentativas > 200 then
      raise exception 'não foi possível gerar um código único, tente novamente';
    end if;
  end loop;

  insert into public.coupons (code, discount_percent, active, referrer_user_id)
  values (v_code, 10, true, v_user_id);

  return v_code;
end;
$function$;
