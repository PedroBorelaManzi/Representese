import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders })
    }

    const { cnpj } = await req.json()
    if (!cnpj) {
      return new Response(JSON.stringify({ error: 'CNPJ obrigatório' }), { status: 400, headers: corsHeaders })
    }

    const cleanCnpj = cnpj.replace(/\D/g, '')

    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`)
    
    if (!res.ok) {
       return new Response(JSON.stringify({ error: 'Erro ao consultar ReceitaWS' }), { status: res.status, headers: corsHeaders })
    }

    const data = await res.json()
    
    if (data.status === "ERROR") {
        return new Response(JSON.stringify({ error: data.message }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ 
      phone: data.telefone || null,
      email: data.email || null 
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
