import { describe, it, expect } from 'vitest';
import { ajustarFaturamento } from './faturamento';

describe('ajustarFaturamento', () => {
  it('soma um valor novo numa categoria vazia', () => {
    expect(ajustarFaturamento(null, 'ACME', 100)).toEqual({ ACME: 100 });
  });

  it('soma um valor a uma categoria existente', () => {
    expect(ajustarFaturamento({ ACME: 100 }, 'ACME', 50)).toEqual({ ACME: 150 });
  });

  it('preserva outras categorias intocadas', () => {
    expect(ajustarFaturamento({ ACME: 100, OUTRA: 20 }, 'ACME', 50)).toEqual({ ACME: 150, OUTRA: 20 });
  });

  it('subtrai (delta negativo) ao excluir um pedido', () => {
    expect(ajustarFaturamento({ ACME: 100 }, 'ACME', -40)).toEqual({ ACME: 60 });
  });

  it('nunca deixa o total negativo', () => {
    expect(ajustarFaturamento({ ACME: 30 }, 'ACME', -100)).toEqual({ ACME: 0 });
  });

  it('trata valor corrompido/não numérico como zero antes de ajustar', () => {
    expect(ajustarFaturamento({ ACME: 'lixo' as any }, 'ACME', 50)).toEqual({ ACME: 50 });
  });
});
