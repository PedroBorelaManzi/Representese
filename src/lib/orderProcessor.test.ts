import { describe, it, expect, vi } from 'vitest';

// orderProcessor.ts importa geminiProxy.ts, que importa o cliente real do
// Supabase — sem mockar, o módulo tenta carregar sessão de localStorage no
// import (ambiente node dos testes não tem), gerando rejeições não tratadas.
// Essas três funções são só regex/heurística local, não usam nada disso.
vi.mock('./geminiProxy', () => ({ geminiWithSystem: vi.fn() }));

import { extractCNPJLocally, extractCategoryLocally, extractValueLocally } from './orderProcessor';

// Cobre só a extração local (regex/heurística), que roda sem IA e serve de
// fallback quando o Gemini falha ou demora — é a rede de segurança do
// lançamento de pedido, então precisa estar certa sozinha.

describe('extractValueLocally', () => {
  it('prioriza o valor ao lado de uma palavra-chave de total', () => {
    const texto = 'Subtotal: 50,00\nDesconto: 5,00\nTotal Geral: 999,00\nOutros valores: 1234,56';
    expect(extractValueLocally(texto)).toBe(999);
  });

  it('sem palavra-chave, pega o maior valor monetário da folha', () => {
    const texto = 'Item 1: R$ 45,00\nItem 2: R$ 1.234,56\nItem 3: R$ 200,00';
    expect(extractValueLocally(texto)).toBe(1234.56);
  });

  it('formato ponto-decimal (sem milhar) é lido corretamente', () => {
    const texto = 'Valor total: 199.90';
    expect(extractValueLocally(texto)).toBeCloseTo(199.90);
  });

  it('formato brasileiro com milhar e centavos', () => {
    const texto = 'Valor líquido: 12.345,67';
    expect(extractValueLocally(texto)).toBeCloseTo(12345.67);
  });

  it('sem nenhum valor monetário no texto, devolve 0', () => {
    expect(extractValueLocally('documento sem números')).toBe(0);
  });
});

describe('extractCNPJLocally', () => {
  it('prioriza o CNPJ perto de uma palavra-chave de cliente/destinatário', () => {
    const texto = 'Emitente: 11.111.111/0001-11\nDestinatário: Empresa X CNPJ 22.222.222/0001-22';
    expect(extractCNPJLocally(texto)).toBe('22222222000122');
  });

  it('sem palavra-chave por perto, usa o primeiro CNPJ encontrado', () => {
    const texto = 'Documento com CNPJ 33.333.333/0001-33 no meio do texto';
    expect(extractCNPJLocally(texto)).toBe('33333333000133');
  });

  it('sem CNPJ nenhum, devolve string vazia', () => {
    expect(extractCNPJLocally('nada aqui')).toBe('');
  });
});

describe('extractCategoryLocally', () => {
  const categorias = ['Cozimax', 'Acqua Clean'];

  it('encontra por correspondência parcial de palavra (ex: fabricante no rodapé)', () => {
    expect(extractCategoryLocally('Documento emitido por Indústria Cozimax Ltda', categorias)).toBe('Cozimax');
  });

  it('é insensível a acentos e maiúsculas', () => {
    expect(extractCategoryLocally('EMITENTE: ACQUA CLEAN PRODUTOS', categorias)).toBe('Acqua Clean');
  });

  it('sem nenhuma categoria conhecida no texto, devolve string vazia', () => {
    expect(extractCategoryLocally('fornecedor totalmente diferente', categorias)).toBe('');
  });

  it('sem categorias configuradas, devolve string vazia sem lançar erro', () => {
    expect(extractCategoryLocally('qualquer texto', [])).toBe('');
  });
});
