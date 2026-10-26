import { QueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';

/** Nos apps os dados ficam salvos 5 anos (modo offline); no navegador continuam 7 dias. */
export const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * (Capacitor.isNativePlatform() ? 5 * 365 : 7);

// Compartilhado com a sincronização completa, que preenche o cache das telas.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity, // Disabled auto fetching (Manual Sync only)
      gcTime: CACHE_MAX_AGE_MS, // precisa ser >= maxAge do persister (main.tsx), senão a consulta some do cache salvo
    },
  },
});
