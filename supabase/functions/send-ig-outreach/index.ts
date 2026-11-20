import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Disparo único (20/11/2026) para a lista de contatos do Instagram de um representante comercial
   (leads com attribution.source = 'instagram-representante'). Chamada manual com o x-internal-token.
   Body: {"preview":"email"} manda só um teste; {"blast":true} envia a quem ainda não recebeu (passo 'ig1').
   O link de descadastro é o mesmo da função nurture-leads (HMAC com o cron_token). */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM = 'Represente-Se! <contato@representese.com>'
const SITE = 'https://www.representese.com'
const WHATSAPP = 'https://wa.me/5515997472785'
const STEP = 'ig1'

const enc = new TextEncoder()
const equals = (a: string, b: string) => {
  const x = enc.encode(a), y = enc.encode(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
async function sign(secret: string, email: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(email))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const p = (t: string) => `<p style="margin:0 0 18px 0;">${t}</p>`
const li = (t: string) => `<p style="margin:0 0 10px 0;">${t}</p>`

function build(nome: string, unsubUrl: string) {
  const n = esc(nome)
  const subject = nome ? `${nome}, conheça o sistema feito por representante, para representantes 📲` : 'Conheça o sistema feito por representante, para representantes 📲'
  const body =
    p(nome ? `Oi, ${n}, tudo bem?` : 'Oi, tudo bem?') +
    p('Você já conhece o <strong>Represente-Se!</strong>? É um sistema feito por representante comercial, para representantes comerciais.') +
    p('Ele foi pensado para você ter a melhor gestão do seu negócio: enxergar melhor a sua carteira de clientes, se organizar melhor, parar de perder tempo e se tornar o vendedor do futuro. Saiba como podemos te ajudar:') +
    li('✅ Carteira de clientes com busca automática de CNPJ') +
    li('✅ Pedidos, comissão e faturamento por empresa representada') +
    li('✅ Agenda de visitas') +
    li('✅ Organize tudo em um só lugar') +
    `<p style="margin:8px 0 18px 0;"></p>` +
    p('E você tem <strong>7 dias de garantia</strong>: se não gostar, devolvemos o seu dinheiro.') +
    p(`👉 Conheça o nosso site e crie a sua conta: <a href="${SITE}/register" style="color:#059669;font-weight:700;">${SITE}/register</a>`) +
    p(`Qualquer dúvida, é só responder este e-mail ou me chamar no <a href="${WHATSAPP}" style="color:#059669;font-weight:700;">WhatsApp</a>: (15) 99747-2785.`) +
    p('Equipe Represente-Se!')
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#f7f7f5;border-radius:6px;overflow:hidden;">
    <tr><td style="background:#064e3b;padding:26px 28px;"><div style="font-size:26px;font-weight:900;color:#ffffff;">Represente-Se!</div><div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#6ee7b7;margin-top:6px;text-transform:uppercase;">O sistema do representante comercial</div></td></tr>
    <tr><td style="padding:30px 28px 8px 28px;color:#0f172a;font-size:16px;line-height:1.65;">${body}</td></tr>
    <tr><td style="padding:8px 28px 30px 28px;"><hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 16px 0;" />
      <p style="font-size:11px;color:#94a3b8;line-height:1.7;margin:0;">Você recebeu este e-mail porque seu contato é público no Instagram como profissional do ramo de representação comercial.<br/>Se não quiser mais receber nossos e-mails, <a href="${unsubUrl}" style="color:#94a3b8;">é só clicar aqui</a>.</p></td></tr>
  </table></td></tr></table>`
  const text = `${nome ? `Oi, ${nome}, tudo bem?` : 'Oi, tudo bem?'}\n\nVocê já conhece o Represente-Se!? É um sistema feito por representante comercial, para representantes comerciais.\n\nEle foi pensado para você ter a melhor gestão do seu negócio: enxergar melhor a sua carteira de clientes, se organizar melhor, parar de perder tempo e se tornar o vendedor do futuro. Saiba como podemos te ajudar:\n\n✅ Carteira de clientes com busca automática de CNPJ\n✅ Pedidos, comissão e faturamento por empresa representada\n✅ Agenda de visitas\n✅ Organize tudo em um só lugar\n\nE você tem 7 dias de garantia: se não gostar, devolvemos o seu dinheiro.\n\n👉 Conheça o nosso site e crie a sua conta: ${SITE}/register\n\nQualquer dúvida, é só responder este e-mail ou me chamar no WhatsApp: (15) 99747-2785.\n\nEquipe Represente-Se!\n\nSe não quiser mais receber nossos e-mails, é só clicar aqui: ${unsubUrl}`
  return { subject, html, text }
}

async function send(payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) console.error('Resend:', res.status, (await res.text()).slice(0, 300))
  return res.ok
}

serve(async (req) => {
  const admin = createClient(SUPABASE_URL!, SERVICE!)
  const { data: cfg } = await admin.from('internal_config').select('value').eq('key', 'cron_token').single()
  const secret = cfg?.value as string | undefined
  const token = req.headers.get('x-internal-token')
  if (!secret || !token || !equals(token, secret)) return new Response('Não autorizado.', { status: 401 })
  if (!RESEND_API_KEY) return new Response('RESEND_API_KEY ausente.', { status: 500 })

  const body = await req.json().catch(() => ({})) as { preview?: string; blast?: boolean; limit?: number }
  const unsubFor = async (e: string) => `${SUPABASE_URL}/functions/v1/nurture-leads?unsub=${encodeURIComponent(e)}&t=${await sign(secret, e)}`
  const mk = async (to: string, nome: string) => {
    const u = await unsubFor(to)
    const { subject, html, text } = build(nome, u)
    return { from: FROM, to, reply_to: 'contato@representese.com', subject, html, text, headers: { 'List-Unsubscribe': `<${u}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
  }

  if (body.preview) {
    const ok = await send({ ...(await mk(body.preview, 'Pedro')), subject: '[TESTE] ' + build('Pedro', '').subject })
    return new Response(JSON.stringify({ preview: ok }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (body.blast) {
    const { data: leads } = await admin.from('leads').select('email, attribution').eq('attribution->>source', 'instagram-representante')
    const { data: logs } = await admin.from('email_nurture_log').select('email').eq('step', STEP)
    const { data: unsubs } = await admin.from('email_unsubscribes').select('email')
    const feito = new Set((logs || []).map((l: { email: string }) => l.email))
    const fora = new Set((unsubs || []).map((l: { email: string }) => l.email))
    const enviados: string[] = [], falhas: string[] = []
    let n = 0
    for (const l of (leads || []) as { email: string; attribution: { saudacao?: string } }[]) {
      const email = l.email.toLowerCase()
      if (feito.has(email) || fora.has(email)) continue
      if (body.limit && n >= body.limit) break
      const { error: logErr } = await admin.from('email_nurture_log').insert({ email, step: STEP })
      if (logErr) continue
      n++
      const ok = await send(await mk(email, (l.attribution?.saudacao || '').trim()))
      if (ok) enviados.push(email)
      else { falhas.push(email); await admin.from('email_nurture_log').delete().eq('email', email).eq('step', STEP) }
      await new Promise((r) => setTimeout(r, 600))
    }
    return new Response(JSON.stringify({ enviados: enviados.length, falhas }), { headers: { 'Content-Type': 'application/json' } })
  }
  return new Response('Nada a fazer.', { status: 400 })
})
