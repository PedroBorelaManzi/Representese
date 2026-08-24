import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupCnpj } from './cnpjLookup';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupCnpj', () => {
  it('devolve null para CNPJ com menos de 14 dígitos, sem chamar a API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupCnpj('123');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limpa a máscara antes de consultar a API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ razao_social: 'ACME LTDA', municipio: 'São Paulo', uf: 'SP' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await lookupCnpj('11.222.333/0001-81');

    expect(fetchMock).toHaveBeenCalledWith('https://brasilapi.com.br/api/cnpj/v1/11222333000181');
  });

  it('monta nome/cidade/endereço a partir da resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        razao_social: 'ACME LTDA',
        nome_fantasia: 'Acme',
        municipio: 'São Paulo',
        uf: 'SP',
        logradouro: 'Rua das Flores',
        numero: '100',
        bairro: 'Centro',
        cep: '01000-000',
      }),
    }));

    const result = await lookupCnpj('11222333000181');

    expect(result).toEqual({
      cnpj: '11222333000181',
      name: 'ACME LTDA',
      city: 'São Paulo',
      state: 'SP',
      address: 'Rua das Flores, 100 - Centro, São Paulo - SP',
      raw: {
        razaoSocial: 'ACME LTDA',
        nomeFantasia: 'Acme',
        logradouro: 'Rua das Flores',
        numero: '100',
        bairro: 'Centro',
        cep: '01000000',
      },
    });
  });

  it('usa nome fantasia quando não há razão social', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nome_fantasia: 'Acme' }),
    }));

    const result = await lookupCnpj('11222333000181');

    expect(result?.name).toBe('Acme');
  });

  it('devolve null quando a API responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const result = await lookupCnpj('11222333000181');

    expect(result).toBeNull();
  });
});
