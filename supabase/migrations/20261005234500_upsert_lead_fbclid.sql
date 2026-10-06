-- Permite guardar o fbclid (clique de anúncio da Meta) na origem do lead.
-- Aplicada no projeto via MCP apply_migration (2026-10-05).

create or replace function public.upsert_lead(
  p_name text, p_email text, p_phone text, p_company text default null, p_attribution jsonb default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_attr jsonb := null;
begin
  if char_length(v_email) not between 5 and 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'e-mail inválido';
  end if;
  if char_length(v_name) not between 1 and 200 then
    raise exception 'nome inválido';
  end if;
  if char_length(coalesce(p_phone, '')) > 40 or char_length(coalesce(p_company, '')) > 200 then
    raise exception 'dados muito longos';
  end if;

  -- Só chaves conhecidas, só texto, no máximo 200 caracteres cada: entrada pública não pode gravar lixo.
  if p_attribution is not null and jsonb_typeof(p_attribution) = 'object' then
    select jsonb_object_agg(t.k, left(t.v, 200)) into v_attr
    from (
      select key as k, value #>> '{}' as v
      from jsonb_each(p_attribution)
      where key in ('gclid','gbraid','wbraid','fbclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref_host','landing','captured_at')
        and jsonb_typeof(value) = 'string'
    ) t;
  end if;

  insert into public.leads (name, email, phone, company, attribution)
  values (v_name, v_email, p_phone, nullif(trim(coalesce(p_company, '')), ''), v_attr)
  on conflict (email) do update
    set name = coalesce(nullif(public.leads.name, ''), excluded.name),
        phone = coalesce(nullif(public.leads.phone, ''), excluded.phone),
        company = coalesce(public.leads.company, excluded.company),
        attribution = coalesce(excluded.attribution, public.leads.attribution),
        updated_at = timezone('utc'::text, now());
end;
$function$;
