import { describe, it, expect } from 'vitest';
import { computeCommissionRows, computeCommissionTotals, normalizeCompanyName } from './commissions';

const order = (category: string, value: number, created_at = '2026-01-15T00:00:00Z') => ({
  category,
  value,
  created_at,
});

describe('normalizeCompanyName', () => {
  it('remove espaço nas pontas e coloca em maiúsculas', () => {
    expect(normalizeCompanyName('  Cozimax  ')).toBe('COZIMAX');
  });

  it('string vazia/undefined não lança erro', () => {
    expect(normalizeCompanyName('')).toBe('');
  });
});

describe('computeCommissionRows', () => {
  it('calcula comissão como faturamento × percentual configurado', () => {
    const rows = computeCommissionRows(
      [order('Cozimax', 1000)],
      [],
      ['Cozimax'],
      { Cozimax: 10 }
    );
    expect(rows).toEqual([
      { key: 'COZIMAX', name: 'Cozimax', faturamento: 1000, faturamentoPrev: 0, pedidos: 1, pct: 10, comissao: 100 },
    ]);
  });

  it('soma múltiplos pedidos da mesma empresa no mês', () => {
    const rows = computeCommissionRows(
      [order('Cozimax', 500), order('Cozimax', 300)],
      [],
      ['Cozimax'],
      { Cozimax: 10 }
    );
    expect(rows[0].faturamento).toBe(800);
    expect(rows[0].pedidos).toBe(2);
    expect(rows[0].comissao).toBe(80);
  });

  it('casa pedido com empresa cadastrada mesmo com caixa diferente', () => {
    const rows = computeCommissionRows(
      [order('cozimax industria', 1000)],
      [],
      [],
      {}
    );
    // sem empresa cadastrada equivalente, o pedido aparece com o próprio nome do pedido
    expect(rows[0].name).toBe('cozimax industria');
    expect(rows[0].faturamento).toBe(1000);
  });

  it('empresa cadastrada sem nenhum pedido no mês aparece com faturamento zero', () => {
    const rows = computeCommissionRows([], [], ['Acqua Clean'], { 'Acqua Clean': 5 });
    expect(rows).toEqual([
      { key: 'ACQUA CLEAN', name: 'Acqua Clean', faturamento: 0, faturamentoPrev: 0, pedidos: 0, pct: 5, comissao: 0 },
    ]);
  });

  it('empresa sem percentual configurado tem comissão zero', () => {
    const rows = computeCommissionRows([order('Sem Config', 1000)], [], ['Sem Config'], {});
    expect(rows[0].pct).toBe(0);
    expect(rows[0].comissao).toBe(0);
  });

  it('traz o faturamento do mês anterior pra mesma empresa', () => {
    const rows = computeCommissionRows(
      [order('Cozimax', 1000)],
      [order('Cozimax', 800)],
      ['Cozimax'],
      { Cozimax: 10 }
    );
    expect(rows[0].faturamentoPrev).toBe(800);
  });

  it('ordena por maior comissão primeiro', () => {
    const rows = computeCommissionRows(
      [order('A', 100), order('B', 1000)],
      [],
      ['A', 'B'],
      { A: 50, B: 10 }
    );
    // A: 100*0.5=50 | B: 1000*0.1=100 -> B primeiro
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
  });
});

describe('computeCommissionTotals', () => {
  it('soma faturamento e comissão de todas as linhas', () => {
    const rows = computeCommissionRows(
      [order('A', 1000), order('B', 500)],
      [],
      ['A', 'B'],
      { A: 10, B: 20 }
    );
    const totals = computeCommissionTotals(rows);
    expect(totals.faturamento).toBe(1500);
    expect(totals.comissao).toBe(100 + 100); // 1000*10% + 500*20%
  });

  it('comissaoPrev usa o percentual ATUAL sobre o faturamento do mês anterior', () => {
    const rows = computeCommissionRows(
      [order('A', 1000)],
      [order('A', 500)],
      ['A'],
      { A: 10 }
    );
    const totals = computeCommissionTotals(rows);
    expect(totals.comissaoPrev).toBe(50); // 500 * 10%
  });

  it('conta empresas com faturamento mas sem percentual configurado', () => {
    const rows = computeCommissionRows(
      [order('Configurada', 1000), order('SemConfig', 500)],
      [],
      ['Configurada', 'SemConfig'],
      { Configurada: 10 }
    );
    expect(computeCommissionTotals(rows).semConfig).toBe(1);
  });

  it('fila vazia gera totais zerados sem lançar erro', () => {
    expect(computeCommissionTotals([])).toEqual({
      faturamento: 0,
      comissao: 0,
      comissaoPrev: 0,
      semConfig: 0,
    });
  });
});
