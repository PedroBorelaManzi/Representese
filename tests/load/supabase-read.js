// Teste de carga das LEITURAS via API REST do Supabase (PostgREST).
//
// Simula um representante logado abrindo o dashboard: carrega settings,
// lista de clientes, pedidos, agenda e entitlements — as queries que mais
// aparecem no front (ver contagem em CLAUDE.md / grep de supabase.from).
//
// APENAS LEITURA (GET). Não cria, não altera, não apaga nada.
//
//   PROFILE=stress k6 run tests/load/supabase-read.js
//
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  stages, thresholds, summaryLine, requireEnv, login,
} from './config.js';

export const options = { stages, thresholds };

export function setup() {
  requireEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TEST_EMAIL', 'TEST_PASSWORD']);
  const { accessToken, userId } = login(http);
  console.log(`SUPABASE ${SUPABASE_URL} — user ${userId} — ${summaryLine()}`);
  return { accessToken, userId };
}

function rest(path, token, extraTags) {
  return http.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
    },
    tags: Object.assign({ layer: 'postgrest' }, extraTags),
  });
}

export default function (data) {
  const t = data.accessToken;
  const uid = data.userId;

  group('abrir dashboard', () => {
    const responses = http.batch([
      ['GET', `${SUPABASE_URL}/rest/v1/user_settings?select=*&user_id=eq.${uid}`, null, hdr(t, 'user_settings')],
      ['GET', `${SUPABASE_URL}/rest/v1/user_entitlements?select=*&user_id=eq.${uid}`, null, hdr(t, 'user_entitlements')],
      ['GET', `${SUPABASE_URL}/rest/v1/clients?select=id,name,cnpj,status,lat,lng&user_id=eq.${uid}&order=name.asc&limit=200`, null, hdr(t, 'clients')],
      ['GET', `${SUPABASE_URL}/rest/v1/orders?select=id,client_id,category,value,created_at&user_id=eq.${uid}&order=created_at.desc&limit=100`, null, hdr(t, 'orders')],
    ]);
    responses.forEach((r) =>
      check(r, { '2xx': (x) => x.status >= 200 && x.status < 300 })
    );
  });

  sleep(Math.random() * 2 + 1);

  group('navegar agenda', () => {
    const r = rest(
      `appointments?select=*&user_id=eq.${uid}&order=start_time.asc&limit=100`,
      t,
      { q: 'appointments' }
    );
    check(r, { 'agenda 2xx': (x) => x.status >= 200 && x.status < 300 });
  });

  sleep(Math.random() * 3 + 2);
}

function hdr(token, q) {
  return {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    tags: { layer: 'postgrest', q },
  };
}
