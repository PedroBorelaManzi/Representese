import { describe, it, expect } from 'vitest';
import { reconcileExtractionResult, buildOrderExtractionPrompt } from './orderExtractionCore';

// reconcileExtractionResult é o ponto onde a resposta da IA (que pode vir
// mal formada) se junta com as dicas locais — usado tanto pelo upload normal
// (orderProcessor.ts) quanto pelo link de enviar pedido (api/order-intake.ts),
// então um bug aqui afeta os dois ao mesmo tempo.
describe('reconcileExtractionResult', () => {
  it('usa os dados da IA quando o JSON é válido', () => {
    const raw = JSON.stringify({ client: 'Cliente X', cnpj: '11.222.333/0001-44', category: 'Cozimax', value: 500, address: 'Rua A, 1' });
    const result = reconcileExtractionResult(raw, '', 0, '', ['Cozimax']);
    expect(result).toEqual({
      client: 'Cliente X',
      cnpj: '11222333000144',
      category: 'Cozimax',
      value: 500,
      address: 'Rua A, 1',
      status: 'ready',
      method: 'ai',
    });
  });

  it('remove cercas de markdown (```json ... ```) antes de fazer o parse', () => {
    const raw = '```json\n{"client":"Cliente Y","cnpj":"","category":"","value":100,"address":""}\n```';
    const result = reconcileExtractionResult(raw, '', 0, '', []);
    expect(result.client).toBe('Cliente Y');
    expect(result.value).toBe(100);
  });

  it('categoria local "forte" (regex) tem prioridade sobre a categoria que a IA devolveu', () => {
    const raw = JSON.stringify({ client: 'X', cnpj: '', category: 'Categoria Errada Da IA', value: 10, address: '' });
    const result = reconcileExtractionResult(raw, '', 0, 'Cozimax', ['Cozimax']);
    expect(result.category).toBe('Cozimax');
  });

  it('sem categoria local, usa a da IA só se bater com a lista conhecida (exata ou parcial)', () => {
    const raw = JSON.stringify({ client: 'X', cnpj: '', category: 'cozimax', value: 10, address: '' });
    const result = reconcileExtractionResult(raw, '', 0, '', ['Cozimax']);
    expect(result.category).toBe('Cozimax'); // normaliza pra grafia da lista conhecida
  });

  it('categoria da IA sem nenhuma correspondência na lista conhecida vira vazia', () => {
    const raw = JSON.stringify({ client: 'X', cnpj: '', category: 'Fornecedor Desconhecido', value: 10, address: '' });
    const result = reconcileExtractionResult(raw, '', 0, '', ['Cozimax']);
    expect(result.category).toBe('');
  });

  it('valor da IA só é usado se for maior que zero — senão cai pro valor local', () => {
    const raw = JSON.stringify({ client: 'X', cnpj: '', category: '', value: 0, address: '' });
    const result = reconcileExtractionResult(raw, '', 250, '', []);
    expect(result.value).toBe(250);
  });

  it('JSON inválido cai pro modo local em vez de lançar', () => {
    const result = reconcileExtractionResult('isso não é JSON', '11222333000144', 300, '', []);
    expect(result).toEqual({
      client: 'Desconhecido',
      cnpj: '11222333000144',
      category: '',
      value: 300,
      address: '',
      status: 'ready',
      method: 'local',
    });
  });

  it('sem cliente na resposta da IA, usa "Desconhecido" em vez de string vazia', () => {
    const raw = JSON.stringify({ cnpj: '', category: '', value: 10, address: '' });
    const result = reconcileExtractionResult(raw, '', 0, '', []);
    expect(result.client).toBe('Desconhecido');
  });
});

describe('buildOrderExtractionPrompt', () => {
  it('inclui as dicas locais, as categorias conhecidas e o texto do documento', () => {
    const prompt = buildOrderExtractionPrompt('CONTEUDO DO PEDIDO', '11222333000144', 500, ['Cozimax', 'Acqua Clean']);
    expect(prompt).toContain('11222333000144');
    expect(prompt).toContain('500');
    // Separador virou " | " em vez de ", ": nome de representada pode ter
    // vírgula ("Aurora Tintas, Vernizes e Solventes") e a lista ficava
    // ambígua pra IA. O que importa é cada categoria estar no prompt.
    expect(prompt).toContain('Cozimax');
    expect(prompt).toContain('Acqua Clean');
    expect(prompt).toContain('CONTEUDO DO PEDIDO');
  });

  it('corta o texto do documento em 10000 caracteres', () => {
    const textoGrande = 'A'.repeat(20000);
    const prompt = buildOrderExtractionPrompt(textoGrande, '', 0, []);
    // 10000 A's do documento, mais um pedaço fixo de texto do próprio prompt.
    expect(prompt.match(/A{10000}/)).toBeTruthy();
    expect(prompt.match(/A{10001}/)).toBeFalsy();
  });
});
