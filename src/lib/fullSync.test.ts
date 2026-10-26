import { describe, it, expect, vi, beforeEach } from 'vitest';

function installBrowserStubs(online = true) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('navigator', { onLine: online });
}

const isNativePlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const fromMock = vi.fn();
const createSignedUrlMock = vi.fn();
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    storage: { from: () => ({ createSignedUrl: (...args: any[]) => createSignedUrlMock(...args) }) },
  },
}));

const fetchHolidaysMock = vi.fn();
vi.mock('./holidayService', () => ({
  fetchHolidays: (...args: any[]) => fetchHolidaysMock(...args),
}));

const getCachedUriSePresenteMock = vi.fn();
const getCachedFileUriMock = vi.fn();
vi.mock('./fileCache', () => ({
  getCachedUriSePresente: (...args: any[]) => getCachedUriSePresenteMock(...args),
  getCachedFileUri: (...args: any[]) => getCachedFileUriMock(...args),
}));

const listAllPathsMock = vi.fn();
vi.mock('./storageList', () => ({
  listAllPaths: (...args: any[]) => listAllPathsMock(...args),
  BUCKET: 'user_files',
}));

import { runFullSync } from './fullSync';
import { offlineCache, CacheKeys } from './offlineCache';

// Builders pro chain do supabase-js usado em cada etapa.
const chainSelectEq = (result: { data: any; error: any }) => ({
  select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ range: vi.fn(() => Promise.resolve(result)) })) })) })),
});
const chainSelectEqMaybeSingle = (result: { data: any; error: any }) => ({
  select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve(result)) })) })),
});

function setupHappyPath() {
  fromMock.mockImplementation((table: string) => {
    if (table === 'user_settings') return chainSelectEqMaybeSingle({ data: { theme: 'dark' }, error: null });
    if (table === 'clients') return chainSelectEq({ data: [{ id: 'c1', name: 'ACME', city: 'São Paulo', state: 'SP' }], error: null });
    if (table === 'appointments') return chainSelectEq({ data: [{ id: 'a1', title: 'Visita' }], error: null });
    if (table === 'orders') return chainSelectEq({ data: [{ id: 'o1', client_id: 'c1', file_path: 'u1/c1/nota.pdf' }], error: null });
    if (table === 'order_items') return chainSelectEq({ data: [{ id: 'i1', order_id: 'o1' }], error: null });
    if (table === 'order_installments') return chainSelectEq({ data: [{ id: 'p1', order_id: 'o1' }], error: null });
    throw new Error(`tabela inesperada: ${table}`);
  });
  fetchHolidaysMock.mockResolvedValue([{ name: 'Natal', date: '2026-12-25', type: 'nacional' }]);
  listAllPathsMock.mockResolvedValue(['u1/relatorio.xlsx']);
  getCachedUriSePresenteMock.mockResolvedValue(null);
  getCachedFileUriMock.mockResolvedValue('file:///cache/x');
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null });
}

beforeEach(() => {
  installBrowserStubs(true);
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(false);
});

describe('runFullSync', () => {
  it('offline: não faz nada', async () => {
    installBrowserStubs(false);
    setupHappyPath();
    const onProgress = vi.fn();

    await runFullSync('u1', onProgress);

    expect(fromMock).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('sincroniza configurações, clientes, agenda, pedidos e feriados (sem arquivos na web)', async () => {
    setupHappyPath();
    isNativePlatform.mockReturnValue(false);

    await runFullSync('u1');

    expect(offlineCache.get(CacheKeys.USER_SETTINGS)).toEqual({ theme: 'dark' });
    expect(offlineCache.get(CacheKeys.CLIENTS)).toEqual([{ id: 'c1', name: 'ACME', city: 'São Paulo', state: 'SP' }]);
    expect(offlineCache.get(CacheKeys.APPOINTMENTS)).toEqual([{ id: 'a1', title: 'Visita' }]);
    expect(offlineCache.get(CacheKeys.ORDERS)).toEqual([{ id: 'o1', client_id: 'c1', file_path: 'u1/c1/nota.pdf' }]);
    expect(fetchHolidaysMock).toHaveBeenCalledWith(expect.any(Number), [{ city: 'São Paulo', state: 'SP' }]);
    // Web: não baixa conteúdo de arquivo nenhum.
    expect(getCachedFileUriMock).not.toHaveBeenCalled();
  });

  it('reporta progresso crescente, com etapaTotal 5 na web', async () => {
    setupHappyPath();
    isNativePlatform.mockReturnValue(false);
    const onProgress = vi.fn();

    await runFullSync('u1', onProgress);

    const etapas = onProgress.mock.calls.map(([p]) => p.etapaIndex);
    // As etapas de dados rodam em paralelo: o índice só cresce e termina na última etapa.
    expect(etapas[0]).toBe(1);
    expect(etapas).toEqual([...etapas].sort((a, b) => a - b));
    expect(Math.max(...etapas)).toBe(5);
    expect(onProgress.mock.calls[0][0].etapaTotal).toBe(5);
  });

  it('no app nativo, baixa o conteúdo dos arquivos e reporta etapaTotal 6', async () => {
    setupHappyPath();
    isNativePlatform.mockReturnValue(true);
    const onProgress = vi.fn();

    await runFullSync('u1', onProgress);

    // 1 anexo de pedido (client_vault) + 1 arquivo geral (user_files)
    expect(getCachedFileUriMock).toHaveBeenCalledTimes(2);
    const ultimaEtapa = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(ultimaEtapa.etapaIndex).toBe(6);
    expect(ultimaEtapa.etapaTotal).toBe(6);
    expect(ultimaEtapa.subAtual).toBe(2);
    expect(ultimaEtapa.subTotal).toBe(2);
  });

  it('pula arquivo que já está em cache local', async () => {
    setupHappyPath();
    isNativePlatform.mockReturnValue(true);
    getCachedUriSePresenteMock.mockResolvedValue('file:///ja-em-cache');

    await runFullSync('u1');

    expect(getCachedFileUriMock).not.toHaveBeenCalled();
  });

  it('uma etapa falhando não impede as outras de rodar', async () => {
    setupHappyPath();
    fromMock.mockImplementation((table: string) => {
      if (table === 'clients') return chainSelectEq({ data: null, error: new Error('falhou') });
      if (table === 'user_settings') return chainSelectEqMaybeSingle({ data: { theme: 'dark' }, error: null });
      if (table === 'appointments') return chainSelectEq({ data: [{ id: 'a1' }], error: null });
      if (table === 'orders') return chainSelectEq({ data: [{ id: 'o1', client_id: 'c1' }], error: null });
      if (table === 'order_items' || table === 'order_installments') return chainSelectEq({ data: [], error: null });
      throw new Error(`tabela inesperada: ${table}`);
    });

    await runFullSync('u1');

    // clientes falhou (fica vazio), mas agenda e pedidos seguiram normalmente.
    expect(offlineCache.get(CacheKeys.CLIENTS)).toBeNull();
    expect(offlineCache.get(CacheKeys.APPOINTMENTS)).toEqual([{ id: 'a1' }]);
    expect(offlineCache.get(CacheKeys.ORDERS)).toEqual([{ id: 'o1', client_id: 'c1' }]);
  });

  it('duas chamadas simultâneas não rodam a sincronização em paralelo', async () => {
    setupHappyPath();
    const onProgress = vi.fn();

    const p1 = runFullSync('u1', onProgress);
    const p2 = runFullSync('u1', onProgress);
    await Promise.all([p1, p2]);

    // Se tivesse rodado duas vezes, 'clients' apareceria 2x nas chamadas ao from().
    const clientCalls = fromMock.mock.calls.filter(([t]) => t === 'clients').length;
    expect(clientCalls).toBe(1);
  });

  it('devolve "complete" quando tudo chegou e baixa itens e parcelas dos pedidos', async () => {
    setupHappyPath();
    isNativePlatform.mockReturnValue(true);

    const r = await runFullSync('u1');

    expect(r).toBe('complete');
    expect(offlineCache.get(CacheKeys.ALL_ORDER_ITEMS)).toEqual([{ id: 'i1', order_id: 'o1' }]);
    expect(offlineCache.get(CacheKeys.ALL_ORDER_INSTALLMENTS)).toEqual([{ id: 'p1', order_id: 'o1' }]);
  });

  it('devolve "incomplete" se um arquivo falhar no download (retoma depois)', async () => {
    setupHappyPath();
    isNativePlatform.mockReturnValue(true);
    getCachedFileUriMock.mockRejectedValueOnce(new Error('rede caiu'));

    expect(await runFullSync('u1')).toBe('incomplete');
  });

  it('arquivo que não existe mais no Storage não deixa a sincronização incompleta', async () => {
    setupHappyPath();
    isNativePlatform.mockReturnValue(true);
    createSignedUrlMock.mockResolvedValue({ data: null, error: { message: 'Object not found' } });

    expect(await runFullSync('u1')).toBe('complete');
  });

  it('devolve "incomplete" se uma tabela falhar', async () => {
    setupHappyPath();
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_settings') return chainSelectEqMaybeSingle({ data: { theme: 'dark' }, error: null });
      if (table === 'clients') return chainSelectEq({ data: null, error: new Error('falhou') });
      return chainSelectEq({ data: [], error: null });
    });

    expect(await runFullSync('u1')).toBe('incomplete');
  });

  it('pagina tabelas com mais de 1000 linhas', async () => {
    setupHappyPath();
    const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, name: 'x' }));
    const pagina2 = [{ id: 'c1000', name: 'y' }];
    const range = vi.fn().mockResolvedValueOnce({ data: pagina1, error: null }).mockResolvedValueOnce({ data: pagina2, error: null });
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) =>
      table === 'clients' ? { select: () => ({ eq: () => ({ order: () => ({ range }) }) }) } : base(table)
    );

    await runFullSync('u1');

    expect((offlineCache.get(CacheKeys.CLIENTS) as any[]).length).toBe(1001);
  });

  it('chamadas simultâneas: a segunda devolve "busy"', async () => {
    setupHappyPath();
    const p1 = runFullSync('u1');
    const r2 = await runFullSync('u1');
    expect(r2).toBe('busy');
    await p1;
  });
});
