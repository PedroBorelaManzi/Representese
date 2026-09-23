import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* Registra a abertura de uma sessão do app: dispositivo (mandado pelo
   cliente) + localização aproximada (cidade/estado/país, resolvida AQUI a
   partir do IP de quem chamou — nunca no navegador, pra não expor o IP do
   usuário a um serviço de terceiro dentro do bundle do app). Usado pelo
   painel Gerenciar Usuários (Admin) pra mostrar de onde e de quantos
   aparelhos cada usuário abriu o sistema.

   Best-effort: se a geolocalização falhar (serviço fora do ar, IP não
   resolvido etc.), ainda grava o dispositivo sem a localização — nunca
   trava o login de ninguém por causa disso.

   NOTA (auditoria 2026-09-23): o app hoje chama `api/ai.ts` com
   `action: "track_session"` em vez desta function — o geo-IP via
   ipapi.co, chamado a partir da infra compartilhada do Supabase, vinha
   quase sempre com erro/rate-limit porque o IP que chega nele é o do
   datacenter, não o do usuário (ver comentário em src/lib/sessionTracking.ts).
   Esta function fica registrada aqui por enquanto — não está mais em uso,
   mas não representa risco (exige JWT válido e só grava a própria sessão). */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ success: false, message: 'Não autorizado.' }, 401)

    // Cliente com o JWT de quem chamou (não service role) — a política de
    // INSERT de user_events já exige auth.uid() = user_id, então isso sozinho
    // garante que ninguém registra sessão em nome de outra pessoa.
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return jsonResponse({ success: false, message: 'Sessão inválida ou expirada.' }, 401)

    let device: Record<string, unknown> = {}
    try { device = await req.json() } catch { /* corpo vazio: segue só com localização */ }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      null

    let location: Record<string, unknown> = {}
    if (ip) {
      try {
        const geoRes = await fetch(`https://ipapi.co/${ip}/json/`)
        if (geoRes.ok) {
          const geo = await geoRes.json()
          if (!geo.error) {
            location = { city: geo.city, region: geo.region, country: geo.country_name }
          }
        }
      } catch (e) {
        console.error('Falha ao resolver geolocalização (seguindo sem):', e)
      }
    }

    const { error } = await supabase.from('user_events').insert([{
      user_id: user.id,
      event_type: 'session_open',
      metadata: { ...device, ...location, ip },
    }])
    if (error) throw error

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('Erro ao registrar sessão:', error)
    return jsonResponse({ success: false, message: 'Erro interno.' }, 500)
  }
})
