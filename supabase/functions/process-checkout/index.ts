import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
const ASAAS_API_URL = 'https://www.asaas.com/api/v3'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const normalizePlanId = (val: string): string => {
  if (!val) return 'profissional';
  const v = val.toLowerCase();
  if (v.includes('master')) return 'master';
  if (v.includes('exclusivo')) return 'exclusivo';
  return 'profissional';
};

// ANNUAL aqui é o valor TOTAL da cobrança anual (bate com selectedPlan.prices.ANNUAL
// em Checkout.tsx: 1044/1584/2124 = 12x o valor mensal). Antes desse conserto,
// esta tabela tinha 87/132/177 — o preço mensal EQUIVALENTE, não o total — e como
// esse backend recalcula o valor sozinho (nunca lê o finalPrice que o frontend
// manda), toda cobrança anual estava saindo por 1/12 do valor combinado com o
// cliente (ex.: R$87 cobrados no total em vez de R$1044 no plano Exclusivo).
const PLAN_PRICES = {
  'exclusivo': { MONTHLY: 97, SEMIANNUAL: 77, ANNUAL: 1044 },
  'profissional': { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 1584 },
  'master': { MONTHLY: 197, SEMIANNUAL: 157, ANNUAL: 2124 },
  'default': { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 1584 }
};

// Mesma tabela de handle-asaas-webhook (periodDaysFromDescription) — aqui
// não precisa ler descrição nenhuma, billingCycle já está em mãos.
const PERIOD_DAYS: Record<string, number> = { MONTHLY: 32, SEMIANNUAL: 190, ANNUAL: 370 };

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

// Extrai mensagem de erro do padrão de resposta do Asaas ({ errors: [{ description }] })
const asaasError = (resp: Response, data: any): string | null => {
  if (data?.errors?.length) return data.errors[0].description || 'Pagamento recusado pela operadora.';
  if (!resp.ok) return `Falha na comunicação com o gateway de pagamento (${resp.status}).`;
  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const { action, userId, planId, billingCycle, paymentMethod, coupon, customer = {}, creditCard } = body
    const canonicalPlanId = normalizePlanId(planId)
    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    if (action !== 'check-uniqueness') {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
           return jsonResponse({ success: false, message: 'Não autorizado. Faltando credenciais JWT.' }, 401);
        }
        const supabaseClient = createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
        const { data: { user: callerUser }, error: callerError } = await supabaseClient.auth.getUser();
        if (callerError || !callerUser || callerUser.id !== userId) {
           return jsonResponse({ success: false, message: 'Sessão inválida ou expirada. Tente novamente.' }, 401);
        }
    } else {
        // check-uniqueness é público (roda antes do cadastro) — rate limit por IP
        // contra enumeração de CPF/telefone.
        const { data: allowed, error: rlError } = await supabaseAdmin.rpc('hit_rate_limit', {
          p_key: `chk-uniq:${clientIp}`, p_max: 15, p_window_seconds: 60
        });
        if (!rlError && allowed === false) {
          return jsonResponse({ success: false, message: 'Muitas tentativas. Aguarde um minuto e tente novamente.' }, 429);
        }
    }

    if (action !== 'check-uniqueness') {
      if (!customer.email || !customer.cpfCnpj || !customer.phone || !customer.name) {
        return jsonResponse({ success: false, message: 'Dados do formulário incompletos ou em branco.' });
      }
    }

    if (!ASAAS_API_KEY) {
      return jsonResponse({ success: false, message: 'Chave API Asaas não encontrada.' })
    }

    const cleanCpf = customer.cpfCnpj ? customer.cpfCnpj.replace(/\D/g, '') : ''
    const cleanPhone = customer.phone ? customer.phone.replace(/\D/g, '') : ''

    if (action === 'check-uniqueness') {
      if (cleanCpf) {
          const { data: ident } = await supabaseAdmin.from('billing_identities').select('user_id').eq('cpf_cnpj_normalized', cleanCpf).maybeSingle()
          if (ident && ident.user_id !== userId) {
              return jsonResponse({ success: false, message: 'Este CPF/CNPJ já está cadastrado em outra conta.' })
          }
      }
      if (cleanPhone) {
          const { data: ident } = await supabaseAdmin.from('billing_identities').select('user_id').eq('phone_normalized', cleanPhone).maybeSingle()
          if (ident && ident.user_id !== userId) {
              return jsonResponse({ success: false, message: 'Este WhatsApp já está cadastrado em outra conta.' })
          }
      }

      if (cleanCpf) {
          const cpfResp = await fetch(`${ASAAS_API_URL}/customers?cpfCnpj=${encodeURIComponent(cleanCpf)}`, { headers: { 'access_token': ASAAS_API_KEY } })
          const cpfCustomers = await cpfResp.json()
          if (cpfCustomers.data && cpfCustomers.data.length > 0 && customer.email) {
            const existingCpfCust = cpfCustomers.data[0];
            if (existingCpfCust.email?.toLowerCase() !== customer.email.toLowerCase()) {
              return jsonResponse({ success: false, message: 'Este CPF/CNPJ possui faturamento em outro e-mail original.' })
            }
          }
      }
      return jsonResponse({ success: true })
    }

    // Cartão de crédito exige os dados completos do titular (exigência do Asaas)
    if (paymentMethod === 'CREDIT_CARD') {
      if (!creditCard?.number || !creditCard?.holderName || !creditCard?.expiryMonth || !creditCard?.expiryYear || !creditCard?.ccv) {
        return jsonResponse({ success: false, message: 'Dados do cartão incompletos. Verifique e tente novamente.' });
      }
      if (!creditCard?.postalCode || !creditCard?.addressNumber) {
        return jsonResponse({ success: false, message: 'Informe o CEP e o número do endereço do titular do cartão.' });
      }
    }

    await supabaseAdmin.from('billing_identities').upsert({
        user_id: userId,
        cpf_cnpj_normalized: cleanCpf,
        phone_normalized: cleanPhone
    }, { onConflict: 'user_id' });

    let asaasCustomerId = null
    try {
        const customerResp = await fetch(`${ASAAS_API_URL}/customers?email=${encodeURIComponent(customer.email)}`, { headers: { 'access_token': ASAAS_API_KEY } })
        const customers = await customerResp.json()
        asaasCustomerId = customers.data?.[0]?.id
    } catch (e) {}

    if (!asaasCustomerId) {
      const newCustomerResp = await fetch(`${ASAAS_API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          cpfCnpj: cleanCpf,
          phone: cleanPhone,
          notificationDisabled: true
        })
      })
      const newCustomer = await newCustomerResp.json()
      const custErr = asaasError(newCustomerResp, newCustomer);
      if (custErr || !newCustomer.id) {
        return jsonResponse({ success: false, message: custErr || 'Não foi possível criar o cadastro de cobrança.' })
      }
      asaasCustomerId = newCustomer.id
    }

    if (action === 'upgrade-subscription') {
      // Cancela a(s) assinatura(s) ativa(s) anterior(es) antes de criar a nova,
      // pra não deixar duas assinaturas cobrando o mesmo cliente.
      const subIdsToCancel = new Set<string>();
      const { data: prevSettings } = await supabaseAdmin.from('user_settings').select('asaas_subscription_id').eq('user_id', userId).maybeSingle();
      if (prevSettings?.asaas_subscription_id) subIdsToCancel.add(prevSettings.asaas_subscription_id);

      try {
        const subsResp = await fetch(`${ASAAS_API_URL}/subscriptions?customer=${asaasCustomerId}&status=ACTIVE`, { headers: { 'access_token': ASAAS_API_KEY } });
        const subsData = await subsResp.json();
        for (const s of subsData.data || []) subIdsToCancel.add(s.id);
      } catch (e) {}

      for (const subId of subIdsToCancel) {
        await fetch(`${ASAAS_API_URL}/subscriptions/${subId}`, { method: 'DELETE', headers: { 'access_token': ASAAS_API_KEY } }).catch(() => {});
      }
    }

    let planDiscount = 0;
    let couponCode: string | null = null;
    if (coupon) {
        const normCode = coupon.toUpperCase().trim();
        const { data: dbCoupon } = await supabaseAdmin.from('coupons').select('*').eq('code', normCode).maybeSingle();
        const appliesToPlan = !dbCoupon?.applies_to_plans || dbCoupon.applies_to_plans.length === 0 || dbCoupon.applies_to_plans.includes(canonicalPlanId);
        if (dbCoupon && dbCoupon.active && appliesToPlan && (!dbCoupon.expires_at || new Date(dbCoupon.expires_at).getTime() > Date.now()) && (!dbCoupon.max_redemptions || dbCoupon.times_redeemed < dbCoupon.max_redemptions)) {
            planDiscount = dbCoupon.discount_percent;
            couponCode = normCode;
        }
    }

    if (planDiscount === 100) {
        // Acesso gratuito: sem cobrança, então o resgate é confirmado na hora.
        if (couponCode) {
            await supabaseAdmin.rpc('increment_coupon', { c_code: couponCode }).then(() => {}, () => {});
            await supabaseAdmin.from('coupon_redemptions').upsert({
                user_id: userId, code: couponCode, status: 'confirmed'
            }, { onConflict: 'user_id,code' }).then(() => {}, () => {});
        }
        // Prazo do cupom grátis segue o ciclo escolhido (mensal/semestral/
        // anual) — antes era sempre 30 dias fixos, mesmo pra quem resgatou
        // num plano anual (derrubaria o acesso de um cupom anual em 1 mês).
        // billing_cycle gravado também, pra regularize-subscription saber
        // depois qual valor cobrar se o cupom expirar sem renovação.
        const freeDays = PERIOD_DAYS[billingCycle as keyof typeof PERIOD_DAYS] || PERIOD_DAYS.MONTHLY;
        await supabaseAdmin.from('user_entitlements').update({
            subscription_status: 'active',
            plan_id: canonicalPlanId,
            billing_cycle: billingCycle || 'MONTHLY',
            current_period_end: new Date(Date.now() + freeDays * 24 * 60 * 60 * 1000).toISOString()
        }).eq('user_id', userId);
        return jsonResponse({ success: true, isFree: true })
    }

    // Cupom em fluxo pago: registra como pendente — o webhook confirma (e só
    // então incrementa times_redeemed) quando o pagamento for aprovado.
    if (couponCode) {
        await supabaseAdmin.from('coupon_redemptions').upsert({
            user_id: userId, code: couponCode, status: 'pending'
        }, { onConflict: 'user_id,code', ignoreDuplicates: true }).then(() => {}, () => {});
    }

    let rawValue = (PLAN_PRICES[canonicalPlanId as keyof typeof PLAN_PRICES] || PLAN_PRICES.default)[billingCycle as 'MONTHLY'|'SEMIANNUAL'|'ANNUAL'];
    if (coupon && planDiscount > 0) {
        rawValue = rawValue - (rawValue * planDiscount / 100);
    }

    if (paymentMethod === 'PIX') {
        rawValue = rawValue * 0.95;
    }

    const value = Math.max(parseFloat(rawValue.toFixed(2)), 5.00);

    let paymentBody: any = {
      customer: asaasCustomerId,
      billingType: paymentMethod,
      value: value,
      description: `Plano ${canonicalPlanId} - ${billingCycle}`,
      externalReference: userId
    }

    // Dados do cartão enviados diretamente ao gateway na criação da cobrança —
    // sem eles o Asaas não efetua a cobrança automática.
    if (paymentMethod === 'CREDIT_CARD') {
      paymentBody.creditCard = {
        holderName: creditCard.holderName,
        number: creditCard.number,
        expiryMonth: creditCard.expiryMonth,
        expiryYear: creditCard.expiryYear,
        ccv: creditCard.ccv
      };
      paymentBody.creditCardHolderInfo = {
        name: creditCard.holderName || customer.name,
        email: customer.email,
        cpfCnpj: cleanCpf,
        postalCode: String(creditCard.postalCode).replace(/\D/g, ''),
        addressNumber: String(creditCard.addressNumber),
        phone: cleanPhone,
        mobilePhone: cleanPhone
      };
      paymentBody.remoteIp = clientIp;
    }

    if (billingCycle === 'MONTHLY') {
      paymentBody.cycle = 'MONTHLY'
      // Cobrança de HOJE, não de amanhã. Antes: nextDueDate = amanhã. A
      // assinatura era criada com sucesso no Asaas (por isso a tela sempre
      // dizia "pagamento processado"), mas o motor de cobrança do Asaas só
      // tenta a primeira cobrança NO DIA marcado em nextDueDate — com
      // "amanhã", nenhum valor saía do cartão no dia do cadastro, e o
      // cliente ficava sem acesso (liberado só pelo webhook de pagamento
      // confirmado) até essa cobrança futura de fato acontecer, sem nenhum
      // aviso de que nada tinha sido cobrado ainda.
      paymentBody.nextDueDate = new Date().toISOString().split('T')[0]
      const subResp = await fetch(`${ASAAS_API_URL}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
        body: JSON.stringify(paymentBody)
      })
      const subData = await subResp.json()
      const subErr = asaasError(subResp, subData);
      if (subErr || !subData?.id) {
        return jsonResponse({ success: false, message: subErr || 'Não foi possível criar a assinatura.' })
      }

      await supabaseAdmin.from('user_settings').update({ asaas_subscription_id: subData.id, cancel_at_period_end: false }).eq('user_id', userId);

      if (paymentMethod === 'CREDIT_CARD') {
        return jsonResponse({ success: true })
      } else {
        const payResp = await fetch(`${ASAAS_API_URL}/payments?subscription=${subData.id}`, { headers: { 'access_token': ASAAS_API_KEY } })
        const payData = await payResp.json()
        const firstPayment = payData.data?.[0]

        if (firstPayment && paymentMethod === 'PIX') {
          const pixResp = await fetch(`${ASAAS_API_URL}/payments/${firstPayment.id}/pixQrCode`, { headers: { 'access_token': ASAAS_API_KEY } })
          const pixData = await pixResp.json()
          return jsonResponse({ success: true, pix: { qrcode: pixData.encodedImage, payload: pixData.payload } })
        }
      }
    } else {
      paymentBody.dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().split('T')[0]

      if (paymentMethod === 'CREDIT_CARD') {
         const installments = Math.min(Math.max(parseInt(creditCard?.installments) || 12, 1), 12);
         if (installments > 1) {
           paymentBody.installmentCount = installments
           paymentBody.installmentValue = parseFloat((value / installments).toFixed(2))
         }
      }

      const payResp = await fetch(`${ASAAS_API_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
        body: JSON.stringify(paymentBody)
      })
      const payData = await payResp.json()
      const payErr = asaasError(payResp, payData);
      if (payErr || !payData?.id) {
        return jsonResponse({ success: false, message: payErr || 'Não foi possível criar a cobrança.' })
      }

      if (paymentMethod === 'PIX') {
        const pixResp = await fetch(`${ASAAS_API_URL}/payments/${payData.id}/pixQrCode`, { headers: { 'access_token': ASAAS_API_KEY } })
        const pixData = await pixResp.json()
        return jsonResponse({ success: true, pix: { qrcode: pixData.encodedImage, payload: pixData.payload } })
      }
      return jsonResponse({ success: true })
    }

    return jsonResponse({ success: false, message: 'Erro interno.' })
  } catch (error: any) {
    return jsonResponse({ success: false, message: error.message }, 500)
  }
})
