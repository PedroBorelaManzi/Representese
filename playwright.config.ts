import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    // O site registra um service worker em produção (só pra habilitar
    // "Instalar app" — ver public/sw.js). Rodando os testes contra o build
    // de produção (npm run preview), esse SW ficava no meio das requisições
    // mockadas via page.route(), fazendo elas caírem na rede de verdade em
    // vez de serem interceptadas.
    serviceWorkers: 'block',
  },
  projects: process.env.CI
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
        { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
      ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
