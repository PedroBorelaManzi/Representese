import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, redirectTo } = await req.json()

    if (!email || typeof email !== 'string') {
      return json({ success: false, message: 'E-mail é obrigatório.' }, 400)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ success: false, message: 'Servidor mal configurado.' }, 500)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Função pública (roda antes do login): rate limit por IP contra
    // e-mail bombing, e por e-mail alvo contra spam a uma vítima específica.
    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const emailKey = email.toLowerCase().trim()
    const [ipLimit, emailLimit] = await Promise.all([
      admin.rpc('hit_rate_limit', { p_key: `recovery-ip:${clientIp}`, p_max: 5, p_window_seconds: 3600 }),
      admin.rpc('hit_rate_limit', { p_key: `recovery-email:${emailKey}`, p_max: 3, p_window_seconds: 3600 }),
    ])
    if (ipLimit.data === false || emailLimit.data === false) {
      return json({ success: false, message: 'Muitas tentativas. Aguarde uma hora e tente novamente.' }, 429)
    }

    // Gera o link de recuperação. O erro de "usuário não existe" NÃO é
    // repassado ao cliente: resposta idêntica com ou sem conta cadastrada,
    // senão a tela de recuperação vira um oráculo de enumeração da base.
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: redirectTo ? { redirectTo } : undefined,
    })

    if (error) {
      const msg = (error.message || '').toLowerCase()
      const notFound =
        (error as { status?: number }).status === 404 ||
        msg.includes('not found') ||
        msg.includes('no user') ||
        msg.includes('user not found')

      if (notFound) {
        // E-mail sem conta: não enviamos nada, mas respondemos igual ao sucesso.
        return json({ success: true })
      }
      console.error('generateLink error:', error)
      return json({ success: false, message: 'Não foi possível gerar o link de recuperação.' })
    }

    const actionLink = (data as { properties?: { action_link?: string } })?.properties?.action_link
    if (!actionLink) {
      return json({ success: false, message: 'Link de recuperação indisponível.' })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY ausente — impossível enviar o e-mail de recuperação.')
      // Não fingimos sucesso: o front mostra erro real em vez de "enviado".
      return json({ success: false, message: 'Serviço de e-mail indisponível no momento.' })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Representese <suporte@representese.com>',
        to: email,
        subject: 'Redefinição de senha — Representese',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #059669; font-weight: 900; margin: 0; font-size: 24px; letter-spacing: -0.025em; text-transform: uppercase;">Representese</h2>
              <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">Recuperação de Acesso</p>
            </div>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <p style="font-size: 14px; font-weight: 600; color: #475569; line-height: 1.5; margin: 0 0 16px 0;">
                Olá,
              </p>
              <p style="font-size: 14px; font-weight: 600; color: #475569; line-height: 1.5; margin: 0 0 24px 0;">
                Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:
              </p>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${actionLink}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 16px 40px; border-radius: 12px;">
                  Redefinir minha senha
                </a>
              </div>

              <p style="font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; text-align: center;">
                Este link expira em 1 hora.
              </p>
            </div>

            <p style="font-size: 12px; font-weight: 500; color: #64748b; line-height: 1.6; margin: 0 0 24px 0;">
              Se você não solicitou essa alteração, nenhuma ação é necessária e você pode ignorar este e-mail com segurança.
            </p>

            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin-bottom: 16px;" />

            <div style="text-align: center;">
              <p style="font-size: 9px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.2em; margin: 0;">
                Representese — Tecnologia de Ponta
              </p>
            </div>
          </div>
        `,
      }),
    })

    const resData = await res.json()
    if (!res.ok) {
      console.error('Erro do Resend:', resData)
      return json({ success: false, message: 'Falha ao enviar o e-mail de recuperação.' })
    }

    return json({ success: true })
  } catch (error) {
    console.error(error)
    return json({ success: false, message: (error as Error).message }, 500)
  }
})
