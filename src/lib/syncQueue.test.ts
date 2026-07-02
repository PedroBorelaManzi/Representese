import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks das dependências antes do import da fila
vi.mock('./offlineCache', () => ({ offlineCache: {}, CacheKeys: {} }));

const fromMock = vi.fn();
vi.mock('./supabase', () => ({ supabase: { from: (...args: any[]) => fromMock(...args) } }));

import { syncQueue, MAX_SYNC_ATTEMPTS } from './syncQueue';

// Ambiente node não tem localStorage/window — stubs mínimos
function installBrowserStubs() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
}

// Builder de resposta do supabase para cada ação
function supabaseTableOk() {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
}

beforeEach(() => {
  installBrowserStubs();
  fromMock.mockReset();
});

describe('syncQueue', () => {
  it('começa vazia e conta pendências', () => {
    expect(syncQueue.getQueue()).toEqual([]);
    expect(syncQueue.getPendingCount()).toBe(0);
  });

  it('enfileira operações com id e timestamp', () => {
    syncQueue.enqueue('clients', 'INSERT', { name: 'ACME' });
    syncQueue.enqueue('clients', 'UPDATE', { name: 'ACME 2' }, 'abc-123');

    const queue = syncQueue.getQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].table).toBe('clients');
    expect(queue[0].action).toBe('INSERT');
    expect(queue[0].id).toBeTruthy();
    expect(queue[1].recordId).toBe('abc-123');
    expect(syncQueue.getPendingCount()).toBe(2);
  });

  it('sobrevive a JSON corrompido no storage', () => {
    localStorage.setItem('rm_sync_queue', '{corrompido');
    expect(syncQueue.getQueue()).toEqual([]);
  });

  it('clearQueue esvazia a fila', () => {
    syncQueue.enqueue('clients', 'INSERT', {});
    syncQueue.clearQueue();
    expect(syncQueue.getPendingCount()).toBe(0);
  });

  it('processQueue envia cada ação ao Supabase e limpa a fila', async () => {
    const table = supabaseTableOk();
    fromMock.mockReturnValue(table);

    syncQueue.enqueue('clients', 'INSERT', { name: 'A' });
    syncQueue.enqueue('clients', 'UPDATE', { name: 'B' }, 'id-1');
    syncQueue.enqueue('clients', 'DELETE', {}, 'id-2');
    syncQueue.enqueue('clients', 'UPSERT', { id: 'id-3' });

    const result = await syncQueue.processQueue();

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(table.insert).toHaveBeenCalledWith([{ name: 'A' }]);
    expect(table.update).toHaveBeenCalledWith({ name: 'B' });
    expect(table.upsert).toHaveBeenCalledWith({ id: 'id-3' }, { onConflict: 'id' });
    expect(syncQueue.getPendingCount()).toBe(0);
  });

  it('mantém na fila apenas as operações que falharam', async () => {
    const table = supabaseTableOk();
    table.insert = vi.fn().mockResolvedValue({ error: new Error('rede caiu') });
    fromMock.mockReturnValue(table);

    syncQueue.enqueue('clients', 'INSERT', { name: 'falha' });
    syncQueue.enqueue('clients', 'DELETE', {}, 'id-ok');

    const result = await syncQueue.processQueue();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    const remaining = syncQueue.getQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].action).toBe('INSERT');
  });

  it('processQueue com fila vazia é no-op de sucesso', async () => {
    const result = await syncQueue.processQueue();
    expect(result).toEqual({ success: true, errors: [] });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('incrementa attempts a cada falha e mantém a operação na fila', async () => {
    const table = supabaseTableOk();
    table.insert = vi.fn().mockResolvedValue({ error: new Error('offline') });
    fromMock.mockReturnValue(table);

    syncQueue.enqueue('clients', 'INSERT', { name: 'X' });
    await syncQueue.processQueue();
    await syncQueue.processQueue();

    const [op] = syncQueue.getQueue();
    expect(op.attempts).toBe(2);
  });

  it('move para dead-letter após MAX_SYNC_ATTEMPTS falhas', async () => {
    const table = supabaseTableOk();
    table.insert = vi.fn().mockResolvedValue({ error: new Error('constraint violada') });
    fromMock.mockReturnValue(table);

    syncQueue.enqueue('clients', 'INSERT', { name: 'ruim' });
    for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
      await syncQueue.processQueue();
    }

    expect(syncQueue.getPendingCount()).toBe(0);
    const dead = syncQueue.getDeadLetter();
    expect(dead).toHaveLength(1);
    expect(dead[0].attempts).toBe(MAX_SYNC_ATTEMPTS);

    syncQueue.clearDeadLetter();
    expect(syncQueue.getDeadLetter()).toEqual([]);
  });

  it('dead-letter não afeta operações saudáveis na mesma rodada', async () => {
    const table = supabaseTableOk();
    table.insert = vi.fn().mockResolvedValue({ error: new Error('sempre falha') });
    fromMock.mockReturnValue(table);

    // Uma op já à beira da dead-letter + uma op saudável
    syncQueue.enqueue('clients', 'INSERT', { name: 'ruim' });
    const [almostDead] = syncQueue.getQueue();
    syncQueue.setQueue([{ ...almostDead, attempts: MAX_SYNC_ATTEMPTS - 1 }]);
    syncQueue.enqueue('clients', 'DELETE', {}, 'id-ok');

    const result = await syncQueue.processQueue();

    expect(result.errors).toHaveLength(1);
    expect(syncQueue.getPendingCount()).toBe(0); // DELETE ok, INSERT dead-letter
    expect(syncQueue.getDeadLetter()).toHaveLength(1);
  });
});
