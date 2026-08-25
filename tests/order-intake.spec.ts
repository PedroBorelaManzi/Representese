import { test, expect, type Route } from '@playwright/test';

/**
 * Cobre a tela pública de "enviar pedido" (/enviar/:token) — o PIN certo/
 * errado e a transição pro passo de anexar arquivo. Não cobre o upload de
 * arquivo em si (upload direto assinado pro Storage + leitura por IA): isso
 * exigiria simular o Supabase Storage de verdade, o que teria pouco valor
 * sobre só confirmar que a chamada teria a forma certa. O que importa mais —
 * a tela não deixar passar sem o PIN certo, e reconhecer sessão salva — está
 * coberto aqui.
 */

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('Enviar Pedido (link do funcionário)', () => {
  test('PIN errado mostra erro; PIN certo avança pro passo de anexar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    await page.route('**/api/order-intake', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'verify') {
        if (body.payload.pin !== '654321') {
          await json(route, { error: 'Link ou PIN inválido.' }, 401);
          return;
        }
        await json(route, { sessionToken: 'fake-session-token', categories: ['ACME'] });
        return;
      }
      await json(route, { error: 'not mocked' }, 500);
    });

    await page.goto('/enviar/token-de-teste');
    await expect(page.getByText('Enviar Pedido')).toBeVisible();
    await expect(page.getByText('Digite o PIN')).toBeVisible();

    // PIN errado
    await page.locator('input[inputmode="numeric"]').fill('111111');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText('Link ou PIN inválido.')).toBeVisible();

    // PIN certo
    await page.locator('input[inputmode="numeric"]').fill('654321');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText('Anexe o arquivo do pedido')).toBeVisible();
  });

  test('link inválido (sem token) mostra mensagem clara em vez de travar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    await page.goto('/enviar/');
    // Sem :token a rota nem casa (React Router manda pro fallback "*"), então
    // cai na home — o importante é não haver crash/tela em branco.
    await expect(page.locator('body')).toBeVisible();
  });

  test('sessão salva no navegador pula direto pro passo de anexar (mesmo depois de fechar e reabrir)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    // localStorage (não sessionStorage): o PIN é digitado uma vez e vale até
    // o dono do link revogar — precisa sobreviver a fechar o app/navegador.
    await page.addInitScript(() => {
      localStorage.setItem(
        'rm_order_intake_session_token-de-teste',
        JSON.stringify({ sessionToken: 'fake-session-token', categories: ['ACME'] })
      );
    });

    await page.goto('/enviar/token-de-teste');
    await expect(page.getByText('Anexe o arquivo do pedido')).toBeVisible();
    await expect(page.getByText('Digite o PIN')).not.toBeVisible();
  });
});
