-- Origem (gclid/utm) do lead + registro server-side da 1ª cobrança confirmada (para importar no Google Ads).
-- Já aplicada no projeto via MCP apply_migration (2026-10-05).

alter table public.leads add column if not exists attribution jsonb;

drop function if exists public.upsert_lead(text, text, text, text);

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
      where key in ('gclid','gbraid','wbraid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref_host','landing','captured_at')
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

revoke all on function public.upsert_lead(text, text, text, text, jsonb) from public;
grant execute on function public.upsert_lead(text, text, text, text, jsonb) to anon, authenticated;

create table if not exists public.ads_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  conversion_name text not null default 'Assinatura paga',
  conversion_time timestamptz not null default now(),
  value numeric(10,2),
  currency text not null default 'BRL',
  gclid text,
  gbraid text,
  wbraid text,
  attribution jsonb,
  plan_id text,
  billing_cycle text,
  asaas_payment_id text,
  exported_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ads_conversions enable row level security;
revoke all on public.ads_conversions from anon, authenticated;
create index if not exists ads_conversions_pending_export_idx on public.ads_conversions (conversion_time) where exported_at is null and gclid is not null;

comment on table public.ads_conversions is 'Primeira cobrança confirmada de cada usuário (webhook Asaas). Só service_role. Exportar linhas com gclid e exported_at nulo para a importação offline do Google Ads.';
