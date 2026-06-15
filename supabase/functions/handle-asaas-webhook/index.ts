// supabase/functions/handle-asaas-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const body = await req.json()
    const { event, payment } = body

    // Validação de Segurança do Token
    const receivedToken = req.headers.get('asaas-access-token')
    const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

    if (!expectedToken || receivedToken !== expectedToken) {
      console.error('Tentativa de acesso bloqueada: Token Inválido ou Ausente')
      return new Response(JSON.stringify({ message: 'Acesso não autorizado' }), { status: 401 })
    }

    console.log(`Webhook Evento Asaas recebido: ${event}`, { paymentId: payment?.id, customerId: payment?.customer })

    if (!payment?.customer) {
      return new Response(JSON.stringify({ message: 'Sem dados de cliente' }), { status: 200 })
    }

    // 1. Identificar Usuário (Prioridade: externalReference, Fallback: e-mail)
    let userId = payment.externalReference

    if (!userId) {
      console.log('Sem externalReference, buscando por e-mail no Asaas...')
      const customerResp = await fetch(`https://www.asaas.com/api/v3/customers/${payment.customer}`, {
        headers: { 'access_token': Deno.env.get('ASAAS_API_KEY')! }
      })
      const customerData = await customerResp.json()
      const customerEmail = customerData.email

      if (customerEmail) {
        const { data: userData } = await supabase.auth.admin.listUsers()
        const user = userData.users.find(u => u.email === customerEmail)
        userId = user?.id
      }
    }

    if (!userId) {
      console.error('Usuário não identificado para o pagamento:', payment.id)
      return new Response(JSON.stringify({ message: 'Usuário não encontrado' }), { status: 200 })
    }

    // 2. Determinar o novo status
    let newStatus = 'active'
    let isCanceled = false;
    
    if (event === 'PAYMENT_OVERDUE') newStatus = 'past_due'
    if (event === 'PAYMENT_DELETED') newStatus = 'inactive'
    if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_CANCELED') {
      // Nao cortamos o acesso imediatamente. Marcamos como cancelado.
      isCanceled = true;
    }
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') newStatus = 'active'

    // 3. Atualizar user_settings no Supabase (O(1) lookup por user_id)
    const updateData: any = { 
      updated_at: new Date().toISOString()
    }

    if (isCanceled) {
      updateData.cancel_at_period_end = true;
      // Mantém o status que estava (provavelmente active).
    } else {
      updateData.subscription_status = newStatus;
      updateData.cancel_at_period_end = false;
    }

    // Tentar inferir o plano pela descrição do Asaas se disponível
    if (payment.description) {
      const desc = payment.description.toLowerCase();
      if (desc.includes('master')) updateData.plan_id = 'master';
      else if (desc.includes('premium')) updateData.plan_id = 'premium';
      else if (desc.includes('exclusivo')) updateData.plan_id = 'exclusivo';
    }

    const { error } = await supabase
      .from('user_settings')
      .update(updateData)
      .eq('user_id', userId)

    if (error) {
      console.error('Erro ao atualizar status:', error)
    } else {
      console.log(`Status do usuário ${userId} atualizado para: ${newStatus}`)
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })

  } catch (error) {
    console.error('Erro no Webhook:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
