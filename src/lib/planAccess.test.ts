import { describe, it, expect } from 'vitest';
import { planBloqueiaRota } from './planAccess';

describe('planBloqueiaRota', () => {
  it('Exclusivo não acessa as telas do Profissional', () => {
    for (const r of ['relatorios', 'comissoes', 'produtos', 'ranking', 'email']) {
      expect(planBloqueiaRota('exclusivo', `/dashboard/${r}`)).toBe(true);
    }
  });
  it('Exclusivo continua com as telas básicas', () => {
    for (const r of ['', '/agenda', '/clientes', '/empresas', '/entregas', '/assistente', '/arquivos', '/map']) {
      expect(planBloqueiaRota('exclusivo', `/dashboard${r}`)).toBe(false);
    }
  });
  it('Profissional e Master acessam tudo', () => {
    expect(planBloqueiaRota('profissional', '/dashboard/relatorios')).toBe(false);
    expect(planBloqueiaRota('master', '/dashboard/relatorios')).toBe(false);
  });
  it('plano desconhecido ou vazio não bloqueia', () => {
    expect(planBloqueiaRota(undefined, '/dashboard/relatorios')).toBe(false);
    expect(planBloqueiaRota('none', '/dashboard/relatorios')).toBe(false);
  });
});
