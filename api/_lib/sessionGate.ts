// api/_lib/sessionGate.ts
//
// Teto GLOBAL de sessões ativas simultâneas no sistema.
//
// Objetivo: proteger o backend (Supabase Free / Nano) de saturar. Enquanto
// houver `SESSION_LIMIT` (padrão 150) usuários ativos, um usuário NOVO que
// tente entrar recebe "sistema cheio, tente em instantes". Quem já está
// dentro nunca é barrado — só perde a vaga se ficar `SESSION_TTL_MS` sem dar
// sinal de vida (o app manda um heartbeat a cada ~45s).
//
// Estado fica no Upstash Redis (o mesmo já usado pelo rate limit da IA), num
// ZSET: membro = user_id, score = último "visto" em epoch-ms.
//
// Se o Upstash não estiver configurado (dev local), o portão FICA ABERTO
// (fail-open) — igual ao rate limit da IA.

import { getRedis } from './upstash.js';

const KEY = 'session_gate:active';

export const SESSION_LIMIT = Math.max(1, parseInt(process.env.SESSION_LIMIT || '150', 10));
export const SESSION_TTL_MS = Math.max(30_000, parseInt(process.env.SESSION_TTL_MS || '180000', 10));

const redis = getRedis();
if (!redis) {
  console.error(
    'ATENÇÃO: credenciais do Upstash não encontradas (UPSTASH_REDIS_REST_URL/TOKEN ' +
      'ou KV_REST_API_URL/TOKEN) — o teto de sessões simultâneas está DESLIGADO (fail-open).',
  );
}

// Acquire/heartbeat atômico: evita que dois usuários novos passem juntos pelo
// mesmo "count < limit". Retorna [ok(0|1), active].
const ACQUIRE_LUA = `
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local uid = ARGV[4]
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - ttl)
if redis.call('ZSCORE', KEYS[1], uid) then
  redis.call('ZADD', KEYS[1], now, uid)
  return {1, redis.call('ZCARD', KEYS[1])}
end
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  return {0, count}
end
redis.call('ZADD', KEYS[1], now, uid)
return {1, count + 1}
`;

export interface GateResult {
  ok: boolean;
  active: number;
  limit: number;
  /** true quando o portão está aberto só porque o Redis não está configurado */
  degraded?: boolean;
}

/** Tenta pegar/renovar uma vaga pro usuário. Use tanto no primeiro acesso
 *  quanto nos heartbeats — a semântica é a mesma. */
export async function acquireSlot(userId: string): Promise<GateResult> {
  if (!redis) return { ok: true, active: 0, limit: SESSION_LIMIT, degraded: true };
  try {
    const res = (await redis.eval(
      ACQUIRE_LUA,
      [KEY],
      [String(Date.now()), String(SESSION_TTL_MS), String(SESSION_LIMIT), userId],
    )) as [number, number];
    return { ok: res[0] === 1, active: Number(res[1]) || 0, limit: SESSION_LIMIT };
  } catch (err) {
    // Falha no Redis não pode trancar todo mundo pra fora.
    console.error('[sessionGate] acquire falhou, liberando (fail-open):', (err as Error)?.message);
    return { ok: true, active: 0, limit: SESSION_LIMIT, degraded: true };
  }
}

/** Libera a vaga (logout / aba fechada). Best-effort. */
export async function releaseSlot(userId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.zrem(KEY, userId);
  } catch (err) {
    console.error('[sessionGate] release falhou:', (err as Error)?.message);
  }
}

/** Só pra observabilidade (endpoint de status / admin). */
export async function countActive(): Promise<GateResult> {
  if (!redis) return { ok: true, active: 0, limit: SESSION_LIMIT, degraded: true };
  try {
    await redis.zremrangebyscore(KEY, '-inf', Date.now() - SESSION_TTL_MS);
    const active = await redis.zcard(KEY);
    return { ok: active < SESSION_LIMIT, active, limit: SESSION_LIMIT };
  } catch {
    return { ok: true, active: 0, limit: SESSION_LIMIT, degraded: true };
  }
}
