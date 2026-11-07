// Código de indicação vindo de um link (?ref=). Os códigos gerados em
// generate_my_referral_code são só letras/números maiúsculos (até 10 + sufixo
// numérico); aceitar qualquer coisa além disso só abriria porta pra lixo na URL
// virar consulta no banco.
export function normalizeReferralCode(raw: string | null | undefined): string | undefined {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 3 && code.length <= 20 ? code : undefined;
}
