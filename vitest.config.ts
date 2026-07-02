import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testes unitários vivem junto do código (src/**). Os E2E do Playwright
    // ficam em tests/ e NÃO devem ser tocados pelo Vitest.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
