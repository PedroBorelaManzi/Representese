import { test, expect } from '@playwright/test';

/* Upgrade de plano: com cartão salvo não pede o cartão; sem ele (ou "usar outro") pede o cartão, mas
   nunca CEP nem número do endereço. Sessão e servidor simulados. */
async function abrirUpgrade(page: any, quote: any, enviados: any[]) {
  await page.addInitScript(() => {
    const session = { access_token: 'x', refresh_token: 'y', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'u1', email: 'a@b.com', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: 'Maria Teste', cpf_cnpj: '52998224725', phone: '(11) 98765-4321' }, app_metadata: {} } };
    localStorage.setItem('sb-wdtftftwdqtihupbtlxk-auth-token', JSON.stringify(session));
  });
  await page.route('**/rest/v1/user_settings*', (r: any) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user_id: 'u1', has_completed_onboarding: true, categories: ['X'] }) }));
  await page.route('**/rest/v1/user_entitlements*', (r: any) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subscription_status: 'active', plan_id: 'profissional', current_period_end: '2030-01-01T00:00:00Z' }) }));
  await page.route('**/auth/v1/user*', (r: any) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email: 'a@b.com', aud: 'authenticated', user_metadata: {} }) }));
  await page.route('**/functions/v1/process-checkout', (r: any) => {
    const b = r.request().postDataJSON();
    if (b.action === 'upgrade-quote') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, ...quote }) });
    enviados.push(b);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.goto('/dashboard/order-bump');
  await expect(page.getByRole('button', { name: /confirmar meu upgrade/i })).toBeVisible({ timeout: 20000 });
}

test('Upgrade com cartão salvo: mostra o cartão, cobra só a diferença e não pede cartão nem endereço', async ({ page }) => {
  const enviados: any[] = [];
  await abrirUpgrade(page, { mode: 'diff_subscription', newValue: 197, currentValue: 147, chargeNow: 50, savedCard: { brand: 'VISA', last4: '1234' } }, enviados);
  await page.getByRole('button', { name: /confirmar meu upgrade/i }).click();
  await expect(page.getByTestId('cartao-salvo')).toContainText('VISA •••• 1234');
  await expect(page.getByPlaceholder('Número do Cartão')).toHaveCount(0);
  await expect(page.getByPlaceholder(/CEP/i)).toHaveCount(0);
  await expect(page.getByPlaceholder(/endereço/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /confirmar e pagar r\$ 50,00/i })).toBeVisible();
  await page.getByRole('button', { name: /confirmar e pagar/i }).click();
  await expect.poll(() => enviados.length).toBe(1);
  expect(enviados[0]).toMatchObject({ action: 'upgrade-subscription', useSavedCard: true });
  expect(enviados[0].creditCard).toBeUndefined();
});

test('Upgrade sem cartão salvo: pede o cartão, mas sem CEP nem número do endereço', async ({ page }) => {
  const enviados: any[] = [];
  await abrirUpgrade(page, { mode: 'diff_subscription', newValue: 197, currentValue: 147, chargeNow: 50, savedCard: null }, enviados);
  await page.getByRole('button', { name: /confirmar meu upgrade/i }).click();
  await expect(page.getByPlaceholder('Número do Cartão')).toBeVisible();
  await expect(page.getByPlaceholder(/CEP/i)).toHaveCount(0);
  await expect(page.getByPlaceholder(/endereço/i)).toHaveCount(0);
  await page.getByPlaceholder('Nome no Cartão').fill('MARIA TESTE');
  await page.getByPlaceholder('Número do Cartão').fill('4111111111111111');
  await page.getByPlaceholder('Validade (MM/AA)').fill('1230');
  await page.getByPlaceholder('CVV').fill('123');
  await page.getByRole('button', { name: /confirmar e pagar/i }).click();
  await expect.poll(() => enviados.length).toBe(1);
  expect(enviados[0].useSavedCard).toBe(false);
  expect(enviados[0].creditCard).toMatchObject({ holderName: 'MARIA TESTE', number: '4111111111111111', ccv: '123' });
  expect(enviados[0].creditCard.postalCode).toBeUndefined();
});
