import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode, useEffect } from 'react';
import { saveFileToIndexedDB, getFileFromIndexedDB, deleteFileFromIndexedDB } from '../lib/storage';

interface UploadDraft {
  file: File | null;
  category: string;
  value: string;
  isOpen: boolean;
  clientId?: string;
}

interface UploadContextType {
  drafts: Record<string, UploadDraft>;
  setDraft: (clientId: string, draft: Partial<UploadDraft>) => void;
  clearDraft: (clientId: string) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, UploadDraft>>(() => {
    const saved = localStorage.getItem('upload_drafts_metadata');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(key => {
          parsed[key].file = null;
        });
        return parsed;
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  useEffect(() => {
    const loadFiles = async () => {
      console.debug('[UploadContext] Início do carregamento de arquivos do IndexedDB...');
      const keys = Object.keys(drafts);
      for (const key of keys) {
        try {
          const file = await getFileFromIndexedDB(key);
          if (file) {
            console.debug(`[UploadContext] Arquivo restaurado para: ${key} (${file.name})`);
            setDrafts(prev => ({
              ...prev,
              [key]: { ...prev[key], file }
            }));
          }
        } catch (e) {
          console.error('[UploadContext] Erro ao carregar arquivo:', e);
        }
      }
    };
    loadFiles();
  }, []);

  useEffect(() => {
    const metadata = { ...drafts };
    Object.keys(metadata).forEach(key => {
      const { file, ...rest } = metadata[key];
      (metadata as any)[key] = rest;
    });
    localStorage.setItem('upload_drafts_metadata', JSON.stringify(metadata));
  }, [drafts]);

  const setDraft = useCallback(async (clientId: string, partialDraft: Partial<UploadDraft>) => {
    console.debug(`[UploadContext] Atualizando rascunho para: ${clientId}`, partialDraft);
    if (partialDraft.file !== undefined) {
      if (partialDraft.file) {
        await saveFileToIndexedDB(clientId, partialDraft.file);
      } else {
        await deleteFileFromIndexedDB(clientId);
      }
    }

    setDrafts(prev => ({
      ...prev,
      [clientId]: {
        ...(prev[clientId] || { file: null, category: '', value: '', isOpen: false }),
        ...partialDraft
      }
    }));
  }, []);

  const clearDraft = useCallback(async (clientId: string) => {
    console.debug(`[UploadContext] Limpando rascunho: ${clientId}`);
    await deleteFileFromIndexedDB(clientId);
    setDrafts(prev => {
      const newDrafts = { ...prev };
      delete newDrafts[clientId];
      return newDrafts;
    });
  }, []);

  const contextValue = useMemo(() => ({ drafts, setDraft, clearDraft }), [drafts, setDraft, clearDraft]);

  return (
    <UploadContext.Provider value={contextValue}>
      {children}
    </UploadContext.Provider>
  );
}

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
