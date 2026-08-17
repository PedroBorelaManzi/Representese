import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncQueue } from '../lib/syncQueue';
import { toast } from 'sonner';

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  /** Operações que esgotaram as tentativas de sync — precisam de atenção do usuário. */
  deadLetterCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [deadLetterCount, setDeadLetterCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const queryClient = useQueryClient();
  // Evita dois flushes simultâneos (ex.: reconexão + clique manual no botão).
  const flushingRef = useRef(false);
  // Rede móvel instável pode disparar 'online' várias vezes seguidas (handoff
  // entre wifi/dados). Sem isso, cada disparo chamava processQueue() na hora,
  // consumindo uma tentativa por operação a cada vez — esgotando
  // MAX_SYNC_ATTEMPTS por instabilidade momentânea, não por erro real.
  const onlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStatus = () => {
    setIsOnline(navigator.onLine);
    setPendingCount(syncQueue.getPendingCount());
    setDeadLetterCount(syncQueue.getDeadLetter().length);
  };

  // Envia a fila offline sem depender de clique do usuário. Antes deste flush
  // automático, alterações feitas offline ficavam presas no localStorage até
  // alguém apertar "Sincronizar" — na prática, risco real de nunca subirem.
  const flushQueue = useCallback(async (opts?: { silent?: boolean }) => {
    if (flushingRef.current) return;
    if (!navigator.onLine || syncQueue.getPendingCount() === 0) return;

    flushingRef.current = true;
    setIsSyncing(true);
    try {
      const { success, errors } = await syncQueue.processQueue();
      if (success) {
        // Marca tudo como stale; queries ativas refazem sozinhas com a verdade do servidor.
        await queryClient.invalidateQueries();
        if (!opts?.silent) toast.success('Alterações offline enviadas para a nuvem!');
      } else if (!opts?.silent) {
        toast.warning(`Algumas alterações offline ainda não subiram (${errors.length}). Vamos tentar de novo.`);
      }
    } catch (e) {
      console.error('Erro no flush automático da fila:', e);
    } finally {
      flushingRef.current = false;
      setIsSyncing(false);
      updateStatus();
    }
  }, [queryClient]);

  useEffect(() => {
    updateStatus();

    // App pode abrir já com fila pendente de uma sessão anterior — envia sem alarde.
    flushQueue({ silent: true });

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida!');
      updateStatus();

      // Espera a rede "assentar" antes de sincronizar — colapsa rajadas de
      // eventos 'online' num único flush em vez de um por disparo.
      if (onlineDebounceRef.current) clearTimeout(onlineDebounceRef.current);
      onlineDebounceRef.current = setTimeout(() => {
        onlineDebounceRef.current = null;
        flushQueue();
      }, 2000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Você está offline. Alterações serão salvas localmente.');
      updateStatus();
    };

    const handleQueueUpdate = () => {
      setPendingCount(syncQueue.getPendingCount());
      setDeadLetterCount(syncQueue.getDeadLetter().length);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-queue-updated', handleQueueUpdate);

    return () => {
      if (onlineDebounceRef.current) clearTimeout(onlineDebounceRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-queue-updated', handleQueueUpdate);
    };
  }, [flushQueue]);

  const syncNow = useCallback(async () => {
    if (!isOnline) {
      toast.error('Você precisa estar conectado à internet para sincronizar.');
      return;
    }

    setIsSyncing(true);
    toast.loading('Sincronizando dados com a nuvem...', { id: 'sync-toast' });

    try {
      // 1. Push PENDING offline mutations FIRST
      if (syncQueue.getPendingCount() > 0) {
        const { success, errors } = await syncQueue.processQueue();
        if (!success) {
          toast.error(`Falha ao enviar dados locais: ${errors.length} erros.`, { id: 'sync-toast' });
          return;
        }
      }

      // 2. Pull / Refetch active queries (as inativas refazem ao serem montadas)
      await queryClient.refetchQueries({ type: 'active' });

      toast.success('Sincronização concluída com sucesso!', { id: 'sync-toast' });
    } catch (e) {
      toast.error('Erro inesperado durante a sincronização.', { id: 'sync-toast' });
    } finally {
      setIsSyncing(false);
      updateStatus();
      window.dispatchEvent(new Event('sync-completed'));
    }
  }, [isOnline, queryClient]);

  const contextValue = useMemo(
    () => ({ isOnline, pendingCount, deadLetterCount, isSyncing, syncNow }),
    [isOnline, pendingCount, deadLetterCount, isSyncing, syncNow]
  );

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
