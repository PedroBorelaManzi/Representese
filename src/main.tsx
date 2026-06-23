import './polyfills';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { indexedDBPersister } from './lib/queryPersister';
import { logError } from './lib/supabase';



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity, // Disabled auto fetching (Manual Sync only)
      gcTime: 1000 * 60 * 60 * 24 * 7,
    },
  },
});

persistQueryClient({
  queryClient,
  persister: indexedDBPersister,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // Cache everything successfully fetched to enable full offline support in IndexedDB
      return query.state.status === 'success';
    }
  }
});
// Register Global Error Listeners for Telemetry
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // Avoid double logging if event has no error details
    const err = event.error || event.message || 'Erro de script desconhecido';
    logError(err, 'global_error_listener');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason || 'Rejeição de Promise sem motivo especificado';
    logError(reason, 'global_unhandled_rejection');
  });

  // Falha ao precarregar um chunk após novo deploy (assets antigos sumiram):
  // recarrega uma vez para pegar o index.html novo. Guard evita loop infinito.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (!sessionStorage.getItem('rm_chunk_reload')) {
      sessionStorage.setItem('rm_chunk_reload', '1');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
