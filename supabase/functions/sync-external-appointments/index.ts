import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// verify_jwt = true no projeto (exige sessão Supabase válida pra sequer
// chamar) — CORS restrito por cima, auditoria 2026-09-23: antes era
// Access-Control-Allow-Origin: '*', permissivo à toa numa function que já
// exige login.
const allowedOrigins = [
  "https://www.representese.com",
  "https://representese.com",
  "http://localhost:3000",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "app://localhost",
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (/\.representese\.com$/.test(origin)) return true;
  if (/^https:\/\/representese[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  return false;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin && isOriginAllowed(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!isOriginAllowed(origin)) {
    console.warn(`Origin blocked: ${origin}`);
    return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json();
    const { action, accessToken, timeMin, event, eventId } = body;

    if (!action || !accessToken) {
      return new Response(JSON.stringify({ error: 'Missing action or accessToken' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    let googleRes;

    if (action === 'GET') {
      const url = `${GOOGLE_CALENDAR_API_URL}?timeMin=${encodeURIComponent(timeMin)}&maxResults=250&singleEvents=true&orderBy=startTime`;
      googleRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
    else if (action === 'POST') {
      if (eventId) {
        googleRes = await fetch(`${GOOGLE_CALENDAR_API_URL}/${eventId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });
      } else {
        googleRes = await fetch(GOOGLE_CALENDAR_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });
      }
    }
    else if (action === 'DELETE') {
      googleRes = await fetch(`${GOOGLE_CALENDAR_API_URL}/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
    }
    else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (googleRes.status === 204) {
       return new Response(JSON.stringify({ success: true }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 200,
       })
    }

    const data = await googleRes.json();
    return new Response(JSON.stringify({ status: googleRes.status, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Proxy Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
