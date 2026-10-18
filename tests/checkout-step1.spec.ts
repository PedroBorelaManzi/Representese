import { test, expect } from '@playwright/test';

/* Passo 1 do checkout: o botão "Continuar" destrava com dados válidos (inclusive nomes que contêm
   "sa"/"me", como Samuel Rosa) e, quando trava, a tela diz o motivo (CPF inválido, etc.). */
test.describe('Checkout passo 1', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/viacep.com.br/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }) }));
    await page.goto('/checkout?plan=profissional&period=MONTHLY');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('input[type="email"]').fill('teste@exemplo.com');
    await page.locator('input[autocomplete="new-password"]').fill('Teste@12345');
    await page.locator('input[autocomplete="name"]').fill('Samuel Amanda Mendes Rosa');
    await page.locator('select').first().selectOption('11');
    await page.locator('input[autocomplete="tel-national"]').fill('987654321');
    await page.getByPlaceholder('00000-000').fill('01001000');
    await page.getByPlaceholder('123').fill('100');
    const termos = page.locator('input[type="checkbox"]').first();
    if (!(await termos.isChecked())) await termos.check();
  });

  test('CPF inválido: botão travado e a tela explica', async ({ page }) => {
    await page.getByPlaceholder('000.000.000-00').fill('15997305499');
    await expect(page.getByText('CPF inválido. Confira os números.')).toBeVisible();
    await expect(page.getByTestId('step1-pendencias')).toContainText('CPF válido');
    await expect(page.getByRole('button', { name: /continuar para pagamento/i })).toBeDisabled();
  });

  test('CPF válido e nome com "sa"/"me": botão libera', async ({ page }) => {
    await page.getByPlaceholder('000.000.000-00').fill('52998224725');
    await expect(page.getByRole('button', { name: /continuar para pagamento/i })).toBeEnabled();
  });
});
