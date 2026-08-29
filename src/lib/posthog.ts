/* Analytics de produto (PostHog) — carregado SOB DEMANDA.
 *
 * O posthog-js tem ~50 KB gzip e entrava no bundle de entrada porque
 * AuthContext e o rastreio de pageview importavam `{ posthog }` estático.
 * Agora o SDK só é baixado quando `initPostHog()` roda (no primeiro idle, ver
 * src/main.tsx). As chamadas feitas antes disso ficam numa fila curta e
 * disparam assim que o SDK carrega — nenhum evento se perde. */

type PostHogClient = (typeof import('posthog-js'))['default'];

let client: PostHogClient | null = null;
let fila: Array<(p: PostHogClient) => void> = [];
let habilitado = true;

/* Sem VITE_POSTHOG_KEY configurado, tudo aqui vira no-op silencioso. */
export async function initPostHog(): Promise<void> {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    habilitado = false;
    fila = [];
    return;
  }
  if (client) return;

  const mod = await import('posthog-js');
  client = mod.default;
  client.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    autocapture: false,
  });
  for (const fn of fila) fn(client);
  fila = [];
}

function despachar(fn: (p: PostHogClient) => void) {
  if (client) fn(client);
  else if (habilitado && fila.length < 50) fila.push(fn);
}

/** Mesma superfície de antes (`posthog.identify/reset/capture`), mas as
 *  chamadas passam pela fila até o SDK terminar de carregar. */
export const posthog = {
  identify: (id: string, props?: Record<string, unknown>) => despachar((p) => p.identify(id, props)),
  reset: () => despachar((p) => p.reset()),
  capture: (event: string, props?: Record<string, unknown>) => despachar((p) => p.capture(event, props)),
};
