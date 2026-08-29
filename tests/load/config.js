// Configuração compartilhada pelos scripts de teste de carga (k6).
//
// Tudo vem de variáveis de ambiente — nada de segredo é commitado.
// Ver tests/load/.env.example para a lista completa.

// --- Alvos --------------------------------------------------------------------

// URL do deploy de staging/preview da Vercel (SEM barra no final).
// Ex.: https://representese-git-staging-pedro.vercel.app
export const SITE_URL = (__ENV.SITE_URL || '').replace(/\/$/, '');

// Projeto Supabase de STAGING (nunca o de produção wdtftftwdqtihupbtlxk).
export const SUPABASE_URL = (__ENV.SUPABASE_URL || '').replace(/\/$/, '');
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

// Usuário de teste que existe no projeto de staging (com dados semeados).
export const TEST_EMAIL = __ENV.TEST_EMAIL || '';
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || '';

// --- Perfil de carga --------------------------------------------------------

// PROFILE: smoke | load | stress | spike   (default: load)
const PROFILE = __ENV.PROFILE || 'load';

// Pico de VUs (usuários virtuais simultâneos). Sobrescreve o default do perfil.
const PEAK = parseInt(__ENV.PEAK_VUS || '0', 10);

const PROFILES = {
  // valida que o script funciona — pouquíssima carga
  smoke: { peak: 5, ramp: '30s', hold: '1m', down: '10s' },
  // carga realista
  load: { peak: PEAK || 50, ramp: '1m', hold: '5m', down: '30s' },
  // estresse — acha o ponto de quebra
  stress: { peak: PEAK || 300, ramp: '2m', hold: '5m', down: '1m' },
  // pico repentino de lançamento
  spike: { peak: PEAK || 400, ramp: '20s', hold: '2m', down: '20s' },
};

const p = PROFILES[PROFILE] || PROFILES.load;

export const stages = [
  { duration: p.ramp, target: p.peak },
  { duration: p.hold, target: p.peak },
  { duration: p.down, target: 0 },
];

export const thresholds = {
  http_req_failed: ['rate<0.01'], // < 1% de erro
  http_req_duration: ['p(95)<1500', 'p(99)<3000'],
};

export function summaryLine() {
  return `perfil=${PROFILE} pico=${p.peak}VUs (${p.ramp} sobe / ${p.hold} segura / ${p.down} desce)`;
}

// --- Helpers ----------------------------------------------------------------

export function requireEnv(names) {
  const missing = names.filter((n) => !__ENV[n]);
  if (missing.length) {
    throw new Error(
      `Faltam variáveis de ambiente: ${missing.join(', ')}\n` +
        `Copie tests/load/.env.example, preencha e rode:\n` +
        `  set -a; source tests/load/.env; set +a; k6 run <script>`
    );
  }
}

// Login por senha no GoTrue — chamado uma vez no setup() e o token é
// compartilhado com todos os VUs (dura ~1h, suficiente pra um teste).
export function login(http) {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY } }
  );
  if (res.status !== 200) {
    throw new Error(`Login de teste falhou (${res.status}): ${res.body}`);
  }
  const body = JSON.parse(res.body);
  return { accessToken: body.access_token, userId: body.user.id };
}
