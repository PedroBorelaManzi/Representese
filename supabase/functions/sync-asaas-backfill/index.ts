import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')

const normalizePlanId = (val: string): string => {
  if (!val) return 'profissional';
  const v = val.toLowerCase();
  if (v.includes('master')) return 'master';
  if (v.includes('exclusivo')) return 'exclusivo';
  return 'profissional';
};

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    // Operação em massa (lê e reescreve entitlements de TODOS os usuários) —
    // só admin pode chamar. Sem isso, qualquer conta logada disparava um
    // backfill que reescrevia plano/status de assinatura de qualquer pessoa.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nenhum token fornecido.' }), { status: 401 })
    }

    const { data: { user: caller }, error: callerError } = await createClient(
      SUPABASE_URL!,
      SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    const { data: callerSettings } = await supabase
      .from('user_settings')
      .select('is_admin')
      .eq('user_id', caller.id)
      .single()

    if (!callerSettings?.is_admin) {
      return new Response(JSON.stringify({ error: 'Acesso restrito a administradores.' }), { status: 403 })
    }

    let authUsers: any[] = [];
    let hasMoreUsers = true;
    let page = 1;
    while(hasMoreUsers) {
        const { data: usersData, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        authUsers = authUsers.concat(usersData.users);
        if (usersData.users.length < 1000) hasMoreUsers = false;
        page++;
    }

    const emailToUserId = new Map(authUsers.map(u => [u.email?.toLowerCase(), u.id]));

    let subscriptions: any[] = [];
    let offset = 0;
    let hasMore = true;
    while(hasMore) {
        const res = await fetch(`https://www.asaas.com/api/v3/subscriptions?status=ACTIVE&limit=100&offset=${offset}`, {
            headers: { 'access_token': ASAAS_API_KEY! }
        });
        const data = await res.json();
        if (data.data) {
            subscriptions = subscriptions.concat(data.data);
            hasMore = data.hasMore;
            offset += 100;
        } else {
            hasMore = false;
        }
    }

    let payments: any[] = [];
    offset = 0;
    hasMore = true;
    while(hasMore) {
        const res = await fetch(`https://www.asaas.com/api/v3/payments?status=RECEIVED&limit=100&offset=${offset}`, {
            headers: { 'access_token': ASAAS_API_KEY! }
        });
        const data = await res.json();
        if (data.data) {
            payments = payments.concat(data.data);
            hasMore = data.hasMore;
            offset += 100;
        } else {
            hasMore = false;
        }
    }
    
    offset = 0;
    hasMore = true;
    while(hasMore) {
        const res = await fetch(`https://www.asaas.com/api/v3/payments?status=CONFIRMED&limit=100&offset=${offset}`, {
            headers: { 'access_token': ASAAS_API_KEY! }
        });
        const data = await res.json();
        if (data.data) {
            payments = payments.concat(data.data);
            hasMore = data.hasMore;
            offset += 100;
        } else {
            hasMore = false;
        }
    }

    const processItem = async (item: any) => {
        let userId = item.externalReference;
        if (!userId && item.customer) {
            const custRes = await fetch(`https://www.asaas.com/api/v3/customers/${item.customer}`, {
                headers: { 'access_token': ASAAS_API_KEY! }
            });
            const custData = await custRes.json();
            if (custData.email) {
                userId = emailToUserId.get(custData.email.toLowerCase());
            }
        }
        
        if (userId) {
            await supabase.from('user_entitlements').update({
                subscription_status: 'active',
                plan_id: normalizePlanId(item.description)
            }).eq('user_id', userId);
        }
    };

    let processed = 0;
    for (const sub of subscriptions) {
        await processItem(sub);
        processed++;
    }

    const recentPayments = payments.filter(p => {
        const desc = p.description?.toLowerCase() || '';
        let days = 30;
        if (desc.includes('anual')) days = 365;
        else if (desc.includes('semestral')) days = 180;
        
        return new Date(p.dateCreated).getTime() > Date.now() - days * 24 * 60 * 60 * 1000;
    });

    for (const pay of recentPayments) {
        await processItem(pay);
        processed++;
    }

    return new Response(JSON.stringify({ success: true, processed_subscriptions: subscriptions.length, processed_payments: recentPayments.length }), { status: 200 })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
