import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Espelha o mapa em src/lib/iosPlansData.ts — a Edge Function não importa
// src/, então o mapa de planos e o período (mensal/anual, embutido no
// identifier da Offering do RevenueCat) precisam ser resolvidos aqui.
const PLAN_IDS = ['exclusivo', 'profissional', 'master'];

// Eventos que liberam/mantêm acesso.
const ACTIVE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);
// Eventos que derrubam o acesso.
const INACTIVE_EVENTS = new Set(['EXPIRATION']);
// Só sinalizam "vai cancelar no fim do período" — não derruba na hora.
const CANCEL_AT_PERIOD_END_EVENTS = new Set(['CANCELLATION']);
// Billing retry: mantém acesso durante o grace period, mas sinaliza problema.
const PAST_DUE_EVENTS = new Set(['BILLING_ISSUE']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const body = await req.json()
    const event = body?.event

    // O RevenueCat manda de volta, sem modificar, o valor exato configurado
    // no campo "Authorization header" do dashboard (Project Settings →
    // Webhooks) — configurar lá com o mesmo valor de REVENUECAT_WEBHOOK_TOKEN,
    // com ou sem o prefixo "Bearer " (aceitamos os dois formatos).
    const authHeader = req.headers.get('authorization') || ''
    const receivedToken = authHeader.replace(/^Bearer\s+/i, '')
    const expectedToken = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN')

    if (!expectedToken || (receivedToken !== expectedToken && authHeader !== expectedToken)) {
      console.error('Tentativa de acesso bloqueada: Token Inválido ou Ausente')
      return new Response(JSON.stringify({ message: 'Acesso não autorizado' }), { status: 401 })
    }

    if (!event?.id) {
      return new Response(JSON.stringify({ message: 'Evento sem id' }), { status: 200 })
    }

    // Idempotência: o RevenueCat pode reenviar o mesmo evento.
    const { error: dupError } = await supabase.from('iap_webhook_events').insert({
      event_id: event.id, event_type: event.type || 'unknown'
    });
    if (dupError && dupError.code === '23505') {
      return new Response(JSON.stringify({ success: true, duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // app_user_id foi setado como o id do usuário no Supabase logo no login
    // (ver Purchases.logIn em src/lib/iap.ts) — sem isso não tem como saber
    // de quem é essa compra.
    const userId: string | undefined = event.app_user_id;
    if (!userId) {
      return new Response(JSON.stringify({ message: 'Sem app_user_id' }), { status: 200 })
    }

    const eventType: string = event.type || '';
    const productId: string = event.product_id || '';

    // productId no formato "com.representese.app.<plano>.<monthly|annual>"
    const planMatch = PLAN_IDS.find((p) => productId.includes(`.${p}.`));
    const billingCycle = productId.includes('.annual') ? 'ANNUAL' : 'MONTHLY';

    const updateData: any = {
      updated_at: new Date().toISOString(),
      subscription_provider: 'ios_iap',
      iap_app_user_id: userId,
    };

    if (event.original_transaction_id) {
      updateData.iap_original_transaction_id = String(event.original_transaction_id);
    }

    if (ACTIVE_EVENTS.has(eventType)) {
      updateData.subscription_status = 'active';
      updateData.cancel_at_period_end = false;
      if (planMatch) updateData.plan_id = planMatch;
      updateData.billing_cycle = billingCycle;
      if (event.expiration_at_ms) {
        updateData.current_period_end = new Date(event.expiration_at_ms).toISOString();
      }
    } else if (PAST_DUE_EVENTS.has(eventType)) {
      updateData.subscription_status = 'past_due';
    } else if (CANCEL_AT_PERIOD_END_EVENTS.has(eventType)) {
      updateData.cancel_at_period_end = true;
      // Continua ativo até acabar o período já pago — não mexe em subscription_status.
      if (event.expiration_at_ms) {
        updateData.current_period_end = new Date(event.expiration_at_ms).toISOString();
      }
    } else if (INACTIVE_EVENTS.has(eventType)) {
      updateData.subscription_status = 'inactive';
    } else {
      // TRANSFER, TEST, SUBSCRIPTION_PAUSED, etc. — nada a fazer ainda.
      return new Response(JSON.stringify({ success: true, ignored: eventType }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
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
