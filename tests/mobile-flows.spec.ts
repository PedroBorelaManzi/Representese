import { test, expect } from '@playwright/test';

test.describe('Etapa 2: Revisão Frontend (Mobile + Responsivo)', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('Deve renderizar a Landing Page com layout empilhado e responsivo', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Representese').first()).toBeVisible();
    await page.goto('/planos');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Sucesso Profissional')).toBeVisible();
    await expect(page.locator('text=Exclusivo')).toBeVisible();
  });

  test('Deve renderizar a tela de login otimizada para toque (mobile)', async ({ page }) => {
    test.skip(!!process.env.CI, 'Requer Supabase Auth ao vivo — roda apenas local');
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitBtn = page.locator('button[type="submit"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await emailInput.fill('teste_mobile@exemplo.com');
    await passwordInput.fill('senha_qualquer');
    await submitBtn.click();
    const toast = page.locator('text=Senha ou e-mail incorreto. Tente novamente.');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('Deve renderizar a página de termos de serviço de forma responsiva', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Termos de Serviço').first()).toBeVisible();
  });
});
