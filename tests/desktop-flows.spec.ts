import { test, expect } from '@playwright/test';

test.describe('Etapa 1: Revisão Frontend (Web Desktop) - Fluxos Principais', () => {

  test('Deve renderizar a tela de login corretamente', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText('Entrar na Dashboard');
  });

  test('Deve exibir erro amigável ao tentar logar com credenciais incorretas', async ({ page }) => {
    test.skip(!!process.env.CI, 'Requer Supabase Auth ao vivo — roda apenas local');
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await page.fill('input[type="email"]', 'usuario_invalido@exemplo.com');
    await page.fill('input[type="password"]', 'senha_incorreta');
    await page.click('button[type="submit"]');
    const toast = page.locator('text=Senha ou e-mail incorreto. Tente novamente.');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('Deve carregar a página de cadastro com seleção de planos', async ({ page }) => {
    // /register foi unificado com /planos (fluxo único de cadastro + seleção de plano)
    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/planos/);
    await expect(page.locator('text=sucesso profissional')).toBeVisible();
    await expect(page.locator('text=Exclusivo')).toBeVisible();
  });
});
