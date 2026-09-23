// DESATIVADA (auditoria 2026-09-23). Duplicata exata de
// supabase/functions/exchange-auth-token — mesmo código, mesmo propósito
// (trocar code/refresh_token do Google OAuth). Busca em src/ e api/ não
// encontrou NENHUMA chamada a "google-token-exchange" — todo o app usa
// "exchange-auth-token" (ver src/lib/googleTokenExchange.ts,
// src/lib/googleSync.ts). Duas functions fazendo a mesma coisa é só
// superfície extra pra manter/proteger sem motivo; esta fica desativada.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Function descontinuada — use exchange-auth-token." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
