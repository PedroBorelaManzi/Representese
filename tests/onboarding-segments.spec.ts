import { test, expect } from '@playwright/test';

/* Onboarding, passo 1: mercado de atuação (lista + "Outro"). O modal só abre pra conta sem onboarding
   concluído e sem empresas; aqui a sessão e o banco são simulados. */
test('Onboarding pergunta o mercado de atuação antes das empresas e salva a resposta', async ({ page }) => {
  const saved: any[] = [];
  await page.route('**/rest/v1/user_settings*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user_id: 'u1', has_completed_onboarding: false, categories: [] }) });
    }
    const b = req.postDataJSON();
    if (b && (b.segments || b.segment_other !== undefined)) saved.push(b);
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(() => {
    const session = { access_token: 'x', refresh_token: 'y', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'u1', email: 'a@b.com', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} } };
    Object.keys(localStorage).forEach((k) => k.startsWith('sb-') && localStorage.removeItem(k));
    localStorage.setItem('sb-wdtftftwdqtihupbtlxk-auth-token', JSON.stringify(session));
  });
  await page.route('**/rest/v1/user_entitlements*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subscription_status: 'active', plan_id: 'profissional' }) }));
  await page.route('**/auth/v1/user*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email: 'a@b.com', aud: 'authenticated', user_metadata: {} }) }));
  await page.route('**/rest/v1/clients*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0' } }));

  await page.goto('/dashboard');
  await expect(page.getByText('Em quais mercados você atua?')).toBeVisible({ timeout: 20000 });
  const next = page.getByRole('button', { name: /próximo passo/i });
  await expect(next).toBeDisabled();

  await page.getByRole('button', { name: /^Supermercado/ }).click();
  await page.getByLabel(/não achou o seu mercado/i).fill('Revenda de gás e água');
  await next.click();

  await expect(page.getByText('Configure suas empresas')).toBeVisible();
  await expect(page.getByPlaceholder(/^Ex: Nestlé, Coca-Cola/)).toBeVisible(); // Supermercado → Nestlé, Coca-Cola
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  expect(saved[0].segments).toEqual(['supermercado']);
  expect(saved[0].segment_other).toBe('Revenda de gás e água');

  // empresas → comissões: uma empresa por valor fixo, outra por produto
  await page.getByPlaceholder(/^Ex: Nestlé/).fill('Nestlé');
  await page.keyboard.press('Enter');
  await page.getByPlaceholder(/^Ex: Nestlé/).fill('Tigre');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /próximo passo/i }).click();
  await expect(page.getByText('Suas comissões')).toBeVisible();
  await page.getByLabel('Comissão de Nestlé').fill('5');
  await page.getByRole('button', { name: 'Por produto' }).nth(1).click();
  await expect(page.getByLabel('Comissão de Tigre')).toBeDisabled();
  await expect(page.getByText('Cada produto tem o seu %. Você configura na aba Produtos depois.')).toBeVisible();
  await expect(page.getByLabel('Comissão de Nestlé')).toBeEnabled();
});
