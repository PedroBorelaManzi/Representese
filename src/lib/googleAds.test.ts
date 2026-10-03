import { describe, it, expect, beforeEach, vi } from 'vitest';

function installLocalStorageStub(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  });
}

async function carregar() {
  vi.resetModules();
  return import('./googleAds');
}

describe('googleAds', () => {
  beforeEach(() => {
    installLocalStorageStub();
    vi.unstubAllGlobals();
    installLocalStorageStub();
  });

  it('valorPrimeiraCobranca: mensal usa o preço cheio, anual multiplica por 12', async () => {
    const m = await carregar();
    expect(m.valorPrimeiraCobranca('97', '87', 'MONTHLY')).toBe(97);
    expect(m.valorPrimeiraCobranca('97', '87', undefined)).toBe(97);
    expect(m.valorPrimeiraCobranca('97', '87', 'ANNUAL')).toBe(87 * 12);
    expect(m.valorPrimeiraCobranca('97', '87', 'annual')).toBe(87 * 12);
    expect(m.valorPrimeiraCobranca('x', 'y', 'ANNUAL')).toBe(0);
  });

  it('sem consentimento analítico não envia conversão nem baixa o script', async () => {
    const m = await carregar();
    expect(m.trackPaidSubscription('user-1', 97)).toBe(false);
  });
});
