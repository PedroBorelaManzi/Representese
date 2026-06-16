import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const normalizePlanId = (val: string): string => {
  if (!val) return 'profissional';
  const v = val.toLowerCase();
  if (v.includes('master')) return 'master';
  if (v.includes('exclusivo')) return 'exclusivo';
  return 'profissional';
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

    let newStatus = 'active'
    let isCanceled = false;
    
    if (event === 'PAYMENT_OVERDUE') newStatus = 'past_due'
    if (event === 'PAYMENT_DELETED') newStatus = 'inactive'
    if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_CANCELED') {
      isCanceled = true;
    }
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') newStatus = 'active'

    const updateData: any = { 
      updated_at: new Date().toISOString()
    }

    if (isCanceled) {
      updateData.cancel_at_period_end = true;
    } else {
      updateData.subscription_status = newStatus;
      updateData.cancel_at_period_end = false;
    }

    if (payment.description) {
      updateData.plan_id = normalizePlanId(payment.description);
    }

    await supabase.from('user_entitlements').upsert({
      user_id: userId,
      ...updateData
    }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
