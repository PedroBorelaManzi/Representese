import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Monitoramento (auditoria 4.5): chamada de hora em hora pelo pg_cron.
   Conta os `error_occurred` da última hora em audit_logs e, se passar do
   limite, manda e-mail de alerta para o dono via Resend.
   Autenticação: token interno no header (o cron envia), sem JWT. */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const ALERT_THRESHOLD = 10 // erros/hora que disparam o alerta
const ALERT_TO = 'pedroborelamanzi@gmail.com'

serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Só o cron pode disparar: o token esperado vive em internal_config
    // (tabela sem acesso público) e o pg_cron envia o mesmo valor no header.
    const token = req.headers.get('x-internal-token')
    const { data: cfg } = await admin
      .from('internal_config')
      .select('value')
      .eq('key', 'cron_token')
      .single()
    if (!cfg?.value || token !== cfg.value) {
      return new Response(JSON.stringify({ success: false, message: 'Não autorizado.' }), { status: 401 })
    }
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count, error } = await admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'error_occurred')
      .gte('created_at', oneHourAgo)

    if (error) throw error

    if ((count || 0) < ALERT_THRESHOLD) {
      return new Response(JSON.stringify({ success: true, errors_last_hour: count, alerted: false }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Amostra dos erros mais recentes para dar contexto no e-mail
    const { data: samples } = await admin
      .from('audit_logs')
      .select('created_at, details')
      .eq('action', 'error_occurred')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(5)

    const sampleHtml = (samples || [])
      .map((s) => `<li style="margin-bottom:8px;"><code style="font-size:11px;">${new Date(s.created_at).toLocaleTimeString('pt-BR')} — ${String(JSON.stringify(s.details) || '').slice(0, 200)}</code></li>`)
      .join('')

    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'Representese <suporte@representese.com>',
          to: ALERT_TO,
          subject: `🚨 Alerta: ${count} erros na última hora — Represente-Se`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 16px;">
              <h2 style="color: #dc2626; font-weight: 900; margin: 0 0 16px 0;">🚨 ${count} erros na última hora</h2>
              <p style="font-size: 14px; color: #475569;">O sistema registrou <b>${count}</b> eventos <code>error_occurred</code> desde ${new Date(oneHourAgo).toLocaleTimeString('pt-BR')} (limite: ${ALERT_THRESHOLD}/h).</p>
              <p style="font-size: 13px; color: #475569; font-weight: 700;">Últimos 5 erros:</p>
              <ul style="padding-left: 16px;">${sampleHtml || '<li>sem detalhes</li>'}</ul>
              <p style="font-size: 12px; color: #94a3b8;">Veja tudo em: Supabase → Table Editor → audit_logs</p>
            </div>`,
        }),
      })
    } else {
      console.warn(`ALERTA (${count} erros/hora) — RESEND_API_KEY ausente, e-mail não enviado.`)
    }

    return new Response(JSON.stringify({ success: true, errors_last_hour: count, alerted: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Erro no error-alert:', e)
    return new Response(JSON.stringify({ success: false, message: String(e) }), { status: 500 })
  }
})
