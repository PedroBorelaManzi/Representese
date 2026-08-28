import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Exclusão de conta (LGPD — direito ao esquecimento).
   O usuário autenticado exclui a própria conta por padrão. Um admin
   (user_settings.is_admin) pode excluir a conta de OUTRO usuário passando
   { targetUserId } no corpo — usado pelo painel Gerenciar Usuários. Em
   ambos os casos:
   1. Cancela a assinatura no Asaas (se houver)
   2. Apaga os arquivos do Storage (client_vault/userId/...)
   3. Apaga as linhas das tabelas do usuário
   4. Apaga o usuário do Auth (cascata cobre o que sobrar) */

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
    let body: { targetUserId?: string } = {}
    try { body = await req.json() } catch { /* corpo vazio = auto-exclusão */ }

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
    }

    // 1. Cancela assinatura no Asaas (best-effort: a exclusão segue mesmo se falhar)
    try {
      const { data: settings } = await admin
        .from('user_settings')
        .select('asaas_subscription_id')
        .eq('user_id', userId)
        .single()

      if (settings?.asaas_subscription_id && ASAAS_API_KEY) {
        await fetch(`${ASAAS_API_URL}/subscriptions/${settings.asaas_subscription_id}`, {
          method: 'DELETE',
          headers: { 'access_token': ASAAS_API_KEY },
        })
      }
    } catch (e) {
      console.error('Falha ao cancelar assinatura no Asaas (seguindo com exclusão):', e)
    }

    // 2. Apaga arquivos do Storage (paths client_vault/userId/...)
    try {
      const { data: files } = await admin.storage.from('client_vault').list(userId, { limit: 1000 })
      if (files?.length) {
        // list() no nível do usuário devolve as "pastas" (clientIds); lista cada uma
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

    // 3. Apaga dados de TODAS as tabelas com user_id (não há FK com auth.users,
    //    então o deleteUser sozinho não limparia nada). Filhos de clients
    //    (orders/appointments/visits/client_bank_details) têm ON DELETE CASCADE,
    //    mas apagamos explicitamente por segurança.
    const tables = [
      'orders', 'appointments', 'visits', 'client_bank_details',
      'daily_notes', 'ai_chats', 'audit_logs', 'coupon_redemptions',
      'user_email_tokens', 'user_google_tokens', 'leaderboard',
      'companies', 'billing_identities', 'user_entitlements',
      'clients', 'user_settings',
    ]
    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq('user_id', userId)
      if (error) console.error(`Falha ao limpar ${table}:`, error.message)
    }

    // 4. Apaga o usuário do Auth
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
