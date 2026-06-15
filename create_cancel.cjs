const fs = require('fs');

const code = `import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
const ASAAS_API_URL = Deno.env.get('ASAAS_API_URL') || 'https://sandbox.asaas.com/api/v3'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nenhum token fornecido' }), { status: 401, headers: corsHeaders })
    }

    const { data: { user }, error: userError } = await createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } }).auth.getUser()
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: corsHeaders })
    }

    const { data: userSettings, error: dbError } = await supabaseClient
      .from('user_settings')
      .select('asaas_subscription_id')
      .eq('user_id', user.id)
      .single()

    if (dbError || !userSettings?.asaas_subscription_id) {
      return new Response(JSON.stringify({ error: 'Assinatura não encontrada' }), { status: 404, headers: corsHeaders })
    }

    const subscriptionId = userSettings.asaas_subscription_id

    // Cancelar no Asaas
    const resp = await fetch(\`\${ASAAS_API_URL}/subscriptions/\${subscriptionId}\`, {
      method: 'DELETE',
      headers: {
        'access_token': ASAAS_API_KEY,
      }
    })

    const asaasData = await resp.json()

    if (!resp.ok && !asaasData.deleted) {
       console.error('Asaas error:', asaasData)
       return new Response(JSON.stringify({ error: 'Falha ao cancelar no Asaas' }), { status: 400, headers: corsHeaders })
    }

    // Atualizar no banco de dados para não renovar
    await supabaseClient
      .from('user_settings')
      .update({ cancel_at_period_end: true })
      .eq('user_id', user.id)

    return new Response(JSON.stringify({ success: true, message: 'Assinatura cancelada com sucesso.' }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })

  } catch (error) {
    console.error('Erro geral:', error)
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: corsHeaders })
  }
})
`;

fs.writeFileSync('supabase/functions/cancel-subscription/index.ts', code, 'utf8');
console.log('Cancel function created');
