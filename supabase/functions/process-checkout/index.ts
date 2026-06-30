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

const PLAN_PRICES = {
  'exclusivo': { MONTHLY: 97, SEMIANNUAL: 77, ANNUAL: 87 },
  'profissional': { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 132 },
  'master': { MONTHLY: 197, SEMIANNUAL: 157, ANNUAL: 177 },
  'default': { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 132 }
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

    if (action !== 'check-uniqueness') {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
           return new Response(JSON.stringify({ success: false, message: 'Não autorizado. Faltando credenciais JWT.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
        }
        const supabaseClient = createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
        const { data: { user: callerUser }, error: callerError } = await supabaseClient.auth.getUser();
        if (callerError || !callerUser || callerUser.id !== userId) {
           return new Response(JSON.stringify({ success: false, message: 'Sessão inválida ou expirada. Tente novamente.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
        }
    }

    if (action !== 'check-uniqueness') {
      if (!customer.email || !customer.cpfCnpj || !customer.phone || !customer.name) {
        return new Response(JSON.stringify({ success: false, message: 'Dados do formulário incompletos ou em branco.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }
    }

    if (!ASAAS_API_KEY) {
      return new Response(JSON.stringify({ success: false, message: 'Chave API Asaas não encontrada.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const cleanCpf = customer.cpfCnpj ? customer.cpfCnpj.replace(/\D/g, '') : ''
    const cleanPhone = customer.phone ? customer.phone.replace(/\D/g, '') : ''

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    if (action === 'check-uniqueness') {
      if (cleanCpf) {
          const { data: ident } = await supabaseAdmin.from('billing_identities').select('user_id').eq('cpf_cnpj_normalized', cleanCpf).maybeSingle()
          if (ident && ident.user_id !== userId) {
              return new Response(JSON.stringify({ success: false, message: 'Este CPF/CNPJ já está cadastrado em outra conta.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
          }
      }
      if (cleanPhone) {
          const { data: ident } = await supabaseAdmin.from('billing_identities').select('user_id').eq('phone_normalized', cleanPhone).maybeSingle()
          if (ident && ident.user_id !== userId) {
              return new Response(JSON.stringify({ success: false, message: 'Este WhatsApp já está cadastrado em outra conta.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
          }
      }

      if (cleanCpf) {
          const cpfResp = await fetch(`${ASAAS_API_URL}/customers?cpfCnpj=${encodeURIComponent(cleanCpf)}`, { headers: { 'access_token': ASAAS_API_KEY } })
          const cpfCustomers = await cpfResp.json()
          if (cpfCustomers.data && cpfCustomers.data.length > 0 && customer.email) {
            const existingCpfCust = cpfCustomers.data[0];
            if (existingCpfCust.email?.toLowerCase() !== customer.email.toLowerCase()) {
              return new Response(JSON.stringify({ success: false, message: 'Este CPF/CNPJ possui faturamento em outro e-mail original.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
            }
          }
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
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
    if (coupon) {
        const normCode = coupon.toUpperCase().trim();
        const { data: dbCoupon } = await supabaseAdmin.from('coupons').select('*').eq('code', normCode).maybeSingle();
        const appliesToPlan = !dbCoupon?.applies_to_plans || dbCoupon.applies_to_plans.length === 0 || dbCoupon.applies_to_plans.includes(canonicalPlanId);
        if (dbCoupon && dbCoupon.active && appliesToPlan && (!dbCoupon.expires_at || new Date(dbCoupon.expires_at).getTime() > Date.now()) && (!dbCoupon.max_redemptions || dbCoupon.times_redeemed < dbCoupon.max_redemptions)) {
            planDiscount = dbCoupon.discount_percent;
            await supabaseAdmin.rpc('increment_coupon', { c_code: normCode }).catch(async () => {
                await supabaseAdmin.from('coupons').update({ times_redeemed: dbCoupon.times_redeemed + 1 }).eq('code', normCode);
            });
        }
    }

    if (planDiscount === 100) {
        await supabaseAdmin.from('user_entitlements').update({
            subscription_status: 'active',
            plan_id: canonicalPlanId,
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }).eq('user_id', userId);
        return new Response(JSON.stringify({ success: true, isFree: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
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

    if (billingCycle === 'MONTHLY') {
      paymentBody.cycle = 'MONTHLY'
      paymentBody.nextDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().split('T')[0]
      const subResp = await fetch(`${ASAAS_API_URL}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
        body: JSON.stringify(paymentBody)
      })
      const subData = await subResp.json()

      if (subData?.id) {
        await supabaseAdmin.from('user_settings').update({ asaas_subscription_id: subData.id, cancel_at_period_end: false }).eq('user_id', userId);
      }

      if (paymentMethod === 'CREDIT_CARD') {
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      } else {
        const payResp = await fetch(`${ASAAS_API_URL}/payments?subscription=${subData.id}`, { headers: { 'access_token': ASAAS_API_KEY } })
        const payData = await payResp.json()
        const firstPayment = payData.data?.[0]
        
        if (firstPayment && paymentMethod === 'PIX') {
          const pixResp = await fetch(`${ASAAS_API_URL}/payments/${firstPayment.id}/pixQrCode`, { headers: { 'access_token': ASAAS_API_KEY } })
          const pixData = await pixResp.json()
          return new Response(JSON.stringify({ success: true, pix: { qrcode: pixData.encodedImage, payload: pixData.payload } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }
      }
    } else {
      paymentBody.dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().split('T')[0]
      
      if (paymentMethod === 'CREDIT_CARD') {
         paymentBody.installmentCount = 12
         paymentBody.installmentValue = parseFloat((value / 12).toFixed(2))
      }

      const payResp = await fetch(`${ASAAS_API_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY },
        body: JSON.stringify(paymentBody)
      })
      const payData = await payResp.json()
      
      if (paymentMethod === 'PIX') {
        const pixResp = await fetch(`${ASAAS_API_URL}/payments/${payData.id}/pixQrCode`, { headers: { 'access_token': ASAAS_API_KEY } })
        const pixData = await pixResp.json()
        return new Response(JSON.stringify({ success: true, pix: { qrcode: pixData.encodedImage, payload: pixData.payload } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    return new Response(JSON.stringify({ success: false, message: 'Erro interno.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
