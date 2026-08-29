import './polyfills';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { indexedDBPersister } from './lib/queryPersister';
import { logError } from './lib/supabase';
import { Sentry } from './lib/sentry';

// Sentry.init() e PostHog.init() fazem trabalho de instrumentação (wrap de
// fetch/history/console, etc.) que não precisa acontecer antes da primeira
// pintura. Adiado pro primeiro idle — tira ~100-150ms de main thread do boot
// (ajuda TBT/INP). Erros muito precoces ainda caem nos listeners globais
// abaixo (que gravam em audit_logs).
const initTelemetry = () => {
  import('./lib/sentry').then((m) => m.initSentry());
  import('./lib/posthog').then((m) => m.initPostHog());
};
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(initTelemetry, { timeout: 3000 });
  } else {
    setTimeout(initTelemetry, 1500);
  }
}

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

  // Registra o service worker só no site publicado (não no dev server, nem
  // dentro do app Android/iOS — lá quem cuida de offline é o Capacitor).
  // Sem um service worker, o manifest.json não bastava pro navegador oferecer
  // "Instalar app" — o site tinha a cara de PWA mas não era instalável de
  // verdade. Import dinâmico do Capacitor evita pesar o boot de quem só quer
  // o site.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    });
  }
}

const ErrorFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center bg-slate-50">
    <p className="text-lg font-black text-slate-900">Ops, algo deu errado.</p>
    <p className="text-sm text-slate-500 max-w-sm">
      Já registramos o problema. Tente recarregar a página — se persistir, fale com o suporte.
    </p>
    <button
      onClick={() => window.location.reload()}
      className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest"
    >
      Recarregar
    </button>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
