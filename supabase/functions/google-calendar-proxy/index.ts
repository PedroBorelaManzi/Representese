// supabase/functions/google-calendar-proxy/index.ts
//
// DESATIVADA (auditoria 2026-09-23). Esta function nunca esteve neste
// repositório — foi publicada direto no projeto Supabase por fora do Git
// (o entrypoint_path apontava pra uma pasta local do Antigravity, não pra
// cá). Na versão anterior, ela recebia um `accessToken` do Google cru no
// corpo da requisição e repassava pra API do Google Calendar sem checar
// Origin nem JWT nenhum (`Access-Control-Allow-Origin: '*'`) — um relay
// aberto que qualquer um podia usar pra bater na API do Google às custas
// da nossa infra, usando qualquer token do Google que já tivesse em mãos.
//
// Busca em todo o src/ e api/ não encontrou NENHUM lugar do app atual que
// chame esta function — a sincronização de Google Calendar de verdade
// (src/lib/googleSync.ts) já fala direto com a API do Google pelo
// navegador/token refresh próprio, sem passar por aqui. Ou seja: sem uso
// real, só risco. Em vez de tentar corrigir CORS/rate-limit numa function
// morta, ela foi substituída por este stub que sempre recusa.
//
// Se um dia precisar de um proxy de verdade pro Calendar, criar de novo do
// zero neste repositório, com Origin restrito (mesmo padrão de
// api/_lib/cors.ts) e JWT obrigatório.

Deno.serve(() => {
  return new Response(
    JSON.stringify({ error: "Esta function foi desativada — não está mais em uso." }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  );
});
