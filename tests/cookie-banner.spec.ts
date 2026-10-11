import { test, expect } from '@playwright/test';

/* Aviso de cookies: "Aceitar" em destaque; recusar continua visível e a um clique (exigência da ANPD). */
test('Banner: aceitar em destaque e recusa discreta, mas visível e funcional', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('dialog', { name: 'Aviso de cookies' });
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(banner).toContainText('melhor experiência ao usuário');
  const aceitar = banner.getByRole('button', { name: 'Aceitar', exact: true });
  const recusar = banner.getByRole('button', { name: 'Continuar sem aceitar' });
  await expect(aceitar).toBeVisible();
  await expect(recusar).toBeVisible();
  const [a, r] = await Promise.all([aceitar.boundingBox(), recusar.boundingBox()]);
  expect(a!.width * a!.height).toBeGreaterThan(r!.width * r!.height);
  await recusar.click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Aviso de cookies' })).toBeHidden();
});
