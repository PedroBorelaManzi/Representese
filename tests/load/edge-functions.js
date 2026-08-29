// Teste de carga das EDGE FUNCTIONS do Supabase.
//
// Só funções seguras de martelar (sem custo externo, sem efeito colateral):
//   - validate-coupon : 1 query na tabela coupons. Com código inválido não
//                        redime nada — resposta { valid: false }.
//   - get-holidays     : consulta feriados. ATENÇÃO: busca de uma CDN externa
//                        (jsdelivr) + BrasilAPI. Rode em volume menor pra não
//                        martelar terceiros — controlado por HOLIDAYS_RATIO.
//
// NÃO inclui: geocode/fetch-cnpj (APIs externas pagas/limitadas),
// process-checkout, cancel-subscription, delete-account, webhooks (efeito real).
//
//   PROFILE=stress k6 run tests/load/edge-functions.js
//
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  stages, thresholds, summaryLine, requireEnv,
} from './config.js';

export const options = { stages, thresholds };

// Fração das iterações que também chamam get-holidays (0 a 1). Default 10%.
const HOLIDAYS_RATIO = parseFloat(__ENV.HOLIDAYS_RATIO || '0.1');

const FN_HEADERS = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export function setup() {
  requireEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  console.log(
    `EDGE ${SUPABASE_URL}/functions/v1 — holidays_ratio=${HOLIDAYS_RATIO} — ${summaryLine()}`
  );
}

export default function () {
  // validate-coupon com um código que não existe — caminho de leitura pura.
  const vc = http.post(
    `${SUPABASE_URL}/functions/v1/validate-coupon`,
    JSON.stringify({ code: `LOADTEST-${Math.random().toString(36).slice(2, 8)}`, planId: 'profissional' }),
    { headers: FN_HEADERS, tags: { fn: 'validate-coupon' } }
  );
  check(vc, {
    'validate-coupon 200': (r) => r.status === 200,
    'respondeu valid=false': (r) => {
      try { return JSON.parse(r.body).valid === false; } catch { return false; }
    },
  });

  if (Math.random() < HOLIDAYS_RATIO) {
    const gh = http.post(
      `${SUPABASE_URL}/functions/v1/get-holidays`,
      JSON.stringify({ year: new Date().getFullYear(), locations: [{ city: 'São Paulo', state: 'SP' }] }),
      { headers: FN_HEADERS, tags: { fn: 'get-holidays' } }
    );
    check(gh, { 'get-holidays 2xx': (r) => r.status >= 200 && r.status < 300 });
  }

  sleep(Math.random() * 2 + 1);
}
