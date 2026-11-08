// Dados da compra que o RevenueCat manda em cada evento e que a Ficha Completa do admin mostra
// (loja, produto, preço pago, país, sandbox/produção, renovação). Lógica pura, testada com vitest.
//
// Só devolve o que veio preenchido: um evento posterior sem o campo (ex.: EXPIRATION sem preço)
// não pode apagar o que um evento anterior já gravou.

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const iso = (ms: unknown): string | null => (isNum(ms) && ms > 0 ? new Date(ms).toISOString() : null);

export function revenueCatFields(event: any, now: Date = new Date()): Record<string, string | number> {
  const out: Record<string, string | number> = {
    iap_last_event_type: isStr(event?.type) ? event.type : 'unknown',
    iap_last_event_at: iso(event?.event_timestamp_ms) ?? now.toISOString(),
  };
  if (isStr(event?.store)) out.iap_store = event.store;
  if (isStr(event?.product_id)) out.iap_product_id = event.product_id;
  // price_in_purchased_currency é o valor na moeda de quem pagou; `price` do RevenueCat é sempre em USD.
  if (isNum(event?.price_in_purchased_currency)) out.iap_price = event.price_in_purchased_currency;
  if (isStr(event?.currency)) out.iap_currency = event.currency;
  if (isStr(event?.country_code)) out.iap_country = event.country_code;
  if (isStr(event?.period_type)) out.iap_period_type = event.period_type;
  if (isStr(event?.environment)) out.iap_environment = event.environment;
  const purchased = iso(event?.purchased_at_ms);
  if (purchased) out.iap_purchased_at = purchased;
  if (isNum(event?.renewal_number)) out.iap_renewal_number = event.renewal_number;
  if (isStr(event?.offer_code)) out.iap_offer_code = event.offer_code;
  const reason = isStr(event?.cancel_reason) ? event.cancel_reason : isStr(event?.expiration_reason) ? event.expiration_reason : null;
  if (reason) out.iap_cancel_reason = reason;
  return out;
}
