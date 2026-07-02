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
    await expect(page.locator('#diferencial')).toBeAttached({ timeout: 15000 });
    await expect(page.locator('#recursos')).toBeAttached();
    await expect(page.locator('#industrias')).toBeAttached();
    await expect(page.locator('#precos')).toBeAttached();
    await expect(page.locator('#duvidas')).toBeAttached();
    // hero
    await expect(page.locator('text=Comande todas em um só lugar.')).toBeVisible({ timeout: 15000 });
  });

  test('FAQ: accordion abre e mostra a resposta com texto', async ({ page }) => {
    const question = page.locator('text=Posso mudar de plano a qualquer momento?');
    await question.scrollIntoViewIfNeeded();
    await question.click();
    // resposta correspondente deve ficar visível e com conteúdo (bug histórico: accordion sem texto)
    const answer = page.locator('text=Upgrade e downgrade disponíveis');
    await expect(answer).toBeVisible({ timeout: 5000 });
  });

  test('Planos: toggle Mensal/Anual troca os preços', async ({ page }) => {
    const precos = page.locator('#precos');
    await precos.scrollIntoViewIfNeeded();

    // padrão é anual (147 → 132 no Profissional)
    await expect(precos.locator('text=132').first()).toBeVisible({ timeout: 15000 });

    await precos.locator('button', { hasText: 'Mensal' }).click();
    await expect(precos.locator('text=147').first()).toBeVisible();

    await precos.locator('button', { hasText: 'Anual' }).click();
    await expect(precos.locator('text=132').first()).toBeVisible();
  });

  test('CTA do plano leva ao checkout com plano e período na URL', async ({ page }) => {
    const precos = page.locator('#precos');
    await precos.scrollIntoViewIfNeeded();
    await precos.locator('a[href*="/checkout"]').first().click();
    await expect(page).toHaveURL(/\/checkout\?plan=\w+&period=(annual|monthly)/);
  });

  test('Nav: âncoras apontam para seções existentes', async ({ page }) => {
    for (const id of ['diferencial', 'recursos', 'industrias', 'precos', 'duvidas']) {
      await expect(page.locator(`nav a[href="#${id}"]`)).toBeAttached();
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });
});
