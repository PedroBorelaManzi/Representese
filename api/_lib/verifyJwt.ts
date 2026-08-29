// api/_lib/verifyJwt.ts
//
// Verificação LOCAL do access token do Supabase (JWT), sem bater no
// /auth/v1/user a cada requisição.
//
// Por que local:
//  - o /auth/v1/user é um round-trip pro GoTrue (sa-east-1) em TODA chamada de
//    API — soma latência e joga carga no servidor de auth (que no plano Free é
//    compartilhado).
//  - o projeto já assina os JWT com chave ASSIMÉTRICA (ES256). A chave pública
//    fica em /auth/v1/.well-known/jwks.json. Dá pra validar a assinatura aqui,
//    offline, e a ROTAÇÃO DE CHAVE é transparente: o `jose` rebusca o JWKS
//    sozinho quando aparece um `kid` novo.
//
// Fallback: se a verificação local falhar por algo que NÃO seja "token
// inválido" (ex.: JWKS fora do ar), cai pro /auth/v1/user. Assim uma
// indisponibilidade momentânea do endpoint de JWKS não derruba a API.
//
// Ver também api/_lib/authUser.ts (formato da resposta do /auth/v1/user).

import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import { extrairUsuario, type UsuarioAutenticado } from './authUser.js';

function supabaseUrl(): string {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL / SUPABASE_URL ausente');
  return url.replace(/\/$/, '');
}

// JWKS remoto com cache. O jose:
//  - cacheia as chaves em memória (dura enquanto a função serverless estiver quente)
//  - rebusca automaticamente se chegar um token com `kid` desconhecido
//    (respeitando um cooldown, então não vira vetor de DoS)
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl()}/auth/v1/.well-known/jwks.json`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }
  return jwks;
}

/** Erros que significam "o token é ruim mesmo" — NÃO tentar fallback pra rede. */
function isDefinitiveAuthError(err: unknown): boolean {
  return (
    err instanceof joseErrors.JWTExpired ||
    err instanceof joseErrors.JWTClaimValidationFailed ||
    err instanceof joseErrors.JWSSignatureVerificationFailed ||
    err instanceof joseErrors.JWTInvalid ||
    err instanceof joseErrors.JWSInvalid
  );
}

async function verifyViaNetwork(token: string): Promise<UsuarioAutenticado | null> {
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!anonKey) return null;
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return extrairUsuario(await res.json().catch(() => null));
}

export interface VerifiedUser extends UsuarioAutenticado {
  /** claims cruas do JWT, caso algum endpoint precise (role, exp, etc.) */
  claims: Record<string, unknown>;
}

/**
 * Devolve o usuário se o Bearer for um access token válido do Supabase.
 * `null` em qualquer caso de token inválido/expirado.
 *
 * Passa o header inteiro ("Bearer x" ou só "x") — a função normaliza.
 */
export async function verifyBearer(
  authHeader: string | undefined | null,
): Promise<VerifiedUser | null> {
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `${supabaseUrl()}/auth/v1`,
      audience: 'authenticated',
    });
    const id = typeof payload.sub === 'string' ? payload.sub : '';
    if (!id) return null;
    return {
      id,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      claims: payload as Record<string, unknown>,
    };
  } catch (err) {
    if (isDefinitiveAuthError(err)) return null;

    // Erro não-definitivo (JWKS fora do ar, timeout, etc.) → tenta pela rede.
    console.error('[verifyJwt] verificação local falhou, tentando /auth/v1/user:', (err as Error)?.message);
    try {
      const u = await verifyViaNetwork(token);
      return u ? { ...u, claims: {} } : null;
    } catch (netErr) {
      console.error('[verifyJwt] fallback de rede também falhou:', (netErr as Error)?.message);
      return null;
    }
  }
}
