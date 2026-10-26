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

// Black Friday: cupom BLACK30 (30%), aplicado sozinho no checkout, expira no servidor em 31/10 23:59 (Brasília).
const BF_END = Date.UTC(2026, 10, 1, 2, 59, 59)
const BF_48_START = Date.UTC(2026, 9, 30, 3, 0, 0) // 30/10 00:00 Brasília: restam ~48h
const BF_LAST_DAY_START = Date.UTC(2026, 10, 31, 3, 0, 0) // 31/10 00:00 Brasília: restam ~24h
const bfAtivo = () => Date.now() < BF_END

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

function layout(body: string, unsubUrl: string, preheader = ''): string {
  return `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#f7f7f5;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#064e3b;padding:28px 28px 26px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:16px;"><img src="${SITE}/icon-192.png" width="64" height="64" alt="Represente-Se!" style="display:block;border-radius:14px;background:#ffffff;" /></td>
            <td>
              <div style="font-size:28px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;line-height:1.1;">Represente-Se!</div>
              <div style="font-size:11px;font-weight:700;letter-spacing:2.2px;color:#6ee7b7;margin-top:7px;text-transform:uppercase;">O sistema do representante comercial</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:30px 28px 8px 28px;color:#0f172a;font-size:16px;line-height:1.65;">
          ${body}
        </td></tr>
        <tr><td style="padding:8px 28px 30px 28px;">
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 16px 0;" />
          <p style="font-size:11px;color:#94a3b8;line-height:1.7;margin:0;">
            Você recebeu este e-mail porque deixou seus dados ou criou uma conta no Represente-Se!.
            Pode responder esta mensagem: a gente lê.<br/>
            <a href="${unsubUrl}" style="color:#94a3b8;">Parar de receber estes e-mails</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>`
}

const p = (t: string) => `<p style="margin:0 0 18px 0;">${t}</p>`
const li = (t: string) => `<p style="margin:0 0 10px 0;">${t}</p>`
const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;"><tr><td style="background:#059669;border-radius:8px;"><a href="${href}" style="display:inline-block;padding:16px 30px;color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">${label}</a></td></tr></table>`

const bfBox = (ultimoDia = false, horas?: 48 | 24) => bfAtivo()
  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px 0;"><tr><td style="background:#0f172a;border-radius:10px;padding:20px 22px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#fbbf24;text-transform:uppercase;">${horas ? `Últimas ${horas} horas` : ultimoDia ? 'Último dia' : 'Black Friday'}</div>
      <div style="font-size:22px;font-weight:900;color:#ffffff;line-height:1.25;margin:6px 0 8px 0;">30% de desconto em qualquer plano</div>
      <div style="font-size:14px;color:#cbd5e1;line-height:1.6;">Cupom <strong style="color:#6ee7b7;">BLACK30</strong>, aplicado sozinho no checkout.<br/><strong style="color:#ffffff;">Válido somente no site</strong> (representese.com), não vale dentro do aplicativo.<br/>${ultimoDia ? 'Sai do ar <strong style="color:#ffffff;">hoje, às 23h59</strong>.' : 'Vale só até <strong style="color:#ffffff;">31/10, às 23h59</strong>.'}</div>
    </td></tr></table>`
  : ''

const BF_LINES =
  li('✅ Cadastra seus clientes e vê quem está há dias sem comprar') +
  li('✅ Cria pedidos com catálogo e gera o PDF na hora') +
  li('✅ Agenda visitas e recebe aviso de retorno') +
  li('✅ Usa até sem internet')

function template(step: string, firstName: string, unsubUrl: string): { subject: string; html: string } {
  const nome = firstName ? esc(firstName) : ''
  const oi = nome ? `${nome}, ` : ''
  const L = (body: string, pre: string) => layout(body, unsubUrl, pre)

  // Black Friday: envio único a quem ainda não assinou (conta sem plano ou só contato) e lembrete do último dia.
  if (/^(bf1|bf48|bflast)_(conta|lead)$/.test(step)) {
    const ultimo = step.startsWith('bflast')
    const h48 = step.startsWith('bf48')
    const horas = ultimo ? 24 : h48 ? 48 : undefined
    const conta = step.endsWith('_conta')
    const link = conta ? `${SITE}/login` : `${SITE}/planos`
    const abertura = conta
      ? `${oi ? nome + ', sua' : 'Sua'} conta no Represente-Se! está pronta, mas ainda sem plano.`
      : `${oi ? nome + ', você' : 'Você'} deixou seus dados no Represente-Se!, mas ainda não começou.`
    return {
      subject: ultimo
        ? `${oi ? nome + ', 24' : '24'} horas: o cupom BLACK30 expira hoje ⏰`
        : h48
          ? `${oi ? nome + ', últimas' : 'Últimas'} 48 horas de Black Friday ⏳`
          : `${oi ? nome + ', 30' : '30'}% OFF só até 31/10 🔥`,
      html: L(
        p(`<strong>${ultimo ? 'Hoje é o último dia: restam 24 horas.' : h48 ? 'Restam 48 horas para a Black Friday acabar.' : 'A Black Friday chegou para quem representa.'}</strong>`) +
        p(abertura) +
        bfBox(ultimo, horas) +
        p(ultimo
          ? 'Depois das 23h59 de hoje o cupom sai do ar e o preço volta ao normal. Não vai ter prorrogação.'
          : h48
          ? 'No sábado, 31/10, às 23h59, o cupom BLACK30 sai do ar. Daqui até lá você assina qualquer plano com <strong>30% de desconto</strong>: o Exclusivo, por exemplo, sai por <strong>R$ 67,90</strong> em vez de R$ 97.'
          : 'Até 31/10 você assina qualquer plano com <strong>30% de desconto</strong>. A mensalidade do plano Exclusivo, por exemplo, sai por <strong>R$ 67,90</strong> em vez de R$ 97.') +
        p('É assim:') +
        li('<strong>01.</strong> ' + (conta ? 'Entra na sua conta' : 'Cria sua conta em 1 minuto')) +
        li('<strong>02.</strong> Escolhe o plano') +
        li('<strong>03.</strong> O desconto já vem aplicado no pagamento') +
        p('<br/><strong>Importante:</strong> o cupom vale <strong>somente pelo site representese.com</strong>. Dentro do aplicativo o preço é o da loja e o cupom não funciona. Se você baixou o app, abra o link deste e-mail no navegador para assinar com o desconto.') +
        p('E você ainda tem <strong>7 dias de garantia</strong>: se não gostar, devolvemos 100% do valor. Com o sistema você:') +
        BF_LINES +
        button(link, ultimo ? 'Garantir 30% OFF agora' : h48 ? 'Aproveitar os 30% OFF' : 'Quero meus 30% OFF') +
        p('<strong>Depois de 31/10 o cupom sai do ar.</strong> Se ficar com dúvida, responde este e-mail ou chama no <a href="' + WHATSAPP + '" style="color:#059669;font-weight:700;">WhatsApp</a>. Eu mesmo atendo.') +
        p('Pedro,<br/>fundador do Represente-Se!'),
        ultimo ? 'Restam 24 horas: o cupom BLACK30 sai do ar hoje às 23h59.' : h48 ? 'Restam 48 horas para usar o cupom BLACK30.' : 'Cupom BLACK30 aplicado sozinho no checkout.'),
    }
  }

  if (step === 'h1') {
    return {
      subject: 'Sua conta está pronta ✅',
      html: L(
        p(`<strong>${oi ? oi + 'sua' : 'Sua'} conta no Represente-Se! está criada.</strong>`) +
        p('Falta só <strong>escolher o plano</strong> para liberar o sistema.') +
        p('Com ele você:') +
        li('✅ Cadastra seus clientes e vê quem está há dias sem comprar') +
        li('✅ Cria pedidos com catálogo e gera o PDF na hora') +
        li('✅ Agenda visitas e recebe aviso de retorno') +
        li('✅ Usa até sem internet') +
        p('<strong>7 dias de garantia:</strong> se não gostar, devolvemos 100% do valor. Sem fidelidade.') +
        bfBox() +
        button(`${SITE}/login`, 'Entrar e escolher meu plano') +
        p('Leva menos de 2 minutos.') +
        p('Equipe Represente-Se!'),
        'Falta um passo para liberar o sistema.'),
    }
  }

  if (step === 'd2') {
    return {
      subject: 'Quanto custa um cliente esquecido? 📍',
      html: L(
        p(`<strong>${oi ? oi + 'todo' : 'Todo'} representante já perdeu um pedido por esquecer de voltar num cliente.</strong>`) +
        p('Não é falta de vontade. É cabeça cheia, caderno perdido e planilha desatualizada.') +
        p('O Represente-Se! foi feito para isso não acontecer. São 4 pilares:') +
        p('<strong>Pilar 01: Clientes</strong><br/>Todos os contatos e o histórico de compras num lugar só. Você vê na hora quem sumiu.') +
        p('<strong>Pilar 02: Pedidos</strong><br/>Pedido com catálogo e PDF pronto na frente do cliente, até sem internet.') +
        p('<strong>Pilar 03: Agenda</strong><br/>Visitas marcadas e aviso de retorno para ninguém ficar para trás.') +
        p('<strong>Pilar 04: Faturamento</strong><br/>Quanto você vendeu e quanto tem de comissão, por empresa representada.') +
        bfBox() +
        button(`${SITE}/login`, 'Quero começar agora') +
        p('<strong>7 dias de garantia:</strong> se não fizer sentido para você, devolvemos 100% do valor.') +
        button(`${SITE}/login`, 'Escolher meu plano') +
        p('Ficou com dúvida? Responde este e-mail ou chama no <a href="' + WHATSAPP + '" style="color:#059669;font-weight:700;">WhatsApp</a>.') +
        p('Equipe Represente-Se!'),
        'Os 4 pilares que impedem você de perder venda.'),
    }
  }

  if (step === 'd7') {
    return {
      subject: `${oi ? nome + ', jogo' : 'Jogo'} rápido 👋`,
      html: L(
        p(`<strong>${oi ? nome + ', jogo' : 'Jogo'} rápido.</strong>`) +
        p('Faz uma semana que você criou sua conta no Represente-Se! e ainda não escolheu um plano.') +
        p('Eu quero entender: <strong>aconteceu alguma coisa?</strong>') +
        li('Ficou alguma dúvida sobre como funciona?') +
        li('Não achou o plano certo para o seu caso?') +
        li('Teve algum problema na hora de assinar?') +
        p('Me responde este e-mail ou me chama no WhatsApp. <strong>Eu mesmo te atendo</strong> e deixo tudo pronto com você.') +
        bfBox() +
        button(WHATSAPP, 'Falar com o Pedro no WhatsApp') +
        p('Pedro,<br/>fundador do Represente-Se!'),
        'Aconteceu alguma coisa? Eu mesmo te ajudo.'),
    }
  }

  // lead1: deixou o contato no site e não criou a conta
  return {
    subject: `${oi ? nome + ', você' : 'Você'} deixou seu contato aqui 👀`,
    html: L(
      p(`<strong>${oi ? nome + ', você' : 'Você'} deixou seus dados no Represente-Se!, mas não chegou a criar a conta.</strong>`) +
      p('Aconteceu alguma coisa? Às vezes é só a correria do dia a dia, e está tudo bem.') +
      p('Quando você tiver 2 minutos, é isto que está esperando por você:') +
      li('✅ Clientes, pedidos e visitas num lugar só') +
      li('✅ Pedido com catálogo e PDF na hora, até sem internet') +
      li('✅ Avisos de retorno e faturamento por empresa representada') +
      p('<strong>7 dias de garantia:</strong> se não gostar, devolvemos 100% do valor. Sem fidelidade.') +
      bfBox() +
      button(`${SITE}/planos`, 'Conhecer os planos') +
      p('Prefere conversar antes? Responde este e-mail ou chama no <a href="' + WHATSAPP + '" style="color:#059669;font-weight:700;">WhatsApp</a>. Eu mesmo atendo.') +
      p('Pedro,<br/>fundador do Represente-Se!'),
      '7 dias de garantia: se não gostar, devolvemos 100%.'),
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

  // Prévia: manda os 4 modelos só para o endereço informado (não toca em ninguém mais).
  const body = await req.json().catch(() => ({})) as { preview?: string; blast?: string }
  if (body.preview) {
    const to = String(body.preview)
    const unsubUrl = `${SUPABASE_URL}/functions/v1/nurture-leads?unsub=${encodeURIComponent(to)}&t=${await sign(secret, to)}`
    for (const st of ['bf48_conta', 'bf48_lead', 'bflast_conta', 'bflast_lead']) {
      const { subject, html } = template(st, 'Pedro', unsubUrl)
      await send({ from: FROM, to, reply_to: 'contato@representese.com', subject: `[PRÉVIA] ${subject}`, html })
    }
    return new Response(JSON.stringify({ success: true, preview: to }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Envio em massa controlado (Black Friday): {"blast":"bf1"} manda uma vez para todo mundo que ainda não assinou.
  // O lembrete "bflast" sai sozinho no último dia da campanha, para quem ainda não assinou.
  const nowMs = Date.now()
  const autoStep = nowMs >= BF_LAST_DAY_START && nowMs < BF_END ? 'bflast' : nowMs >= BF_48_START && nowMs < BF_LAST_DAY_START ? 'bf48' : null
  const blastStep = body.blast === 'bf1' || body.blast === 'bf2' ? body.blast : autoStep
  if (blastStep) {
    const { data: logsB } = await admin.from('email_nurture_log').select('email, step').eq('step', blastStep)
    const doneB = new Set((logsB || []).map((l: { email: string }) => l.email))
    const { data: contas } = await admin.rpc('nurture_candidates')
    const { data: leads } = await admin.rpc('lead_candidates')
    const alvo = [
      ...((contas || []) as { email: string; name: string; user_id: string }[]).map((c) => ({ ...c, tipo: 'conta' as const })),
      ...((leads || []) as { email: string; name: string }[]).map((l) => ({ ...l, user_id: null as string | null, tipo: 'lead' as const })),
    ]
    const enviados: string[] = []
    for (const a of alvo) {
      if (doneB.has(a.email)) continue
      const unsubUrl = `${SUPABASE_URL}/functions/v1/nurture-leads?unsub=${encodeURIComponent(a.email)}&t=${await sign(secret, a.email)}`
      const { subject, html } = template(`${blastStep === 'bf2' ? 'bf1' : blastStep}_${a.tipo}`, (a.name || '').trim().split(/\s+/)[0] || '', unsubUrl)
      const { error: logErr } = await admin.from('email_nurture_log').insert({ email: a.email, user_id: a.user_id, step: blastStep })
      if (logErr) continue
      const ok = await send({
        from: FROM, to: a.email, reply_to: 'contato@representese.com', subject, html,
        headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      })
      if (ok) enviados.push(a.email)
      else await admin.from('email_nurture_log').delete().eq('email', a.email).eq('step', blastStep)
      await new Promise((r) => setTimeout(r, 600)) // respeita o limite de 2 envios/s do Resend
    }
    if (body.blast === 'bf1' || body.blast === 'bf2') {
      return new Response(JSON.stringify({ success: true, blast: blastStep, enviados }), { headers: { 'Content-Type': 'application/json' } })
    }
  }

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
    if (age < HOUR || age > 120 * DAY || done.has(`${l.email}|lead1`) || done.has(`${l.email}|bf1`)) continue
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
