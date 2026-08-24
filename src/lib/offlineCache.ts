// src/lib/offlineCache.ts
//
// Usa localStorage, não sessionStorage: no Android o processo do app é morto
// pelo sistema com frequência (troca de app, pouca memória, tela apagada por
// muito tempo), o que zerava o sessionStorage a cada vez — um cache "de 24h"
// documentado no projeto só durava, na prática, a sessão em memória atual.
// localStorage persiste no disco do WebView e sobrevive ao processo ser
// morto e reaberto, então o TTL passa a valer de verdade.

export const CacheKeys = {
  CLIENTS: 'rm_cache_clients',
  MONTHLY_ORDERS: 'rm_cache_monthly_orders',
  ORDERS: 'rm_cache_orders',
  USER_SETTINGS: 'rm_cache_user_settings',
  APPOINTMENTS: 'rm_cache_appointments',
  ALL_TIME_CATEGORIES: 'rm_cache_all_time_categories',
  /** Marca quando a sincronização completa (clientes, pedidos, agenda, feriados
   *  e arquivos) rodou pela última vez — TTL de 24h faz a chave "expirar"
   *  sozinha, sinalizando que já passou um dia e é hora de rodar de novo. */
  LAST_FULL_SYNC: 'rm_cache_last_full_sync',
};

/** Feriados são por ano — chave dinâmica, fora do objeto CacheKeys (que só
 *  tem chaves fixas). */
export const holidaysCacheKey = (year: number) => `rm_cache_holidays_${year}`;

export const offlineCache = {
  set: (key: string, data: any, ttlMs: number = 24 * 60 * 60 * 1000) => {
    try {
      localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now(),
        expiry: Date.now() + ttlMs
      }));
    } catch (e) {
      console.error('Erro ao gravar no cache offline:', e);
    }
  },
  
  get: <T>(key: string): T | null => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      const parsed = JSON.parse(item);
      
      if (parsed.expiry && Date.now() > parsed.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      
      // Backward compatibility check for old cache without expiry field
      if (!parsed.expiry && parsed.timestamp && Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(key);
        return null;
      }
      
      return parsed.data as T;
    } catch (e) {
      console.error('Erro ao ler do cache offline:', e);
      return null;
    }
  },
  
  clear: () => {
    Object.values(CacheKeys).forEach(key => {
      localStorage.removeItem(key);
    });
  },

  isOnline: (): boolean => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
};
