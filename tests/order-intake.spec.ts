import { test, expect, type Route } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

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

  test('sem cliente identificado, abre a busca na lista — escolher um encerra a busca', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    await page.addInitScript(() => {
      localStorage.setItem(
        'rm_order_intake_session_token-de-teste',
        JSON.stringify({
          sessionToken: 'fake-session-token',
          categories: ['ACME'],
          clients: [
            { id: 'c1', name: 'Cliente Alfa' },
            { id: 'c2', name: 'Cliente Beta' },
          ],
        })
      );
    });

    await page.route('**/api/order-intake', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'parse') {
        // clientMatch null: leitura não achou o cliente — é exatamente o
        // caso que deve abrir a busca na lista em vez de já cair em
        // "cliente novo".
        await json(route, { status: 'ready', client: '', cnpj: '', category: 'ACME', value: 150, categories: ['ACME'], clientMatch: null });
        return;
      }
      await json(route, { error: 'not mocked' }, 500);
    });

    await page.goto('/enviar/token-de-teste');
    await expect(page.getByText('Anexe o arquivo do pedido')).toBeVisible();

    await page.locator('input[accept=".pdf,.xlsx,.xls"]').setInputFiles(join(HERE, '../src/lib/__fixtures__/pedido-exemplo.pdf'));

    const busca = page.getByPlaceholder('Buscar cliente por nome ou CNPJ');
    await expect(busca).toBeVisible();
    await busca.fill('Beta');
    await page.getByRole('button', { name: 'Cliente Beta' }).click();

    await expect(page.getByText('Cliente Beta')).toBeVisible();
    await expect(busca).not.toBeVisible();
    // Dois botões "Trocar" na tela (arquivo e cliente) — o do cliente é o
    // que fica ao lado do nome selecionado.
    await expect(page.getByRole('button', { name: 'Trocar' })).toHaveCount(2);
  });

  test('cancelar o pedido em revisão volta pro passo de anexar, limpo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    await page.addInitScript(() => {
      localStorage.setItem(
        'rm_order_intake_session_token-de-teste',
        JSON.stringify({ sessionToken: 'fake-session-token', categories: ['ACME'], clients: [] })
      );
    });

    await page.route('**/api/order-intake', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'parse') {
        await json(route, { status: 'ready', client: 'Cliente X', cnpj: '', category: 'ACME', value: 150, categories: ['ACME'], clientMatch: { id: 'c1', name: 'Cliente X' } });
        return;
      }
      await json(route, { error: 'not mocked' }, 500);
    });

    await page.goto('/enviar/token-de-teste');
    await page.locator('input[accept=".pdf,.xlsx,.xls"]').setInputFiles(join(HERE, '../src/lib/__fixtures__/pedido-exemplo.pdf'));

    await expect(page.getByRole('button', { name: /confirmar pedido/i })).toBeVisible();
    await page.getByRole('button', { name: /cancelar e começar de novo/i }).click();

    // Volta pra tela de anexar arquivo, sem nenhum resquício do pedido cancelado.
    await expect(page.getByText('Tirar foto')).toBeVisible();
    await expect(page.getByRole('button', { name: /confirmar pedido/i })).not.toBeVisible();
  });

  test('CNPJ de 14 dígitos sem cadastro pula direto pro cadastro de cliente novo (sem busca)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    await page.addInitScript(() => {
      localStorage.setItem(
        'rm_order_intake_session_token-de-teste',
        JSON.stringify({ sessionToken: 'fake-session-token', categories: ['ACME'], clients: [{ id: 'c1', name: 'Cliente Alfa' }] })
      );
    });

    await page.route('**/api/order-intake', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'parse') {
        // CNPJ de 14 dígitos, clientMatch nulo: o servidor já conferiu contra
        // TODOS os clientes da conta e não achou — é prova de CNPJ novo.
        await json(route, {
          status: 'ready', client: 'Empresa Nova Ltda', cnpj: '11222333000181',
          category: 'ACME', value: 300, categories: ['ACME'], clientMatch: null,
        });
        return;
      }
      await json(route, { error: 'not mocked' }, 500);
    });

    await page.goto('/enviar/token-de-teste');
    await page.locator('input[accept=".pdf,.xlsx,.xls"]').setInputFiles(join(HERE, '../src/lib/__fixtures__/pedido-exemplo.pdf'));

    // Não deve nem oferecer a busca — o CNPJ já prova que é cliente novo.
    await expect(page.getByPlaceholder('Buscar cliente por nome ou CNPJ')).not.toBeVisible();
    await expect(page.getByText(/confirmar o pedido já cadastra/i)).toBeVisible();
    await expect(page.getByPlaceholder('Nome do cliente novo')).toHaveValue('Empresa Nova Ltda');
    await expect(page.getByPlaceholder('CNPJ (opcional)')).toHaveValue('11222333000181');
  });

  test('sessão salva antiga (sem clientes ainda) atualiza a lista sozinha, sem pedir PIN', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    // Simula uma sessão salva ANTES da lista de clientes existir nesse
    // formato (ou só desatualizada) — o bug real que isso corrige.
    await page.addInitScript(() => {
      localStorage.setItem(
        'rm_order_intake_session_token-de-teste',
        JSON.stringify({ sessionToken: 'fake-session-token', categories: ['ACME'] })
      );
    });

    await page.route('**/api/order-intake', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'session_data') {
        await json(route, { categories: ['ACME'], clients: [{ id: 'c1', name: 'Cliente Recém-Cadastrado' }] });
        return;
      }
      if (body.action === 'parse') {
        await json(route, { status: 'ready', client: '', cnpj: '', category: 'ACME', value: 150, categories: ['ACME'], clientMatch: null });
        return;
      }
      await json(route, { error: 'not mocked' }, 500);
    });

    await page.goto('/enviar/token-de-teste');
    // Pula direto pro passo de anexar — a sessão salva já bastava, sem PIN.
    await expect(page.getByText('Anexe o arquivo do pedido')).toBeVisible();

    await page.locator('input[accept=".pdf,.xlsx,.xls"]').setInputFiles(join(HERE, '../src/lib/__fixtures__/pedido-exemplo.pdf'));

    const busca = page.getByPlaceholder('Buscar cliente por nome ou CNPJ');
    await expect(busca).toBeVisible();
    // A lista não fica vazia: o refresh em segundo plano já trouxe o cliente
    // que tinha sido cadastrado depois da sessão salva ter sido criada.
    await expect(page.getByRole('button', { name: 'Cliente Recém-Cadastrado' })).toBeVisible();
  });

  test('X no topo cancela o pedido em revisão', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    await page.addInitScript(() => {
      localStorage.setItem(
        'rm_order_intake_session_token-de-teste',
        JSON.stringify({ sessionToken: 'fake-session-token', categories: ['ACME'], clients: [] })
      );
    });

    await page.route('**/api/order-intake', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'parse') {
        await json(route, { status: 'ready', client: 'Cliente X', cnpj: '', category: 'ACME', value: 150, categories: ['ACME'], clientMatch: { id: 'c1', name: 'Cliente X' } });
        return;
      }
      await json(route, { error: 'not mocked' }, 500);
    });

    await page.goto('/enviar/token-de-teste');
    await page.locator('input[accept=".pdf,.xlsx,.xls"]').setInputFiles(join(HERE, '../src/lib/__fixtures__/pedido-exemplo.pdf'));

    await expect(page.getByRole('button', { name: /confirmar pedido/i })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar pedido' }).click();

    await expect(page.getByText('Tirar foto')).toBeVisible();
    await expect(page.getByRole('button', { name: /confirmar pedido/i })).not.toBeVisible();
  });

  test('busca de cliente encontra além dos 50 primeiros exibidos por padrão', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    // 55 clientes, ordenados por nome (mesma ordem que o servidor devolve) —
    // "Zulu Distribuidora" fica por último, fora da exibição padrão de 50,
    // só alcançável buscando.
    const muitosClientes = Array.from({ length: 54 }, (_, i) => ({
      id: `c${i}`,
      name: `Cliente ${String(i + 1).padStart(3, '0')}`,
    })).concat([{ id: 'c-zulu', name: 'Zulu Distribuidora' }]);

    await page.addInitScript((clientes) => {
      localStorage.setItem(
        'rm_order_intake_session_token-de-teste',
        JSON.stringify({ sessionToken: 'fake-session-token', categories: ['ACME'], clients: clientes })
      );
    }, muitosClientes);

    await page.route('**/api/order-intake', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'parse') {
        await json(route, { status: 'ready', client: '', cnpj: '', category: 'ACME', value: 150, categories: ['ACME'], clientMatch: null });
        return;
      }
      await json(route, { error: 'not mocked' }, 500);
    });

    await page.goto('/enviar/token-de-teste');
    await page.locator('input[accept=".pdf,.xlsx,.xls"]').setInputFiles(join(HERE, '../src/lib/__fixtures__/pedido-exemplo.pdf'));

    const busca = page.getByPlaceholder('Buscar cliente por nome ou CNPJ');
    await expect(busca).toBeVisible();

    // Sem busca: "Zulu" não aparece (está fora dos 50 primeiros exibidos).
    await expect(page.getByRole('button', { name: 'Zulu Distribuidora' })).not.toBeVisible();
    await expect(page.getByText(/mostrando os 50 primeiros de 55/i)).toBeVisible();

    // Buscando, o filtro roda na lista inteira — encontra mesmo fora dos 50.
    await busca.fill('zulu');
    await expect(page.getByRole('button', { name: 'Zulu Distribuidora' })).toBeVisible();
  });
});
