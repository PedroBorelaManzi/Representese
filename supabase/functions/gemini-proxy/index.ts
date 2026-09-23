// DESATIVADA (auditoria 2026-09-23). Busca em src/ e api/ não encontrou
// NENHUMA chamada a "gemini-proxy" — o app chama o Gemini através de
// api/ai.ts (Vercel, com rate limiting via Upstash) ou, no fluxo de
// e-mail automático de pedidos, direto da Edge Function
// handle-inbound-order-email. Esta function ficava sem rate limit nenhum
// (só exigia JWT), repetindo uma chamada paga à API do Gemini sem
// controle de uso — sem uso real, só risco de custo. Desativada.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Function descontinuada — use api/ai.ts." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
