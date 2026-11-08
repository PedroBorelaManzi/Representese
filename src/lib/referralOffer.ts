// Resgate do desconto de quem INDICA no iOS. No site/Android o desconto sai
// sozinho na cobrança do Asaas; na App Store a Apple só aplica desconto em
// assinatura existente por Oferta Promocional, que a própria pessoa precisa
// aceitar dentro do app. São 12 ofertas no App Store Connect (6 produtos ×
// 10%/20%), criadas com o identificador abaixo.

export type ReferralTier = 10 | 20;
export type ReferralCycle = 'MONTHLY' | 'ANNUAL';

/** Desconto conquistado → degrau da oferta (10 ou 20); null se ainda não há desconto. */
export function referralTier(pct: number | null | undefined): ReferralTier | null {
  const n = Number(pct) || 0;
  if (n >= 20) return 20;
  if (n >= 10) return 10;
  return null;
}

/**
 * Identificador da oferta promocional no App Store Connect. A Apple exige nome e
 * identificador únicos no app inteiro e não deixa renomear: as duas ofertas do
 * Exclusivo Mensal nasceram com o código curto, as outras 10 levam plano e ciclo.
 */
export function referralOfferCode(planId: string, cycle: ReferralCycle, tier: ReferralTier): string {
  const c = cycle === 'ANNUAL' ? 'annual' : 'monthly';
  if (planId === 'exclusivo' && c === 'monthly') return `referral_${tier}`;
  return `referral_${tier}_${planId}_${c}`;
}
