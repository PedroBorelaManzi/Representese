import posthog from 'posthog-js';

/* Sem VITE_POSTHOG_KEY configurado, tudo aqui vira no-op silencioso —
   nada quebra localmente ou antes de a env var existir no Vercel. */
export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    autocapture: false,
  });
}

export { posthog };
