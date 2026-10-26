import { QueryClient } from '@tanstack/react-query';

// Compartilhado com a sincronização completa, que preenche o cache das telas.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity, // Disabled auto fetching (Manual Sync only)
      gcTime: 1000 * 60 * 60 * 24 * 7,
    },
  },
});
