import { test, expect, type Route } from '@playwright/test';

/**
 * Cobertura do painel autenticado: até aqui os únicos testes E2E cobriam
 * telas públicas (landing, login com credenciais erradas, planos) — nada
 * que exige estar logado tinha teste nenhum. Este arquivo cobre o caminho
 * de ouro "logar → cadastrar cliente → ver na lista", que é o uso mais
 * básico do app.
 *
 * Não usa credenciais reais nem o Supabase de produção: intercepta as
 * chamadas de rede (auth, REST, CNPJ, geocodificação) e responde com dados
 * fictícios. Isso evita depender de uma conta de teste (que exigiria uma
 * senha real guardada em algum lugar) e mantém o teste determinístico —
 * não some se o banco de produção mudar ou ficar fora do ar.
 */

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e-test@example.com',
  email_confirmed_at: '2024-01-01T00:00:00Z',
  phone: '',
  confirmed_at: '2024-01-01T00:00:00Z',
  last_sign_in_at: '2024-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Responde qualquer chamada REST do Supabase (`/rest/v1/<tabela>`) com uma
 *  lista vazia — ou `null` quando o pedido é de uma linha só (`.single()` /
 *  `.maybeSingle()`, sinalizado pelo header Accept do PostgREST). O app já
 *  trata "sem dados ainda" graciosamente em toda tela (usuário novo), então
 *  isso é suficiente pra carregar o painel inteiro sem quebrar em lugar
 *  nenhum — só a tabela `clients` ganha um comportamento especial abaixo,
 *  pra o teste conseguir validar o cadastro de verdade. */
async function registerBackendMocks(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/token*', (route) =>
    json(route, {
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: FAKE_USER,
    })
  );

  await page.route('**/rest/v1/**', async (route) => {
    const accept = route.request().headers()['accept'] || '';
    const isSingleRow = accept.includes('vnd.pgrst.object');
    await json(route, isSingleRow ? null : [], route.request().method() === 'GET' ? 200 : 201);
  });

  // Sem uma assinatura "active", o SubscriptionGuard bloqueia o painel
  // inteiro e manda pra tela de "escolher um plano" — no app real é assim
  // que deveria ser, mas aqui o teste precisa passar por ele. O status só é
  // aplicado se a linha de user_settings também existir (ver SettingsContext),
  // então as duas chamadas precisam de resposta "com dado" juntas.
  await page.route('**/rest/v1/user_entitlements**', (route) =>
    json(route, { plan_id: 'master', subscription_status: 'active', trial_ends_at: null, current_period_end: null })
  );
  await page.route('**/rest/v1/user_settings**', (route) =>
    json(route, {
      user_id: FAKE_USER.id,
      has_completed_onboarding: true,
      categories: ['ACME'],
      commissions: {},
      revenue_ceiling: 1000000,
      alerta_days: 30,
      critico_days: 45,
      inativo_days: 90,
      theme: 'light',
    })
  );

  // CNPJ "cadastrado" na BrasilAPI fake — mesmo formato de resposta real.
  await page.route('https://brasilapi.com.br/api/cnpj/v1/**', (route) =>
    json(route, {
      razao_social: 'ACME REPRESENTACOES LTDA',
      nome_fantasia: 'ACME',
      municipio: 'São Paulo',
      uf: 'SP',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cep: '01310100',
    })
  );

  // Geocodificação (tier "Gemini" do getHighPrecisionCoordinates, via /api/ai
  // do próprio app) — devolve uma coordenada qualquer só pra cascata fechar
  // logo no primeiro tier em vez de cair pro Nominatim (rede externa real).
  await page.route('**/api/ai', (route) => json(route, { lat: -23.5613, lng: -46.6558 }));

  // Clientes cadastrados nesta sessão de teste (memória do processo do
  // teste, não do app) — pro GET da lista devolver o que foi "inserido".
  const createdClients: any[] = [];
  await page.route('**/rest/v1/clients**', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const payload = route.request().postDataJSON();
      const rows = (Array.isArray(payload) ? payload : [payload]).map((c, i) => ({
        ...c,
        id: `client-${createdClients.length + i}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      createdClients.push(...rows);
      await json(route, rows, 201);
      return;
    }
    if (method === 'GET') {
      await json(route, createdClients, 200);
      return;
    }
    await json(route, [], 200);
  });
}

test.describe('Painel autenticado — caminho de ouro', () => {
  test('logar e cadastrar um cliente novo pelo CNPJ', async ({ page }, testInfo) => {
    // Este fluxo testa lógica de negócio (login → CNPJ → cadastro), não
    // layout responsivo — isso já é coberto por mobile-flows.spec.ts. O
    // menu lateral fica atrás de um hambúrguer em telas pequenas, então
    // roda só no projeto desktop pra não misturar as duas preocupações.
    test.skip(testInfo.project.name !== 'chromium', 'Fluxo de negócio — roda só no desktop (chromium).');

    await registerBackendMocks(page);

    await page.goto('/login');
    await page.fill('input[type="email"]', 'e2e-test@example.com');
    await page.fill('input[type="password"]', 'senha-qualquer-123');
    await page.click('button[type="submit"]');

    // Login redireciona pro painel — sinal de que a sessão "colou" e o
    // ProtectedRoute + SubscriptionGuard deixaram passar.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

    await page.goto('/dashboard/clientes');
    await expect(page).toHaveURL(/\/dashboard\/clientes/);

    await page.getByRole('button', { name: /novo cliente/i }).click();
    await page.getByPlaceholder('00.000.000/0000-00').fill('11.222.333/0001-81');
    await page.getByRole('button', { name: /adicionar cliente/i }).click();

    // O modal de cadastro fecha só depois do insert "ter dado certo" —
    // é o sinal observável de que CNPJ → geocodificação → insert rodou
    // até o fim sem lançar exceção.
    await expect(page.getByPlaceholder('00.000.000/0000-00')).not.toBeVisible({ timeout: 20000 });

    // Cliente cadastrado aparece na lista (vem do mock do GET /clients).
    await expect(page.getByText('ACME REPRESENTACOES LTDA')).toBeVisible();
  });
});
