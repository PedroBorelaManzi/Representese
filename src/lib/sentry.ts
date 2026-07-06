import * as Sentry from '@sentry/react';

/* Sem VITE_SENTRY_DSN configurado, tudo aqui vira no-op silencioso —
   nada quebra localmente ou antes de a env var existir no Vercel. */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
