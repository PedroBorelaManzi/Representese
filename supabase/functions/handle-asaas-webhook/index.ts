import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const body = await req.json()
    const { event, payment } = body

    const receivedToken = req.headers.get('asaas-access-token')
    const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

    if (!expectedToken || receivedToken !== expectedToken) {
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

    await supabase.from('user_entitlements').upsert({
      user_id: userId,
      ...updateData
    }, { onConflict: 'user_id' })

    // Pagamento aprovado: confirma o resgate de cupom pendente deste usuário
    // (o incremento de times_redeemed só acontece aqui, uma única vez).
    if (newStatus === 'active') {
      const { data: pendings } = await supabase.from('coupon_redemptions')
        .select('code').eq('user_id', userId).eq('status', 'pending');
      for (const p of pendings || []) {
        const { data: updated } = await supabase.from('coupon_redemptions')
          .update({ status: 'confirmed' })
          .eq('user_id', userId).eq('code', p.code).eq('status', 'pending')
          .select('code');
        if (updated && updated.length > 0) {
          await supabase.rpc('increment_coupon', { c_code: p.code }).then(() => {}, () => {});
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
