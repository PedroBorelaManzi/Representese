// supabase/functions/regularize-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
const ASAAS_API_URL = 'https://www.asaas.com/api/v3'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const PLAN_PRICES: Record<string, number> = {
  'exclusivo': 97,
  'profissional': 147,
  'master': 197,
  'default': 147
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // O userId vem sempre da sessão autenticada, nunca do corpo da requisição —
    // sem isso, qualquer usuário logado podia passar o ID de outra pessoa aqui
    // e gerar uma cobrança no Asaas em nome dela.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: 'Nenhum token fornecido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { data: { user: caller }, error: callerError } = await createClient(
      SUPABASE_URL!,
      SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()

    if (callerError || !caller) {
      return new Response(JSON.stringify({ success: false, message: 'Sessão inválida.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const userId = caller.id

    console.log(`Regularização v1.0.4 - Iniciando para: ${userId}`)

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(userId)
    if (authError || !user) throw new Error('Usuário não encontrado.')

    const { data: settings } = await supabase
      .from('user_settings')
      .select('plan_id')
      .eq('user_id', userId)
      .single()

    const searchResp = await fetch(`${ASAAS_API_URL}/customers?email=${encodeURIComponent(user.email!)}`, {
      headers: { 
        'access_token': ASAAS_API_KEY!,
        'Content-Type': 'application/json'
      }
    })

    if (!searchResp.ok) {
      const errorText = await searchResp.text()
      throw new Error(`Erro API Asaas: ${searchResp.status} - ${errorText}`)
    }

    const searchData = await searchResp.json()
    const asaasCustomerId = searchData.data?.[0]?.id

    if (!asaasCustomerId) {
      throw new Error(`E-mail ${user.email} não encontrado no Asaas.`)
    }

    const planId = settings?.plan_id || 'profissional'
    const baseValue = PLAN_PRICES[planId] || PLAN_PRICES['default']
    const totalToPay = baseValue // Removida a multa de R$ 30

    const paymentResp = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_API_KEY! },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'UNDEFINED',
        value: totalToPay,
        dueDate: new Date().toISOString().split('T')[0],
        description: `Regularização (Plano ${planId})`,
        externalReference: `REG_${userId}`
      })
    })

    const responseText = await paymentResp.text()
    const paymentData = JSON.parse(responseText)

    if (!paymentResp.ok) {
      throw new Error(`Erro ao gerar fatura: ${paymentData.errors?.[0]?.description || 'Erro desconhecido'}`)
    }

    return new Response(JSON.stringify({ success: true, invoiceUrl: paymentData.invoiceUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
