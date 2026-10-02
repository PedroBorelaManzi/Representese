-- Aplicada em produção via MCP apply_migration em 2026-09-26 (auditoria de segurança).

-- 1) Colunas de assinatura em user_settings: só o servidor (service_role) altera.
-- O app decide acesso por user_entitlements; estas colunas são legado, mas o dono
-- da linha tinha UPDATE nelas pela API. Mesmo padrão do trigger protect_is_admin.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' then
    if TG_OP = 'UPDATE' then
      NEW.subscription_plan := OLD.subscription_plan;
      NEW.subscription_status := OLD.subscription_status;
      NEW.subscription_valid_until := OLD.subscription_valid_until;
      NEW.cancel_at_period_end := OLD.cancel_at_period_end;
      NEW.asaas_subscription_id := OLD.asaas_subscription_id;
    elsif TG_OP = 'INSERT' then
      NEW.subscription_plan := 'Acesso Exclusivo';
      NEW.subscription_status := 'active';
      NEW.subscription_valid_until := null;
      NEW.cancel_at_period_end := false;
      NEW.asaas_subscription_id := null;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_billing_columns on public.user_settings;
create trigger trg_protect_billing_columns
  before insert or update on public.user_settings
  for each row execute function public.protect_billing_columns();

-- 2) upsert_lead (executável por anon): valida entrada e NÃO sobrescreve dados de
-- um lead que já existe (antes, qualquer um trocava nome/telefone sabendo o e-mail).
create or replace function public.upsert_lead(p_name text, p_email text, p_phone text, p_company text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
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

  insert into public.leads (name, email, phone, company)
  values (v_name, v_email, p_phone, nullif(trim(coalesce(p_company, '')), ''))
  on conflict (email) do update
    set name = coalesce(nullif(public.leads.name, ''), excluded.name),
        phone = coalesce(nullif(public.leads.phone, ''), excluded.phone),
        company = coalesce(public.leads.company, excluded.company),
        updated_at = timezone('utc'::text, now());
end;
$$;

-- 3) INSERT público direto em leads: teto de tamanho (linhas antigas não são revalidadas).
alter table public.leads drop constraint if exists leads_field_lengths;
alter table public.leads add constraint leads_field_lengths check (
  char_length(coalesce(name, '')) <= 200
  and char_length(coalesce(email, '')) <= 254
  and char_length(coalesce(phone, '')) <= 40
  and char_length(coalesce(company, '')) <= 200
) not valid;
