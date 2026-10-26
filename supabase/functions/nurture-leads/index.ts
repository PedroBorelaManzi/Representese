import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Sequência de e-mails para quem criou conta e ainda não assinou.
   - O pg_cron chama esta função de hora em hora com o x-internal-token.
   - GET ?unsub=<e-mail>&t=<assinatura> é o link "parar de receber" dos e-mails
     (público; assinado com HMAC, então ninguém cancela o e-mail de outra pessoa).
   - Cada passo só vale dentro da sua janela de idade da conta, então uma conta
     antiga não recebe uma enxurrada de e-mails de uma vez. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const FROM = 'Represente-Se! <contato@representese.com>'
const SITE = 'https://www.representese.com'
const ADMIN_TO = 'pedroborelamanzi@gmail.com'
const WHATSAPP = 'https://wa.me/5515997472785'

const HOUR = 3600_000
const DAY = 24 * HOUR

// Janela [de, até) de idade da conta em que cada passo pode ser enviado.
const STEPS = [
  { id: 'h1', from: 1 * HOUR, to: 2 * DAY },
  { id: 'd2', from: 2 * DAY, to: 6 * DAY },
  { id: 'd7', from: 7 * DAY, to: 14 * DAY },
] as const
const ADMIN_STEP = { id: 'admin24', from: 24 * HOUR, to: 5 * DAY }

const enc = new TextEncoder()
const equals = (a: string, b: string) => {
  const x = enc.encode(a), y = enc.encode(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function sign(secret: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(email))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function layout(body: string, unsubUrl: string): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
    <h2 style="color: #059669; font-weight: 900; margin: 0 0 20px 0; font-size: 22px;">Represente-Se!</h2>
    ${body}
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0 14px 0;" />
    <p style="font-size: 11px; color: #94a3b8; line-height: 1.6; margin: 0;">
      Você recebeu este e-mail porque deixou seus dados ou criou uma conta no Represente-Se!.
      <a href="${unsubUrl}" style="color: #94a3b8;">Parar de receber estes e-mails</a>.
    </p>
  </div>`
}

const button = (href: string, label: string) =>
  `<p style="margin: 24px 0;"><a href="${href}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 14px 28px; border-radius: 12px;">${label}</a></p>`

function template(step: string, firstName: string, unsubUrl: string): { subject: string; html: string } {
  const oi = firstName ? `Oi, ${esc(firstName)}!` : 'Olá!'
  if (step === 'lead1') {
    return {
      subject: 'Você deixou seu contato no Represente-Se!',
      html: layout(`
        <p style="font-size: 15px; line-height: 1.6;">${oi}</p>
        <p style="font-size: 15px; line-height: 1.6;">Você deixou seus dados no Represente-Se!, o sistema para representantes comerciais, mas não chegou a criar a conta. Aconteceu alguma coisa ou ficou alguma dúvida?</p>
        <ul style="font-size: 15px; line-height: 1.8; padding-left: 20px;">
          <li>clientes, pedidos e visitas num lugar só;</li>
          <li>pedidos com catálogo e PDF na hora, até sem internet;</li>
          <li>avisos de retorno e acompanhamento de faturamento por empresa.</li>
        </ul>
        <p style="font-size: 15px; line-height: 1.6;">Você tem 7 dias para testar antes da primeira cobrança.</p>
        ${button(`${SITE}/planos`, 'Conhecer os planos')}
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">Prefere conversar? Responda este e-mail ou chame no <a href="${WHATSAPP}" style="color: #059669;">WhatsApp</a>. Eu mesmo atendo.</p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">Pedro, Represente-Se!</p>`, unsubUrl),
    }
  }
  if (step === 'h1') {
    return {
      subject: 'Sua conta está pronta, falta só escolher o plano',
      html: layout(`
        <p style="font-size: 15px; line-height: 1.6;">${oi}</p>
        <p style="font-size: 15px; line-height: 1.6;">Sua conta no Represente-Se! foi criada. Falta só um passo para começar a organizar seus clientes, pedidos e visitas num lugar só: escolher o plano.</p>
        <p style="font-size: 15px; line-height: 1.6;">Entre na sua conta e toque em <strong>Ver planos</strong>. Leva menos de 2 minutos.</p>
        ${button(`${SITE}/login`, 'Entrar e escolher meu plano')}
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">Ficou com alguma dúvida? É só responder este e-mail.</p>`, unsubUrl),
    }
  }
  if (step === 'd2') {
    return {
      subject: 'Como representantes estão usando o Represente-Se!',
      html: layout(`
        <p style="font-size: 15px; line-height: 1.6;">${oi}</p>
        <p style="font-size: 15px; line-height: 1.6;">Em poucos minutos você já consegue:</p>
        <ul style="font-size: 15px; line-height: 1.8; padding-left: 20px;">
          <li>cadastrar seus clientes e ver quem está sem comprar;</li>
          <li>criar pedidos com o catálogo e gerar o PDF na hora, até sem internet;</li>
          <li>agendar visitas e receber avisos de retorno;</li>
          <li>acompanhar faturamento e comissão por empresa representada.</li>
        </ul>
        <p style="font-size: 15px; line-height: 1.6;">Você tem 7 dias para testar antes da primeira cobrança.</p>
        ${button(`${SITE}/login`, 'Escolher meu plano')}
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">Quer ajuda para começar? Responda este e-mail ou chame no <a href="${WHATSAPP}" style="color: #059669;">WhatsApp</a>.</p>`, unsubUrl),
    }
  }
  return {
    subject: 'Posso te ajudar a começar?',
    html: layout(`
      <p style="font-size: 15px; line-height: 1.6;">${oi}</p>
      <p style="font-size: 15px; line-height: 1.6;">Vi que você criou sua conta no Represente-Se! mas ainda não escolheu um plano. Aconteceu alguma coisa, ou ficou alguma dúvida sobre como funciona?</p>
      <p style="font-size: 15px; line-height: 1.6;">Me responda este e-mail ou me chame no WhatsApp. Eu mesmo te ajudo a deixar tudo pronto.</p>
      ${button(WHATSAPP, 'Falar no WhatsApp')}
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">Pedro, Represente-Se!</p>`, unsubUrl),
  }
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
  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
  const { data: cfg } = await admin.from('internal_config').select('value').eq('key', 'cron_token').single()
  const secret = cfg?.value as string | undefined
  if (!secret) return new Response('Servidor mal configurado.', { status: 500 })

  const url = new URL(req.url)

  // Link de descadastro (público, assinado).
  if (req.method === 'GET' || url.searchParams.has('unsub')) {
    const email = (url.searchParams.get('unsub') || '').toLowerCase().trim()
    const t = url.searchParams.get('t') || ''
    if (!email || !equals(t, await sign(secret, email))) {
      return Response.redirect(`${SITE}/email-cancelado?erro=1`, 302)
    }
    await admin.from('email_unsubscribes').upsert({ email }, { onConflict: 'email' })
    return Response.redirect(`${SITE}/email-cancelado`, 302)
  }

  // Cron.
  const token = req.headers.get('x-internal-token')
  if (!token || !equals(token, secret)) {
    return new Response(JSON.stringify({ success: false, message: 'Não autorizado.' }), { status: 401 })
  }
  if (!RESEND_API_KEY) return new Response(JSON.stringify({ success: false, message: 'RESEND_API_KEY ausente.' }), { status: 500 })

  const { data: cands, error } = await admin.rpc('nurture_candidates')
  if (error) {
    console.error('nurture_candidates', error)
    return new Response(JSON.stringify({ success: false }), { status: 500 })
  }

  const { data: logs } = await admin.from('email_nurture_log').select('email, step')
  const done = new Set((logs || []).map((l: { email: string; step: string }) => `${l.email}|${l.step}`))
  const now = Date.now()
  const sent: string[] = []
  const novosParaAdmin: { name: string; email: string; platform: string; created_at: string }[] = []

  for (const c of (cands || []) as { user_id: string; email: string; name: string; created_at: string; platform: string | null }[]) {
    const age = now - new Date(c.created_at).getTime()

    if (age >= ADMIN_STEP.from && age < ADMIN_STEP.to && !done.has(`${c.email}|${ADMIN_STEP.id}`)) {
      novosParaAdmin.push({ name: c.name, email: c.email, platform: c.platform || 'web', created_at: c.created_at })
    }

    // Um e-mail por conta por rodada: o passo mais novo cuja janela está aberta.
    const step = [...STEPS].reverse().find((s) => age >= s.from && age < s.to)
    if (!step || done.has(`${c.email}|${step.id}`)) continue
    // Respeita um intervalo mínimo de 24h desde o último e-mail enviado a esta conta.
    if (step.id !== 'h1') {
      const { data: prev } = await admin.from('email_nurture_log').select('sent_at').eq('email', c.email).neq('step', ADMIN_STEP.id).order('sent_at', { ascending: false }).limit(1)
      if (prev?.[0] && now - new Date(prev[0].sent_at).getTime() < DAY) continue
    }

    const unsubUrl = `${SUPABASE_URL}/functions/v1/nurture-leads?unsub=${encodeURIComponent(c.email)}&t=${await sign(secret, c.email)}`
    const { subject, html } = template(step.id, c.name.trim().split(/\s+/)[0] || '', unsubUrl)
    // Registra antes de enviar: se o envio falhar, não repete em loop; se registrar falhar, não envia.
    const { error: logErr } = await admin.from('email_nurture_log').insert({ email: c.email, user_id: c.user_id, step: step.id })
    if (logErr) continue
    const ok = await send({
      from: FROM, to: c.email, reply_to: 'contato@representese.com', subject, html,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    })
    if (ok) sent.push(`${c.email}:${step.id}`)
    else await admin.from('email_nurture_log').delete().eq('email', c.email).eq('step', step.id)
  }

  // Contatos que deixaram os dados no site mas não criaram conta: um único e-mail de retomada.
  const { data: leadsList } = await admin.rpc('lead_candidates')
  for (const l of (leadsList || []) as { email: string; name: string; created_at: string }[]) {
    const age = now - new Date(l.created_at).getTime()
    if (age < HOUR || age > 120 * DAY || done.has(`${l.email}|lead1`)) continue
    const unsubUrl = `${SUPABASE_URL}/functions/v1/nurture-leads?unsub=${encodeURIComponent(l.email)}&t=${await sign(secret, l.email)}`
    const { subject, html } = template('lead1', l.name.trim().split(/\s+/)[0] || '', unsubUrl)
    const { error: logErr } = await admin.from('email_nurture_log').insert({ email: l.email, step: 'lead1' })
    if (logErr) continue
    const ok = await send({
      from: FROM, to: l.email, reply_to: 'contato@representese.com', subject, html,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    })
    if (ok) sent.push(`${l.email}:lead1`)
    else await admin.from('email_nurture_log').delete().eq('email', l.email).eq('step', 'lead1')
  }

  // Aviso ao dono: contas que passaram de 24h sem assinar.
  if (novosParaAdmin.length > 0) {
    const rows = novosParaAdmin.map((n) => `<li><strong>${esc(n.name || 'Sem nome')}</strong> — ${esc(n.email)} — ${esc(n.platform)} — criada em ${new Date(n.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</li>`).join('')
    const ok = await send({
      from: FROM, to: ADMIN_TO,
      subject: `${novosParaAdmin.length} conta(s) criada(s) há mais de 24h sem plano`,
      html: `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6;"><p>Estas pessoas criaram conta e ainda não assinaram. Uma mensagem pessoal agora costuma converter:</p><ul>${rows}</ul></div>`,
    })
    if (ok) await admin.from('email_nurture_log').insert(novosParaAdmin.map((n) => ({ email: n.email, step: ADMIN_STEP.id })))
  }

  return new Response(JSON.stringify({ success: true, sent, admin_notified: novosParaAdmin.length }), { headers: { 'Content-Type': 'application/json' } })
})
