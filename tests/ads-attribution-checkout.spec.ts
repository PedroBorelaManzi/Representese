import { test, expect } from '@playwright/test';

/* Anúncio → /planos → checkout → conta: confere que a origem (utm_*), o anúncio (utm_content) e o telefone
   saem do navegador nos pontos certos. Tudo mockado (nenhum dado real, nenhuma cobrança); cartão de teste público
   (4111…). Dados de teste. */
test('Checkout vindo do anúncio B leva campanha, anúncio e telefone até o cadastro', async ({ page }) => {
  test.slow();
  const anon: any[] = [];
  const signups: any[] = [];

  await page.route('**/rest/v1/ads_anon_visits*', async (route) => {
    anon.push(JSON.parse(route.request().postData() || '[]')[0]);
    await route.fulfill({ status: 201, body: '' });
  });
  await page.route('**/rest/v1/ads_funnel_events*', (route) => route.fulfill({ status: 201, body: '' }));
  await page.route('**/auth/v1/signup*', async (route) => {
    signups.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: 'teste@exemplo.com', identities: [{ id: 'x' }], user_metadata: {} }),
    });
  });
  await page.route('**/functions/v1/process-checkout*', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'check-uniqueness') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/viacep.com.br/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' }) }));
  await page.route('**/rest/v1/user_settings*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  const qs = 'utm_source=instagram&utm_medium=paid_social&utm_campaign=ciclo1-trafego-ig-out26&utm_content=B-planos-caderno&fbclid=TESTE123';
  await page.goto(`/planos?${qs}`);
  await page.waitForLoadState('domcontentloaded');

  // o clique no anúncio fica guardado na sessão
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('rm_attribution')), { timeout: 15000 }).not.toBeNull();
  const attr = await page.evaluate(() => JSON.parse(sessionStorage.getItem('rm_attribution') || 'null'));
  expect(attr).toMatchObject({ utm_source: 'instagram', utm_campaign: 'ciclo1-trafego-ig-out26', utm_content: 'B-planos-caderno', fbclid: 'TESTE123', landing: '/planos' });

  await page.goto('/checkout?plan=profissional&period=MONTHLY');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[type="email"]').fill('teste@exemplo.com');
  await page.locator('input[type="password"]').first().fill('Teste@12345');
  await page.locator('input[autocomplete="name"]').fill('Maria Teste da Silva');
  await page.getByPlaceholder('000.000.000-00').fill('52998224725');
  await page.locator('select').first().selectOption('11');
  await page.locator('input[autocomplete="tel-national"]').fill('987654321');
  await page.getByPlaceholder('00000-000').fill('01001000');
  await page.getByPlaceholder('123').fill('100');
  const termos = page.locator('input[type="checkbox"]').first();
  if (!(await termos.isChecked())) await termos.check();

  await page.getByRole('button', { name: /continuar|próximo|pagamento/i }).first().click();
  // passo 2: cartão de TESTE público (Visa 4111…) — o servidor está simulado, nada vai a processador algum
  await page.getByPlaceholder('0000 0000 0000 0000').fill('4111111111111111');
  await page.getByPlaceholder('MM/AA').fill('12/30');
  await page.getByPlaceholder('123').last().fill('123');
  await page.getByPlaceholder('Como impresso no cartão').fill('MARIA TESTE');
  await page.getByRole('button', { name: /ativar assinatura/i }).click();

  await expect.poll(() => signups.length, { timeout: 15000 }).toBeGreaterThan(0);
  const meta = signups[0].data;
  expect(meta.attribution).toMatchObject({ utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'ciclo1-trafego-ig-out26', utm_content: 'B-planos-caderno', fbclid: 'TESTE123' });
  expect(String(meta.phone).replace(/\D/g, '')).toBe('11987654321');
  expect(meta.full_name).toBe('Maria Teste da Silva');
  expect(meta.termos_aceitos_em).toBeTruthy();

  // etapas anônimas por anúncio (o envio é assíncrono: espera chegar)
  const passos = () => anon.map((a) => `${a.step}|${a.source}|${a.campaign}|${a.ad}`);
  for (const step of ['planos_view', 'checkout_view', 'checkout_step2', 'checkout_submit']) {
    await expect.poll(passos, { timeout: 15000 }).toContain(`${step}|meta|ciclo1-trafego-ig-out26|B-planos-caderno`);
  }
});
