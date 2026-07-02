import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncQueue } from '../lib/syncQueue';
import { toast } from 'sonner';

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const queryClient = useQueryClient();

  const updateStatus = () => {
    setIsOnline(navigator.onLine);
    setPendingCount(syncQueue.getPendingCount());
  };

  useEffect(() => {
    updateStatus();

    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Conexão restabelecida!");
      updateStatus();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Você está offline. Alterações serão salvas localmente.");
      updateStatus();
    };

    const handleQueueUpdate = () => {
      setPendingCount(syncQueue.getPendingCount());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-queue-updated', handleQueueUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-queue-updated', handleQueueUpdate);
    };
  }, []);

  const syncNow = useCallback(async () => {
    if (!isOnline) {
      toast.error("Você precisa estar conectado à internet para sincronizar.");
      return;
    }

    setIsSyncing(true);
    toast.loading("Sincronizando dados com a nuvem...", { id: 'sync-toast' });

    try {
      // 1. Push PENDING offline mutations FIRST
      if (pendingCount > 0) {
         const { success, errors } = await syncQueue.processQueue();
         if (!success) {
            toast.error(`Falha ao enviar dados locais: ${errors.length} erros.`, { id: 'sync-toast' });
            return;
         }
      }

      // 2. Pull / Refetch ALL active queries (Delta Sync)
      await queryClient.refetchQueries();

      toast.success("Sincronização concluída com sucesso!", { id: 'sync-toast' });
      
    } catch (e) {
      toast.error("Erro inesperado durante a sincronização.", { id: 'sync-toast' });
    } finally {
      setIsSyncing(false);
      updateStatus();
      window.dispatchEvent(new Event('sync-completed'));
    }
  }, [isOnline, pendingCount, queryClient]);

  const contextValue = useMemo(() => ({ isOnline, pendingCount, isSyncing, syncNow }), [isOnline, pendingCount, isSyncing, syncNow]);

  return (
    <SyncContext.Provider value={contextValue}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
