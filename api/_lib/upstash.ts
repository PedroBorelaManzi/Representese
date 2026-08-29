// api/_lib/upstash.ts
//
// Cliente Redis (Upstash) compartilhado por api/ai.ts, api/order-intake.ts e
// api/_lib/sessionGate.ts.
//
// Existe porque `Redis.fromEnv()` só reconhece UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN. Quando o banco é adicionado pela integração
// Upstash <-> Vercel (Marketplace), as variáveis costumam vir com OUTRO nome
// (KV_REST_API_URL / KV_REST_API_TOKEN, herança do antigo "Vercel KV"). Sem
// cobrir esses nomes, o rate limit e o teto de sessões ficavam DESLIGADOS
// mesmo com o banco criado e conectado.

import { Redis } from '@upstash/redis';

function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/** URL/token REST do Upstash, tentando todas as convenções de nome conhecidas. */
export function upstashCreds(): { url: string; token: string } | null {
  const url = pick('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL', 'REDIS_REST_URL');
  const token = pick('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return { url, token };
}

let cached: Redis | null | undefined;

/** Devolve um cliente Redis pronto, ou null se nenhuma credencial foi achada.
 *  Quem chama deve tratar null como "recurso desligado" (fail-open). */
export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const creds = upstashCreds();
  cached = creds ? new Redis({ url: creds.url, token: creds.token }) : null;
  return cached;
}
