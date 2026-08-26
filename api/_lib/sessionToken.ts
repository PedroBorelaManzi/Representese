// api/_lib/sessionToken.ts
//
// Token de sessão do link de "enviar pedido" — depois do PIN certo, o
// colaborador fica "logado" só nessa telinha por tempo indeterminado (na
// prática, pra sempre), sem precisar redigitar o PIN de novo. Não é um JWT de
// verdade (não precisamos de biblioteca nova pra isso): payload em base64url
// + assinatura HMAC-SHA256 com um segredo que só o servidor conhece — se
// alguém alterar o payload, a assinatura não bate mais.
//
// "Pra sempre" aqui é um TTL bem longo (10 anos), não a ausência de
// expiração — mantém o campo `exp` simples de validar em vez de um caso
// especial "nunca expira". Quem realmente corta o acesso é a checagem de
// `active`/`session_epoch` no banco (ver requireIntakeSession em
// api/order-intake.ts): desativar o link ou trocar o PIN invalida a sessão
// na hora, mesmo com um token "eterno" desses em mãos.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface OrderIntakeSessionPayload {
  linkId: string;
  ownerId: string;
  sessionEpoch: number;
  iat: number;
  exp: number;
}

/** 10 anos em segundos — na prática nunca expira sozinho; ver nota acima. */
export const ETERNAL_SESSION_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('hex');
}

export function signSession(payload: Omit<OrderIntakeSessionPayload, 'iat' | 'exp'>, secret: string, ttlSeconds = ETERNAL_SESSION_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const full: OrderIntakeSessionPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(full)));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/** Devolve o payload se a assinatura bate e o token não expirou — null em
 *  qualquer outro caso (formato errado, assinatura inválida, expirado). Quem
 *  chama ainda precisa checar `active`/`session_epoch` no banco — este token
 *  por si só não sabe se o link foi revogado ou o PIN trocado depois dele
 *  ter sido emitido. */
export function verifySession(token: string | undefined | null, secret: string): OrderIntakeSessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  // Buffer.from(x, 'hex') não lança pra string inválida, só para de ler no
  // primeiro caractere não-hex — validar o formato antes evita comparar
  // buffers truncados/vazios que poderiam "bater" por acidente.
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return null;

  const expectedSignature = sign(payloadB64, secret);
  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload: OrderIntakeSessionPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.linkId || !payload.ownerId || typeof payload.sessionEpoch !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}
