import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Puxa do Asaas todas as cobranças pagas (RECEIVED/CONFIRMED) e grava em subscription_payments
   com taxa (valor − netValue) e líquido. Apple e Google entram pelo handle-revenuecat-webhook.
   - Chamada pelo pg_cron (diário) ou à mão, com o x-internal-token (internal_config.cron_token).
   - Idempotente: upsert por (provider, external_id).
   - is_test: valor abaixo de R$ 20 (planos reais custam a partir de R$ 49,90) ou conta de administrador. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
const ASAAS_API_URL = 'https://www.asaas.com/api/v3'

const enc = new TextEncoder()
const equals = (a: string, b: string) => {
  const x = enc.encode(a), y = enc.encode(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function asaas(path: string) {
  const r = await fetch(`${ASAAS_API_URL}${path}`, { headers: { access_token: ASAAS_API_KEY! } })
  if (!r.ok) throw new Error(`Asaas ${r.status} em ${path}`)
  return await r.json()
}

const planFrom = (d: string): string | null => {
  const t = (d || '').toLowerCase()
  if (t.includes('master')) return 'master'
  if (t.includes('profissional')) return 'profissional'
  if (t.includes('exclusivo')) return 'exclusivo'
  return null
}

serve(async (req) => {
  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
  const { data: cfg } = await admin.from('internal_config').select('value').eq('key', 'cron_token').single()
  const secret = cfg?.value as string | undefined
  const token = req.headers.get('x-internal-token')
  if (!secret || !token || !equals(token, secret)) {
    return new Response(JSON.stringify({ success: false, message: 'Não autorizado.' }), { status: 401 })
  }
  if (!ASAAS_API_KEY) return new Response(JSON.stringify({ success: false, message: 'ASAAS_API_KEY ausente.' }), { status: 500 })

  try {
    const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const byEmail = new Map<string, string>()
    for (const u of usersPage?.users ?? []) if (u.email) byEmail.set(u.email.toLowerCase(), u.id)
    const { data: admins } = await admin.from('user_settings').select('user_id').eq('is_admin', true)
    const adminIds = new Set((admins ?? []).map((a: { user_id: string }) => a.user_id))

    const customers = new Map<string, { email: string | null; name: string | null }>()
    const rows: Record<string, unknown>[] = []
    for (const status of ['RECEIVED', 'CONFIRMED']) {
      for (let offset = 0; offset < 2000; offset += 100) {
        const page = await asaas(`/payments?status=${status}&limit=100&offset=${offset}`)
        for (const p of page.data ?? []) {
          if (!customers.has(p.customer)) {
            const c = await asaas(`/customers/${p.customer}`).catch(() => null)
            customers.set(p.customer, { email: c?.email?.toLowerCase() ?? null, name: c?.name ?? null })
          }
          const c = customers.get(p.customer)!
          const gross = Number(p.value)
          const net = p.netValue != null ? Number(p.netValue) : gross
          const paid = String(p.paymentDate || p.confirmedDate || p.clientPaymentDate || p.dueDate || '').slice(0, 10)
          if (!paid || !(gross > 0)) continue
          const fee = Math.max(gross - net, 0)
          const userId = (c.email && byEmail.get(c.email)) || null
          rows.push({
            provider: 'asaas',
            external_id: p.id,
            user_id: userId,
            email: c.email,
            customer_name: c.name,
            plan_id: planFrom(p.description || ''),
            gross_brl: gross,
            fee_brl: Math.round(fee * 100) / 100,
            net_brl: net,
            fee_pct: gross > 0 ? Math.round((fee / gross) * 10000) / 100 : null,
            paid_at: paid,
            is_test: gross < 20 || (userId ? adminIds.has(userId) : false),
            note: `${p.billingType} · ${p.status} · ${(p.description || '').slice(0, 80)}`,
          })
        }
        if (!page.hasMore) break
      }
    }
    if (rows.length) {
      const { error } = await admin.from('subscription_payments').upsert(rows, { onConflict: 'provider,external_id' })
      if (error) throw error
    }
    return new Response(JSON.stringify({ success: true, asaas_payments: rows.length }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('sync-revenue', e)
    return new Response(JSON.stringify({ success: false, message: String((e as Error).message || e) }), { status: 500 })
  }
})
