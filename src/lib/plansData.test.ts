import { describe, it, expect } from 'vitest';
import { plans } from './plansData';

describe('plansData', () => {
  it('mantém os 3 planos com slugs esperados pelo checkout e banco', () => {
    expect(plans.map((p) => p.id)).toEqual(['exclusivo', 'profissional', 'master']);
  });

  it('preços batem com a tabela oficial (49,90/79,90/99,90)', () => {
    const byId = Object.fromEntries(plans.map((p) => [p.id, p]));
    expect(byId.exclusivo.price).toBe('49.90');
    expect(byId.profissional.price).toBe('79.90');
    expect(byId.master.price).toBe('99.90');
  });

  it('preço anual é sempre menor que o mensal', () => {
    for (const p of plans) {
      expect(Number(p.annualPrice)).toBeLessThan(Number(p.price));
    }
  });

  it('preço "de" (originalPrice) é sempre maior que o cobrado', () => {
    for (const p of plans) {
      expect(Number(p.originalPrice)).toBeGreaterThan(Number(p.price));
    }
  });

  it('apenas o Profissional é marcado como popular', () => {
    expect(plans.filter((p) => p.popular).map((p) => p.id)).toEqual(['profissional']);
  });

  it('todos os planos têm features com texto e ícone', () => {
    for (const p of plans) {
      expect(p.features.length).toBeGreaterThan(0);
      for (const f of p.features) {
        expect(f.text).toBeTruthy();
        expect(f.icon).toBeTruthy();
      }
    }
  });
});
