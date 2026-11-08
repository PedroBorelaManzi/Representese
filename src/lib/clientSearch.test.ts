import { describe, it, expect } from 'vitest';
import { matchesClientSearch, normalizeText } from './clientSearch';

const clientes = {
  deItapeva: { name: 'Mercado Silva', city: 'Itapeva', cnpj: '12.345.678/0001-90' },
  chamadoItapeva: { name: 'Itapeva Peças', city: 'Capão Bonito', cnpj: '98.765.432/0001-10' },
};

describe('matchesClientSearch', () => {
  it('por Cidade: só acha quem mora lá, não quem tem a palavra no nome', () => {
    expect(matchesClientSearch(clientes.deItapeva, 'Itapeva', 'cidade')).toBe(true);
    expect(matchesClientSearch(clientes.chamadoItapeva, 'Itapeva', 'cidade')).toBe(false);
  });

  it('por Nome: só acha pelo nome, não pela cidade', () => {
    expect(matchesClientSearch(clientes.chamadoItapeva, 'Itapeva', 'nome')).toBe(true);
    expect(matchesClientSearch(clientes.deItapeva, 'Itapeva', 'nome')).toBe(false);
  });

  it('por CNPJ: compara só os números, com ou sem pontuação', () => {
    expect(matchesClientSearch(clientes.deItapeva, '12.345.678', 'cnpj')).toBe(true);
    expect(matchesClientSearch(clientes.deItapeva, '12345678000190', 'cnpj')).toBe(true);
    expect(matchesClientSearch(clientes.deItapeva, '98765', 'cnpj')).toBe(false);
  });

  it('por CNPJ, texto sem número não casa com todo mundo', () => {
    expect(matchesClientSearch(clientes.deItapeva, 'silva', 'cnpj')).toBe(false);
  });

  it('ignora acento e maiúsculas', () => {
    expect(matchesClientSearch({ city: 'São Paulo' }, 'sao paulo', 'cidade')).toBe(true);
    expect(matchesClientSearch({ name: 'JOSÉ & FILHOS' }, 'jose', 'nome')).toBe(true);
  });

  it('busca vazia mostra todos, em qualquer campo', () => {
    expect(matchesClientSearch(clientes.deItapeva, '', 'cnpj')).toBe(true);
    expect(matchesClientSearch(clientes.deItapeva, '   ', 'nome')).toBe(true);
  });

  it('cliente sem o campo preenchido não quebra', () => {
    expect(matchesClientSearch({}, 'x', 'cidade')).toBe(false);
    expect(matchesClientSearch({ name: null, cnpj: null }, '123', 'cnpj')).toBe(false);
  });
});

describe('normalizeText', () => {
  it('tira acento, maiúscula e espaços das pontas', () => {
    expect(normalizeText('  Itapevá ')).toBe('itapeva');
    expect(normalizeText(null)).toBe('');
  });
});
