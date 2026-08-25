import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testes unitários vivem junto do código (src/** e, desde o link de
    // enviar pedido, api/** também — lógica pura do lado do servidor, como
    // hash de PIN e assinatura de sessão). Os E2E do Playwright ficam em
    // tests/ e NÃO devem ser tocados pelo Vitest.
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    environment: 'node',
  },
});
