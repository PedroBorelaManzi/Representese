import { describe, it, expect } from 'vitest';
import { normalizeReferralCode } from './referralCode';

describe('normalizeReferralCode', () => {
  it('aceita um código gerado pelo sistema', () => {
    expect(normalizeReferralCode('JOAO')).toBe('JOAO');
    expect(normalizeReferralCode('PEDRO12')).toBe('PEDRO12');
  });

  it('põe em maiúsculas e tira espaços e símbolos', () => {
    expect(normalizeReferralCode('  joao ')).toBe('JOAO');
    expect(normalizeReferralCode('jo-ao!')).toBe('JOAO');
  });

  it('rejeita vazio, nulo e código curto demais', () => {
    expect(normalizeReferralCode('')).toBeUndefined();
    expect(normalizeReferralCode(null)).toBeUndefined();
    expect(normalizeReferralCode(undefined)).toBeUndefined();
    expect(normalizeReferralCode('ab')).toBeUndefined();
  });

  it('rejeita lixo comprido (ex.: texto colado na URL)', () => {
    expect(normalizeReferralCode('A'.repeat(21))).toBeUndefined();
  });

  it('nunca devolve símbolos: texto estranho vira só letras/números', () => {
    const out = normalizeReferralCode("'; drop table coupons;--");
    expect(out).toMatch(/^[A-Z0-9]+$/);
  });
});
