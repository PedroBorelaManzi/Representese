import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function constantTimeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes)
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Retorna null quando a descrição não identifica um plano — nesse caso o
// plan_id atual do usuário NÃO deve ser alterado.
const matchPlanId = (val: string): string | null => {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v.includes('master')) return 'master';
  if (v.includes('exclusivo')) return 'exclusivo';
  if (v.includes('profissional')) return 'profissional';
  return null;
};

// process-checkout grava a descrição da cobrança como "Plano X - CICLO"
// (CICLO = MONTHLY/SEMIANNUAL/ANNUAL) — é o único jeito de saber, aqui no
// webhook, tanto por quanto tempo essa cobrança cobre o acesso quanto qual
// era o ciclo escolhido (billing_cycle, usado depois pela regularização
// pra cobrar o valor certo). SEMIANNUAL é checado antes de ANNUAL de
// propósito: a palavra "ANNUAL" está contida dentro de "SEMIANNUAL", então
// checar na ordem errada classificaria semestral como anual.
const cycleFromDescription = (description: string | undefined): 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL' => {
  const desc = (description || '').toUpperCase();
  if (desc.includes('SEMIANNUAL')) return 'SEMIANNUAL';
  if (desc.includes('ANNUAL')) return 'ANNUAL';
  return 'MONTHLY';
};

const PERIOD_DAYS: Record<string, number> = { MONTHLY: 32, SEMIANNUAL: 190, ANNUAL: 370 };

const ASAAS_API_URL = 'https://www.asaas.com/api/v3';
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');

// Mesma tabela de process-checkout/regularize-subscription — precisa aqui
// pra saber quanto é o preço CHEIO do plano antes de aplicar o desconto de
// indicação na assinatura recorrente da Asaas.
const PLAN_PRICES: Record<string, Record<string, number>> = {
  'exclusivo': { MONTHLY: 97, SEMIANNUAL: 77, ANNUAL: 1044 },
  'profissional': { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 1584 },
  'master': { MONTHLY: 197, SEMIANNUAL: 157, ANNUAL: 2124 },
  'default': { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 1584 }
};

// Programa de indicação — mantém o valor cobrado na assinatura RECORRENTE
// da Asaas (não uma fatura avulsa) alinhado com `user_settings.
// referral_discount_pct` (quanto essa pessoa tem direito agora, seja como
// indicadora — recorrente, enquanto o indicado pagar — seja o próprio
// indicado voltando ao preço cheio depois da 1ª fatura). Não mexe em nada
// se não tiver assinatura recorrente (ex.: pagou por PIX avulso, ou é
// assinante iOS) ou se o valor já está sincronizado (evita PUT à toa).
async function syncAsaasSubscriptionValue(supabase: any, userId: string): Promise<void> {
  try {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('asaas_subscription_id, referral_discount_pct, referral_discount_applied_pct')
      .eq('user_id', userId)
      .maybeSingle();
    if (!settings?.asaas_subscription_id) return;
    if (settings.referral_discount_pct === settings.referral_discount_applied_pct) return;

    const { data: entitlement } = await supabase
      .from('user_entitlements')
      .select('plan_id, billing_cycle')
      .eq('user_id', userId)
      .maybeSingle();
    const planId = entitlement?.plan_id || 'profissional';
    const cycle = (entitlement?.billing_cycle as 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL') || 'MONTHLY';
    const basePrice = (PLAN_PRICES[planId] || PLAN_PRICES.default)[cycle];
    const pct = settings.referral_discount_pct as number;
    const newValue = Math.max(parseFloat((basePrice - (basePrice * pct) / 100).toFixed(2)), 5.0);

    const resp = await fetch(`${ASAAS_API_URL}/subscriptions/${settings.asaas_subscription_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY! },
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

// Recalcula o desconto de quem indicou (10%/indicado pagante ativo, até
// 20%) e já reflete na cobrança recorrente dela, se tiver assinatura Asaas
// (indicador no iOS só recalcula o número — o resgate lá é manual, ver
// SettingsReferral.tsx).
async function recomputeAndSyncReferrer(supabase: any, referrerUserId: string): Promise<void> {
  await supabase.rpc('recompute_referrer_discount', { p_referrer_user_id: referrerUserId });
  await syncAsaasSubscriptionValue(supabase, referrerUserId);
}

// Registra, uma única vez por usuário, a 1ª cobrança confirmada — é a conversão "Assinatura
// paga" do Google Ads medida pelo servidor (não depende de a pessoa reabrir o app). Guarda o
// gclid/utm vindos do cadastro (user_metadata.attribution) ou do lead (leads.attribution).
// Exportar as linhas com gclid e exported_at nulo → Google Ads > Conversões > Uploads.
// Nunca pode derrubar o webhook: qualquer erro só vai pro log.
async function registerAdsConversion(supabase: any, userId: string, payment: any, planId?: string, cycle?: string): Promise<void> {
  try {
    const { data: u } = await supabase.auth.admin.getUserById(userId);
    const user = u?.user;
    let attr: any = user?.user_metadata?.attribution ?? null;
    if (!attr && user?.email) {
      const { data: lead } = await supabase.from('leads').select('attribution').eq('email', String(user.email).toLowerCase()).maybeSingle();
      attr = lead?.attribution ?? null;
    }
    const value = Number(payment?.value ?? 0);
    await supabase.from('ads_conversions').upsert({
      user_id: userId,
      conversion_time: new Date().toISOString(),
      value: value > 0 ? value : null,
      gclid: attr?.gclid ?? null,
      gbraid: attr?.gbraid ?? null,
      wbraid: attr?.wbraid ?? null,
      attribution: attr,
      plan_id: planId ?? null,
      billing_cycle: cycle ?? null,
      asaas_payment_id: payment?.id ?? null,
    }, { onConflict: 'user_id', ignoreDuplicates: true });
  } catch (e) {
    console.error('Erro ao registrar conversão do Google Ads:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const body = await req.json()
    const { event, payment } = body

    const receivedToken = req.headers.get('asaas-access-token')
    const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

    if (!expectedToken || !receivedToken || !constantTimeEquals(receivedToken, expectedToken)) {
      console.error('Tentativa de acesso bloqueada: Token Inválido ou Ausente')
      return new Response(JSON.stringify({ message: 'Acesso não autorizado' }), { status: 401 })
    }

    // Idempotência: o Asaas pode reenviar o mesmo evento. Se já processamos
    // este id, respondemos 200 sem reprocessar.
    if (body.id) {
      const { error: dupError } = await supabase.from('asaas_webhook_events').insert({
        event_id: body.id, event_type: event || 'unknown'
      });
      if (dupError && dupError.code === '23505') {
        return new Response(JSON.stringify({ success: true, duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      }
    }

    if (!payment?.customer) {
      return new Response(JSON.stringify({ message: 'Sem dados de cliente' }), { status: 200 })
    }

    let userId = payment.externalReference

    if (!userId) {
      const customerResp = await fetch(`https://www.asaas.com/api/v3/customers/${payment.customer}`, {
        headers: { 'access_token': Deno.env.get('ASAAS_API_KEY')! }
      })
      const customerData = await customerResp.json()
      const customerEmail = customerData.email

      if (customerEmail) {
        const { data: foundId } = await supabase.rpc('get_user_id_by_email', { search_email: customerEmail.toLowerCase() })
        userId = foundId
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ message: 'Usuário não encontrado' }), { status: 200 })
    }

    // Só eventos conhecidos alteram o status — evento desconhecido não pode
    // liberar acesso por acidente.
    let newStatus: string | null = null
    let isCanceled = false;

    if (event === 'PAYMENT_OVERDUE') newStatus = 'past_due'
    if (event === 'PAYMENT_DELETED') newStatus = 'inactive'
    if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_PARTIALLY_REFUNDED') newStatus = 'inactive'
    if (event === 'PAYMENT_CHARGEBACK_REQUESTED' || event === 'PAYMENT_CHARGEBACK_DISPUTE') newStatus = 'past_due'
    if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_CANCELED') {
      isCanceled = true;
    }
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') newStatus = 'active'

    if (!newStatus && !isCanceled) {
      return new Response(JSON.stringify({ success: true, ignored: event }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (isCanceled) {
      updateData.cancel_at_period_end = true;
    } else {
      updateData.subscription_status = newStatus;
      updateData.cancel_at_period_end = false;
    }

    // Só atualiza o plano quando a cobrança identifica um plano de verdade —
    // e nunca em evento de estorno/cancelamento.
    if (payment.description && newStatus === 'active') {
      const matched = matchPlanId(payment.description);
      if (matched) updateData.plan_id = matched;
    }

    // Até quando essa cobrança cobre o acesso, e qual foi o ciclo escolhido
    // (billing_cycle — usado depois pela regularização pra cobrar o valor
    // certo em vez de sempre assumir mensal). Sem current_period_end, o app
    // inteiro dependia de NUNCA perder um webhook de renovação, sem nenhuma
    // segunda checagem — ver a checagem em SettingsContext.tsx que rebaixa
    // pra "past_due" sozinha quando essa data já passou.
    if (newStatus === 'active') {
      const cycle = cycleFromDescription(payment.description);
      updateData.billing_cycle = cycle;
      updateData.current_period_end = new Date(Date.now() + PERIOD_DAYS[cycle] * 24 * 60 * 60 * 1000).toISOString();
    }

    await supabase.from('user_entitlements').upsert({
      user_id: userId,
      ...updateData
    }, { onConflict: 'user_id' })

    // 1ª cobrança confirmada: grava a conversão do Google Ads (idempotente por usuário).
    if (newStatus === 'active') {
      await registerAdsConversion(supabase, userId, payment, updateData.plan_id, updateData.billing_cycle)
    }

    // Programa de indicação: se este usuário foi indicado por alguém, toda
    // mudança de status dele (voltou a pagar, ficou past_due, cancelou...)
    // pode mudar quantos indicados ATIVOS o indicador tem — recalcula e já
    // ajusta a cobrança recorrente do indicador (site/Android; iOS só
    // atualiza o número, o resgate lá é manual).
    const { data: myReferral } = await supabase
      .from('referrals').select('referrer_user_id').eq('referred_user_id', userId).maybeSingle();
    if (myReferral?.referrer_user_id) {
      await recomputeAndSyncReferrer(supabase, myReferral.referrer_user_id);
    }

    // Pagamento aprovado: confirma o resgate de cupom pendente deste usuário
    // (o incremento de times_redeemed só acontece aqui, uma única vez).
    if (newStatus === 'active') {
      const { data: pendings } = await supabase.from('coupon_redemptions')
        .select('code, platform').eq('user_id', userId).eq('status', 'pending');
      for (const p of pendings || []) {
        const { data: updated } = await supabase.from('coupon_redemptions')
          .update({ status: 'confirmed' })
          .eq('user_id', userId).eq('code', p.code).eq('status', 'pending')
          .select('code');
        if (updated && updated.length > 0) {
          await supabase.rpc('increment_coupon', { c_code: p.code }).then(() => {}, () => {});

          // Cupom de indicação confirmado agora, na 1ª fatura paga: registra
          // quem indicou quem (única vez — `referrals.referred_user_id` é
          // unique) e recalcula o desconto de quem indicou. O desconto do
          // PRÓPRIO indicado (10% que acabou de valer nesta fatura) só vale
          // uma vez — não mexe em nada aqui: o valor cheio volta sozinho na
          // próxima cobrança porque `referral_discount_pct` dele (se não for
          // indicador de mais ninguém) é 0, e o sync abaixo já convergiu a
          // cobrança recorrente pra esse valor.
          const { data: dbCoupon } = await supabase
            .from('coupons').select('referrer_user_id, discount_percent').eq('code', p.code).maybeSingle();
          if (dbCoupon?.referrer_user_id && dbCoupon.referrer_user_id !== userId) {
            await supabase.from('referrals').upsert({
              referrer_user_id: dbCoupon.referrer_user_id,
              referred_user_id: userId,
              code: p.code,
              platform: p.platform || 'web',
            }, { onConflict: 'referred_user_id', ignoreDuplicates: true });
            // syncAsaasSubscriptionValue só age quando applied ≠ pct — sem
            // registrar aqui que a assinatura JÁ está com o desconto de 1ª
            // fatura aplicado (process-checkout usou o mecanismo genérico de
            // cupom pra criar a assinatura, não esta tabela), o sync logo
            // abaixo veria 0 === 0 e nunca devolveria o valor cheio.
            await supabase.from('user_settings')
              .update({ referral_discount_applied_pct: dbCoupon.discount_percent })
              .eq('user_id', userId);
            await recomputeAndSyncReferrer(supabase, dbCoupon.referrer_user_id);
          }
        }
      }
      // Convém rodar depois do bloco acima: se este pagamento confirmou um
      // cupom de indicação, isso é a 1ª fatura dele — a assinatura recorrente
      // ainda está com o valor computado com 10% off (process-checkout
      // aplicou na criação). Sincroniza de volta pro valor que este usuário
      // tem direito daqui pra frente (0%, salvo ele também ser indicador).
      await syncAsaasSubscriptionValue(supabase, userId);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
