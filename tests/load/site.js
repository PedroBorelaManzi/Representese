// Teste de carga do SITE / SPA (páginas públicas + assets).
//
// Servido pela Vercel/CDN — é o teste de menor risco.
// Simula visitantes anônimos abrindo a landing, /planos e /login.
//
//   PROFILE=stress k6 run tests/load/site.js
//
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SITE_URL, stages, thresholds, summaryLine, requireEnv } from './config.js';

export const options = { stages, thresholds };

const PAGES = ['/', '/planos', '/login', '/register'];

export function setup() {
  requireEnv(['SITE_URL']);
  console.log(`SITE ${SITE_URL} — ${summaryLine()}`);
}

export default function () {
  group('carrega uma página + assets', () => {
    const path = PAGES[Math.floor(Math.random() * PAGES.length)];
    const res = http.get(`${SITE_URL}${path}`, {
      headers: { 'Accept': 'text/html' },
      tags: { page: path },
    });
    check(res, {
      'html 200': (r) => r.status === 200,
      'veio HTML': (r) => (r.headers['Content-Type'] || '').includes('text/html'),
    });

    // Puxa os assets referenciados (aproxima o comportamento do browser).
    const assets = [...res.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
      .map((m) => m[1])
      .slice(0, 8);
    if (assets.length) {
      const responses = http.batch(
        assets.map((a) => ['GET', `${SITE_URL}${a}`, null, { tags: { kind: 'asset' } }])
      );
      responses.forEach((r) => check(r, { 'asset 200/304': (x) => x.status === 200 || x.status === 304 }));
    }
  });

  sleep(Math.random() * 3 + 1); // "think time" 1-4s
}
