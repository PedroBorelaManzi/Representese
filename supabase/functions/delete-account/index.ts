import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Exclusão de conta (LGPD — direito ao esquecimento).
   O usuário autenticado exclui a própria conta por padrão. Um admin
   (user_settings.is_admin) pode excluir a conta de OUTRO usuário passando
   { targetUserId } no corpo — usado pelo painel Gerenciar Usuários.

   Fluxo:
   1. Registra o feedback de saída em account_deletion_feedback (motivo +
      sugestão de melhoria). A linha NÃO tem FK pra auth.users, então
      sobrevive à exclusão. Só pra auto-exclusão.
   2. Cancela a assinatura no Asaas (se houver) — para as cobranças
      futuras na hora. Sem reembolso de período já pago (anual incluso).
   3. Apaga os arquivos do Storage (client_vault/userId/...)
   4. Apaga as linhas das tabelas do usuário, filhos antes dos pais
   5. Apaga o usuário do Auth */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')
const ASAAS_API_URL = Deno.env.get('ASAAS_API_URL') || 'https://www.asaas.com/api/v3'

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ success: false, message: 'Não autorizado.' }, 401)
    }

    const { data: { user }, error: userError } = await createClient(
      SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()

    if (userError || !user) {
      return jsonResponse({ success: false, message: 'Sessão inválida ou expirada.' }, 401)
    }

    const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Alvo da exclusão: o próprio usuário por padrão, ou — só se quem chamou
    // for admin — outro usuário informado no corpo (painel Gerenciar Usuários).
    let userId = user.id
    let body: {
      targetUserId?: string
      reason_category?: string
      reason_text?: string
      improvement_text?: string
    } = {}
    try { body = await req.json() } catch { /* corpo vazio = auto-exclusão */ }

    let deletedBy = 'self'
    if (body.targetUserId && body.targetUserId !== user.id) {
      const { data: callerSettings } = await admin
        .from('user_settings')
        .select('is_admin')
        .eq('user_id', user.id)
        .single()
      if (!callerSettings?.is_admin) {
        return jsonResponse({ success: false, message: 'Sem permissão pra excluir outra conta.' }, 403)
      }
      userId = body.targetUserId
      deletedBy = 'admin'
    }

    // Dados do usuário-alvo, usados no feedback e pra decidir o cancelamento
    const { data: settings } = await admin
      .from('user_settings')
      .select('asaas_subscription_id, subscription_plan, subscription_status')
      .eq('user_id', userId)
      .single()

    const { data: targetAuth } = await admin.auth.admin.getUserById(userId)
    const targetEmail = targetAuth?.user?.email ?? null
    const targetName = (targetAuth?.user?.user_metadata?.full_name as string | undefined) ?? null
    const hadActiveSub = !!settings?.asaas_subscription_id ||
      ['active', 'ativa', 'ACTIVE'].includes(settings?.subscription_status ?? '')

    // 1. Registra o feedback de saída (só auto-exclusão; admin apagando conta
    //    alheia não tem "motivo do usuário"). Best-effort: nunca trava a exclusão.
    if (deletedBy === 'self') {
      try {
        await admin.from('account_deletion_feedback').insert({
          deleted_user_id: userId,
          email: targetEmail,
          full_name: targetName,
          reason_category: (body.reason_category ?? '').slice(0, 80) || null,
          reason_text: (body.reason_text ?? '').slice(0, 2000) || null,
          improvement_text: (body.improvement_text ?? '').slice(0, 2000) || null,
          subscription_plan: settings?.subscription_plan ?? null,
          subscription_status: settings?.subscription_status ?? null,
          had_active_subscription: hadActiveSub,
          asaas_subscription_id: settings?.asaas_subscription_id ?? null,
          deleted_by: deletedBy,
        })
      } catch (e) {
        console.error('Falha ao gravar feedback de exclusão (seguindo):', e)
      }
    }

    // 2. Cancela assinatura no Asaas (best-effort). Deletar a subscription
    //    interrompe as cobranças futuras. Nenhum reembolso é solicitado —
    //    período já pago (mensal ou anual) não é devolvido.
    try {
      if (settings?.asaas_subscription_id && ASAAS_API_KEY) {
        await fetch(`${ASAAS_API_URL}/subscriptions/${settings.asaas_subscription_id}`, {
          method: 'DELETE',
          headers: { 'access_token': ASAAS_API_KEY },
        })
      }
    } catch (e) {
      console.error('Falha ao cancelar assinatura no Asaas (seguindo com exclusão):', e)
    }

    // 3. Apaga arquivos do Storage (paths client_vault/userId/...)
    try {
      const { data: files } = await admin.storage.from('client_vault').list(userId, { limit: 1000 })
      if (files?.length) {
        const allPaths: string[] = []
        for (const entry of files) {
          if (entry.id === null) {
            const { data: inner } = await admin.storage.from('client_vault').list(`${userId}/${entry.name}`, { limit: 1000 })
            for (const f of inner || []) allPaths.push(`${userId}/${entry.name}/${f.name}`)
          } else {
            allPaths.push(`${userId}/${entry.name}`)
          }
        }
        if (allPaths.length) await admin.storage.from('client_vault').remove(allPaths)
      }
    } catch (e) {
      console.error('Falha ao limpar storage (seguindo com exclusão):', e)
    }

    // 4. Apaga dados das tabelas do usuário. Não há FK pra auth.users, então o
    //    deleteUser sozinho não limparia nada. Ordem: filhos antes dos pais.

    // 4a. Casos especiais que não têm user_id direto:
    try {
      // client_location_audit referencia clients(client_id)
      const { data: clientIds } = await admin.from('clients').select('id').eq('user_id', userId)
      const ids = (clientIds ?? []).map((c: { id: string }) => c.id)
      if (ids.length) {
        await admin.from('client_location_audit').delete().in('client_id', ids)
      }
      // support_messages referencia support_conversations(conversation_id)
      const { data: convs } = await admin.from('support_conversations').select('id').eq('user_id', userId)
      const convIds = (convs ?? []).map((c: { id: string }) => c.id)
      if (convIds.length) {
        await admin.from('support_messages').delete().in('conversation_id', convIds)
      }
    } catch (e) {
      console.error('Falha nos deletes especiais (seguindo):', e)
    }

    // 4b. Tabelas com user_id, filhos primeiro. consent_log fica de fora
    //     de propósito: é registro legal de consentimento (LGPD) e deve ser
    //     retido como prova da base legal.
    const tables = [
      // filhos de orders
      'order_items', 'order_installments',
      'orders',
      // filhos de clients
      'appointments', 'visits', 'client_bank_details', 'client_followup_logs',
      'clients',
      // suporte
      'support_conversations', 'support_admins',
      // diversos
      'ai_chats', 'daily_notes', 'alert_dismissals', 'audit_logs',
      'coupon_redemptions', 'user_email_tokens', 'user_google_tokens',
      'user_events', 'leaderboard', 'companies',
      'billing_identities', 'user_entitlements', 'product_catalog',
      'order_intake_links', 'posthog_person_stats', 'sentry_user_stats',
      // por último, o registro-raiz
      'user_settings',
    ]
    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq('user_id', userId)
      if (error) console.error(`Falha ao limpar ${table}:`, error.message)
    }

    // 4c. leads é pré-cadastro, chaveado por e-mail (não por user_id)
    if (targetEmail) {
      const { error } = await admin.from('leads').delete().eq('email', targetEmail)
      if (error) console.error('Falha ao limpar leads:', error.message)
    }

    // 5. Apaga o usuário do Auth
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('Falha ao excluir usuário do Auth:', deleteError)
      return jsonResponse({ success: false, message: 'Não foi possível concluir a exclusão. Contate o suporte.' }, 500)
    }

    return jsonResponse({ success: true, message: 'Conta excluída definitivamente.' })
  } catch (error) {
    console.error('Erro geral na exclusão de conta:', error)
    return jsonResponse({ success: false, message: 'Erro interno.' }, 500)
  }
})
