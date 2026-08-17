import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ambiente node não tem localStorage — stub mínimo em memória, mesmo padrão
// usado em syncQueue.test.ts.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

beforeEach(() => {
  installLocalStorageStub();
  vi.useRealTimers();
});

describe('offlineCache', () => {
  it('grava e lê o mesmo valor', async () => {
    const { offlineCache } = await import('./offlineCache');
    offlineCache.set('k', { a: 1 });
    expect(offlineCache.get('k')).toEqual({ a: 1 });
  });

  it('usa localStorage, não sessionStorage — sobrevive a um "reload" do módulo', async () => {
    const { offlineCache: cacheA } = await import('./offlineCache');
    cacheA.set('k', 'valor');

    vi.resetModules();
    const { offlineCache: cacheB } = await import('./offlineCache');
    expect(cacheB.get('k')).toBe('valor');
  });

  it('expira depois do TTL', async () => {
    vi.useFakeTimers();
    const { offlineCache } = await import('./offlineCache');
    offlineCache.set('k', 'valor', 1000);
    expect(offlineCache.get('k')).toBe('valor');

    vi.advanceTimersByTime(1001);
    expect(offlineCache.get('k')).toBeNull();
  });

  it('clear() remove todas as chaves conhecidas', async () => {
    const { offlineCache, CacheKeys } = await import('./offlineCache');
    offlineCache.set(CacheKeys.CLIENTS, [1, 2, 3]);
    offlineCache.set(CacheKeys.ORDERS, [4, 5]);

    offlineCache.clear();

    expect(offlineCache.get(CacheKeys.CLIENTS)).toBeNull();
    expect(offlineCache.get(CacheKeys.ORDERS)).toBeNull();
  });

  it('get() de chave inexistente devolve null sem lançar', async () => {
    const { offlineCache } = await import('./offlineCache');
    expect(offlineCache.get('nunca-existiu')).toBeNull();
  });
});
