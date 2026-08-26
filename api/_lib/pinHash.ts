// api/_lib/pinHash.ts
//
// Hash do PIN do link de "enviar pedido" (api/order-intake.ts) — nunca fica
// em texto puro no banco. Usa scrypt do próprio Node (nenhuma dependência
// nova), que é resistente a força bruta em paralelo (GPU) melhor que um hash
// simples. Formato auto-descritivo (scrypt$N$r$p$salt$hash) pra dar pra
// aumentar o custo no futuro sem invalidar hashes antigos.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { isValidPinFormat } from '../../src/lib/pinFormat.js';

export { isValidPinFormat };

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  // Buffer.from(x, 'hex') não lança pra string inválida — só para de ler no
  // primeiro caractere que não é hex, podendo devolver um buffer vazio (e daí
  // uma comparação de dois vazios "bateria" mesmo com hash corrompido).
  const HEX_RE = /^[0-9a-fA-F]+$/;
  if (!HEX_RE.test(saltHex) || !HEX_RE.test(hashHex) || hashHex.length === 0) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(pin, salt, expected.length, {
      N: parseInt(nStr, 10),
      r: parseInt(rStr, 10),
      p: parseInt(pStr, 10),
    });
    // Tamanhos diferentes: timingSafeEqual lançaria — trata como PIN errado
    // em vez de deixar o erro subir.
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
