import { offlineCache, CacheKeys } from './offlineCache';
import { supabase } from './supabase';

export type SyncAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';

export interface SyncOperation {
  id: string; // uuid for the operation
  table: string;
  action: SyncAction;
  payload: any;
  recordId?: string; // id of the record being updated/deleted
  timestamp: number;
  attempts?: number; // quantas vezes o processQueue já tentou (e falhou)
}

const SYNC_QUEUE_KEY = 'rm_sync_queue';
// Após MAX_SYNC_ATTEMPTS falhas a operação vai para a dead-letter em vez de
// travar a fila para sempre (ex.: registro que viola constraint no servidor).
const DEAD_LETTER_KEY = 'rm_sync_dead_letter';
export const MAX_SYNC_ATTEMPTS = 5;

export const syncQueue = {
  getQueue: (): SyncOperation[] => {
    try {
      const data = localStorage.getItem(SYNC_QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Erro ao ler fila de sincronização:', e);
      return [];
    }
  },

  setQueue: (queue: SyncOperation[]) => {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Erro ao gravar fila de sincronização:', e);
    }
  },

  enqueue: (table: string, action: SyncAction, payload: any, recordId?: string) => {
    const queue = syncQueue.getQueue();
    queue.push({
      id: crypto.randomUUID(),
      table,
      action,
      payload,
      recordId,
      timestamp: Date.now()
    });
    syncQueue.setQueue(queue);
    
    // Dispatch a custom event so the UI can update the pending count
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-queue-updated'));
    }
  },

  clearQueue: () => {
    localStorage.removeItem(SYNC_QUEUE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-queue-updated'));
    }
  },

  getPendingCount: (): number => {
    return syncQueue.getQueue().length;
  },

  // Operações que esgotaram as tentativas — ficam guardadas para inspeção
  // (e para o usuário poder reexportar/redigitar), fora do caminho da fila.
  getDeadLetter: (): SyncOperation[] => {
    try {
      const data = localStorage.getItem(DEAD_LETTER_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  clearDeadLetter: () => {
    localStorage.removeItem(DEAD_LETTER_KEY);
  },

  // Processa a fila inteira contra o Supabase
  processQueue: async (): Promise<{ success: boolean; errors: any[] }> => {
    const queue = syncQueue.getQueue();
    if (queue.length === 0) return { success: true, errors: [] };

    const errors: any[] = [];
    let processedIds: string[] = [];
    const failedAttempts = new Map<string, number>();
    const deadLettered: SyncOperation[] = [];

    for (const op of queue) {
      try {
        if (op.action === 'INSERT') {
          const { error } = await supabase.from(op.table).insert([op.payload]);
          if (error) throw error;
        } else if (op.action === 'UPDATE' && op.recordId) {
          const { error } = await supabase.from(op.table).update(op.payload).eq('id', op.recordId);
          if (error) throw error;
        } else if (op.action === 'DELETE' && op.recordId) {
          const { error } = await supabase.from(op.table).delete().eq('id', op.recordId);
          if (error) throw error;
        } else if (op.action === 'UPSERT') {
          const { error } = await supabase.from(op.table).upsert(op.payload, { onConflict: 'id' });
          if (error) throw error;
        }
        processedIds.push(op.id);
      } catch (e) {
        console.error(`Erro ao processar op ${op.id}:`, e);
        errors.push(e);
        const attempts = (op.attempts || 0) + 1;
        if (attempts >= MAX_SYNC_ATTEMPTS) {
          deadLettered.push({ ...op, attempts });
        } else {
          failedAttempts.set(op.id, attempts);
        }
      }
    }

    if (deadLettered.length > 0) {
      try {
        const existing = syncQueue.getDeadLetter();
        localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify([...existing, ...deadLettered]));
      } catch (e) {
        console.error('Erro ao gravar dead-letter:', e);
      }
    }

    const deadIds = deadLettered.map(op => op.id);
    const newQueue = queue
      .filter(op => !processedIds.includes(op.id) && !deadIds.includes(op.id))
      .map(op => (failedAttempts.has(op.id) ? { ...op, attempts: failedAttempts.get(op.id) } : op));
    syncQueue.setQueue(newQueue);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sync-queue-updated'));
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
