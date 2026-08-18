import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatform = vi.fn();
const convertFileSrc = vi.fn((uri: string) => `converted:${uri}`);
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: (a?: any) => isNativePlatform(a),
    convertFileSrc: (a?: any) => convertFileSrc(a),
  },
}));

const stat = vi.fn();
const getUri = vi.fn();
const downloadFile = vi.fn();
const deleteFile = vi.fn();
const addListener = vi.fn().mockResolvedValue({ remove: vi.fn() });
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    stat: (a?: any) => stat(a),
    getUri: (a?: any) => getUri(a),
    downloadFile: (a?: any) => downloadFile(a),
    deleteFile: (a?: any) => deleteFile(a),
    addListener: (a?: any, b?: any) => addListener(a, b),
  },
  Directory: { Data: 'DATA' },
}));

import {
  getCachedFileUri,
  getCachedUriSePresente,
  baixarParaCacheEmSegundoPlano,
  evictCachedFile,
} from './fileCache';

beforeEach(() => {
  vi.clearAllMocks();
  addListener.mockResolvedValue({ remove: vi.fn() });
});

describe('getCachedUriSePresente', () => {
  it('no navegador (não nativo) sempre devolve null, sem consultar o Filesystem', async () => {
    isNativePlatform.mockReturnValue(false);
    const uri = await getCachedUriSePresente('user/client/arquivo.pdf');
    expect(uri).toBeNull();
    expect(stat).not.toHaveBeenCalled();
  });

  it('no app, arquivo já em cache devolve a URI convertida', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockResolvedValue({});
    getUri.mockResolvedValue({ uri: 'file:///cache/arquivo.pdf' });

    const uri = await getCachedUriSePresente('user/client/arquivo.pdf');

    expect(uri).toBe('converted:file:///cache/arquivo.pdf');
  });

  it('no app, arquivo ainda não baixado devolve null', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockRejectedValue(new Error('ENOENT'));

    const uri = await getCachedUriSePresente('user/client/arquivo.pdf');

    expect(uri).toBeNull();
  });
});

describe('getCachedFileUri', () => {
  it('no navegador, devolve a signedUrl direto sem tocar no Filesystem nativo', async () => {
    isNativePlatform.mockReturnValue(false);
    const uri = await getCachedFileUri('user/client/a.pdf', 'https://signed.example/a.pdf');
    expect(uri).toBe('https://signed.example/a.pdf');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('no app, já em cache: devolve na hora sem baixar de novo', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockResolvedValue({});
    getUri.mockResolvedValue({ uri: 'file:///cache/a.pdf' });

    const uri = await getCachedFileUri('user/client/a.pdf', 'https://signed.example/a.pdf');

    expect(uri).toBe('converted:file:///cache/a.pdf');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('no app, sem cache: baixa e devolve a URI local', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockRejectedValue(new Error('ENOENT'));
    downloadFile.mockResolvedValue({});
    getUri.mockResolvedValue({ uri: 'file:///cache/a.pdf' });

    const uri = await getCachedFileUri('user/client/a.pdf', 'https://signed.example/a.pdf');

    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://signed.example/a.pdf', directory: 'DATA' })
    );
    expect(uri).toBe('converted:file:///cache/a.pdf');
  });
});

describe('baixarParaCacheEmSegundoPlano', () => {
  it('no navegador é no-op', () => {
    isNativePlatform.mockReturnValue(false);
    baixarParaCacheEmSegundoPlano('user/client/a.pdf', 'https://signed.example/a.pdf');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('no app, já em cache não baixa de novo', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockResolvedValue({});

    baixarParaCacheEmSegundoPlano('user/client/a.pdf', 'https://signed.example/a.pdf');
    await new Promise((r) => setTimeout(r, 0));

    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('no app, sem cache dispara o download em segundo plano', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockRejectedValue(new Error('ENOENT'));
    downloadFile.mockResolvedValue({});

    baixarParaCacheEmSegundoPlano('user/client/a.pdf', 'https://signed.example/a.pdf');
    await new Promise((r) => setTimeout(r, 0));

    expect(downloadFile).toHaveBeenCalled();
  });

  it('avisa via onComplete quando termina de baixar', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockRejectedValue(new Error('ENOENT'));
    downloadFile.mockResolvedValue({});
    const onComplete = vi.fn();

    baixarParaCacheEmSegundoPlano('user/client/a.pdf', 'https://signed.example/a.pdf', onComplete);
    await new Promise((r) => setTimeout(r, 0));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('avisa via onComplete mesmo quando já estava em cache', async () => {
    isNativePlatform.mockReturnValue(true);
    stat.mockResolvedValue({});
    const onComplete = vi.fn();

    baixarParaCacheEmSegundoPlano('user/client/a.pdf', 'https://signed.example/a.pdf', onComplete);
    await new Promise((r) => setTimeout(r, 0));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(downloadFile).not.toHaveBeenCalled();
  });
});

describe('evictCachedFile', () => {
  it('no navegador é no-op', async () => {
    isNativePlatform.mockReturnValue(false);
    await evictCachedFile('user/client/a.pdf');
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('no app, remove o arquivo do cache local', async () => {
    isNativePlatform.mockReturnValue(true);
    deleteFile.mockResolvedValue({});
    await evictCachedFile('user/client/a.pdf');
    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ directory: 'DATA' })
    );
  });

  it('arquivo que não existia no cache não lança erro', async () => {
    isNativePlatform.mockReturnValue(true);
    deleteFile.mockRejectedValue(new Error('ENOENT'));
    await expect(evictCachedFile('user/client/a.pdf')).resolves.toBeUndefined();
  });
});
