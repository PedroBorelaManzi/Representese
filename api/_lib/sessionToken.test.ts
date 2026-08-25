import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signSession, verifySession, ETERNAL_SESSION_TTL_SECONDS } from './sessionToken';

const SECRET = 'segredo-de-teste-bem-longo-123456';

describe('sessionToken', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gera um token que verifica de volta com o mesmo payload', () => {
    const token = signSession({ linkId: 'link-1', ownerId: 'owner-1', sessionEpoch: 1 }, SECRET);
    const payload = verifySession(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.linkId).toBe('link-1');
    expect(payload?.ownerId).toBe('owner-1');
    expect(payload?.sessionEpoch).toBe(1);
  });

  it('rejeita token assinado com outro segredo', () => {
    const token = signSession({ linkId: 'link-1', ownerId: 'owner-1', sessionEpoch: 1 }, SECRET);
    expect(verifySession(token, 'outro-segredo-diferente')).toBeNull();
  });

  it('rejeita payload alterado (assinatura não bate mais)', () => {
    const token = signSession({ linkId: 'link-1', ownerId: 'owner-1', sessionEpoch: 1 }, SECRET);
    const [payloadB64, signature] = token.split('.');
    const tampered = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    tampered.ownerId = 'owner-invasor';
    const tamperedB64 = Buffer.from(JSON.stringify(tampered)).toString('base64url');
    expect(verifySession(`${tamperedB64}.${signature}`, SECRET)).toBeNull();
  });

  it('sem TTL explícito, a sessão continua válida daqui a 5 anos (o PIN não precisa ser redigitado)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = signSession({ linkId: 'link-1', ownerId: 'owner-1', sessionEpoch: 1 }, SECRET); // sem ttlSeconds — usa o padrão
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z')); // 5 anos depois
    expect(verifySession(token, SECRET)).not.toBeNull();
    expect(ETERNAL_SESSION_TTL_SECONDS).toBeGreaterThan(5 * 365 * 24 * 60 * 60);
  });

  it('rejeita token expirado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = signSession({ linkId: 'link-1', ownerId: 'owner-1', sessionEpoch: 1 }, SECRET, 60);
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z')); // 2 min depois, TTL era 60s
    expect(verifySession(token, SECRET)).toBeNull();
  });

  it('rejeita formatos malformados sem lançar', () => {
    expect(verifySession(null, SECRET)).toBeNull();
    expect(verifySession(undefined, SECRET)).toBeNull();
    expect(verifySession('', SECRET)).toBeNull();
    expect(verifySession('sem-ponto', SECRET)).toBeNull();
    expect(verifySession('a.b.c', SECRET)).toBeNull();
    expect(verifySession('cGF5bG9hZA.assinatura-nao-hex', SECRET)).toBeNull();
  });
});
