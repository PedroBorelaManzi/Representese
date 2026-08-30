import { describe, it, expect, beforeEach, vi } from 'vitest';

// Ambiente node não tem localStorage — stub mínimo em memória, mesmo padrão
// usado em offlineCache.test.ts / syncQueue.test.ts.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  });
}

/* O módulo memoiza a leitura num cache de módulo, então cada teste importa fresco. */
async function carregar() {
  vi.resetModules();
  return import('./cookieConsent');
}

describe('cookieConsent', () => {
  beforeEach(() => {
    installLocalStorageStub();
  });

  it('sem registro salvo, precisa decidir e nada de análise', async () => {
    const m = await carregar();
    expect(m.precisaDecidir()).toBe(true);
    expect(m.hasAnalyticsConsent()).toBe(false);
    expect(m.getConsent()).toEqual({ preferencias: false, analiticos: false });
  });

  it('aceitarTudo libera análise e some com o banner', async () => {
    const m = await carregar();
    m.aceitarTudo();
    expect(m.precisaDecidir()).toBe(false);
    expect(m.hasAnalyticsConsent()).toBe(true);
  });

  it('recusarNaoEssenciais registra decisão mas mantém análise desligada', async () => {
    const m = await carregar();
    m.recusarNaoEssenciais();
    expect(m.precisaDecidir()).toBe(false);
    expect(m.hasAnalyticsConsent()).toBe(false);
  });

  it('registro de versão antiga é ignorado (pede nova decisão)', async () => {
    localStorage.setItem(
      'rm_cookie_consent',
      JSON.stringify({ v: 0, ts: '2020-01-01T00:00:00Z', categorias: { preferencias: true, analiticos: true } }),
    );
    const m = await carregar();
    expect(m.precisaDecidir()).toBe(true);
    expect(m.hasAnalyticsConsent()).toBe(false);
  });

  it('opt-out legado (rs_notrack=1) vence um aceite', async () => {
    localStorage.setItem('rs_notrack', '1');
    const m = await carregar();
    m.aceitarTudo();
    expect(m.hasAnalyticsConsent()).toBe(false);
  });

  it('subscribeConsent avisa na mudança e o unsubscribe para de avisar', async () => {
    const m = await carregar();
    const fn = vi.fn();
    const unsub = m.subscribeConsent(fn);
    m.aceitarTudo();
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    m.recusarNaoEssenciais();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('JSON corrompido não quebra — trata como sem decisão', async () => {
    localStorage.setItem('rm_cookie_consent', '{lixo');
    const m = await carregar();
    expect(m.precisaDecidir()).toBe(true);
    expect(m.hasAnalyticsConsent()).toBe(false);
  });
});
