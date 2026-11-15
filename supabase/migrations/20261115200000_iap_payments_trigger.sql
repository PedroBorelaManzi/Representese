-- Registra em subscription_payments cada compra/renovação paga na App Store ou no Google Play (via user_entitlements,
-- que o handle-revenuecat-webhook já grava). Comissão estimada: Apple 30%, Google Play 15%. Ignora sandbox, trial e preço 0.
-- Nunca derruba o webhook: qualquer erro é engolido. Também agenda o sync diário do Asaas (sync-revenue).
create or replace function public.log_iap_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  prov text;
  pct numeric;
  gross numeric;
  extid text;
  v_email text;
  v_name text;
  v_admin boolean;
begin
  if new.iap_last_event_type in ('INITIAL_PURCHASE', 'RENEWAL')
     and coalesce(new.iap_price, 0) > 0
     and coalesce(new.iap_currency, 'BRL') = 'BRL'
     and coalesce(new.iap_environment, 'PRODUCTION') <> 'SANDBOX'
     and coalesce(new.iap_period_type, 'NORMAL') <> 'TRIAL'
     and (tg_op = 'INSERT' or new.iap_last_event_at is distinct from old.iap_last_event_at) then
    prov := case when new.iap_store = 'PLAY_STORE' then 'google' else 'apple' end;
    pct := case when prov = 'google' then 15 else 30 end;
    gross := new.iap_price;
    extid := coalesce(new.iap_original_transaction_id, new.user_id::text) || ':' || coalesce(new.iap_renewal_number, 0)::text
             || ':' || to_char(coalesce(new.iap_purchased_at, now()), 'YYYYMMDD');
    select u.email, coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name')
      into v_email, v_name from auth.users u where u.id = new.user_id;
    select coalesce(bool_or(s.is_admin), false) into v_admin from public.user_settings s where s.user_id = new.user_id;
    insert into public.subscription_payments (provider, external_id, user_id, email, customer_name, plan_id, gross_brl, fee_brl, net_brl, fee_pct, paid_at, is_test, note)
    values (prov, extid, new.user_id, lower(v_email), v_name, new.plan_id, gross, round(gross * pct / 100, 2), round(gross * (100 - pct) / 100, 2), pct,
            (coalesce(new.iap_purchased_at, now()) at time zone 'America/Sao_Paulo')::date, v_admin,
            new.iap_store || ' · ' || new.iap_last_event_type || ' · comissão estimada ' || pct || '%')
    on conflict (provider, external_id) do nothing;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_log_iap_payment on public.user_entitlements;
create trigger trg_log_iap_payment
after insert or update on public.user_entitlements
for each row execute function public.log_iap_payment();

select cron.schedule(
  'sync-revenue-daily',
  '40 6 * * *',
  $cmd$ SELECT net.http_post(url := 'https://wdtftftwdqtihupbtlxk.supabase.co/functions/v1/sync-revenue', headers := jsonb_build_object('Content-Type','application/json','x-internal-token',(SELECT value FROM internal_config WHERE key='cron_token')), body := '{}'::jsonb, timeout_milliseconds := 120000) $cmd$
);
