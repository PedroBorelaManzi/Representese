// DESATIVADA na auditoria de segurança de 12/07/2026.
// Esta função aceitava email+code sem autenticação e enviava e-mails oficiais
// com código escolhido pelo chamador (vetor de phishing). O fluxo de troca de
// senha agora verifica a senha atual direto no Supabase Auth (SettingsSecurity).
Deno.serve(() =>
  new Response(JSON.stringify({ success: false, message: 'Fluxo descontinuado.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  })
);
