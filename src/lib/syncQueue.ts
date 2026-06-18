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
}

const SYNC_QUEUE_KEY = 'rm_sync_queue';

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

  // Processa a fila inteira contra o Supabase
  processQueue: async (): Promise<{ success: boolean; errors: any[] }> => {
    const queue = syncQueue.getQueue();
    if (queue.length === 0) return { success: true, errors: [] };

    const errors: any[] = [];
    let processedIds: string[] = [];

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
      }
    }

    const newQueue = queue.filter(op => !processedIds.includes(op.id));
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
