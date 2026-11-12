// Cupom único por desconto no iOS.
//
// A Apple exige que cada Offer Code personalizado seja ÚNICO no app e fique
// preso a UMA assinatura (não existe um código que valha em todos os planos).
// Então cada plano tem o seu código no App Store Connect:
//
//   30%:  BEMVINDO30 (Exclusivo Mensal) · BEMVINDO30EA · …PM · …PA · …MM · …MA
//   70%:  BEMVINDO70 (Exclusivo Mensal) · BEMVINDO70EA · …PM · …PA · …MM · …MA
//
// Pra quem digita, o cupom é um só (BEMVINDO30 ou BEMVINDO70): aqui a gente
// descobre o código certo pro plano/ciclo escolhido e monta o link de resgate
// da Apple.

export type CouponCycle = 'MONTHLY' | 'ANNUAL';

const APP_STORE_ID = '6807149345';
const BASES = ['BEMVINDO30', 'BEMVINDO70'] as const;

// Sufixo do código de cada plano/ciclo. O Exclusivo Mensal não tem sufixo.
const SUFFIX: Record<string, string> = {
  'exclusivo|MONTHLY': '',
  'exclusivo|ANNUAL': 'EA',
  'profissional|MONTHLY': 'PM',
  'profissional|ANNUAL': 'PA',
  'master|MONTHLY': 'MM',
  'master|ANNUAL': 'MA',
};

const KNOWN_SUFFIXES = ['EA', 'PM', 'PA', 'MM', 'MA'];

export type CouponResult =
  | { ok: true; code: string; url: string }
  | { ok: false; message: string };

export function appleRedeemUrl(code: string): string {
  return `https://apps.apple.com/redeem?ctx=offercodes&id=${APP_STORE_ID}&code=${encodeURIComponent(code)}`;
}

export function resolveAppleCoupon(input: string, planId: string, cycle: CouponCycle): CouponResult {
  const typed = (input || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!typed) return { ok: false, message: 'Digite o cupom.' };

  const suffix = SUFFIX[`${planId}|${cycle}`];
  if (suffix === undefined) return { ok: false, message: 'Esse plano não aceita cupom.' };

  const base = BASES.find((b) => typed === b || (typed.startsWith(b) && KNOWN_SUFFIXES.includes(typed.slice(b.length))));
  if (!base) return { ok: false, message: 'Cupom inválido.' };

  // Quem digitou o código já com sufixo (ex.: BEMVINDO30EA) só vale pro plano dele.
  const typedSuffix = typed.slice(base.length);
  if (typedSuffix && typedSuffix !== suffix) {
    return { ok: false, message: 'Esse código é de outro plano. Use só o cupom ' + base + '.' };
  }

  const code = `${base}${suffix}`;
  return { ok: true, code, url: appleRedeemUrl(code) };
}
