import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncQueue } from '../lib/syncQueue';
import { runFullSync, type FullSyncProgress, type FullSyncResult } from '../lib/fullSync';
import { offlineCache, CacheKeys } from '../lib/offlineCache';
import { processPendingFileUploads, getPendingFileUploadCount } from '../lib/pendingFileUploads';
import { logError } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  /** Operações que esgotaram as tentativas de sync — precisam de atenção do usuário. */
  deadLetterCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  /** Progresso da sincronização completa (clientes, pedidos, agenda, feriados,
   *  arquivos) — null quando não está rodando. */
  fullSyncProgress: FullSyncProgress | null;
  /** Verdadeiro quando a sincronização completa está atrasada (mais de 1 dia) e a pessoa ainda não respondeu ao aviso. */
  syncPromptVisible: boolean;
  /** "Sim": roda a sincronização completa agora, com barra de progresso. */
  acceptSyncPrompt: () => void;
  /** "Agora não": fecha o aviso e segue com o que está salvo no aparelho. */
  dismissSyncPrompt: () => void;
}

// Sobe este número quando uma versão precisa de uma sincronização completa nova
// (ex.: 3 = gera os PDFs dos pedidos no aparelho): o aviso reaparece uma vez.
const SYNC_SCHEMA = '3';
const SYNC_SCHEMA_KEY = 'rm_sync_schema';

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [deadLetterCount, setDeadLetterCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [fullSyncProgress, setFullSyncProgress] = useState<FullSyncProgress | null>(null);
  const [syncPromptVisible, setSyncPromptVisible] = useState(false);
  // Quem disse "agora não" não é perguntado de novo até abrir o app outra vez.
  const promptDismissedRef = useRef(false);
  const queryClient = useQueryClient();
  // Evita rodar a sincronização completa de novo no mesmo boot, e detecta
  // troca de usuário (logout/login) pra rodar de novo nesse caso.
  const bootSyncedForUserRef = useRef<string | null>(null);
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
    if (!navigator.onLine) return;
    if (syncQueue.getPendingCount() === 0 && getPendingFileUploadCount() === 0) return;

    flushingRef.current = true;
    setIsSyncing(true);
    try {
      const { success, errors } = await syncQueue.processQueue();
      // Anexos de pedidos criados offline (fila própria, guardada no
      // IndexedDB — ver pendingFileUploads.ts) sobem separado da fila
      // genérica, porque um File não cabe num payload de localStorage.
      await processPendingFileUploads().catch((e) => console.warn('Erro ao subir arquivos pendentes:', e));
      if (success) {
        // Marca tudo como stale; queries ativas refazem sozinhas com a verdade do servidor.
        await queryClient.invalidateQueries();
        if (!opts?.silent) toast.success('Alterações offline enviadas para a nuvem!');
      } else if (!opts?.silent) {
        toast.warning(`Algumas alterações offline ainda não subiram (${errors.length}). Vamos tentar de novo.`);
      }
    } catch (e) {
      console.error('Erro no flush automático da fila:', e);
      logError(e, 'SyncContext.flushQueue');
    } finally {
      flushingRef.current = false;
      setIsSyncing(false);
      updateStatus();
    }
  }, [queryClient]);

  // Baixa tudo (clientes, pedidos, agenda, feriados, itens/parcelas e, no app,
  // o conteúdo de TODOS os arquivos) e deixa salvo no aparelho. Roda depois do
  // flushQueue de propósito: primeiro sobe o que foi feito offline, só depois
  // baixa o retrato completo — assim a cópia local reflete a MESMA alteração
  // que acabou de subir, não uma versão anterior a ela.
  //
  // Sem limite de tempo global: com muitos PDFs a baixa leva minutos, e o
  // limite antigo (90s) abortava no meio e nunca marcava o dia como feito —
  // daí a sincronização reiniciar a cada abertura do app. Cada arquivo e cada
  // tabela têm o seu próprio limite (fullSync.ts), então nada fica preso.
  //
  // O dia só conta como sincronizado se chegou a 100% ("complete"). Se foi
  // interrompida (app fechado, internet caiu), a marca não é gravada e a
  // próxima abertura retoma de onde parou — arquivos já baixados são pulados.
  const runFull = useCallback(async (): Promise<FullSyncResult> => {
    if (!user) return 'offline';
    let result: FullSyncResult = 'incomplete';
    try {
      result = await runFullSync(user.id, setFullSyncProgress);
      if (result === 'complete') {
        // A própria expiração do cache (24h) serve de contador: passado esse
        // prazo, a chave some sozinha e o boot sabe que é hora de rodar de novo.
        offlineCache.set(CacheKeys.LAST_FULL_SYNC, true, 24 * 60 * 60 * 1000);
        try { localStorage.setItem(SYNC_SCHEMA_KEY, SYNC_SCHEMA); } catch { /* sem armazenamento: só pergunta de novo */ }
      }
    } catch (e) {
      console.error('Erro na sincronização completa:', e);
      logError(e, 'SyncContext.runFull');
    } finally {
      setFullSyncProgress(null);
    }
    return result;
  }, [user]);


  // O app abre sempre com o que já está salvo no aparelho — a sincronização
  // completa NUNCA começa sozinha (ela deixava o app preso logo na abertura).
  // Se está atrasada, só aparece um aviso discreto perguntando se a pessoa quer.
  const offerSyncIfDue = useCallback(() => {
    if (promptDismissedRef.current) return;
    if (!navigator.onLine) return;
    if (!offlineCache.get(CacheKeys.LAST_FULL_SYNC) || localStorage.getItem(SYNC_SCHEMA_KEY) !== SYNC_SCHEMA) setSyncPromptVisible(true);
  }, []);

  const acceptSyncPrompt = useCallback(() => {
    setSyncPromptVisible(false);
    void (async () => {
      const result = await runFull();
      // Telas abertas têm staleTime infinito: sem isto continuariam mostrando a cópia antiga.
      if (result === 'complete' || result === 'incomplete') await queryClient.invalidateQueries();
      if (result === 'complete') toast.success('Sincronização concluída!', { duration: 2000 });
      else if (result === 'incomplete') toast.warning('Sincronização incompleta. Toque em Sincronizar para continuar de onde parou.', { duration: 5000 });
      else if (result === 'offline') toast.error('Sem internet para sincronizar.');
    })();
  }, [runFull, queryClient]);

  const dismissSyncPrompt = useCallback(() => {
    promptDismissedRef.current = true;
    setSyncPromptVisible(false);
  }, []);

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
        // flushQueue (subir o que foi feito offline) sempre roda ao
        // reconectar — é leve e não pode esperar o dia virar. A baixa
        // completa (runFull) é que segue a regra de 1x por dia; antes
        // disso ignorava o cache e baixava tudo de novo a cada handoff
        // de wifi/dados, daí a sensação de "sincroniza toda hora".
        flushQueue().then(() => offerSyncIfDue());
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
  }, [flushQueue, offerSyncIfDue]);

  // No boot: não baixa nada. Só oferece a sincronização se já passou 1 dia
  // desde a última completa. Troca de usuário (logout/login) oferece de novo.
  useEffect(() => {
    if (!user) { setSyncPromptVisible(false); return; }
    if (bootSyncedForUserRef.current === user.id) return;
    bootSyncedForUserRef.current = user.id;
    promptDismissedRef.current = false;
    offerSyncIfDue();
  }, [user, offerSyncIfDue]);

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
      await processPendingFileUploads().catch((e) => console.warn('Erro ao subir arquivos pendentes:', e));

      // 2. Pull / Refetch active queries (as inativas refazem ao serem montadas)
      await queryClient.refetchQueries({ type: 'active' });

      // 3. Sincronização completa sob demanda — clicar em "Sincronizar" força
      // a atualização geral (inclusive arquivos, no app) mesmo que a
      // automática do dia já tenha rodado.
      const result = await runFull();

      if (result === 'complete') toast.success('Sincronização concluída com sucesso!', { id: 'sync-toast' });
      else if (result === 'busy') toast.info('Já existe uma sincronização em andamento. Aguarde terminar.', { id: 'sync-toast' });
      else toast.warning('Sincronização incompleta: alguns itens não baixaram. Toque em Sincronizar de novo.', { id: 'sync-toast' });
    } catch (e) {
      toast.error('Erro inesperado durante a sincronização.', { id: 'sync-toast' });
    } finally {
      setIsSyncing(false);
      updateStatus();
      window.dispatchEvent(new Event('sync-completed'));
    }
  }, [isOnline, queryClient, runFull]);

  const contextValue = useMemo(
    () => ({ isOnline, pendingCount, deadLetterCount, isSyncing, syncNow, fullSyncProgress, syncPromptVisible, acceptSyncPrompt, dismissSyncPrompt }),
    [isOnline, pendingCount, deadLetterCount, isSyncing, syncNow, fullSyncProgress, syncPromptVisible, acceptSyncPrompt, dismissSyncPrompt]
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
