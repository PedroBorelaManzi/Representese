import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ambiente node não tem localStorage/navigator — stubs mínimos, mesmo padrão
// usado em offlineCache.test.ts e syncQueue.test.ts.
function installBrowserStubs(online: boolean) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('navigator', { onLine: online });
}

const listMock = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ list: (...args: any[]) => listMock(...args) }) } },
}));

import { listFolder, listFolderCached, storageListCacheKey } from './storageList';

const item = (name: string, isFolder: boolean, size = 100) => ({
  name,
  id: isFolder ? null : 'x',
  metadata: { size },
  updated_at: '2026-01-01T00:00:00Z',
});

describe('listFolder', () => {
  beforeEach(() => {
    installBrowserStubs(true);
    listMock.mockReset();
  });

  it('mapeia itens do Supabase Storage e ordena pastas antes de arquivos', async () => {
    listMock.mockResolvedValue({
      data: [item('zzz-arquivo.pdf', false), item('aaa-pasta', true)],
      error: null,
    });

    const result = await listFolder('user/pasta');

    expect(result.map((r) => r.name)).toEqual(['aaa-pasta', 'zzz-arquivo.pdf']);
    expect(result[0].isFolder).toBe(true);
    expect(result[1].isFolder).toBe(false);
  });

  it('filtra os placeholders de pasta vazia', async () => {
    listMock.mockResolvedValue({
      data: [item('.keep', false), item('.emptyFolderPlaceholder', false), item('real.pdf', false)],
      error: null,
    });

    const result = await listFolder('user/pasta');

    expect(result.map((r) => r.name)).toEqual(['real.pdf']);
  });

  it('propaga erro do Supabase', async () => {
    listMock.mockResolvedValue({ data: null, error: new Error('falhou') });
    await expect(listFolder('user/pasta')).rejects.toThrow('falhou');
  });
});

describe('listFolderCached', () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it('online: busca da rede e salva no cache pra uso offline depois', async () => {
    installBrowserStubs(true);
    listMock.mockResolvedValue({ data: [item('a.pdf', false)], error: null });

    const result = await listFolderCached('user/pasta');

    expect(result.map((r) => r.name)).toEqual(['a.pdf']);
    expect(localStorage.getItem(storageListCacheKey('user/pasta'))).not.toBeNull();
  });

  it('offline: devolve o retrato salvo da última vez online, sem tentar rede', async () => {
    installBrowserStubs(true);
    listMock.mockResolvedValue({ data: [item('a.pdf', false)], error: null });
    await listFolderCached('user/pasta');

    // Só troca o status de conexão — mantém o MESMO localStorage do "online"
    // acima, senão o teste perde o próprio cache que acabou de gravar.
    vi.stubGlobal('navigator', { onLine: false });
    listMock.mockReset();

    const result = await listFolderCached('user/pasta');

    expect(result.map((r) => r.name)).toEqual(['a.pdf']);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('offline numa pasta nunca vista antes, devolve lista vazia sem lançar erro', async () => {
    installBrowserStubs(false);
    const result = await listFolderCached('user/nunca-vista');
    expect(result).toEqual([]);
  });
});
