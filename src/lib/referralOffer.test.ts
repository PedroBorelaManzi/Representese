import { describe, it, expect } from 'vitest';
import { referralTier, referralOfferCode } from './referralOffer';

describe('referralTier', () => {
  it('sem desconto não há oferta', () => {
    expect(referralTier(0)).toBeNull();
    expect(referralTier(null)).toBeNull();
    expect(referralTier(undefined)).toBeNull();
  });

  it('10% e 20% mapeiam para o degrau certo', () => {
    expect(referralTier(10)).toBe(10);
    expect(referralTier(20)).toBe(20);
  });

  it('valores intermediários arredondam para baixo (nunca promete mais do que ganhou)', () => {
    expect(referralTier(15)).toBe(10);
    expect(referralTier(9)).toBeNull();
  });
});

describe('referralOfferCode', () => {
  it('Exclusivo Mensal usa o código curto original', () => {
    expect(referralOfferCode('exclusivo', 'MONTHLY', 10)).toBe('referral_10');
    expect(referralOfferCode('exclusivo', 'MONTHLY', 20)).toBe('referral_20');
  });

  it('os outros 10 produtos levam plano e ciclo', () => {
    expect(referralOfferCode('exclusivo', 'ANNUAL', 10)).toBe('referral_10_exclusivo_annual');
    expect(referralOfferCode('profissional', 'MONTHLY', 20)).toBe('referral_20_profissional_monthly');
    expect(referralOfferCode('master', 'ANNUAL', 20)).toBe('referral_20_master_annual');
  });

  it('gera 12 códigos diferentes para os 3 planos × 2 ciclos × 2 degraus', () => {
    const codes = new Set<string>();
    for (const p of ['exclusivo', 'profissional', 'master'])
      for (const c of ['MONTHLY', 'ANNUAL'] as const)
        for (const t of [10, 20] as const) codes.add(referralOfferCode(p, c, t));
    expect(codes.size).toBe(12);
  });
});
