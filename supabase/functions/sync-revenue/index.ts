import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Puxa do Asaas as cobranças pagas (RECEIVED/CONFIRMED) e grava em subscription_payments
   com taxa (valor − netValue) e líquido. Apple e Google entram em tempo real pelo
   handle-revenuecat-webhook (trigger log_iap_payment).
   - Chamada de duas formas: pg_cron diário (x-internal-token) ou pelo admin ao abrir a aba Relatórios (JWT de admin).
   - Incremental: só busca cobranças criadas nos últimos ~45 dias antes do último pagamento já gravado
     (pega as que mudaram de CONFIRMED para RECEIVED). Com {"full": true} ou tabela vazia, busca tudo.
   - Idempotente: upsert por (provider, external_id).
   - is_test (fica fora da receita): valor abaixo de R$ 20 (planos reais custam a partir de R$ 49,90), administrador,
     e-mail em revenue_test_emails ou do domínio representese.com. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
const ASAAS_API_URL = 'https://www.asaas.com/api/v3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

  // Autorização: token interno (cron) OU usuário administrador logado (aba Relatórios).
  let autorizado = false
  const internal = req.headers.get('x-internal-token')
  if (internal) {
    const { data: cfg } = await admin.from('internal_config').select('value').eq('key', 'cron_token').single()
    const secret = cfg?.value as string | undefined
    autorizado = !!secret && equals(internal, secret)
  } else {
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const { data: { user } } = await createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } } }).auth.getUser()
      if (user) {
        const { data: s } = await admin.from('user_settings').select('is_admin').eq('user_id', user.id).maybeSingle()
        autorizado = s?.is_admin === true
      }
    }
  }
  if (!autorizado) return json({ success: false, message: 'Não autorizado.' }, 401)
  if (!ASAAS_API_KEY) return json({ success: false, message: 'ASAAS_API_KEY ausente.' }, 500)

  try {
    const body = await req.json().catch(() => ({})) as { full?: boolean }

    // Janela incremental: a partir de 45 dias antes do último pagamento do Asaas já gravado.
    let desde: string | null = null
    if (!body.full) {
      const { data: ult } = await admin.from('subscription_payments').select('paid_at').eq('provider', 'asaas').order('paid_at', { ascending: false }).limit(1)
      if (ult?.[0]?.paid_at) {
        desde = new Date(new Date(ult[0].paid_at + 'T12:00:00Z').getTime() - 45 * 86400000).toISOString().slice(0, 10)
      }
    }

    const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const byEmail = new Map<string, string>()
    for (const u of usersPage?.users ?? []) if (u.email) byEmail.set(u.email.toLowerCase(), u.id)
    const { data: admins } = await admin.from('user_settings').select('user_id').eq('is_admin', true)
    const adminIds = new Set((admins ?? []).map((a: { user_id: string }) => a.user_id))
    const { data: testes } = await admin.from('revenue_test_emails').select('email')
    const testEmails = new Set((testes ?? []).map((t: { email: string }) => t.email.toLowerCase()))

    const customers = new Map<string, { email: string | null; name: string | null }>()
    const rows: Record<string, unknown>[] = []
    for (const status of ['RECEIVED', 'CONFIRMED']) {
      for (let offset = 0; offset < 2000; offset += 100) {
        const filtro = desde ? `&dateCreated[ge]=${desde}` : ''
        const page = await asaas(`/payments?status=${status}&limit=100&offset=${offset}${filtro}`)
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
            is_test: gross < 20 || (userId ? adminIds.has(userId) : false) || (c.email ? testEmails.has(c.email) || c.email.endsWith('@representese.com') : false),
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
    return json({ success: true, asaas_payments: rows.length, incremental: !!desde })
  } catch (e) {
    console.error('sync-revenue', e)
    return json({ success: false, message: String((e as Error).message || e) }, 500)
  }
})
