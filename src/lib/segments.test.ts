import { describe, it, expect } from 'vitest';
import { companyExamples, SEGMENTS } from './segments';

describe('companyExamples', () => {
  it('sem mercado da lista usa o padrão', () => {
    expect(companyExamples([])).toEqual(['Nestlé', 'Coca-Cola']);
    expect(companyExamples(['inexistente'])).toEqual(['Nestlé', 'Coca-Cola']);
  });
  it('um mercado: duas marcas dele', () => {
    expect(companyExamples(['construcao'])).toEqual(['Tigre', 'Quartzolit']);
    expect(companyExamples(['papelaria_escritorio'])).toEqual(['Faber-Castell', 'BIC']);
  });
  it('vários mercados: uma marca de cada, até 3', () => {
    expect(companyExamples(['supermercado', 'construcao', 'papelaria_escritorio', 'farmacia'])).toEqual(['Nestlé', 'Tigre', 'Faber-Castell']);
  });
  it('todo mercado tem ids únicos e duas marcas', () => {
    expect(new Set(SEGMENTS.map((s) => s.id)).size).toBe(SEGMENTS.length);
    SEGMENTS.forEach((s) => expect(s.brands.every(Boolean)).toBe(true));
  });
});
