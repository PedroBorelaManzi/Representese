// supabase/functions/geocode/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const allowedOrigins = [
  "https://www.representese.com",
  "https://representese.com",
  "http://localhost:3000",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "app://localhost",
];

// Mesma regra de api/_lib/cors.ts (ancorada, sem `.includes()` solto) — a
// versão antiga (`endsWith(".vercel.app") && includes("represente-me")`)
// deixava passar qualquer domínio tipo "evil-represente-me.vercel.app", e
// nem sequer reconhecia o domínio de produção representese.com.
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (/\.representese\.com$/.test(origin)) return true;
  if (/^https:\/\/representese[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  return false;
}

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': origin && isOriginAllowed(origin) ? origin : 'null',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    });
  }

  if (!isOriginAllowed(origin)) {
    console.warn(`Origin blocked: ${origin}`);
    return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid Token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { address, name, cnpj } = await req.json()

    if (!GEMINI_API_KEY) {
      console.error('Chave GEMINI_API_KEY não configurada nos secrets do Supabase.');
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured in Edge Function' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      })
    }

    const prompt = `INSTRUTIVO DE PESQUISA PROFUNDA (DEEP SEARCH):
Você deve localizar as coordenadas geográficas exatas (Latitude e Longitude) para esta empresa brasileira.

DADOS RECEBIDOS:
Nome: ${name || "Não informado"}
CNPJ: ${cnpj || "Não informado"}
Endereço Parcial: ${address || "Não informado"}

SUA MISSÃO:
1. Use seus recursos internos para pesquisar o endereço oficial desta empresa pelo CNPJ/Nome.
2. Tente identificar a localização no Google Maps (considere sites oficiais ou de consulta de CNPJ).
3. Retorne a localização do prédio/sede exata se possível.
4. Se não encontrar o prédio, use o centro da rua.
5. Se for impossível determinar a rua, retorne null.

FORMATO DE RESPOSTA (APENAS JSON):
{"lat": -00.00000, "lng": -00.00000}

Nota: Não invente coordenadas. Se não tiver certeza mínima da cidade, retorne null.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API Error:', errText);
      return new Response(JSON.stringify({ error: 'Gemini API call failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502
      })
    }

    const data = await response.json()
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    let cleanJson = responseText.trim();
    if (responseText.includes("{")) {
       cleanJson = responseText.substring(responseText.indexOf("{"), responseText.lastIndexOf("}") + 1);
    }
    
    try {
      const coords = JSON.parse(cleanJson);
      if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
        return new Response(JSON.stringify(coords), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      }
    } catch (parseErr) {
      console.error('Error parsing JSON from Gemini text:', responseText, parseErr);
    }

    return new Response(JSON.stringify(null), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error: any) {
    console.error('Geocode Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
