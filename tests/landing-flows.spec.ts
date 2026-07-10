import { test, expect } from '@playwright/test';

/* Fluxos públicos da landing (auditoria 4.10) — sem necessidade de auth,
   rodam também no CI. Cobrem as seções extraídas de src/components/landing/. */
test.describe('Landing: seções, FAQ e planos', () => {

  test.beforeEach(async ({ page }) => {
    test.slow(); // landing é chunk lazy — primeiro load pode ser lento em máquina fria
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Deve renderizar todas as seções principais da landing', async ({ page }) => {
    // Planos não fica na landing — fluxo de captura de leads manda pra /register → /planos.
    await expect(page.locator('#diferencial')).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#recursos')).toBeAttached();
    await expect(page.locator('#industrias')).toBeAttached();
    await expect(page.locator('#duvidas')).toBeAttached();
    // hero
    await expect(page.locator('text=Comande todas em um só lugar.')).toBeVisible({ timeout: 15000 });
  });

  test('FAQ: accordion abre e mostra a resposta com texto', async ({ page }) => {
    const question = page.locator('text=Posso mudar de plano a qualquer momento?');
    await question.scrollIntoViewIfNeeded();
    await question.click();
    // resposta correspondente deve ficar visível e com conteúdo (bug histórico: accordion sem texto)
    const answer = page.locator('text=sem burocracia e com efeito imediato');
    await expect(answer).toBeVisible({ timeout: 5000 });
  });

  test('Nav: âncoras apontam para seções existentes', async ({ page }) => {
    for (const id of ['diferencial', 'recursos', 'industrias', 'duvidas']) {
      await expect(page.locator(`nav a[href="#${id}"]`)).toBeAttached();
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    // "Planos" no nav manda direto pro cadastro (captura de leads antes do checkout)
    await expect(page.locator('nav a[href="/register"]', { hasText: 'Planos' })).toBeAttached();
  });
});

/* Página /planos — checkout público, fora do fluxo de seções da landing. */
test.describe('Planos: toggle e checkout', () => {
  test.beforeEach(async ({ page }) => {
    test.slow();
    await page.goto('/planos');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Planos: toggle Mensal/Anual troca os preços', async ({ page }) => {
    // padrão é mensal (147 no Profissional)
    await expect(page.locator('text=147').first()).toBeVisible({ timeout: 15000 });

    await page.locator('button', { hasText: 'Anual' }).click();
    await expect(page.locator('text=132').first()).toBeVisible();

    await page.locator('button', { hasText: 'Mensal' }).click();
    await expect(page.locator('text=147').first()).toBeVisible();
  });

  test('CTA do plano leva ao checkout com plano e período na URL', async ({ page }) => {
    await page.locator('button', { hasText: 'Assinar agora' }).first().click();
    await expect(page).toHaveURL(/\/checkout\?plan=\w+&period=(ANNUAL|MONTHLY)/);
  });
});
