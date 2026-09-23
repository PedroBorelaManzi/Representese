// supabase/functions/microsoft-token/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

serve(async (req) => {
  const origin = req.headers.get('origin');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': origin && isOriginAllowed(origin) ? origin : 'null',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    });
  }

  // Enforce CORS origin verification
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
    'Content-Type': 'application/json',
  };

  try {
    const body = await req.json();

    const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
    const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      console.error('Microsoft credentials not set in Supabase Secrets.');
      return new Response(JSON.stringify({ error: 'Microsoft OAuth keys not configured in Edge Function' }), {
        status: 500,
        headers: corsHeaders
      });
    }

    // Client requests public client id to build OAuth URL
    if (body.get_client_id) {
      return new Response(JSON.stringify({ client_id: MICROSOFT_CLIENT_ID }), {
        status: 200,
        headers: corsHeaders
      });
    }

    const { code, refresh_token, redirect_uri, grant_type } = body;

    const endpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const bodyRequest = new URLSearchParams();
    bodyRequest.append("client_id", MICROSOFT_CLIENT_ID);
    bodyRequest.append("client_secret", MICROSOFT_CLIENT_SECRET);

    if (grant_type === "authorization_code") {
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: 'Missing code or redirect_uri' }), {
          status: 400,
          headers: corsHeaders
        });
      }
      bodyRequest.append("code", code);
      bodyRequest.append("redirect_uri", redirect_uri);
      bodyRequest.append("grant_type", "authorization_code");
    } else if (grant_type === "refresh_token") {
      if (!refresh_token) {
        return new Response(JSON.stringify({ error: 'Missing refresh_token' }), {
          status: 400,
          headers: corsHeaders
        });
      }
      bodyRequest.append("refresh_token", refresh_token);
      bodyRequest.append("grant_type", "refresh_token");
    } else {
      return new Response(JSON.stringify({ error: 'Invalid grant_type' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyRequest.toString(),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: corsHeaders
    });

  } catch (error: any) {
    console.error('microsoft-token Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
