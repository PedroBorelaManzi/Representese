import { describe, it, expect } from 'vitest';
import { resolveAppleCoupon, appleRedeemUrl } from './appleCoupon';

describe('resolveAppleCoupon', () => {
  it('mapeia o cupom único pro código de cada plano/ciclo', () => {
    const casos: Array<[string, 'MONTHLY' | 'ANNUAL', string]> = [
      ['exclusivo', 'MONTHLY', 'BEMVINDO30'],
      ['exclusivo', 'ANNUAL', 'BEMVINDO30EA'],
      ['profissional', 'MONTHLY', 'BEMVINDO30PM'],
      ['profissional', 'ANNUAL', 'BEMVINDO30PA'],
      ['master', 'MONTHLY', 'BEMVINDO30MM'],
      ['master', 'ANNUAL', 'BEMVINDO30MA'],
    ];
    for (const [plano, ciclo, esperado] of casos) {
      const r = resolveAppleCoupon('BEMVINDO30', plano, ciclo);
      expect(r).toMatchObject({ ok: true, code: esperado });
    }
  });

  it('funciona com 70% e ignora caixa e espaços', () => {
    const r = resolveAppleCoupon('  bemvindo70 ', 'master', 'ANNUAL');
    expect(r).toMatchObject({ ok: true, code: 'BEMVINDO70MA' });
  });

  it('monta o link de resgate da Apple', () => {
    const r = resolveAppleCoupon('BEMVINDO70', 'exclusivo', 'MONTHLY');
    expect(r.ok && r.url).toBe(appleRedeemUrl('BEMVINDO70'));
    expect(appleRedeemUrl('BEMVINDO70')).toContain('ctx=offercodes&id=6807149345&code=BEMVINDO70');
  });

  it('aceita o código já com sufixo só no plano certo', () => {
    expect(resolveAppleCoupon('BEMVINDO30EA', 'exclusivo', 'ANNUAL')).toMatchObject({ ok: true, code: 'BEMVINDO30EA' });
    expect(resolveAppleCoupon('BEMVINDO30EA', 'master', 'MONTHLY')).toMatchObject({ ok: false });
  });

  it('recusa cupom inválido, vazio ou de plano desconhecido', () => {
    expect(resolveAppleCoupon('PROMO10', 'master', 'MONTHLY')).toMatchObject({ ok: false });
    expect(resolveAppleCoupon('', 'master', 'MONTHLY')).toMatchObject({ ok: false });
    expect(resolveAppleCoupon('BEMVINDO30', 'outro', 'MONTHLY')).toMatchObject({ ok: false });
  });
});
