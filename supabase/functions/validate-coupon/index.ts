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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const { code, planId } = await req.json()

    if (!code) {
      return new Response(JSON.stringify({ valid: false, message: 'Código não fornecido' }), { status: 200, headers: corsHeaders })
    }

    const { data: coupon } = await supabase.from('coupons').select('*').eq('code', code.toUpperCase().trim()).maybeSingle()

    if (!coupon || !coupon.active) {
      return new Response(JSON.stringify({ valid: false, message: 'Cupom inválido' }), { status: 200, headers: corsHeaders })
    }

    if (coupon.applies_to_plans && coupon.applies_to_plans.length > 0) {
      if (planId && !coupon.applies_to_plans.includes(planId)) {
        return new Response(JSON.stringify({ valid: false, message: 'Não aplicável a este plano' }), { status: 200, headers: corsHeaders })
      }
    }

    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ valid: false, message: 'Cupom expirado' }), { status: 200, headers: corsHeaders })
    }

    if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) {
      return new Response(JSON.stringify({ valid: false, message: 'Limite de usos atingido' }), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({
      valid: true,
      discount_percent: coupon.discount_percent
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
