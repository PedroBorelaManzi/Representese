import { describe, it, expect, vi, beforeEach } from 'vitest';

function installBrowserStubs() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

const uploadMock = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ upload: (...args: any[]) => uploadMock(...args) }) } },
}));

const getFileFromIndexedDBMock = vi.fn();
const deleteFileFromIndexedDBMock = vi.fn();
vi.mock('./storage', () => ({
  getFileFromIndexedDB: (...args: any[]) => getFileFromIndexedDBMock(...args),
  deleteFileFromIndexedDB: (...args: any[]) => deleteFileFromIndexedDBMock(...args),
}));

import {
  queuePendingFileUpload,
  getPendingFileUploadCount,
  processPendingFileUploads,
} from './pendingFileUploads';

const fakeFile = () => new File(['conteudo'], 'nota.pdf', { type: 'application/pdf' });

beforeEach(() => {
  installBrowserStubs();
  vi.clearAllMocks();
});

describe('pendingFileUploads', () => {
  it('começa vazia', () => {
    expect(getPendingFileUploadCount()).toBe(0);
  });

  it('enfileira sem duplicar o mesmo caminho', () => {
    queuePendingFileUpload('u1/c1/nota.pdf');
    queuePendingFileUpload('u1/c1/nota.pdf');
    expect(getPendingFileUploadCount()).toBe(1);
  });

  it('sobe o arquivo do IndexedDB pro Storage e limpa a fila', async () => {
    queuePendingFileUpload('u1/c1/nota.pdf');
    getFileFromIndexedDBMock.mockResolvedValue(fakeFile());
    uploadMock.mockResolvedValue({ error: null });

    const result = await processPendingFileUploads();

    expect(result).toEqual({ success: true, errors: 0 });
    expect(uploadMock).toHaveBeenCalledWith('u1/c1/nota.pdf', expect.any(File), { upsert: true });
    expect(deleteFileFromIndexedDBMock).toHaveBeenCalledWith('u1/c1/nota.pdf');
    expect(getPendingFileUploadCount()).toBe(0);
  });

  it('mantém na fila o que falhar, sem travar os outros', async () => {
    queuePendingFileUpload('u1/c1/falha.pdf');
    queuePendingFileUpload('u1/c1/ok.pdf');
    getFileFromIndexedDBMock.mockResolvedValue(fakeFile());
    uploadMock
      .mockResolvedValueOnce({ error: new Error('rede caiu') })
      .mockResolvedValueOnce({ error: null });

    const result = await processPendingFileUploads();

    expect(result).toEqual({ success: false, errors: 1 });
    expect(getPendingFileUploadCount()).toBe(1);
    expect(deleteFileFromIndexedDBMock).toHaveBeenCalledWith('u1/c1/ok.pdf');
    expect(deleteFileFromIndexedDBMock).not.toHaveBeenCalledWith('u1/c1/falha.pdf');
  });

  it('sem arquivo local pra subir, só sai da fila sem chamar o Storage', async () => {
    queuePendingFileUpload('u1/c1/sumiu.pdf');
    getFileFromIndexedDBMock.mockResolvedValue(null);

    const result = await processPendingFileUploads();

    expect(result).toEqual({ success: true, errors: 0 });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(getPendingFileUploadCount()).toBe(0);
  });

  it('fila vazia não toca no Storage', async () => {
    const result = await processPendingFileUploads();
    expect(result).toEqual({ success: true, errors: 0 });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
