// Programa de indicação para quem assina pelas lojas (iOS/Play via RevenueCat).
// No site/Android-Asaas o handle-asaas-webhook já faz isso; aqui cobre o caso de o
// INDICADO assinar pelo app. Lógica pura (sem Deno/imports de URL) para ser testada
// com vitest, no mesmo padrão de process-checkout/upgrade.ts.

// Mesma tabela de process-checkout/regularize-subscription/handle-asaas-webhook —
// precisa do preço CHEIO para reajustar a cobrança Asaas de quem indicou.
// src/lib/planPricesSync.test.ts falha se esta cópia divergir das outras.
const PLAN_PRICES: Record<string, Record<string, number>> = {
  'exclusivo': { MONTHLY: 49.9, SEMIANNUAL: 39.9, ANNUAL: 538.8 },
  'profissional': { MONTHLY: 79.9, SEMIANNUAL: 63.9, ANNUAL: 862.8 },
  'master': { MONTHLY: 99.9, SEMIANNUAL: 79.9, ANNUAL: 1078.8 },
  'default': { MONTHLY: 79.9, SEMIANNUAL: 63.9, ANNUAL: 862.8 }
};

export interface ReferralDeps {
  supabase: any;
  asaasApiKey?: string;
  asaasApiUrl?: string;
  fetchFn?: typeof fetch;
}

const ASAAS_API_URL = 'https://www.asaas.com/api/v3';

/**
 * Na 1ª compra: transforma o código digitado no cadastro do app (pending_referral_codes)
 * em uma indicação confirmada. Devolve o id de quem indicou, ou null se não havia código
 * válido. O pendente é sempre apagado — vale uma vez só.
 */
export async function registerPendingReferral(
  supabase: any,
  userId: string,
  platform: 'ios' | 'android',
): Promise<string | null> {
  const { data: pending } = await supabase
    .from('pending_referral_codes').select('code').eq('user_id', userId).maybeSingle();
  if (!pending?.code) return null;

  const { data: coupon } = await supabase
    .from('coupons').select('referrer_user_id').eq('code', pending.code).maybeSingle();
  const referrerId: string | null = coupon?.referrer_user_id ?? null;

  // Código inexistente, cupom promocional comum (sem indicador) ou autoindicação:
  // descarta sem registrar.
  if (referrerId && referrerId !== userId) {
    await supabase.from('referrals').upsert({
      referrer_user_id: referrerId,
      referred_user_id: userId,
      code: pending.code,
      platform,
    }, { onConflict: 'referred_user_id', ignoreDuplicates: true });
  }
  await supabase.from('pending_referral_codes').delete().eq('user_id', userId);
  return referrerId && referrerId !== userId ? referrerId : null;
}

/**
 * Mantém o valor da assinatura RECORRENTE do Asaas alinhado com o desconto a que a pessoa
 * tem direito. Não faz nada sem assinatura Asaas (assinante de loja) ou se já estiver
 * sincronizado. Espelha syncAsaasSubscriptionValue de handle-asaas-webhook.
 */
export async function syncAsaasSubscriptionValue(deps: ReferralDeps, userId: string): Promise<void> {
  const { supabase } = deps;
  try {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('asaas_subscription_id, referral_discount_pct, referral_discount_applied_pct')
      .eq('user_id', userId)
      .maybeSingle();
    if (!settings?.asaas_subscription_id) return;
    if (settings.referral_discount_pct === settings.referral_discount_applied_pct) return;
    if (!deps.asaasApiKey) return;

    const { data: entitlement } = await supabase
      .from('user_entitlements').select('plan_id, billing_cycle').eq('user_id', userId).maybeSingle();
    const planId = entitlement?.plan_id || 'profissional';
    const cycle = (entitlement?.billing_cycle as 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL') || 'MONTHLY';
    const basePrice = (PLAN_PRICES[planId] || PLAN_PRICES.default)[cycle];
    const pct = settings.referral_discount_pct as number;
    const newValue = Math.max(parseFloat((basePrice - (basePrice * pct) / 100).toFixed(2)), 5.0);

    const doFetch = deps.fetchFn ?? fetch;
    const resp = await doFetch(`${deps.asaasApiUrl ?? ASAAS_API_URL}/subscriptions/${settings.asaas_subscription_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'access_token': deps.asaasApiKey },
      body: JSON.stringify({ value: newValue }),
    });
    if (resp.ok) {
      await supabase.from('user_settings').update({ referral_discount_applied_pct: pct }).eq('user_id', userId);
    } else {
      console.error('Falha ao sincronizar desconto de indicação na Asaas:', await resp.text());
    }
  } catch (e) {
    console.error('Erro ao sincronizar desconto de indicação:', e);
  }
}

/**
 * Se este usuário foi indicado por alguém, toda mudança de status dele (comprou, renovou,
 * expirou, entrou em cobrança com problema) pode mudar quantos indicados ATIVOS o indicador
 * tem. Recalcula o desconto de quem indicou e já reflete na cobrança Asaas dele, se houver.
 */
export async function recomputeReferrerOf(deps: ReferralDeps, referredUserId: string): Promise<string | null> {
  const { supabase } = deps;
  const { data: ref } = await supabase
    .from('referrals').select('referrer_user_id').eq('referred_user_id', referredUserId).maybeSingle();
  const referrerId: string | undefined = ref?.referrer_user_id;
  if (!referrerId) return null;
  await supabase.rpc('recompute_referrer_discount', { p_referrer_user_id: referrerId });
  await syncAsaasSubscriptionValue(deps, referrerId);
  return referrerId;
}
