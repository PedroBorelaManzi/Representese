import { describe, it, expect } from 'vitest';
import {
  computeCompanyCycles, headlineCycle, cycleLabel,
  MIN_PURCHASES, type OrderLike,
} from './purchaseCycle';

const NOW = new Date('2026-07-01T12:00:00Z');

function order(category: string, isoDate: string): OrderLike {
  return { category, created_at: isoDate };
}

describe('computeCompanyCycles', () => {
  it('retorna vazio sem pedidos', () => {
    expect(computeCompanyCycles([], NOW)).toEqual([]);
  });

  it('fica "observando" com menos de MIN_PURCHASES compras', () => {
    const cycles = computeCompanyCycles(
      [order('ACME', '2026-01-01'), order('ACME', '2026-03-01')],
      NOW
    );
    expect(cycles).toHaveLength(1);
    expect(cycles[0].status).toBe('observando');
    expect(cycles[0].purchases).toBe(2);
    expect(cycles[0].nextPredicted).toBeNull();
  });

  it('fica "observando" quando o histórico abrange menos de 60 dias', () => {
    const cycles = computeCompanyCycles(
      [order('ACME', '2026-06-01'), order('ACME', '2026-06-10'), order('ACME', '2026-06-20')],
      NOW
    );
    expect(cycles[0].status).toBe('observando');
  });

  it('detecta cliente "atrasado" quando a previsão já passou', () => {
    // compra a cada ~30 dias, última em 01/05 → previsão ~31/05, hoje é 01/07
    const cycles = computeCompanyCycles(
      [order('ACME', '2026-03-01'), order('ACME', '2026-04-01'), order('ACME', '2026-05-01')],
      NOW
    );
    expect(cycles[0].status).toBe('atrasado');
    expect(cycles[0].daysUntilNext).toBeLessThan(0);
    expect(cycles[0].avgIntervalDays).toBe(31);
  });

  it('detecta "previsto" quando a próxima compra está a até 7 dias', () => {
    // ciclo de ~30 dias, última compra em 05/06 → previsão ~05/07 (em 4 dias)
    const cycles = computeCompanyCycles(
      [order('ACME', '2026-04-06'), order('ACME', '2026-05-06'), order('ACME', '2026-06-05')],
      NOW
    );
    expect(cycles[0].status).toBe('previsto');
  });

  it('detecta "no_prazo" logo após uma compra', () => {
    const cycles = computeCompanyCycles(
      [order('ACME', '2026-04-25'), order('ACME', '2026-05-25'), order('ACME', '2026-06-28')],
      NOW
    );
    expect(cycles[0].status).toBe('no_prazo');
  });

  it('separa ciclos por empresa e ordena por urgência', () => {
    const cycles = computeCompanyCycles(
      [
        // ACME atrasada (span de 90 dias, acima do mínimo de 60)
        order('ACME', '2026-01-01'), order('ACME', '2026-02-15'), order('ACME', '2026-04-01'),
        // BETA ainda observando
        order('BETA', '2026-06-20'),
      ],
      NOW
    );
    expect(cycles).toHaveLength(2);
    expect(cycles[0].category).toBe('ACME');
    expect(cycles[0].status).toBe('atrasado');
    expect(cycles[1].category).toBe('BETA');
  });

  it('ignora datas inválidas e agrupa categoria vazia como GERAL', () => {
    const cycles = computeCompanyCycles(
      [order('', '2026-06-01'), order('ACME', 'data-invalida')],
      NOW
    );
    expect(cycles).toHaveLength(1);
    expect(cycles[0].category).toBe('GERAL');
  });
});

describe('headlineCycle', () => {
  it('retorna null sem ciclos', () => {
    expect(headlineCycle([])).toBeNull();
  });

  it('prioriza ciclo acionável (atrasado/previsto)', () => {
    const cycles = computeCompanyCycles(
      [
        order('ATRASADA', '2026-01-01'), order('ATRASADA', '2026-02-15'), order('ATRASADA', '2026-04-01'),
        order('NOVA', '2026-06-25'),
      ],
      NOW
    );
    expect(headlineCycle(cycles)?.category).toBe('ATRASADA');
  });
});

describe('cycleLabel', () => {
  it('descreve atraso em dias', () => {
    const [c] = computeCompanyCycles(
      [order('A', '2026-01-01'), order('A', '2026-02-15'), order('A', '2026-04-01')],
      NOW
    );
    expect(cycleLabel(c)).toMatch(/^Atrasado \d+ dia/);
  });

  it('mostra progresso de aprendizado', () => {
    const [c] = computeCompanyCycles([order('A', '2026-06-01')], NOW);
    expect(cycleLabel(c)).toBe(`Aprendendo o ritmo (1/${MIN_PURCHASES} compras)`);
  });
});
